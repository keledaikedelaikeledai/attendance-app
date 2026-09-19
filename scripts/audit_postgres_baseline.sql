-- Read-only PostgreSQL migration baseline audit.
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/audit_postgres_baseline.sql
--
-- This script intentionally makes no schema or data changes.

BEGIN TRANSACTION READ ONLY;

SELECT
  current_database() AS database_name,
  current_schema() AS current_schema,
  current_user AS database_user,
  version() AS postgres_version;

-- Drizzle migration ledger discovery.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND (
    c.relname ILIKE '%drizzle%'
    OR c.relname ILIKE '%migration%'
  )
ORDER BY n.nspname, c.relname;

-- Application tables expected from the PostgreSQL baseline and geofence work.
WITH expected(table_name) AS (
  VALUES
    ('account'),
    ('attendance_day'),
    ('attendance_log'),
    ('geo_fence'),
    ('session'),
    ('shift'),
    ('user'),
    ('verification')
)
SELECT
  e.table_name,
  CASE WHEN t.table_name IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status
FROM expected e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
 AND t.table_name = e.table_name
ORDER BY e.table_name;

-- Transitional table should normally be gone after 0003_geo_fence.sql.
SELECT
  'geo_config' AS table_name,
  CASE
    WHEN to_regclass('public.geo_config') IS NULL THEN 'ABSENT (expected after 0003)'
    ELSE 'PRESENT (investigate before replaying 0003)'
  END AS status;

-- Exact column shape for the tables that changed after the PostgreSQL baseline.
SELECT
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('attendance_day', 'attendance_log', 'geo_fence', 'shift')
ORDER BY table_name, ordinal_position;

-- Named constraints and their definitions.
SELECT
  rel.relname AS table_name,
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'c' THEN 'CHECK'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    ELSE con.contype::text
  END AS constraint_type,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname IN ('attendance_day', 'attendance_log', 'geo_fence')
ORDER BY rel.relname, con.conname;

-- Indexes relevant to the baseline.
SELECT
  tablename AS table_name,
  indexname AS index_name,
  indexdef AS definition
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('attendance_day', 'attendance_log', 'geo_fence', 'session', 'shift', 'user')
ORDER BY tablename, indexname;

-- Reconciliation checks for migrations 0004-0007.
WITH checks(check_name, status) AS (
  VALUES
    (
      '0004: geo_fence.interaction_mode',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'geo_fence'
          AND column_name = 'interaction_mode'
      ) THEN 'PRESENT' ELSE 'MISSING' END
    ),
    (
      '0004: attendance_log.geofence_comment',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'attendance_log'
          AND column_name = 'geofence_comment'
      ) THEN 'PRESENT' ELSE 'MISSING' END
    ),
    (
      '0005: attendance_log.geofence_id',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'attendance_log'
          AND column_name = 'geofence_id'
      ) THEN 'PRESENT' ELSE 'MISSING' END
    ),
    (
      '0005: attendance_log.geofence_name',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'attendance_log'
          AND column_name = 'geofence_name'
      ) THEN 'PRESENT' ELSE 'MISSING' END
    ),
    (
      '0006: attendance_log_type_check',
      CASE WHEN EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'attendance_log'
          AND con.conname = 'attendance_log_type_check'
      ) THEN 'PRESENT' ELSE 'MISSING' END
    ),
    (
      '0006: attendance_log_date_format_check',
      CASE WHEN EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'attendance_log'
          AND con.conname = 'attendance_log_date_format_check'
      ) THEN 'PRESENT' ELSE 'MISSING' END
    ),
    (
      '0006: attendance_log_shift_type_check',
      CASE WHEN EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'attendance_log'
          AND con.conname = 'attendance_log_shift_type_check'
      ) THEN 'PRESENT' ELSE 'MISSING' END
    ),
    (
      '0007: attendance_log.shift_start',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'attendance_log'
          AND column_name = 'shift_start'
      ) THEN 'PRESENT' ELSE 'MISSING' END
    ),
    (
      '0007: attendance_log.shift_end',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'attendance_log'
          AND column_name = 'shift_end'
      ) THEN 'PRESENT' ELSE 'MISSING' END
    )
)
SELECT check_name, status
FROM checks
ORDER BY check_name;

-- Validate existing rows before adding 0006 constraints.
SELECT
  'invalid attendance_log.type' AS check_name,
  count(*) AS invalid_rows
FROM attendance_log
WHERE type NOT IN ('clock-in', 'clock-out')
UNION ALL
SELECT
  'invalid attendance_log.date',
  count(*)
FROM attendance_log
WHERE date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
UNION ALL
SELECT
  'invalid attendance_log.shift_type',
  count(*)
FROM attendance_log
WHERE shift_type IS NOT NULL
  AND shift_type NOT IN ('harian', 'bantuan');

-- Row counts help confirm the audit ran against the intended database.
SELECT 'attendance_log' AS table_name, count(*) AS row_count FROM attendance_log
UNION ALL
SELECT 'attendance_day', count(*) FROM attendance_day
UNION ALL
SELECT 'user', count(*) FROM "user"
ORDER BY table_name;

ROLLBACK;
