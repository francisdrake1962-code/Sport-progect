const fs = require('fs');
const path = require('path');
const { getDb, saveDb } = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

function getAppliedMigrations(db) {
  const result = db.exec(`SELECT name FROM migrations ORDER BY id`);
  if (!result.length) return [];
  return result[0].values.map(r => r[0]);
}

async function runMigrations() {
  const db = await getDb();
  await ensureMigrationsTable(db);

  const files = getMigrationFiles();
  const applied = getAppliedMigrations(db);
  const pending = files.filter(f => !applied.includes(f));

  if (pending.length === 0) {
    return { applied: 0, total: files.length };
  }

  let count = 0;
  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      db.run('BEGIN');
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of statements) {
        db.run(stmt);
      }
      db.run(`INSERT INTO migrations (name) VALUES (?)`, [file]);
      db.run('COMMIT');
      count++;
      if (process.env.NODE_ENV !== 'test') {
        console.log(`Migration applied: ${file}`);
      }
    } catch (err) {
      try { db.run('ROLLBACK'); } catch (_) {}
      console.error(`Migration failed: ${file}`, err.message);
      throw err;
    }
  }

  saveDb();
  return { applied: count, total: files.length };
}

module.exports = { runMigrations };
