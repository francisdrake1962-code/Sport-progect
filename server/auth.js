const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { isTokenRevoked } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

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
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    try {
      if (isTokenRevoked(hashToken(token))) {
        return res.status(401).json({ error: 'Token has been revoked' });
      }
    } catch (_) {
      return res.status(401).json({ error: 'Auth service unavailable' });
    }
    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti: crypto.randomUUID() },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '24h' }
  );
}

module.exports = { authMiddleware, generateToken, JWT_SECRET, hashToken };
