import { and, asc, eq } from 'drizzle-orm'
import { shift } from '~~/server/database/schemas'
import { useDb } from '../utils/db'

export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db
    .select()
    .from(shift)
    .where(and(eq(shift.active, 1 as any)))
    .orderBy(asc(shift.sortOrder))
  return rows
})
