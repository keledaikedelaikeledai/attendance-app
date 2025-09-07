import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

export function useDb() {
  const client = createClient({
    url: process.env.NUXT_DB_URL as string,
    authToken: process.env.NUXT_DB_AUTH_TOKEN,
  })

  const db = drizzle({ client })

  return db
}
