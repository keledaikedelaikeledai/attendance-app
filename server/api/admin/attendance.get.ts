import process from 'node:process'
import { and, asc, eq, gte, inArray, isNull, lte, ne, or } from 'drizzle-orm'
import { attendanceLog, shift, user } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'
import { calculateAttendanceReportMetrics } from '../../utils/attendance-admin-report'
import { normalizeTimestampRaw } from '../../utils/time'

function isAllowedAdmin(email?: string | null) {
  const raw = process.env.NUXT_ADMIN_EMAILS || ''
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (!list.length) return true
  if (!email) return false
  return list.includes(String(email).toLowerCase())
}

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (!isAllowedAdmin(session.user.email)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const q = getQuery(event)
  const month = typeof q.month === 'string' && /^\d{4}-\d{2}$/.test(q.month) ? q.month : new Date().toISOString().slice(0, 7)
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0))
  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)

  const db = useDb()
  const users = await db
    .select({ id: user.id, email: user.email, name: user.name, username: user.username })
    .from(user)
    .where(and(or(isNull(user.role), ne(user.role, 'admin')), or(isNull(user.banned), eq(user.banned, false))))
    .orderBy(asc(user.createdAt))

  if (users.length === 0) return { month, days: [], rows: [] }
  const userIds = users.map(u => u.id)

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
      shiftStart: attendanceLog.shiftStart,
      shiftEnd: attendanceLog.shiftEnd,
      earlyReason: (attendanceLog as any).earlyReason,
    })
    .from(attendanceLog)
    .where(and(inArray(attendanceLog.userId, userIds), gte(attendanceLog.date, startDate), lte(attendanceLog.date, endDate)))
    .orderBy(asc(attendanceLog.timestamp))

  const allDays: string[] = []
  for (let d = 1; d <= end.getUTCDate(); d++) allDays.push(`${month}-${String(d).padStart(2, '0')}`)

  const byUserDate: Record<string, Record<string, { entries: Array<{
    type: 'clock-in' | 'clock-out'
    timestamp: string | null
    timestampMs: number | null
    lat?: number | null
    lng?: number | null
    accuracy?: number | null
    shiftCode?: string | null
    shiftType?: string | null
    shiftStart?: string | null
    shiftEnd?: string | null
  }> }>> = {}
  for (const l of logs) {
    const keyU = l.userId
    const keyD = l.date
    byUserDate[keyU] ||= {}
    byUserDate[keyU][keyD] ||= { entries: [] }
    const tsMs = normalizeTimestampRaw(l.timestamp)
    byUserDate[keyU][keyD].entries.push({
      type: l.type as any,
      timestamp: Number.isFinite(tsMs) ? new Date(tsMs).toISOString() : null,
      timestampMs: Number.isFinite(tsMs) ? tsMs : null,
      lat: l.lat ?? null,
      lng: l.lng ?? null,
      accuracy: l.accuracy ?? null,
      shiftCode: (l as any).shiftCode ?? null,
      shiftType: (l as any).shiftType ?? null,
      shiftStart: (l as any).shiftStart ?? null,
      shiftEnd: (l as any).shiftEnd ?? null,
      earlyReason: (l as any).earlyReason ?? (l as any).early_reason ?? null,
    } as any)
  }

  const shifts = await db.select().from(shift)
  const shiftMap = Object.fromEntries(shifts.map(s => [s.code, { code: s.code, label: s.label, start: s.start, end: s.end }])) as Record<string, { code: string, label: string, start: string, end: string }>
  const BUSINESS_TZ = process.env.BUSINESS_TZ || 'Asia/Jakarta'

  const rows = users.map(u => ({
    userId: u.id,
    email: u.email,
    name: u.name,
    username: u.username,
    byDate: (() => {
      const byDate = Object.fromEntries(allDays.map((ds) => {
        const entries = (byUserDate[u.id]?.[ds]?.entries ?? []) as any[]
        const groupedByShiftType: Record<string, any> = {}
        for (const e of entries) {
          const st = e.shiftType || 'harian'
          groupedByShiftType[st] ||= {} as any
          if (e.type === 'clock-in') {
            if (e.timestamp && (!groupedByShiftType[st].clockIn || (e.timestampMs != null && e.timestampMs < Date.parse(groupedByShiftType[st].clockIn)))) {
              groupedByShiftType[st].clockIn = e.timestamp
              groupedByShiftType[st].clockInLat = e.lat
              groupedByShiftType[st].clockInLng = e.lng
              groupedByShiftType[st].clockInAccuracy = e.accuracy
              groupedByShiftType[st].shiftCode = e.shiftCode
              groupedByShiftType[st].shiftStart = e.shiftStart
              groupedByShiftType[st].shiftEnd = e.shiftEnd
            }
            if (e.timestamp && (!groupedByShiftType[st].clockInLast || (e.timestampMs != null && e.timestampMs > Date.parse(groupedByShiftType[st].clockInLast)))) {
              groupedByShiftType[st].clockInLast = e.timestamp
              groupedByShiftType[st].clockInLastLat = e.lat
              groupedByShiftType[st].clockInLastLng = e.lng
              groupedByShiftType[st].clockInLastAccuracy = e.accuracy
              groupedByShiftType[st].shiftCodeLast = e.shiftCode
            }
          }
          else if (e.type === 'clock-out') {
            if (e.timestamp && (!groupedByShiftType[st].clockOut || (e.timestampMs != null && e.timestampMs > Date.parse(groupedByShiftType[st].clockOut)))) {
              groupedByShiftType[st].clockOut = e.timestamp
              groupedByShiftType[st].clockOutLat = e.lat
              groupedByShiftType[st].clockOutLng = e.lng
              groupedByShiftType[st].clockOutAccuracy = e.accuracy
              groupedByShiftType[st].shiftCode = groupedByShiftType[st].shiftCode ?? e.shiftCode ?? null
              groupedByShiftType[st].shiftStart = groupedByShiftType[st].shiftStart ?? e.shiftStart ?? null
              groupedByShiftType[st].shiftEnd = groupedByShiftType[st].shiftEnd ?? e.shiftEnd ?? null
              groupedByShiftType[st].earlyReason = (e as any).earlyReason ?? (e as any).early_reason ?? null
            }
          }
        }

        for (const val of Object.values(groupedByShiftType)) {
          if (!val?.clockIn || !val?.clockOut) continue
          const cin = Date.parse(val.clockIn)
          const cout = Date.parse(val.clockOut)
          if (Number.isFinite(cin) && Number.isFinite(cout) && cout < cin) {
            delete val.clockOut
            delete val.clockOutLat
            delete val.clockOutLng
            delete val.clockOutAccuracy
            delete val.earlyReason
          }
        }
        return [ds, calculateAttendanceReportMetrics(ds, groupedByShiftType, shiftMap, BUSINESS_TZ)]
      })) as Record<string, any>

      for (let i = 1; i < allDays.length; i++) {
        const prevDs = allDays[i - 1]
        const currDs = allDays[i]
        if (!prevDs || !currDs) continue
        const prevCell = byDate[prevDs]
        const currCell = byDate[currDs]
        const prevGrouped = prevCell?.grouped as Record<string, any> | undefined
        const currGrouped = currCell?.grouped as Record<string, any> | undefined
        if (!prevGrouped || !currGrouped) continue

        let changed = false
        for (const [st, currVal] of Object.entries(currGrouped)) {
          if (!currVal || currVal.clockIn || !currVal.clockOut) continue
          const currShiftCode = currVal.shiftCode ?? currVal.shiftCodeLast ?? null
          const currOutMs = Date.parse(currVal.clockOut)
          if (!Number.isFinite(currOutMs)) continue

          let prevKey: string | null = st
          let prevVal = prevGrouped[prevKey]
          if (!prevVal?.clockIn) {
            prevKey = null
            for (const [candidateKey, candidateVal] of Object.entries(prevGrouped)) {
              if (!candidateVal?.clockIn) continue
              const candidateCode = candidateVal.shiftCode ?? candidateVal.shiftCodeLast ?? null
              if (currShiftCode && candidateCode && candidateCode !== currShiftCode) continue
              prevKey = candidateKey
              prevVal = candidateVal
              break
            }
          }

          const prevShiftCode = prevVal?.shiftCode ?? prevVal?.shiftCodeLast ?? null
          const canMerge = !!prevVal?.clockIn && (!prevVal?.clockOut || (currShiftCode && prevShiftCode && currShiftCode === prevShiftCode))
          if (canMerge && prevKey) {
            const prevOutMs = prevVal?.clockOut ? Date.parse(prevVal.clockOut) : Number.NEGATIVE_INFINITY
            if (!prevVal.clockOut || currOutMs >= prevOutMs) {
              prevVal.clockOut = currVal.clockOut
              prevVal.clockOutLat = currVal.clockOutLat
              prevVal.clockOutLng = currVal.clockOutLng
              prevVal.clockOutAccuracy = currVal.clockOutAccuracy
            }
            if (currVal.earlyReason != null) prevVal.earlyReason = currVal.earlyReason
            if (!prevVal.shiftCode && currVal.shiftCode) prevVal.shiftCode = currVal.shiftCode
            if (!prevVal.shiftStart && currVal.shiftStart) prevVal.shiftStart = currVal.shiftStart
            if (!prevVal.shiftEnd && currVal.shiftEnd) prevVal.shiftEnd = currVal.shiftEnd
            delete currGrouped[st]
            changed = true
          }
        }

        if (changed) {
          byDate[prevDs] = calculateAttendanceReportMetrics(prevDs, prevGrouped, shiftMap, BUSINESS_TZ)
          byDate[currDs] = calculateAttendanceReportMetrics(currDs, currGrouped, shiftMap, BUSINESS_TZ)
        }
      }

      return byDate
    })(),
  }))

  return { month, days: allDays, rows }
})
