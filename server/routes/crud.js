const { getDb, saveDb } = require('../db');

const VALID_TABLES = new Set([
  'users', 'lessons', 'complexes', 'schedule',
  'subscribers', 'reviews', 'faq', 'promo_codes', 'transactions',
  'notifications', 'settings', 'watched_lessons', 'lesson_zones'
]);

function queryToObjects(result) {
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function createCrudRoutes(tableName, fields) {
  if (!VALID_TABLES.has(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  const express = require('express');
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const db = await getDb();
      const result = db.exec(`SELECT * FROM ${tableName} ORDER BY id DESC`);
      res.json(queryToObjects(result));
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid ID' });
      }
      const db = await getDb();
      const result = db.exec(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
      const items = queryToObjects(result);
      if (items.length === 0) return res.status(404).json({ error: 'Not found' });
      res.json(items[0]);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const db = await getDb();
      const cols = fields.filter(f => req.body[f] !== undefined);
      if (cols.length === 0) return res.status(400).json({ error: 'No fields provided' });
      const vals = cols.map(f => req.body[f]);
      const placeholders = cols.map(() => '?').join(', ');
      db.run(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`, vals);
      const idResult = db.exec(`SELECT last_insert_rowid() as id`);
      const id = (idResult.length > 0 && idResult[0].values.length > 0) ? idResult[0].values[0][0] : null;
      if (id) {
        const result = db.exec(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
        const items = queryToObjects(result);
        saveDb();
        if (items.length > 0) return res.status(201).json(items[0]);
      }
      saveDb();
      res.status(201).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid ID' });
      }
      const db = await getDb();
      const cols = fields.filter(f => req.body[f] !== undefined);
      if (cols.length === 0) return res.status(400).json({ error: 'No fields to update' });
      const setClause = cols.map(f => `${f} = ?`).join(', ');
      const vals = cols.map(f => req.body[f]);
      vals.push(id);
      db.run(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`, vals);
      saveDb();
      const result = db.exec(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
      const items = queryToObjects(result);
      if (items.length === 0) return res.status(404).json({ error: 'Not found' });
      res.json(items[0]);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid ID' });
      }
      const db = await getDb();
      db.run(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
      saveDb();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = { createCrudRoutes, queryToObjects };
