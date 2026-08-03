const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { isTokenRevoked } = require('./db');
const { sendError } = require('./helpers/errors');

const _fallbackSecret = crypto.randomBytes(32).toString('hex');
function getJwtSecret() {
  return process.env.JWT_SECRET || _fallbackSecret;
}

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set. Using random secret. Tokens will not survive server restarts.');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return sendError(res, 401, 'NO_TOKEN', 'No token provided', req.requestId);
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    try {
      if (isTokenRevoked(hashToken(token))) {
        return sendError(res, 401, 'TOKEN_REVOKED', 'Token has been revoked', req.requestId);
      }
    } catch {
      return sendError(res, 401, 'AUTH_SERVICE_UNAVAILABLE', 'Auth service unavailable', req.requestId);
    }
    // AUTH-001: subscriber JWTs carry the session version (`ver`). When the
    // password is reset the version is bumped, so any token issued before the
    // reset no longer matches and old sessions are rejected.
    if (decoded.role === 'subscriber' && typeof decoded.ver === 'number') {
      try {
        const { getDb } = require('./db');
        const db = await getDb();
        const result = db.exec(`SELECT token_version FROM subscribers WHERE id = ?`, [decoded.id]);
        const currentVersion = result.length && result[0].values.length ? result[0].values[0][0] : null;
        if (currentVersion !== null && currentVersion !== decoded.ver) {
          return sendError(res, 401, 'TOKEN_REVOKED', 'Token has been revoked', req.requestId);
        }
      } catch {
        return sendError(res, 401, 'AUTH_SERVICE_UNAVAILABLE', 'Auth service unavailable', req.requestId);
      }
    }
    req.user = decoded;
    req.token = token;
    next();
  } catch {
    return sendError(res, 401, 'INVALID_TOKEN', 'Invalid token', req.requestId);
  }
}

function generateToken(user) {
  const payload = { id: user.id, email: user.email, role: user.role, jti: crypto.randomUUID() };
  if (user.ver !== undefined) payload.ver = user.ver;
  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: '24h' });
}

const ADMIN_COOKIE_NAME = 'qigong_admin_token';

// Reads the admin JWT from either the Authorization header or the httpOnly
// cookie, so admin pages work both for the SPA (header) and for plain browser
// navigation to /admin/* (cookie).
function getAdminTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE_NAME}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

function setAdminCookie(res, token) {
  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
}

function isAdminTokenValid(token) {
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (decoded.role !== 'admin' && decoded.role !== 'super_admin') return false;
    if (isTokenRevoked(hashToken(token))) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  authMiddleware,
  generateToken,
  get JWT_SECRET() { return getJwtSecret(); },
  hashToken,
  getAdminTokenFromRequest,
  setAdminCookie,
  clearAdminCookie,
  isAdminTokenValid,
};
