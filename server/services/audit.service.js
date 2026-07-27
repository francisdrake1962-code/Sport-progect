const { getDb, saveDb } = require('../db');
const { createLogger } = require('../helpers/logger');

const logger = createLogger('audit-service');

async function logAction(action, entity, entityId, userId, userRole, details, ipAddress) {
  const db = await getDb();
  const safeDetails = details ? JSON.stringify(details).slice(0, 2000) : null;
  db.run(
    `INSERT INTO audit_log (action, entity, entity_id, user_id, user_role, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [action, entity, entityId || null, userId || null, userRole || null, safeDetails, ipAddress || null]
  );
  saveDb();
  logger.info('Audit log', { action, entity, entityId, userId });
}

async function getAuditLogs({ entity, userId, action, page = 1, limit = 50 } = {}) {
  const db = await getDb();
  let whereSql = '';
  const params = [];
  if (entity) { whereSql += ' AND entity = ?'; params.push(entity); }
  if (userId) { whereSql += ' AND user_id = ?'; params.push(userId); }
  if (action) { whereSql += ' AND action = ?'; params.push(action); }

  const countResult = db.exec(`SELECT COUNT(*) FROM audit_log WHERE 1=1${whereSql}`, params);
  const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
  const offset = (page - 1) * limit;
  const result = db.exec(
    `SELECT al.*, u.name as user_name, u.email as user_email
     FROM audit_log al LEFT JOIN users u ON al.user_id = u.id
     WHERE 1=1${whereSql}
     ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const data = !result.length ? [] : result[0].values.map(row => ({
    id: row[0], action: row[1], entity: row[2], entity_id: row[3],
    user_id: row[4], user_role: row[5], details: row[6], ip_address: row[7], created_at: row[8],
    user_name: row[9], user_email: row[10],
  }));
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

module.exports = { logAction, getAuditLogs };
