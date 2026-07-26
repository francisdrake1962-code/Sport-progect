const { getDb, saveDb, transaction } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../helpers/errors');
const { createLogger } = require('../helpers/logger');

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

async function replyToTicket(ticketId, senderType, senderId, message) {
  if (!message || !String(message).trim()) throw new ValidationError('message required');
  const safeMessage = String(message).trim().slice(0, 5000);
  const db = await getDb();
  const ticketCheck = db.exec(`SELECT id, status FROM tickets WHERE id = ?`, [ticketId]);
  if (!ticketCheck.length || !ticketCheck[0].values.length) throw new NotFoundError('Ticket');
  db.run(`INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message) VALUES (?, ?, ?, ?)`, [ticketId, senderType, senderId, safeMessage]);
  if (senderType === 'admin') {
    db.run(`UPDATE tickets SET status = 'in_progress' WHERE id = ? AND status = 'open'`, [ticketId]);
  }
  saveDb();
  return { success: true };
}

async function closeTicket(ticketId) {
  const db = await getDb();
  db.run(`UPDATE tickets SET status = 'closed' WHERE id = ?`, [ticketId]);
  saveDb();
  return { success: true };
}

module.exports = { createTicket, getSubscriberTickets, replyToTicket, closeTicket };
