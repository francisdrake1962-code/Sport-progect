const { validateConfig, ConfigError } = require('../server/helpers/config');

describe('production configuration', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  test('rejects production startup without bootstrap administrator credentials', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(64),
      ALLOWED_ORIGIN: 'https://app.example.com',
    };

    expect(() => validateConfig()).toThrow(ConfigError);
    expect(() => validateConfig()).toThrow('BOOTSTRAP_ADMIN_EMAIL');
    expect(() => validateConfig()).toThrow('BOOTSTRAP_ADMIN_PASSWORD');
  });

  test('accepts production configuration with explicit bootstrap administrator credentials', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(64),
      ALLOWED_ORIGIN: 'https://app.example.com',
      BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'a-strong-password',
    };

    expect(validateConfig()).toEqual({ valid: true, warnings: [] });
  });

  test('rejects a weak bootstrap administrator password', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(64),
      ALLOWED_ORIGIN: 'https://app.example.com',
      BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'too-short',
    };

    expect(() => validateConfig()).toThrow('at least 12 characters');
  });
});
