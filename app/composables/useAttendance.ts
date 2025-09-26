export interface AttendanceLog {
  id: string
  type: 'clock-in' | 'clock-out'
  timestamp: string // ISO
  lat?: number
  lng?: number
  accuracy?: number
  shiftCode?: ShiftCode
}

export type ShiftCode = string
export interface ShiftDef { code: ShiftCode, label: string, start: string, end: string }

// Shifts are loaded from DB via API
const shifts = ref<ShiftDef[]>([])

async function loadShifts() {
  const rows = await $fetch<ShiftDef[]>('/api/shifts', { credentials: 'include', query: { ts: Date.now() } })
  shifts.value = rows || []
}

export function getShiftLabel(code?: ShiftCode | null) {
  return shifts.value.find(s => s.code === code)?.label || code || '-'
}

const clockedIn = ref<boolean>(false)
const clockInTime = ref<string | undefined>()
const clockOutTime = ref<string | undefined>()
const logs = ref<AttendanceLog[]>([])
const selectedShiftCode = ref<ShiftCode | undefined>()
const selectedShiftType = ref<'harian' | 'bantuan' | undefined>()

async function refresh() {
  const s = await $fetch<any>('/api/attendance', { method: 'GET', credentials: 'include', query: { ts: Date.now() } })
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

async function setShift(code: ShiftCode | undefined) {
  selectedShiftCode.value = code
  await $fetch('/api/attendance/shift', { method: 'POST', body: { shiftCode: code }, credentials: 'include' })
  await refresh()
}

interface ClockInOptions { coords?: GeolocationCoordinates, shiftCode?: ShiftCode | undefined }
async function clockIn(opts?: ClockInOptions) {
  if (clockedIn.value)
    return
  if (opts?.shiftCode)
    selectedShiftCode.value = opts.shiftCode
  const res = await $fetch<any>('/api/attendance/clock-in', {
    method: 'POST',
    body: {
      shiftCode: selectedShiftCode.value,
      shiftType: selectedShiftType.value,
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

async function clockOut(coords?: GeolocationCoordinates) {
  if (!clockedIn.value)
    return
  const res = await $fetch<any>('/api/attendance/clock-out', {
    method: 'POST',
    body: coords
      ? {
          coords: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          },
        }
      : undefined,
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
    getShiftLabel,
    refresh,
  }
}
