const { getDb, saveDb } = require('../db');

class BaseRepository {
  constructor(tableName) {
    this.tableName = tableName;
  }

  async _db() {
    return getDb();
  }

  _toObjects(result) {
    if (!result || !result.length || !result[0].values.length) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  _toSingle(result) {
    const rows = this._toObjects(result);
    return rows.length > 0 ? rows[0] : null;
  }

  async findAll(conditions = {}, { page = 1, limit = 50 } = {}) {
    const db = await this._db();
    let whereClause = '';
    const params = [];

    const entries = Object.entries(conditions).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length > 0) {
      whereClause = 'WHERE ' + entries.map(([k]) => `${k} = ?`).join(' AND ');
      params.push(...entries.map(([, v]) => v));
    }

    const countResult = db.exec(`SELECT COUNT(*) FROM ${this.tableName} ${whereClause}`, params);
    const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;

    const offset = (page - 1) * limit;
    const result = db.exec(
      `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      data: this._toObjects(result),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id) {
    const db = await this._db();
    const result = db.exec(`SELECT * FROM ${this.tableName} WHERE id = ?`, [id]);
    return this._toSingle(result);
  }

  async findWhere(sql, params = []) {
    const db = await this._db();
    const result = db.exec(`SELECT * FROM ${this.tableName} WHERE ${sql}`, params);
    return this._toObjects(result);
  }

  async findByColumn(column, value) {
    const VALID_COLUMNS = new Set(['id', 'email', 'name', 'status', 'plan', 'role', 'lesson_id', 'subscriber_id', 'mood', 'category']);
    if (!VALID_COLUMNS.has(column)) throw new Error(`Invalid column: ${column}`);
    const db = await this._db();
    const result = db.exec(`SELECT * FROM ${this.tableName} WHERE ${column} = ?`, [value]);
    return this._toObjects(result);
  }

  async create(data) {
    const db = await this._db();
    const cols = Object.keys(data).filter(k => data[k] !== undefined);
    if (cols.length === 0) return null;
    const vals = cols.map(k => data[k]);
    const placeholders = cols.map(() => '?').join(', ');
    db.run(`INSERT INTO ${this.tableName} (${cols.join(', ')}) VALUES (${placeholders})`, vals);
    const idResult = db.exec(`SELECT last_insert_rowid()`);
    const id = (idResult.length > 0 && idResult[0].values.length > 0) ? idResult[0].values[0][0] : null;
    saveDb();
    return id ? this.findById(id) : null;
  }

  async update(id, data) {
    const db = await this._db();
    const cols = Object.keys(data).filter(k => data[k] !== undefined);
    if (cols.length === 0) return this.findById(id);
    const setClause = cols.map(k => `${k} = ?`).join(', ');
    const vals = cols.map(k => data[k]);
    vals.push(id);
    db.run(`UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`, vals);
    saveDb();
    return this.findById(id);
  }

  async delete(id) {
    const db = await this._db();
    db.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
    saveDb();
    return true;
  }

  async count(conditions = {}) {
    const db = await this._db();
    let whereClause = '';
    const params = [];
    const entries = Object.entries(conditions).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length > 0) {
      whereClause = 'WHERE ' + entries.map(([k]) => `${k} = ?`).join(' AND ');
      params.push(...entries.map(([, v]) => v));
    }
    const result = db.exec(`SELECT COUNT(*) FROM ${this.tableName} ${whereClause}`, params);
    return (result.length > 0 && result[0].values.length > 0) ? result[0].values[0][0] : 0;
  }
}

module.exports = { BaseRepository };
