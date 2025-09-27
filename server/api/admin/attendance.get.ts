import process from 'node:process'
import { and, asc, eq, gte, inArray, isNull, lte, ne, or } from 'drizzle-orm'
import { attendanceDay, attendanceLog, shift, user } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'

// GET /api/admin/attendance?month=2025-09
// Returns: { month, days: [YYYY-MM-DD], rows: [{ userId, email, name, username, byDate: { [date]: { clockIn?: string, clockOut?: string, shiftCode?: string } } }] }
function isAllowedAdmin(email?: string | null) {
  const raw = process.env.NUXT_ADMIN_EMAILS || ''
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (!list.length)
    return true
  if (!email)
    return false
  return list.includes(String(email).toLowerCase())
}

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (!isAllowedAdmin(session.user.email))
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const q = getQuery(event)
  const month = typeof q.month === 'string' && /^\d{4}-\d{2}$/.test(q.month) ? q.month : new Date().toISOString().slice(0, 7)
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0))
  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)

  const db = useDb()

  // Fetch all users excluding admins and banned users
  const users = await db
    .select({ id: user.id, email: user.email, name: user.name, username: user.username })
    .from(user)
    .where(
      and(
        // Exclude role 'admin' (keep null or non-admin)
        or(isNull(user.role), ne(user.role, 'admin')),
        // Exclude banned=true (keep null or false)
        or(isNull(user.banned), eq(user.banned, false)),
      ),
    )
    .orderBy(asc(user.createdAt))

  if (users.length === 0) {
    return { month, days: [], rows: [] }
  }

  const userIds = users.map(u => u.id)

  // Fetch days for the month (selected shift useful for context)
  const days = await db
    .select({ userId: attendanceDay.userId, date: attendanceDay.date, selectedShiftCode: attendanceDay.selectedShiftCode, shiftType: attendanceDay.shiftType })
    .from(attendanceDay)
    .where(and(inArray(attendanceDay.userId, userIds), gte(attendanceDay.date, startDate), lte(attendanceDay.date, endDate)))

  // Fetch logs and pick earliest clock-in and latest clock-out per user/date
  const logs = await db
    .select({
      userId: attendanceLog.userId,
      date: attendanceLog.date,
      type: attendanceLog.type,
      timestamp: attendanceLog.timestamp,
      lat: attendanceLog.lat,
      lng: attendanceLog.lng,
      accuracy: attendanceLog.accuracy,
      shiftCode: attendanceLog.shiftCode,
      shiftType: attendanceLog.shiftType,
    })
    .from(attendanceLog)
    .where(and(inArray(attendanceLog.userId, userIds), gte(attendanceLog.date, startDate), lte(attendanceLog.date, endDate)))
    .orderBy(asc(attendanceLog.timestamp))

  // Build calendar days for the month
  const allDays: string[] = []
  for (let d = 1; d <= end.getUTCDate(); d++) {
    const ds = `${month}-${String(d).padStart(2, '0')}`
    allDays.push(ds)
  }

  // Index logs by user/date and by shiftType so we can support multiple shifts per day
  const byUserDate: Record<string, Record<string, {
    entries: Array<{
      type: 'clock-in' | 'clock-out'
      timestamp: string
      lat?: number | null
      lng?: number | null
      accuracy?: number | null
      shiftCode?: string | null
      shiftType?: string | null
    }>
  }>> = {}
  for (const l of logs) {
    const keyU = l.userId
    const keyD = l.date
    byUserDate[keyU] ||= {}
    byUserDate[keyU][keyD] ||= { entries: [] }
    byUserDate[keyU][keyD].entries.push({
      type: l.type as any,
      timestamp: new Date(l.timestamp).toISOString(),
      lat: l.lat ?? null,
      lng: l.lng ?? null,
      accuracy: l.accuracy ?? null,
      shiftCode: (l as any).shiftCode ?? null,
      shiftType: (l as any).shiftType ?? null,
    })
  }

  // Map selected shift code and type from days table
  const shiftByUserDate: Record<string, Record<string, { code?: string, type?: 'harian' | 'bantuan' }>> = {}
  for (const d of days) {
    shiftByUserDate[d.userId] ||= {}
    shiftByUserDate[d.userId][d.date] = { code: d.selectedShiftCode ?? undefined, type: (d as any).shiftType ?? undefined }
  }

  // Load shift definitions for enrichment
  const shifts = await db.select().from(shift)
  const shiftMap = Object.fromEntries(shifts.map(s => [s.code, { code: s.code, label: s.label, start: s.start, end: s.end }])) as Record<string, { code: string, label: string, start: string, end: string }>

  const rows = users.map(u => ({
    userId: u.id,
    email: u.email,
    name: u.name,
    username: u.username,
    byDate: Object.fromEntries(allDays.map((ds) => {
      // We want to support multiple shift entries per day (harian + bantuan).
      const explicitShift = shiftByUserDate[u.id]?.[ds]
      const entries = (byUserDate[u.id]?.[ds]?.entries ?? []) as any[]
      const _shiftDef = (explicitShift?.code && shiftMap[explicitShift.code]) || undefined
      // Compute lateMs server-side to keep UI simple and consistent
      // For admin grid, compute aggregated values: count of distinct shiftTypes with a clock-in, earliest clock-in per shift, latest clock-out per shift
      const groupedByShiftType: Record<string, any> = {}
      for (const e of entries) {
        const st = e.shiftType || 'unknown'
        groupedByShiftType[st] ||= {} as any
        // keep earliest clock-in for "start of shift" calculations (existing behavior)
        if (e.type === 'clock-in') {
          if (!groupedByShiftType[st].clockIn || new Date(e.timestamp) < new Date(groupedByShiftType[st].clockIn)) {
            groupedByShiftType[st].clockIn = e.timestamp
            groupedByShiftType[st].clockInLat = e.lat
            groupedByShiftType[st].clockInLng = e.lng
            groupedByShiftType[st].clockInAccuracy = e.accuracy
            groupedByShiftType[st].shiftCode = e.shiftCode
          }
          // also track the latest clock-in so callers can see the most recent activity
          if (!groupedByShiftType[st].clockInLast || new Date(e.timestamp) > new Date(groupedByShiftType[st].clockInLast)) {
            groupedByShiftType[st].clockInLast = e.timestamp
            groupedByShiftType[st].clockInLastLat = e.lat
            groupedByShiftType[st].clockInLastLng = e.lng
            groupedByShiftType[st].clockInLastAccuracy = e.accuracy
            // keep the most recent shiftCode too (may be null)
            groupedByShiftType[st].shiftCodeLast = e.shiftCode
          }
        }
        else if (e.type === 'clock-out') {
          if (!groupedByShiftType[st].clockOut || new Date(e.timestamp) > new Date(groupedByShiftType[st].clockOut)) {
            groupedByShiftType[st].clockOut = e.timestamp
            groupedByShiftType[st].clockOutLat = e.lat
            groupedByShiftType[st].clockOutLng = e.lng
            groupedByShiftType[st].clockOutAccuracy = e.accuracy
          }
        }
      }

      // compute lateMs per shift using shiftMap where possible and sum
      let totalLateMs = 0
      let totalEarlyMs = 0
      let countWorkingShifts = 0
      let harian = 0
      let bantuan = 0
      for (const [st, val] of Object.entries(groupedByShiftType)) {
        if (val.clockIn) {
          countWorkingShifts++
          if (st === 'harian') harian++
          else if (st === 'bantuan') bantuan++
          const sd = val.shiftCode ? shiftMap[val.shiftCode] : undefined
          if (sd) {
            const ci = new Date(val.clockIn)
            const partsStart = (sd.start || '').split(':')
            const partsEnd = (sd.end || '').split(':')
            const sh = Number(partsStart[0])
            const sm = Number(partsStart[1])
            const eh = Number(partsEnd[0])
            const em = Number(partsEnd[1])
            if (![sh, sm, eh, em].some(n => Number.isNaN(n))) {
              const startMin = sh * 60 + sm
              const endMin = eh * 60 + em
              // anchor schedule to the attendance day `ds` (YYYY-MM-DD) to avoid timezone/date shifts
              const [yy, mm2, dd2] = ds.split('-').map(Number)
              let y = yy
              let m = mm2 - 1
              let d = dd2
              // If shift crosses midnight and the clock-in minute is before endMin, it likely belongs to the next-day portion
              const ciMin = ci.getHours() * 60 + ci.getMinutes()
              if (startMin > endMin && ciMin < endMin) {
                // treat startDate as previous day
                const prev = new Date(y, m, d)
                prev.setDate(prev.getDate() - 1)
                y = prev.getFullYear()
                m = prev.getMonth()
                d = prev.getDate()
              }
              const startDate = new Date(y, m, d, sh, sm, 0, 0)
              totalLateMs += Math.max(0, ci.getTime() - startDate.getTime())
            }
          }
        }
        if (val.clockOut && val.shiftCode) {
          const sd = shiftMap[val.shiftCode]
          if (sd) {
            const co = new Date(val.clockOut)
            const partsStart = (sd.start || '').split(':')
            const partsEnd = (sd.end || '').split(':')
            const sh = Number(partsStart[0])
            const sm = Number(partsStart[1])
            const eh = Number(partsEnd[0])
            const em = Number(partsEnd[1])
            if (![sh, sm, eh, em].some(n => Number.isNaN(n))) {
              const startMin = sh * 60 + sm
              const endMin = eh * 60 + em
              // anchor schedule to the attendance day `ds` (YYYY-MM-DD)
              const [yy, mm2, dd2] = ds.split('-').map(Number)
              let y = yy
              let m = mm2 - 1
              let d = dd2
              const crosses = startMin > endMin
              // If shift crosses midnight and clockOut time is before endMin, it belongs to the next-day portion
              if (crosses && (co.getHours() * 60 + co.getMinutes()) < endMin) {
                const prev = new Date(y, m, d)
                prev.setDate(prev.getDate() - 1)
                y = prev.getFullYear()
                m = prev.getMonth()
                d = prev.getDate()
              }
              const startDate = new Date(y, m, d, sh, sm, 0, 0)
              const endDate = new Date(startDate)
              if (startMin > endMin) endDate.setDate(endDate.getDate() + 1)
              endDate.setHours(eh, em, 0, 0)
              totalEarlyMs += Math.max(0, endDate.getTime() - co.getTime())
            }
          }
        }
      }

      return [ds, {
        grouped: groupedByShiftType,
        clockIn: undefined,
        clockOut: undefined,
        clockInLat: undefined,
        clockInLng: undefined,
        clockInAccuracy: undefined,
        clockOutLat: undefined,
        clockOutLng: undefined,
        clockOutAccuracy: undefined,
        shiftCode: undefined,
        shiftType: undefined,
        shift: undefined,
        lateMs: totalLateMs,
        earlyMs: totalEarlyMs,
        workingShifts: countWorkingShifts,
        harian,
        bantuan,
      } as const]
    })),
  }))

  return { month, days: allDays, rows }
})
