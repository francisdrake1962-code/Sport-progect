-- 013: intensity — lesson load level for balanced manual scheduling
-- Values: low (щадящая), medium (средняя), high (интенсивная). Empty = not set.

ALTER TABLE lessons ADD COLUMN intensity TEXT;
