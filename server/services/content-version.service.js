const { queryToObjects } = require('../helpers/db-utils');
const { saveDb, transaction } = require('../db');

class ContentVersionService {
  constructor(getDb) {
    this.getDb = getDb;
  }

  async createVersion(lessonId, { changedBy = null, changeSummary = null } = {}) {
    const db = await this.getDb();
    const lessonResult = db.exec(`SELECT * FROM lessons WHERE id = ?`, [lessonId]);
    if (!lessonResult.length || !lessonResult[0].values.length) return null;
    const cols = lessonResult[0].columns;
    const vals = lessonResult[0].values[0];
    const lesson = {};
    cols.forEach((c, i) => { lesson[c] = vals[i]; });

    const versionResult = db.exec(`SELECT COALESCE(MAX(version), 0) + 1 as next FROM lesson_versions WHERE lesson_id = ?`, [lessonId]);
    const nextVersion = versionResult[0]?.values[0][0] || 1;

    db.run(
      `INSERT INTO lesson_versions (lesson_id, version, title, description, video_url, cf_video_uid, image_url, duration, is_free, tags, direction, effect_description, status, changed_by, change_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [lessonId, nextVersion, lesson.title, lesson.description, lesson.video_url, lesson.cf_video_uid, lesson.image_url, lesson.duration, lesson.is_free, lesson.tags, lesson.direction, lesson.effect_description, lesson.status, changedBy, changeSummary]
    );
    saveDb();
    return { lesson_id: lessonId, version: nextVersion };
  }

  async getVersions(lessonId) {
    const db = await this.getDb();
    const result = db.exec(
      `SELECT lv.*, u.name as changed_by_name FROM lesson_versions lv LEFT JOIN users u ON lv.changed_by = u.id WHERE lv.lesson_id = ? ORDER BY lv.version DESC`,
      [lessonId]
    );
    return queryToObjects(result);
  }

  async getVersion(lessonId, version) {
    const db = await this.getDb();
    const result = db.exec(
      `SELECT lv.*, u.name as changed_by_name FROM lesson_versions lv LEFT JOIN users u ON lv.changed_by = u.id WHERE lv.lesson_id = ? AND lv.version = ?`,
      [lessonId, version]
    );
    const items = queryToObjects(result);
    return items.length > 0 ? items[0] : null;
  }

  async restoreVersion(lessonId, version, { changedBy = null } = {}) {
    const db = await this.getDb();
    const versionData = await this.getVersion(lessonId, version);
    if (!versionData) return null;
    await transaction(async () => {
      db.run(
        `UPDATE lessons SET title=?, description=?, video_url=?, cf_video_uid=?, image_url=?, duration=?, is_free=?, tags=?, direction=?, effect_description=?, status=? WHERE id=?`,
        [versionData.title, versionData.description, versionData.video_url, versionData.cf_video_uid, versionData.image_url, versionData.duration, versionData.is_free, versionData.tags, versionData.direction, versionData.effect_description, versionData.status, lessonId]
      );
    });
    const result = await this.createVersion(lessonId, { changedBy, changeSummary: `Restored from version ${version}` });
    return result;
  }

  async compareVersions(lessonId, versionA, versionB) {
    const a = await this.getVersion(lessonId, versionA);
    const b = await this.getVersion(lessonId, versionB);
    if (!a || !b) return null;
    const fields = ['title', 'description', 'video_url', 'cf_video_uid', 'image_url', 'duration', 'is_free', 'tags', 'direction', 'effect_description', 'status'];
    const changes = {};
    for (const field of fields) {
      if (a[field] !== b[field]) {
        changes[field] = { from: a[field], to: b[field] };
      }
    }
    return { version_a: versionA, version_b: versionB, changes };
  }
}

module.exports = ContentVersionService;
