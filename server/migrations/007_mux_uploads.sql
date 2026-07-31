-- 007: mux upload tracking on video_uploads
-- provider: 'cloudflare' (legacy), 'mux' (paid lessons)
ALTER TABLE video_uploads ADD COLUMN provider TEXT DEFAULT 'cloudflare';
ALTER TABLE video_uploads ADD COLUMN mux_upload_id TEXT;
ALTER TABLE video_uploads ADD COLUMN mux_asset_id TEXT;
ALTER TABLE video_uploads ADD COLUMN mux_playback_id TEXT;
