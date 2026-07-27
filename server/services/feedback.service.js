const { getDb, saveDb, transaction } = require('../db');
const { NotFoundError, ValidationError } = require('../helpers/errors');
const { createLogger } = require('../helpers/logger');
const { queryToObjects } = require('../helpers/db-utils');

const logger = createLogger('feedback-service');

const VALID_CATEGORIES = ['trainer', 'technical', 'admin'];

async function createTicket(subscriberId, category, subject, message) {
  if (!category || !subject || !message) throw new ValidationError('category, subject, message required');
  if (!VALID_CATEGORIES.includes(category)) throw new ValidationError('Invalid category');
  const safeSubject = String(subject).trim().slice(0, 200);
  const safeMessage = String(message).trim().slice(0, 5000);
  if (!safeSubject || !safeMessage) throw new ValidationError('subject and message required');

  const ticketId = await transaction(async (db) => {
    db.run(`INSERT INTO tickets (subscriber_id, category, subject) VALUES (?, ?, ?)`, [subscriberId, category, safeSubject]);
    const idResult = db.exec(`SELECT last_insert_rowid()`);
    const id = idResult[0].values[0][0];
    db.run(`INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message) VALUES (?, 'subscriber', ?, ?)`, [id, subscriberId, safeMessage]);
    return id;
  });
  saveDb();
  logger.info('Ticket created', { ticketId, subscriberId, category });
  return { ticketId };
}

async function getSubscriberTickets(subscriberId, page, limit) {
  const db = await getDb();
  const offset = (page - 1) * limit;
  const countResult = db.exec(`SELECT COUNT(*) FROM tickets WHERE subscriber_id = ?`, [subscriberId]);
  const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
  const result = db.exec(
    `SELECT t.id, t.category, t.subject, t.status, t.created_at
     FROM tickets t WHERE t.subscriber_id = ?
     ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
    [subscriberId, limit, offset]
  );
  const data = !result.length ? [] : result[0].values.map(row => ({
    id: row[0], category: row[1], subject: row[2], status: row[3], created_at: row[4], subscriber_id: subscriberId,
  }));
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getTicketById(ticketId, subscriberId) {
  const db = await getDb();
  const ticketIdNum = Number(ticketId);
  if (!Number.isInteger(ticketIdNum) || ticketIdNum <= 0) throw new ValidationError('Invalid ticket ID');
  const tickets = queryToObjects(db.exec(`SELECT * FROM tickets WHERE id = ? AND subscriber_id = ?`, [ticketIdNum, subscriberId]));
  if (!tickets.length) throw new NotFoundError('Ticket');
  const messages = queryToObjects(db.exec(`SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`, [ticketIdNum]));
  return { ...tickets[0], messages };
}

async function adminListTickets(page, limit, filters = {}) {
  const db = await getDb();
  const offset = (page - 1) * limit;
  let whereSql = ` WHERE 1=1`;
  const params = [];
  if (filters.category) { whereSql += ` AND t.category = ?`; params.push(filters.category); }
  if (filters.status) { whereSql += ` AND t.status = ?`; params.push(filters.status); }
  const countResult = db.exec(`SELECT COUNT(*) FROM tickets t${whereSql}`, params);
  const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
  let sql = `SELECT t.*, s.name as subscriber_name, s.email as subscriber_email,
    (SELECT message FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message,
    (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count
    FROM tickets t LEFT JOIN subscribers s ON t.subscriber_id = s.id${whereSql} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
  const tickets = queryToObjects(db.exec(sql, [...params, limit, offset]));
  return { data: tickets, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function adminGetTicketById(ticketId) {
  const ticketIdNum = Number(ticketId);
  if (!Number.isInteger(ticketIdNum) || ticketIdNum <= 0) throw new ValidationError('Invalid ticket ID');
  const db = await getDb();
  const tickets = queryToObjects(db.exec(`SELECT t.*, s.name as subscriber_name, s.email as subscriber_email FROM tickets t LEFT JOIN subscribers s ON t.subscriber_id = s.id WHERE t.id = ?`, [ticketIdNum]));
  if (!tickets.length) throw new NotFoundError('Ticket');
  const messages = queryToObjects(db.exec(`SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`, [ticketIdNum]));
  return { ...tickets[0], messages };
}

async function adminUpdateTicket(ticketId, { status, assigned_to }) {
  const ticketIdNum = Number(ticketId);
  if (!Number.isInteger(ticketIdNum) || ticketIdNum <= 0) throw new ValidationError('Invalid ticket ID');
  const db = await getDb();
  if (status) {
    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) throw new ValidationError('Invalid status');
    db.run(`UPDATE tickets SET status = ? WHERE id = ?`, [status, ticketIdNum]);
  }
  if (assigned_to !== undefined) {
    const safeAssignee = String(assigned_to).trim().slice(0, 100);
    db.run(`UPDATE tickets SET assigned_to = ? WHERE id = ?`, [safeAssignee, ticketIdNum]);
  }
  saveDb();
  return { success: true };
}

async function replyToTicket(ticketId, senderType, senderId, message) {
  const ticketIdNum = Number(ticketId);
  if (!Number.isInteger(ticketIdNum) || ticketIdNum <= 0) throw new ValidationError('Invalid ticket ID');
  if (!message || !String(message).trim()) throw new ValidationError('message required');
  const safeMessage = String(message).trim().slice(0, 5000);
  const db = await getDb();
  const ticketCheck = db.exec(`SELECT id, status FROM tickets WHERE id = ?`, [ticketIdNum]);
  if (!ticketCheck.length || !ticketCheck[0].values.length) throw new NotFoundError('Ticket');
  db.run(`INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message) VALUES (?, ?, ?, ?)`, [ticketIdNum, senderType, senderId, safeMessage]);
  if (senderType === 'admin') {
    db.run(`UPDATE tickets SET status = 'in_progress' WHERE id = ? AND status = 'open'`, [ticketIdNum]);
  }
  saveDb();
  return { success: true };
}

async function closeTicket(ticketId) {
  const ticketIdNum = Number(ticketId);
  if (!Number.isInteger(ticketIdNum) || ticketIdNum <= 0) throw new ValidationError('Invalid ticket ID');
  const db = await getDb();
  db.run(`UPDATE tickets SET status = 'closed' WHERE id = ?`, [ticketIdNum]);
  saveDb();
  return { success: true };
}

module.exports = {
  createTicket,
  getSubscriberTickets,
  getTicketById,
  adminListTickets,
  adminGetTicketById,
  adminUpdateTicket,
  replyToTicket,
  closeTicket,
};
