import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { createError, readBody } from 'h3'
import { geoFence } from '~~/server/database/schemas'
import { trackServerEvent } from '../../../modules/error-reporting/runtime/server/utils/error-reporting'
import { useDb } from '../../utils/db'
import { parseGeofenceInput } from '../../utils/geofence-input'

function isAllowedAdmin(email?: string | null) {
  const raw = process.env.NUXT_ADMIN_EMAILS || ''
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (!list.length)
    return true
  if (!email)
    return false
  return list.includes(String(email).toLowerCase())
}

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (!isAllowedAdmin(session.user.email))
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

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
