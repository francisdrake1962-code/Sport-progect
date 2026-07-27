const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'qigong.db');

let db = null;
let initPromise = null;

async function getDb() {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await initSqlJs();

    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    db.run('PRAGMA foreign_keys = ON');

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'subscriber',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS complexes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        image_url TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        duration INTEGER DEFAULT 27,
        status TEXT DEFAULT 'active',
        description TEXT,
        video_url TEXT,
        cf_video_uid TEXT,
        image_url TEXT,
        is_free INTEGER DEFAULT 0,
        free_order INTEGER,
        date TEXT,
        tags TEXT DEFAULT '[]',
        direction TEXT,
        direction_source TEXT DEFAULT 'нет_данных',
        effect_description TEXT,
        effect_is_draft INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS complex_lessons (
        complex_id INTEGER NOT NULL,
        lesson_id INTEGER NOT NULL,
        position INTEGER DEFAULT 0,
        PRIMARY KEY (complex_id, lesson_id),
        FOREIGN KEY (complex_id) REFERENCES complexes(id),
        FOREIGN KEY (lesson_id) REFERENCES lessons(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        zone TEXT,
        difficulty TEXT DEFAULT 'Легко',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        theme TEXT,
        complex_id INTEGER,
        lesson_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complex_id) REFERENCES complexes(id),
        FOREIGN KEY (lesson_id) REFERENCES lessons(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        plan TEXT DEFAULT 'trial',
        status TEXT DEFAULT 'active',
        email_confirmed INTEGER DEFAULT 0,
        confirmation_token TEXT,
        free_sessions_used INTEGER DEFAULT 0,
        subscription_started_at DATETIME,
        next_billing_date DATETIME,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS watched_lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscriber_id INTEGER NOT NULL,
        lesson_id INTEGER NOT NULL,
        watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        position_seconds INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),
        FOREIGN KEY (lesson_id) REFERENCES lessons(id),
        UNIQUE(subscriber_id, lesson_id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author TEXT NOT NULL,
        text TEXT,
        rating INTEGER DEFAULT 5,
        status TEXT DEFAULT 'pending',
        date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS faq (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        answer TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        discount TEXT NOT NULL,
        max_uses INTEGER DEFAULT 100,
        current_uses INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscriber_id INTEGER,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'success',
        date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT DEFAULT 'info',
        text TEXT,
        recipients TEXT DEFAULT 'all',
        sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS lesson_zones (
        lesson_id INTEGER NOT NULL,
        zone TEXT NOT NULL,
        PRIMARY KEY (lesson_id, zone),
        FOREIGN KEY (lesson_id) REFERENCES lessons(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscriber_id INTEGER NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('trainer','technical','admin')),
        subject TEXT NOT NULL,
        status TEXT DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        sender_type TEXT NOT NULL CHECK(sender_type IN ('subscriber','admin','trainer')),
        sender_id INTEGER,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id)
      )
    `);

    try { db.run(`ALTER TABLE tickets ADD COLUMN assigned_to TEXT`); } catch (_) {}

    db.run(`
      CREATE TABLE IF NOT EXISTS free_lesson_selections (
        subscriber_id INTEGER NOT NULL,
        lesson_id INTEGER NOT NULL,
        selected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (subscriber_id, lesson_id),
        FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),
        FOREIGN KEY (lesson_id) REFERENCES lessons(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS device_fingerprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT NOT NULL,
        ip_address TEXT,
        subscriber_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS workout_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscriber_id INTEGER NOT NULL,
        lesson_id INTEGER NOT NULL,
        mood TEXT NOT NULL CHECK(mood IN ('happy','energized','calm','neutral','tired','disappointed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),
        FOREIGN KEY (lesson_id) REFERENCES lessons(id),
        UNIQUE(subscriber_id, lesson_id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        subscriber_id INTEGER PRIMARY KEY,
        experience TEXT DEFAULT 'beginner',
        goals TEXT DEFAULT '[]',
        preferred_duration INTEGER DEFAULT 15,
        preferred_time TEXT DEFAULT 'anytime',
        focus_zones TEXT DEFAULT '[]',
        onboarding_completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS token_blocklist (
        token_hash TEXT PRIMARY KEY,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_token_blocklist_expires ON token_blocklist(expires_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_token_blocklist_hash ON token_blocklist(token_hash)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id INTEGER,
        user_id INTEGER,
        user_role TEXT,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT NOT NULL,
        user_id INTEGER,
        entity TEXT,
        entity_id INTEGER,
        metadata TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics_events(event_name)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_entity ON analytics_events(entity, entity_id)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS lesson_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        title TEXT,
        description TEXT,
        video_url TEXT,
        cf_video_uid TEXT,
        image_url TEXT,
        duration INTEGER,
        is_free INTEGER,
        tags TEXT,
        direction TEXT,
        effect_description TEXT,
        status TEXT,
        changed_by INTEGER,
        change_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lesson_id) REFERENCES lessons(id)
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_lesson_versions_lesson ON lesson_versions(lesson_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_lesson_versions_version ON lesson_versions(lesson_id, version)`);

    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, ?)`,
      ['admin@qigong.com', hash, 'Admin', 'admin']);

    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
      ['app_name', 'Цигун и суставная разминка']);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
      ['domain', 'https://qigong-landing.com']);

    saveDb();
    return db;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

let saveTimer = null;
let savePending = false;

function resetDb() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  savePending = false;
  initPromise = null;
  if (db) { try { db.close(); } catch (_) {} db = null; }
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
}

function saveDb() {
  if (!db) return;
  if (saveTimer) { savePending = true; return; }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!db) return;
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFile(DB_PATH, buffer, (err) => {
        if (err) console.error('Failed to save database:', err.message);
        if (savePending && db) { savePending = false; saveDb(); }
      });
    } catch (err) {
      console.error('Failed to export database:', err.message);
    }
  }, 300);
}

async function getSetting(key, fallback) {
  try {
    const d = await getDb();
    const result = d.exec(`SELECT value FROM settings WHERE key = ?`, [key]);
    if (result.length > 0 && result[0].values.length > 0 && result[0].values[0][0] != null) {
      return result[0].values[0][0];
    }
  } catch (_) {}
  return fallback !== undefined ? fallback : null;
}

function revokeToken(tokenHash, expiresAt) {
  if (!db) return;
  try {
    db.run(`INSERT OR IGNORE INTO token_blocklist (token_hash, expires_at) VALUES (?, ?)`, [tokenHash, expiresAt]);
    saveDb();
  } catch (err) {
    console.error('Failed to revoke token:', err.message);
  }
}

function isTokenRevoked(tokenHash) {
  if (!db) return false;
  try {
    const result = db.exec(`SELECT 1 FROM token_blocklist WHERE token_hash = ?`, [tokenHash]);
    return result.length > 0 && result[0].values.length > 0;
  } catch (_) {
    return false;
  }
}

function cleanupBlocklist() {
  if (!db) return;
  try {
    db.run(`DELETE FROM token_blocklist WHERE expires_at < datetime('now')`);
    saveDb();
  } catch (_) {}
}

async function transaction(fn) {
  const d = await getDb();
  try {
    d.run('BEGIN');
    const result = await fn(d);
    d.run('COMMIT');
    return result;
  } catch (err) {
    try { d.run('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

module.exports = { getDb, saveDb, resetDb, getSetting, revokeToken, isTokenRevoked, cleanupBlocklist, transaction };
