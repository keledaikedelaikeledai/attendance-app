import { sql } from 'drizzle-orm'
import { createError } from 'h3'
import { useDb } from '../../utils/db'

export default defineEventHandler(async () => {
  try {
    const db = useDb()
    await db.execute(sql`select 1`)
    return {
      ok: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    }
  }
  catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: `db unhealthy: ${err?.message || String(err)}` })
  }
})
