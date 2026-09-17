import { randomUUID } from 'node:crypto'
import { and, eq, or, sql } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay, attendanceLog } from '~~/server/database/schemas'
import { addBusinessDays, formatBusinessDate, getCalendarDate, parseBusinessDate } from '~~/shared/utils/attendance-date'
import { trackServerEvent } from '../../../modules/error-reporting/runtime/server/utils/error-reporting'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const { coords, shiftType: bodyShiftType, shiftCode: bodyShiftCode, timeZone: bodyTimeZone, earlyReason, geofenceComment, geofenceId, geofenceName } = body as {
    coords?: { latitude?: number, longitude?: number, accuracy?: number }
    shiftType?: 'harian' | 'bantuan' | null
    shiftCode?: string | null
    timeZone?: string
    earlyReason?: string
    geofenceComment?: string
    geofenceId?: string
    geofenceName?: string
  }
  if (!bodyTimeZone) throw createError({ statusCode: 400, statusMessage: 'timeZone required' })

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
  const previousDateText = formatBusinessDate(addBusinessDays(parseBusinessDate(currentDateText), -1))

  const result = await db.transaction(async (tx) => {
    // Serialize attendance mutations per user so concurrent clock-out/in requests see one state.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`)

    const candidateLogs = await tx.select().from(attendanceLog)
      .where(and(eq(attendanceLog.userId, userId), or(eq(attendanceLog.date, currentDateText), eq(attendanceLog.date, previousDateText))))
      .orderBy(attendanceLog.timestamp)

    let openClockIn: typeof candidateLogs[number] | undefined
    for (const log of candidateLogs) {
      if (log.type === 'clock-in') openClockIn = log
      else if (log.type === 'clock-out' && openClockIn) openClockIn = undefined
    }
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
      id: randomUUID(), userId, date: targetDate, type: 'clock-out', timestamp: now,
      lat: coords?.latitude, lng: coords?.longitude, accuracy: coords?.accuracy,
      shiftCode: shiftCodeToPersist, shiftType: shiftTypeToPersist,
      // Preserve the clock-in snapshot; the shift may have been edited while this session was open.
      shiftStart: openClockIn.shiftStart ?? null,
      shiftEnd: openClockIn.shiftEnd ?? null,
      earlyReason: typeof earlyReason === 'string' && earlyReason.length ? earlyReason.slice(0, 200) : null,
      geofenceComment: typeof geofenceComment === 'string' && geofenceComment.length ? geofenceComment.slice(0, 200) : null,
      geofenceId: typeof geofenceId === 'string' && geofenceId.length ? geofenceId.slice(0, 64) : null,
      geofenceName: typeof geofenceName === 'string' && geofenceName.length ? geofenceName.slice(0, 200) : null,
      createdAt: now, updatedAt: now,
    })

    const logs = await tx.select().from(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, targetDate))).orderBy(attendanceLog.timestamp)
    return { date: targetDate, requestedDate: currentDateText, logs, shiftCode: shiftCodeToPersist, shiftType: shiftTypeToPersist }
  })

  const log = useLogger()
  log.info({ userId, date: result.date, shiftCode: result.shiftCode, shiftType: result.shiftType, earlyReason, lat: coords?.latitude, lng: coords?.longitude }, 'Clock-out recorded')
  trackServerEvent('attendance.clock-out', { userId, date: result.date, shiftCode: result.shiftCode, shiftType: result.shiftType, lat: coords?.latitude, lng: coords?.longitude, earlyReason: earlyReason || null, userAgent: event.node.req.headers['user-agent'], timeZone: bodyTimeZone })

  return { date: result.date, requestedDate: result.requestedDate, logs: result.logs }
})
