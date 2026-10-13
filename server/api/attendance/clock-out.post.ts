import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay, attendanceLog } from '~~/server/database/schemas'
import { formatBusinessDate, getCalendarDate } from '~~/shared/utils/attendance-date'
import { trackServerEvent } from '../../../modules/error-reporting/runtime/server/utils/error-reporting'
import { useDb } from '../../utils/db'
import { normalizeTimestampRaw } from '../../utils/time'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const { coords, shiftType: bodyShiftType, shiftCode: bodyShiftCode, timeZone: bodyTimeZone, earlyReason, geofenceComment } = body as {
    coords?: { latitude?: number, longitude?: number, accuracy?: number }
    shiftType?: 'harian' | 'bantuan' | null
    shiftCode?: string | null
    timeZone?: string
    earlyReason?: string
    geofenceComment?: string
  }
  if (!bodyTimeZone) throw createError({ statusCode: 400, statusMessage: 'timeZone required' })

  // Server-side geofence enforcement - the client guard is advisory only.
  // Returns the fence the SERVER matched; that is what gets recorded.
  const matchedGeofence = await resolveGeofenceForClock(coords, geofenceComment)

  const db = useDb()
  const userId = session.user.id
  const now = new Date()
  let currentDate
  try {
    currentDate = getCalendarDate(now, bodyTimeZone)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeZone' })
  }
  const currentDateText = formatBusinessDate(currentDate)

  const result = await db.transaction(async (tx) => {
    // Serialize attendance mutations per user so concurrent clock-out/in requests see one state.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`)

    // The open session is searched across ALL of the user's logs: a session
    // left open days ago must still be closeable, and its clock-out belongs
    // to the day the clock-in belongs to (targetDate below).
    const recentLogs = await tx.select().from(attendanceLog).where(eq(attendanceLog.userId, userId)).orderBy(desc(attendanceLog.timestamp)).limit(500)
    const candidateLogs = [...recentLogs].sort((a, b) => normalizeTimestampRaw(a.timestamp) - normalizeTimestampRaw(b.timestamp))

    const openClockIn = findOpenClockIn(candidateLogs)
    if (!openClockIn) throw createError({ statusCode: 409, statusMessage: 'No open attendance session' })

    const targetDate = openClockIn.date || currentDateText
    const [dayRow] = await tx.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, targetDate))).limit(1)
    if (!dayRow) {
      await tx.insert(attendanceDay).values({ id: randomUUID(), userId, date: targetDate, selectedShiftCode: bodyShiftCode ?? openClockIn.shiftCode, shiftType: bodyShiftType ?? openClockIn.shiftType ?? undefined, createdAt: now, updatedAt: now })
    }

    const day = dayRow || (await tx.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, targetDate))).limit(1))[0]
    const shiftTypeToPersist: 'harian' | 'bantuan' | null = (openClockIn.shiftType ?? bodyShiftType ?? day?.shiftType) ?? null
    const shiftCodeToPersist: string | null = (openClockIn.shiftCode ?? bodyShiftCode ?? day?.selectedShiftCode) ?? null

    await tx.insert(attendanceLog).values({
      id: randomUUID(),
      userId,
      date: targetDate,
      type: 'clock-out',
      timestamp: now,
      lat: coords?.latitude,
      lng: coords?.longitude,
      accuracy: coords?.accuracy,
      shiftCode: shiftCodeToPersist,
      shiftType: shiftTypeToPersist,
      // Preserve the clock-in snapshot; the shift may have been edited while this session was open.
      shiftStart: openClockIn.shiftStart ?? null,
      shiftEnd: openClockIn.shiftEnd ?? null,
      earlyReason: typeof earlyReason === 'string' && earlyReason.length ? earlyReason.slice(0, 200) : null,
      geofenceComment: typeof geofenceComment === 'string' && geofenceComment.length ? geofenceComment.slice(0, 200) : null,
      geofenceId: matchedGeofence.geofenceId,
      geofenceName: matchedGeofence.geofenceName,
      createdAt: now,
      updatedAt: now,
    })

    const logs = await tx.select().from(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, targetDate))).orderBy(attendanceLog.timestamp)
    return { date: targetDate, requestedDate: currentDateText, logs, shiftCode: shiftCodeToPersist, shiftType: shiftTypeToPersist }
  })

  const log = useLogger()
  log.info({ userId, date: result.date, shiftCode: result.shiftCode, shiftType: result.shiftType, earlyReason, lat: coords?.latitude, lng: coords?.longitude }, 'Clock-out recorded')
  trackServerEvent('attendance.clock-out', { userId, date: result.date, shiftCode: result.shiftCode, shiftType: result.shiftType, lat: coords?.latitude, lng: coords?.longitude, earlyReason: earlyReason || null, userAgent: event.node.req.headers['user-agent'], timeZone: bodyTimeZone })

  return { date: result.date, requestedDate: result.requestedDate, logs: result.logs }
})
