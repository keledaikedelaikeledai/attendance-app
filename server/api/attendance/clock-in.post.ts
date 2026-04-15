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
  const { shiftCode, shiftType, coords, date: clientDate, tzOffset: bodyTzOffset, geofenceComment, geofenceId, geofenceName } = body as { shiftCode?: string, shiftType?: 'harian' | 'bantuan', coords?: { latitude?: number, longitude?: number, accuracy?: number }, date?: string, tzOffset?: number | string, geofenceComment?: string, geofenceId?: string, geofenceName?: string }

  const db = useDb()
  const userId = session.user.id
  const now = new Date()
  const parsedTzOffset = typeof bodyTzOffset === 'string' ? Number(bodyTzOffset) : bodyTzOffset
  const tzOffset = typeof parsedTzOffset === 'number' && Number.isFinite(parsedTzOffset)
    ? parsedTzOffset
    : now.getTimezoneOffset()
  // Prefer client-provided local date when available to avoid server/UTC calendar drift
  const date = isYmd(clientDate) ? clientDate : localNowYmdFromOffset(now, tzOffset)

  // If the user's selected shift for the previous day crosses midnight and
  // the current clock-in happens after midnight but before that shift's end,
  // attribute the clock-in to the previous date so the shift remains grouped.
  let targetDate = date
  try {
    const prevDateStr = addDaysYmd(date, -1)
    const [prevDayRow] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, prevDateStr))).limit(1)
    let prevShiftCode = (prevDayRow as any)?.selectedShiftCode ?? null
    if (!prevShiftCode) {
      const prevLogs = await db.select().from(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, prevDateStr)))
      const latestCi = [...prevLogs].reverse().find((l: any) => l.type === 'clock-in')
      prevShiftCode = latestCi ? ((latestCi as any).shiftCode ?? null) : null
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
            // crossing midnight, compute end anchored to prev date + 1
            const endDateYmd = addDaysYmd(prevDateStr, 1)
            const endMsUtc = localDateTimeToUtcMs(endDateYmd, eh, em, tzOffset)
            if (now.getTime() <= endMsUtc) {
              targetDate = prevDateStr
            }
          }
        }
      }
    }
  }
  catch {
    // ignore and use today's date
  }

  // upsert day (use targetDate so clock-ins attributed correctly)
  const [existing] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, targetDate))).limit(1)
  if (!existing) {
    await db.insert(attendanceDay).values({
      id: randomUUID(),
      userId,
      date: targetDate,
      selectedShiftCode: shiftCode,
      shiftType: (shiftType as any) || 'harian',
      createdAt: now,
      updatedAt: now,
    })
  }
  else if (shiftCode || shiftType) {
    await db
      .update(attendanceDay)
      .set({
        ...(shiftCode ? { selectedShiftCode: shiftCode } : {}),
        ...(shiftType ? { shiftType: shiftType as any } : {}),
        updatedAt: now,
      })
      .where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, targetDate)))
  }

  // insert log
  await db.insert(attendanceLog).values({
    id: randomUUID(),
    userId,
    date: targetDate,
    type: 'clock-in',
    timestamp: now,
    lat: coords?.latitude,
    lng: coords?.longitude,
    accuracy: coords?.accuracy,
    shiftType: shiftType ?? null,
    shiftCode,
    geofenceComment: typeof geofenceComment === 'string' && geofenceComment.length ? geofenceComment.slice(0, 200) : null,
    geofenceId: typeof geofenceId === 'string' && geofenceId.length ? geofenceId.slice(0, 64) : null,
    geofenceName: typeof geofenceName === 'string' && geofenceName.length ? geofenceName.slice(0, 200) : null,
    createdAt: now,
    updatedAt: now,
  })

  // return updated state
  const [day] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, date))).limit(1)
  const logs = await db.select().from(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, date))).orderBy(attendanceLog.timestamp)
  return {
    date,
    selectedShiftCode: day?.selectedShiftCode ?? null,
    shiftType: (day as any)?.shiftType ?? null,
    logs,
  }
})
