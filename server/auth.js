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

function authMiddleware(req, res, next) {
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
    req.user = decoded;
    req.token = token;
    next();
  } catch {
    return sendError(res, 401, 'INVALID_TOKEN', 'Invalid token', req.requestId);
  }
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti: crypto.randomUUID() },
    getJwtSecret(),
    { algorithm: 'HS256', expiresIn: '24h' }
  );
}

module.exports = { authMiddleware, generateToken, get JWT_SECRET() { return getJwtSecret(); }, hashToken };
