import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay, attendanceLog } from '../../database/schema'
import { auth } from '../../utils/auth'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const { shiftCode, coords } = body as { shiftCode?: string, coords?: { latitude?: number, longitude?: number, accuracy?: number } }

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
      createdAt: now,
      updatedAt: now,
    })
  }
  else if (shiftCode) {
    await db.update(attendanceDay).set({ selectedShiftCode: shiftCode, updatedAt: now }).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, date)))
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
    logs,
  }
})
