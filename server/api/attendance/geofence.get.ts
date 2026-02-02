import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { geoFence } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const db = useDb()
  let [global] = await db.select().from(geoFence).where(eq(geoFence.id, 'global')).limit(1)
  if (!global) {
    await db.insert(geoFence).values({ id: 'global', name: 'Global', isActive: false, type: 'point', radiusMeters: 100, interactionMode: 'disallow' })
    ;[global] = await db.select().from(geoFence).where(eq(geoFence.id, 'global')).limit(1)
  }

  const geofences = await db.select().from(geoFence)
  return { geofences }
})
