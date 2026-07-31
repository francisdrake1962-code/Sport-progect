-- 004: video_uploads — track full lifecycle of video uploads to Cloudflare Stream
CREATE TABLE IF NOT EXISTS video_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  lesson_media_id INTEGER,
  language TEXT DEFAULT 'ru',
  cf_video_uid TEXT,
  original_filename TEXT,
  file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','uploading','processing','ready','error')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ready_at DATETIME,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_media_id) REFERENCES lesson_media(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_video_uploads_lesson ON video_uploads(lesson_id);
CREATE INDEX IF NOT EXISTS idx_video_uploads_status ON video_uploads(status);
CREATE INDEX IF NOT EXISTS idx_video_uploads_cf_uid ON video_uploads(cf_video_uid);
