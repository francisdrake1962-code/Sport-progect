if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { getDb, saveDb, transaction, cleanupBlocklist } = require('./db');
const { authMiddleware, JWT_SECRET, setAdminCookie, getAdminTokenFromRequest, isAdminTokenValid } = require('./auth');
const { requireAdmin, requireRole } = require('./middleware/rbac');
const { apiVersionMiddleware } = require('./middleware/api-version');
const { createCrudRoutes, queryToObjects, setAnalyticsTracker, setVersionTracker } = require('./routes/crud');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const { FREE_LIMIT } = userRoutes;
const { resetMailConfig, sendConfirmationEmail } = require('./services/mailer');
const { resetStreamConfig, isMuxConfigured, isMuxUploadConfigured, createMuxDirectUpload, getMuxAssetDetails, getMuxUploadStatus } = require('./services/stream');
const { parsePagination } = require('./helpers/pagination');
const { requestIdMiddleware } = require('./middleware/requestId');
const { requestLogger, createLogger } = require('./helpers/logger');
const { formatError, AppError, PayloadTooLargeError } = require('./helpers/errors');
const feedbackService = require('./services/feedback.service');
const dashboardService = require('./services/dashboard.service');
const auditService = require('./services/audit.service');
const AnalyticsService = require('./services/analytics.service');
const analyticsService = new AnalyticsService(getDb);
const RecommendationService = require('./services/recommendation.service');
const recommendationService = new RecommendationService(getDb);
const ContentVersionService = require('./services/content-version.service');
const contentVersionService = new ContentVersionService(getDb);
setAnalyticsTracker((event) => analyticsService.trackEvent(event).catch(() => {}));
setVersionTracker((lessonId, opts) => contentVersionService.createVersion(lessonId, opts));
const { settingsRepo, complexRepo } = require('./repositories');
const jwt = require('jsonwebtoken');

const multer = require('multer');
const rateLimit = require('express-rate-limit');

const app = express();
const paymentRoutes = require('./routes/payment');
const i18nRoutes = require('./routes/i18n');
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(s => s.trim())
  : [];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  maxAge: 86400,
};

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:", "data:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors(corsOptions));

app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '1mb' }));
app.use(requestIdMiddleware);
app.use(apiVersionMiddleware);
app.use(requestLogger);

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/auth') || req.path.startsWith('/api/user'),
});
app.use('/api', globalLimiter);

// Server-side guard for the admin SPA: admin HTML pages (except login.html)
// are only served to requests carrying a valid admin/super_admin JWT (via the
// httpOnly cookie set at login or the Authorization header). Static assets are
// always public so login.html can render.
function adminPageGuard(req, res, next) {
  const urlPath = req.path.replace(/^\/+/, '');
  const isHtml = urlPath.endsWith('.html');
  const isLoginPage = urlPath === 'login.html';

  if ((isHtml || urlPath === '') && !isLoginPage) {
    const token = getAdminTokenFromRequest(req);
    if (!isAdminTokenValid(token)) {
      return res.redirect('/admin/login.html');
    }
  }
  next();
}

app.use('/admin', adminPageGuard);

app.use(express.static(path.join(__dirname, '..', 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (/\.[a-f0-9]{8,}\.[a-z0-9]+$/i.test(path.basename(filePath))) {
      // Content-hashed assets (e.g. js/main.abc1234….js) are immutable: a new
      // deploy changes the filename, so a 1-year cache is safe.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // Stable filenames (admin js/css, styles/main.css, images) have no content
      // hash: cache for a short time and revalidate so deploys are picked up.
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    }
  }
}));

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = (req.query.type || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = path.join(uploadsDir, sub || 'general');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeName = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, safeName);
  }
});

const imageFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, allowed.includes(ext));
};

const uploadImage = multer({ storage: imageStorage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });

const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', async (req, res) => {
  try {
    const db = await getDb();
    db.exec(`SELECT 1`);
    res.json({ status: 'ok', db: 'ok', timestamp: Date.now() });
  } catch {
    res.status(503).json({ status: 'error', db: 'error', timestamp: Date.now() });
  }
});

let isReady = false;
app.get('/api/ready', (req, res) => {
  if (!isReady) {
    return res.status(503).json({ status: 'not ready', timestamp: Date.now() });
  }
  res.json({ status: 'ready', timestamp: Date.now() });
});

app.get('/api/health/detailed', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    db.exec(`SELECT 1`);
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    const lessonCount = db.exec(`SELECT COUNT(*) FROM lessons`);
    const subscriberCount = db.exec(`SELECT COUNT(*) FROM subscribers`);
    const ticketCount = db.exec(`SELECT COUNT(*) FROM tickets WHERE status != 'resolved'`);
    const dbPath = path.join(__dirname, '..', 'data', 'qigong.db');
    let dbSize = 0;
    try { dbSize = fs.statSync(dbPath).size; } catch {}
    res.json({
      status: 'ok', db: 'ok', timestamp: Date.now(),
      uptime_seconds: Math.floor(uptime),
      memory: { rss_mb: Math.round(mem.rss / 1024 / 1024), heap_mb: Math.round(mem.heapUsed / 1024 / 1024) },
      counts: {
        lessons: lessonCount[0]?.values[0][0] || 0,
        subscribers: subscriberCount[0]?.values[0][0] || 0,
        open_tickets: ticketCount[0]?.values[0][0] || 0,
      },
      db_size_bytes: dbSize,
      node_version: process.version,
    });
  } catch {
    res.status(503).json({ status: 'error', db: 'error', timestamp: Date.now() });
  }
});

app.get('/api/lessons', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const db = await getDb();
    const offset = (page - 1) * limit;
    const countResult = db.exec(`SELECT COUNT(*) FROM lessons WHERE status = 'active'`);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    const result = db.exec(
      `SELECT id, title, theme, duration, status, description, video_url, video_id, image_url, is_free, free_order, sort_order, catalog_no, date, tags, direction, goals, effect_description, effect_is_draft, video_provider, intensity, audience FROM lessons WHERE status = 'active' ORDER BY COALESCE(sort_order, 999999) ASC, date DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json({
      data: queryToObjects(result),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/lessons/:id/complex', async (req, res) => {
  try {
    const db = await getDb();
    const lessonId = Number(req.params.id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }
    const result = db.exec(
      `SELECT c.id, c.name, c.description, cl.position
       FROM complex_lessons cl JOIN complexes c ON cl.complex_id = c.id
       WHERE cl.lesson_id = ? ORDER BY cl.position LIMIT 1`, [lessonId]
    );
    const items = queryToObjects(result);
    res.json(items.length > 0 ? items[0] : null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/lessons/featured', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 10;
    const result = db.exec(
      `SELECT id, title, theme, duration, image_url, goals, effect_description, direction, intensity
       FROM lessons WHERE status = 'active' AND image_url IS NOT NULL
       ORDER BY COALESCE(sort_order, 999999) ASC, date DESC LIMIT ?`, [limit]
    );
    res.json(queryToObjects(result));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/lessons/:id', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`SELECT * FROM lessons WHERE id = ?`, [Number(req.params.id)]);
    const items = queryToObjects(result);
    if (items.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(items[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/complexes', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const db = await getDb();
    const offset = (page - 1) * limit;
    const countResult = db.exec(`SELECT COUNT(*) FROM complexes`);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    const result = db.exec(
      `SELECT c.id, c.name, c.description, c.image_url, c.status, COUNT(cl.lesson_id) as lesson_count
       FROM complexes c LEFT JOIN complex_lessons cl ON cl.complex_id = c.id
       GROUP BY c.id ORDER BY c.id LIMIT ? OFFSET ?`, [limit, offset]
    );
    res.json({
      data: queryToObjects(result),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/complexes/:id', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`SELECT * FROM complexes WHERE id = ?`, [Number(req.params.id)]);
    const items = queryToObjects(result);
    if (items.length === 0) return res.status(404).json({ error: 'Not found' });
    const lessonsResult = db.exec(
      `SELECT l.id, l.title, l.duration, l.image_url, l.effect_description, cl.position
       FROM complex_lessons cl JOIN lessons l ON cl.lesson_id = l.id
       WHERE cl.complex_id = ? ORDER BY cl.position`, [Number(req.params.id)]
    );
    items[0].lessons = queryToObjects(lessonsResult);
    res.json(items[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/lesson-zones/:lessonId', async (req, res) => {
  try {
    const db = await getDb();
    const lessonId = Number(req.params.lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }
    const result = db.exec(`SELECT zone FROM lesson_zones WHERE lesson_id = ?`, [lessonId]);
    const zones = result.length ? result[0].values.map(r => r[0]) : [];
    res.json(zones);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/schedule', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const db = await getDb();
    const offset = (page - 1) * limit;
    const countResult = db.exec(`SELECT COUNT(*) FROM schedule`);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    const result = db.exec(`SELECT * FROM schedule ORDER BY id LIMIT ? OFFSET ?`, [limit, offset]);
    res.json({
      data: queryToObjects(result),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/reviews', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const db = await getDb();
    const offset = (page - 1) * limit;
    const countResult = db.exec(`SELECT COUNT(*) FROM reviews`);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    const result = db.exec(`SELECT * FROM reviews ORDER BY id DESC LIMIT ? OFFSET ?`, [limit, offset]);
    res.json({
      data: queryToObjects(result),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/faq', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const db = await getDb();
    const offset = (page - 1) * limit;
    const countResult = db.exec(`SELECT COUNT(*) FROM faq`);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    const result = db.exec(`SELECT id, question, answer, sort_order FROM faq ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`, [limit, offset]);
    res.json({
      data: queryToObjects(result),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/content/:slug', async (req, res, next) => {
  if (/^\d+$/.test(req.params.slug)) return next();
  try {
    const db = await getDb();
    const result = db.exec(`SELECT slug, title, meta_title, meta_description, content, updated_at FROM site_content WHERE slug = ?`, [req.params.slug]);
    const items = queryToObjects(result);
    if (items.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(items[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/i18n', i18nRoutes);

const authService = require('./services/auth.service');

const unifiedLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 100,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in 1 minute.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/login', unifiedLoginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await authService.loginUnified(email, password);
    if (result.role === 'admin' || result.role === 'super_admin') {
      setAdminCookie(res, result.token);
    }
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

const api = express.Router();
api.use(authMiddleware);
api.use(requireAdmin);

  api.use('/lessons', createCrudRoutes('lessons', ['title', 'theme', 'duration', 'status', 'description', 'video_url', 'video_id', 'image_url', 'is_free', 'free_order', 'sort_order', 'catalog_no', 'date', 'tags', 'direction', 'direction_source', 'goals', 'effect_description', 'effect_is_draft', 'video_provider', 'intensity', 'audience']));
api.use('/complexes', createCrudRoutes('complexes', ['name', 'description', 'image_url', 'status']));

// complex_lessons — custom routes (composite PK)
api.get('/complex-lessons', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const result = await complexRepo.listComplexLessons(page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

api.post('/complex-lessons', async (req, res, next) => {
  try {
    const { complex_id, lesson_id, position } = req.body;
    if (!complex_id || !lesson_id) return res.status(400).json({ error: 'complex_id and lesson_id required' });
    await complexRepo.upsertComplexLesson(complex_id, lesson_id, position);
    auditService.logAction('create', 'complex_lessons', null, req.user?.id, req.user?.role, { complex_id, lesson_id }, req.ip);
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

api.put('/complex-lessons/:key', async (req, res, next) => {
  try {
    const [complexId, lessonId] = req.params.key.split('_').map(Number);
    if (!complexId || !lessonId) return res.status(400).json({ error: 'Invalid key' });
    const { position } = req.body;
    await complexRepo.updateComplexLessonPosition(complexId, lessonId, position);
    auditService.logAction('update', 'complex_lessons', null, req.user?.id, req.user?.role, { complex_id: complexId, lesson_id: lessonId, position }, req.ip);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

api.delete('/complex-lessons/:key', async (req, res, next) => {
  try {
    const [complexId, lessonId] = req.params.key.split('_').map(Number);
    if (!complexId || !lessonId) return res.status(400).json({ error: 'Invalid key' });
    await complexRepo.deleteComplexLesson(complexId, lessonId);
    auditService.logAction('delete', 'complex_lessons', null, req.user?.id, req.user?.role, { complex_id: complexId, lesson_id: lessonId }, req.ip);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
api.use('/subscribers', createCrudRoutes('subscribers', ['name', 'email', 'plan', 'status', 'email_confirmed', 'free_sessions_used', 'subscription_started_at', 'next_billing_date', 'preferred_language']));
api.use('/reviews', createCrudRoutes('reviews', ['author', 'text', 'rating', 'status', 'date']));
api.use('/faq', createCrudRoutes('faq', ['question', 'answer', 'sort_order']));
api.use('/content', createCrudRoutes('site_content', ['slug', 'title', 'meta_title', 'meta_description', 'content']));
api.use('/promo-codes', createCrudRoutes('promo_codes', ['code', 'discount', 'max_uses', 'current_uses', 'active']));
api.use('/transactions', createCrudRoutes('transactions', ['subscriber_id', 'type', 'amount', 'status', 'date']));
api.use('/notifications', createCrudRoutes('notifications', ['title', 'type', 'text', 'recipients', 'sent_at']));
api.use('/users', createCrudRoutes('users', ['email', 'name', 'role']));
api.use('/watched-lessons', createCrudRoutes('watched_lessons', ['subscriber_id', 'lesson_id', 'position_seconds', 'completed']));

/* ── lesson_media admin routes ── */
api.get('/lesson-media', async (req, res, next) => {
  try {
    const db = await getDb();
    const { page, limit } = parsePagination(req.query);
    const lessonId = req.query.lesson_id;
    let countSql = 'SELECT COUNT(*) FROM lesson_media';
    let dataSql = 'SELECT lm.*, l.title as lesson_title FROM lesson_media lm LEFT JOIN lessons l ON lm.lesson_id = l.id';
    const params = [];
    const where = [];
    if (lessonId) { where.push('lm.lesson_id = ?'); params.push(Number(lessonId)); }
    if (where.length) { countSql += ' WHERE ' + where.join(' AND '); dataSql += ' WHERE ' + where.join(' AND '); }
    const countResult = db.exec(countSql, params);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    dataSql += ' ORDER BY lm.lesson_id ASC, lm.language ASC LIMIT ? OFFSET ?';
    const dataResult = db.exec(dataSql, [...params, limit, (page - 1) * limit]);
    res.json({ data: queryToObjects(dataResult), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

api.post('/lesson-media', async (req, res, next) => {
  try {
    const { lesson_id, language, video_id, video_url, video_provider, status } = req.body;
    if (!lesson_id || !language) return res.status(400).json({ error: 'lesson_id and language required' });
    const db = await getDb();
    db.run(`INSERT OR REPLACE INTO lesson_media (lesson_id, language, video_id, video_url, video_provider, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [lesson_id, language, video_id || null, video_url || null, video_provider || 'mux', status || 'pending']);
    saveDb();
    auditService.logAction('create', 'lesson_media', null, req.user?.id, req.user?.role, { lesson_id, language }, req.ip);
    res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

api.put('/lesson-media/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { video_id, video_url, video_provider, status } = req.body;
    const db = await getDb();
    const check = db.exec(`SELECT id FROM lesson_media WHERE id = ?`, [id]);
    if (!check.length || !check[0].values.length) return res.status(404).json({ error: 'Not found' });
    if (video_id !== undefined) db.run(`UPDATE lesson_media SET video_id = ? WHERE id = ?`, [video_id, id]);
    if (video_url !== undefined) db.run(`UPDATE lesson_media SET video_url = ? WHERE id = ?`, [video_url, id]);
    if (video_provider !== undefined) db.run(`UPDATE lesson_media SET video_provider = ? WHERE id = ?`, [video_provider, id]);
    if (status !== undefined) db.run(`UPDATE lesson_media SET status = ? WHERE id = ?`, [status, id]);
    saveDb();
    auditService.logAction('update', 'lesson_media', id, req.user?.id, req.user?.role, req.body, req.ip);
    res.json({ success: true });
  } catch (err) { next(err); }
});

api.delete('/lesson-media/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    db.run(`DELETE FROM lesson_media WHERE id = ?`, [id]);
    saveDb();
    auditService.logAction('delete', 'lesson_media', id, req.user?.id, req.user?.role, {}, req.ip);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Admin: import lessons from catalog file (.txt / .xlsx / .docx) ── */
api.post('/admin/lessons/import', importUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл обязателен' });
    const action = (req.body && req.body.action) || 'preview';
    const ext = path.extname(req.file.originalname).toLowerCase();
    const { parseText, parseXlsx, parseDocx } = require('./services/lesson-import');

    let rows;
    if (ext === '.txt' || ext === '.csv') {
      rows = parseText(req.file.buffer.toString('utf8'));
    } else if (ext === '.xlsx' || ext === '.xls') {
      rows = parseXlsx(req.file.buffer);
    } else if (ext === '.docx') {
      rows = await parseDocx(req.file.buffer);
    } else {
      return res.status(400).json({ error: 'Неподдерживаемый формат. Используйте .txt, .xlsx или .docx' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Не удалось распознать строки. Проверьте структуру файла (№ | Название | Цель | Эффект)' });
    }

    const db = await getDb();
    const nums = rows.map((r) => r.catalogNo);
    const placeholders = nums.map(() => '?').join(', ');
    const existingResult = db.exec(`SELECT id, catalog_no FROM lessons WHERE catalog_no IN (${placeholders})`, nums);
    const existing = {};
    queryToObjects(existingResult).forEach((r) => { existing[r.catalog_no] = r.id; });

    const preview = rows.map((r) => ({
      catalogNo: r.catalogNo,
      title: r.title,
      theme: r.theme,
      goals: r.goals,
      effect: r.effect,
      action: existing[r.catalogNo] ? 'update' : 'new',
      lessonId: existing[r.catalogNo] || null,
    }));

    if (action === 'apply') {
      let created = 0;
      let updated = 0;
      for (const r of rows) {
        const id = existing[r.catalogNo];
        if (id) {
          db.run(`UPDATE lessons SET title = ?, theme = ?, goals = ?, effect_description = ?, sort_order = ? WHERE id = ?`,
            [r.title, r.theme, r.goals, r.effect, r.catalogNo, id]);
          updated++;
        } else {
          db.run(`INSERT INTO lessons (catalog_no, title, theme, goals, effect_description, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
            [r.catalogNo, r.title, r.theme, r.goals, r.effect, r.catalogNo]);
          created++;
        }
      }
      saveDb();
      auditService.logAction('import', 'lessons', null, req.user?.id, req.user?.role,
        { created, updated, source: req.file.originalname }, req.ip);
      return res.json({ success: true, created, updated, total: rows.length });
    }

    res.json({ success: true, preview, total: preview.length, filename: req.file.originalname });
  } catch (err) { next(err); }
});

/* ── Public: get lesson media for a specific lesson ── */
app.get('/api/lessons/:id/media', async (req, res) => {
  try {
    const lessonId = Number(req.params.id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) return res.status(400).json({ error: 'Invalid lesson ID' });
    const db = await getDb();
    const result = db.exec(`SELECT id, lesson_id, language, video_id, video_url, status FROM lesson_media WHERE lesson_id = ?`, [lessonId]);
    const rows = queryToObjects(result);
    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load lesson media' });
  }
});

api.put('/lessons/:id/zones', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }
    const { zones } = req.body;
    if (!Array.isArray(zones)) {
      return res.status(400).json({ error: 'zones must be an array' });
    }
    const db = await getDb();
    const check = db.exec(`SELECT id FROM lessons WHERE id = ?`, [id]);
    if (!check.length || !check[0].values.length) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    const VALID_ZONES = ['шея', 'поясница', 'грудной_отдел', 'колени', 'ноги_таз', 'спина_осанка', 'плечи_руки', 'баланс_общее'];
    await transaction(async (tdb) => {
      tdb.run(`DELETE FROM lesson_zones WHERE lesson_id = ?`, [id]);
      zones.forEach(zone => {
        if (VALID_ZONES.includes(zone)) {
          tdb.run(`INSERT INTO lesson_zones (lesson_id, zone) VALUES (?, ?)`, [id, zone]);
        }
      });
    });
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update zones' });
  }
});

api.post('/schedule', async (req, res) => {
  try {
    const { date, theme, complex_id, lesson_id } = req.body;
    if (!date || typeof date !== 'string' || date.trim().length === 0) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      return res.status(400).json({ error: 'Invalid date format, expected YYYY-MM-DD' });
    }
    const db = await getDb();
    try {
      db.run(`INSERT INTO schedule (date, theme, complex_id, lesson_id) VALUES (?, ?, ?, ?)`,
        [date.trim(), theme || null, complex_id || null, lesson_id || null]);
    } catch (insertErr) {
      if (String(insertErr.message).includes('UNIQUE constraint')) {
        return res.status(409).json({ error: 'Запись на эту дату уже существует' });
      }
      throw insertErr;
    }
    const idResult = db.exec(`SELECT last_insert_rowid() as id`);
    const id = (idResult.length > 0 && idResult[0].values.length > 0) ? idResult[0].values[0][0] : null;
    if (id) {
      const result = db.exec(`SELECT * FROM schedule WHERE id = ?`, [id]);
      saveDb();
      return res.status(201).json(queryToObjects(result)[0]);
    }
    saveDb();
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

api.put('/schedule/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const { date, theme, complex_id, lesson_id } = req.body;
    if (!date || typeof date !== 'string' || date.trim().length === 0) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      return res.status(400).json({ error: 'Invalid date format, expected YYYY-MM-DD' });
    }
    const db = await getDb();
    db.run(`UPDATE schedule SET date=?, theme=?, complex_id=?, lesson_id=? WHERE id=?`,
      [date, theme, complex_id, lesson_id, id]);
    saveDb();
    const result = db.exec(`SELECT * FROM schedule WHERE id = ?`, [id]);
    const items = queryToObjects(result);
    if (items.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(items[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

api.delete('/schedule/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const db = await getDb();
    db.run(`DELETE FROM schedule WHERE id = ?`, [id]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const ALLOWED_SETTINGS_KEYS = new Set([
  'app_name', 'domain', 'logo_url', 'theme_color', 'contact_email',
  'support_email', 'phone', 'address', 'social_vk', 'social_telegram',
  'trial_days', 'annual_price', 'monthly_price',
  'trainer_photo_mode', 'trainer_photo_url', 'trainer_photos', 'trainer_photo_interval',
  'promo_discount', 'promo_code', 'promo_expiry_hours',
  'mail_provider', 'gmail_user', 'gmail_app_password', 'email_from',
  'mux_signing_key_id', 'mux_signing_key', 'mux_access_token_id', 'mux_access_token_secret',
  'stripe_monthly_price_id', 'stripe_annual_price_id',
]);

api.get('/settings', async (req, res, next) => {
  try {
    const settings = await settingsRepo.getAll();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

api.put('/settings', async (req, res, next) => {
  try {
    const entries = Object.entries(req.body).filter(([key]) => ALLOWED_SETTINGS_KEYS.has(key));
    if (entries.length === 0) {
      return res.status(400).json({ error: 'No valid settings provided' });
    }
    for (const [key, value] of entries) {
      await settingsRepo.set(key, value);
    }
    auditService.logAction('update', 'settings', null, req.user?.id, req.user?.role, { keys: entries.map(e => e[0]) }, req.ip);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

api.post('/settings', async (req, res, next) => {
  try {
    if (req.body.key && req.body.value !== undefined) {
      if (!ALLOWED_SETTINGS_KEYS.has(req.body.key)) {
        return res.status(400).json({ error: 'Invalid settings key' });
      }
      await settingsRepo.set(req.body.key, req.body.value);
    } else {
      const entries = Object.entries(req.body).filter(([key]) => ALLOWED_SETTINGS_KEYS.has(key));
      for (const [key, value] of entries) {
        await settingsRepo.set(key, value);
      }
    }
    auditService.logAction('update', 'settings', null, req.user?.id, req.user?.role, { keys: Object.keys(req.body) }, req.ip);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

api.post('/settings/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    resetMailConfig();
    await sendConfirmationEmail(email, 'test-token-' + Date.now());
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

api.post('/settings/test-mux', async (req, res) => {
  try {
    resetStreamConfig();
    const signing = await isMuxConfigured();
    const upload = await isMuxUploadConfigured();
    res.json({ configured: signing && upload, signing, upload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

api.get('/dashboard', async (req, res, next) => {
  try {
    const stats = await dashboardService.getStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

api.post('/upload-trainer-photo', (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!filename || !data) {
      return res.status(400).json({ error: 'filename and data (base64) required' });
    }
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(filename).toLowerCase();
    if (!allowedExts.includes(ext)) {
      return res.status(400).json({ error: 'Only .jpg, .png, .webp allowed' });
    }
    const safeName = 'trainer_' + Date.now() + ext;
    const uploadDir = path.join(__dirname, '..', 'dist', 'images', 'trainers');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(uploadDir, safeName), buffer);
    res.json({ success: true, url: '/images/trainers/' + safeName });
  } catch {
    res.status(500).json({ error: 'Upload failed' });
  }
});

api.post('/upload', uploadImage.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded or invalid format' });
    const sub = req.query.type || 'general';
    const url = '/uploads/' + sub + '/' + req.file.filename;
    res.json({ success: true, url });
  } catch {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// === TICKETS (FEEDBACK) ===

const feedbackRouter = express.Router();
feedbackRouter.use(authMiddleware);

// Subscriber: create ticket
feedbackRouter.post('/', requireRole('subscriber'), async (req, res, next) => {
  try {
    const { category, subject, message } = req.body;
    const result = await feedbackService.createTicket(req.user.id, category, subject, message);
    res.json({ success: true, ticketId: result.ticketId });
  } catch (err) {
    next(err);
  }
});

// Subscriber: list my tickets
feedbackRouter.get('/', requireRole('subscriber'), async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const result = await feedbackService.getSubscriberTickets(req.user.id, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Subscriber: get ticket with messages
feedbackRouter.get('/:id', requireRole('subscriber'), async (req, res, next) => {
  try {
    const result = await feedbackService.getTicketById(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Subscriber: reply to ticket
feedbackRouter.post('/:id/reply', requireRole('subscriber'), async (req, res, next) => {
  try {
    const { message } = req.body;
    await feedbackService.replyToTicket(Number(req.params.id), 'subscriber', req.user.id, message);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.use('/api/feedback', feedbackRouter);

// Admin: audit logs
api.get('/admin/audit-logs', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const { entity, user_id, action } = req.query;
    const result = await auditService.getAuditLogs({ entity, userId: user_id, action, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

api.get('/admin/analytics/dashboard', async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const dashboard = await analyticsService.getDashboard({ days });
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

api.get('/admin/analytics/stats', async (req, res, next) => {
  try {
    const { start_date, end_date, event_name, entity, group_by } = req.query;
    const stats = await analyticsService.getEventStats({
      startDate: start_date, endDate: end_date, eventName: event_name, entity, groupBy: group_by,
    });
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

api.get('/admin/analytics/timeline', async (req, res, next) => {
  try {
    const { start_date, end_date, event_name, days } = req.query;
    const timeline = await analyticsService.getEventTimeline({
      startDate: start_date, endDate: end_date, eventName: event_name,
      days: Math.min(parseInt(days) || 30, 365),
    });
    res.json(timeline);
  } catch (err) {
    next(err);
  }
});

api.get('/admin/analytics/user/:userId', async (req, res, next) => {
  try {
    const activity = await analyticsService.getUserActivity({
      userId: parseInt(req.params.userId), limit: parseInt(req.query.limit) || 50,
    });
    res.json(activity);
  } catch (err) {
    next(err);
  }
});

api.get('/admin/recommendations/:subscriberId', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    const recommendations = await recommendationService.getRecommendations(parseInt(req.params.subscriberId), { limit });
    res.json({ subscriber_id: parseInt(req.params.subscriberId), recommendations });
  } catch (err) {
    next(err);
  }
});

api.post('/admin/lessons/:id/version', async (req, res, next) => {
  try {
    const lessonId = parseInt(req.params.id);
    const { change_summary } = req.body;
    const result = await contentVersionService.createVersion(lessonId, { changedBy: req.user?.id, changeSummary: change_summary });
    if (!result) return res.status(404).json({ error: 'Lesson not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

api.get('/admin/lessons/:id/versions', async (req, res, next) => {
  try {
    const versions = await contentVersionService.getVersions(parseInt(req.params.id));
    res.json(versions);
  } catch (err) {
    next(err);
  }
});

api.get('/admin/lessons/:id/versions/:version', async (req, res, next) => {
  try {
    const version = await contentVersionService.getVersion(parseInt(req.params.id), parseInt(req.params.version));
    if (!version) return res.status(404).json({ error: 'Version not found' });
    res.json(version);
  } catch (err) {
    next(err);
  }
});

api.post('/admin/lessons/:id/restore/:version', async (req, res, next) => {
  try {
    const result = await contentVersionService.restoreVersion(parseInt(req.params.id), parseInt(req.params.version), { changedBy: req.user?.id });
    if (!result) return res.status(404).json({ error: 'Version not found' });
    res.json({ success: true, restored_to: result });
  } catch (err) {
    next(err);
  }
});

api.get('/admin/lessons/:id/compare', async (req, res, next) => {
  try {
    const { a, b } = req.query;
    if (!a || !b) return res.status(400).json({ error: 'Query params a and b required' });
    const diff = await contentVersionService.compareVersions(parseInt(req.params.id), parseInt(a), parseInt(b));
    if (!diff) return res.status(404).json({ error: 'Versions not found' });
    res.json(diff);
  } catch (err) {
    next(err);
  }
});

/* ── Admin: lesson video upload (Mux direct) / status / unlink ── */
api.post('/admin/lessons/:id/video/mux-upload', async (req, res, next) => {
  try {
    const lessonId = Number(req.params.id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) return res.status(400).json({ error: 'Invalid lesson ID' });
    const language = (req.body && req.body.language) || 'ru';
    const filename = (req.body && req.body.filename) || 'lesson-video.mp4';

    const db = await getDb();
    const lesson = db.exec(`SELECT id, video_provider FROM lessons WHERE id = ?`, [lessonId]);
    if (!lesson.length || !lesson[0].values.length) return res.status(404).json({ error: 'Lesson not found' });
    if (!await isMuxUploadConfigured()) return res.status(400).json({ error: 'Mux upload not configured (MUX_ACCESS_TOKEN_ID / MUX_ACCESS_TOKEN_SECRET required)' });

    const upload = await createMuxDirectUpload();
    db.run(`INSERT INTO video_uploads (lesson_id, language, original_filename, status, provider, mux_upload_id) VALUES (?, ?, ?, 'uploading', 'mux', ?)`,
      [lessonId, language, filename, upload.uploadId]);
    const idResult = db.exec(`SELECT last_insert_rowid() as id`);
    const uploadId = idResult[0].values[0][0];
    saveDb();
    auditService.logAction('create', 'video_uploads', uploadId, req.user?.id, req.user?.role, { lesson_id: lessonId, language, provider: 'mux' }, req.ip);

    res.status(201).json({ id: uploadId, url: upload.uploadUrl });
  } catch (err) {
    next(err);
  }
});

api.get('/admin/video-uploads/:id/status', async (req, res, next) => {
  try {
    const uploadId = Number(req.params.id);
    if (!Number.isInteger(uploadId) || uploadId <= 0) return res.status(400).json({ error: 'Invalid upload ID' });
    const db = await getDb();
    const result = db.exec(`SELECT id, status, provider, video_id, mux_upload_id, mux_asset_id, mux_playback_id, error_message FROM video_uploads WHERE id = ?`, [uploadId]);
    if (!result.length || !result[0].values.length) return res.status(404).json({ error: 'Upload not found' });
    const row = result[0].values[0];
    const payload = {
      id: row[0],
      status: row[1],
      provider: row[2] || 'mux',
      video_id: row[3] || null,
      mux_upload_id: row[4] || null,
      mux_asset_id: row[5] || null,
      mux_playback_id: row[6] || null,
      error_message: row[7] || null,
    };

    if (payload.provider === 'mux' && payload.mux_upload_id && payload.status === 'uploading') {
      try {
        const uploadStatus = await getMuxUploadStatus(payload.mux_upload_id);
        if (uploadStatus.status === 'asset_created' && uploadStatus.assetId) {
          const asset = await getMuxAssetDetails(uploadStatus.assetId);
          db.run(`UPDATE video_uploads SET status = 'ready', mux_asset_id = ?, mux_playback_id = ?, updated_at = datetime('now') WHERE id = ?`,
            [uploadStatus.assetId, asset.playbackId, uploadId]);
          saveDb();
          payload.status = 'ready';
          payload.mux_asset_id = uploadStatus.assetId;
          payload.mux_playback_id = asset.playbackId;
        } else if (uploadStatus.status === 'errored') {
          const message = String(uploadStatus.errorMessage || 'Upload failed').slice(0, 500);
          db.run(`UPDATE video_uploads SET status = 'error', error_message = ?, updated_at = datetime('now') WHERE id = ?`, [message, uploadId]);
          saveDb();
          payload.status = 'error';
          payload.error_message = uploadStatus.errorMessage || 'Upload failed';
        }
      } catch (err) {
        console.error('Mux upload status check failed:', err.message);
      }
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

api.delete('/admin/lessons/:id/video', async (req, res, next) => {
  try {
    const lessonId = Number(req.params.id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) return res.status(400).json({ error: 'Invalid lesson ID' });
    const db = await getDb();
    const check = db.exec(`SELECT id, video_provider FROM lessons WHERE id = ?`, [lessonId]);
    if (!check.length || !check[0].values.length) return res.status(404).json({ error: 'Lesson not found' });
    const provider = check[0].values[0][1] || 'mux';
    db.run(`UPDATE lessons SET video_id = NULL, video_url = NULL, video_provider = ? WHERE id = ?`, [provider, lessonId]);
    db.run(`UPDATE lesson_media SET video_id = NULL, video_url = NULL, status = 'pending' WHERE lesson_id = ?`, [lessonId]);
    saveDb();
    auditService.logAction('delete', 'lesson_video', lessonId, req.user?.id, req.user?.role, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

api.post('/admin/backup', async (req, res, next) => {
  try {
    const dbPath = path.join(__dirname, '..', 'data', 'qigong.db');
    if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'Database not found' });
    const backupDir = path.join(__dirname, '..', 'data', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(backupDir, `qigong-${timestamp}.db`);
    fs.copyFileSync(dbPath, backupPath);
    const stats = fs.statSync(backupPath);
    auditService.logAction('backup', 'system', null, req.user?.id, req.user?.role, { path: backupPath, size: stats.size }, req.ip);
    res.json({ success: true, path: backupPath, size_bytes: stats.size });
  } catch (err) {
    next(err);
  }
});

api.post('/admin/restore', async (req, res, next) => {
  try {
    const { backup_path } = req.body;
    if (!backup_path) return res.status(400).json({ error: 'backup_path required' });
    const resolvedPath = path.resolve(backup_path);
    const backupDir = path.join(__dirname, '..', 'data', 'backups');
    if (!resolvedPath.startsWith(path.resolve(backupDir))) {
      return res.status(403).json({ error: 'Restore only from backup directory' });
    }
    if (!fs.existsSync(resolvedPath)) return res.status(404).json({ error: 'Backup not found' });
    const dbPath = path.join(__dirname, '..', 'data', 'qigong.db');
    fs.copyFileSync(resolvedPath, dbPath);
    auditService.logAction('restore', 'system', null, req.user?.id, req.user?.role, { from: resolvedPath }, req.ip);
    res.json({ success: true, message: 'Database restored. Restart server to apply.' });
  } catch (err) {
    next(err);
  }
});

// Admin: list all tickets (with filters)
api.get('/admin/feedback', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const { category, status } = req.query;
    const result = await feedbackService.adminListTickets(page, limit, { category, status });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Admin: get ticket with messages
api.get('/admin/feedback/:id', async (req, res, next) => {
  try {
    const result = await feedbackService.adminGetTicketById(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Admin: update ticket status/assign
api.put('/admin/feedback/:id', async (req, res, next) => {
  try {
    const { status, assigned_to } = req.body;
    await feedbackService.adminUpdateTicket(req.params.id, { status, assigned_to });
    auditService.logAction('update', 'ticket', Number(req.params.id), req.user?.id, req.user?.role, { status, assigned_to }, req.ip);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Admin: reply to ticket
api.post('/admin/feedback/:id/reply', async (req, res, next) => {
  try {
    const { message } = req.body;
    await feedbackService.replyToTicket(Number(req.params.id), 'admin', req.user.id, message);
    auditService.logAction('reply', 'ticket', Number(req.params.id), req.user?.id, req.user?.role, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.use('/api', api);

const videosDir = process.env.VIDEOS_DIR || path.join(__dirname, '..', 'videos');
app.get('/videos/{*splat}', async (req, res) => {
  let filename;
  try {
    filename = decodeURIComponent(req.params.splat);
  } catch {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(videosDir, filename);

  const resolvedDir = path.resolve(videosDir);
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedDir + path.sep) && resolvedFile !== resolvedDir) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;
  const bearerToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;
  const token = bearerToken || queryToken;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    if (decoded.scope !== 'stream') {
      return res.status(403).json({ error: 'Stream token required' });
    }
    const tokenLessonId = Number(decoded.lessonId);
    if (!Number.isInteger(tokenLessonId) || tokenLessonId <= 0) {
      return res.status(403).json({ error: 'Invalid stream token' });
    }

    const db = await getDb();
    const escapedFilename = filename.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const lessonResult = db.exec(`SELECT id, is_free FROM lessons WHERE id = ? AND video_url LIKE ? ESCAPE '\\'`, [tokenLessonId, '%' + escapedFilename + '%']);
    if (!lessonResult.length || !lessonResult[0].values.length) {
      return res.status(403).json({ error: 'Access denied: video not linked to this lesson' });
    }
    const isFree = lessonResult[0].values[0][1];
    if (!isFree) {
      const userResult = db.exec(`SELECT plan, status, free_sessions_used, subscription_expires_at FROM subscribers WHERE id = ?`, [decoded.subscriberId]);
      if (!userResult.length || !userResult[0].values.length) {
        return res.status(403).json({ error: 'Access denied: subscriber not found' });
      }
      const plan = userResult[0].values[0][0];
      const status = userResult[0].values[0][1];
      const freeUsed = userResult[0].values[0][2] || 0;
      const expiresAt = userResult[0].values[0][3];
      const now = new Date();
      const hasPaidAccess = (plan === 'annual' || plan === 'monthly') && (status === 'active' || (status === 'cancelled' && expiresAt && new Date(expiresAt) > now));
      if (!hasPaidAccess && plan === 'trial' && freeUsed >= FREE_LIMIT) {
        return res.status(403).json({ error: 'Free limit reached. Subscribe to continue.' });
      }
      if (!hasPaidAccess && plan !== 'trial') {
        return res.status(403).json({ error: 'Subscription expired. Renew to continue.' });
      }
    }
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  let fileSize;
  try {
    const stat = fs.statSync(filePath);
    fileSize = stat.size;
  } catch {
    return res.status(404).json({ error: 'Video not found' });
  }
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (isNaN(start) || isNaN(end) || start > end || start < 0 || end >= fileSize) {
      return res.status(416).json({ error: 'Range not satisfiable' });
    }
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

app.get('/admin/{*splat}', (req, res) => {
  // Express 5 + path-to-regexp 8 exposes wildcard params as arrays, so coerce
  // to a string before calling String.prototype methods on the path segment.
  const urlPath = String(req.params.splat || '');
  if (urlPath.endsWith('.html') || urlPath.endsWith('.js') || urlPath.endsWith('.css') || urlPath.endsWith('.svg') || urlPath.endsWith('.png') || urlPath.endsWith('.json')) {
    const filePath = path.join(__dirname, '..', 'dist', 'admin', urlPath);
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
  }
  res.sendFile(path.join(__dirname, '..', 'dist', 'admin', 'index.html'));
});

const CLEAN_URL_ROUTES = { plans: 'plans.html', lessons: 'lessons.html', login: 'login.html', 'reset-password': 'reset-password.html', calendar: 'calendar.html', faq: 'faq.html', contact: 'contact.html', 'is-it-really-free': 'is-it-really-free.html', 'how-to-cancel': 'how-to-cancel.html', 'about-trainer': 'about-trainer.html', '8-pieces-of-brocade': '8-pieces-of-brocade.html', yijinjing: 'yijinjing.html', 'small-circulation': 'small-circulation.html', terms: 'terms.html', refund: 'refund.html', privacy: 'privacy.html', player: 'player.html', picker: 'picker.html', profile: 'profile.html', dashboard: 'dashboard.html', onboarding: 'onboarding.html', 'payment-status': 'payment-status.html' };
Object.entries(CLEAN_URL_ROUTES).forEach(([route, file]) => {
  app.get('/' + route, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', file));
  });
});

app.use((req, res) => {
  if (req.method === 'GET' && req.accepts('html')) {
    const urlPath = req.path.replace(/^\/+/, '');
    const filePath = path.resolve(path.join(__dirname, '..', 'dist', urlPath));
    const distDir = path.resolve(path.join(__dirname, '..', 'dist'));
    if (filePath.startsWith(distDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }
  }
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.use((err, req, res, _next) => {
  const logger = createLogger('error');
  logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId: req.requestId });
  if (err.code === 'LIMIT_FILE_SIZE') {
    return formatError(res, new PayloadTooLargeError(), req.requestId);
  }
  if (err.type === 'entity.too.large') {
    return formatError(res, new PayloadTooLargeError(), req.requestId);
  }
  if (err instanceof AppError) {
    return formatError(res, err, req.requestId);
  }
  if (err.status && err.status < 500) {
    return formatError(res, new AppError('BAD_REQUEST', err.message || 'Bad request', err.status), req.requestId);
  }
  formatError(res, new AppError('INTERNAL_ERROR', 'Internal server error', 500), req.requestId);
});

async function start() {
  const PORT = process.env.PORT || 3001;
  const { validateConfig } = require('./helpers/config');
  try {
    validateConfig();
  } catch (err) {
    console.error(err.message);
    throw err;
  }

  await getDb();
  console.log('Database initialized');

  const { runMigrations } = require('./helpers/migrations');
  const migrationResult = await runMigrations();
  if (migrationResult.applied > 0) {
    console.log(`Applied ${migrationResult.applied} migration(s)`);
  }

  const db = await getDb();
  const users = queryToObjects(db.exec(`SELECT COUNT(*) as count FROM subscribers`));
  if (users[0]?.count === 0) {
    try {
      seedData(db);
    } catch (err) {
      console.error('Failed to seed database:', err.message);
    }
  }

  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}/admin/`);
    console.log(`API at http://localhost:${PORT}/api/`);
    isReady = true;
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    isReady = false;
    server.close(() => {
      saveDb();
      console.log('Server closed.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      saveDb();
      process.exit(1);
    }, 10000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

function seedData(db) {
  const bcrypt = require('bcryptjs');
  const subscriberHash = bcrypt.hashSync('password123', 10);
  const subscribers = [
    ['Мария К.', 'maria@example.com', subscriberHash, 'annual', 'active'],
    ['Елена В.', 'elena@example.com', subscriberHash, 'monthly', 'active'],
    ['Сергей П.', 'sergey@example.com', subscriberHash, 'annual', 'active'],
    ['Анна М.', 'anna@example.com', subscriberHash, 'trial', 'trial'],
    ['Ольга К.', 'olga@example.com', subscriberHash, 'annual', 'active'],
  ];
  subscribers.forEach(([name, email, pw, plan, status]) => {
    db.run(`INSERT OR IGNORE INTO subscribers (name, email, password, plan, status, email_confirmed) VALUES (?, ?, ?, ?, ?, 1)`,
      [name, email, pw, plan, status]);
  });

  const complexes = [
    ['8 кусков парчи', 'Традиционный комплекс цигун'],
    ['И Цзинь Цзин', 'Классическая гимнастика'],
    ['Малый небесный круг', 'Практика обращения энергии'],
    ['Ежедневная ротация', 'Ротация по зонам тела'],
  ];
  complexes.forEach(([name, desc]) => {
    db.run(`INSERT OR IGNORE INTO complexes (name, description) VALUES (?, ?)`, [name, desc]);
  });

  const lessons = [
    ['Утренняя разминка шеи', 27, 'active', '2026-07-21', '/videos/11 ИЮНЯ. 2025 СУСТАВНАЯ РАЗМИНКА-1784275001698.mp4', 1, 1, '["шея","осанка","энергия"]', 'суставная_разминка', 'заголовок', 'Разминка шейного отдела позвоночника, улучшение кровообращения'],
    ['Поясница и бёдра', 31, 'active', '2026-07-20', '/videos/СУСТАВНАЯ РАЗМИНКА С ЭЛЕМЕНТАМИ ДЫХАТЕЛЬНОЙ ГИМНАСТИКИ 08.01.2026-cut-merged-1784283601063.mp4', 1, 2, '["поясница","баланс","снятие стресса"]', 'суставная_разминка', 'заголовок', 'Проработка поясничного отдела и тазобедренных суставов'],
    ['Баланс и координация', 29, 'active', '2026-07-19', '/videos/13 ИЮЛЯ 2026. ЗАНЯТИЕ В ПОТОКЕ++-cut-merged-1784297859174.mp4', 1, 3, '["ноги","баланс","поток"]', 'занятие_в_потоке', 'заголовок', 'Развитие чувства равновесия и координации движений'],
    ['Дыхательная практика', 28, 'draft', '2026-07-18', '/videos/11 ИЮНЯ. 2025 СУСТАВНАЯ РАЗМИНКА + ЭЛЕМЕНТЫ ДЫХАТЕЛЬНОЙ ГИМНАСТИКИ-cut-merged-1784275001698.mp4', 1, 4, '["дыхание","снятие стресса"]', 'занятие_в_потоке', 'описание_неточно', 'Дыхательные упражнения для расслабления'],
    ['Разминка суставов рук', 25, 'active', '2026-07-17', '/videos/Зарядка 01.04.2022 ТРЕНИРОВКА «ПОТОК» IMG_8063-cut-merged-1784527616383.MP4', 1, 5, '["осанка","энергия"]', 'суставная_разминка', 'заголовок', 'Разминка плечевых и локтевых суставов'],
    ['Разминка коленей', 22, 'active', '2026-07-16', '/videos/23 ноября 2023-cut-merged-1784279743390+.MP4', 1, 6, '["ноги","баланс"]', 'суставная_разминка', 'заголовок', 'Бережная разминка коленных суставов'],
    ['Здоровая спина', 30, 'active', '2026-07-15', '/videos/14 июля 2026 Суставная разминка-cut-merged-1784303384816.MOV', 1, 7, '["поясница","осанка","снятие стресса"]', 'суставная_разминка', 'заголовок', 'Комплекс для укрепления мышц спины'],
    ['Утренняя энергия', 28, 'active', '2026-07-14', '/videos/11 ИЮНЯ. 2025 СУСТАВНАЯ РАЗМИНКА-1784275001698.mp4', 0, null, '["энергия","дыхание"]', 'суставная_разминка', 'нет_данных', null],
    ['Вечернее расслабление', 26, 'active', '2026-07-13', '/videos/СУСТАВНАЯ РАЗМИНКА С ЭЛЕМЕНТАМИ ДЫХАТЕЛЬНОЙ ГИМНАСТИКИ 08.01.2026-cut-merged-1784283601063.mp4', 0, null, '["снятие стресса","дыхание","поток"]', 'занятие_в_потоке', 'нет_данных', null],
    ['Крепкий корпус', 33, 'active', '2026-07-12', '/videos/13 ИЮЛЯ 2026. ЗАНЯТИЕ В ПОТОКЕ++-cut-merged-1784297859174.mp4', 0, null, '["поясница","осанка","энергия"]', 'суставная_разминка', 'нет_данных', null],
  ];
  lessons.forEach(([title, dur, status, date, video, isFree, freeOrder, tags, direction, dirSource, effectDesc]) => {
    db.run(`INSERT OR IGNORE INTO lessons (title, duration, status, date, video_url, is_free, free_order, tags, direction, direction_source, effect_description, video_provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local')`,
      [title, dur, status, date, video, isFree, freeOrder, tags || '[]', direction, dirSource, effectDesc]);
  });

  const complexLessons = [
    [1, 1, 1], [1, 5, 2], [1, 8, 3],
    [2, 3, 1], [2, 9, 2],
    [3, 4, 1], [3, 6, 2], [3, 10, 3],
    [4, 2, 1], [4, 7, 2],
  ];
  complexLessons.forEach(([complexId, lessonId, position]) => {
    db.run(`INSERT OR IGNORE INTO complex_lessons (complex_id, lesson_id, position) VALUES (?, ?, ?)`,
      [complexId, lessonId, position]);
  });

  const lessonZones = [
    [1, 'шея'], [1, 'плечи_руки'],
    [2, 'поясница'], [2, 'ноги_таз'],
    [3, 'баланс_общее'], [3, 'ноги_таз'],
    [4, 'спина_осанка'],
    [5, 'плечи_руки'],
    [6, 'колени'],
    [7, 'поясница'], [7, 'спина_осанка'],
    [8, 'баланс_общее'],
    [9, 'баланс_общее'],
    [10, 'поясница'], [10, 'спина_осанка'],
  ];
  lessonZones.forEach(([lessonId, zone]) => {
    db.run(`INSERT OR IGNORE INTO lesson_zones (lesson_id, zone) VALUES (?, ?)`, [lessonId, zone]);
  });

  const themes = [
    'Шея и плечи', 'Поясница', 'Баланс', 'Дыхание', 'Суставы',
    'Всё тело', 'Разминка рук', 'Колени', 'Позвоночник', 'Гибкость',
    'Утренняя энергия', 'Вечернее расслабление', 'Крепкий корпус', 'Стопы и голеностоп', 'Грудной отдел',
  ];
  const complexIds = [1, 2, 3, 4, 1, 4, 1, 3, 2, 4, 1, 2, 3, 4, 1];
  const startDate = new Date('2026-07-22');
  for (let i = 0; i < 365; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0) continue;
    const themeIdx = i % themes.length;
    const lessonId = (i % 5) + 1;
    db.run(`INSERT OR IGNORE INTO schedule (date, theme, complex_id, lesson_id) VALUES (?, ?, ?, ?)`,
      [dateStr, themes[themeIdx], complexIds[themeIdx], lessonId]);
  }

  const reviews = [
    ['Мария К.', 'Прошла боль в пояснице', 5, 'approved', '2026-07-15'],
    ['Елена В.', 'Нашла программу, которая помогает', 5, 'approved', '2026-07-10'],
    ['Сергей П.', 'Удобно, не нужно ничего придумывать', 4, 'pending', '2026-07-18'],
  ];
  reviews.forEach(([author, text, rating, status, date]) => {
    db.run(`INSERT OR IGNORE INTO reviews (author, text, rating, status, date) VALUES (?, ?, ?, ?, ?)`,
      [author, text, rating, status, date]);
  });

  const faq = [
    ['Это правда бесплатно?',
     'Да. Первые 7 занятий вы получаете без привязки карты. Не вводите номер, не привязываете платёж. Просто регистрируетесь и занимаетесь. Это не пробный период — это реальный доступ к занятиям, чтобы вы могли оценить программу и понять, подходит ли она вам.',
     1],
    ['Подходит ли приложение для полных и новичков?',
     'Да, приложение цигун разработано для всех комплекций, включая полных новичков. Для начала вам не потребуется никакого предварительного опыта, хорошей физической формы или гибкости. Приложение включает понятные пошаговые уроки, которые проведут вас от основ к более сложным упражнениям, позволяя тренироваться в собственном темпе. Многие пользователи начинают всего с 10–20 минут в день и постепенно, со временем, обретают уверенность, силу и спокойствие.',
     2],
    ['Нужна ли физическая подготовка?',
     'Нет. Все упражнения доступны для людей с любым уровнем подготовки. Занятия рассчитаны на тех, кто только начинает, и включают упрощённые версии для новичков. Вы не сможете себя перегрузить — каждое упражнение имеет облегчённый вариант.',
     3],
    ['Если у меня есть проблемы со здоровьем?',
     'Перед началом занятий проконсультируйтесь с врачом. Упражнения мягкие и щадящие, но при наличии хронических заболеваний важно получить одобрение специалиста. Цигун широко используется как дополнение к основному лечению и помогает улучшить общее самочувствие, но не заменяет медицинскую помощь.',
     4],
    ['Какие стили цигун вы преподаете?',
     'В приложении мы обучаем 8 кусков парчи, предлагая как традиционные углублённые упражнения, так и понятные и доступные инструкции. В будущем мы также добавим короткие формы других стилей для поддержки мягкой, плавной практики.\n\nНаши тренировки по цигун включают такие известные комплексы упражнений, как «Восемь кусков парчи», «И Цзинь Цзин» и «Малый небесный круг», которые помогают улучшить здоровье, подвижность и энергию.',
     5],
    ['Сколько времени занимает тренировка?',
     'Одно занятие длится примерно 27–31 минуту. Это достаточно для полноценной тренировки, но не занимает слишком много времени в распорядке дня. Вы можете заниматься утром для бодрости или вечером для расслабления — в любое удобное время.',
     6],
    ['Как часто нужно заниматься?',
     'Программа рассчитана на 6 занятий в неделю с одним выходным. Но вы можете заниматься в своём темпе — главное, регулярность важнее интенсивности. Даже 2–3 занятия в неделю уже дают заметный результат через несколько недель.',
     7],
    ['Можно ли заниматься сидя?',
     'Да, многие упражнения доступны в сидячем положении. Это удобно для тех, кто проводит много времени за компьютером или имеет ограничения в подвижности. Все движения адаптируются — вы сможете заниматься стоя, сидя или даже лёжа в кровати.',
     8],
    ['Можно ли заниматься оффлайн?',
     'Нет, все занятия доступны только в режиме онлайн-трансляции из плеера. Это позволяет нам регулярно добавлять новые упражнения и обновлять контент. Рекомендуем подключиться к Wi-Fi для комфортного просмотра.',
     9],
    ['На каких устройствах можно заниматься?',
     'Приложение доступно на смартфонах, планшетах и компьютерах через браузер. Также поддерживается трансляция на телевизор прямо из плеера — нажмите кнопку «Трансляция на ТВ» в плеере, чтобы перенести картинку на большой экран.',
     10],
    ['Как отменить подписку?',
     'Один клик в профиле — без звонков, без обращений в поддержку. Зайдите в профиль, найдите раздел подписки и нажмите «Отменить». Подробнее на странице <a href="/how-to-cancel">Как отменить подписку</a>.',
     11],
    ['Можно ли вернуть деньги?',
     'Да. Если вы остались недовольны, мы вернём деньги без лишних вопросов. Обратитесь к нам в течение 7 дней после оплаты. Подробнее на странице <a href="/refund">Политика возврата</a>.',
     12],
    ['Что такое 8 кусков парчи?',
     '8 кусков парчи (Ба Дуань Цзин) — древний комплекс из 8 упражнений цигун для укрепления здоровья. Каждое упражнение воздействует на определённую группу мышц и суставов, улучшая гибкость, кровообращение и общее самочувствие. Элементы этого комплекса включены в программу занятий. Подробнее на странице <a href="/8-pieces-of-brocade">8 кусков парчи</a>.',
     13],
    ['Как связаться с поддержкой?',
     'Если у вас есть вопросы, предложения или возникли проблемы — напишите нам на <a href="mailto:support@qigong-landing.com">support@qigong-landing.com</a> или через страницу <a href="/contact">Связаться с нами</a>. Мы отвечаем в течение рабочего дня.',
     14],
  ];
  faq.forEach(([q, a, order]) => {
    db.run(`INSERT OR IGNORE INTO faq (question, answer, sort_order) VALUES (?, ?, ?)`, [q, a, order]);
  });

  const promos = [
    ['START2026', '30%', 100, 45],
    ['SUMMER', '20%', 200, 120],
    ['TRIAL', '100%', 500, 300],
  ];
  promos.forEach(([code, discount, max, uses]) => {
    db.run(`INSERT OR IGNORE INTO promo_codes (code, discount, max_uses, current_uses) VALUES (?, ?, ?, ?)`,
      [code, discount, max, uses]);
  });

  const transactions = [
    [1, 'subscription', 89, 'success', '2026-07-21'],
    [2, 'subscription', 12, 'success', '2026-07-20'],
    [3, 'subscription', 89, 'success', '2026-07-19'],
    [2, 'refund', -12, 'refund', '2026-07-18'],
    [5, 'subscription', 89, 'success', '2026-07-17'],
  ];
  transactions.forEach(([sid, type, amount, status, date]) => {
    db.run(`INSERT OR IGNORE INTO transactions (subscriber_id, type, amount, status, date) VALUES (?, ?, ?, ?, ?)`,
      [sid, type, amount, status, date]);
  });

  const notifications = [
    ['Новое занятие добавлено', 'info', 'Добавлено утреннее занятие для шеи', 'all', '2026-07-21'],
    ['Обновление приложения', 'system', 'Версия 2.0 с новым интерфейсом', 'all', '2026-07-15'],
  ];
  notifications.forEach(([title, type, text, recipients, sent]) => {
    db.run(`INSERT OR IGNORE INTO notifications (title, type, text, recipients, sent_at) VALUES (?, ?, ?, ?, ?)`,
      [title, type, text, recipients, sent]);
  });

  saveDb();
  console.log('Database seeded with sample data');
}

const NOTIFIED_KEY_PREFIX = 'notified_';

const { sendTrialExpiringEmail, sendSubscriptionExpiringEmail, sendSubscriptionExpiredEmail } = require('./services/mailer');
const { getSetting } = require('./db');

async function checkSubscriptions() {
  try {
    const db = await getDb();
    const now = new Date();

    const trialDays = parseInt(await getSetting('trial_days', '3'), 10);

    const trialUsers = db.exec(`SELECT id, name, email, joined_at FROM subscribers WHERE plan = 'trial' AND status = 'active' AND email_confirmed = 1`);
    if (trialUsers.length > 0) {
      for (const row of trialUsers[0].values) {
        const [id, name, email, joinedAt] = row;
        const joined = new Date(joinedAt);
        const expiresAt = new Date(joined.getTime() + trialDays * 86400000);
        const daysLeft = Math.ceil((expiresAt - now) / 86400000);

        if (daysLeft <= 0) {
          const notifiedKey = NOTIFIED_KEY_PREFIX + 'expired_trial_' + id;
          const already = db.exec(`SELECT value FROM settings WHERE key = ?`, [notifiedKey]);
          if (!already.length || !already[0].values.length) {
            db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [notifiedKey, String(Date.now())]);
            await sendTrialExpiringEmail(email, name, 0);
            console.log(`[subscriptions] Trial expired email sent to ${email}`);
          }
        } else if (daysLeft <= 3) {
          const notifiedKey = NOTIFIED_KEY_PREFIX + 'expiring_trial_' + id + '_' + daysLeft;
          const already = db.exec(`SELECT value FROM settings WHERE key = ?`, [notifiedKey]);
          if (!already.length || !already[0].values.length) {
            db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [notifiedKey, String(Date.now())]);
            await sendTrialExpiringEmail(email, name, daysLeft);
            console.log(`[subscriptions] Trial expiring (${daysLeft}d) email sent to ${email}`);
          }
        }
      }
    }

    const paidUsers = db.exec(`SELECT id, name, email, plan, next_billing_date FROM subscribers WHERE (plan = 'annual' OR plan = 'monthly') AND status = 'active' AND email_confirmed = 1`);
    if (paidUsers.length > 0) {
      for (const row of paidUsers[0].values) {
        const [id, name, email, plan, nextBilling] = row;
        if (!nextBilling) continue;
        const billing = new Date(nextBilling);
        const daysLeft = Math.ceil((billing - now) / 86400000);

        if (daysLeft <= 0) {
          const notifiedKey = NOTIFIED_KEY_PREFIX + 'expired_sub_' + id;
          const already = db.exec(`SELECT value FROM settings WHERE key = ?`, [notifiedKey]);
          if (!already.length || !already[0].values.length) {
            db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [notifiedKey, String(Date.now())]);
            db.run(`UPDATE subscribers SET status = 'expired' WHERE id = ?`, [id]);
            await sendSubscriptionExpiredEmail(email, name, plan);
            console.log(`[subscriptions] Subscription expired email sent to ${email}`);
          }
        } else if (daysLeft <= 7) {
          const notifiedKey = NOTIFIED_KEY_PREFIX + 'expiring_sub_' + id + '_' + daysLeft;
          const already = db.exec(`SELECT value FROM settings WHERE key = ?`, [notifiedKey]);
          if (!already.length || !already[0].values.length) {
            db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [notifiedKey, String(Date.now())]);
            await sendSubscriptionExpiringEmail(email, name, daysLeft, plan);
            console.log(`[subscriptions] Subscription expiring (${daysLeft}d) email sent to ${email}`);
          }
        }
      }
    }
    saveDb();
  } catch (err) {
    console.error('[subscriptions] Check failed:', err.message);
  }
}

if (require.main === module) {
  start().then(() => {
    checkSubscriptions();
    cleanupBlocklist();
    setInterval(() => { checkSubscriptions(); cleanupBlocklist(); }, 6 * 60 * 60 * 1000);
  }).catch(console.error);
}

module.exports = { app, start };
