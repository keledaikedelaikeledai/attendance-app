import process from 'node:process'
import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { geoFence } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'

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

  const db = useDb()
  const [config] = await db.select().from(geoFence).where(eq(geoFence.id, 'global')).limit(1)
  if (!config) {
    throw createError({ statusCode: 404, statusMessage: 'Global geofence not found' })
  }

  return { config }
})
