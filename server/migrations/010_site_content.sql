-- 010_site_content.sql
-- CONTENT-001: editable text blocks for static pages (about-trainer, terms,
-- refund, privacy, contact, etc). Text defaults are seeded by server/db.js
-- from src/pages/*.html on a fresh database. Admins edit them via the admin
-- panel and the public pages render the DB version (falling back to the
-- static HTML when no record exists).
CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT,
  meta_title TEXT,
  meta_description TEXT,
  content TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
