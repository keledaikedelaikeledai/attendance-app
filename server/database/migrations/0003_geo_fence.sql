CREATE TABLE IF NOT EXISTS "geo_fence" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "use_radius" boolean NOT NULL DEFAULT false,
  "type" text NOT NULL DEFAULT 'point',
  "center_lat" double precision,
  "center_lng" double precision,
  "radius_meters" double precision,
  "polygon" jsonb,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT "geo_fence_type_check" CHECK ("type" IN ('point','polygon'))
);

INSERT INTO "geo_fence" ("id", "name", "use_radius", "type", "center_lat", "center_lng", "radius_meters", "polygon", "created_at", "updated_at")
SELECT
  COALESCE("id", 'global') AS id,
  'Global' AS name,
  "use_radius",
  "type",
  "center_lat",
  "center_lng",
  "radius_meters",
  "polygon",
  COALESCE("created_at", NOW()),
  COALESCE("updated_at", NOW())
FROM "geo_config"
ON CONFLICT ("id") DO NOTHING;

DROP TABLE IF EXISTS "geo_config";
