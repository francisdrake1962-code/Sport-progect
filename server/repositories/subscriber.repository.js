const { BaseRepository } = require('./base.repository');

class SubscriberRepository extends BaseRepository {
  constructor() {
    super('subscribers');
  }

  async findByEmail(email) {
    const rows = await this.findWhere('email = ?', [email]);
    return rows.length > 0 ? rows[0] : null;
  }

  async getPublicProfile(id) {
    const db = await this._db();
    const result = db.exec(
      `SELECT id, email, name, plan, status, free_sessions_used, subscription_started_at, next_billing_date FROM subscribers WHERE id = ?`,
      [id]
    );
    return this._toSingle(result);
  }

  async updatePassword(id, hash) {
    const { getDb, saveDb } = require('../db');
    const db = await getDb();
    db.run(`UPDATE subscribers SET password = ? WHERE id = ?`, [hash, id]);
    saveDb();
  }

  async confirmEmail(token) {
    const { getDb, saveDb } = require('../db');
    const db = await getDb();
    const result = db.exec(`SELECT id FROM subscribers WHERE confirmation_token = ?`, [token]);
    if (!result.length || !result[0].values.length) return false;
    db.run(`UPDATE subscribers SET email_confirmed = 1, confirmation_token = NULL WHERE confirmation_token = ?`, [token]);
    saveDb();
    return true;
  }
}

module.exports = { subscriberRepo: new SubscriberRepository(), SubscriberRepository };
