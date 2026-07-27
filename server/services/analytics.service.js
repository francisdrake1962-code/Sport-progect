const { queryToObjects } = require('../helpers/db-utils');

class AnalyticsService {
  constructor(getDb) {
    this.getDb = getDb;
  }

  async trackEvent({ eventName, userId = null, entity = null, entityId = null, metadata = null, ipAddress = null, userAgent = null }) {
    const db = await this.getDb();
    let metaStr = null;
    if (metadata) { try { metaStr = JSON.stringify(metadata); } catch (_) { metaStr = '{}'; } }
    db.run(
      `INSERT INTO analytics_events (event_name, user_id, entity, entity_id, metadata, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [eventName, userId, entity, entityId, metaStr, ipAddress, userAgent]
    );
    const { saveDb } = require('../db');
    saveDb();
  }

  async getEventStats({ startDate, endDate, eventName, entity, groupBy = 'event_name' }) {
    const db = await this.getDb();
    let where = [];
    let params = [];
    if (startDate) { where.push('created_at >= ?'); params.push(startDate); }
    if (endDate) { where.push('created_at <= ?'); params.push(endDate); }
    if (eventName) { where.push('event_name = ?'); params.push(eventName); }
    if (entity) { where.push('entity = ?'); params.push(entity); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const validGroups = ['event_name', 'entity', 'date', 'user_id'];
    const group = validGroups.includes(groupBy) ? groupBy : 'event_name';
    let selectExpr, groupExpr;
    if (group === 'date') {
      selectExpr = "DATE(created_at) as period, COUNT(*) as count";
      groupExpr = "DATE(created_at)";
    } else {
      selectExpr = `${group} as period, COUNT(*) as count`;
      groupExpr = group;
    }
    const result = db.exec(`SELECT ${selectExpr} FROM analytics_events ${whereClause} GROUP BY ${groupExpr} ORDER BY count DESC`, params);
    return queryToObjects(result);
  }

  async getEventTimeline({ startDate, endDate, eventName, days = 30 }) {
    const db = await this.getDb();
    let where = [];
    let params = [];
    if (startDate) { where.push('created_at >= ?'); params.push(startDate); }
    if (endDate) { where.push('created_at <= ?'); params.push(endDate); }
    if (eventName) { where.push('event_name = ?'); params.push(eventName); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const result = db.exec(
      `SELECT DATE(created_at) as date, COUNT(*) as count FROM analytics_events ${whereClause} GROUP BY DATE(created_at) ORDER BY date DESC LIMIT ?`,
      [...params, days]
    );
    return queryToObjects(result);
  }

  async getUserActivity({ userId, limit = 50 }) {
    const db = await this.getDb();
    const result = db.exec(
      `SELECT * FROM analytics_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
    return queryToObjects(result);
  }

  async getDashboard({ days = 30 }) {
    const db = await this.getDb();
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const totalResult = db.exec(`SELECT COUNT(*) as total FROM analytics_events WHERE created_at >= ?`, [cutoff]);
    const total = totalResult[0]?.values[0][0] || 0;
    const uniqueUsers = db.exec(`SELECT COUNT(DISTINCT user_id) as count FROM analytics_events WHERE user_id IS NOT NULL AND created_at >= ?`, [cutoff]);
    const topEvents = db.exec(
      `SELECT event_name, COUNT(*) as count FROM analytics_events WHERE created_at >= ? GROUP BY event_name ORDER BY count DESC LIMIT 10`,
      [cutoff]
    );
    const dailyActivity = db.exec(
      `SELECT DATE(created_at) as date, COUNT(*) as count FROM analytics_events WHERE created_at >= ? GROUP BY DATE(created_at) ORDER BY date ASC`,
      [cutoff]
    );
    return {
      period_days: days,
      total_events: total,
      unique_users: uniqueUsers[0]?.values[0][0] || 0,
      top_events: queryToObjects(topEvents),
      daily_activity: queryToObjects(dailyActivity),
    };
  }
}

module.exports = AnalyticsService;
