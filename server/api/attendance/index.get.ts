import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { createError, getQuery } from 'h3'
import { attendanceDay, attendanceLog, shift } from '~~/server/database/schemas'
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

  // Cross-midnight handling:
  // If today has no active session, check previous date for an open clock-in whose
  // shift spans midnight and hasn't reached its end time in the client's timezone.
  if (!clockIn || clockOut) {
    try {
      const [yy, mm, dd] = today.split('-').map(Number)
      if (![yy, mm, dd].some(Number.isNaN)) {
        const prevDateObj = new Date(Date.UTC(yy, mm - 1, dd))
        prevDateObj.setUTCDate(prevDateObj.getUTCDate() - 1)
        const prevDate = `${prevDateObj.getUTCFullYear()}-${String(prevDateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(prevDateObj.getUTCDate()).padStart(2, '0')}`

        const [prevDay] = await db
          .select()
          .from(attendanceDay)
          .where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, prevDate)))
          .limit(1)

        const prevLogs = await db
          .select()
          .from(attendanceLog)
          .where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, prevDate)))
          .orderBy(desc(attendanceLog.timestamp))

        const prevClockIn = (prevLogs as Log[]).find((l: Log) => l.type === 'clock-in')
        const prevClockOut = (prevLogs as Log[]).find((l: Log) => l.type === 'clock-out' && (!prevClockIn || normalizeTimestampRaw(l.timestamp) > normalizeTimestampRaw(prevClockIn.timestamp)))

        if (prevClockIn && !prevClockOut) {
          const shiftCode = (prevDay as any)?.selectedShiftCode || (prevClockIn as any)?.shiftCode || null
          if (shiftCode) {
            const [sd] = await db.select().from(shift).where(eq(shift.code, shiftCode)).limit(1)
            if (sd) {
              const [sh, sm] = (sd.start || '').split(':').map(Number)
              const [eh, em] = (sd.end || '').split(':').map(Number)
              if (![sh, sm, eh, em].some(Number.isNaN)) {
                const startMin = sh * 60 + sm
                const endMin = eh * 60 + em
                const crossesMidnight = startMin > endMin
                if (crossesMidnight) {
                  const endUtcMs = Date.UTC(yy, mm - 1, dd, eh, em, 0, 0) + ((typeof tzOffset === 'number' && !Number.isNaN(tzOffset)) ? (tzOffset * 60000) : 0)
                  const nowMs = Date.now()
                  if (nowMs <= endUtcMs) {
                    stateDay = prevDay
                    stateLogs = prevLogs as Log[]
                    clockIn = prevClockIn
                    clockOut = prevClockOut
                  }
                }
              }
            }
          }
        }
      }
    }
    catch {
      // ignore fallback logic errors and keep today's state
    }
  }

  return {
    date: today,
    selectedShiftCode: stateDay?.selectedShiftCode ?? null,
    shiftType: (stateDay as any)?.shiftType ?? null,
    clockedIn: Boolean(clockIn && !clockOut),
    clockInTime: clockIn ? new Date(normalizeTimestampRaw(clockIn.timestamp)).toISOString() : undefined,
    clockOutTime: clockOut ? new Date(normalizeTimestampRaw(clockOut.timestamp)).toISOString() : undefined,
    logs: stateLogs,
  }
})
