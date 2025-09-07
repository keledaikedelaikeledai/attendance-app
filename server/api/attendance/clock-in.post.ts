import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay, attendanceLog } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const { shiftCode, shiftType, coords } = body as { shiftCode?: string, shiftType?: 'harian' | 'bantuan', coords?: { latitude?: number, longitude?: number, accuracy?: number } }

  const db = useDb()
  const userId = session.user.id
  const date = new Date().toISOString().slice(0, 10)
  const now = new Date()

  // upsert day
  const [existing] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, date))).limit(1)
  if (!existing) {
    await db.insert(attendanceDay).values({
      id: randomUUID(),
      userId,
      date,
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
      .where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, date)))
  }

  // insert log
  await db.insert(attendanceLog).values({
    id: randomUUID(),
    userId,
    date,
    type: 'clock-in',
    timestamp: now,
    lat: coords?.latitude,
    lng: coords?.longitude,
    accuracy: coords?.accuracy,
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
