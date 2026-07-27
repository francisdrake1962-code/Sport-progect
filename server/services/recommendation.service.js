const { queryToObjects } = require('../helpers/db-utils');

class RecommendationService {
  constructor(getDb) {
    this.getDb = getDb;
  }

  async getRecommendations(subscriberId, { limit = 5, excludeWatched = true } = {}) {
    const db = await this.getDb();
    const subscriber = this._getSubscriber(db, subscriberId);
    if (!subscriber) return [];

    const watchedIds = this._getWatchedIds(db, subscriberId);
    const feedbackMood = this._getLatestMood(db, subscriberId);
    const preferences = this._getPreferences(db, subscriberId);
    const schedule = this._getScheduleInfo(db, subscriberId);

    let candidates = this._getCandidateLessons(db, { watchedIds, excludeWatched });

    const scored = candidates.map(lesson => {
      let score = 0;
      let tags;
      try { tags = lesson.tags ? JSON.parse(lesson.tags) : []; } catch (_) { tags = []; }
      const zones = lesson.zones ? lesson.zones.split(',').filter(Boolean) : [];

      if (preferences.focus_zones && preferences.focus_zones.length > 0 && zones.some(z => preferences.focus_zones.includes(z))) score += 30;
      if (preferences.goals && preferences.goals.length > 0 && tags.some(t => preferences.goals.includes(t))) score += 20;

      if (schedule && schedule.dayOfWeek) {
        const dayTags = { 0: 'отдых', 1: 'интенсив', 2: 'суставы', 3: 'дыхание', 4: 'интенсив', 5: 'суставы', 6: 'расслабление' };
        const expectedTag = dayTags[schedule.dayOfWeek];
        if (expectedTag && tags.includes(expectedTag)) score += 15;
      }

      if (feedbackMood) {
        const moodZoneMap = {
          tired: ['шея', 'плечи_руки', 'баланс_общее'],
          disappointed: ['спина_осанка', 'поясница', 'баланс_общее'],
          neutral: ['грудной_отдел', 'колени', 'ноги_таз'],
          happy: ['интенсив', 'дыхание', 'суставы'],
          energized: ['интенсив', 'колени', 'ноги_таз'],
          calm: ['дыхание', 'расслабление', 'грудной_отдел'],
        };
        const preferredZones = moodZoneMap[feedbackMood] || [];
        if (zones.some(z => preferredZones.includes(z))) score += 10;
      }

      if (lesson.is_free && subscriber.plan === 'trial') score += 5;
      if (!lesson.is_free && subscriber.plan !== 'trial') score += 5;

      return { ...lesson, _score: score, zones, tags };
    });

    scored.sort((a, b) => b._score - a._score);
    const results = scored.slice(0, limit).map(({ _score, zones, tags, ...rest }) => ({
      ...rest,
      zones,
      tags,
      reason: this._buildReason(_score, zones, tags, preferences, feedbackMood),
    }));

    return results;
  }

  _getSubscriber(db, id) {
    const result = db.exec(`SELECT id, plan, status, free_sessions_used FROM subscribers WHERE id = ?`, [id]);
    if (!result.length || !result[0].values.length) return null;
    const r = result[0].values[0];
    return { id: r[0], plan: r[1], status: r[2], free_sessions_used: r[3] };
  }

  _getWatchedIds(db, subscriberId) {
    const result = db.exec(`SELECT lesson_id FROM watched_lessons WHERE subscriber_id = ?`, [subscriberId]);
    if (!result.length) return [];
    return result[0].values.map(r => r[0]);
  }

  _getLatestMood(db, subscriberId) {
    const result = db.exec(
      `SELECT mood FROM workout_feedback WHERE subscriber_id = ? ORDER BY created_at DESC LIMIT 1`,
      [subscriberId]
    );
    if (!result.length || !result[0].values.length) return null;
    return result[0].values[0][0];
  }

  _getPreferences(db, subscriberId) {
    const result = db.exec(`SELECT * FROM user_preferences WHERE subscriber_id = ?`, [subscriberId]);
    if (!result.length || !result[0].values.length) return {};
    const cols = result[0].columns;
    const vals = result[0].values[0];
    const prefs = {};
    cols.forEach((c, i) => { prefs[c] = vals[i]; });
    if (prefs.focus_zones) try { prefs.focus_zones = JSON.parse(prefs.focus_zones); } catch (_) { prefs.focus_zones = []; }
    if (prefs.goals) try { prefs.goals = JSON.parse(prefs.goals); } catch (_) { prefs.goals = []; }
    return prefs;
  }

  _getScheduleInfo(db, subscriberId) {
    const today = new Date().toISOString().slice(0, 10);
    const result = db.exec(`SELECT theme, lesson_id, complex_id FROM schedule WHERE date = ?`, [today]);
    if (!result.length || !result[0].values.length) {
      return { dayOfWeek: new Date().getDay(), theme: null };
    }
    return {
      dayOfWeek: new Date().getDay(),
      theme: result[0].values[0][0],
      lessonId: result[0].values[0][1],
      complexId: result[0].values[0][2],
    };
  }

  _getCandidateLessons(db, { watchedIds, excludeWatched }) {
    let query = `SELECT l.*, GROUP_CONCAT(lz.zone) as zones FROM lessons l LEFT JOIN lesson_zones lz ON l.id = lz.lesson_id WHERE l.status IN ('active', 'published')`;
    const params = [];
    if (excludeWatched && watchedIds.length > 0) {
      query += ` AND l.id NOT IN (${watchedIds.map(() => '?').join(',')})`;
      params.push(...watchedIds);
    }
    query += ` GROUP BY l.id ORDER BY l.id DESC`;
    const result = db.exec(query, params);
    return queryToObjects(result);
  }

  _buildReason(score, zones, tags, preferences, mood) {
    const reasons = [];
    if (preferences.focus_zones && preferences.focus_zones.length > 0 && zones.some(z => preferences.focus_zones.includes(z))) reasons.push('matches your focus zones');
    if (preferences.goals && preferences.goals.length > 0 && tags.some(t => preferences.goals.includes(t))) reasons.push('matches your goals');
    if (mood && score >= 10) reasons.push('based on your recent mood');
    if (reasons.length === 0) reasons.push('recommended');
    return reasons.join('; ');
  }
}

module.exports = RecommendationService;
