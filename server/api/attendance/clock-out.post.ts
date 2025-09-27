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
  const { coords, shiftType: bodyShiftType } = body as { coords?: { latitude?: number, longitude?: number, accuracy?: number }, shiftType?: 'harian' | 'bantuan' | null }

  const db = useDb()
  const userId = session.user.id
  const date = new Date().toISOString().slice(0, 10)
  const now = new Date()

  // ensure day exists
  const [existing] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, date))).limit(1)
  if (!existing) {
    await db.insert(attendanceDay).values({ id: randomUUID(), userId, date, createdAt: now, updatedAt: now })
  }

  // determine shiftType to persist on the clock-out log: prefer explicit body, otherwise fall back to day's selected shiftType
  const dayRow = existing || (await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, date))).limit(1))[0]
  const shiftTypeToPersist = (bodyShiftType ?? (dayRow as any)?.shiftType) ?? null

  await db.insert(attendanceLog).values({
    id: randomUUID(),
    userId,
    date,
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
