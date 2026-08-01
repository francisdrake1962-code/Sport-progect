const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDb, saveDb, revokeToken } = require('../db');
const { generateToken, hashToken, JWT_SECRET } = require('../auth');
const { UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, ValidationError, AppError } = require('../helpers/errors');
const { createLogger } = require('../helpers/logger');

const logger = createLogger('auth-service');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // AUTH-001: reset link valid for 1 hour

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function loginAdmin(email, password) {
  if (!email || !password) throw new ValidationError('Email and password required');
  const db = await getDb();
  const result = db.exec(`SELECT id, email, password, name, role FROM users WHERE email = ?`, [email]);
  if (!result.length || !result[0].values.length) throw new UnauthorizedError('Invalid credentials');
  const row = result[0].values[0];
  const user = { id: row[0], email: row[1], password: row[2], name: row[3], role: row[4] };
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new UnauthorizedError('Invalid credentials');
  const token = generateToken(user);
  logger.info('Admin login', { userId: user.id, email: user.email });
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

async function getAdminProfile(userId) {
  const db = await getDb();
  const result = db.exec(`SELECT id, email, name, role FROM users WHERE id = ?`, [userId]);
  if (!result.length || !result[0].values.length) throw new NotFoundError('User');
  const row = result[0].values[0];
  return { id: row[0], email: row[1], name: row[2], role: row[3] };
}

async function changeAdminPassword(userId, token, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) throw new ValidationError('Current and new password required');
  if (newPassword.length < 8) throw new ValidationError('New password must be at least 8 characters');
  const db = await getDb();
  const result = db.exec(`SELECT password FROM users WHERE id = ?`, [userId]);
  if (!result.length) throw new NotFoundError('User');
  const currentHash = result[0].values[0][0];
  const valid = await bcrypt.compare(currentPassword, currentHash);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');
  const newHash = await bcrypt.hash(newPassword, 10);
  db.run(`UPDATE users SET password = ? WHERE id = ?`, [newHash, userId]);
  revokeCurrentToken(token);
  saveDb();
  logger.info('Admin password changed', { userId });
  return { success: true };
}

function revokeCurrentToken(token) {
  if (!token) return;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const expiresAt = new Date(decoded.exp * 1000).toISOString();
    revokeToken(hashToken(token), expiresAt);
  } catch {}
}

async function registerSubscriber(name, email, password) {
  if (!name || !email || !password) throw new ValidationError('name, email, password required');
  if (!name.trim()) throw new ValidationError('Name is required');
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new ValidationError('Invalid email format');
  if (password.length < 8) throw new ValidationError('Password must be at least 8 characters');

  const db = await getDb();
  const existing = db.exec(`SELECT id FROM subscribers WHERE email = ?`, [normalizedEmail]);
  if (existing.length && existing[0].values.length) throw new ConflictError('Email already registered');

  const hash = await bcrypt.hash(password, 10);
  const crypto = require('crypto');
  const confirmToken = crypto.randomBytes(32).toString('hex');
  const isConsole = !process.env.MAIL_PROVIDER || process.env.MAIL_PROVIDER === 'console';
  db.run(
    `INSERT INTO subscribers (name, email, password, confirmation_token, email_confirmed, free_sessions_used, status) VALUES (?, ?, ?, ?, ?, 0, 'trial')`,
    [name.trim(), normalizedEmail, hash, confirmToken, isConsole ? 1 : 0]
  );
  saveDb();
  logger.info('Subscriber registered', { email: normalizedEmail });
  const response = { success: true };
  if (isConsole) response.confirmation_token = confirmToken;
  return response;
}

async function loginSubscriber(email, password) {
  if (!email || !password) throw new ValidationError('Email and password required');
  const db = await getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const result = db.exec(
    `SELECT id, email, password, name, plan, status, free_sessions_used, email_confirmed, token_version FROM subscribers WHERE email = ?`,
    [normalizedEmail]
  );
  if (!result.length || !result[0].values.length) throw new UnauthorizedError('Invalid credentials');
  const row = result[0].values[0];
  const user = { id: row[0], email: row[1], password: row[2], name: row[3], plan: row[4], status: row[5], free_sessions_used: row[6], email_confirmed: row[7], token_version: row[8] || 0 };
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new UnauthorizedError('Invalid credentials');
  if (!user.email_confirmed) {
    const tokenResult = db.exec(`SELECT confirmation_token FROM subscribers WHERE email = ?`, [normalizedEmail]);
    const confirmationToken = (tokenResult.length && tokenResult[0].values.length) ? tokenResult[0].values[0][0] : null;
    if (process.env.MAIL_PROVIDER === 'console' && confirmationToken) {
      logger.info(`Confirmation link: http://localhost:${process.env.PORT || 3000}/api/user/confirm/${confirmationToken}`);
    }
    throw new ForbiddenError('Подтвердите email перед входом', 'EMAIL_CONFIRMATION_REQUIRED');
  }
  const token = generateToken({ id: user.id, email: user.email, role: 'subscriber', ver: user.token_version || 0 });
  return { token, user: { id: user.id, email: user.email, name: user.name, plan: user.plan, status: user.status, free_sessions_used: user.free_sessions_used } };
}

// AUTH-001: request a password reset. The response is identical whether or not
// the email exists, so the endpoint cannot be used to enumerate subscribers.
async function requestPasswordReset(email) {
  if (!email) return { success: true };
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { success: true };

  const db = await getDb();
  const result = db.exec(`SELECT id, name FROM subscribers WHERE email = ?`, [normalizedEmail]);
  if (!result.length || !result[0].values.length) return { success: true };

  const subscriberId = result[0].values[0][0];
  const resetToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(resetToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  db.run(
    `UPDATE subscribers SET password_reset_token = ?, password_reset_expires_at = ? WHERE id = ?`,
    [tokenHash, expiresAt, subscriberId]
  );
  saveDb();

  const { sendPasswordResetEmail } = require('./mailer');
  await sendPasswordResetEmail(normalizedEmail, resetToken);
  logger.info('Password reset requested', { subscriberId });
  return { success: true };
}

// AUTH-001: redeem a one-time reset token, change the password and bump the
// session version so every previously issued JWT is rejected.
async function resetPassword(token, newPassword) {
  if (!token) throw new AppError('INVALID_RESET_TOKEN', 'Invalid or expired reset token', 400);
  if (!newPassword || newPassword.length < 8) throw new ValidationError('Password must be at least 8 characters');

  const db = await getDb();
  const result = db.exec(
    `SELECT id, password_reset_expires_at FROM subscribers WHERE password_reset_token = ?`,
    [hashResetToken(token)]
  );
  if (!result.length || !result[0].values.length) throw new AppError('INVALID_RESET_TOKEN', 'Invalid or expired reset token', 400);
  const subscriberId = result[0].values[0][0];
  const expiresAt = result[0].values[0][1];
  if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
    throw new AppError('INVALID_RESET_TOKEN', 'Invalid or expired reset token', 400);
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  db.run(
    `UPDATE subscribers SET password = ?, password_reset_token = NULL, password_reset_expires_at = NULL, token_version = token_version + 1 WHERE id = ?`,
    [newHash, subscriberId]
  );
  saveDb();
  logger.info('Password reset completed', { subscriberId });
  return { success: true };
}

module.exports = {
  loginAdmin,
  getAdminProfile,
  changeAdminPassword,
  registerSubscriber,
  loginSubscriber,
  requestPasswordReset,
  resetPassword,
  revokeCurrentToken,
};
