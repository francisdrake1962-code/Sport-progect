-- Migration 001: Performance indexes
-- These indexes cover the most frequently queried columns

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_plan ON subscribers(plan);

CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status);
CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(date);
CREATE INDEX IF NOT EXISTS idx_lessons_is_free ON lessons(is_free);

CREATE INDEX IF NOT EXISTS idx_watched_lessons_subscriber ON watched_lessons(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_watched_lessons_lesson ON watched_lessons(lesson_id);

CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule(date);

CREATE INDEX IF NOT EXISTS idx_tickets_subscriber ON tickets(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

CREATE INDEX IF NOT EXISTS idx_transactions_subscriber ON transactions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

CREATE INDEX IF NOT EXISTS idx_free_lesson_selections_subscriber ON free_lesson_selections(subscriber_id);

CREATE INDEX IF NOT EXISTS idx_device_fingerprints_subscriber ON device_fingerprints(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_fingerprint ON device_fingerprints(fingerprint);

CREATE INDEX IF NOT EXISTS idx_workout_feedback_subscriber ON workout_feedback(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_workout_feedback_lesson ON workout_feedback(lesson_id);

CREATE INDEX IF NOT EXISTS idx_lesson_zones_zone ON lesson_zones(zone);
CREATE INDEX IF NOT EXISTS idx_complex_lessons_complex ON complex_lessons(complex_id);
CREATE INDEX IF NOT EXISTS idx_complex_lessons_lesson ON complex_lessons(lesson_id);
