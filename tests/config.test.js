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
      STRIPE_SECRET_KEY: 'placeholder_sk_key_for_tests',
      STRIPE_WEBHOOK_SECRET: 'placeholder_whsec_key_for_tests',
      STRIPE_MONTHLY_PRICE_ID: 'price_monthly_test',
      STRIPE_ANNUAL_PRICE_ID: 'price_annual_test',
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

  test('rejects production startup without Stripe credentials', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(64),
      ALLOWED_ORIGIN: 'https://app.example.com',
      BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'a-strong-password',
    };

    expect(() => validateConfig()).toThrow(ConfigError);
    expect(() => validateConfig()).toThrow('STRIPE_SECRET_KEY');
    expect(() => validateConfig()).toThrow('STRIPE_WEBHOOK_SECRET');
  });

  test('rejects production startup with only one Stripe credential', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(64),
      ALLOWED_ORIGIN: 'https://app.example.com',
      BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'a-strong-password',
      STRIPE_SECRET_KEY: 'placeholder_sk_key_for_tests',
    };

    expect(() => validateConfig()).toThrow(ConfigError);
    expect(() => validateConfig()).toThrow('STRIPE_WEBHOOK_SECRET');
  });

  test('rejects production startup without Stripe Price IDs', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(64),
      ALLOWED_ORIGIN: 'https://app.example.com',
      BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'a-strong-password',
      STRIPE_SECRET_KEY: 'placeholder_sk_key_for_tests',
      STRIPE_WEBHOOK_SECRET: 'placeholder_whsec_key_for_tests',
    };

    expect(() => validateConfig()).toThrow(ConfigError);
    expect(() => validateConfig()).toThrow('STRIPE_MONTHLY_PRICE_ID');
    expect(() => validateConfig()).toThrow('STRIPE_ANNUAL_PRICE_ID');
  });

  test('rejects partially configured Mux credentials in production', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(64),
      ALLOWED_ORIGIN: 'https://app.example.com',
      BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'a-strong-password',
      STRIPE_SECRET_KEY: 'placeholder_sk_key_for_tests',
      STRIPE_WEBHOOK_SECRET: 'placeholder_whsec_key_for_tests',
      STRIPE_MONTHLY_PRICE_ID: 'price_monthly_test',
      STRIPE_ANNUAL_PRICE_ID: 'price_annual_test',
      MUX_ACCESS_TOKEN_ID: 'mux-token-id',
    };

    expect(() => validateConfig()).toThrow(ConfigError);
    expect(() => validateConfig()).toThrow('all-or-none');
    expect(() => validateConfig()).toThrow('MUX_ACCESS_TOKEN_SECRET');
  });

  test('accepts a complete Mux credential set in production', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(64),
      ALLOWED_ORIGIN: 'https://app.example.com',
      BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'a-strong-password',
      STRIPE_SECRET_KEY: 'placeholder_sk_key_for_tests',
      STRIPE_WEBHOOK_SECRET: 'placeholder_whsec_key_for_tests',
      STRIPE_MONTHLY_PRICE_ID: 'price_monthly_test',
      STRIPE_ANNUAL_PRICE_ID: 'price_annual_test',
      MUX_ACCESS_TOKEN_ID: 'mux-token-id',
      MUX_ACCESS_TOKEN_SECRET: 'mux-token-secret',
      MUX_SIGNING_KEY_ID: 'mux-signing-kid',
      MUX_SIGNING_KEY: 'mux-signing-secret-0123456789',
    };

    expect(validateConfig()).toEqual({ valid: true, warnings: [] });
  });
});
