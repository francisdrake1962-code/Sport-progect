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
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        complex_id INTEGER,
        duration INTEGER DEFAULT 27,
        status TEXT DEFAULT 'active',
        description TEXT,
        video_url TEXT,
        cf_video_uid TEXT,
        exercise_ids TEXT,
        is_free INTEGER DEFAULT 0,
        free_order INTEGER,
        date TEXT,
        tags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complex_id) REFERENCES complexes(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS complexes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    try { db.run(`ALTER TABLE lessons ADD COLUMN cf_video_uid TEXT`); } catch (_) {}
    try { db.run(`ALTER TABLE lessons ADD COLUMN tags TEXT DEFAULT '[]'`); } catch (_) {}
    try { db.run(`ALTER TABLE lessons ADD COLUMN direction TEXT CHECK(direction IN ('суставная_разминка','занятие_в_потоке'))`); } catch (_) {}
    try { db.run(`ALTER TABLE lessons ADD COLUMN direction_source TEXT DEFAULT 'нет_данных' CHECK(direction_source IN ('заголовок','описание_неточно','нет_данных'))`); } catch (_) {}
    try { db.run(`ALTER TABLE lessons ADD COLUMN effect_description TEXT`); } catch (_) {}
    try { db.run(`ALTER TABLE lessons ADD COLUMN effect_is_draft INTEGER DEFAULT 0`); } catch (_) {}

    db.run(`
      CREATE TABLE IF NOT EXISTS lesson_zones (
        lesson_id INTEGER NOT NULL,
        zone TEXT NOT NULL,
        PRIMARY KEY (lesson_id, zone),
        FOREIGN KEY (lesson_id) REFERENCES lessons(id)
      )
    `);

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

module.exports = { getDb, saveDb, resetDb, getSetting };
