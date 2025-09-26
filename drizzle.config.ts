import process from 'node:process'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'turso',
  schema: './server/database/schemas/index.ts',
  out: './server/database/migrations',
  dbCredentials: {
    url: process.env.NUXT_DB_URL as string,
    authToken: process.env.NUXT_DB_AUTH_TOKEN as string,
    // url: 'file:./sqlite.db',
  },
})
