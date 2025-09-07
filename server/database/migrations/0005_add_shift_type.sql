-- Add shift_type enum-like text column with check constraint and default
ALTER TABLE attendance_day ADD COLUMN shift_type TEXT NOT NULL DEFAULT 'harian';

-- SQLite cannot add check constraint to existing column directly; use a trigger or leave logical check to application.
-- For clarity, application-level constraint is enforced via Drizzle `check` in schema.
