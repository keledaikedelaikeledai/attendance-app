import { and, desc, eq } from 'drizzle-orm'
import { createError, getQuery } from 'h3'
import { attendanceDay, attendanceLog } from '~~/server/database/schemas'
import { isBusinessDate, formatBusinessDate, getCalendarDate } from '~~/shared/utils/attendance-date'
import { useDb } from '../../utils/db'
import { normalizeTimestampRaw } from '../../utils/time'

type Log = typeof attendanceLog.$inferSelect

type AttendanceDay = typeof attendanceDay.$inferSelect

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const userId = session.user.id

  const query = getQuery(event)
  const requestedDate = typeof query.date === 'string' ? query.date : undefined
  const timeZone = typeof query.timeZone === 'string' ? query.timeZone : undefined

  let today: string
  if (requestedDate && isBusinessDate(requestedDate)) {
    today = requestedDate
  }
  else {
    if (!timeZone) throw createError({ statusCode: 400, statusMessage: 'timeZone required' })
    try {
      today = formatBusinessDate(getCalendarDate(new Date(), timeZone))
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid timeZone' })
    }
  }

  const db = useDb()
  const [day] = await db.select().from(attendanceDay)
    .where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, today))).limit(1)

  const logs = await db.select().from(attendanceLog)
    .where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, today)))
    .orderBy(desc(attendanceLog.timestamp))

  let stateDay: AttendanceDay | undefined = day
  let stateLogs: Log[] = logs
  let clockIn = stateLogs.find(l => l.type === 'clock-in')
  let clockOut = stateLogs.find(l => l.type === 'clock-out' && (!clockIn || normalizeTimestampRaw(l.timestamp) > normalizeTimestampRaw(clockIn.timestamp)))

  // A valid open session may belong to the previous business date after midnight.
  if (!clockIn || clockOut) {
    try {
      const recentLogs = await db.select().from(attendanceLog)
        .where(eq(attendanceLog.userId, userId))
        .orderBy(desc(attendanceLog.timestamp)).limit(200)
      const asc = [...recentLogs].sort((a, b) => normalizeTimestampRaw(a.timestamp) - normalizeTimestampRaw(b.timestamp)) as Log[]
      let openClockIn: Log | undefined
      for (const log of asc) {
        if (log.type === 'clock-in') openClockIn = log
        else if (log.type === 'clock-out' && openClockIn) openClockIn = undefined
      }

      if (openClockIn?.date) {
        const openDateLogs = await db.select().from(attendanceLog)
          .where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, openClockIn.date)))
          .orderBy(desc(attendanceLog.timestamp)) as Log[]
        const [openDay] = await db.select().from(attendanceDay)
          .where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, openClockIn.date))).limit(1)
        stateDay = openDay
        stateLogs = openDateLogs.length ? openDateLogs : [openClockIn]
        clockIn = openClockIn
        clockOut = undefined
      }
    }
    catch {
      // Preserve the requested business-date state if the defensive lookup fails.
    }
  }

  const hasActiveSession = Boolean(clockIn && !clockOut)
  const resolvedSelectedShiftCode = hasActiveSession
    ? (clockIn?.shiftCode ?? stateDay?.selectedShiftCode ?? null)
    : (stateDay?.selectedShiftCode ?? clockIn?.shiftCode ?? null)
  const resolvedShiftType = hasActiveSession
    ? (clockIn?.shiftType ?? stateDay?.shiftType ?? null)
    : (stateDay?.shiftType ?? clockIn?.shiftType ?? null)

  return {
    date: today,
    selectedShiftCode: resolvedSelectedShiftCode,
    shiftType: resolvedShiftType,
    clockedIn: hasActiveSession,
    clockInTime: clockIn ? new Date(normalizeTimestampRaw(clockIn.timestamp)).toISOString() : undefined,
    clockOutTime: clockOut ? new Date(normalizeTimestampRaw(clockOut.timestamp)).toISOString() : undefined,
    logs: stateLogs,
  }
})
