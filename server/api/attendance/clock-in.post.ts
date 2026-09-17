import { randomUUID } from 'node:crypto'
import { and, eq, or, sql } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay, attendanceLog, shift } from '~~/server/database/schemas'
import { addBusinessDays, formatBusinessDate, getCalendarDate, parseBusinessDate, resolveBusinessDateFromInstant } from '~~/shared/utils/attendance-date'
import { trackServerEvent } from '../../../modules/error-reporting/runtime/server/utils/error-reporting'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const { shiftCode, shiftType, coords, timeZone: bodyTimeZone, geofenceComment, geofenceId, geofenceName } = body as {
    shiftCode?: string
    shiftType?: 'harian' | 'bantuan'
    coords?: { latitude?: number, longitude?: number, accuracy?: number }
    timeZone?: string
    geofenceComment?: string
    geofenceId?: string
    geofenceName?: string
  }
  if (!bodyTimeZone) throw createError({ statusCode: 400, statusMessage: 'timeZone required' })
  if (shiftType !== undefined && shiftType !== 'harian' && shiftType !== 'bantuan') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid shiftType' })
  }

  const db = useDb()
  const userId = session.user.id
  const now = new Date()
  let calendarDate: string
  try {
    calendarDate = formatBusinessDate(getCalendarDate(now, bodyTimeZone))
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeZone' })
  }

  const result = await db.transaction(async (tx) => {
    // Serialize attendance mutations per user so read-then-insert cannot race.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`)

    const shiftDef = shiftCode ? (await tx.select().from(shift).where(eq(shift.code, shiftCode)).limit(1))[0] : undefined
    if (shiftCode && !shiftDef) throw createError({ statusCode: 400, statusMessage: 'Invalid shiftCode' })
    if (shiftDef && !shiftDef.active) throw createError({ statusCode: 400, statusMessage: 'Shift is inactive' })

    const targetDate = shiftDef
      ? formatBusinessDate(resolveBusinessDateFromInstant(now, { start: shiftDef.start, end: shiftDef.end }, bodyTimeZone))
      : calendarDate
    const previousDate = formatBusinessDate(addBusinessDays(parseBusinessDate(targetDate), -1))

    const existingLogs = await tx.select().from(attendanceLog)
      .where(and(eq(attendanceLog.userId, userId), or(eq(attendanceLog.date, targetDate), eq(attendanceLog.date, previousDate))))
      .orderBy(attendanceLog.timestamp)
    let openClockIn: typeof existingLogs[number] | undefined
    for (const log of existingLogs) {
      if (log.type === 'clock-in') openClockIn = log
      else if (log.type === 'clock-out' && openClockIn) openClockIn = undefined
    }
    if (openClockIn) throw createError({ statusCode: 409, statusMessage: 'Attendance session is already open' })

    // A business date may contain one completed Harian session and one completed
    // Bantuan session, but never two sessions of the same type. Older logs with a
    // null shiftType are treated as Harian for backward compatibility because
    // Harian is the existing/default shift type.
    const requestedShiftType = shiftType || 'harian'
    const hasSameTypeShift = existingLogs.some(log =>
      log.date === targetDate
      && log.type === 'clock-in'
      && (log.shiftType === requestedShiftType || (requestedShiftType === 'harian' && (log.shiftType === null || log.shiftType === undefined))),
    )
    if (hasSameTypeShift) {
      throw createError({ statusCode: 409, statusMessage: `A ${requestedShiftType} shift has already been recorded for this business date` })
    }

    const [existing] = await tx.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, targetDate))).limit(1)
    if (!existing) {
      await tx.insert(attendanceDay).values({ id: randomUUID(), userId, date: targetDate, selectedShiftCode: shiftCode, shiftType: requestedShiftType, createdAt: now, updatedAt: now })
    }
    else if (shiftCode || shiftType) {
      await tx.update(attendanceDay).set({ ...(shiftCode ? { selectedShiftCode: shiftCode } : {}), ...(shiftType ? { shiftType } : {}), updatedAt: now }).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, targetDate)))
    }

    await tx.insert(attendanceLog).values({
      id: randomUUID(), userId, date: targetDate, type: 'clock-in', timestamp: now,
      lat: coords?.latitude, lng: coords?.longitude, accuracy: coords?.accuracy,
      shiftType: requestedShiftType, shiftCode,
      geofenceComment: typeof geofenceComment === 'string' && geofenceComment.length ? geofenceComment.slice(0, 200) : null,
      geofenceId: typeof geofenceId === 'string' && geofenceId.length ? geofenceId.slice(0, 64) : null,
      geofenceName: typeof geofenceName === 'string' && geofenceName.length ? geofenceName.slice(0, 200) : null,
      createdAt: now, updatedAt: now,
    })

    const [day] = await tx.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, targetDate))).limit(1)
    const logs = await tx.select().from(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, targetDate))).orderBy(attendanceLog.timestamp)
    return { date: targetDate, requestedDate: calendarDate, selectedShiftCode: day?.selectedShiftCode ?? null, shiftType: day?.shiftType ?? null, logs }
  })

  const log = useLogger()
  log.info({ userId, date: result.date, shiftCode, shiftType, lat: coords?.latitude, lng: coords?.longitude }, 'Clock-in recorded')
  trackServerEvent('attendance.clock-in', { userId, date: result.date, shiftCode, shiftType, lat: coords?.latitude, lng: coords?.longitude, accuracy: coords?.accuracy, userAgent: event.node.req.headers['user-agent'], timeZone: bodyTimeZone })

  return result
})
