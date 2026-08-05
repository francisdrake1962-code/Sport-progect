-- 015: clear the lesson catalog for relaunch (Mux-only, one-time cleanup).
-- Kept as a migration so the runner's pre-migration backup protects the data
-- before it runs. User data (subscribers, watched_lessons, reviews, etc.) and
-- complexes are left intact.
DELETE FROM complex_lessons;
DELETE FROM lesson_media;
DELETE FROM lesson_versions;
DELETE FROM video_uploads;
DELETE FROM lesson_zones;
DELETE FROM lessons;
DELETE FROM sqlite_sequence WHERE name IN ('complex_lessons','lesson_media','lesson_versions','video_uploads','lesson_zones','lessons');
