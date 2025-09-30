import process from 'node:process'
import { and, between, eq } from 'drizzle-orm'
import { createError, getQuery } from 'h3'
import { attendanceDay, attendanceLog, shift } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'
import { normalizeTimestampRaw } from '../../utils/time'

// Helper to parse YYYY-MM safely
function parseYearMonth(ym?: string) {
  if (!ym) return null
  if (!/^\d{4}-\d{2}$/.test(ym)) return null
  const [y, m] = ym.split('-').map(Number)
  if (m < 1 || m > 12) return null
  return { year: y, month: m }
}

// Compute shift start & end Date objects given a clock-in timestamp and shift def (supports crossing midnight)
// Business timezone configuration (IANA tz). Use same default as admin endpoints.
const BUSINESS_TZ = process.env.BUSINESS_TZ || 'Asia/Jakarta'

// Helper: compute the UTC instant (ISO) for a local YYYY-MM-DD + HH:MM in the given tz
function localDateTimeToUtcIso(dateYmd: string, hh: number, mm: number, tz: string) {
  const localStr = `${dateYmd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
  const wall = new Date(localStr)
  const tzString = new Date(wall.toLocaleString('en-US', { timeZone: tz }))
  const offsetMs = wall.getTime() - tzString.getTime()
  const instant = new Date(wall.getTime() + offsetMs)
  return instant.toISOString()
}

// (normalizeTimestampRaw imported at top)

// Compute shift start & end Date objects given an attendance YYYY-MM-DD and shift times (supports crossing midnight)
function computeShiftSpanFromDate(attDateYmd: string, start: string, end: string, tz = BUSINESS_TZ) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startIso = localDateTimeToUtcIso(attDateYmd, sh, sm, tz)
  let endIso: string
  if (sh * 60 + sm > eh * 60 + em) {
    // crosses midnight -> end is next day
    const parts = attDateYmd.split('-').map(Number)
    const d = new Date(parts[0], parts[1] - 1, parts[2])
    d.setDate(d.getDate() + 1)
    const endYmd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    endIso = localDateTimeToUtcIso(endYmd, eh, em, tz)
  }
  else {
    endIso = localDateTimeToUtcIso(attDateYmd, eh, em, tz)
  }
  return { startDate: new Date(Date.parse(startIso)), endDate: new Date(Date.parse(endIso)) }
}

// Safely convert raw DB timestamp to ISO string, returning null for invalid values
function maybeIsoTimestamp(v: any) {
  const ms = normalizeTimestampRaw(v)
  if (!Number.isFinite(ms) || Number.isNaN(ms)) return null
  try {
    return new Date(ms).toISOString()
  }
  catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const userId = session.user.id

  const query = getQuery(event) as Record<string, any>
  const { month } = query
  const rawMode = query.raw === 'true' || query.raw === true
  const parsed = parseYearMonth(month as string | undefined)
  const now = new Date()
  const targetYear = parsed?.year ?? now.getFullYear()
  const targetMonth = parsed?.month ?? (now.getMonth() + 1)

  // First day of month (use UTC to avoid timezone shifts)
  const startDate = new Date(Date.UTC(targetYear, targetMonth - 1, 1))
  // First day next month (use UTC)
  const endDate = new Date(Date.UTC(targetYear, targetMonth, 1))
  const startStr = startDate.toISOString().slice(0, 10)
  const endStr = endDate.toISOString().slice(0, 10)

  const db = useDb()
  const t0 = Date.now()

  // Fetch attendanceDay rows for the month (kept minimal in case we need them later)
  const q0 = Date.now()
  const _days = await db
    .select()
    .from(attendanceDay)
    .where(and(eq(attendanceDay.userId, userId), between(attendanceDay.date, startStr, endStr)))
  const q1 = Date.now()

  // (no debug sampleDays in production)

  // Fetch logs for all those days. Some DBs may not have `shift_type` yet; try selecting it, fall back if missing.
  let logs: any[] = []
  let q2: number | null = null
  let q3: number | null = null
  try {
    q2 = Date.now()
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
    q3 = Date.now()
  }
  catch {
    // likely missing column in older DB; fall back to selecting existing columns
    q2 = Date.now()
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
    q3 = Date.now()
  }

  // If there are no logs for the user in the month, short-circuit and return quickly
  if (!logs.length) {
    // If there are attendance_day rows for this user/month, return them so UI can show planned shifts
    const daySummariesFromDays = (_days || []).map((d: any) => ({
      date: d.date,
      selectedShiftCode: d.selectedShiftCode ?? null,
      shiftType: d.shiftType ?? null,
      clockIn: null,
      clockOut: null,
      clockInLat: null,
      clockInLng: null,
      clockInAccuracy: null,
      clockOutLat: null,
      clockOutLng: null,
      clockOutAccuracy: null,
      lateMs: 0,
      earlyMs: 0,
      logs: [],
    }))

    const totalHarian = daySummariesFromDays.filter((x: any) => x.shiftType === 'harian').length
    const totalBantuan = daySummariesFromDays.filter((x: any) => x.shiftType === 'bantuan').length
    const totalWorking = daySummariesFromDays.length

    const baseNoLogs = {
      month: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      totalWorkingDays: totalWorking,
      totalHarianShift: totalHarian,
      totalBantuanShift: totalBantuan,
      totalLateMinutes: 0,
      totalEarlyLeaveMinutes: 0,
      days: daySummariesFromDays.sort((a: any, b: any) => a.date.localeCompare(b.date)),
    }

    return baseNoLogs
  }

  // If caller requested raw mode, return logs + shift definitions quickly so frontend can compute aggregates
  if (rawMode) {
    const q4raw = Date.now()
    let shiftsRaw: any[] = []
    try {
      shiftsRaw = await db.select().from(shift)
    }
    catch {
      shiftsRaw = []
    }
    const q5raw = Date.now()

    const mappedAll = logs.map((l) => {
      const tms = normalizeTimestampRaw(l.timestamp)
      return {
        id: l.id,
        userId: l.userId,
        date: l.date,
        type: l.type,
        timestampRaw: l.timestamp,
        timestampIso: maybeIsoTimestamp(l.timestamp),
        timestampMs: Number.isFinite(tms) ? tms : null,
        lat: l.lat ?? null,
        lng: l.lng ?? null,
        accuracy: l.accuracy ?? null,
        shiftCode: l.shiftCode ?? null,
        shiftType: l.shiftType ?? null,
      }
    })

    return {
      month: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      logsCount: logs.length,
      shifts: shiftsRaw,
      logs: mappedAll,
      _debug: {
        timing: {
          startToDaysMs: q0 - t0,
          daysQueryMs: q1 - q0,
          logsQueryMs: (q2 && q3) ? (q3 - q2) : null,
          shiftsQueryMs: q5raw - q4raw,
          processingMs: 0,
          postQueriesMs: Date.now() - q3,
          totalMs: Date.now() - t0,
        },
        monthComputed: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
        startStr,
        endStr,
        currentUserId: userId,
        logsCountByDate: (() => {
          const acc: Record<string, number> = {}
          for (const l of logs) acc[l.date] = (acc[l.date] || 0) + 1
          return acc
        })(),
      },
    }
  }

  // Fetch shifts (we'll need times to compute late / early leave)
  const shifts = await db.select().from(shift)

  const shiftMap = new Map(shifts.map(s => [s.code, s]))

  // Aggregation accumulators
  let totalWorkingDays = 0
  let totalHarianDays = 0
  let totalBantuanDays = 0
  // totals will be computed from per-shift daySummaries below

  // For each day that has at least a clock-in, count as working day
  const logsByDate = new Map<string, typeof logs>()
  for (const l of logs) {
    if (!logsByDate.has(l.date)) logsByDate.set(l.date, [])
    logsByDate.get(l.date)!.push(l as any)
  }

  // Build per-day summaries to return to the frontend (for AttendanceCard rendering)
  const daySummaries: any[] = []

  for (const [date, dayLogs] of logsByDate.entries()) {
  // note: attendanceDay row may or may not exist for this date; we still process logsByDate entries
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
      const ciList = (ciByType.get(st) || []).sort((a: any, b: any) => normalizeTimestampRaw(a.timestamp) - normalizeTimestampRaw(b.timestamp))
      const coList = (coByType.get(st) || []).sort((a: any, b: any) => normalizeTimestampRaw(b.timestamp) - normalizeTimestampRaw(a.timestamp))
      const clockIn = ciList[0]
      const clockOut = coList[0]
      const def = (clockIn && clockIn.shiftCode) ? shiftMap.get(clockIn.shiftCode) : undefined
      if (def && clockIn) {
        const { startDate: sStart, endDate: sEnd } = computeShiftSpanFromDate(date, def.start, def.end)
        const cin = new Date(normalizeTimestampRaw(clockIn.timestamp))
        if (cin > sStart) {
          // per-shift totals are accumulated later from daySummaries
        }
        if (clockOut) {
          const cout = new Date(normalizeTimestampRaw(clockOut.timestamp))
          if (cout < sEnd) {
            // per-shift totals are accumulated later from daySummaries
          }
        }
      }
    }

    // prepare full mapped logs for this date
    const mappedLogs = (dayLogs as any[]).map((l) => {
      const tms = normalizeTimestampRaw(l.timestamp)
      return {
        id: l.id,
        type: l.type,
        timestamp: maybeIsoTimestamp(l.timestamp),
        timestampMs: Number.isFinite(tms) ? tms : null,
        lat: l.lat ?? null,
        lng: l.lng ?? null,
        accuracy: l.accuracy ?? null,
        shiftCode: l.shiftCode ?? null,
        shiftType: l.shiftType ?? null,
        earlyReason: (l as any).earlyReason ?? (l as any).early_reason ?? null,
      }
    })

    // Group logs into shift-level items. Prefer grouping by shiftType (harian/bantuan),
    // and choose a representative shiftCode when available (clock-in.shiftCode or clock-out.shiftCode).
    const types = new Set<string>()
    for (const l of mappedLogs) {
      types.add(l.shiftType || 'unknown')
    }

    for (const st of Array.from(types)) {
      // logs belonging to this shift group
      const groupLogs = mappedLogs.filter(l => (l.shiftType || 'unknown') === st)
      if (!groupLogs.length) continue

      const ins = groupLogs.filter(g => g.type === 'clock-in').sort((a, b) => (a.timestampMs ?? Number.POSITIVE_INFINITY) - (b.timestampMs ?? Number.POSITIVE_INFINITY))
      const outs = groupLogs.filter(g => g.type === 'clock-out').sort((a, b) => (a.timestampMs ?? Number.POSITIVE_INFINITY) - (b.timestampMs ?? Number.POSITIVE_INFINITY))
      const clockIn = ins[0] ?? null
      const clockOut = outs.length ? outs[outs.length - 1] : null

      // prefer shiftCode from clockIn, then clockOut, else null
      const chosenShiftCode = clockIn?.shiftCode ?? clockOut?.shiftCode ?? null

      // compute per-shift lateMs and earlyMs if we have a shift definition
      let lateMsForShift = 0
      let earlyMsForShift = 0
      if (chosenShiftCode) {
        const def = shiftMap.get(chosenShiftCode)
        if (def && clockIn) {
          const { startDate: sStart, endDate: sEnd } = computeShiftSpanFromDate(date, def.start, def.end)
          const cin = clockIn.timestampMs ? new Date(clockIn.timestampMs) : null
          if (cin && cin > sStart) lateMsForShift = Math.max(0, cin.getTime() - sStart.getTime())
          if (clockOut) {
            const cout = clockOut.timestampMs ? new Date(clockOut.timestampMs) : null
            if (cout && cout < sEnd) earlyMsForShift = Math.max(0, sEnd.getTime() - cout.getTime())
          }
        }
      }

      daySummaries.push({
        date,
        selectedShiftCode: chosenShiftCode,
        shiftType: st === 'unknown' ? null : st,
        clockIn: clockIn ? clockIn.timestamp : null,
        clockOut: clockOut ? clockOut.timestamp : null,
        clockInLat: clockIn?.lat ?? null,
        clockInLng: clockIn?.lng ?? null,
        clockInAccuracy: clockIn?.accuracy ?? null,
        clockOutLat: clockOut?.lat ?? null,
        clockOutLng: clockOut?.lng ?? null,
        clockOutAccuracy: clockOut?.accuracy ?? null,
        lateMs: lateMsForShift,
        earlyMs: earlyMsForShift,
        logs: groupLogs,
      })
    }
  }

  // Recompute totals from the per-shift daySummaries so the returned totals match the items returned
  let recomputedLate = 0
  let recomputedEarly = 0
  for (const s of daySummaries) {
    recomputedLate += Math.ceil(((s.lateMs || 0) / 60000))
    recomputedEarly += Math.ceil(((s.earlyMs || 0) / 60000))
  }

  const base = {
    month: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
    totalWorkingDays,
    totalHarianShift: totalHarianDays,
    totalBantuanShift: totalBantuanDays,
    totalLateMinutes: recomputedLate,
    totalEarlyLeaveMinutes: recomputedEarly,
    days: daySummaries.sort((a, b) => a.date.localeCompare(b.date)),
  }
  return base
})
