-- 009_password_reset.sql
-- AUTH-001: password reset adds a one-time token with TTL plus a session
-- version used to reject old JWTs after the password changes. The migration
-- runner tolerates "duplicate column" for ALTER TABLE, so this is safe to
-- re-run against schemas that already contain the columns (base schema in
-- server/db.js keeps the same three columns).
ALTER TABLE subscribers ADD COLUMN password_reset_token TEXT;
ALTER TABLE subscribers ADD COLUMN password_reset_expires_at DATETIME;
ALTER TABLE subscribers ADD COLUMN token_version INTEGER DEFAULT 0;
