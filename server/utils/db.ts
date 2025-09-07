import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

export function useDb() {
  const client = createClient({
    // eslint-disable-next-line node/prefer-global/process
    url: process.env.NUXT_DB_URL as string,
    // eslint-disable-next-line node/prefer-global/process
    authToken: process.env.NUXT_DB_AUTH_TOKEN,
  })

  const db = drizzle({ client })

  return db
}
