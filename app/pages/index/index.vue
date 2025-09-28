<script setup lang="ts">
import type { ShiftDef } from '@/composables/useAttendance'
import { onMounted, ref } from 'vue'
import { getShiftLabel, useAttendance } from '@/composables/useAttendance'

const toast = useToast()

const {
  clockedIn,
  clockInTime,
  clockOutTime,
  durationHuman,
  isLate,
  lateByHuman,
  clockIn,
  clockOut,
  selectedShiftCode,
  refresh,
  shifts,
  selectedShiftType,
  isShiftActive,
  ensureDefaultShift,
} = useAttendance()

const shiftItems = computed(() => {
  const list: any[] = (shifts as any)?.value ?? (shifts as any) ?? []
  return list.map(s => ({
    label: getShiftLabel(s.code) || s?.name || s?.label || s.code,
    value: s.code,
  }))
})

const geoSupported = ref<boolean>(false)
const permissionStatus = ref<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt')
const coords = ref<{ lat?: number, lng?: number, accuracy?: number }>({})
const locating = ref(false)
const geoError = ref<string | null>(null)
const showConfirmOut = ref(false)
const confirmOutMessage = ref('Are you sure you want to clock out?')
const earlyReason = ref<string>('')
const isEarlyOut = ref(false)

function formatTime(iso?: string) {
  if (!iso)
    return '-'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getShiftByCode(code?: string | null) {
  const list: ShiftDef[] = (shifts as any)?.value ?? (shifts as any) ?? []
  return list.find((s: ShiftDef) => s.code === code)
}

function getShiftStartEnd(clockInIso?: string, code?: string | null) {
  if (!clockInIso || !code)
    return null
  const def = getShiftByCode(code)
  if (!def)
    return null
  const d = new Date(clockInIso)
  const [shStr, smStr] = def.start.split(':')
  const [ehStr, emStr] = def.end.split(':')
  const sh = Number(shStr)
  const sm = Number(smStr)
  const eh = Number(ehStr)
  const em = Number(emStr)
  if ([sh, sm, eh, em].some(n => Number.isNaN(n)))
    return null
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  const ciMin = d.getHours() * 60 + d.getMinutes()
  const crosses = startMin > endMin
  // derive start day
  const startDate = new Date(d)
  if (crosses && ciMin < endMin)
    startDate.setDate(startDate.getDate() - 1)
  startDate.setHours(sh, sm, 0, 0)
  // derive end day
  const endDate = new Date(startDate)
  if (crosses)
    endDate.setDate(endDate.getDate() + 1)
  endDate.setHours(eh, em, 0, 0)
  return { start: startDate, end: endDate }
}

function formatHumanMinutes(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

// Use ensureDefaultShift from composable (keeps logic centralized)

async function requestLocationOnce() {
  geoError.value = null
  if (!('geolocation' in navigator)) {
    geoSupported.value = false
    permissionStatus.value = 'unsupported'
    return
  }
  geoSupported.value = true
  locating.value = true
  return new Promise<void>((resolve) => {
    navigator.geolocation.getCurrentPosition((pos) => {
      coords.value = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
      locating.value = false
      resolve()
    }, (err) => {
      geoError.value = err.message
      locating.value = false
      resolve()
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 })
  })
}

async function ensurePermission() {
  if (!('permissions' in navigator)) {
    await requestLocationOnce()
    return
  }
  try {
    const status = await (navigator as any).permissions.query({ name: 'geolocation' })
    permissionStatus.value = status.state
    if (status.state === 'granted') {
      await requestLocationOnce()
    }
    else if (status.state === 'prompt') {
      await requestLocationOnce()
      const status2 = await (navigator as any).permissions.query({ name: 'geolocation' })
      permissionStatus.value = status2.state
    }
    status.onchange = () => {
      permissionStatus.value = status.state
    }
  }
  catch {
    await requestLocationOnce()
  }
}

async function handleClock(action: 'in' | 'out') {
  await requestLocationOnce()
  if (permissionStatus.value !== 'granted') {
    toast.add({ title: 'Location required', description: 'Please allow location permission to clock in/out', color: 'error' })
    return
  }
  if (action === 'in') {
    const c = coords.value.lat !== undefined ? { latitude: coords.value.lat, longitude: coords.value.lng!, accuracy: coords.value.accuracy! } as any : undefined
    clockIn({ coords: c, shiftCode: selectedShiftCode.value })
  }
  else {
    // Always confirm, with special message if before scheduled end
    const se = getShiftStartEnd(clockInTime.value, selectedShiftCode.value)
    const now = new Date()
    if (se && now < se.end) {
      const remaining = Math.max(0, Math.ceil((se.end.getTime() - now.getTime()) / 60000))
      const endStr = se.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      confirmOutMessage.value = `You're clocking out before your shift ends at ${endStr} (${formatHumanMinutes(remaining)} remaining). Continue?`
      isEarlyOut.value = true
    }
    else {
      confirmOutMessage.value = 'Confirm clock out?'
      isEarlyOut.value = false
    }
    showConfirmOut.value = true
  }
}

async function onConfirmClockOut() {
  showConfirmOut.value = false
  await requestLocationOnce()
  if (permissionStatus.value !== 'granted') {
    toast.add({ title: 'Location required', description: 'Please allow location permission to clock in/out', color: 'error' })
    return
  }
  const c = coords.value.lat !== undefined ? { latitude: coords.value.lat, longitude: coords.value.lng!, accuracy: coords.value.accuracy! } as any : undefined
  await clockOut(c, earlyReason.value && earlyReason.value.length ? earlyReason.value.slice(0, 200) : undefined)
  earlyReason.value = ''
}

function onCancelClockOut() {
  showConfirmOut.value = false
  // reset the early reason when the user cancels to avoid leftover text
  earlyReason.value = ''
  isEarlyOut.value = false
}

onMounted(async () => {
  await refresh()
  ensurePermission()
  await ensureDefaultShift()
  // Minimal fallback: if ensureDefaultShift didn't set a code, pick the first available shift so the select has a value
  if (!selectedShiftCode.value && (shifts as any)?.value && (shifts as any).value.length) {
    selectedShiftCode.value = (shifts as any).value[0].code
  }
})

function _onLogout() {
  authClient.signOut({
    fetchOptions: {
      onSuccess() {
        navigateTo('/login', { external: true })
      },
    },
  })
}
</script>

<template>
  <div>
    <UCard>
      <div class="grid sm:grid-cols-2 gap-6">
        <div class="space-y-5">
          <div class="flex items-center gap-2">
            <UBadge :color="clockedIn ? 'primary' : 'neutral'" variant="soft">
              {{ clockedIn ? 'Clocked In' : 'Not Clocked In' }}
            </UBadge>
            <UBadge v-if="clockedIn && isLate" color="error" variant="soft">
              Late · {{ lateByHuman }}
            </UBadge>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="space-y-1">
              <p class="font-medium">
                Clock In
              </p>
              <p class="text-gray-600 dark:text-gray-400">
                {{ formatTime(clockInTime) }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="font-medium">
                Clock Out
              </p>
              <p class="text-gray-600 dark:text-gray-400">
                {{ formatTime(clockOutTime) }}
              </p>
            </div>
            <div class="space-y-1 col-span-2">
              <p class="font-medium">
                Duration
              </p>
              <p class="text-gray-600 dark:text-gray-400">
                {{ durationHuman }}
              </p>
            </div>
          </div>

          <div class="space-y-2">
            <UFormField label="Shift" help="Select your scheduled shift.">
              <USelect
                v-model="selectedShiftCode"
                :items="shiftItems"
                class="w-full"
                :disabled="clockedIn"
                placeholder="Select shift"
                option-attribute="label"
                value-attribute="code"
              />
            </UFormField>
            <UFormField label="Tipe Shift" help="Pilih tipe kehadiran Anda.">
              <USelect
                v-model="selectedShiftType"
                :items="[{ label: 'Shift Harian', value: 'harian' }, { label: 'Shift Bantuan', value: 'bantuan' }]"
                class="w-full"
                :disabled="clockedIn"
                placeholder="Pilih tipe shift"
                option-attribute="label"
                value-attribute="value"
              />
            </UFormField>
          </div>

          <div class="flex flex-wrap gap-3">
            <UButton
              v-if="!clockedIn"
              color="primary"
              icon="i-heroicons-play"
              :loading="locating"
              :disabled="!selectedShiftCode || !selectedShiftType || isShiftActive(selectedShiftType)"
              size="lg"
              @click="() => handleClock('in')"
            >
              Clock In
            </UButton>
            <UButton
              v-else
              color="primary"
              variant="solid"
              icon="i-heroicons-stop"
              :loading="locating"
              size="lg"
              @click="handleClock('out')"
            >
              Clock Out
            </UButton>
          </div>
        </div>
        <div class="space-y-4">
          <h2 class="font-medium flex items-center gap-2">
            Location <UBadge size="xs" :color="geoSupported ? 'primary' : 'neutral'">
              {{ permissionStatus }}
            </UBadge>
          </h2>
          <div class="text-sm space-y-1">
            <p v-if="!geoSupported" class="text-red-500">
              Geolocation unsupported
            </p>
            <p v-else-if="geoError" class="text-red-500">
              {{ geoError }}
            </p>
            <template v-else>
              <p><span class="font-medium">Lat:</span> {{ coords.lat?.toFixed(6) || '-' }}</p>
              <p><span class="font-medium">Lng:</span> {{ coords.lng?.toFixed(6) || '-' }}</p>
              <p v-if="coords.accuracy">
                <span class="font-medium">Accuracy:</span> ±{{ Math.round(coords.accuracy) }}m
              </p>
            </template>
          </div>
          <div>
            <UButton
              size="xs"
              variant="soft"
              icon="i-heroicons-map-pin"
              :loading="locating"
              @click="requestLocationOnce"
            >
              Refresh Location
            </UButton>
          </div>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="showConfirmOut" title="Confirm Clock Out">
      <template #body>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {{ confirmOutMessage }}
        </p>

        <div v-if="isEarlyOut" class="mt-3">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Reason for early clock out (optional)</label>
          <textarea
            v-model="earlyReason"
            maxlength="200"
            rows="3"
            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm p-2"
            placeholder="Optional: why you're leaving early (max 200 chars)"
          />
          <p class="text-xs text-gray-500 mt-1">
            {{ earlyReason.length }}/200
          </p>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <UButton color="neutral" variant="soft" @click="onCancelClockOut">
            Cancel
          </UButton>
          <UButton color="primary" icon="i-heroicons-check" @click="onConfirmClockOut">
            Yes, Clock Out
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
