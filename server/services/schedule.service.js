const { getDb } = require('../db');
const { NotFoundError } = require('../helpers/errors');
const { createLogger } = require('../helpers/logger');

const logger = createLogger('schedule-service');

async function getSchedule() {
  const db = await getDb();
  const result = db.exec(`SELECT * FROM schedule ORDER BY id`);
  if (!result.length) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

async function getPersonalTimeline(subscriberId) {
  const db = await getDb();

  const subResult = db.exec(`SELECT subscription_started_at FROM subscribers WHERE id = ?`, [subscriberId]);
  if (!subResult.length || !subResult[0].values.length) throw new NotFoundError('Subscriber');
  const subscriptionStartedAt = subResult[0].values[0][0];

  const scheduleResult = db.exec(`SELECT * FROM schedule ORDER BY id`);
  const scheduleItems = !scheduleResult.length ? [] : scheduleResult[0].values.map(row => {
    const obj = {};
    scheduleResult[0].columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });

  const watchedResult = db.exec(
    `SELECT lesson_id, position_seconds, completed FROM watched_lessons WHERE subscriber_id = ?`,
    [subscriberId]
  );
  const watchedMap = {};
  if (watchedResult.length) {
    watchedResult[0].values.forEach(row => {
      watchedMap[row[0]] = { position_seconds: row[1], completed: row[2] };
    });
  }

  const startDate = subscriptionStartedAt ? new Date(subscriptionStartedAt) : new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const timeline = [];
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + dayOffset);
    const dayStr = dayDate.toISOString().split('T')[0];

    const scheduleForDay = scheduleItems.find(s => {
      const schedDay = new Date(dayStr);
      const dayOfWeek = schedDay.getDay();
      return s.day_of_week === dayOfWeek;
    });

    if (scheduleForDay && scheduleForDay.lesson_id) {
      const watched = watchedMap[scheduleForDay.lesson_id];
      timeline.push({
        date: dayStr,
        lesson_id: scheduleForDay.lesson_id,
        title: scheduleForDay.title || null,
        completed: watched ? !!watched.completed : false,
        position_seconds: watched ? watched.position_seconds : 0,
        isPast: dayDate < today,
        isToday: dayDate.toISOString().split('T')[0] === today.toISOString().split('T')[0],
      });
    }
  }

  return { subscription_started_at: subscriptionStartedAt, timeline };
}

module.exports = { getSchedule, getPersonalTimeline };
