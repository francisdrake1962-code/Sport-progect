-- 011: catalog columns for the 3-column lesson catalog
-- Column 1: title + theme (topic of the lesson)
-- Column 2: goals (what the lesson aims for)
-- Column 3: effect_description (already exists)
-- sort_order: ordering for lessons outside of complexes

ALTER TABLE lessons ADD COLUMN theme TEXT;
ALTER TABLE lessons ADD COLUMN goals TEXT;
ALTER TABLE lessons ADD COLUMN sort_order INTEGER;
