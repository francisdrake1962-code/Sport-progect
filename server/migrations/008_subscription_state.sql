-- 008_subscription_state.sql
-- PAY-001: subscription state machine adds the `past_due` state.
-- SQLite cannot alter a CHECK constraint, so the subscribers table is recreated
-- inside a single transaction. The migration runner disables foreign_keys for
-- the duration of the migration (DROP TABLE would otherwise cascade), data is
-- copied 1:1, and the three subscribers indexes are restored afterwards.

CREATE TABLE subscribers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  plan TEXT DEFAULT 'trial' CHECK(plan IN ('trial', 'annual', 'monthly')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'trial', 'inactive', 'suspended', 'expired', 'cancelled', 'past_due')),
  email_confirmed INTEGER DEFAULT 0,
  confirmation_token TEXT,
  free_sessions_used INTEGER DEFAULT 0,
  subscription_started_at DATETIME,
  next_billing_date DATETIME,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  subscription_expires_at DATETIME,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  preferred_language TEXT DEFAULT 'ru'
);

INSERT INTO subscribers_new (
  id, name, email, password, plan, status, email_confirmed, confirmation_token,
  free_sessions_used, subscription_started_at, next_billing_date, joined_at,
  subscription_expires_at, stripe_customer_id, stripe_subscription_id,
  preferred_language
) SELECT
  id, name, email, password, plan, status, email_confirmed, confirmation_token,
  free_sessions_used, subscription_started_at, next_billing_date, joined_at,
  subscription_expires_at, stripe_customer_id, stripe_subscription_id,
  preferred_language
FROM subscribers;

DROP TABLE subscribers;

ALTER TABLE subscribers_new RENAME TO subscribers;

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_plan ON subscribers(plan);
