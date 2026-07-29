const REQUIRED_IN_PRODUCTION = [
  'JWT_SECRET',
  'ALLOWED_ORIGIN',
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_PASSWORD',
];

class ConfigError extends Error {
  constructor(errors) {
    super(`Configuration validation failed: ${errors.join('; ')}`);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

function validateConfig() {
  const env = process.env.NODE_ENV;
  if (env === 'test') return { valid: true, warnings: [] };

  const warnings = [];
  const errors = [];

  if (env === 'production') {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) {
        errors.push(`Missing required env var: ${key}`);
      }
    }
    if (process.env.BOOTSTRAP_ADMIN_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.BOOTSTRAP_ADMIN_EMAIL)) {
      errors.push('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
    }
    if (process.env.BOOTSTRAP_ADMIN_PASSWORD && process.env.BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
      errors.push('BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters');
    }
  } else {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) {
        warnings.push(`Env var not set: ${key} (required in production)`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ConfigError(errors);
  }

  if (warnings.length > 0) {
    console.warn('CONFIG WARNINGS:');
    warnings.forEach(w => console.warn(`  ${w}`));
  }

  return { valid: true, warnings };
}

module.exports = { validateConfig, ConfigError };
