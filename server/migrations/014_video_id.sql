-- 014: Mux-only video provider — rename legacy cf_video_uid to video_id
-- Cloudflare Stream was abandoned (cost) and Mux is the sole provider
-- The provider-agnostic name also keeps room for a future third host (Bunny)

ALTER TABLE lessons RENAME COLUMN cf_video_uid TO video_id;
ALTER TABLE lesson_media RENAME COLUMN cf_video_uid TO video_id;
ALTER TABLE video_uploads RENAME COLUMN cf_video_uid TO video_id;
ALTER TABLE lesson_versions RENAME COLUMN cf_video_uid TO video_id;

DROP INDEX IF EXISTS idx_video_uploads_cf_uid;
CREATE INDEX IF NOT EXISTS idx_video_uploads_video_id ON video_uploads(video_id);
