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
  const { coords, shiftType: bodyShiftType, date: clientDate } = body as { coords?: { latitude?: number, longitude?: number, accuracy?: number }, shiftType?: 'harian' | 'bantuan' | null, date?: string }

  const db = useDb()
  const userId = session.user.id
  // Prefer client-provided local date when available to avoid server/UTC calendar drift
  const now = new Date()
  const date = typeof clientDate === 'string' && clientDate ? clientDate : new Date().toISOString().slice(0, 10)

  // ensure day exists
  const [existing] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, date))).limit(1)
  if (!existing) {
    await db.insert(attendanceDay).values({ id: randomUUID(), userId, date, createdAt: now, updatedAt: now })
  }

  // determine shiftType to persist on the clock-out log: prefer explicit body, otherwise fall back to day's selected shiftType
  const dayRow = existing || (await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, date))).limit(1))[0]
  const shiftTypeToPersist = (bodyShiftType ?? (dayRow as any)?.shiftType) ?? null

  // Detect crossing-midnight scenario: if a previous day's selected shift crosses midnight
  // and there's a clock-in on that previous date, and the current timestamp falls before
  // that shift's end (i.e. after midnight but still part of previous shift), persist the
  // clock-out under the previous date so the shift is attributed correctly.
  let targetDate = date
  try {
    const prev = new Date(now)
    prev.setDate(prev.getDate() - 1)
    const prevDateStr = prev.toISOString().slice(0, 10)

    // Check for a clock-in on the previous date
    const prevLogs = await db.select().from(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, prevDateStr)))
    const hasPrevClockIn = prevLogs.some((l: any) => l.type === 'clock-in')
    if (hasPrevClockIn) {
      // Prefer the selected shift code for the previous day if present, else use the clock-in's shiftCode
      const [prevDayRow] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, prevDateStr))).limit(1)
      let prevShiftCode: string | null = (prevDayRow as any)?.selectedShiftCode ?? null
      if (!prevShiftCode) {
        const firstCi = prevLogs.find((l: any) => l.type === 'clock-in')
        prevShiftCode = firstCi ? (firstCi as any).shiftCode ?? null : null
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
              // shift crosses midnight: compute end anchored to previous date + 1
              const endDate = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate(), eh, em, 0, 0)
              endDate.setDate(endDate.getDate() + 1)
              if (now.getTime() <= endDate.getTime()) {
                // attribute this clock-out to the previous date
                targetDate = prevDateStr
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
    shiftType: shiftTypeToPersist,
    createdAt: now,
    updatedAt: now,
  })

  const logs = await db.select().from(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, date))).orderBy(attendanceLog.timestamp)
  return { date, logs }
})
