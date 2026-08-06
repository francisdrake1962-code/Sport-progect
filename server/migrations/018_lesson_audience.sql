-- 018: add lessons.audience — "Кому подойдёт занятие"
-- Informational block shown when a user picks a lesson (catalog card + player
-- info). Free text. Fresh DBs get the column from the base schema in db.js;
-- this ALTER is a no-op there (runner skips "duplicate column").
ALTER TABLE lessons ADD COLUMN audience TEXT;
