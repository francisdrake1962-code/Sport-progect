const { sendError } = require('../helpers/errors');

function validateBody(rules) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, opts] of Object.entries(rules)) {
      const value = req.body[field];
      if (opts.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      if (value === undefined || value === null) continue;
      if (opts.type === 'string' && typeof value !== 'string') {
        errors.push(`${field} must be a string`);
      }
      if (opts.type === 'number' && typeof value !== 'number') {
        errors.push(`${field} must be a number`);
      }
      if (opts.type === 'array' && !Array.isArray(value)) {
        errors.push(`${field} must be an array`);
      }
      if (opts.minLength && typeof value === 'string' && value.length < opts.minLength) {
        errors.push(`${field} must be at least ${opts.minLength} characters`);
      }
      if (opts.maxLength && typeof value === 'string' && value.length > opts.maxLength) {
        errors.push(`${field} must be at most ${opts.maxLength} characters`);
      }
      if (opts.min !== undefined && typeof value === 'number' && value < opts.min) {
        errors.push(`${field} must be at least ${opts.min}`);
      }
      if (opts.max !== undefined && typeof value === 'number' && value > opts.max) {
        errors.push(`${field} must be at most ${opts.max}`);
      }
      if (opts.enum && !opts.enum.includes(value)) {
        errors.push(`${field} must be one of: ${opts.enum.join(', ')}`);
      }
      if (opts.pattern && typeof value === 'string' && !opts.pattern.test(value)) {
        errors.push(`${field} has invalid format`);
      }
    }
    if (errors.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Validation failed: ' + errors.join('; '), req.requestId, { details: errors });
    }
    next();
  };
}

module.exports = { validateBody };
