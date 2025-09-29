import type { ShiftCode, ShiftDef } from '~/types/shifts'

export interface AttendanceLog {
  id: string
  type: 'clock-in' | 'clock-out'
  timestamp: string // ISO
  date?: string
  lat?: number
  lng?: number
  accuracy?: number
  shiftCode?: ShiftCode
  shiftType?: 'harian' | 'bantuan'
  earlyReason?: string | null
}

// Shifts are loaded from DB via API
const shifts = ref<ShiftDef[]>([])

async function loadShifts() {
  const rows = await $fetch<ShiftDef[]>('/api/shifts', { credentials: 'include', query: { ts: Date.now() } })
  shifts.value = rows || []
}

export function getShiftLabel(code?: ShiftCode | null) {
  return shifts.value.find(s => s.code === code)?.label || code || '-'
}

function pickClosestShiftFromShifts(now = new Date()) {
  const nowMin = now.getHours() * 60 + now.getMinutes()
  let closest: { code: string, diff: number } | null = null
  for (const s of shifts.value ?? []) {
    const [shStr, smStr] = s.start.split(':')
    const sh = Number(shStr)
    const sm = Number(smStr)
    const startMin = sh * 60 + sm
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
  // compute client's local date in YYYY-MM-DD to ask server for the correct day
  const now = new Date()
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const tzOffset = now.getTimezoneOffset() // minutes (same as Date.getTimezoneOffset())
  const s = await $fetch<any>('/api/attendance', { method: 'GET', credentials: 'include', query: { ts: Date.now(), date: localDate, tzOffset } })
  if (!s)
    return
  if (!shifts.value.length) {
    await loadShifts()
  }
  clockedIn.value = !!s.clockedIn
  clockInTime.value = s.clockInTime
  clockOutTime.value = s.clockOutTime
  logs.value = (s.logs || []).map((l: any) => ({
    id: l.id,
    type: l.type,
    timestamp: new Date(l.timestamp).toISOString(),
    lat: l.lat ?? undefined,
    lng: l.lng ?? undefined,
    accuracy: l.accuracy ?? undefined,
    shiftCode: l.shiftCode ?? undefined,
    shiftType: l.shiftType ?? undefined,
    // preserve server-provided date if present, else compute from timestamp (local date)
    date: l.date ?? (() => {
      try {
        const dd = new Date(l.timestamp)
        return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`
      }
      catch {
        return undefined
      }
    })(),
    earlyReason: (l as any).earlyReason ?? (l as any).early_reason ?? null,
  }))
  selectedShiftCode.value = s.selectedShiftCode ?? undefined
  selectedShiftType.value = s.shiftType ?? undefined
}

const durationMs = computed(() => {
  if (!clockInTime.value)
    return 0
  const end = clockedIn.value
    ? Date.now()
    : (clockOutTime.value
        ? Date.parse(clockOutTime.value)
        : Date.now())
  return end - Date.parse(clockInTime.value)
})

const durationHuman = computed(() => {
  const ms = durationMs.value
  if (!ms)
    return '0m'
  const totalMinutes = Math.floor(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h ? `${h}h ${m}m` : `${m}m`
})

function shiftStartDate(clockInIso: string, code: ShiftCode | undefined) {
  if (!code)
    return null
  const def = shifts.value.find(s => s.code === code)
  if (!def)
    return null
  const d = new Date(clockInIso)
  const [shRaw, smRaw] = def.start.split(':')
  const [ehRaw, emRaw] = def.end.split(':')
  const sh = Number(shRaw)
  const sm = Number(smRaw)
  const eh = Number(ehRaw)
  const em = Number(emRaw)
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em))
    return null
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  // default start is same calendar day as clockIn
  let year = d.getFullYear()
  let month = d.getMonth()
  let day = d.getDate()
  // If shift crosses midnight (start > end) and clock-in time is before end time (after midnight),
  // then the shift actually started the previous calendar day
  const ciMin = d.getHours() * 60 + d.getMinutes()
  const crossesMidnight = startMin > endMin
  if (crossesMidnight && ciMin < endMin) {
    const prev = new Date(d)
    prev.setDate(prev.getDate() - 1)
    year = prev.getFullYear()
    month = prev.getMonth()
    day = prev.getDate()
  }
  return new Date(year, month, day, sh, sm, 0, 0)
}

const lateByMs = computed(() => {
  if (!clockInTime.value || !selectedShiftCode.value)
    return 0
  const start = shiftStartDate(clockInTime.value, selectedShiftCode.value)
  if (!start)
    return 0
  const ci = new Date(clockInTime.value)
  return Math.max(0, ci.getTime() - start.getTime())
})

const isLate = computed(() => lateByMs.value > 0)

const lateByHuman = computed(() => {
  const ms = lateByMs.value
  if (!ms)
    return '0m'
  const totalMinutes = Math.ceil(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h ? `${h}h ${m}m` : `${m}m`
})

async function setShift(code: ShiftCode | undefined, type?: 'harian' | 'bantuan' | undefined) {
  selectedShiftCode.value = code
  if (type) selectedShiftType.value = type
  await $fetch('/api/attendance/shift', { method: 'POST', body: { shiftCode: code, shiftType: type }, credentials: 'include' })
  await refresh()
}

// Ensure a sensible default shift is chosen based on current time
async function ensureDefaultShift() {
  if (!shifts.value.length) {
    await loadShifts()
  }
  if (!selectedShiftCode.value) {
    const def = pickClosestShiftFromShifts(new Date())
    if (def) await setShift(def, 'harian')
  }
  if (!selectedShiftType.value) {
    selectedShiftType.value = 'harian'
  }
}

interface ClockInOptions { coords?: GeolocationCoordinates, shiftCode?: ShiftCode | undefined }
async function clockIn(opts?: ClockInOptions) {
  if (clockedIn.value)
    return
  // Prevent multiple clock-ins for the same shiftType on the same local day.
  try {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const shiftTypeToCheck = selectedShiftType.value
    if (shiftTypeToCheck) {
      for (const l of logs.value) {
        if (l.type !== 'clock-in') continue
        if (l.shiftType !== shiftTypeToCheck) continue
        try {
          const dd = new Date(l.timestamp as any)
          const ldate = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`
          if (ldate === today) {
            try {
              try {
                const _t = (typeof useToast === 'function') ? useToast() : null
                if (_t) _t.add({ title: 'Already clocked in', description: `You already have a ${shiftTypeToCheck} clock-in today.`, color: 'warning' })
              }
              catch {}
            }
            catch {}
            return
          }
        }
        catch {}
      }
    }
  }
  catch {}
  if (opts?.shiftCode)
    selectedShiftCode.value = opts.shiftCode
  const now = new Date()
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const tzOffset = now.getTimezoneOffset()
  const res = await $fetch<any>('/api/attendance/clock-in', {
    method: 'POST',
    body: {
      shiftCode: selectedShiftCode.value,
      shiftType: selectedShiftType.value,
      date: localDate,
      tzOffset,
      coords: opts?.coords
        ? {
            latitude: opts.coords.latitude,
            longitude: opts.coords.longitude,
            accuracy: opts.coords.accuracy,
          }
        : undefined,
    },
    credentials: 'include',
  })
  // optimistic update based on response
  if (res) {
    clockedIn.value = true
    const nowIso = new Date().toISOString()
    clockInTime.value = nowIso
    clockOutTime.value = undefined
    selectedShiftCode.value = res.selectedShiftCode ?? selectedShiftCode.value
    selectedShiftType.value = res.shiftType ?? selectedShiftType.value
  }
  await refresh()
}

async function clockOut(coords?: GeolocationCoordinates, earlyReason?: string | null) {
  if (!clockedIn.value)
    return
  const now = new Date()
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const tzOffset = now.getTimezoneOffset()
  const res = await $fetch<any>('/api/attendance/clock-out', {
    method: 'POST',
    body: coords
      ? {
          coords: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          },
          shiftType: selectedShiftType.value,
          date: localDate,
          tzOffset,
          earlyReason: typeof earlyReason === 'string' && earlyReason.length ? earlyReason.slice(0, 200) : undefined,
        }
      : { shiftType: selectedShiftType.value, date: localDate, tzOffset },
    credentials: 'include',
  })
  if (res) {
    clockedIn.value = false
    const nowIso = new Date().toISOString()
    clockOutTime.value = nowIso
  }
  await refresh()
}

async function resetDay() {
  await $fetch('/api/attendance/reset', { method: 'POST', credentials: 'include' })
  await refresh()
}

export function useAttendance() {
  return {
    clockedIn,
    clockInTime,
    clockOutTime,
    logs,
    durationMs,
    durationHuman,
    isLate,
    lateByMs,
    lateByHuman,
    clockIn,
    clockOut,
    resetDay,
    shifts,
    selectedShiftCode,
    selectedShiftType,
    setShift,
    ensureDefaultShift,
    // returns true if the given shiftType currently has an active (unclosed) clock-in today
    isShiftActive: (shiftType?: 'harian' | 'bantuan' | undefined) => {
      if (!shiftType) return false
      // One shift per day policy: if user already has a clock-in for this shiftType today,
      // consider the shift type 'active' (i.e. not allowed to clock-in again).
      try {
        const now = new Date()
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        for (const l of logs.value) {
          if (l.type !== 'clock-in') continue
          if (l.shiftType !== shiftType) continue
          try {
            const dd = new Date(l.timestamp as any)
            const ldate = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`
            if (ldate === today) return true
          }
          catch {}
        }
      }
      catch {}
      return false
    },
    getShiftLabel,
    refresh,
  }
}
