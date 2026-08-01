const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '..', 'data', 'qigong.test.db');

describe('db — atomic save (OPS-001)', () => {
  const { resetDb, getDb, saveDb } = require('../server/db');

  beforeEach(() => {
    resetDb();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetDb();
  });

  test('saveDb writes to a temp file and renames it over the real DB', async () => {
    const db = await getDb();
    db.run(`UPDATE settings SET value = 'atomic-save-test' WHERE key = 'app_name'`);

    const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync');
    const renameSyncSpy = jest.spyOn(fs, 'renameSync');
    saveDb();
    jest.advanceTimersByTime(400);

    expect(writeFileSyncSpy).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), expect.any(Buffer));
    expect(renameSyncSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      expect.stringMatching(/qigong\.test\.db$/)
    );
    expect(fs.existsSync(DB_PATH + '.tmp')).toBe(false);

    writeFileSyncSpy.mockRestore();
    renameSyncSpy.mockRestore();
  });

  test('saved DB round-trips: exported data survives a reload', async () => {
    const db = await getDb();
    db.run(`UPDATE settings SET value = 'round-trip-ok' WHERE key = 'app_name'`);
    saveDb();
    jest.advanceTimersByTime(400);

    const SQL = await initSqlJs();
    const reopened = new SQL.Database(fs.readFileSync(DB_PATH));
    const result = reopened.exec(`SELECT value FROM settings WHERE key = 'app_name'`);
    expect(result[0].values[0][0]).toBe('round-trip-ok');
    reopened.close();
  });

  test('a failed temp write keeps the previous DB intact and cleans up the temp file', async () => {
    const db = await getDb();
    db.run(`UPDATE settings SET value = 'before-crash' WHERE key = 'app_name'`);
    saveDb();
    jest.advanceTimersByTime(400);

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('simulated crash');
    });

    db.run(`UPDATE settings SET value = 'after-crash' WHERE key = 'app_name'`);
    saveDb();
    jest.advanceTimersByTime(400);

    expect(errorSpy).toHaveBeenCalled();
    expect(fs.existsSync(DB_PATH + '.tmp')).toBe(false);

    const SQL = await initSqlJs();
    const reopened = new SQL.Database(fs.readFileSync(DB_PATH));
    const result = reopened.exec(`SELECT value FROM settings WHERE key = 'app_name'`);
    expect(result[0].values[0][0]).toBe('before-crash');
    reopened.close();

    writeFileSyncSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('pre-migration backup is a valid snapshot of the current DB (DB-001)', async () => {
    const { createPreMigrationBackup } = require('../server/helpers/migrations');
    const db = await getDb();
    db.run(`UPDATE settings SET value = 'backup-snapshot' WHERE key = 'app_name'`);

    const backupPath = createPreMigrationBackup(db);

    const backupsDir = path.join(__dirname, '..', 'data', 'backups');
    expect(backupPath.startsWith(backupsDir)).toBe(true);
    expect(fs.existsSync(backupPath)).toBe(true);

    const SQL = await initSqlJs();
    const reopened = new SQL.Database(fs.readFileSync(backupPath));
    const result = reopened.exec(`SELECT value FROM settings WHERE key = 'app_name'`);
    expect(result[0].values[0][0]).toBe('backup-snapshot');
    reopened.close();

    fs.unlinkSync(backupPath);
  });
});
