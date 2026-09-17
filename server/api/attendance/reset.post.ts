import { and, eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay, attendanceLog } from '~~/server/database/schemas'
import { formatBusinessDate, getCalendarDate } from '~~/shared/utils/attendance-date'
import { trackServerEvent } from '../../../modules/error-reporting/runtime/server/utils/error-reporting'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const { timeZone } = body as { timeZone?: string }
  if (!timeZone) throw createError({ statusCode: 400, statusMessage: 'timeZone required' })

  const now = new Date()
  let theDate: string
  try {
    theDate = formatBusinessDate(getCalendarDate(now, timeZone))
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeZone' })
  }

  const db = useDb()
  const userId = session.user.id
  await db.delete(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, theDate)))
  await db.delete(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, theDate)))

  const log = useLogger()
  log.warn({ userId, date: theDate }, 'Attendance data DELETED for date')
  trackServerEvent('attendance.reset', { userId, date: theDate })

  return { date: theDate, logs: [], selectedShiftCode: null, shiftType: null }
})
