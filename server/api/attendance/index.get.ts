import { and, desc, eq } from 'drizzle-orm'
import { createError, getQuery } from 'h3'
import { attendanceDay, attendanceLog } from '../../database/schema'
import { useDb } from '../../utils/db'

type Log = typeof attendanceLog.$inferSelect

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const userId = session.user.id

  const date = getQuery(event).date as string | undefined
  const today = date || new Date().toISOString().slice(0, 10)

  const db = useDb()
  const [day] = await db
    .select()
    .from(attendanceDay)
    .where(and(eq(attendanceDay.userId, userId), eq(attendanceDay.date, today)))
    .limit(1)

  const logs = await db
    .select()
    .from(attendanceLog)
    .where(and(eq(attendanceLog.userId, userId), eq(attendanceLog.date, today)))
    .orderBy(desc(attendanceLog.timestamp))

  // derive state
  const clockIn = (logs as Log[]).find((l: Log) => l.type === 'clock-in')
  const clockOut = (logs as Log[]).find((l: Log) => l.type === 'clock-out' && (!clockIn || l.timestamp > (clockIn.timestamp as Date)))

  return {
    date: today,
    selectedShiftCode: day?.selectedShiftCode ?? null,
    clockedIn: Boolean(clockIn && !clockOut),
    clockInTime: clockIn ? new Date(clockIn.timestamp as Date).toISOString() : undefined,
    clockOutTime: clockOut ? new Date(clockOut.timestamp as Date).toISOString() : undefined,
    logs,
  }
})
