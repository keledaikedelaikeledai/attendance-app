import { eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { geoFence } from '~~/server/database/schemas'
import { requireAdminUser } from '../../../utils/admin-access'
import { useDb } from '../../../utils/db'
import { parseGeofenceInput } from '../../../utils/geofence-input'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const id = event.context.params?.id
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing geofence id' })

  const body = await readBody<any>(event)
  const input = parseGeofenceInput(body)

  const now = new Date()
  const db = useDb()
  const [existing] = await db.select().from(geoFence).where(eq(geoFence.id, id)).limit(1)
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Geofence not found' })

  await db.update(geoFence).set({ ...input, updatedAt: now }).where(eq(geoFence.id, id))
  const [geofence] = await db.select().from(geoFence).where(eq(geoFence.id, id)).limit(1)
  return { geofence }
})
