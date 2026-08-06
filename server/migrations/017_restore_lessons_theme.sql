-- 017: restore lessons.theme for DBs that already ran 016_provider_default_mux
-- 016 rebuilt lessons without the theme column (added by 011_catalog_columns);
-- fresh DBs get theme from the fixed 016, this ALTER is a no-op there (the
-- runner skips "duplicate column" for ALTER TABLE ADD COLUMN).
ALTER TABLE lessons ADD COLUMN theme TEXT;
