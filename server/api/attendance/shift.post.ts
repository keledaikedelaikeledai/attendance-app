import { and, eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay } from '~~/server/database/schemas'
import { formatBusinessDate, getCalendarDate } from '~~/shared/utils/attendance-date'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const { shiftCode, shiftType, timeZone } = body as { shiftCode: string, shiftType?: 'harian' | 'bantuan', timeZone?: string }
  if (!shiftCode) throw createError({ statusCode: 400, statusMessage: 'shiftCode required' })
  if (!timeZone) throw createError({ statusCode: 400, statusMessage: 'timeZone required' })

  const db = useDb()
  const userId = session.user.id
  const now = new Date()
  let theDate: string
  try {
    theDate = formatBusinessDate(getCalendarDate(now, timeZone))
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeZone' })
  }

  const [existing] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, theDate))).limit(1)
  if (!existing) {
    await db.insert(attendanceDay).values({ id: crypto.randomUUID(), userId, date: theDate, selectedShiftCode: shiftCode, shiftType: shiftType ?? 'harian', createdAt: now, updatedAt: now })
  }
  else {
    await db.update(attendanceDay).set({ selectedShiftCode: shiftCode, ...(shiftType ? { shiftType } : {}), updatedAt: now }).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, theDate)))
  }

  const [day] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, theDate))).limit(1)
  return { date: theDate, selectedShiftCode: day?.selectedShiftCode ?? null, shiftType: (day as any)?.shiftType ?? null }
})
