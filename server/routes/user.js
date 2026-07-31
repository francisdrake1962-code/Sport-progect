const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { getDb, saveDb } = require('../db');
const { authMiddleware, hashToken, JWT_SECRET } = require('../auth');
const { requireRole } = require('../middleware/rbac');
const { validateBody } = require('../middleware/validation');
const { requireDangerousActionConfirmation } = require('../middleware/confirmation');
const { sendConfirmationEmail } = require('../services/mailer');
const { isStreamConfigured, generateSignedToken, getStreamUrl, isMuxConfigured, signMuxPlaybackId, getMuxStreamUrl } = require('../services/stream');
const { parsePagination } = require('../helpers/pagination');
const { queryToObjects } = require('../helpers/db-utils');
const { revokeToken, transaction } = require('../db');
const authService = require('../services/auth.service');
const progressService = require('../services/progress.service');
const AnalyticsService = require('../services/analytics.service');
const analyticsService = new AnalyticsService(getDb);
const RecommendationService = require('../services/recommendation.service');
const recommendationService = new RecommendationService(getDb);

const { RUSSIAN_COUNTRIES, VALID_LANGUAGES } = require('./i18n');

const router = express.Router();

const FREE_LIMIT = 7;

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

const userApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.RATE_LIMIT_MAX_USER_API ? parseInt(process.env.RATE_LIMIT_MAX_USER_API, 10) : (process.env.NODE_ENV === 'test' ? 10000 : 120),
  message: { error: 'Too many requests. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/register' || req.path === '/login' || req.path.startsWith('/confirm/'),
});

const confirmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.RATE_LIMIT_MAX_CONFIRM ? parseInt(process.env.RATE_LIMIT_MAX_CONFIRM, 10) : (process.env.NODE_ENV === 'test' ? 10000 : 10),
  message: { error: 'Too many confirmation attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(userApiLimiter);

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
  } catch {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

router.post('/register', authLimiter, validateBody({
  name: { required: true, type: 'string', minLength: 1, maxLength: 100 },
  email: { required: true, type: 'string', maxLength: 255, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  password: { required: true, type: 'string', minLength: 8, maxLength: 128 },
}), async (req, res) => {
  try {
    const { name, email, password, fingerprint } = req.body;
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

    let prefillFreeUsed = 0;
    let deviceWarning = null;
    if (fingerprint) {
      const deviceAccounts = db.exec(
        `SELECT d.subscriber_id, s.free_sessions_used, s.plan
         FROM device_fingerprints d
         JOIN subscribers s ON s.id = d.subscriber_id
         WHERE d.fingerprint = ? AND d.subscriber_id != 0`,
        [fingerprint]
      );
      if (deviceAccounts.length && deviceAccounts[0].values.length) {
        const rows = deviceAccounts[0].values;
        const uniqueIds = [...new Set(rows.map(r => r[0]))];
        if (uniqueIds.length > 0) {
          const maxFreeUsed = Math.max(...rows.map(r => r[1] || 0));
          if (maxFreeUsed > 0) {
            prefillFreeUsed = maxFreeUsed;
            deviceWarning = 'Обнаружена другая учётная запись на этом устройстве. Бесплатные занятия будут зачислены с учётом предыдущего использования.';
          }
        }
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const confirmToken = crypto.randomBytes(32).toString('hex');
    const { resolveProvider } = require('../services/mailer');
    await resolveProvider();
    const { _getProvider } = require('../services/mailer');
    const mailProvider = _getProvider();
    const isConsole = mailProvider === 'console';
    db.run(
      `INSERT INTO subscribers (name, email, password, confirmation_token, email_confirmed, free_sessions_used, status) VALUES (?, ?, ?, ?, ?, ?, 'trial')`,
      [name.trim(), normalizedEmail, hash, confirmToken, isConsole ? 1 : 0, prefillFreeUsed]
    );
    saveDb();
    const newSub = db.exec(`SELECT id FROM subscribers WHERE email = ?`, [normalizedEmail]);
    const newId = newSub.length > 0 && newSub[0].values.length > 0 ? newSub[0].values[0][0] : null;

    if (fingerprint && newId) {
      const ipAddr = req.ip || req.connection.remoteAddress || '';
      db.run(
        `INSERT INTO device_fingerprints (fingerprint, ip_address, subscriber_id) VALUES (?, ?, ?)`,
        [fingerprint, ipAddr, newId]
      );
      saveDb();
    }

    analyticsService.trackEvent({ eventName: 'user_registered', userId: newId, ipAddress: req.ip }).catch(() => {});
    await sendConfirmationEmail(normalizedEmail, confirmToken);
    const response = {
      message: isConsole
        ? 'Регистрация завершена (dev: email подтверждён автоматически)'
        : 'Проверьте почту для подтверждения регистрации',
    };
    if (isConsole) response.confirmation_token = confirmToken;
    if (deviceWarning) response.deviceWarning = deviceWarning;
    res.status(201).json(response);
  } catch {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', authLimiter, validateBody({
  email: { required: true, type: 'string', maxLength: 255 },
  password: { required: true, type: 'string', maxLength: 128 },
}), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginSubscriber(email, password);
    analyticsService.trackEvent({ eventName: 'user_logged_in', userId: result.subscriber_id, ipAddress: req.ip }).catch(() => {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const profile = await progressService.getSubscriberProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

router.put('/me', authMiddleware, async (req, res, next) => {
  try {
    const { name, current_password, new_password } = req.body;
    const updated = await progressService.updateSubscriberProfile(req.user.id, name, current_password, new_password);
    if (new_password) {
      authService.revokeCurrentToken(req.token);
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authMiddleware, (req, res) => {
  authService.revokeCurrentToken(req.token);
  res.json({ success: true });
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
  } catch {
    res.status(500).json({ error: 'Failed to resend' });
  }
});

router.get('/confirm/:token', confirmLimiter, async (req, res) => {
  try {
    const db = await getDb();
    const check = db.exec(`SELECT id FROM subscribers WHERE confirmation_token = ?`, [req.params.token]);
    if (!check.length || !check[0].values.length) {
      return res.status(400).send('<html><body><h1>Ссылка недействительна или устарела</h1><p><a href="/">Вернуться на главную</a></p></body></html>');
    }
    db.run(`UPDATE subscribers SET email_confirmed = 1, confirmation_token = NULL WHERE confirmation_token = ?`, [req.params.token]);
    saveDb();
    res.send('<html><body><h1>Почта подтверждена!</h1><p>Теперь вы можете войти в приложение.</p><p><a href="/">Вернуться на главную</a></p></body></html>');
  } catch {
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
  } catch {
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
    const posSec = Math.max(0, Math.min(Number(position_seconds) || 0, 86400));
    const db = await getDb();

    const alreadyCompleted = db.exec(
      `SELECT completed FROM watched_lessons WHERE subscriber_id = ? AND lesson_id = ?`,
      [req.user.id, lessonId]
    );
    const wasAlreadyCompleted = alreadyCompleted.length && alreadyCompleted[0].values.length && alreadyCompleted[0].values[0][0] === 1;

    db.run(
      `INSERT INTO watched_lessons (subscriber_id, lesson_id, position_seconds, completed) VALUES (?, ?, ?, ?)
       ON CONFLICT(subscriber_id, lesson_id) DO UPDATE SET position_seconds=?, completed=?, watched_at=CURRENT_TIMESTAMP`,
      [req.user.id, lessonId, posSec, completed ? 1 : 0, posSec, completed ? 1 : 0]
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
    if (completed && !wasAlreadyCompleted) {
      analyticsService.trackEvent({ eventName: 'lesson_completed', userId: req.user.id, entity: 'lessons', entityId: lessonId, ipAddress: req.ip }).catch(() => {});
    } else if (!completed) {
      analyticsService.trackEvent({ eventName: 'lesson_started', userId: req.user.id, entity: 'lessons', entityId: lessonId, metadata: { position_seconds: posSec }, ipAddress: req.ip }).catch(() => {});
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

router.get('/progress', authMiddleware, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const db = await getDb();
    const offset = (page - 1) * limit;
    const countResult = db.exec(`SELECT COUNT(*) FROM watched_lessons WHERE subscriber_id = ?`, [req.user.id]);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    const result = db.exec(
      `SELECT wl.lesson_id, wl.position_seconds, wl.completed, wl.watched_at, l.title, l.duration
       FROM watched_lessons wl JOIN lessons l ON wl.lesson_id = l.id
       WHERE wl.subscriber_id = ? ORDER BY wl.watched_at DESC LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );
    const items = result.length > 0 ? result[0].values.map(r => ({
      lesson_id: r[0], position_seconds: r[1], completed: r[2], watched_at: r[3], title: r[4], duration: r[5]
    })) : [];
    res.json({
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

router.get('/progress/:lessonId', authMiddleware, async (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }
    const db = await getDb();
    const result = db.exec(
      `SELECT wl.position_seconds, wl.completed, wl.watched_at, l.duration
       FROM watched_lessons wl JOIN lessons l ON wl.lesson_id = l.id
       WHERE wl.subscriber_id = ? AND wl.lesson_id = ?`,
      [req.user.id, lessonId]
    );
    if (!result.length || !result[0].values.length) {
      return res.json({ position_seconds: 0, completed: false, duration: null });
    }
    const r = result[0].values[0];
    res.json({ position_seconds: r[0], completed: r[1], watched_at: r[2], duration: r[3] });
  } catch {
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
    const userResult = db.exec(`SELECT plan, status, free_sessions_used, email_confirmed, subscription_expires_at FROM subscribers WHERE id = ?`, [req.user.id]);
    if (!userResult.length || !userResult[0].values.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const row = userResult[0].values[0];
    const plan = row[0], status = row[1], freeUsed = row[2] || 0, emailConfirmed = row[3], expiresAt = row[4];

    if (!emailConfirmed) {
      return res.status(403).json({ error: 'EMAIL_NOT_CONFIRMED' });
    }

    const now = new Date();
    const hasPaidAccess = (plan === 'annual' || plan === 'monthly') && (status === 'active' || (status === 'cancelled' && expiresAt && new Date(expiresAt) > now));

    if (hasPaidAccess) {
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

    if ((plan === 'monthly' || plan === 'annual') && !hasPaidAccess) {
      return res.json({ allowed: false, reason: 'subscription_expired' });
    }

    if (freeUsed >= FREE_LIMIT) {
      return res.json({ allowed: false, reason: 'limit_reached', freeUsed, freeLimit: FREE_LIMIT });
    }

    const selCheck = db.exec(
      `SELECT 1 FROM free_lesson_selections WHERE subscriber_id = ? AND lesson_id = ?`,
      [req.user.id, lessonId]
    );
    const isSelected = selCheck.length && selCheck[0].values.length > 0;

    return res.json({ allowed: true, reason: isSelected ? 'selected_free' : 'trial', freeUsed, freeLimit: FREE_LIMIT });
  } catch {
    res.status(500).json({ error: 'Access check failed' });
  }
});

router.get('/stream-token/:lessonId', authMiddleware, async (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }
    const db = await getDb();

    const userResult = db.exec(`SELECT plan, status, free_sessions_used, email_confirmed, subscription_expires_at, preferred_language FROM subscribers WHERE id = ?`, [req.user.id]);
    if (!userResult.length || !userResult[0].values.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const urow = userResult[0].values[0];
    if (!urow[3]) return res.status(403).json({ error: 'EMAIL_NOT_CONFIRMED' });

    if (!(await isStreamConfigured()) && !(await isMuxConfigured())) {
      return res.status(503).json({ error: 'Streaming not configured' });
    }

    const userLang = urow[5] || 'ru';

    const lessonResult = db.exec(`SELECT is_free, cf_video_uid, video_url, video_provider FROM lessons WHERE id = ?`, [lessonId]);
    if (!lessonResult.length || !lessonResult[0].values.length) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    const lrow = lessonResult[0].values[0];
    const isFree = lrow[0], originalCfUid = lrow[1], videoUrl = lrow[2], lessonProvider = lrow[3] || 'cloudflare';

    let provider = lessonProvider;
    let cfUid = originalCfUid;
    let videoLanguage = 'ru';
    let isOriginal = true;

    if (userLang !== 'ru' && originalCfUid) {
      const mediaResult = db.exec(`SELECT cf_video_uid, video_provider FROM lesson_media WHERE lesson_id = ? AND language = ? AND status = 'ready'`, [lessonId, userLang]);
      if (mediaResult.length && mediaResult[0].values.length && mediaResult[0].values[0][0]) {
        cfUid = mediaResult[0].values[0][0];
        provider = mediaResult[0].values[0][1] || provider;
        videoLanguage = userLang;
        isOriginal = false;
      } else {
        const defaultResult = db.exec(`SELECT cf_video_uid, video_provider FROM lesson_media WHERE lesson_id = ? AND language = 'en' AND status = 'ready'`, [lessonId]);
        if (defaultResult.length && defaultResult[0].values.length && defaultResult[0].values[0][0]) {
          cfUid = defaultResult[0].values[0][0];
          provider = defaultResult[0].values[0][1] || provider;
          videoLanguage = 'en';
          isOriginal = false;
        }
      }
    }

    const plan = urow[0], status = urow[1], freeUsed = urow[2] || 0, expiresAt = urow[4];
    const now = new Date();
    const hasPaidAccess = (plan === 'annual' || plan === 'monthly') && (status === 'active' || (status === 'cancelled' && expiresAt && new Date(expiresAt) > now));
    if (!hasPaidAccess) {
      if (!isFree) {
        if ((plan === 'monthly' || plan === 'annual')) {
          return res.status(403).json({ error: 'subscription_expired' });
        }
        if (freeUsed >= FREE_LIMIT) {
          return res.status(403).json({ error: 'limit_reached', freeUsed, freeLimit: FREE_LIMIT });
        }
      }
    }

    let streamUrl = null;
    if (cfUid && provider === 'mux' && (await isMuxConfigured())) {
      const muxToken = await signMuxPlaybackId(cfUid);
      if (muxToken) {
        streamUrl = await getMuxStreamUrl(cfUid, muxToken);
      }
    } else if (cfUid && (await isStreamConfigured())) {
      const signedToken = await generateSignedToken(cfUid);
      if (signedToken) {
        streamUrl = await getStreamUrl(cfUid, signedToken);
      }
    }

    const videoAccessToken = jwt.sign(
      { scope: 'stream', lessonId, subscriberId: req.user.id, jti: crypto.randomUUID() },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' }
    );

    res.json({ streamUrl, videoLanguage, isOriginal, videoAccessToken });
  } catch (err) {
    req.log && req.log.error('stream-token error', err.message);
    res.status(500).json({ error: 'Stream token generation failed' });
  }
});

router.get('/calendar', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const scheduleResult = db.exec(`SELECT s.date, s.theme, s.lesson_id, l.title, l.duration, l.is_free
      FROM schedule s LEFT JOIN lessons l ON s.lesson_id = l.id ORDER BY s.date`);
    const progressResult = db.exec(`SELECT lesson_id, completed, position_seconds, watched_at FROM watched_lessons WHERE subscriber_id = ?`, [req.user.id]);
    const userResult = db.exec(`SELECT subscription_started_at, free_sessions_used, plan, status FROM subscribers WHERE id = ?`, [req.user.id]);

    const progress = {};
    if (progressResult.length) {
      progressResult[0].values.forEach(r => {
        progress[r[0]] = { completed: r[1], position_seconds: r[2], watched_at: r[3] };
      });
    }

    const schedule = scheduleResult.length ? scheduleResult[0].values.map(r => ({
      date: r[0], theme: r[1], lesson_id: r[2], title: r[3], duration: r[4], is_free: r[5],
    })) : [];

    const user = userResult.length && userResult[0].values.length ? {
      subscription_started_at: userResult[0].values[0][0],
      free_sessions_used: userResult[0].values[0][1],
      plan: userResult[0].values[0][2],
      status: userResult[0].values[0][3],
    } : {};

    const subStart = user.subscription_started_at ? new Date(user.subscription_started_at.split(' ')[0]) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let personalSchedule = [];
    let totalDays = 0;
    let completedDays = 0;

    if (subStart && schedule.length) {
      subStart.setHours(0, 0, 0, 0);
      const diffMs = today.getTime() - subStart.getTime();
      const daysSinceStart = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const lookAhead = 90;
      const startDay = Math.max(0, daysSinceStart - 30);

      for (let i = startDay; i <= daysSinceStart + lookAhead; i++) {
        const d = new Date(subStart);
        d.setDate(d.getDate() + i);
        const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const scheduleIdx = i % schedule.length;
        const sched = schedule[scheduleIdx];
        const watched = progress[sched.lesson_id] || null;
        const dayNum = i + 1;
        personalSchedule.push({
          date: dateStr,
          day_number: dayNum,
          theme: sched.theme,
          lesson_id: sched.lesson_id,
          title: sched.title,
          duration: sched.duration,
          is_free: sched.is_free,
          watched: watched,
          is_past: i < daysSinceStart,
          is_today: i === daysSinceStart,
          is_future: i > daysSinceStart,
        });
        totalDays++;
        if (watched && watched.completed) completedDays++;
      }
    } else {
      personalSchedule = schedule.map(s => ({
        ...s, day_number: 0, watched: progress[s.lesson_id] || null,
        is_past: false, is_today: false, is_future: false,
      }));
      totalDays = schedule.length;
      completedDays = personalSchedule.filter(s => s.watched && s.watched.completed).length;
    }

    res.json({ schedule: personalSchedule, user, totalDays, completedDays });
  } catch {
    res.status(500).json({ error: 'Failed to load calendar' });
  }
});

router.get('/lessons-filter', authMiddleware, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const db = await getDb();
    const { zone, mood, duration } = req.query;
    let query = `SELECT l.id, l.title, l.duration, l.description, l.video_url, l.cf_video_uid, l.is_free, l.tags, l.direction, l.effect_description FROM lessons l WHERE l.status = 'active'`;
    const params = [];
    const result = db.exec(query, params);
    if (!result.length) return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    let lessons = result[0].values.map(row => ({
      id: row[0], title: row[1], duration: row[2], description: row[3],
      video_url: row[4], cf_video_uid: row[5], is_free: row[6],
      tags: (() => { try { return JSON.parse(row[7] || '[]'); } catch { return []; } })(),
      direction: row[8], effect_description: row[9],
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
    const total = lessons.length;
    const offset = (page - 1) * limit;
    const paged = lessons.slice(offset, offset + limit);
    res.json({
      data: paged,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    res.status(500).json({ error: 'Failed to filter lessons' });
  }
});

router.get('/onboarding', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(
      `SELECT experience, goals, preferred_duration, preferred_time, focus_zones, onboarding_completed
       FROM user_preferences WHERE subscriber_id = ?`,
      [req.user.id]
    );
    if (!result.length || !result[0].values.length) {
      return res.json({ completed: false });
    }
    const r = result[0].values[0];
    res.json({
      completed: r[5] === 1,
      experience: r[0],
      goals: (() => { try { return JSON.parse(r[1] || '[]'); } catch { return []; } })(),
      preferred_duration: r[2],
      preferred_time: r[3],
      focus_zones: (() => { try { return JSON.parse(r[4] || '[]'); } catch { return []; } })()
    });
  } catch {
    res.status(500).json({ error: 'Failed to load preferences' });
  }
});

router.post('/onboarding', authMiddleware, async (req, res) => {
  try {
    const { experience, goals, preferred_duration, preferred_time, focus_zones } = req.body;
    const validExperiences = ['beginner', 'intermediate', 'advanced'];
    const validTimes = ['morning', 'afternoon', 'evening', 'anytime'];
    const validDurations = [10, 15, 20, 30];
    const allGoals = ['stress_relief', 'flexibility', 'energy', 'sleep', 'joint_health', 'general_health', 'breathing', 'meditation'];
    const allZones = ['шея', 'плечи_руки', 'грудной_отдел', 'поясница', 'спина_осанка', 'колени', 'ноги_таз', 'баланс_общее'];

    const safeExperience = validExperiences.includes(experience) ? experience : 'beginner';
    const safeGoals = Array.isArray(goals) ? goals.filter(g => allGoals.includes(g)) : [];
    const safeDuration = validDurations.includes(preferred_duration) ? preferred_duration : 15;
    const safeTime = validTimes.includes(preferred_time) ? preferred_time : 'anytime';
    const safeZones = Array.isArray(focus_zones) ? focus_zones.filter(z => allZones.includes(z)) : [];

    const db = await getDb();
    db.run(
      `INSERT INTO user_preferences (subscriber_id, experience, goals, preferred_duration, preferred_time, focus_zones, onboarding_completed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(subscriber_id) DO UPDATE SET
         experience=?, goals=?, preferred_duration=?, preferred_time=?, focus_zones=?, onboarding_completed=1, updated_at=CURRENT_TIMESTAMP`,
      [req.user.id, safeExperience, JSON.stringify(safeGoals), safeDuration, safeTime, JSON.stringify(safeZones),
       safeExperience, JSON.stringify(safeGoals), safeDuration, safeTime, JSON.stringify(safeZones)]
    );
    saveDb();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

router.get('/categories', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const zoneCounts = db.exec(
      `SELECT lz.zone, COUNT(DISTINCT lz.lesson_id) as cnt
       FROM lesson_zones lz
       JOIN lessons l ON lz.lesson_id = l.id AND l.status = 'active'
       GROUP BY lz.zone ORDER BY cnt DESC`
    );
    const zones = zoneCounts.length ? zoneCounts[0].values.map(r => ({
      zone: r[0], count: r[1],
      label: { шея:'Шея', плечи_руки:'Плечи и руки', грудной_отдел:'Грудной отдел',
        поясница:'Поясница', спина_осанка:'Спина и осанка', колени:'Колени',
        ноги_таз:'Ноги и таз', баланс_общее:'Баланс' }[r[0]] || r[0]
    })) : [];
    const directionCounts = db.exec(
      `SELECT direction, COUNT(*) as cnt FROM lessons
       WHERE status='active' AND direction IS NOT NULL
       GROUP BY direction ORDER BY cnt DESC`
    );
    const directions = directionCounts.length ? directionCounts[0].values.map(r => ({
      direction: r[0], count: r[1],
      label: r[0] === 'суставная_разминка' ? 'Суставная разминка' : 'Занятие в потоке'
    })) : [];
    res.json({ zones, directions });
  } catch {
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

router.get('/recommendations', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    const excludeWatched = req.query.exclude_watched !== 'false';
    const recommendations = await recommendationService.getRecommendations(req.user.id, { limit, excludeWatched });
    analyticsService.trackEvent({ eventName: 'recommendation_viewed', userId: req.user.id, metadata: { count: recommendations.length }, ipAddress: req.ip }).catch(() => {});
    res.json({ recommendations });
  } catch {
    res.status(500).json({ error: 'Failed to load recommendations' });
  }
});

router.post('/workout-feedback', authMiddleware, async (req, res) => {
  try {
    const { lesson_id, mood } = req.body;
    const lessonId = Number(lesson_id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ error: 'Invalid lesson_id' });
    }
    const validMoods = ['happy', 'energized', 'calm', 'neutral', 'tired', 'disappointed'];
    if (!validMoods.includes(mood)) {
      return res.status(400).json({ error: 'Invalid mood. Must be one of: ' + validMoods.join(', ') });
    }
    const db = await getDb();
    db.run(
      `INSERT INTO workout_feedback (subscriber_id, lesson_id, mood) VALUES (?, ?, ?)
       ON CONFLICT(subscriber_id, lesson_id) DO UPDATE SET mood=?, created_at=CURRENT_TIMESTAMP`,
      [req.user.id, lessonId, mood, mood]
    );
    saveDb();
    analyticsService.trackEvent({ eventName: 'feedback_submitted', userId: req.user.id, entity: 'lessons', entityId: lessonId, metadata: { mood }, ipAddress: req.ip }).catch(() => {});
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

router.get('/workout-feedback', authMiddleware, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const db = await getDb();
    const { days } = req.query;
    const numDays = Math.min(Math.max(parseInt(days, 10) || 7, 1), 90);
    const since = new Date();
    since.setDate(since.getDate() - numDays);
    const sinceStr = since.toISOString().slice(0, 10);
    const offset = (page - 1) * limit;
    const countResult = db.exec(
      `SELECT COUNT(*) FROM workout_feedback WHERE subscriber_id = ? AND created_at >= ?`,
      [req.user.id, sinceStr]
    );
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    const result = db.exec(
      `SELECT wf.lesson_id, wf.mood, wf.created_at, l.title
       FROM workout_feedback wf
       JOIN lessons l ON wf.lesson_id = l.id
       WHERE wf.subscriber_id = ? AND wf.created_at >= ?
       ORDER BY wf.created_at DESC LIMIT ? OFFSET ?`,
      [req.user.id, sinceStr, limit, offset]
    );
    const items = result.length ? result[0].values.map(r => ({
      lesson_id: r[0], mood: r[1], created_at: r[2], title: r[3]
    })) : [];
    res.json({
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    res.status(500).json({ error: 'Failed to load feedback' });
  }
});

router.get('/workout-feedback/:lessonId', authMiddleware, async (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }
    const db = await getDb();
    const result = db.exec(
      `SELECT mood, created_at FROM workout_feedback WHERE subscriber_id = ? AND lesson_id = ?`,
      [req.user.id, lessonId]
    );
    if (!result.length || !result[0].values.length) {
      return res.json({ mood: null });
    }
    res.json({ mood: result[0].values[0][0], created_at: result[0].values[0][1] });
  } catch {
    res.status(500).json({ error: 'Failed to load feedback' });
  }
});

router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const userResult = db.exec(
      `SELECT name, plan, status, free_sessions_used FROM subscribers WHERE id = ?`, [req.user.id]
    );
    const user = userResult.length && userResult[0].values.length ? {
      name: userResult[0].values[0][0],
      plan: userResult[0].values[0][1],
      status: userResult[0].values[0][2],
      free_sessions_used: userResult[0].values[0][3] || 0,
    } : null;

    const progressResult = db.exec(
      `SELECT wl.lesson_id, wl.position_seconds, wl.completed, wl.watched_at, l.title, l.duration, l.video_url
       FROM watched_lessons wl JOIN lessons l ON wl.lesson_id = l.id
       WHERE wl.subscriber_id = ? ORDER BY wl.watched_at DESC`, [req.user.id]
    );
    const progress = progressResult.length ? progressResult[0].values.map(r => ({
      lesson_id: r[0], position_seconds: r[1], completed: r[2],
      watched_at: r[3], title: r[4], duration: r[5], video_url: r[6],
    })) : [];

    const lastWatched = progress.find(p => p.position_seconds > 0 && !p.completed) || null;
    const completedCount = progress.filter(p => p.completed).length;

    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    const scheduleResult = db.exec(
      `SELECT s.date, s.theme, s.lesson_id, l.title, l.duration, l.is_free
       FROM schedule s LEFT JOIN lessons l ON s.lesson_id = l.id
       WHERE s.date >= ? ORDER BY s.date LIMIT 7`, [todayStr]
    );
    const schedule = scheduleResult.length ? scheduleResult[0].values.map(r => ({
      date: r[0], theme: r[1], lesson_id: r[2], title: r[3], duration: r[4], is_free: r[5],
    })) : [];
    const todaySchedule = schedule.find(s => s.date === todayStr) || null;

    const lessonsResult = db.exec(
      `SELECT id, title, duration, is_free, tags, direction FROM lessons WHERE status='active' ORDER BY date DESC`
    );
    const lessonCount = lessonsResult.length ? lessonsResult[0].values.length : 0;

    const zoneCounts = db.exec(
      `SELECT lz.zone, COUNT(DISTINCT lz.lesson_id) as cnt
       FROM lesson_zones lz JOIN lessons l ON lz.lesson_id = l.id AND l.status='active'
       GROUP BY lz.zone ORDER BY cnt DESC`
    );
    const zoneCount = zoneCounts.length ? zoneCounts[0].values.length : 0;

    const programsResult = db.exec(
      `SELECT c.id, c.name, c.description, c.image_url, COUNT(DISTINCT cl.lesson_id) as lesson_count
       FROM complexes c LEFT JOIN complex_lessons cl ON cl.complex_id = c.id
       LEFT JOIN lessons l ON cl.lesson_id = l.id AND l.status = 'active'
       GROUP BY c.id ORDER BY lesson_count DESC`
    );
    const programs = programsResult.length ? programsResult[0].values.map(r => ({
      id: r[0], name: r[1], description: r[2], image_url: r[3], lesson_count: r[4],
    })) : [];

    res.json({ user, lastWatched, completedCount, todaySchedule, schedule, lessonCount, zoneCount, programs });
  } catch {
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

/* ── Free Lesson Selection (trial users pick 7 lessons) ── */

router.get('/free-selections', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(
      `SELECT fls.lesson_id, l.title, l.duration, l.description, l.video_url, l.is_free
       FROM free_lesson_selections fls
       JOIN lessons l ON fls.lesson_id = l.id
       WHERE fls.subscriber_id = ? ORDER BY fls.selected_at`,
      [req.user.id]
    );
    const selections = result.length ? result[0].values.map(r => ({
      lesson_id: r[0], title: r[1], duration: r[2], description: r[3], video_url: r[4], is_free: r[5],
    })) : [];
    res.json({ selections, limit: FREE_LIMIT });
  } catch {
    res.status(500).json({ error: 'Failed to load selections' });
  }
});

router.post('/free-selections', authMiddleware, async (req, res) => {
  try {
    const { lesson_ids } = req.body;
    if (!Array.isArray(lesson_ids)) {
      return res.status(400).json({ error: 'lesson_ids must be an array' });
    }
    if (lesson_ids.length > FREE_LIMIT) {
      return res.status(400).json({ error: 'Maximum ' + FREE_LIMIT + ' lessons allowed' });
    }
    const db = await getDb();
    const userResult = db.exec(`SELECT plan FROM subscribers WHERE id = ?`, [req.user.id]);
    const plan = userResult.length && userResult[0].values.length ? userResult[0].values[0][0] : 'trial';
    if (plan === 'annual' || plan === 'monthly') {
      return res.status(400).json({ error: 'Subscribers with active plans do not need selections' });
    }
    const validIds = [...new Set(lesson_ids.map(Number).filter(id => Number.isInteger(id) && id > 0))];
    await transaction(async () => {
      db.run(`DELETE FROM free_lesson_selections WHERE subscriber_id = ?`, [req.user.id]);
      for (const lessonId of validIds) {
        db.run(
          `INSERT OR IGNORE INTO free_lesson_selections (subscriber_id, lesson_id) VALUES (?, ?)`,
          [req.user.id, lessonId]
        );
      }
    });
    saveDb();
    analyticsService.trackEvent({ eventName: 'free_lesson_selected', userId: req.user.id, entity: 'lessons', metadata: { count: validIds.length }, ipAddress: req.ip }).catch(() => {});
    res.json({ success: true, count: validIds.length, limit: FREE_LIMIT });
  } catch {
    res.status(500).json({ error: 'Failed to save selections' });
  }
});

/* ── Device Fingerprint (anti-abuse) ── */

router.post('/fingerprint', authMiddleware, async (req, res) => {
  try {
    const { fingerprint } = req.body;
    if (!fingerprint) return res.status(400).json({ error: 'fingerprint required' });
    if (typeof fingerprint !== 'string' || fingerprint.length > 200) return res.status(400).json({ error: 'Invalid fingerprint' });
    const db = await getDb();
    const ipAddr = req.ip || req.connection.remoteAddress || '';

    db.run(
      `INSERT INTO device_fingerprints (fingerprint, ip_address, subscriber_id) VALUES (?, ?, ?)`,
      [fingerprint, ipAddr, req.user.id]
    );

    const dupResult = db.exec(
      `SELECT d.subscriber_id, s.free_sessions_used, s.plan, s.status
       FROM device_fingerprints d
       JOIN subscribers s ON s.id = d.subscriber_id
       WHERE d.fingerprint = ? AND d.subscriber_id != ?`,
      [fingerprint, req.user.id]
    );

    let accountsFromThisDevice = 1;
    let otherAccounts = [];
    if (dupResult.length && dupResult[0].values.length) {
      const rows = dupResult[0].values;
      const uniqueIds = [...new Set(rows.map(r => r[0]))];
      accountsFromThisDevice = uniqueIds.length + 1;
      otherAccounts = rows.map(r => ({
        subscriber_id: r[0],
        free_sessions_used: r[1] || 0,
        plan: r[2],
        status: r[3]
      }));
    }

    saveDb();
    res.json({ success: true, accountsFromThisDevice, otherAccounts });
  } catch {
    res.status(500).json({ error: 'Failed to save fingerprint' });
  }
});

router.get('/data-export', authMiddleware, requireRole('subscriber'), async (req, res) => {
  try {
    const db = await getDb();
    const profile = queryToObjects(db.exec(`SELECT id, email, name, plan, status, free_sessions_used, subscription_started_at, joined_at FROM subscribers WHERE id = ?`, [req.user.id]));
    const watched = queryToObjects(db.exec(`SELECT wl.lesson_id, wl.position_seconds, wl.completed, wl.watched_at FROM watched_lessons wl WHERE wl.subscriber_id = ?`, [req.user.id]));
    const feedback = queryToObjects(db.exec(`SELECT lesson_id, mood, created_at FROM workout_feedback WHERE subscriber_id = ?`, [req.user.id]));
    const tickets = queryToObjects(db.exec(`SELECT id, category, subject, status, created_at FROM tickets WHERE subscriber_id = ?`, [req.user.id]));
    const selections = queryToObjects(db.exec(`SELECT lesson_id, selected_at FROM free_lesson_selections WHERE subscriber_id = ?`, [req.user.id]));
    const prefs = queryToObjects(db.exec(`SELECT experience, goals, preferred_duration, preferred_time FROM user_preferences WHERE subscriber_id = ?`, [req.user.id]));

    res.json({
      export_date: new Date().toISOString(),
      profile: profile[0] || {},
      watched_lessons: watched,
      workout_feedback: feedback,
      tickets: tickets,
      free_lesson_selections: selections,
      preferences: prefs[0] || {},
    });
  } catch {
    res.status(500).json({ error: 'Export failed' });
  }
});

router.delete('/account', authMiddleware, requireRole('subscriber'), requireDangerousActionConfirmation, async (req, res) => {
  try {
    const db = await getDb();
    db.run(`UPDATE subscribers SET name = 'Deleted User', email = 'deleted_' || id || '@anonymized.local', plan = 'trial', status = 'inactive', stripe_customer_id = NULL, stripe_subscription_id = NULL, subscription_expires_at = NULL WHERE id = ?`, [req.user.id]);
    db.run(`DELETE FROM user_preferences WHERE subscriber_id = ?`, [req.user.id]);
    db.run(`DELETE FROM device_fingerprints WHERE subscriber_id = ?`, [req.user.id]);
    db.run(`DELETE FROM watched_lessons WHERE subscriber_id = ?`, [req.user.id]);
    db.run(`DELETE FROM workout_feedback WHERE subscriber_id = ?`, [req.user.id]);
    db.run(`DELETE FROM free_lesson_selections WHERE subscriber_id = ?`, [req.user.id]);
    db.run(`DELETE FROM manual_access_grants WHERE subscriber_id = ?`, [req.user.id]);
    db.run(`UPDATE tickets SET subject = '[deleted]', category = 'admin' WHERE subscriber_id = ?`, [req.user.id]);
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(req.token);
    const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000).toISOString() : new Date(Date.now() + 86400000).toISOString();
    revokeToken(hashToken(req.token), expiresAt);
    saveDb();
    res.json({ success: true, message: 'Account anonymized and deleted' });
  } catch {
    res.status(500).json({ error: 'Account deletion failed' });
  }
});

/* ── i18n: detect language by IP ── */
router.get('/detect-language', async (req, res) => {
  try {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip;
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
      return res.json({ language: 'ru', source: 'localhost' });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const resp = await fetch('http://ip-api.com/json/' + encodeURIComponent(ip) + '?fields=countryCode', { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) return res.json({ language: 'ru', source: 'api_error' });
      const data = await resp.json();
      const lang = RUSSIAN_COUNTRIES.includes(data.countryCode) ? 'ru' : 'en';
      res.json({ language: lang, country: data.countryCode, source: 'ip' });
    } catch {
      clearTimeout(timeout);
      res.json({ language: 'ru', source: 'timeout' });
    }
  } catch {
    res.json({ language: 'ru', source: 'error' });
  }
});

/* ── i18n: save language preference ── */
router.put('/language', authMiddleware, requireRole('subscriber'), async (req, res) => {
  try {
    const { language } = req.body;
    if (!language || !VALID_LANGUAGES.includes(language)) {
      return res.status(400).json({ error: 'Invalid language. Supported: ' + VALID_LANGUAGES.join(', ') });
    }
    const db = await getDb();
    db.run(`UPDATE subscribers SET preferred_language = ? WHERE id = ?`, [language, req.user.id]);
    saveDb();
    res.json({ success: true, language });
  } catch {
    res.status(500).json({ error: 'Failed to save language preference' });
  }
});

module.exports = router;
module.exports.FREE_LIMIT = FREE_LIMIT;
