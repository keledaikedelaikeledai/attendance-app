import { randomUUID } from 'node:crypto'
import { readBody } from 'h3'
import { geoFence } from '~~/server/database/schemas'
import { trackServerEvent } from '../../../modules/error-reporting/runtime/server/utils/error-reporting'
import { requireAdminUser } from '../../utils/admin-access'
import { useDb } from '../../utils/db'
import { parseGeofenceInput } from '../../utils/geofence-input'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const body = await readBody<any>(event)
  const input = parseGeofenceInput(body)

  const now = new Date()
  const db = useDb()
  const payload = {
    id: randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(geoFence).values(payload)

  const log = useLogger()
  log.info({ name: input.name, type: input.type, isActive: input.isActive, interactionMode: input.interactionMode }, 'Geofence created')
  trackServerEvent('admin.geofence.create', { name: input.name, type: input.type })

  return { geofence: payload }
})
