ALTER TABLE "geo_fence" RENAME COLUMN "use_radius" TO "is_active";

ALTER TABLE "geo_fence"
  ADD COLUMN IF NOT EXISTS "interaction_mode" text NOT NULL DEFAULT 'disallow';

ALTER TABLE "geo_fence"
  ADD CONSTRAINT "geo_fence_interaction_mode_check" CHECK ("interaction_mode" IN ('disallow','allow','allow_with_comment'));

ALTER TABLE "attendance_log"
  ADD COLUMN IF NOT EXISTS "geofence_comment" text;
