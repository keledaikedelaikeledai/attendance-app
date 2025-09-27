import { and, between, eq } from 'drizzle-orm'
import { createError, getQuery } from 'h3'
import { attendanceDay, attendanceLog, shift } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'

// Helper to parse YYYY-MM safely
function parseYearMonth(ym?: string) {
  if (!ym) return null
  if (!/^\d{4}-\d{2}$/.test(ym)) return null
  const [y, m] = ym.split('-').map(Number)
  if (m < 1 || m > 12) return null
  return { year: y, month: m }
}

// Compute shift start & end Date objects given a clock-in timestamp and shift def (supports crossing midnight)
function computeShiftSpan(ci: Date, start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startDate = new Date(ci)
  startDate.setHours(sh, sm, 0, 0)
  const endDate = new Date(startDate)
  // If shift crosses midnight (start > end) then add a day to end
  if (sh * 60 + sm > eh * 60 + em) endDate.setDate(endDate.getDate() + 1)
  endDate.setHours(eh, em, 0, 0)
  return { startDate, endDate }
}

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const userId = session.user.id

  const { month } = getQuery(event)
  const parsed = parseYearMonth(month as string | undefined)
  const now = new Date()
  const targetYear = parsed?.year ?? now.getFullYear()
  const targetMonth = parsed?.month ?? (now.getMonth() + 1)

  // First day of month
  const startDate = new Date(targetYear, targetMonth - 1, 1)
  // First day next month
  const endDate = new Date(targetYear, targetMonth, 1)
  const startStr = startDate.toISOString().slice(0, 10)
  const endStr = endDate.toISOString().slice(0, 10)

  const db = useDb()

  // Fetch attendanceDay rows for the month
  const days = await db
    .select()
    .from(attendanceDay)
    .where(and(eq(attendanceDay.userId, userId), between(attendanceDay.date, startStr, endStr)))

  // Fetch logs for all those days
  const logs = await db
    .select()
    .from(attendanceLog)
    .where(and(eq(attendanceLog.userId, userId), between(attendanceLog.date, startStr, endStr)))

  // Fetch shifts (we'll need times to compute late / early leave)
  const shifts = await db.select().from(shift)

  const shiftMap = new Map(shifts.map(s => [s.code, s]))

  // Aggregation accumulators
  let totalWorkingDays = 0
  let totalHarianDays = 0
  let totalBantuanDays = 0
  let totalLateMinutes = 0
  let totalEarlyLeaveMinutes = 0

  // For each day that has at least a clock-in, count as working day
  const logsByDate = new Map<string, typeof logs>()
  for (const l of logs) {
    if (!logsByDate.has(l.date)) logsByDate.set(l.date, [])
    logsByDate.get(l.date)!.push(l as any)
  }

  // Build per-day summaries to return to the frontend (for AttendanceCard rendering)
  const daySummaries: any[] = []

  for (const [date, dayLogs] of logsByDate.entries()) {
    const dayInfo = days.find(d => d.date === date)
    if (!dayInfo) continue
    const shiftCode = dayInfo.selectedShiftCode || dayInfo.shiftType || undefined
    const def = shiftCode ? shiftMap.get(shiftCode) : undefined
    const clockIn = dayLogs.filter(l => l.type === 'clock-in').sort((a, b) => (a.timestamp as any) - (b.timestamp as any))[0]
    const clockOut = dayLogs.filter(l => l.type === 'clock-out').sort((a, b) => (b.timestamp as any) - (a.timestamp as any))[0]
    if (!clockIn) continue
    totalWorkingDays++
    if (dayInfo.shiftType === 'harian') totalHarianDays++
    else if (dayInfo.shiftType === 'bantuan') totalBantuanDays++

    if (def && clockIn) {
      const { startDate: sStart, endDate: sEnd } = computeShiftSpan(new Date(clockIn.timestamp as any), def.start, def.end)
      const cin = new Date(clockIn.timestamp as any)
      if (cin > sStart) {
        totalLateMinutes += Math.ceil((cin.getTime() - sStart.getTime()) / 60000)
      }
      if (clockOut) {
        const cout = new Date(clockOut.timestamp as any)
        if (cout < sEnd) {
          totalEarlyLeaveMinutes += Math.ceil((sEnd.getTime() - cout.getTime()) / 60000)
        }
      }
    }

    // per-day lateMs calculation
    let lateMs = 0
    if (def && clockIn) {
      const { startDate: sStart } = computeShiftSpan(new Date(clockIn.timestamp as any), def.start, def.end)
      const cin = new Date(clockIn.timestamp as any)
      lateMs = Math.max(0, cin.getTime() - sStart.getTime())
    }

    // prepare logs payload
    const mappedLogs = (dayLogs as any[]).map(l => ({
      id: l.id,
      type: l.type,
      timestamp: new Date(l.timestamp).toISOString(),
      lat: l.lat ?? null,
      lng: l.lng ?? null,
      accuracy: l.accuracy ?? null,
      shiftCode: l.shiftCode ?? null,
    }))

    daySummaries.push({
      date,
      selectedShiftCode: dayInfo.selectedShiftCode ?? null,
      shiftType: (dayInfo as any)?.shiftType ?? null,
      clockIn: clockIn ? new Date(clockIn.timestamp as any).toISOString() : null,
      clockOut: clockOut ? new Date(clockOut.timestamp as any).toISOString() : null,
      clockInLat: clockIn?.lat ?? null,
      clockInLng: clockIn?.lng ?? null,
      clockInAccuracy: clockIn?.accuracy ?? null,
      clockOutLat: clockOut?.lat ?? null,
      clockOutLng: clockOut?.lng ?? null,
      clockOutAccuracy: clockOut?.accuracy ?? null,
      lateMs,
      logs: mappedLogs,
    })
  }

  return {
    month: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
    totalWorkingDays,
    totalHarianShift: totalHarianDays,
    totalBantuanShift: totalBantuanDays,
    totalLateMinutes,
    totalEarlyLeaveMinutes,
    days: daySummaries.sort((a, b) => a.date.localeCompare(b.date)),
  }
})
