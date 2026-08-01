class AppError extends Error {
  constructor(code, message, statusCode = 500, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super('NOT_FOUND', `${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Admin access required', machineCode = null) {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
    this.machineCode = machineCode;
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super('CONFLICT', message, 409);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super('RATE_LIMITED', message, 429);
    this.name = 'RateLimitError';
  }
}

class PayloadTooLargeError extends AppError {
  constructor(message = 'Request body too large') {
    super('PAYLOAD_TOO_LARGE', message, 413);
    this.name = 'PayloadTooLargeError';
  }
}

function formatSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

function formatError(res, error, requestId = null) {
  const body = {
    success: false,
    error: {
      code: error.machineCode || error.code || 'INTERNAL_ERROR',
      message: error.message || 'Internal server error',
    },
  };
  if (error.details) body.error.details = error.details;
  if (requestId) {
    body.requestId = requestId;
    body.error.requestId = requestId;
  }
  return res.status(error.statusCode || 500).json(body);
}

// API-001: unified error shape for endpoints that reply inline (gates,
// validations). Keeps `error` at the top level (transition for old clients)
// and mirrors the canonical code in `error.code`; extra fields (e.g. the
// API-003 top-level `code` on gate denials) can be passed through `extra`.
function sendError(res, statusCode, code, message, requestId = null, extra = null) {
  const body = { success: false, error: { code, message } };
  if (requestId) {
    body.requestId = requestId;
    body.error.requestId = requestId;
  }
  if (extra) Object.assign(body, extra);
  return res.status(statusCode).json(body);
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  PayloadTooLargeError,
  formatSuccess,
  formatError,
  sendError,
};
