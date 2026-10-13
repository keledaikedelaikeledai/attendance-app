import { desc } from 'drizzle-orm'
import { user } from '~~/server/database/schemas'
import { requireAdminUser } from '../../utils/admin-access'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const db = useDb()
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, username: user.username, createdAt: user.createdAt })
    .from(user)
    .orderBy(desc(user.createdAt))

  return rows
})
