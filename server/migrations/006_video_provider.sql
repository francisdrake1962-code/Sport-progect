-- 006: video_provider — which platform streams a lesson's video
-- 'mux' (paid lessons, default), 'local' (self-hosted free lessons)
ALTER TABLE lessons ADD COLUMN video_provider TEXT DEFAULT 'mux';
ALTER TABLE lesson_media ADD COLUMN video_provider TEXT DEFAULT 'mux';
