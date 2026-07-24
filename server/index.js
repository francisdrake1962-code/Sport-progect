if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { getDb, saveDb } = require('./db');
const { authMiddleware, JWT_SECRET } = require('./auth');
const { createCrudRoutes, queryToObjects } = require('./routes/crud');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const { FREE_LIMIT } = userRoutes;

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
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

app.use(express.static(path.join(__dirname, '..', 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/lessons', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`SELECT * FROM lessons WHERE status = 'active' ORDER BY date DESC`);
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
    const db = await getDb();
    const result = db.exec(`SELECT * FROM complexes ORDER BY id`);
    res.json(queryToObjects(result));
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
    const db = await getDb();
    const result = db.exec(`SELECT * FROM schedule ORDER BY id`);
    res.json(queryToObjects(result));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/reviews', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`SELECT * FROM reviews ORDER BY id DESC`);
    res.json(queryToObjects(result));
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

api.use('/lessons', createCrudRoutes('lessons', ['title', 'complex_id', 'duration', 'status', 'description', 'video_url', 'cf_video_uid', 'is_free', 'free_order', 'date', 'tags', 'direction', 'direction_source', 'effect_description', 'effect_is_draft']));
api.use('/complexes', createCrudRoutes('complexes', ['name', 'description', 'status']));
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
    db.run(`DELETE FROM lesson_zones WHERE lesson_id = ?`, [id]);
    const VALID_ZONES = ['шея', 'поясница', 'грудной_отдел', 'колени', 'ноги_таз', 'спина_осанка', 'плечи_руки', 'баланс_общее'];
    zones.forEach(zone => {
      if (VALID_ZONES.includes(zone)) {
        db.run(`INSERT INTO lesson_zones (lesson_id, zone) VALUES (?, ?)`, [id, zone]);
      }
    });
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update zones' });
  }
});

const VALID_SCHEDULE_FIELDS = ['date', 'theme', 'complex_id', 'lesson_id'];

api.get('/schedule', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`SELECT * FROM schedule ORDER BY id`);
    res.json(queryToObjects(result));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
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
    const { resetMailConfig } = require('./services/mailer');
    const { sendConfirmationEmail } = require('./services/mailer');
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
    const { resetStreamConfig, isStreamConfigured } = require('./services/stream');
    resetStreamConfig();
    const configured = await isStreamConfigured();
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
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role === 'subscriber') {
      const db = await getDb();
      const lessonResult = db.exec(`SELECT id, is_free FROM lessons WHERE video_url LIKE ?`, ['%' + filename + '%']);
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

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
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
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

app.get('/admin/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'admin', 'index.html'));
});

const CLEAN_URL_ROUTES = { plans: 'plans.html', lessons: 'lessons.html', login: 'login.html', calendar: 'calendar.html', faq: 'faq.html', contact: 'contact.html', 'is-it-really-free': 'is-it-really-free.html', 'how-to-cancel': 'how-to-cancel.html', 'about-trainer': 'about-trainer.html', '8-pieces-of-brocade': '8-pieces-of-brocade.html', yijinjing: 'yijinjing.html', 'small-circulation': 'small-circulation.html', terms: 'terms.html', refund: 'refund.html', privacy: 'privacy.html', player: 'player.html', picker: 'picker.html', profile: 'profile.html' };
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
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await getDb();
  console.log('Database initialized');

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
    ['Утренняя разминка шеи', 1, 27, 'active', '2026-07-21', '/videos/11 ИЮНЯ. 2025 СУСТАВНАЯ РАЗМИНКА-1784275001698.mp4', 1, 1, '["шея","осанка","энергия"]', 'суставная_разминка', 'заголовок', 'Разминка шейного отдела позвоночника, улучшение кровообращения'],
    ['Поясница и бёдра', 4, 31, 'active', '2026-07-20', '/videos/СУСТАВНАЯ РАЗМИНКА С ЭЛЕМЕНТАМИ ДЫХАТЕЛЬНОЙ ГИМНАСТИКИ 08.01.2026-cut-merged-1784283601063.mp4', 1, 2, '["поясница","баланс","снятие стресса"]', 'суставная_разминка', 'заголовок', 'Проработка поясничного отдела и тазобедренных суставов'],
    ['Баланс и координация', 2, 29, 'active', '2026-07-19', '/videos/13 ИЮЛЯ 2026. ЗАНЯТИЕ В ПОТОКЕ++-cut-merged-1784297859174.mp4', 1, 3, '["ноги","баланс","поток"]', 'занятие_в_потоке', 'заголовок', 'Развитие чувства равновесия и координации движений'],
    ['Дыхательная практика', 3, 28, 'draft', '2026-07-18', '/videos/11 ИЮНЯ. 2025 СУСТАВНАЯ РАЗМИНКА + ЭЛЕМЕНТЫ ДЫХАТЕЛЬНОЙ ГИМНАСТИКИ-cut-merged-1784275001698.mp4', 1, 4, '["дыхание","снятие стресса"]', 'занятие_в_потоке', 'описание_неточно', 'Дыхательные упражнения для расслабления'],
    ['Разминка суставов рук', 1, 25, 'active', '2026-07-17', '/videos/Зарядка 01.04.2022 ТРЕНИРОВКА «ПОТОК» IMG_8063-cut-merged-1784527616383.MP4', 1, 5, '["осанка","энергия"]', 'суставная_разминка', 'заголовок', 'Разминка плечевых и локтевых суставов'],
    ['Разминка коленей', 3, 22, 'active', '2026-07-16', '/videos/23 ноября 2023-cut-merged-1784279743390+.MP4', 1, 6, '["ноги","баланс"]', 'суставная_разминка', 'заголовок', 'Бережная разминка коленных суставов'],
    ['Здоровая спина', 4, 30, 'active', '2026-07-15', '/videos/14 июля 2026 Суставная разминка-cut-merged-1784303384816.MOV', 1, 7, '["поясница","осанка","снятие стресса"]', 'суставная_разминка', 'заголовок', 'Комплекс для укрепления мышц спины'],
    ['Утренняя энергия', 1, 28, 'active', '2026-07-14', '/videos/11 ИЮНЯ. 2025 СУСТАВНАЯ РАЗМИНКА-1784275001698.mp4', 0, null, '["энергия","дыхание"]', 'суставная_разминка', 'нет_данных', null],
    ['Вечернее расслабление', 2, 26, 'active', '2026-07-13', '/videos/СУСТАВНАЯ РАЗМИНКА С ЭЛЕМЕНТАМИ ДЫХАТЕЛЬНОЙ ГИМНАСТИКИ 08.01.2026-cut-merged-1784283601063.mp4', 0, null, '["снятие стресса","дыхание","поток"]', 'занятие_в_потоке', 'нет_данных', null],
    ['Крепкий корпус', 3, 33, 'active', '2026-07-12', '/videos/13 ИЮЛЯ 2026. ЗАНЯТИЕ В ПОТОКЕ++-cut-merged-1784297859174.mp4', 0, null, '["поясница","осанка","энергия"]', 'суставная_разминка', 'нет_данных', null],
  ];
  lessons.forEach(([title, cid, dur, status, date, video, isFree, freeOrder, tags, direction, dirSource, effectDesc]) => {
    db.run(`INSERT OR IGNORE INTO lessons (title, complex_id, duration, status, date, video_url, is_free, free_order, tags, direction, direction_source, effect_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, cid, dur, status, date, video, isFree, freeOrder, tags || '[]', direction, dirSource, effectDesc]);
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
    ['Нужна ли физподготовка?', 'Нет, программа для новичков', 1],
    ['Подходит ли при травме?', 'Да, вы указываете ограничения', 2],
    ['Это правда бесплатно?', '7 занятий без карты', 3],
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

async function checkSubscriptions() {
  try {
    const { sendTrialExpiringEmail, sendSubscriptionExpiringEmail, sendSubscriptionExpiredEmail } = require('./services/mailer');
    const { getSetting } = require('./db');
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
    setInterval(checkSubscriptions, 6 * 60 * 60 * 1000);
  }).catch(console.error);
}

module.exports = { app, start };
