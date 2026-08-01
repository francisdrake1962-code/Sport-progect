const fs = require('fs');
const path = require('path');
const { getDb, saveDb } = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// DB-001: snapshot the DB as it is on disk *before* any schema migration is
// applied. Restore = stop app → replace data/qigong.db with this file → start.
function createPreMigrationBackup(db) {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUPS_DIR, `pre-migration-${timestamp}.db`);
  const data = db.export();
  fs.writeFileSync(backupPath, Buffer.from(data));
  return backupPath;
}

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
  if (pending.length > 0 && process.env.NODE_ENV !== 'test') {
    const backupPath = createPreMigrationBackup(db);
    console.log(`Pre-migration backup created: ${backupPath}`);
  }
  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    db.run('PRAGMA foreign_keys = OFF');
    try {
      db.run('BEGIN');
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of statements) {
        try {
          db.run(stmt);
        } catch (stmtErr) {
          if (stmt.toUpperCase().startsWith('ALTER TABLE') && stmtErr.message && stmtErr.message.includes('duplicate column')) {
            continue;
          }
          throw stmtErr;
        }
      }
      db.run(`INSERT INTO migrations (name) VALUES (?)`, [file]);
      db.run('COMMIT');
      count++;
      if (process.env.NODE_ENV !== 'test') {
        console.log(`Migration applied: ${file}`);
      }
    } catch (err) {
      try { db.run('ROLLBACK'); } catch {}
      console.error(`Migration failed: ${file}`, err.message);
      throw err;
    } finally {
      db.run('PRAGMA foreign_keys = ON');
    }
  }

  saveDb();
  return { applied: count, total: files.length };
}

module.exports = { runMigrations, createPreMigrationBackup };
