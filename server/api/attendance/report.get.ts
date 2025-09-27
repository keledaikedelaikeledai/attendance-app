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

  // Fetch logs for all those days. Some DBs may not have `shift_type` yet; try selecting it, fall back if missing.
  let logs: any[] = []
  try {
    logs = await db
      .select({
        id: attendanceLog.id,
        userId: attendanceLog.userId,
        date: attendanceLog.date,
        type: attendanceLog.type,
        timestamp: attendanceLog.timestamp,
        lat: attendanceLog.lat,
        lng: attendanceLog.lng,
        accuracy: attendanceLog.accuracy,
        shiftType: attendanceLog.shiftType,
        shiftCode: attendanceLog.shiftCode,
      })
      .from(attendanceLog)
      .where(and(eq(attendanceLog.userId, userId), between(attendanceLog.date, startStr, endStr)))
  }
  catch {
    // likely missing column in older DB; fall back to selecting existing columns
    logs = await db
      .select({
        id: attendanceLog.id,
        userId: attendanceLog.userId,
        date: attendanceLog.date,
        type: attendanceLog.type,
        timestamp: attendanceLog.timestamp,
        lat: attendanceLog.lat,
        lng: attendanceLog.lng,
        accuracy: attendanceLog.accuracy,
        shiftCode: attendanceLog.shiftCode,
      })
      .from(attendanceLog)
      .where(and(eq(attendanceLog.userId, userId), between(attendanceLog.date, startStr, endStr)))
  }

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

    // group clock-in logs by shiftType for this date
    const ciByType = new Map<string, any[]>()
    const coByType = new Map<string, any[]>()
    for (const l of dayLogs as any[]) {
      if (l.type === 'clock-in') {
        const t = l.shiftType || 'unknown'
        ciByType.set(t, (ciByType.get(t) || []).concat(l))
      }
      else if (l.type === 'clock-out') {
        const t = l.shiftType || 'unknown'
        coByType.set(t, (coByType.get(t) || []).concat(l))
      }
    }

    // For counting working days: count distinct shiftTypes that have at least one clock-in
    const typesWorked = Array.from(ciByType.keys()).filter(t => t === 'harian' || t === 'bantuan')
    const harianWorked = typesWorked.includes('harian') ? 1 : 0
    const bantuanWorked = typesWorked.includes('bantuan') ? 1 : 0
    totalHarianDays += harianWorked
    totalBantuanDays += bantuanWorked
    totalWorkingDays += harianWorked + bantuanWorked

    // For lateness/early leave: compute per shiftType using earliest clock-in for that type and latest clock-out for that type (or any clock-out)
    for (const st of typesWorked) {
      const ciList = (ciByType.get(st) || []).sort((a: any, b: any) => a.timestamp - b.timestamp)
      const coList = (coByType.get(st) || []).sort((a: any, b: any) => b.timestamp - a.timestamp)
      const clockIn = ciList[0]
      const clockOut = coList[0]
      const def = (clockIn && clockIn.shiftCode) ? shiftMap.get(clockIn.shiftCode) : undefined
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
    }

    // prepare logs payload (include shiftType)
    const mappedLogs = (dayLogs as any[]).map(l => ({
      id: l.id,
      type: l.type,
      timestamp: new Date(l.timestamp).toISOString(),
      lat: l.lat ?? null,
      lng: l.lng ?? null,
      accuracy: l.accuracy ?? null,
      shiftCode: l.shiftCode ?? null,
      shiftType: l.shiftType ?? null,
    }))

    // compute lateMs as sum of per-shift lateness for this date
    let lateMs = 0
    for (const st of typesWorked) {
      const ci = (ciByType.get(st) || []).sort((a: any, b: any) => a.timestamp - b.timestamp)[0]
      const def = (ci && ci.shiftCode) ? shiftMap.get(ci.shiftCode) : undefined
      if (def && ci) {
        const { startDate: sStart } = computeShiftSpan(new Date(ci.timestamp as any), def.start, def.end)
        const cin = new Date(ci.timestamp as any)
        lateMs += Math.max(0, cin.getTime() - sStart.getTime())
      }
    }

    const firstCi = mappedLogs.find((x: any) => x.type === 'clock-in')
    const lastCo = mappedLogs.slice().reverse().find((x: any) => x.type === 'clock-out')
    daySummaries.push({
      date,
      selectedShiftCode: dayInfo.selectedShiftCode ?? null,
      shiftType: (dayInfo as any)?.shiftType ?? null,
      // keep legacy single clockIn/clockOut fields for compatibility (earliest/ latest)
      clockIn: firstCi ? firstCi.timestamp : null,
      clockOut: lastCo ? lastCo.timestamp : null,
      clockInLat: firstCi?.lat ?? null,
      clockInLng: firstCi?.lng ?? null,
      clockInAccuracy: firstCi?.accuracy ?? null,
      clockOutLat: lastCo?.lat ?? null,
      clockOutLng: lastCo?.lng ?? null,
      clockOutAccuracy: lastCo?.accuracy ?? null,
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
