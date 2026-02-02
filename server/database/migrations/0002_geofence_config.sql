CREATE TABLE IF NOT EXISTS "geo_config" (
  "id" text PRIMARY KEY NOT NULL DEFAULT 'global',
  "use_radius" boolean NOT NULL DEFAULT false,
  "type" text NOT NULL DEFAULT 'point',
  "center_lat" double precision,
  "center_lng" double precision,
  "radius_meters" double precision,
  "polygon" jsonb,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT "geo_config_type_check" CHECK ("type" IN ('point','polygon'))
);

INSERT INTO "geo_config" ("id", "use_radius", "type", "radius_meters", "created_at", "updated_at")
VALUES ('global', false, 'point', 100, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
