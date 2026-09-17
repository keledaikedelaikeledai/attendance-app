ALTER TABLE "attendance_log"
  ADD CONSTRAINT "attendance_log_type_check" CHECK ("type" IN ('clock-in', 'clock-out'));

ALTER TABLE "attendance_log"
  ADD CONSTRAINT "attendance_log_date_format_check" CHECK ("date" ~ '^\\d{4}-\\d{2}-\\d{2}$');

ALTER TABLE "attendance_log"
  ADD CONSTRAINT "attendance_log_shift_type_check" CHECK ("shift_type" IS NULL OR "shift_type" IN ('harian', 'bantuan'));
