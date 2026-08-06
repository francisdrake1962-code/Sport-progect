-- 016: rebuild lessons/lesson_media/video_uploads with provider default 'mux'
-- Migrations 006/007 added these columns with DEFAULT 'cloudflare' before the
-- Mux-only decision; fresh DBs already get 'mux', but already-migrated DBs keep
-- the old default in the schema. SQLite cannot ALTER a column default, so the
-- tables are rebuilt. The catalog is empty at this point (015), so the
-- INSERT ... SELECT copies no rows and is kept only for pattern correctness.
-- The _new + rename pattern keeps foreign-key references valid at the end
-- (foreign_keys is OFF for the duration of the migration).

CREATE TABLE lessons_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  theme TEXT,
  duration INTEGER DEFAULT 27,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'draft', 'archived')),
  description TEXT,
  video_url TEXT,
  video_id TEXT,
  image_url TEXT,
  is_free INTEGER DEFAULT 0 CHECK(is_free IN (0, 1)),
  free_order INTEGER,
  sort_order INTEGER,
  catalog_no INTEGER,
  date TEXT,
  tags TEXT DEFAULT '[]',
  direction TEXT,
  direction_source TEXT DEFAULT 'нет_данных',
  goals TEXT,
  effect_description TEXT,
  effect_is_draft INTEGER DEFAULT 0 CHECK(effect_is_draft IN (0, 1)),
  intensity TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  video_provider TEXT DEFAULT 'mux'
);

INSERT INTO lessons_new (id, title, theme, duration, status, description, video_url, video_id, image_url, is_free, free_order, sort_order, catalog_no, date, tags, direction, direction_source, goals, effect_description, effect_is_draft, intensity, created_at, video_provider)
  SELECT id, title, theme, duration, status, description, video_url, video_id, image_url, is_free, free_order, sort_order, catalog_no, date, tags, direction, direction_source, goals, effect_description, effect_is_draft, intensity, created_at, video_provider FROM lessons;

DROP TABLE lessons;
ALTER TABLE lessons_new RENAME TO lessons;

CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status);
CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(date);
CREATE INDEX IF NOT EXISTS idx_lessons_is_free ON lessons(is_free);
CREATE INDEX IF NOT EXISTS idx_lessons_catalog_no ON lessons(catalog_no);

CREATE TABLE lesson_media_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  video_id TEXT,
  video_url TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'ready')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  video_provider TEXT DEFAULT 'mux',
  UNIQUE(lesson_id, language),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

INSERT INTO lesson_media_new (id, lesson_id, language, video_id, video_url, status, created_at, video_provider)
  SELECT id, lesson_id, language, video_id, video_url, status, created_at, video_provider FROM lesson_media;

DROP TABLE lesson_media;
ALTER TABLE lesson_media_new RENAME TO lesson_media;

CREATE INDEX IF NOT EXISTS idx_lesson_media_lesson ON lesson_media(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_media_lang ON lesson_media(lesson_id, language);

CREATE TABLE video_uploads_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  lesson_media_id INTEGER,
  language TEXT DEFAULT 'ru',
  video_id TEXT,
  original_filename TEXT,
  file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','uploading','processing','ready','error')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ready_at DATETIME,
  replaces_uid TEXT,
  provider TEXT DEFAULT 'mux',
  mux_upload_id TEXT,
  mux_asset_id TEXT,
  mux_playback_id TEXT,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_media_id) REFERENCES lesson_media(id) ON DELETE SET NULL
);

INSERT INTO video_uploads_new (id, lesson_id, lesson_media_id, language, video_id, original_filename, file_size, status, error_message, created_at, updated_at, ready_at, replaces_uid, provider, mux_upload_id, mux_asset_id, mux_playback_id)
  SELECT id, lesson_id, lesson_media_id, language, video_id, original_filename, file_size, status, error_message, created_at, updated_at, ready_at, replaces_uid, provider, mux_upload_id, mux_asset_id, mux_playback_id FROM video_uploads;

DROP TABLE video_uploads;
ALTER TABLE video_uploads_new RENAME TO video_uploads;

CREATE INDEX IF NOT EXISTS idx_video_uploads_lesson ON video_uploads(lesson_id);
CREATE INDEX IF NOT EXISTS idx_video_uploads_status ON video_uploads(status);
CREATE INDEX IF NOT EXISTS idx_video_uploads_video_id ON video_uploads(video_id);
