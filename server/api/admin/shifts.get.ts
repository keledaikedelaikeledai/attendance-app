import { asc } from 'drizzle-orm'
import { shift } from '~~/server/database/schemas'
import { requireAdminUser } from '../../utils/admin-access'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const db = useDb()
  const rows = await db.select().from(shift).orderBy(asc(shift.sortOrder))
  return rows
})
