import { and, eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay } from '../../database/schema'
import { auth } from '../../utils/auth'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const { shiftCode, date } = body as { shiftCode: string, date?: string }
  if (!shiftCode)
    throw createError({ statusCode: 400, statusMessage: 'shiftCode required' })

  const db = useDb()
  const userId = session.user.id
  const theDate = date || new Date().toISOString().slice(0, 10)
  const now = new Date()

  const [existing] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, theDate))).limit(1)
  if (!existing) {
    await db.insert(attendanceDay).values({ id: crypto.randomUUID(), userId, date: theDate, selectedShiftCode: shiftCode, createdAt: now, updatedAt: now })
  }
  else {
    await db.update(attendanceDay).set({ selectedShiftCode: shiftCode, updatedAt: now }).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, theDate)))
  }

  const [day2] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, theDate))).limit(1)
  return { date: theDate, selectedShiftCode: day2?.selectedShiftCode ?? null }
})
