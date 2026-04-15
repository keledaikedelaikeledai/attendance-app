import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay, attendanceLog, shift } from '~~/server/database/schemas'
import { addDaysYmd, isYmd, localDateTimeToUtcMs, localNowYmdFromOffset } from '~~/server/utils/local-date'
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
  // Prefer client-provided local date when available to avoid server/UTC calendar drift
  const date = isYmd(clientDate) ? clientDate : localNowYmdFromOffset(now, tzOffset)

  // ensure day exists
  const [existing] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, date))).limit(1)
  if (!existing) {
    await db.insert(attendanceDay).values({ id: randomUUID(), userId, date, createdAt: now, updatedAt: now })
  }

  // Determine shift metadata to persist on the clock-out log.
  // Keep a fallback chain so reconciliation can still pair this with its clock-in.
  const dayRow = existing || (await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, date))).limit(1))[0]
  let shiftTypeToPersist: 'harian' | 'bantuan' | null = (bodyShiftType ?? (dayRow as any)?.shiftType) ?? null
  let shiftCodeToPersist: string | null = (bodyShiftCode ?? (dayRow as any)?.selectedShiftCode ?? null)

  // Detect crossing-midnight scenario: if a previous day's selected shift crosses midnight
  // and there's a clock-in on that previous date, and the current timestamp falls before
  // that shift's end (i.e. after midnight but still part of previous shift), persist the
  // clock-out under the previous date so the shift is attributed correctly.
  let targetDate = date
  try {
    const prevDateStr = addDaysYmd(date, -1)

    // Check for a clock-in on the previous date
    const prevLogs = await db.select().from(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, prevDateStr)))
    const hasPrevClockIn = prevLogs.some((l: any) => l.type === 'clock-in')
    if (hasPrevClockIn) {
      // Prefer the selected shift code for the previous day if present, else use the clock-in's shiftCode
      const [prevDayRow] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, prevDateStr))).limit(1)
      let prevShiftCode: string | null = (prevDayRow as any)?.selectedShiftCode ?? null
      let prevShiftType: 'harian' | 'bantuan' | null = ((prevDayRow as any)?.shiftType ?? null) as any
      if (!prevShiftCode) {
        const firstCi = [...prevLogs].reverse().find((l: any) => l.type === 'clock-in')
        prevShiftCode = firstCi ? (firstCi as any).shiftCode ?? null : null
        if (!prevShiftType) prevShiftType = firstCi ? ((firstCi as any).shiftType ?? null) : null
      }

      if (!shiftCodeToPersist) shiftCodeToPersist = prevShiftCode
      if (!shiftTypeToPersist) shiftTypeToPersist = prevShiftType

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
              // shift crosses midnight: compute end anchored to previous date + 1
              const endDateYmd = addDaysYmd(prevDateStr, 1)
              const endMsUtc = localDateTimeToUtcMs(endDateYmd, eh, em, tzOffset)
              if (now.getTime() <= endMsUtc) {
                // attribute this clock-out to the previous date
                targetDate = prevDateStr
                if (!shiftCodeToPersist) shiftCodeToPersist = prevShiftCode
                if (!shiftTypeToPersist) shiftTypeToPersist = prevShiftType
              }
            }
          }
        }
      }
    }
  }
  catch {
    // fall back to default behaviour
  }

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

  const logs = await db.select().from(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, targetDate))).orderBy(attendanceLog.timestamp)
  return { date: targetDate, requestedDate: date, logs }
})
