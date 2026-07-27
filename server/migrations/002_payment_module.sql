-- 002_payment_module.sql
-- Stripe recurring subscription module

-- New columns on subscribers
ALTER TABLE subscribers ADD COLUMN subscription_expires_at DATETIME;
ALTER TABLE subscribers ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE subscribers ADD COLUMN stripe_subscription_id TEXT;

-- payments: one row per successful or failed payment
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'succeeded', 'failed', 'refunded')),
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_checkout_session_id TEXT,
  provider_payment_intent_id TEXT,
  provider_customer_id TEXT,
  plan TEXT NOT NULL CHECK(plan IN ('monthly', 'annual')),
  paid_at DATETIME,
  failure_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_subscriber ON payments(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);

-- payment_events: webhook idempotency
CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- manual_access_grants: admin grant/revoke with audit
CREATE TABLE IF NOT EXISTS manual_access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  subscriber_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('grant', 'revoke')),
  reason TEXT,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manual_grants_subscriber ON manual_access_grants(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_manual_grants_created ON manual_access_grants(created_at);
