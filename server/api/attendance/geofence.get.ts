import { createError } from 'h3'
import { geoConfig } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const db = useDb()
  let [config] = await db.select().from(geoConfig).limit(1)
  if (!config) {
    await db.insert(geoConfig).values({ id: 'global', useRadius: false, type: 'point', radiusMeters: 100 })
    ;[config] = await db.select().from(geoConfig).limit(1)
  }

  return { config }
})
