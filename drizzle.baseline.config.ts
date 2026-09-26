import { defineConfig } from 'drizzle-kit'

/**
 * One-time production baseline introspection.
 *
 * Do not use this as the normal application migration config.
 * Run only after taking a verified production backup.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/database/schemas/index.ts',
  out: './server/database/migrations.production-baseline',
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
  schemaFilter: ['public'],
})
