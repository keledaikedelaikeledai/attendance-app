ALTER TABLE "attendance_log"
  ADD COLUMN IF NOT EXISTS "geofence_id" text,
  ADD COLUMN IF NOT EXISTS "geofence_name" text;
