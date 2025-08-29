import { ref, computed, watch } from 'vue'

export interface AttendanceLog {
  id: string
  type: 'clock-in' | 'clock-out'
  timestamp: string // ISO
  lat?: number
  lng?: number
  accuracy?: number
}

const STORAGE_KEY = 'attendance-state-v1'

interface PersistedState {
  clockedIn: boolean
  clockInTime?: string
  clockOutTime?: string
  logs: AttendanceLog[]
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
  return { clockedIn: false, logs: [] }
}

const persisted = loadPersisted()

const clockedIn = ref<boolean>(persisted.clockedIn)
const clockInTime = ref<string | undefined>(persisted.clockInTime)
const clockOutTime = ref<string | undefined>(persisted.clockOutTime)
const logs = ref<AttendanceLog[]>(persisted.logs)

function persist () {
  if (!process.client) return
  const state: PersistedState = {
    clockedIn: clockedIn.value,
    clockInTime: clockInTime.value,
    clockOutTime: clockOutTime.value,
    logs: logs.value
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('Persist failed', e)
  }
}

watch([clockedIn, clockInTime, clockOutTime, logs], persist, { deep: true })

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

function clockIn (coords?: GeolocationCoordinates) {
  if (clockedIn.value) return
  const now = new Date().toISOString()
  clockedIn.value = true
  clockInTime.value = now
  clockOutTime.value = undefined
  logs.value.push({
    id: crypto.randomUUID(),
    type: 'clock-in',
    timestamp: now,
    lat: coords?.latitude,
    lng: coords?.longitude,
    accuracy: coords?.accuracy
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
    accuracy: coords?.accuracy
  })
}

function resetDay () {
  clockedIn.value = false
  clockInTime.value = undefined
  clockOutTime.value = undefined
  logs.value = []
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
    resetDay
  }
}
