import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay, attendanceLog, shift } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const { shiftCode, shiftType, coords, date: clientDate } = body as { shiftCode?: string, shiftType?: 'harian' | 'bantuan', coords?: { latitude?: number, longitude?: number, accuracy?: number }, date?: string }

  const db = useDb()
  const userId = session.user.id
  // Prefer client-provided local date when available to avoid server/UTC calendar drift
  const now = new Date()
  const date = typeof clientDate === 'string' && clientDate ? clientDate : new Date().toISOString().slice(0, 10)

  // If the user's selected shift for the previous day crosses midnight and
  // the current clock-in happens after midnight but before that shift's end,
  // attribute the clock-in to the previous date so the shift remains grouped.
  let targetDate = date
  try {
    const prev = new Date(now)
    prev.setDate(prev.getDate() - 1)
    const prevDateStr = prev.toISOString().slice(0, 10)
    const [prevDayRow] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, prevDateStr))).limit(1)
    const prevShiftCode = (prevDayRow as any)?.selectedShiftCode ?? null
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
            const endDate = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate(), eh, em, 0, 0)
            endDate.setDate(endDate.getDate() + 1)
            if (now.getTime() <= endDate.getTime()) {
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
