import { and, eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { attendanceDay } from '~~/server/database/schemas'
import { isYmd } from '~~/server/utils/local-date'
import { formatBusinessDate, getCalendarDate } from '~~/shared/utils/attendance-date'
import { attendanceDay } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const { shiftCode, date, shiftType, timeZone } = body as { shiftCode: string, date?: string, shiftType?: 'harian' | 'bantuan', timeZone?: string }
  if (!shiftCode)
    throw createError({ statusCode: 400, statusMessage: 'shiftCode required' })

  const db = useDb()
  const userId = session.user.id
  const now = new Date()

  let theDate: string
  if (date && isYmd(date)) {
    theDate = date
  }
  else if (timeZone) {
    try {
      theDate = formatBusinessDate(getCalendarDate(now, timeZone))
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid timeZone' })
    }
  }
  else {
    theDate = formatBusinessDate(getCalendarDate(now, 'UTC'))
  }

  const [existing] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, theDate))).limit(1)
  if (!existing) {
    await db.insert(attendanceDay).values({ id: crypto.randomUUID(), userId, date: theDate, selectedShiftCode: shiftCode, shiftType: shiftType ?? 'harian', createdAt: now, updatedAt: now })
  }
  else {
    await db.update(attendanceDay).set({ selectedShiftCode: shiftCode, ...(shiftType ? { shiftType } : {}), updatedAt: now }).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, theDate)))
  }

  const [day2] = await db.select().from(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, theDate))).limit(1)
  return { date: theDate, selectedShiftCode: day2?.selectedShiftCode ?? null, shiftType: (day2 as any)?.shiftType ?? null }
})
