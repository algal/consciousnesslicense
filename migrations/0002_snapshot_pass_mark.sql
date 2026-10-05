-- Existing v1.0 attempts required 12 correct. New attempts explicitly snapshot their threshold.
ALTER TABLE attempts ADD COLUMN pass_mark INTEGER NOT NULL DEFAULT 12;
