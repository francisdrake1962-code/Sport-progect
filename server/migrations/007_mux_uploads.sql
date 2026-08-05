-- 007: mux upload tracking on video_uploads
-- provider: 'mux' (paid lessons, default), 'local' (self-hosted)
ALTER TABLE video_uploads ADD COLUMN provider TEXT DEFAULT 'mux';
ALTER TABLE video_uploads ADD COLUMN mux_upload_id TEXT;
ALTER TABLE video_uploads ADD COLUMN mux_asset_id TEXT;
ALTER TABLE video_uploads ADD COLUMN mux_playback_id TEXT;
