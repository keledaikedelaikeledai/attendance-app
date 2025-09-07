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

  // Index logs by user/date
  const byUserDate: Record<string, Record<string, {
    clockIn?: string
    clockInLat?: number | null
    clockInLng?: number | null
    clockInAccuracy?: number | null
    clockOut?: string
    clockOutLat?: number | null
    clockOutLng?: number | null
    clockOutAccuracy?: number | null
    ciShiftCode?: string | null
  }>> = {}
  for (const l of logs) {
    const keyU = l.userId
    const keyD = l.date
    byUserDate[keyU] ||= {}
    byUserDate[keyU][keyD] ||= {}
    if (l.type === 'clock-in') {
      if (!byUserDate[keyU][keyD].clockIn) {
        byUserDate[keyU][keyD].clockIn = new Date(l.timestamp).toISOString()
        byUserDate[keyU][keyD].clockInLat = l.lat ?? null
        byUserDate[keyU][keyD].clockInLng = l.lng ?? null
        byUserDate[keyU][keyD].clockInAccuracy = l.accuracy ?? null
        byUserDate[keyU][keyD].ciShiftCode = (l as any).shiftCode ?? null
      }
    }
    else if (l.type === 'clock-out') {
      byUserDate[keyU][keyD].clockOut = new Date(l.timestamp).toISOString()
      byUserDate[keyU][keyD].clockOutLat = l.lat ?? null
      byUserDate[keyU][keyD].clockOutLng = l.lng ?? null
      byUserDate[keyU][keyD].clockOutAccuracy = l.accuracy ?? null
    }
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
      const shCode = shiftByUserDate[u.id]?.[ds]?.code || byUserDate[u.id]?.[ds]?.ciShiftCode || undefined
      const shType = shiftByUserDate[u.id]?.[ds]?.type
      const shiftDef = shCode ? shiftMap[shCode] : undefined
      const v = byUserDate[u.id]?.[ds] || {}
      // Compute lateMs server-side to keep UI simple and consistent
      let lateMs = 0
      if (v.clockIn && shiftDef) {
        const ci = new Date(v.clockIn)
        const [shStr, smStr] = (shiftDef.start || '').split(':')
        const [ehStr, emStr] = (shiftDef.end || '').split(':')
        const sh = Number(shStr)
        const sm = Number(smStr)
        const eh = Number(ehStr)
        const em = Number(emStr)
        if (!Number.isNaN(sh) && !Number.isNaN(sm) && !Number.isNaN(eh) && !Number.isNaN(em)) {
          const startMin = sh * 60 + sm
          const endMin = eh * 60 + em
          const ciMin = ci.getHours() * 60 + ci.getMinutes()
          const crossesMidnight = startMin > endMin
          let y = ci.getFullYear()
          let m = ci.getMonth()
          let d = ci.getDate()
          if (crossesMidnight && ciMin < endMin) {
            const prev = new Date(ci)
            prev.setDate(prev.getDate() - 1)
            y = prev.getFullYear()
            m = prev.getMonth()
            d = prev.getDate()
          }
          const startDate = new Date(y, m, d, sh, sm, 0, 0)
          const diff = ci.getTime() - startDate.getTime()
          lateMs = Math.max(0, diff)
        }
      }
      return [ds, {
        clockIn: v.clockIn,
        clockInLat: v.clockInLat ?? undefined,
        clockInLng: v.clockInLng ?? undefined,
        clockInAccuracy: v.clockInAccuracy ?? undefined,
        clockOut: v.clockOut,
        clockOutLat: v.clockOutLat ?? undefined,
        clockOutLng: v.clockOutLng ?? undefined,
        clockOutAccuracy: v.clockOutAccuracy ?? undefined,
        shiftCode: shCode,
        shiftType: shType,
        shift: shiftDef,
        lateMs,
      } as const]
    })),
  }))

  return { month, days: allDays, rows }
})
