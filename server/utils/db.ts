import process from 'node:process'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

let _pool: Pool | null = null
let _db: ReturnType<typeof drizzle> | null = null

export function useDb() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL as string,
    })
  }

  if (!_db) {
    _db = drizzle({ client: _pool })
  }

  return _db
}
