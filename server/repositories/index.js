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
}

class SettingsRepository extends BaseRepository {
  constructor() {
    super('settings');
  }

  async get(key) {
    const { getSetting } = require('../db');
    return getSetting(key);
  }

  async set(key, value) {
    const { getDb, saveDb } = require('../db');
    const db = await getDb();
    const existing = db.exec(`SELECT id FROM settings WHERE key = ?`, [key]);
    if (existing.length && existing[0].values.length) {
      db.run(`UPDATE settings SET value = ? WHERE key = ?`, [String(value), key]);
    } else {
      db.run(`INSERT INTO settings (key, value) VALUES (?, ?)`, [key, String(value)]);
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
