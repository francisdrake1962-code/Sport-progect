const express = require('express');
const rateLimit = require('express-rate-limit');
const { authMiddleware, setAdminCookie, clearAdminCookie } = require('../auth');
const authService = require('../services/auth.service');
const { validateBody } = require('../middleware/validation');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 100,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in 1 minute.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, validateBody({
  email: { required: true, type: 'string', maxLength: 255 },
  password: { required: true, type: 'string', maxLength: 128 },
}), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginAdmin(email, password);
    setAdminCookie(res, result.token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await authService.getAdminProfile(req.user.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authMiddleware, (req, res) => {
  authService.revokeCurrentToken(req.token);
  clearAdminCookie(res);
  res.json({ success: true });
});

router.put('/password', authMiddleware, validateBody({
  currentPassword: { required: true, type: 'string', maxLength: 128 },
  newPassword: { required: true, type: 'string', minLength: 8, maxLength: 128 },
}), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changeAdminPassword(req.user.id, req.token, currentPassword, newPassword);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
