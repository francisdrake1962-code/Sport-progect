-- 012: catalog_no — stable catalog number linking lesson description and video
-- This is the number used in the lesson catalog file (№ column).

ALTER TABLE lessons ADD COLUMN catalog_no INTEGER;
CREATE INDEX IF NOT EXISTS idx_lessons_catalog_no ON lessons(catalog_no);
