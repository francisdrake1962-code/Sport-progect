-- 019: lesson moods (Самочувствие) — wellbeing states attached to lessons,
-- parallel to lesson_zones. Ids follow the "Подобрать занятие" reference.
CREATE TABLE IF NOT EXISTS lesson_moods (
  lesson_id INTEGER NOT NULL,
  mood TEXT NOT NULL,
  PRIMARY KEY (lesson_id, mood),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lesson_moods_mood ON lesson_moods(mood);
