-- 006: video_provider — which platform streams a lesson's video
-- 'cloudflare' (legacy default), 'mux' (paid lessons), 'local' (self-hosted free lessons)
ALTER TABLE lessons ADD COLUMN video_provider TEXT DEFAULT 'cloudflare';
ALTER TABLE lesson_media ADD COLUMN video_provider TEXT DEFAULT 'cloudflare';
