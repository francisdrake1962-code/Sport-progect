const REQUIRED_IN_PRODUCTION = [
  'JWT_SECRET',
  'ALLOWED_ORIGIN',
];

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
  } else {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) {
        warnings.push(`Env var not set: ${key} (required in production)`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('CONFIG VALIDATION FAILED:');
    errors.forEach(e => console.error(`  FATAL: ${e}`));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('CONFIG WARNINGS:');
    warnings.forEach(w => console.warn(`  ${w}`));
  }

  return { valid: true, warnings };
}

module.exports = { validateConfig };
