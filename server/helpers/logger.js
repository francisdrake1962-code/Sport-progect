const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')];

function formatMessage(level, component, message, meta = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
  };
  if (meta && Object.keys(meta).length > 0) {
    entry.meta = meta;
  }
  return JSON.stringify(entry);
}

function createLogger(component) {
  return {
    error(message, meta = null) {
      if (currentLevel >= LOG_LEVELS.error) {
        console.error(formatMessage('error', component, message, meta));
      }
    },
    warn(message, meta = null) {
      if (currentLevel >= LOG_LEVELS.warn) {
        console.warn(formatMessage('warn', component, message, meta));
      }
    },
    info(message, meta = null) {
      if (currentLevel >= LOG_LEVELS.info) {
        console.log(formatMessage('info', component, message, meta));
      }
    },
    debug(message, meta = null) {
      if (currentLevel >= LOG_LEVELS.debug) {
        console.log(formatMessage('debug', component, message, meta));
      }
    },
  };
}

function requestLogger(req, res, next) {
  const start = Date.now();
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - start;
    const logger = createLogger('http');
    const meta = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      requestId: req.requestId,
    };
    if (res.statusCode >= 500) {
      logger.error(`${req.method} ${req.originalUrl} ${res.statusCode}`, meta);
    } else if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.originalUrl} ${res.statusCode}`, meta);
    } else {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode}`, meta);
    }
    originalEnd.apply(res, args);
  };
  next();
}

module.exports = { createLogger, requestLogger };
