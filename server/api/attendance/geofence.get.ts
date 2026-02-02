import { createError } from 'h3'
import { geoFence } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const db = useDb()
  const geofences = await db.select().from(geoFence)
  return { geofences }
})
