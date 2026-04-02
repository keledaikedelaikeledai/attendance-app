import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { createError, getQuery } from 'h3'
import { attendanceDay, attendanceLog } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'
import { normalizeTimestampRaw } from '../../utils/time'

type Log = typeof attendanceLog.$inferSelect

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const userId = session.user.id

  const date = getQuery(event).date as string | undefined
  const tzOffsetRaw = getQuery(event).tzOffset as string | undefined
  const tzOffset = typeof tzOffsetRaw === 'string' && tzOffsetRaw !== '' ? Number(tzOffsetRaw) : undefined
  const today = date || new Date().toISOString().slice(0, 10)

  const db = useDb()
  const [day] = await db
    .select()
    .from(attendanceDay)
    .where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, today)))
    .limit(1)

  let logs: any[] = []
  if (date && typeof tzOffset === 'number' && !Number.isNaN(tzOffset)) {
    // Interpret the provided date as the client's local date. Compute UTC range
    // for that local day using the provided tzOffset (minutes, same as Date.getTimezoneOffset()).
    const [yy, mm, dd] = date.split('-').map(Number)
    const startUtcMs = Date.UTC(yy, mm - 1, dd, 0, 0, 0) + tzOffset * 60000
    const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000 - 1
    const startUtc = new Date(startUtcMs)
    const endUtc = new Date(endUtcMs)
    // Timestamp values in DB may be stored in seconds or ms. Normalize in-memory by fetching by date range
    // (fall back to date equality when timestamp numeric comparisons are unreliable for cross-db stores).
    try {
      logs = await db
        .select()
        .from(attendanceLog)
        .where(and(eq(attendanceLog.userId, userId), gte(attendanceLog.timestamp, startUtc), lte(attendanceLog.timestamp, endUtc)))
        .orderBy(desc(attendanceLog.timestamp))
    }
    catch {
      // Some DB drivers reject comparing numeric column to Date objects; fall back to date equality
      logs = await db
        .select()
        .from(attendanceLog)
        .where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, today)))
        .orderBy(desc(attendanceLog.timestamp))
    }
  }
  else {
    logs = await db
      .select()
      .from(attendanceLog)
      .where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, today)))
      .orderBy(desc(attendanceLog.timestamp))
  }

  // derive state from today's logs first
  let stateDay: any = day
  let stateLogs: Log[] = logs as Log[]
  let clockIn = stateLogs.find((l: Log) => l.type === 'clock-in')
  let clockOut = stateLogs.find((l: Log) => l.type === 'clock-out' && (!clockIn || normalizeTimestampRaw(l.timestamp) > normalizeTimestampRaw(clockIn.timestamp)))

  // Fallback for cross-day / stale-open sessions:
  // If today's slice has no active session, inspect recent logs globally and find
  // the latest unmatched clock-in (no later clock-out). This makes button state
  // robust across midnight and even after scheduled shift end until explicit clock-out.
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
          if (l.type === 'clock-in') {
            openClockIn = l
          }
          else if (l.type === 'clock-out' && openClockIn && normalizeTimestampRaw(l.timestamp) >= normalizeTimestampRaw(openClockIn.timestamp)) {
            openClockIn = null
          }
        }

        if (openClockIn) {
          const openDate = (openClockIn as any).date as string | undefined
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
      // keep today's state on fallback errors
    }
  }

  const hasActiveSession = Boolean(clockIn && !clockOut)
  // While clocked in, the shift attached to the open clock-in log is source of truth.
  // attendance_day.selectedShiftCode may be changed later by UI selection and should not
  // override an already-open session's shift.
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
