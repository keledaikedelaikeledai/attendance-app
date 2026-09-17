import type { ShiftCode, ShiftDef } from '~/types/shifts'
import { formatBusinessDate, getCalendarDate, getZonedDateTime, parseShiftTime, resolveBusinessDateFromInstant, createShiftWindow } from '~/shared/utils/attendance-date'

export interface AttendanceLog {
  id: string
  type: 'clock-in' | 'clock-out'
  timestamp: string
  date?: string
  lat?: number
  lng?: number
  accuracy?: number
  shiftCode?: ShiftCode
  shiftType?: 'harian' | 'bantuan'
  earlyReason?: string | null
  geofenceComment?: string | null
  geofenceId?: string | null
  geofenceName?: string | null
}

const shifts = ref<ShiftDef[]>([])
const clientTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

function businessDateForInstant(instant: Date, timeZone = clientTimeZone()) {
  return formatBusinessDate(getCalendarDate(instant, timeZone))
}

async function loadShifts() {
  const rows = await $fetch<ShiftDef[]>('/api/shifts', { credentials: 'include', query: { ts: Date.now() } })
  shifts.value = rows || []
}

export function getShiftLabel(code?: ShiftCode | null) {
  return shifts.value.find(s => s.code === code)?.label || code || '-'
}

function pickClosestShiftFromShifts(now = new Date()) {
  const timeZone = clientTimeZone()
  const zoned = getZonedDateTime(now, timeZone)
  const nowMin = zoned.hour * 60 + zoned.minute
  let closest: { code: string, diff: number } | null = null
  for (const s of shifts.value ?? []) {
    const start = parseShiftTime(s.start)
    const startMin = start.hour * 60 + start.minute
    let diff = Math.abs(startMin - nowMin)
    diff = Math.min(diff, 1440 - diff)
    if (!closest || diff < closest.diff) closest = { code: s.code, diff }
  }
  return closest?.code
}

const clockedIn = ref<boolean>(false)
const clockInTime = ref<string | undefined>()
const clockOutTime = ref<string | undefined>()
const logs = ref<AttendanceLog[]>([])
const selectedShiftCode = ref<ShiftCode | undefined>()
const selectedShiftType = ref<'harian' | 'bantuan' | undefined>()

async function refresh() {
  const s = await $fetch<any>('/api/attendance', { method: 'GET', credentials: 'include', query: { ts: Date.now(), timeZone: clientTimeZone() } })
  if (!s) return
  if (!shifts.value.length) await loadShifts()
  clockedIn.value = !!s.clockedIn
  clockInTime.value = s.clockInTime
  clockOutTime.value = s.clockOutTime
  logs.value = (s.logs || []).map((l: any) => ({
    id: l.id, type: l.type, timestamp: new Date(l.timestamp).toISOString(),
    lat: l.lat ?? undefined, lng: l.lng ?? undefined, accuracy: l.accuracy ?? undefined,
    shiftCode: l.shiftCode ?? undefined, shiftType: l.shiftType ?? undefined, date: l.date,
    earlyReason: (l as any).earlyReason ?? (l as any).early_reason ?? null,
    geofenceComment: (l as any).geofenceComment ?? (l as any).geofence_comment ?? null,
    geofenceId: (l as any).geofenceId ?? (l as any).geofence_id ?? null,
    geofenceName: (l as any).geofenceName ?? (l as any).geofence_name ?? null,
  }))
  const latestClockIn = logs.value.find(l => l.type === 'clock-in')
  selectedShiftCode.value = s.clockedIn ? (latestClockIn?.shiftCode ?? s.selectedShiftCode ?? undefined) : (s.selectedShiftCode ?? undefined)
  selectedShiftType.value = s.clockedIn ? (latestClockIn?.shiftType ?? s.shiftType ?? undefined) : (s.shiftType ?? undefined)
}

const durationMs = computed(() => {
  if (!clockInTime.value) return 0
  const end = clockedIn.value ? Date.now() : (clockOutTime.value ? Date.parse(clockOutTime.value) : Date.now())
  return end - Date.parse(clockInTime.value)
})

const durationHuman = computed(() => {
  const ms = durationMs.value
  if (!ms) return '0m'
  const totalMinutes = Math.floor(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h ? `${h}h ${m}m` : `${m}m`
})

function shiftStartDate(clockInIso: string, code: ShiftCode | undefined) {
  if (!code) return null
  const def = shifts.value.find(s => s.code === code)
  if (!def) return null
  try {
    const timeZone = clientTimeZone()
    const instant = new Date(clockInIso)
    const businessDate = resolveBusinessDateFromInstant(instant, { start: def.start, end: def.end }, timeZone)
    return createShiftWindow(businessDate, { start: def.start, end: def.end }, timeZone).start.toDate()
  }
  catch {
    return null
  }
}

const lateByMs = computed(() => {
  if (!clockInTime.value) return 0
  const activeClockInShiftCode = (clockedIn.value ? logs.value.find(l => l.type === 'clock-in')?.shiftCode : undefined) ?? selectedShiftCode.value
  if (!activeClockInShiftCode) return 0
  const start = shiftStartDate(clockInTime.value, activeClockInShiftCode)
  if (!start) return 0
  return Math.max(0, new Date(clockInTime.value).getTime() - start.getTime())
})

const isLate = computed(() => lateByMs.value > 0)
const lateByHuman = computed(() => {
  const ms = lateByMs.value
  if (!ms) return '0m'
  const totalMinutes = Math.ceil(ms / 60000), h = Math.floor(totalMinutes / 60), m = totalMinutes % 60
  return h ? `${h}h ${m}m` : `${m}m`
})

async function setShift(code: ShiftCode | undefined, type?: 'harian' | 'bantuan' | undefined) {
  selectedShiftCode.value = code
  if (type) selectedShiftType.value = type
  await $fetch('/api/attendance/shift', { method: 'POST', body: { shiftCode: code, shiftType: type, timeZone: clientTimeZone() }, credentials: 'include' })
  await refresh()
}

async function ensureDefaultShift() {
  if (clockedIn.value) return
  if (!shifts.value.length) await loadShifts()
  if (!selectedShiftCode.value) {
    const def = pickClosestShiftFromShifts(new Date())
    if (def) await setShift(def, 'harian')
  }
  if (!selectedShiftType.value) selectedShiftType.value = 'harian'
}

interface ClockInOptions { coords?: GeolocationCoordinates, shiftCode?: ShiftCode | undefined, geofenceComment?: string, geofenceId?: string, geofenceName?: string }
async function clockIn(opts?: ClockInOptions) {
  if (clockedIn.value) return
  try {
    const shiftTypeToCheck = selectedShiftType.value
    if (shiftTypeToCheck) {
      const today = businessDateForInstant(new Date())
      for (const l of logs.value) {
        if (l.type !== 'clock-in' || l.shiftType !== shiftTypeToCheck) continue
        if (l.date === today) {
          try {
            const _t = (typeof useToast === 'function') ? useToast() : null
            if (_t) _t.add({ title: 'Already clocked in', description: `You already have a ${shiftTypeToCheck} clock-in today.`, color: 'warning' })
          } catch {}
          return
        }
      }
    }
  } catch (err) {
    useErrorReporter().captureException(err, { context: 'clock-in-duplicate-check' })
  }
  if (opts?.shiftCode) selectedShiftCode.value = opts.shiftCode
  const res = await $fetch<any>('/api/attendance/clock-in', {
    method: 'POST',
    body: {
      shiftCode: selectedShiftCode.value, shiftType: selectedShiftType.value, timeZone: clientTimeZone(),
      coords: opts?.coords ? { latitude: opts.coords.latitude, longitude: opts.coords.longitude, accuracy: opts.coords.accuracy } : undefined,
      geofenceComment: typeof opts?.geofenceComment === 'string' && opts.geofenceComment.length ? opts.geofenceComment.slice(0, 200) : undefined,
      geofenceId: typeof opts?.geofenceId === 'string' && opts?.geofenceId.length ? opts.geofenceId.slice(0, 64) : undefined,
      geofenceName: typeof opts?.geofenceName === 'string' && opts?.geofenceName.length ? opts.geofenceName.slice(0, 200) : undefined,
    }, credentials: 'include',
  })
  if (res) {
    clockedIn.value = true; clockInTime.value = new Date().toISOString(); clockOutTime.value = undefined
    selectedShiftCode.value = res.selectedShiftCode ?? selectedShiftCode.value
    selectedShiftType.value = res.shiftType ?? selectedShiftType.value
  }
  await refresh()
}

async function clockOut(coords?: GeolocationCoordinates, earlyReason?: string | null, geofenceComment?: string | null, geofenceId?: string | null, geofenceName?: string | null) {
  if (!clockedIn.value) return
  const res = await $fetch<any>('/api/attendance/clock-out', {
    method: 'POST',
    body: {
      coords: coords ? { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy } : undefined,
      shiftType: selectedShiftType.value, shiftCode: selectedShiftCode.value, timeZone: clientTimeZone(),
      earlyReason: typeof earlyReason === 'string' && earlyReason.length ? earlyReason.slice(0, 200) : undefined,
      geofenceComment: typeof geofenceComment === 'string' && geofenceComment.length ? geofenceComment.slice(0, 200) : undefined,
      geofenceId: typeof geofenceId === 'string' && geofenceId.length ? geofenceId.slice(0, 64) : undefined,
      geofenceName: typeof geofenceName === 'string' && geofenceName.length ? geofenceName.slice(0, 200) : undefined,
    }, credentials: 'include',
  })
  if (res) { clockedIn.value = false; clockOutTime.value = new Date().toISOString() }
  await refresh()
}

async function resetDay() {
  await $fetch('/api/attendance/reset', { method: 'POST', body: { timeZone: clientTimeZone() }, credentials: 'include' })
  await refresh()
}

export function useAttendance() {
  return {
    clockedIn, clockInTime, clockOutTime, logs, durationMs, durationHuman, isLate, lateByMs, lateByHuman,
    clockIn, clockOut, resetDay, shifts, selectedShiftCode, selectedShiftType, setShift, ensureDefaultShift,
    isShiftActive: (shiftType?: 'harian' | 'bantuan' | undefined) => {
      if (!shiftType) return false
      const today = businessDateForInstant(new Date())
      return logs.value.some(l => l.type === 'clock-in' && l.shiftType === shiftType && l.date === today)
    },
    getShiftLabel, refresh,
  }
}
