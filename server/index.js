if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { getDb, saveDb, transaction, cleanupBlocklist } = require('./db');
const { authMiddleware, JWT_SECRET } = require('./auth');
const { createCrudRoutes, queryToObjects } = require('./routes/crud');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const { FREE_LIMIT } = userRoutes;
const { resetMailConfig, sendConfirmationEmail } = require('./services/mailer');
const { resetStreamConfig, isStreamConfigured: checkStreamConfigured } = require('./services/stream');
const { parsePagination } = require('./helpers/pagination');
const jwt = require('jsonwebtoken');

const multer = require('multer');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
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
  crossOriginEmbedderPolicy: false,
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/auth') || req.path.startsWith('/api/user'),
});
app.use('/api', globalLimiter);

app.use(express.static(path.join(__dirname, '..', 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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

app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`SELECT 1`);
    res.json({ status: 'ok', db: 'ok', timestamp: Date.now() });
  } catch (err) {
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
      `SELECT id, title, duration, status, description, video_url, cf_video_uid, image_url, is_free, free_order, date, tags, direction, effect_description FROM lessons WHERE status = 'active' ORDER BY date DESC LIMIT ? OFFSET ?`,
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
      `SELECT id, title, duration, image_url, effect_description, direction
       FROM lessons WHERE status = 'active' AND image_url IS NOT NULL
       ORDER BY date DESC LIMIT ?`, [limit]
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

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

const api = express.Router();
api.use(authMiddleware);
api.use((req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
});

api.use('/lessons', createCrudRoutes('lessons', ['title', 'duration', 'status', 'description', 'video_url', 'cf_video_uid', 'image_url', 'is_free', 'free_order', 'date', 'tags', 'direction', 'direction_source', 'effect_description', 'effect_is_draft']));
api.use('/complexes', createCrudRoutes('complexes', ['name', 'description', 'image_url', 'status']));

// complex_lessons — custom routes (composite PK)
api.get('/complex-lessons', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const db = await getDb();
    const offset = (page - 1) * limit;
    const countResult = db.exec(`SELECT COUNT(*) FROM complex_lessons`);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    const result = db.exec(`SELECT complex_id, lesson_id, position FROM complex_lessons ORDER BY complex_id, position LIMIT ? OFFSET ?`, [limit, offset]);
    res.json({
      data: queryToObjects(result),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

api.post('/complex-lessons', async (req, res) => {
  try {
    const { complex_id, lesson_id, position } = req.body;
    if (!complex_id || !lesson_id) return res.status(400).json({ error: 'complex_id and lesson_id required' });
    const db = await getDb();
    db.run(`INSERT OR REPLACE INTO complex_lessons (complex_id, lesson_id, position) VALUES (?, ?, ?)`,
      [complex_id, lesson_id, position || 0]);
    saveDb();
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

api.put('/complex-lessons/:key', async (req, res) => {
  try {
    const [complexId, lessonId] = req.params.key.split('_').map(Number);
    if (!complexId || !lessonId) return res.status(400).json({ error: 'Invalid key' });
    const { position } = req.body;
    const db = await getDb();
    db.run(`UPDATE complex_lessons SET position = ? WHERE complex_id = ? AND lesson_id = ?`,
      [position || 0, complexId, lessonId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

api.delete('/complex-lessons/:key', async (req, res) => {
  try {
    const [complexId, lessonId] = req.params.key.split('_').map(Number);
    if (!complexId || !lessonId) return res.status(400).json({ error: 'Invalid key' });
    const db = await getDb();
    db.run(`DELETE FROM complex_lessons WHERE complex_id = ? AND lesson_id = ?`, [complexId, lessonId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
api.use('/subscribers', createCrudRoutes('subscribers', ['name', 'email', 'plan', 'status', 'email_confirmed', 'free_sessions_used', 'subscription_started_at', 'next_billing_date']));
api.use('/reviews', createCrudRoutes('reviews', ['author', 'text', 'rating', 'status', 'date']));
api.use('/faq', createCrudRoutes('faq', ['question', 'answer', 'sort_order']));
api.use('/promo-codes', createCrudRoutes('promo_codes', ['code', 'discount', 'max_uses', 'current_uses', 'active']));
api.use('/transactions', createCrudRoutes('transactions', ['subscriber_id', 'type', 'amount', 'status', 'date']));
api.use('/notifications', createCrudRoutes('notifications', ['title', 'type', 'text', 'recipients', 'sent_at']));
api.use('/users', createCrudRoutes('users', ['email', 'name', 'role']));
api.use('/watched-lessons', createCrudRoutes('watched_lessons', ['subscriber_id', 'lesson_id', 'position_seconds', 'completed']));

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

const VALID_SCHEDULE_FIELDS = ['date', 'theme', 'complex_id', 'lesson_id'];

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
  'cf_stream_signing_key_id', 'cf_stream_signing_key', 'cf_stream_customer_code',
]);

api.get('/settings', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`SELECT * FROM settings`);
    const settings = {};
    if (result.length > 0) {
      result[0].values.forEach(row => { settings[row[0]] = row[1]; });
    }
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

api.put('/settings', async (req, res) => {
  try {
    const db = await getDb();
    const entries = Object.entries(req.body).filter(([key]) => ALLOWED_SETTINGS_KEYS.has(key));
    if (entries.length === 0) {
      return res.status(400).json({ error: 'No valid settings provided' });
    }
    entries.forEach(([key, value]) => {
      db.run(`INSERT OR REPLACE INTO settings ("key", value) VALUES (?, ?)`, [key, String(value)]);
    });
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

api.post('/settings', async (req, res) => {
  try {
    const db = await getDb();
    if (req.body.key && req.body.value !== undefined) {
      if (!ALLOWED_SETTINGS_KEYS.has(req.body.key)) {
        return res.status(400).json({ error: 'Invalid settings key' });
      }
      db.run(`INSERT OR REPLACE INTO settings ("key", value) VALUES (?, ?)`, [req.body.key, String(req.body.value)]);
    } else {
      const entries = Object.entries(req.body).filter(([key]) => ALLOWED_SETTINGS_KEYS.has(key));
      entries.forEach(([key, value]) => {
        db.run(`INSERT OR REPLACE INTO settings ("key", value) VALUES (?, ?)`, [key, String(value)]);
      });
    }
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
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

api.post('/settings/test-stream', async (req, res) => {
  try {
    resetStreamConfig();
    const configured = await checkStreamConfigured();
    res.json({ configured });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

api.get('/dashboard', async (req, res) => {
  try {
    const db = await getDb();
    const users = queryToObjects(db.exec(`SELECT COUNT(*) as count FROM subscribers`));
    const active = queryToObjects(db.exec(`SELECT COUNT(*) as count FROM subscribers WHERE status = 'active'`));
    const lessons = queryToObjects(db.exec(`SELECT COUNT(*) as count FROM lessons`));
    const reviews = queryToObjects(db.exec(`SELECT COUNT(*) as count FROM reviews`));
    const revenue = queryToObjects(db.exec(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE status = 'success'`));
    const openTickets = queryToObjects(db.exec(`SELECT COUNT(*) as count FROM tickets WHERE status != 'resolved'`));
    const subCount = queryToObjects(db.exec(`SELECT COUNT(*) as count FROM subscribers WHERE status = 'active' OR status = 'trial'`));
    const paidCount = queryToObjects(db.exec(`SELECT COUNT(*) as count FROM subscribers WHERE (plan = 'annual' OR plan = 'monthly') AND status = 'active'`));
    const revenueNum = revenue[0]?.total || 0;
    const subscriberCount = subCount[0]?.count || 0;
    const paidNum = paidCount[0]?.count || 0;
    const conversionRate = subscriberCount > 0 ? Math.round((paidNum / subscriberCount) * 100) : 0;

    res.json({
      totalUsers: users[0]?.count || 0,
      activeUsers: active[0]?.count || 0,
      totalLessons: lessons[0]?.count || 0,
      totalReviews: reviews[0]?.count || 0,
      openTickets: openTickets[0]?.count || 0,
      monthlyRevenue: revenueNum,
      conversionRate,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
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
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

api.post('/upload', uploadImage.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded or invalid format' });
    const sub = req.query.type || 'general';
    const url = '/uploads/' + sub + '/' + req.file.filename;
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// === TICKETS (FEEDBACK) ===

const feedbackRouter = express.Router();
feedbackRouter.use(authMiddleware);

// Subscriber: create ticket
feedbackRouter.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'subscriber') return res.status(403).json({ error: 'Forbidden' });
    const { category, subject, message } = req.body;
    if (!category || !subject || !message) return res.status(400).json({ error: 'category, subject, message required' });
    if (!['trainer', 'technical', 'admin'].includes(category)) return res.status(400).json({ error: 'Invalid category' });
    const safeSubject = String(subject).trim().slice(0, 200);
    const safeMessage = String(message).trim().slice(0, 5000);
    if (!safeSubject || !safeMessage) return res.status(400).json({ error: 'subject and message required' });
    const ticketId = await transaction(async (db) => {
      db.run(`INSERT INTO tickets (subscriber_id, category, subject) VALUES (?, ?, ?)`, [req.user.id, category, safeSubject]);
      const idResult = db.exec(`SELECT last_insert_rowid()`);
      const id = idResult[0].values[0][0];
      db.run(`INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message) VALUES (?, 'subscriber', ?, ?)`, [id, req.user.id, safeMessage]);
      return id;
    });
    saveDb();
    res.json({ success: true, ticketId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Subscriber: list my tickets
feedbackRouter.get('/', async (req, res) => {
  try {
    if (req.user.role !== 'subscriber') return res.status(403).json({ error: 'Forbidden' });
    const { page, limit } = parsePagination(req.query);
    const db = await getDb();
    const offset = (page - 1) * limit;
    const countResult = db.exec(`SELECT COUNT(*) FROM tickets WHERE subscriber_id = ?`, [req.user.id]);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    const tickets = queryToObjects(db.exec(`SELECT * FROM tickets WHERE subscriber_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`, [req.user.id, limit, offset]));
    res.json({
      data: tickets,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Subscriber: get ticket with messages
feedbackRouter.get('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'subscriber') return res.status(403).json({ error: 'Forbidden' });
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }
    const db = await getDb();
    const tickets = queryToObjects(db.exec(`SELECT * FROM tickets WHERE id = ? AND subscriber_id = ?`, [ticketId, req.user.id]));
    if (!tickets.length) return res.status(404).json({ error: 'Not found' });
    const messages = queryToObjects(db.exec(`SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`, [ticketId]));
    res.json({ ...tickets[0], messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Subscriber: reply to ticket
feedbackRouter.post('/:id/reply', async (req, res) => {
  try {
    if (req.user.role !== 'subscriber') return res.status(403).json({ error: 'Forbidden' });
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'message required' });
    const db = await getDb();
    const tickets = queryToObjects(db.exec(`SELECT id FROM tickets WHERE id = ? AND subscriber_id = ?`, [ticketId, req.user.id]));
    if (!tickets.length) return res.status(404).json({ error: 'Not found' });
    db.run(`INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message) VALUES (?, 'subscriber', ?, ?)`, [ticketId, req.user.id, message.trim()]);
    db.run(`UPDATE tickets SET status = 'open' WHERE id = ? AND status = 'resolved'`, [ticketId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('/api/feedback', feedbackRouter);

// Admin: list all tickets (with filters)
api.get('/admin/feedback', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const { category, status } = req.query;
    const db = await getDb();
    let whereSql = ` WHERE 1=1`;
    const params = [];
    if (category) { whereSql += ` AND t.category = ?`; params.push(category); }
    if (status) { whereSql += ` AND t.status = ?`; params.push(status); }
    const countResult = db.exec(`SELECT COUNT(*) FROM tickets t${whereSql}`, params);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    const offset = (page - 1) * limit;
    let sql = `SELECT t.*, s.name as subscriber_name, s.email as subscriber_email,
      (SELECT message FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count
      FROM tickets t LEFT JOIN subscribers s ON t.subscriber_id = s.id${whereSql} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
    const tickets = queryToObjects(db.exec(sql, [...params, limit, offset]));
    res.json({
      data: tickets,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: get ticket with messages
api.get('/admin/feedback/:id', async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }
    const db = await getDb();
    const tickets = queryToObjects(db.exec(`SELECT t.*, s.name as subscriber_name, s.email as subscriber_email FROM tickets t LEFT JOIN subscribers s ON t.subscriber_id = s.id WHERE t.id = ?`, [ticketId]));
    if (!tickets.length) return res.status(404).json({ error: 'Not found' });
    const messages = queryToObjects(db.exec(`SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`, [ticketId]));
    res.json({ ...tickets[0], messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: update ticket status/assign
api.put('/admin/feedback/:id', async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }
    const { status, assigned_to } = req.body;
    const db = await getDb();
    if (status) {
      if (!['open', 'in_progress', 'resolved'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
      db.run(`UPDATE tickets SET status = ? WHERE id = ?`, [status, ticketId]);
    }
    if (assigned_to !== undefined) {
      const safeAssignee = String(assigned_to).trim().slice(0, 100);
      db.run(`UPDATE tickets SET assigned_to = ? WHERE id = ?`, [safeAssignee, ticketId]);
    }
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: reply to ticket
api.post('/admin/feedback/:id/reply', async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'message required' });
    const db = await getDb();
    const tickets = queryToObjects(db.exec(`SELECT id FROM tickets WHERE id = ?`, [ticketId]));
    if (!tickets.length) return res.status(404).json({ error: 'Not found' });
    db.run(`INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message) VALUES (?, 'admin', ?, ?)`, [ticketId, req.user.id, message.trim()]);
    db.run(`UPDATE tickets SET status = 'in_progress' WHERE id = ? AND status = 'open'`, [ticketId]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('/api', api);

const videosDir = process.env.VIDEOS_DIR || path.join(__dirname, '..', 'videos');
app.get('/videos/{*splat}', async (req, res) => {
  let filename;
  try {
    filename = decodeURIComponent(req.params.splat);
  } catch (e) {
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
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role === 'subscriber') {
      const db = await getDb();
      const escapedFilename = filename.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const lessonResult = db.exec(`SELECT id, is_free FROM lessons WHERE video_url LIKE ? ESCAPE '\\'`, ['%' + escapedFilename + '%']);
      if (!lessonResult.length || !lessonResult[0].values.length) {
        return res.status(403).json({ error: 'Access denied: video not linked to any lesson' });
      }
      const lessonId = lessonResult[0].values[0][0];
      const isFree = lessonResult[0].values[0][1];
      if (!isFree) {
        const userResult = db.exec(`SELECT plan, free_sessions_used FROM subscribers WHERE id = ?`, [decoded.id]);
        if (userResult.length && userResult[0].values.length) {
          const plan = userResult[0].values[0][0];
          const freeUsed = userResult[0].values[0][1] || 0;
          if (plan === 'trial' && freeUsed >= FREE_LIMIT) {
            return res.status(403).json({ error: 'Free limit reached. Subscribe to continue.' });
          }
        }
      }
    }
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  let fileSize;
  try {
    const stat = fs.statSync(filePath);
    fileSize = stat.size;
  } catch (e) {
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
  const urlPath = req.params.splat || '';
  if (urlPath.endsWith('.html') || urlPath.endsWith('.js') || urlPath.endsWith('.css') || urlPath.endsWith('.svg') || urlPath.endsWith('.png') || urlPath.endsWith('.json')) {
    const filePath = path.join(__dirname, '..', 'dist', 'admin', urlPath);
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
  }
  res.sendFile(path.join(__dirname, '..', 'dist', 'admin', 'index.html'));
});

const CLEAN_URL_ROUTES = { plans: 'plans.html', lessons: 'lessons.html', login: 'login.html', calendar: 'calendar.html', faq: 'faq.html', contact: 'contact.html', 'is-it-really-free': 'is-it-really-free.html', 'how-to-cancel': 'how-to-cancel.html', 'about-trainer': 'about-trainer.html', '8-pieces-of-brocade': '8-pieces-of-brocade.html', yijinjing: 'yijinjing.html', 'small-circulation': 'small-circulation.html', terms: 'terms.html', refund: 'refund.html', privacy: 'privacy.html', player: 'player.html', picker: 'picker.html', profile: 'profile.html', dashboard: 'dashboard.html', onboarding: 'onboarding.html' };
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
  console.error('Unhandled error:', err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message || 'Bad request' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  const { validateConfig } = require('./helpers/config');
  validateConfig();

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
  });

  const shutdown = () => {
    console.log('Shutting down gracefully...');
    saveDb();
    server.close(() => { process.exit(0); });
    setTimeout(() => { process.exit(1); }, 5000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

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
    db.run(`INSERT OR IGNORE INTO lessons (title, duration, status, date, video_url, is_free, free_order, tags, direction, direction_source, effect_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
