-- 003: i18n + lesson_media
-- Adds preferred_language to subscribers and lesson_media table for multi-language video tracks.

ALTER TABLE subscribers ADD COLUMN preferred_language TEXT DEFAULT 'ru';

CREATE TABLE IF NOT EXISTS lesson_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  cf_video_uid TEXT,
  video_url TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'ready')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lesson_id, language),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lesson_media_lesson ON lesson_media(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_media_lang ON lesson_media(lesson_id, language);
