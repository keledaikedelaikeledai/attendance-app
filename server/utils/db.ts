import { createRequire } from 'node:module'
import process from 'node:process'

type CreateClientFn = (config: {
  url: string
  authToken?: string
}) => unknown

type DrizzleFn = (config: { client: unknown }) => unknown

const require = createRequire(import.meta.url)

const rawDbUrl = process.env.NUXT_DB_URL ?? ''
const driverOverride = (process.env.NUXT_DB_DRIVER ?? '').toLowerCase()
const shouldUseSqlite3 = driverOverride === 'sqlite3'
  || (!driverOverride && (rawDbUrl.startsWith('file:') || rawDbUrl.startsWith(':memory:')))

let createClient: CreateClientFn
let drizzle: DrizzleFn

if (shouldUseSqlite3) {
  const clientModule = require('@libsql/client/sqlite3') as { createClient: CreateClientFn }
  const drizzleModule = require('drizzle-orm/libsql') as { drizzle: DrizzleFn }
  createClient = clientModule.createClient
  drizzle = drizzleModule.drizzle
}
else {
  const clientModule = require('@libsql/client/http') as { createClient: CreateClientFn }
  const drizzleModule = require('drizzle-orm/libsql/web') as { drizzle: DrizzleFn }
  createClient = clientModule.createClient
  drizzle = drizzleModule.drizzle
}

let _client: ReturnType<CreateClientFn> | null = null
let _db: ReturnType<DrizzleFn> | null = null

export function useDb() {
  if (!_client) {
    _client = createClient({
      url: process.env.NUXT_DB_URL as string,
      authToken: process.env.NUXT_DB_AUTH_TOKEN,
    })
  }

  if (!_db) {
    _db = drizzle({ client: _client }) as ReturnType<DrizzleFn>
  }

  return _db
}
