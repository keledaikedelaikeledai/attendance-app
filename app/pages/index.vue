<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAttendance, SHIFT_DEFS, getShiftLabel } from '@/../composables/useAttendance'

const {
  clockedIn,
  clockInTime,
  clockOutTime,
  durationHuman,
  logs,
  clockIn,
  clockOut,
  resetDay,
  selectedShiftCode,
  setShift
} = useAttendance()

const geoSupported = ref<boolean>(false)
const permissionStatus = ref<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt')
const coords = ref<{ lat?: number; lng?: number; accuracy?: number }>({})
const locating = ref(false)
const geoError = ref<string | null>(null)

function formatTime (iso?: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function minutesSinceMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

function shiftToMinutes(start: string, end: string) {
  const [shStr, smStr] = start.split(':')
  const [ehStr, emStr] = end.split(':')
  const sh = Number(shStr); const sm = Number(smStr); const eh = Number(ehStr); const em = Number(emStr)
  return { startMin: sh * 60 + sm, endMin: eh * 60 + em }
}

function pickClosestShift(now = new Date()) {
  const nowMin = minutesSinceMidnight(now)
  let closest: { code: string; diff: number } | null = null
  for (const s of SHIFT_DEFS) {
    const { startMin } = shiftToMinutes(s.start, s.end)
    let diff = Math.abs(startMin - nowMin)
    diff = Math.min(diff, 1440 - diff)
    if (!closest || diff < closest.diff) closest = { code: s.code, diff }
  }
  return (closest?.code as typeof selectedShiftCode.value) || 'pagi'
}

function ensureDefaultShift() {
  if (!selectedShiftCode.value) setShift(pickClosestShift())
}

async function requestLocationOnce () {
  geoError.value = null
  if (!('geolocation' in navigator)) {
    geoSupported.value = false
    permissionStatus.value = 'unsupported'
    return
  }
  geoSupported.value = true
  locating.value = true
  return new Promise<void>((resolve) => {
    navigator.geolocation.getCurrentPosition(pos => {
      coords.value = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
      locating.value = false
      resolve()
    }, err => {
      geoError.value = err.message
      locating.value = false
      resolve()
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 })
  })
}

async function ensurePermission () {
  if (!('permissions' in navigator)) {
    await requestLocationOnce()
    return
  }
  try {
    const status = await (navigator as any).permissions.query({ name: 'geolocation' })
    permissionStatus.value = status.state
    if (status.state === 'granted') {
      await requestLocationOnce()
    } else if (status.state === 'prompt') {
      await requestLocationOnce()
      const status2 = await (navigator as any).permissions.query({ name: 'geolocation' })
      permissionStatus.value = status2.state
    }
    status.onchange = () => {
      permissionStatus.value = status.state
    }
  } catch (e) {
    await requestLocationOnce()
  }
}

async function handleClock (action: 'in' | 'out') {
  await requestLocationOnce()
  if (action === 'in') {
    const c = coords.value.lat !== undefined ? { latitude: coords.value.lat, longitude: coords.value.lng!, accuracy: coords.value.accuracy! } as any : undefined
    clockIn({ coords: c, shiftCode: selectedShiftCode.value })
  } else {
    const c = coords.value.lat !== undefined ? { latitude: coords.value.lat, longitude: coords.value.lng!, accuracy: coords.value.accuracy! } as any : undefined
    clockOut(c)
  }
}

function onReset() {
  if (process.client && window.confirm('Reset today?')) resetDay()
  ensureDefaultShift()
}

onMounted(() => {
  ensurePermission()
  ensureDefaultShift()
})
</script>

<template>
  <UContainer class="py-8 space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">Today's Attendance</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">Manage your clock-in and clock-out with location.</p>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="soft" icon="i-heroicons-arrow-right-start-on-rectangle" to="/login">Logout</UButton>
      </div>
    </div>

    <UCard>
      <div class="grid sm:grid-cols-2 gap-6">
        <div class="space-y-5">
          <div class="flex items-center gap-2">
            <UBadge :color="clockedIn ? 'primary' : 'neutral'" variant="soft">{{ clockedIn ? 'Clocked In' : 'Not Clocked In' }}</UBadge>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="space-y-1">
              <p class="font-medium">Clock In</p>
              <p class="text-gray-600 dark:text-gray-400">{{ formatTime(clockInTime) }}</p>
            </div>
            <div class="space-y-1">
              <p class="font-medium">Clock Out</p>
              <p class="text-gray-600 dark:text-gray-400">{{ formatTime(clockOutTime) }}</p>
            </div>
            <div class="space-y-1 col-span-2">
              <p class="font-medium">Duration</p>
              <p class="text-gray-600 dark:text-gray-400">{{ durationHuman }}</p>
            </div>
          </div>

          <div class="space-y-2">
            <UFormField label="Shift" help="Select your scheduled shift.">
              <USelect :items="SHIFT_DEFS" class="w-full" v-model="selectedShiftCode" :disabled="clockedIn" placeholder="Select shift" value-key="code"/>
            </UFormField>
          </div>

          <div class="flex flex-wrap gap-3">
            <UButton v-if="!clockedIn" color="primary" icon="i-heroicons-play" :loading="locating" :disabled="!selectedShiftCode" @click="handleClock('in')">Clock In</UButton>
            <UButton v-else color="primary" variant="solid" icon="i-heroicons-stop" :loading="locating" @click="handleClock('out')">Clock Out</UButton>
            <UTooltip text="Clears today's data">
              <UButton color="neutral" variant="outline" icon="i-heroicons-arrow-path" @click="onReset">Reset</UButton>
            </UTooltip>
          </div>
        </div>
        <div class="space-y-4">
          <h2 class="font-medium flex items-center gap-2">Location <UBadge size="xs" :color="geoSupported ? 'primary' : 'neutral'">{{ permissionStatus }}</UBadge></h2>
          <div class="text-sm space-y-1">
            <p v-if="!geoSupported" class="text-red-500">Geolocation unsupported</p>
            <p v-else-if="geoError" class="text-red-500">{{ geoError }}</p>
            <template v-else>
              <p><span class="font-medium">Lat:</span> {{ coords.lat?.toFixed(6) || '-' }}</p>
              <p><span class="font-medium">Lng:</span> {{ coords.lng?.toFixed(6) || '-' }}</p>
              <p v-if="coords.accuracy"><span class="font-medium">Accuracy:</span> ±{{ Math.round(coords.accuracy) }}m</p>
            </template>
          </div>
          <div>
            <UButton size="xs" variant="soft" icon="i-heroicons-map-pin" :loading="locating" @click="requestLocationOnce">Refresh Location</UButton>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">Activity Log</span>
        </div>
      </template>
      <div class="space-y-2 text-sm">
        <p v-if="!logs.length" class="text-gray-500 dark:text-gray-400">No activity yet.</p>
        <div v-for="log in [...logs].reverse()" :key="log.id" class="flex items-center justify-between border rounded-md px-3 py-2 bg-gray-50 dark:bg-gray-800/40">
          <div class="flex items-center gap-3">
            <UIcon :name="log.type === 'clock-in' ? 'i-heroicons-play' : 'i-heroicons-stop'" class="w-5 h-5" />
            <div>
              <p class="font-medium">{{ log.type === 'clock-in' ? 'Clock In' : 'Clock Out' }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</p>
              <p v-if="log.shiftCode" class="text-[10px] uppercase tracking-wide text-primary-600 dark:text-primary-400">{{ getShiftLabel(log.shiftCode) }}</p>
            </div>
          </div>
          <div class="text-xs text-right text-gray-500 dark:text-gray-400">
            <span v-if="log.lat && log.lng">{{ log.lat.toFixed(3) }}, {{ log.lng.toFixed(3) }}</span>
            <span v-else>-</span>
          </div>
        </div>
      </div>
    </UCard>
  </UContainer>
</template>
