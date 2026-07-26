const crypto = require('crypto');

function requestIdMiddleware(req, res, next) {
  req.requestId = req.headers['x-request-id'] || `req_${crypto.randomUUID().slice(0, 12)}`;
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = { requestIdMiddleware };
