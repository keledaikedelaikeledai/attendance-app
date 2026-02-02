import process from 'node:process'
import { createError } from 'h3'
import { geoConfig } from '~~/server/database/schemas'
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
  let [config] = await db.select().from(geoConfig).limit(1)
  if (!config) {
    await db.insert(geoConfig).values({ id: 'global', useRadius: false, type: 'point', radiusMeters: 100 })
    ;[config] = await db.select().from(geoConfig).limit(1)
  }

  return { config }
})
