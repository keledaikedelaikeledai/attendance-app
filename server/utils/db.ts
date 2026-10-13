import process from 'node:process'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg, { Pool } from 'pg'

// `timestamp` columns in this schema are naive (WITHOUT TIME ZONE) and hold
// Asia/Jakarta wall-clock - the DB session timezone. node-pg otherwise parses
// such strings in the Node process' own timezone, so a UTC dev shell reads a
// midnight clock-in as 07:00 and flags a sub-minute shift-start delay as
// "Late 0 min" everywhere. Anchor the interpretation to the business
// timezone; Jakarta has no DST, so the offset is stable.
const BUSINESS_TZ = process.env.BUSINESS_TZ || 'Asia/Jakarta'

function businessUtcOffsetSuffix(): string {
  const now = new Date()
  const inTz = new Date(now.toLocaleString('en-US', { timeZone: BUSINESS_TZ }))
  const offsetMin = Math.round((inTz.getTime() - now.getTime()) / 60_000)
  const sign = offsetMin < 0 ? '-' : '+'
  const abs = Math.abs(offsetMin)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

const OFFSET_SUFFIX = businessUtcOffsetSuffix()

// pg type OID 1114 = timestamp without time zone. timestamptz (1184) carries
// its own offset and keeps the default parser.
pg.types.setTypeParser(1114, (value: string) => {
  if (!value)
    return null
  return new Date(`${value.replace(' ', 'T')}${OFFSET_SUFFIX}`)
})

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
