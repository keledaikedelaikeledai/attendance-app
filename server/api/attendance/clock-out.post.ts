import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay, attendanceLog, shift } from '~~/server/database/schemas'
import { addDaysYmd, isYmd, localDateTimeToUtcMs, localNowYmdFromOffset } from '~~/server/utils/local-date'
import { trackServerEvent } from '../../../modules/error-reporting/runtime/server/utils/error-reporting'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const { coords, shiftType: bodyShiftType, shiftCode: bodyShiftCode, date: clientDate, tzOffset: bodyTzOffset, earlyReason, geofenceComment, geofenceId, geofenceName } = body as { coords?: { latitude?: number, longitude?: number, accuracy?: number }, shiftType?: 'harian' | 'bantuan' | null, shiftCode?: string | null, date?: string, tzOffset?: number | string, earlyReason?: string, geofenceComment?: string, geofenceId?: string, geofenceName?: string }

  const db = useDb()
  const userId = session.user.id
  const now = new Date()
  const parsedTzOffset = typeof bodyTzOffset === 'string' ? Number(bodyTzOffset) : bodyTzOffset
  const tzOffset = typeof parsedTzOffset === 'number' && Number.isFinite(parsedTzOffset)
    ? parsedTzOffset
    : now.getTimezoneOffset()
  const date = isYmd(clientDate) ? clientDate : localNowYmdFromOffset(now, tzOffset)

  // Resolve the business date before creating/updating attendanceDay so an
  // overnight clock-out never leaves an empty record for the following date.
  let targetDate = date
  let prevShiftCode: string | null = null
  let prevShiftType: 'harian' | 'bantuan' | null = null
  try {
    const prevDateStr = addDaysYmd(date, -1)
    const prevLogs = await db.select().from(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, prevDateStr)))
    const hasPrevClockIn = prevLogs.some((l: any) => l.type === 'clock-in')
    if (hasPrevClockIn) {
      const [prevDayRow] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, prevDateStr))).limit(1)
      prevShiftCode = (prevDayRow as any)?.selectedShiftCode ?? null
      prevShiftType = ((prevDayRow as any)?.shiftType ?? null) as any
      if (!prevShiftCode || !prevShiftType) {
        const firstCi = [...prevLogs].reverse().find((l: any) => l.type === 'clock-in')
        if (!prevShiftCode) prevShiftCode = firstCi ? ((firstCi as any).shiftCode ?? null) : null
        if (!prevShiftType) prevShiftType = firstCi ? (((firstCi as any).shiftType ?? null) as any) : null
      }

      if (prevShiftCode) {
        const [sd] = await db.select().from(shift).where(eq(shift.code, prevShiftCode)).limit(1)
        if (sd) {
          const partsStart = (sd.start || '').split(':')
          const partsEnd = (sd.end || '').split(':')
          const sh = Number(partsStart[0])
          const sm = Number(partsStart[1])
          const eh = Number(partsEnd[0])
          const em = Number(partsEnd[1])
          if (![sh, sm, eh, em].some(n => Number.isNaN(n))) {
            const startMin = sh * 60 + sm
            const endMin = eh * 60 + em
            if (startMin > endMin) {
              const endDateYmd = addDaysYmd(prevDateStr, 1)
              const endMsUtc = localDateTimeToUtcMs(endDateYmd, eh, em, tzOffset)
              if (now.getTime() <= endMsUtc) targetDate = prevDateStr
            }
          }
        }
      }
    }
  }
  catch (err) {
    const log = useLogger()
    log.warn({ err, userId, date }, 'Cross-midnight date attribution failed, using default')
  }

  const [dayRow] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, targetDate))).limit(1)
  if (!dayRow) {
    await db.insert(attendanceDay).values({ id: randomUUID(), userId, date: targetDate, selectedShiftCode: bodyShiftCode ?? prevShiftCode, shiftType: bodyShiftType ?? prevShiftType ?? undefined, createdAt: now, updatedAt: now })
  }

  const day = dayRow || (await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, targetDate))).limit(1))[0]
  let shiftTypeToPersist: 'harian' | 'bantuan' | null = (bodyShiftType ?? (day as any)?.shiftType) ?? null
  let shiftCodeToPersist: string | null = (bodyShiftCode ?? (day as any)?.selectedShiftCode ?? prevShiftCode) ?? null

  await db.insert(attendanceLog).values({
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
    earlyReason: typeof earlyReason === 'string' && earlyReason.length ? earlyReason.slice(0, 200) : null,
    geofenceComment: typeof geofenceComment === 'string' && geofenceComment.length ? geofenceComment.slice(0, 200) : null,
    geofenceId: typeof geofenceId === 'string' && geofenceId.length ? geofenceId.slice(0, 64) : null,
    geofenceName: typeof geofenceName === 'string' && geofenceName.length ? geofenceName.slice(0, 200) : null,
    createdAt: now,
    updatedAt: now,
  })

  const log = useLogger()
  log.info({ userId, date: targetDate, shiftCode: shiftCodeToPersist, shiftType: shiftTypeToPersist, earlyReason, lat: coords?.latitude, lng: coords?.longitude }, 'Clock-out recorded')
  trackServerEvent('attendance.clock-out', {
    userId,
    date: targetDate,
    shiftCode: shiftCodeToPersist,
    shiftType: shiftTypeToPersist,
    lat: coords?.latitude,
    lng: coords?.longitude,
    earlyReason: earlyReason || null,
    userAgent: event.node.req.headers['user-agent'],
    timezoneOffset: tzOffset,
  })

  const logs = await db.select().from(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, targetDate))).orderBy(attendanceLog.timestamp)
  return { date: targetDate, requestedDate: date, logs }
})
