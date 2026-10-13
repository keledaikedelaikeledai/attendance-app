import process from 'node:process'
import { eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { geoFence } from '~~/server/database/schemas'
import { useDb } from '../../../utils/db'
import { parseGeofenceInput } from '../../../utils/geofence-input'

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
