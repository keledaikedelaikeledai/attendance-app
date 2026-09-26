# Production PostgreSQL baseline procedure

This runbook is for the existing production database `attendance_prod`.

## Why a fresh baseline is needed

The production database was created outside a complete Drizzle migration ledger. The read-only audit confirmed:

- all expected application tables are present
- `0004` and `0005` geofence changes are present
- `0006` constraints are not present
- `0007` shift timing columns are not present
- there is no `drizzle.__drizzle_migrations` table
- existing attendance data currently passes the proposed `0006` validation checks

Do not try to replay `0000` through `0005`.

## Phase 1 — Backup

Take a PostgreSQL custom-format dump before changing migration metadata or schema:

```bash
pg_dump -Fc -d attendance_prod -f ~/attendance/attendance_prod_pre_baseline.dump
```

Verify it exists and has a non-zero size:

```bash
ls -lh ~/attendance/attendance_prod_pre_baseline.dump
```

For an additional restore-confidence check, list the archive contents:

```bash
pg_restore -l ~/attendance/attendance_prod_pre_baseline.dump | head -40
```

Copy the dump to a trusted local machine before continuing.

## Phase 2 — Generate a baseline from the live schema

This repository includes `drizzle.baseline.config.ts` for a one-time introspection. It writes to a separate directory so the existing migration history is not overwritten while the baseline is being reviewed.

From a checkout containing this branch:

```bash
rm -rf server/database/migrations.production-baseline

DATABASE_URL='postgresql://...' \
  bunx drizzle-kit pull --init \
  --config drizzle.baseline.config.ts
```

The command is intentionally pointed at the live database. Drizzle's `pull --init` workflow is designed to introspect an existing database and mark the resulting initial schema as the migration baseline.

**Important:** `--init` is not read-only. It creates the Drizzle migration ledger and records the generated baseline as applied. Therefore, do not run it until the backup has been copied off the server.

## Phase 3 — Review before replacing the repository history

The generated directory should contain a baseline SQL file and `meta/_journal.json` / snapshot metadata.

Review the generated baseline against the audit. It should represent the live production schema, including the currently present geofence columns and constraints, but it should not contain `shift_start`, `shift_end`, or the proposed `0006` attendance-log checks because those are currently absent from production.

Do **not** merge the generated baseline into `server/database/migrations/` yet.

## Phase 4 — Next reconciliation PR

After the generated baseline artifacts are available, the repository migration history can be rebuilt around that exact production baseline:

1. preserve the generated baseline SQL and snapshot as the new migration `0000`
2. preserve the current application schema in `server/database/schemas/`
3. generate a new forward migration containing only the differences between production and the current application schema
4. verify that this forward migration contains the intended `0006` constraints and `0007` columns
5. test the generated migration against a restored copy of the production backup
6. only then use the migration against production

The old PostgreSQL `0000`–`0005` files should not be replayed against production. They are historical evidence of how the schema evolved, not an executable prefix for the current production database.

## Do not do these yet

- do not run `bun run db:push` against production
- do not enable automatic migration at container startup
- do not run `bun run db:migrate` against production before the new baseline is reviewed
- do not delete the production backup
