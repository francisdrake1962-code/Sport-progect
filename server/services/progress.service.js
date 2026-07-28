const { getDb, saveDb } = require('../db');
const { NotFoundError, ValidationError, UnauthorizedError } = require('../helpers/errors');

async function recordWatchProgress(subscriberId, lessonId, positionSeconds, completed) {
  if (!lessonId) throw new ValidationError('lesson_id required');
  const pos = Math.max(0, Math.min(Number(positionSeconds) || 0, 86400));
  const db = await getDb();
  const existing = db.exec(`SELECT id FROM watched_lessons WHERE subscriber_id = ? AND lesson_id = ?`, [subscriberId, lessonId]);
  if (existing.length && existing[0].values.length) {
    const id = existing[0].values[0][0];
    const updates = ['position_seconds = ?'];
    const vals = [pos];
    if (completed !== undefined) { updates.push('completed = ?'); vals.push(completed ? 1 : 0); }
    vals.push(id);
    db.run(`UPDATE watched_lessons SET ${updates.join(', ')} WHERE id = ?`, vals);
  } else {
    db.run(
      `INSERT INTO watched_lessons (subscriber_id, lesson_id, position_seconds, completed) VALUES (?, ?, ?, ?)`,
      [subscriberId, lessonId, pos, completed ? 1 : 0]
    );
  }
  saveDb();
  return { success: true, position_seconds: pos };
}

async function getProgress(subscriberId) {
  const db = await getDb();
  const result = db.exec(
    `SELECT l.id, l.title, wl.position_seconds, wl.completed
     FROM lessons l
     JOIN watched_lessons wl ON wl.lesson_id = l.id
     WHERE wl.subscriber_id = ?
     ORDER BY wl.completed DESC, wl.position_seconds DESC`,
    [subscriberId]
  );
  if (!result.length) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

async function getWorkoutFeedback(subscriberId, page, limit) {
  const db = await getDb();
  const offset = (page - 1) * limit;
  const countResult = db.exec(`SELECT COUNT(*) FROM workout_feedback WHERE subscriber_id = ?`, [subscriberId]);
  const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
  const result = db.exec(
    `SELECT wf.mood, wf.created_at, l.title
     FROM workout_feedback wf
     JOIN lessons l ON l.id = wf.lesson_id
     WHERE wf.subscriber_id = ?
     ORDER BY wf.created_at DESC
     LIMIT ? OFFSET ?`,
    [subscriberId, limit, offset]
  );
  const data = !result.length ? [] : result[0].values.map(row => ({
    mood: row[0], created_at: row[1], lesson_title: row[2],
  }));
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function recordWorkoutFeedback(subscriberId, lessonId, mood) {
  if (!lessonId || !mood) throw new ValidationError('lesson_id and mood required');
  const validMoods = ['happy', 'energized', 'calm', 'neutral', 'tired', 'disappointed'];
  if (!validMoods.includes(mood)) throw new ValidationError(`mood must be one of: ${validMoods.join(', ')}`);
  const db = await getDb();
  db.run(
    `INSERT INTO workout_feedback (subscriber_id, lesson_id, mood) VALUES (?, ?, ?)
     ON CONFLICT(subscriber_id, lesson_id) DO UPDATE SET mood=?, created_at=CURRENT_TIMESTAMP`,
    [subscriberId, lessonId, mood, mood]
  );
  saveDb();
  return { success: true };
}

async function getSubscriberProfile(subscriberId) {
  const db = await getDb();
  const result = db.exec(
    `SELECT id, email, name, plan, status, free_sessions_used, subscription_started_at, next_billing_date, preferred_language FROM subscribers WHERE id = ?`,
    [subscriberId]
  );
  if (!result.length || !result[0].values.length) throw new NotFoundError('User');
  const row = result[0].values[0];
  return { id: row[0], email: row[1], name: row[2], plan: row[3], status: row[4], free_sessions_used: row[5], subscription_started_at: row[6], next_billing_date: row[7], preferred_language: row[8] || 'ru' };
}

async function updateSubscriberProfile(subscriberId, name, currentPassword, newPassword) {
  const db = await getDb();
  const result = db.exec(`SELECT name, password FROM subscribers WHERE id = ?`, [subscriberId]);
  if (!result.length || !result[0].values.length) throw new NotFoundError('User');
  const row = result[0].values[0];
  const currentHash = row[1];

  if (newPassword) {
    if (!currentPassword) throw new ValidationError('Current password required');
    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(currentPassword, currentHash);
    if (!valid) throw new UnauthorizedError('Wrong current password');
    if (newPassword.length < 8) throw new ValidationError('New password must be at least 8 characters');
    const hash = await bcrypt.hash(newPassword, 10);
    db.run(`UPDATE subscribers SET password = ? WHERE id = ?`, [hash, subscriberId]);
  }
  if (name && name.trim()) {
    db.run(`UPDATE subscribers SET name = ? WHERE id = ?`, [name.trim(), subscriberId]);
  }
  saveDb();
  return getSubscriberProfile(subscriberId);
}

module.exports = {
  recordWatchProgress,
  getProgress,
  getWorkoutFeedback,
  recordWorkoutFeedback,
  getSubscriberProfile,
  updateSubscriberProfile,
};
