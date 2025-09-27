-- Migration: add shift_type column to attendance_log
-- Adds a nullable text column `shift_type` (values: 'harian'|'bantuan')
ALTER TABLE attendance_log ADD COLUMN shift_type TEXT;

-- Note: SQLite cannot add CHECK constraints to existing tables easily; application enforces allowed values.
