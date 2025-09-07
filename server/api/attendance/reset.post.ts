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
  const { date } = body as { date?: string }
  const theDate = date || new Date().toISOString().slice(0, 10)

  const db = useDb()
  const userId = session.user.id

  await db.delete(attendanceLog).where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, theDate)))
  await db.delete(attendanceDay).where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, theDate)))

  return { date: theDate, logs: [], selectedShiftCode: null, shiftType: null }
})
