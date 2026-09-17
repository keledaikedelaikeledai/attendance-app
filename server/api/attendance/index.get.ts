import { and, desc, eq } from 'drizzle-orm'
import { createError, getQuery } from 'h3'
import { attendanceDay, attendanceLog } from '~~/server/database/schemas'
import { isYmd, localNowYmdFromOffset } from '~~/server/utils/local-date'
import { formatBusinessDate, getCalendarDate } from '~~/shared/utils/attendance-date'
import { useDb } from '../../utils/db'
import { normalizeTimestampRaw } from '../../utils/time'

type Log = typeof attendanceLog.$inferSelect

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const userId = session.user.id

  const query = getQuery(event)
  const requestedDate = typeof query.date === 'string' ? query.date : undefined
  const timeZone = typeof query.timeZone === 'string' ? query.timeZone : undefined
  const tzOffsetRaw = typeof query.tzOffset === 'string' ? query.tzOffset : undefined
  const parsedTzOffset = tzOffsetRaw !== undefined ? Number(tzOffsetRaw) : undefined
  const tzOffset = typeof parsedTzOffset === 'number' && Number.isFinite(parsedTzOffset) ? parsedTzOffset : new Date().getTimezoneOffset()

  let today: string
  if (requestedDate && isYmd(requestedDate)) {
    today = requestedDate
  }
  else if (timeZone) {
    try {
      today = formatBusinessDate(getCalendarDate(new Date(), timeZone))
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid timeZone' })
    }
  }
  else {
    today = localNowYmdFromOffset(new Date(), tzOffset)
  }

  const db = useDb()
  const [day] = await db
    .select()
    .from(attendanceDay)
    .where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, today)))
    .limit(1)

  // `attendanceLog.date` is the authoritative attendance/business date.
  // Do not reconstruct a day from timestamps: an overnight event may have a
  // timestamp on the following calendar date while still belonging to today.
  let logs = await db
    .select()
    .from(attendanceLog)
    .where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, today)))
    .orderBy(desc(attendanceLog.timestamp))

  // Derive state from the requested business date first.
  let stateDay: any = day
  let stateLogs: Log[] = logs as Log[]
  let clockIn = stateLogs.find((l: Log) => l.type === 'clock-in')
  let clockOut = stateLogs.find((l: Log) => l.type === 'clock-out' && (!clockIn || normalizeTimestampRaw(l.timestamp) > normalizeTimestampRaw(clockIn.timestamp)))

  // If today's business-date slice has no active session, inspect recent logs
  // for the latest unmatched clock-in. This keeps an overnight session active
  // after calendar midnight without changing its business date.
  if (!clockIn || clockOut) {
    try {
      const recentLogs = await db
        .select()
        .from(attendanceLog)
        .where(eq(attendanceLog.userId, userId))
        .orderBy(desc(attendanceLog.timestamp))
        .limit(200)

      if (recentLogs.length) {
        const asc = [...recentLogs].sort((a, b) => normalizeTimestampRaw(a.timestamp) - normalizeTimestampRaw(b.timestamp)) as Log[]
        let openClockIn: Log | null = null
        for (const l of asc) {
          if (l.type === 'clock-in') openClockIn = l
          else if (l.type === 'clock-out' && openClockIn && normalizeTimestampRaw(l.timestamp) >= normalizeTimestampRaw(openClockIn.timestamp)) openClockIn = null
        }

        if (openClockIn) {
          const openDate = openClockIn.date
          let openDateLogs: Log[] = []
          if (openDate) {
            openDateLogs = await db
              .select()
              .from(attendanceLog)
              .where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, openDate)))
              .orderBy(desc(attendanceLog.timestamp)) as Log[]
          }
          const [openDay] = openDate
            ? await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, openDate))).limit(1)
            : [undefined]

          stateDay = openDay
          stateLogs = openDateLogs.length ? openDateLogs : [openClockIn]
          clockIn = openClockIn
          clockOut = undefined
        }
      }
    }
    catch {
      // Keep the requested business-date state if fallback lookup fails.
    }
  }

  const hasActiveSession = Boolean(clockIn && !clockOut)
  const resolvedSelectedShiftCode = hasActiveSession
    ? (((clockIn as any)?.shiftCode ?? stateDay?.selectedShiftCode) ?? null)
    : (stateDay?.selectedShiftCode ?? ((clockIn as any)?.shiftCode ?? null))
  const resolvedShiftType = hasActiveSession
    ? (((clockIn as any)?.shiftType ?? (stateDay as any)?.shiftType) ?? null)
    : (((stateDay as any)?.shiftType ?? (clockIn as any)?.shiftType) ?? null)

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
