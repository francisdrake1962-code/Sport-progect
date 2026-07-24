const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getDb, saveDb } = require('../db');
const { generateToken, authMiddleware } = require('../auth');
const { sendConfirmationEmail } = require('../services/mailer');
const { isStreamConfigured, generateSignedToken, getStreamUrl } = require('../services/stream');

const router = express.Router();

const FREE_LIMIT = 7;

router.get('/stats', async (req, res) => {
  try {
    const db = await getDb();
    const lessonsResult = db.exec(`SELECT COUNT(*) FROM lessons WHERE status = 'active'`);
    const lessonsCount = lessonsResult.length && lessonsResult[0].values.length ? lessonsResult[0].values[0][0] : 0;
    const subscribersResult = db.exec(`SELECT COUNT(*) FROM subscribers`);
    const subscribersCount = subscribersResult.length && subscribersResult[0].values.length ? subscribersResult[0].values[0][0] : 0;
    const yearsResult = db.exec(`SELECT MIN(joined_at) FROM subscribers`);
    let practiceYears = 4;
    if (yearsResult.length && yearsResult[0].values.length && yearsResult[0].values[0][0]) {
      const joined = new Date(yearsResult[0].values[0][0]);
      const now = new Date();
      practiceYears = Math.max(1, Math.floor((now - joined) / (365.25 * 24 * 60 * 60 * 1000)));
    }
    res.json({ lessonsCount, subscribersCount, practiceYears });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 15,
  message: { error: 'Too many attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const resendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 3,
  message: { error: 'Too many resend attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const db = await getDb();
    const existing = db.exec(`SELECT id FROM subscribers WHERE email = ?`, [normalizedEmail]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const hash = await bcrypt.hash(password, 10);
    const confirmToken = crypto.randomBytes(32).toString('hex');
    const { _getProvider } = require('../services/mailer');
    const mailProvider = _getProvider();
    const isConsole = mailProvider === 'console';
    db.run(
      `INSERT INTO subscribers (name, email, password, confirmation_token, email_confirmed, free_sessions_used, status) VALUES (?, ?, ?, ?, ?, 0, 'trial')`,
      [name.trim(), normalizedEmail, hash, confirmToken, isConsole ? 1 : 0]
    );
    saveDb();
    await sendConfirmationEmail(normalizedEmail, confirmToken);
    const response = {
      message: isConsole
        ? 'Регистрация завершена (dev: email подтверждён автоматически)'
        : 'Проверьте почту для подтверждения регистрации',
    };
    if (isConsole) response.confirmation_token = confirmToken;
    res.status(201).json(response);
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const db = await getDb();
    const result = db.exec(`SELECT id, email, password, name, plan, status, free_sessions_used, email_confirmed FROM subscribers WHERE email = ?`, [email.trim().toLowerCase()]);
    if (!result.length || !result[0].values.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const row = result[0].values[0];
    const user = { id: row[0], email: row[1], password: row[2], name: row[3], plan: row[4], status: row[5], free_sessions_used: row[6], email_confirmed: row[7] };
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.email_confirmed) {
      const tokenResult = db.exec(`SELECT confirmation_token FROM subscribers WHERE email = ?`, [email]);
      const confirmationToken = (tokenResult.length && tokenResult[0].values.length) ? tokenResult[0].values[0][0] : null;
      if (process.env.MAIL_PROVIDER === 'console' && confirmationToken) {
        console.log(`[DEV] Confirmation link: http://localhost:${process.env.PORT || 3000}/api/user/confirm/${confirmationToken}`);
      }
      return res.status(403).json({ error: 'EMAIL_NOT_CONFIRMED', message: 'Подтвердите email перед входом' });
    }
    const token = generateToken({ id: user.id, email: user.email, role: 'subscriber' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, plan: user.plan, status: user.status, free_sessions_used: user.free_sessions_used } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`SELECT id, email, name, plan, status, free_sessions_used, subscription_started_at, next_billing_date FROM subscribers WHERE id = ?`, [req.user.id]);
    if (!result.length || !result[0].values.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const row = result[0].values[0];
    res.json({ id: row[0], email: row[1], name: row[2], plan: row[3], status: row[4], free_sessions_used: row[5], subscription_started_at: row[6], next_billing_date: row[7] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

router.put('/me', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { name, current_password, new_password } = req.body;
    const result = db.exec(`SELECT name, password FROM subscribers WHERE id = ?`, [req.user.id]);
    if (!result.length || !result[0].values.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const row = result[0].values[0];
    const currentName = row[0];
    const currentHash = row[1];
    if (new_password) {
      if (!current_password) {
        return res.status(400).json({ error: 'Current password required' });
      }
      const valid = await bcrypt.compare(current_password, currentHash);
      if (!valid) {
        return res.status(401).json({ error: 'Wrong current password' });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      const hash = await bcrypt.hash(new_password, 10);
      db.run(`UPDATE subscribers SET password = ? WHERE id = ?`, [hash, req.user.id]);
    }
    if (name && name.trim()) {
      db.run(`UPDATE subscribers SET name = ? WHERE id = ?`, [name.trim(), req.user.id]);
    }
    saveDb();
    const updated = db.exec(`SELECT id, email, name, plan, status, free_sessions_used, subscription_started_at, next_billing_date FROM subscribers WHERE id = ?`, [req.user.id]);
    const u = updated[0].values[0];
    res.json({ id: u[0], email: u[1], name: u[2], plan: u[3], status: u[4], free_sessions_used: u[5], subscription_started_at: u[6], next_billing_date: u[7] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/confirm/resend', resendLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const normalizedEmail = email.trim().toLowerCase();
    const db = await getDb();
    const result = db.exec(`SELECT confirmation_token, email_confirmed FROM subscribers WHERE email = ?`, [normalizedEmail]);
    if (!result.length || !result[0].values.length) {
      return res.status(200).json({ message: 'Если email зарегистрирован, письмо отправлено' });
    }
    const row = result[0].values[0];
    const confirmToken = row[0];
    const confirmed = row[1];
    if (confirmed) {
      return res.status(200).json({ message: 'Email уже подтверждён' });
    }
    if (!confirmToken) {
      const newToken = crypto.randomBytes(32).toString('hex');
      db.run(`UPDATE subscribers SET confirmation_token = ? WHERE email = ?`, [newToken, normalizedEmail]);
      saveDb();
      await sendConfirmationEmail(normalizedEmail, newToken);
    } else {
      await sendConfirmationEmail(normalizedEmail, confirmToken);
    }
    res.json({ message: 'Письмо отправлено' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resend' });
  }
});

router.get('/confirm/:token', async (req, res) => {
  try {
    const db = await getDb();
    const check = db.exec(`SELECT id FROM subscribers WHERE confirmation_token = ?`, [req.params.token]);
    if (!check.length || !check[0].values.length) {
      return res.status(400).send('<html><body><h1>Ссылка недействительна или устарела</h1><p><a href="/">Вернуться на главную</a></p></body></html>');
    }
    db.run(`UPDATE subscribers SET email_confirmed = 1, confirmation_token = NULL WHERE confirmation_token = ?`, [req.params.token]);
    saveDb();
    res.send('<html><body><h1>Почта подтверждена!</h1><p>Теперь вы можете войти в приложение.</p><p><a href="/">Вернуться на главную</a></p></body></html>');
  } catch (err) {
    res.status(500).send('<html><body><h1>Ошибка подтверждения</h1><p><a href="/">Вернуться на главную</a></p></body></html>');
  }
});

router.post('/confirm/:token', async (req, res) => {
  try {
    const db = await getDb();
    const check = db.exec(`SELECT id FROM subscribers WHERE confirmation_token = ?`, [req.params.token]);
    if (!check.length || !check[0].values.length) {
      return res.status(400).json({ error: 'Invalid or expired confirmation token' });
    }
    db.run(`UPDATE subscribers SET email_confirmed = 1, confirmation_token = NULL WHERE confirmation_token = ?`, [req.params.token]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Confirmation failed' });
  }
});

router.post('/watch-progress', authMiddleware, async (req, res) => {
  try {
    const { lesson_id, position_seconds, completed } = req.body;
    const lessonId = Number(lesson_id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ error: 'Invalid lesson_id' });
    }
    const db = await getDb();

    const alreadyCompleted = db.exec(
      `SELECT completed FROM watched_lessons WHERE subscriber_id = ? AND lesson_id = ?`,
      [req.user.id, lessonId]
    );
    const wasAlreadyCompleted = alreadyCompleted.length && alreadyCompleted[0].values.length && alreadyCompleted[0].values[0][0] === 1;

    db.run(
      `INSERT INTO watched_lessons (subscriber_id, lesson_id, position_seconds, completed) VALUES (?, ?, ?, ?)
       ON CONFLICT(subscriber_id, lesson_id) DO UPDATE SET position_seconds=?, completed=?, watched_at=CURRENT_TIMESTAMP`,
      [req.user.id, lessonId, position_seconds || 0, completed ? 1 : 0, position_seconds || 0, completed ? 1 : 0]
    );
    if (completed && !wasAlreadyCompleted) {
      const lessonResult = db.exec(`SELECT is_free FROM lessons WHERE id = ?`, [lessonId]);
      const isFree = lessonResult.length && lessonResult[0].values.length ? lessonResult[0].values[0][0] : 0;
      if (!isFree) {
        const used = db.exec(`SELECT free_sessions_used, plan FROM subscribers WHERE id = ?`, [req.user.id]);
        if (used.length && used[0].values.length) {
          const current = used[0].values[0][0] || 0;
          const plan = used[0].values[0][1];
          if (plan === 'trial' && current < FREE_LIMIT) {
            db.run(`UPDATE subscribers SET free_sessions_used = ? WHERE id = ?`, [current + 1, req.user.id]);
          }
        }
      }
    }
    saveDb();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

router.get('/progress', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(
      `SELECT wl.lesson_id, wl.position_seconds, wl.completed, wl.watched_at, l.title, l.duration
       FROM watched_lessons wl JOIN lessons l ON wl.lesson_id = l.id
       WHERE wl.subscriber_id = ? ORDER BY wl.watched_at DESC`,
      [req.user.id]
    );
    const items = result.length > 0 ? result[0].values.map(r => ({
      lesson_id: r[0], position_seconds: r[1], completed: r[2], watched_at: r[3], title: r[4], duration: r[5]
    })) : [];
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

// Hybrid free access model (intentional decision):
// 1. is_free lessons: unlimited access for all registered+confirmed users
// 2. Trial: up to 7 paid lessons from the archive (tracked by free_sessions_used)
router.get('/can-watch/:lessonId', authMiddleware, async (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }
    const db = await getDb();
    const userResult = db.exec(`SELECT plan, status, free_sessions_used, email_confirmed FROM subscribers WHERE id = ?`, [req.user.id]);
    if (!userResult.length || !userResult[0].values.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const row = userResult[0].values[0];
    const plan = row[0], status = row[1], freeUsed = row[2] || 0, emailConfirmed = row[3];

    if (!emailConfirmed) {
      return res.status(403).json({ error: 'EMAIL_NOT_CONFIRMED' });
    }

    if (plan === 'annual' || plan === 'monthly') {
      return res.json({ allowed: true, reason: 'paid' });
    }

    const lessonResult = db.exec(`SELECT is_free FROM lessons WHERE id = ?`, [lessonId]);
    if (!lessonResult.length || !lessonResult[0].values.length) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    const isFree = lessonResult[0].values[0][0];

    if (isFree) {
      return res.json({ allowed: true, reason: 'free_lesson' });
    }

    if (freeUsed >= FREE_LIMIT) {
      return res.json({ allowed: false, reason: 'limit_reached', freeUsed, freeLimit: FREE_LIMIT });
    }

    return res.json({ allowed: true, reason: 'trial', freeUsed, freeLimit: FREE_LIMIT });
  } catch (err) {
    res.status(500).json({ error: 'Access check failed' });
  }
});

router.get('/stream-token/:lessonId', authMiddleware, async (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }
    if (!(await isStreamConfigured())) {
      return res.status(503).json({ error: 'Streaming not configured' });
    }
    const db = await getDb();

    const userResult = db.exec(`SELECT plan, status, free_sessions_used, email_confirmed FROM subscribers WHERE id = ?`, [req.user.id]);
    if (!userResult.length || !userResult[0].values.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const urow = userResult[0].values[0];
    if (!urow[3]) return res.status(403).json({ error: 'EMAIL_NOT_CONFIRMED' });

    const lessonResult = db.exec(`SELECT is_free, cf_video_uid FROM lessons WHERE id = ?`, [lessonId]);
    if (!lessonResult.length || !lessonResult[0].values.length) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    const lrow = lessonResult[0].values[0];
    const isFree = lrow[0], cfUid = lrow[1];

    if (!cfUid) {
      return res.status(404).json({ error: 'Video not available on Cloudflare Stream' });
    }

    const plan = urow[0], freeUsed = urow[2] || 0;
    if (plan !== 'annual' && plan !== 'monthly') {
      if (!isFree) {
        if (freeUsed >= FREE_LIMIT) {
          return res.status(403).json({ error: 'limit_reached', freeUsed, freeLimit: FREE_LIMIT });
        }
      }
    }

    const signedToken = await generateSignedToken(cfUid);
    if (!signedToken) {
      return res.status(500).json({ error: 'Failed to generate stream token' });
    }
    const streamUrl = await getStreamUrl(cfUid, signedToken);
    res.json({ streamUrl });
  } catch (err) {
    res.status(500).json({ error: 'Stream token generation failed' });
  }
});

router.get('/calendar', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const scheduleResult = db.exec(`SELECT s.date, s.theme, s.lesson_id, l.title, l.duration, l.is_free
      FROM schedule s LEFT JOIN lessons l ON s.lesson_id = l.id ORDER BY s.date`);
    const progressResult = db.exec(`SELECT lesson_id, completed, position_seconds FROM watched_lessons WHERE subscriber_id = ?`, [req.user.id]);
    const userResult = db.exec(`SELECT subscription_started_at, free_sessions_used, plan, status FROM subscribers WHERE id = ?`, [req.user.id]);

    const progress = {};
    if (progressResult.length) {
      progressResult[0].values.forEach(r => {
        progress[r[0]] = { completed: r[1], position_seconds: r[2] };
      });
    }

    const schedule = scheduleResult.length ? scheduleResult[0].values.map(r => ({
      date: r[0], theme: r[1], lesson_id: r[2], title: r[3], duration: r[4], is_free: r[5],
      watched: progress[r[2]] || null,
    })) : [];

    const user = userResult.length && userResult[0].values.length ? {
      subscription_started_at: userResult[0].values[0][0],
      free_sessions_used: userResult[0].values[0][1],
      plan: userResult[0].values[0][2],
      status: userResult[0].values[0][3],
    } : {};

    const totalDays = schedule.length;
    const completedDays = schedule.filter(s => s.watched && s.watched.completed).length;

    res.json({ schedule, user, totalDays, completedDays });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load calendar' });
  }
});

router.get('/lessons-filter', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { zone, mood, duration } = req.query;
    let query = `SELECT l.id, l.title, l.duration, l.description, l.video_url, l.cf_video_uid, l.is_free, l.tags, l.complex_id, l.direction, l.effect_description FROM lessons l WHERE l.status = 'active'`;
    const params = [];
    const result = db.exec(query, params);
    if (!result.length) return res.json([]);
    let lessons = result[0].values.map(row => ({
      id: row[0], title: row[1], duration: row[2], description: row[3],
      video_url: row[4], cf_video_uid: row[5], is_free: row[6],
      tags: JSON.parse(row[7] || '[]'), complex_id: row[8],
      direction: row[9], effect_description: row[10],
    }));

    if (zone) {
      const zoneValues = zone.split(',').map(t => t.trim());
      const placeholders = zoneValues.map(() => '?').join(', ');
      const zoneResult = db.exec(
        `SELECT DISTINCT lesson_id FROM lesson_zones WHERE zone IN (${placeholders})`,
        zoneValues
      );
      const matchingIds = new Set(
        zoneResult.length ? zoneResult[0].values.map(r => r[0]) : []
      );
      lessons = lessons.filter(l => matchingIds.has(l.id));
    }

    if (mood) {
      const moodTags = mood.split(',').map(t => t.trim().toLowerCase());
      lessons = lessons.filter(l => l.tags.some(t => moodTags.includes(t.toLowerCase())));
    }
    if (duration) {
      const maxDur = parseInt(duration, 10);
      if (!isNaN(maxDur)) lessons = lessons.filter(l => l.duration <= maxDur);
    }
    const userResult = db.exec(`SELECT plan, free_sessions_used FROM subscribers WHERE id = ?`, [req.user.id]);
    const plan = userResult.length && userResult[0].values.length ? userResult[0].values[0][0] : 'trial';
    const freeUsed = userResult.length && userResult[0].values.length ? userResult[0].values[0][1] || 0 : 0;
    lessons = lessons.map(l => {
      let accessible = l.is_free || plan === 'annual' || plan === 'monthly' || freeUsed < FREE_LIMIT;
      return { ...l, accessible };
    });
    res.json(lessons);
  } catch (err) {
    res.status(500).json({ error: 'Failed to filter lessons' });
  }
});

module.exports = router;
module.exports.FREE_LIMIT = FREE_LIMIT;
