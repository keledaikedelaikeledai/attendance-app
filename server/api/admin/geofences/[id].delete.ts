import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { geoFence } from '~~/server/database/schemas'
import { trackServerEvent } from '../../../../modules/error-reporting/runtime/server/utils/error-reporting'
import { requireAdminUser } from '../../../utils/admin-access'
import { useDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const id = event.context.params?.id
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing geofence id' })

  const db = useDb()
  await db.delete(geoFence).where(eq(geoFence.id, id))

  const log = useLogger()
  log.info({ id }, 'Geofence deleted')
  trackServerEvent('admin.geofence.delete', { id })

  return { ok: true }
})
