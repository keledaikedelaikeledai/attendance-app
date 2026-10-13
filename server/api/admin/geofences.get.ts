import { asc } from 'drizzle-orm'
import { geoFence } from '~~/server/database/schemas'
import { requireAdminUser } from '../../utils/admin-access'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const db = useDb()
  const geofences = await db.select().from(geoFence).orderBy(asc(geoFence.createdAt))
  return { geofences }
})
