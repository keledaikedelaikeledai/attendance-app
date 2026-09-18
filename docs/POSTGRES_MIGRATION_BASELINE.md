# PostgreSQL migration baseline reconciliation

## Why this exists

The repository's PostgreSQL migration directory is not a complete Drizzle migration history.

The project moved from SQLite/Turso to PostgreSQL in commit `c2ca04a7` (`feat: switch db to postgres`). That change:

- archived the SQLite migration history under `server/database/migrations.sqlite.backup/`
- generated a new PostgreSQL baseline, `0000_gifted_magus.sql`
- added the hand-authored seed migration `0001_seed_shifts.sql`
- changed `drizzle.config.ts` to PostgreSQL

The PostgreSQL Drizzle journal currently records only `0000_gifted_magus`, while SQL files `0001` through `0007` also exist. Later feature migrations were added directly as SQL files and were not added to the Drizzle journal/snapshot chain.

Production was also established outside a normal Drizzle migration ledger: the live PostgreSQL database has application data and later geofence schema changes but no discovered `__drizzle_migrations` table.

Because of that mismatch, do **not** assume that `drizzle-kit migrate` can reconstruct production history, and do **not** use `drizzle-kit push` against the existing production database as a migration substitute.

## Current migration map

| Migration | Repository evidence | Production reconciliation |
| --- | --- | --- |
| `0000_gifted_magus.sql` | Generated PostgreSQL baseline | Core tables are present |
| `0001_seed_shifts.sql` | Hand-authored/idempotent seed | Shift table is present; seed rows are data, not a schema baseline |
| `0002_geofence_config.sql` | Hand-authored feature migration | Transitional `geo_config` should not remain |
| `0003_geo_fence.sql` | Hand-authored feature migration | `geo_fence` is present |
| `0004_geofence_policy.sql` | Hand-authored feature migration | Known live columns include `interaction_mode` and `geofence_comment` |
| `0005_geofence_log.sql` | Hand-authored feature migration | Known live columns include `geofence_id` and `geofence_name` |
| `0006_attendance_log_constraints.sql` | Hand-authored integrity migration | Must be verified before application |
| `0007_attendance_shift_timing_snapshot.sql` | Hand-authored history migration | Known live schema did not yet contain `shift_start` / `shift_end` |

The table above is a reconciliation aid, not a replacement for checking the live database.

## Safe audit

Run the read-only audit against the target PostgreSQL database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/audit_postgres_baseline.sql \
  > baseline-audit.txt
```

The script opens a `READ ONLY` transaction and finishes with `ROLLBACK`. It reports:

- database identity
- any migration/Drizzle ledger tables
- required application tables
- relevant columns and types
- constraints
- indexes
- presence of the schema changes from `0004` through `0007`
- invalid rows that would prevent the `0006` constraints from being added
- row counts to help confirm the intended database was audited

## Decision gate

Do not alter the Drizzle journal or create a production migration ledger until the audit output confirms the exact live state.

After the audit, classify each migration as one of:

1. **Already represented by the live schema** — baseline it; do not replay it.
2. **Missing and safe to apply** — include it in the forward reconciliation plan.
3. **Different from the repository definition** — investigate and reconcile explicitly before any migration runner is enabled.

For the currently known production state, the expected candidates for forward application are `0006` (after its data checks pass) and `0007`. That expectation must be confirmed by the audit rather than assumed.

## Production safety rules

Until reconciliation is complete:

- do not run `bun run db:push` against the existing production database
- do not enable automatic `bun run db:migrate` at container startup
- do not replay `0000` through `0005` against production
- take a PostgreSQL backup before the first schema-changing reconciliation step
- stop if the audit reports unexpected objects, missing core tables, or invalid rows for the proposed constraints

Once the live state is confirmed, create a separate change that establishes the baseline and applies only the verified forward migrations.
