const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getDb, saveDb } = require('../db');
const { authMiddleware, generateToken } = require('../auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 100,
  message: { error: 'Too many login attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const db = await getDb();
    const result = db.exec(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!result.length || !result[0].values.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = {
      id: result[0].values[0][0],
      email: result[0].values[0][1],
      password: result[0].values[0][2],
      name: result[0].values[0][3],
      role: result[0].values[0][4],
    };
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`SELECT id, email, name, role FROM users WHERE id = ?`, [req.user.id]);
    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: result[0].values[0][0],
      email: result[0].values[0][1],
      name: result[0].values[0][2],
      role: result[0].values[0][3],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const db = await getDb();
    const result = db.exec(`SELECT password FROM users WHERE id = ?`, [req.user.id]);
    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const currentHash = result[0].values[0][0];
    const valid = await bcrypt.compare(currentPassword, currentHash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    db.run(`UPDATE users SET password = ? WHERE id = ?`, [newHash, req.user.id]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
