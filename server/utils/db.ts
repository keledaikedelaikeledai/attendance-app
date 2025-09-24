import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

let _client: ReturnType<typeof createClient> | null = null
let _db: ReturnType<typeof drizzle> | null = null

export function useDb() {
  if (!_client) {
    _client = createClient({
      url: 'file:./sqlite.db',
    })
    // _client = createClient({
    // // eslint-disable-next-line node/prefer-global/process
    //   url: process.env.NUXT_DB_URL as string,
    //   // eslint-disable-next-line node/prefer-global/process
    //   authToken: process.env.NUXT_DB_AUTH_TOKEN,
    // })
  }

  if (!_db) {
    _db = drizzle({ client: _client })
  }

  return _db
}
