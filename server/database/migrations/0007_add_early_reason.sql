-- Migration: add early_reason column to attendance_log
-- Adds a nullable text column `early_reason` to store optional short reason when user clocks out early
ALTER TABLE attendance_log ADD COLUMN early_reason TEXT;
