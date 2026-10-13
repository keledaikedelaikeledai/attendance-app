// Runs pending drizzle migrations at container boot, before the server
// starts. Uses drizzle's own migrator so the journal (drizzle.__drizzle_migrations
// hash + created_at) stays 100% compatible with `bun run db:migrate` run from
// a workstation - whichever applies first, the other sees it as done.
//
// Failure semantics: any migration error exits non-zero, and the Dockerfile
// CMD chains this script with && so the server simply never starts on a
// broken schema - visible crash-loop instead of silently serving 500s.
// Escape hatch: SKIP_MIGRATIONS=1 skips the run for emergencies.
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

if (process.env.SKIP_MIGRATIONS === '1') {
  console.log('[migrate] SKIP_MIGRATIONS=1 - skipping schema migration')
  process.exit(0)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] DATABASE_URL is required')
  process.exit(1)
}

const pool = new Pool({
  connectionString: url,
  connectionTimeoutMillis: 10_000,
  max: 2,
})

try {
  const db = drizzle(pool)
  await migrate(db, { migrationsFolder: './server/database/migrations' })
  console.log('[migrate] schema up to date')
}
catch (err) {
  console.error('[migrate] FAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
}
finally {
  await pool.end()
}
