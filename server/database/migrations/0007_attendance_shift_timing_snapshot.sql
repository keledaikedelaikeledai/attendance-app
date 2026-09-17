ALTER TABLE attendance_log
  ADD COLUMN IF NOT EXISTS shift_start text;

ALTER TABLE attendance_log
  ADD COLUMN IF NOT EXISTS shift_end text;
