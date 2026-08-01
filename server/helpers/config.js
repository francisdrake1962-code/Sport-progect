const REQUIRED_IN_PRODUCTION = [
  'JWT_SECRET',
  'ALLOWED_ORIGIN',
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_PASSWORD',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_MONTHLY_PRICE_ID',
  'STRIPE_ANNUAL_PRICE_ID',
];

// Mux is optional (per-lesson video provider), so the keys are NOT hard-required.
// But they must be all-or-none: a partial set silently breaks only some paths
// (e.g. signed playback works while uploads fail).
const MUX_VARS = [
  'MUX_ACCESS_TOKEN_ID',
  'MUX_ACCESS_TOKEN_SECRET',
  'MUX_SIGNING_KEY_ID',
  'MUX_SIGNING_KEY',
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

    const muxSet = MUX_VARS.filter(key => process.env[key]);
    if (muxSet.length > 0 && muxSet.length < MUX_VARS.length) {
      const missing = MUX_VARS.filter(key => !process.env[key]).join(', ');
      errors.push(`Mux credentials must be all-or-none, missing: ${missing}`);
    }
  } else {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) {
        warnings.push(`Env var not set: ${key} (required in production)`);
      }
    }
    const muxSet = MUX_VARS.filter(key => process.env[key]);
    if (muxSet.length > 0 && muxSet.length < MUX_VARS.length) {
      const missing = MUX_VARS.filter(key => !process.env[key]).join(', ');
      warnings.push(`Mux credentials are partially set, missing: ${missing} (all-or-none)`);
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
