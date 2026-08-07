import { sql } from 'drizzle-orm'
import { trackServerEvent, trackServerException } from '../../modules/error-reporting/runtime/server/utils/error-reporting'

export default defineNitroPlugin(async () => {
  const log = useLogger()

  try {
    const db = useDb()
    await db.execute(sql`select 1`)
    log.info('Startup: DB connection OK')
    trackServerEvent('app.startup', { db: 'connected' })
  }
  catch (err) {
    log.error({ err }, 'Startup: DB connection FAILED')
    trackServerException(err, { context: 'app.startup', db: 'connection_failed' })
  }
})
