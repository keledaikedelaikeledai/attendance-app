import { ref, computed, watch } from 'vue'

export interface AttendanceLog {
  id: string
  type: 'clock-in' | 'clock-out'
  timestamp: string // ISO
  lat?: number
  lng?: number
  accuracy?: number
  shiftCode?: ShiftCode
}

export type ShiftCode = 'pagi' | 'siang' | 'sore' | 'malam'
export interface ShiftDef { code: ShiftCode; label: string; start: string; end: string }

// Shift times are local time (24h HH:MM); malam crosses midnight
export const SHIFT_DEFS: ShiftDef[] = [
  { code: 'pagi', label: 'Pagi (07:00-15:00)', start: '07:00', end: '15:00' },
  { code: 'siang', label: 'Siang (12:00-20:00)', start: '12:00', end: '20:00' },
  { code: 'sore', label: 'Sore (15:00-23:00)', start: '15:00', end: '23:00' },
  { code: 'malam', label: 'Malam (23:00-07:00)', start: '23:00', end: '07:00' }
]

export function getShiftLabel(code?: ShiftCode | null) {
  return SHIFT_DEFS.find(s => s.code === code)?.label || code || '-'
}

const STORAGE_KEY = 'attendance-state-v1'

interface PersistedState {
  clockedIn: boolean
  clockInTime?: string
  clockOutTime?: string
  logs: AttendanceLog[]
  selectedShiftCode?: ShiftCode | null
}

function loadPersisted (): PersistedState {
  if (process.client) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as PersistedState
    } catch (e) {
      console.warn('Failed to parse attendance state', e)
    }
  }
  return { clockedIn: false, logs: [], selectedShiftCode: null }
}

const persisted = loadPersisted()

const clockedIn = ref<boolean>(persisted.clockedIn)
const clockInTime = ref<string | undefined>(persisted.clockInTime)
const clockOutTime = ref<string | undefined>(persisted.clockOutTime)
const logs = ref<AttendanceLog[]>(persisted.logs)
const selectedShiftCode = ref<ShiftCode | undefined>(persisted.selectedShiftCode || undefined)

function persist () {
  if (!process.client) return
  const state: PersistedState = {
    clockedIn: clockedIn.value,
    clockInTime: clockInTime.value,
    clockOutTime: clockOutTime.value,
    logs: logs.value,
    selectedShiftCode: selectedShiftCode.value
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('Persist failed', e)
  }
}

watch([clockedIn, clockInTime, clockOutTime, logs, selectedShiftCode], persist, { deep: true })

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

function setShift (code: ShiftCode | undefined) {
  selectedShiftCode.value = code
}

interface ClockInOptions { coords?: GeolocationCoordinates; shiftCode?: ShiftCode | undefined }
function clockIn (opts?: ClockInOptions) {
  if (clockedIn.value) return
  const now = new Date().toISOString()
  if (opts?.shiftCode) selectedShiftCode.value = opts.shiftCode
  clockedIn.value = true
  clockInTime.value = now
  clockOutTime.value = undefined
  logs.value.push({
    id: crypto.randomUUID(),
    type: 'clock-in',
    timestamp: now,
    lat: opts?.coords?.latitude,
    lng: opts?.coords?.longitude,
    accuracy: opts?.coords?.accuracy,
    shiftCode: selectedShiftCode.value || undefined
  })
}

function clockOut (coords?: GeolocationCoordinates) {
  if (!clockedIn.value) return
  const now = new Date().toISOString()
  clockedIn.value = false
  clockOutTime.value = now
  logs.value.push({
    id: crypto.randomUUID(),
    type: 'clock-out',
    timestamp: now,
    lat: coords?.latitude,
    lng: coords?.longitude,
    accuracy: coords?.accuracy,
    shiftCode: selectedShiftCode.value || undefined
  })
}

function resetDay () {
  clockedIn.value = false
  clockInTime.value = undefined
  clockOutTime.value = undefined
  logs.value = []
  selectedShiftCode.value = undefined
}

export function useAttendance () {
  return {
    clockedIn,
    clockInTime,
    clockOutTime,
    logs,
    durationMs,
    durationHuman,
    clockIn,
    clockOut,
    resetDay,
    SHIFT_DEFS,
    selectedShiftCode,
    setShift,
    getShiftLabel
  }
}
