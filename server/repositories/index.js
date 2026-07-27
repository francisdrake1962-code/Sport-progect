const { BaseRepository } = require('./base.repository');

class LessonRepository extends BaseRepository {
  constructor() {
    super('lessons');
  }

  async findByStatus(status, { page = 1, limit = 50 } = {}) {
    return this.findAll({ status }, { page, limit });
  }

  async getZones(lessonId) {
    const result = await this.raw(
      `SELECT zone FROM lesson_zones WHERE lesson_id = ?`, [lessonId]
    );
    return this._toObjects(result).map(r => r.zone);
  }

  async setZones(lessonId, zones) {
    const { getDb, saveDb, transaction } = require('../db');
    await transaction(async (db) => {
      db.run(`DELETE FROM lesson_zones WHERE lesson_id = ?`, [lessonId]);
      for (const zone of zones) {
        db.run(`INSERT INTO lesson_zones (lesson_id, zone) VALUES (?, ?)`, [lessonId, zone]);
      }
    });
    saveDb();
  }
}

class UserRepository extends BaseRepository {
  constructor() {
    super('users');
  }

  async findByEmail(email) {
    const rows = await this.findWhere('email = ?', [email]);
    return rows.length > 0 ? rows[0] : null;
  }
}

class FaqRepository extends BaseRepository {
  constructor() {
    super('faq');
  }
}

class ReviewRepository extends BaseRepository {
  constructor() {
    super('reviews');
  }
}

class ComplexRepository extends BaseRepository {
  constructor() {
    super('complexes');
  }

  async listComplexLessons(page, limit) {
    const db = await this._db();
    const offset = (page - 1) * limit;
    const countResult = db.exec(`SELECT COUNT(*) FROM complex_lessons`);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
    const result = db.exec(`SELECT complex_id, lesson_id, position FROM complex_lessons ORDER BY complex_id, position LIMIT ? OFFSET ?`, [limit, offset]);
    return {
      data: this._toObjects(result),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async upsertComplexLesson(complexId, lessonId, position) {
    const db = await this._db();
    db.run(`INSERT OR REPLACE INTO complex_lessons (complex_id, lesson_id, position) VALUES (?, ?, ?)`, [complexId, lessonId, position || 0]);
    saveDb();
    return { success: true };
  }

  async updateComplexLessonPosition(complexId, lessonId, position) {
    const db = await this._db();
    db.run(`UPDATE complex_lessons SET position = ? WHERE complex_id = ? AND lesson_id = ?`, [position || 0, complexId, lessonId]);
    saveDb();
    return { success: true };
  }

  async deleteComplexLesson(complexId, lessonId) {
    const db = await this._db();
    db.run(`DELETE FROM complex_lessons WHERE complex_id = ? AND lesson_id = ?`, [complexId, lessonId]);
    saveDb();
    return { success: true };
  }
}

class SettingsRepository extends BaseRepository {
  constructor() {
    super('settings');
  }

  async get(key) {
    const { getSetting } = require('../db');
    return getSetting(key);
  }

  async getAll() {
    const { getDb } = require('../db');
    const db = await getDb();
    const result = db.exec(`SELECT * FROM settings`);
    const settings = {};
    if (result.length > 0) {
      result[0].values.forEach(row => { settings[row[0]] = row[1]; });
    }
    return settings;
  }

  async set(key, value) {
    const { getDb, saveDb } = require('../db');
    const db = await getDb();
    const existing = db.exec(`SELECT 1 FROM settings WHERE "key" = ?`, [key]);
    if (existing.length && existing[0].values.length) {
      db.run(`UPDATE settings SET value = ? WHERE "key" = ?`, [String(value), key]);
    } else {
      db.run(`INSERT INTO settings ("key", value) VALUES (?, ?)`, [key, String(value)]);
    }
    saveDb();
  }
}

module.exports = {
  lessonRepo: new LessonRepository(),
  userRepo: new UserRepository(),
  faqRepo: new FaqRepository(),
  reviewRepo: new ReviewRepository(),
  complexRepo: new ComplexRepository(),
  settingsRepo: new SettingsRepository(),
  LessonRepository,
  UserRepository,
  FaqRepository,
  ReviewRepository,
  ComplexRepository,
  SettingsRepository,
};
