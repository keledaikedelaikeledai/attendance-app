<script setup lang="ts">
import type { ShiftDef } from '~/types/shifts'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getShiftLabel, useAttendance } from '~/composables/useAttendance'

const toast = useToast()
const { t } = useI18n()

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
const geofences = ref<any[]>([])
const geofenceLoading = ref(true)
const geofenceError = ref<string | null>(null)
const geofenceBlocked = ref(false)
const geofenceBlockedMessage = ref('')
const geofenceComment = ref('')
const geofencePendingAction = ref<'in' | 'out' | null>(null)
const geofenceCommentModalOpen = ref(false)
const geofenceUsed = ref<{ id?: string | null, name?: string | null } | null>(null)
const geofencePendingFence = ref<any | null>(null)
const showConfirmOut = ref(false)
const confirmOutMessage = ref(t('index.modal.confirm'))
const earlyReason = ref<string>('')
const isEarlyOut = ref(false)
const mapTileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const mapAttribution = '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
const hasLocation = computed(() => typeof coords.value.lat === 'number' && typeof coords.value.lng === 'number')
const mapCenter = computed<[number, number]>(() => [
  coords.value.lat ?? 0,
  coords.value.lng ?? 0,
])
const mapZoom = computed(() => (hasLocation.value ? 17 : 14))

function distanceMeters(a: [number, number], b: [number, number]) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function distanceToSegmentMeters(point: [number, number], a: [number, number], b: [number, number]) {
  const R = 6371000
  const lat0 = (point[0] * Math.PI) / 180
  const toXY = ([lat, lng]: [number, number]) => {
    const x = ((lng - point[1]) * Math.PI / 180) * Math.cos(lat0) * R
    const y = ((lat - point[0]) * Math.PI / 180) * R
    return { x, y }
  }
  const p = { x: 0, y: 0 }
  const aXY = toXY(a)
  const bXY = toXY(b)
  const dx = bXY.x - aXY.x
  const dy = bXY.y - aXY.y
  const len2 = dx * dx + dy * dy
  if (!len2) {
    return Math.sqrt((p.x - aXY.x) ** 2 + (p.y - aXY.y) ** 2)
  }
  let t = ((p.x - aXY.x) * dx + (p.y - aXY.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const projX = aXY.x + t * dx
  const projY = aXY.y + t * dy
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2)
}

function distanceToPolygonMeters(point: [number, number], poly: Array<[number, number]>) {
  if (!poly.length)
    return Infinity
  if (pointInPolygon(point, poly))
    return 0
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b)
      continue
    const dist = distanceToSegmentMeters(point, a, b)
    if (dist < min)
      min = dist
  }
  return min
}

function pointInPolygon(point: [number, number], poly: Array<[number, number]>) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const curr = poly[i]
    const prev = poly[j]
    if (!curr || !prev)
      continue
    const xi = curr[1]
    const yi = curr[0]
    const xj = prev[1]
    const yj = prev[0]
    const intersect = ((yi > point[0]) !== (yj > point[0])) && (point[1] < ((xj - xi) * (point[0] - yi)) / (yj - yi) + xi)
    if (intersect)
      inside = !inside
  }
  return inside
}

function formatDistance(meters?: number | null) {
  if (meters == null)
    return ''
  if (meters < 1000)
    return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

function getClosestActiveGeofence(lat?: number, lng?: number) {
  if (typeof lat !== 'number' || typeof lng !== 'number')
    return null
  const active = geofences.value.filter(g => g?.isActive)
  if (!active.length)
    return null
  let best: { fence: any, dist: number, inside: boolean } | null = null
  for (const fence of active) {
    let dist = Infinity
    let inside = false
    if (fence.type === 'point' && typeof fence.centerLat === 'number' && typeof fence.centerLng === 'number') {
      dist = distanceMeters([lat, lng], [fence.centerLat, fence.centerLng])
      inside = typeof fence.radiusMeters === 'number' ? dist <= fence.radiusMeters : false
    }
    else if (fence.type === 'polygon' && Array.isArray(fence.polygon) && fence.polygon.length >= 3) {
      inside = pointInPolygon([lat, lng], fence.polygon)
      dist = distanceToPolygonMeters([lat, lng], fence.polygon)
    }
    if (!best || dist < best.dist)
      best = { fence, dist, inside }
  }
  return best
}

function evaluateGeofence(lat?: number, lng?: number) {
  if (!geofences.value.length)
    return { allowed: true, requireComment: false, fence: null }
  const closest = getClosestActiveGeofence(lat, lng)
  if (!closest)
    return { allowed: true, requireComment: false, fence: null }
  const { fence, dist, inside } = closest
  const mode = fence?.interactionMode || 'disallow'
  if (mode === 'allow')
    return { allowed: true, requireComment: false, fence }
  if (inside)
    return { allowed: true, requireComment: false, fence }
  if (mode === 'allow_with_comment') {
    return { allowed: true, requireComment: true, message: 'You are outside the allowed area. Please add a comment to continue.', fence }
  }
  if (fence.type === 'point' && typeof fence.radiusMeters === 'number') {
    return {
      allowed: false,
      requireComment: false,
      message: `You are outside the allowed radius (${formatDistance(dist)} away, limit ${formatDistance(fence.radiusMeters)}). Move closer to the allowed location.`,
      fence,
    }
  }
  return { allowed: false, requireComment: false, message: 'You are outside the allowed area. Move inside the polygon to clock in/out.', fence }
}

function guardGeofenceOrNotify(lat?: number, lng?: number) {
  const { allowed, requireComment, message, fence } = evaluateGeofence(lat, lng)
  geofenceUsed.value = fence ? { id: fence.id ?? null, name: fence.name ?? null } : null
  if (!allowed) {
    geofenceBlockedMessage.value = message || 'You are outside the allowed area.'
    geofenceBlocked.value = true
    return { proceed: false, requireComment: false }
  }
  if (requireComment) {
    geofenceBlockedMessage.value = message || ''
    geofencePendingFence.value = fence
    return { proceed: false, requireComment: true }
  }
  geofencePendingFence.value = null
  return { proceed: true, requireComment: false }
}

async function loadGeofence() {
  try {
    geofenceLoading.value = true
    geofenceError.value = null
    const res: any = await $fetch('/api/attendance/geofence', { credentials: 'include' })
    geofences.value = Array.isArray(res?.geofences) ? res.geofences : []
  }
  catch (err: any) {
    geofenceError.value = err?.message || 'Failed to load geofence config'
  }
  finally {
    geofenceLoading.value = false
  }
}

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
    toast.add({ title: t('index.toast.locationRequired.title'), description: t('index.toast.locationRequired.description'), color: 'error' })
    return
  }
  if (geofenceLoading.value)
    await loadGeofence()
  const guard = guardGeofenceOrNotify(coords.value.lat, coords.value.lng)
  if (!guard.proceed) {
    if (guard.requireComment) {
      geofencePendingAction.value = action
      geofenceComment.value = ''
      geofenceCommentModalOpen.value = true
    }
    return
  }
  if (action === 'in') {
    const c = coords.value.lat !== undefined ? { latitude: coords.value.lat, longitude: coords.value.lng!, accuracy: coords.value.accuracy! } as any : undefined
    clockIn({
      coords: c,
      shiftCode: selectedShiftCode.value,
      geofenceComment: geofenceComment.value || undefined,
      geofenceId: geofenceUsed.value?.id || undefined,
      geofenceName: geofenceUsed.value?.name || undefined,
    })
  }
  else {
    startClockOutFlow()
  }
}

function startClockOutFlow() {
  // Always confirm, with special message if before scheduled end
  const se = getShiftStartEnd(clockInTime.value, selectedShiftCode.value)
  const now = new Date()
  if (se && now < se.end) {
    const remaining = Math.max(0, Math.ceil((se.end.getTime() - now.getTime()) / 60000))
    const endStr = se.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    confirmOutMessage.value = t('index.modal.confirmEarly', { end: endStr, remaining: formatHumanMinutes(remaining) })
    isEarlyOut.value = true
  }
  else {
    confirmOutMessage.value = t('index.modal.confirm')
    isEarlyOut.value = false
  }
  showConfirmOut.value = true
}

function submitGeofenceComment() {
  if (!geofenceComment.value.trim()) {
    toast.add({ title: 'Comment required', description: 'Please enter a comment to continue.', color: 'warning' })
    return
  }
  const action = geofencePendingAction.value
  geofencePendingAction.value = null
  geofenceCommentModalOpen.value = false
  if (action === 'in') {
    const c = coords.value.lat !== undefined ? { latitude: coords.value.lat, longitude: coords.value.lng!, accuracy: coords.value.accuracy! } as any : undefined
    clockIn({
      coords: c,
      shiftCode: selectedShiftCode.value,
      geofenceComment: geofenceComment.value,
      geofenceId: geofencePendingFence.value?.id || undefined,
      geofenceName: geofencePendingFence.value?.name || undefined,
    })
  }
  else if (action === 'out') {
    geofenceUsed.value = geofencePendingFence.value
      ? { id: geofencePendingFence.value.id ?? null, name: geofencePendingFence.value.name ?? null }
      : null
    startClockOutFlow()
  }
  geofencePendingFence.value = null
}

function cancelGeofenceComment() {
  geofenceCommentModalOpen.value = false
  geofencePendingAction.value = null
  geofenceComment.value = ''
  geofencePendingFence.value = null
  geofenceUsed.value = null
}

async function onConfirmClockOut() {
  showConfirmOut.value = false
  await requestLocationOnce()
  if (permissionStatus.value !== 'granted') {
    toast.add({ title: t('index.toast.locationRequired.title'), description: t('index.toast.locationRequired.description'), color: 'error' })
    return
  }
  if (geofenceLoading.value)
    await loadGeofence()
  const guard = guardGeofenceOrNotify(coords.value.lat, coords.value.lng)
  if (!guard.proceed) {
    if (guard.requireComment) {
      geofencePendingAction.value = 'out'
      geofenceComment.value = ''
      geofenceCommentModalOpen.value = true
    }
    return
  }
  const c = coords.value.lat !== undefined ? { latitude: coords.value.lat, longitude: coords.value.lng!, accuracy: coords.value.accuracy! } as any : undefined
  await clockOut(
    c,
    earlyReason.value && earlyReason.value.length ? earlyReason.value.slice(0, 200) : undefined,
    geofenceComment.value,
    geofenceUsed.value?.id || undefined,
    geofenceUsed.value?.name || undefined,
  )
  earlyReason.value = ''
  geofenceComment.value = ''
}

function onCancelClockOut() {
  showConfirmOut.value = false
  // reset the early reason when the user cancels to avoid leftover text
  earlyReason.value = ''
  isEarlyOut.value = false
  geofenceComment.value = ''
  geofenceUsed.value = null
}

onMounted(async () => {
  await refresh()
  ensurePermission()
  await ensureDefaultShift()
  // Minimal fallback: if ensureDefaultShift didn't set a code, pick the first available shift so the select has a value
  if (!selectedShiftCode.value && (shifts as any)?.value && (shifts as any).value.length) {
    selectedShiftCode.value = (shifts as any).value[0].code
  }
  loadGeofence()
})
</script>

<template>
  <div>
    <UCard>
      <div class="grid sm:grid-cols-2 gap-6">
        <div class="space-y-5">
          <div class="flex items-center gap-2">
            <UBadge :color="clockedIn ? 'primary' : 'neutral'" variant="soft">
              {{ clockedIn ? t('index.clockedIn') : t('index.notClockedIn') }}
            </UBadge>
            <UBadge v-if="clockedIn && isLate" color="error" variant="soft">
              {{ t('index.lateBadge', { late: lateByHuman }) }}
            </UBadge>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="space-y-1">
              <p class="font-medium">
                {{ t('index.labels.clockIn') }}
              </p>
              <p class="text-gray-600 dark:text-gray-400">
                {{ formatTime(clockInTime) }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="font-medium">
                {{ t('index.labels.clockOut') }}
              </p>
              <p class="text-gray-600 dark:text-gray-400">
                {{ formatTime(clockOutTime) }}
              </p>
            </div>
            <div class="space-y-1 col-span-2">
              <p class="font-medium">
                {{ t('index.labels.duration') }}
              </p>
              <p class="text-gray-600 dark:text-gray-400">
                {{ durationHuman }}
              </p>
            </div>
          </div>

          <div class="space-y-2">
            <UFormField :label="t('index.shift.label')" :help="t('index.shift.help')">
              <USelect
                v-model="selectedShiftCode"
                :items="shiftItems"
                class="w-full"
                :disabled="clockedIn"
                :placeholder="t('index.shift.placeholder')"
                option-attribute="label"
                value-attribute="code"
              />
            </UFormField>
            <UFormField :label="t('index.shiftType.label')" :help="t('index.shiftType.help')">
              <USelect
                v-model="selectedShiftType"
                :items="[{ label: t('index.shiftType.items.harian'), value: 'harian' }, { label: t('index.shiftType.items.bantuan'), value: 'bantuan' }]"
                class="w-full"
                :disabled="clockedIn"
                :placeholder="t('index.shiftType.placeholder')"
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
              {{ t('index.buttons.clockIn') }}
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
              {{ t('index.buttons.clockOut') }}
            </UButton>
          </div>
        </div>
        <div class="space-y-4">
          <h2 class="font-medium flex items-center gap-2">
            {{ t('index.location.title') }} <UBadge size="xs" :color="geoSupported ? 'primary' : 'neutral'">
              {{ permissionStatus }}
            </UBadge>
          </h2>
          <div class="text-sm space-y-1">
            <p v-if="!geoSupported" class="text-red-500">
              {{ t('index.location.unsupported') }}
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
            <p v-if="geofenceError" class="text-xs text-red-500">
              {{ geofenceError }}
            </p>
          </div>
          <div>
            <UButton
              size="xs"
              variant="soft"
              icon="i-heroicons-map-pin"
              :loading="locating"
              @click="requestLocationOnce"
            >
              {{ t('index.buttons.refreshLocation') }}
            </UButton>
          </div>
          <ClientOnly>
            <div class="mt-4">
              <div v-if="geoSupported">
                <div v-if="hasLocation" class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                  <LMap
                    style="height: 220px"
                    :zoom="mapZoom"
                    :center="mapCenter"
                    :use-global-leaflet="false"
                  >
                    <LTileLayer
                      :url="mapTileUrl"
                      :attribution="mapAttribution"
                    />
                    <LMarker :lat-lng="mapCenter" />
                  </LMap>
                </div>
                <div v-else class="text-xs text-gray-500 dark:text-gray-400">
                  {{ t('index.location.mapAllow') }}
                </div>
              </div>
              <div v-else class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('index.location.mapUnavailable') }}
              </div>
            </div>
          </ClientOnly>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="showConfirmOut" :title="t('index.modal.title')">
      <template #body>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {{ confirmOutMessage }}
        </p>

        <div v-if="isEarlyOut" class="mt-3">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">{{ t('index.modal.reasonLabel') }}</label>
          <textarea
            v-model="earlyReason"
            maxlength="200"
            rows="3"
            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm p-2"
            :placeholder="t('index.modal.reasonPlaceholder')"
          />
          <p class="text-xs text-gray-500 mt-1">
            {{ earlyReason.length }}/200
          </p>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <UButton color="neutral" variant="soft" @click="onCancelClockOut">
            {{ t('index.modal.cancel') }}
          </UButton>
          <UButton color="primary" icon="i-heroicons-check" @click="onConfirmClockOut">
            {{ t('index.modal.confirmButton') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="geofenceBlocked" title="Outside allowed area">
      <template #body>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {{ geofenceBlockedMessage || 'You are outside the allowed area. Move closer and try again.' }}
        </p>
        <div class="flex justify-end gap-2 mt-4">
          <UButton color="primary" variant="solid" @click="geofenceBlocked = false">
            OK
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="geofenceCommentModalOpen" title="Comment required">
      <template #body>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {{ geofenceBlockedMessage || 'You are outside the allowed area. Please add a comment to continue.' }}
        </p>
        <div class="mt-3">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Comment</label>
          <textarea
            v-model="geofenceComment"
            maxlength="200"
            rows="3"
            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm p-2"
            placeholder="Add a brief reason..."
          />
          <p class="text-xs text-gray-500 mt-1">
            {{ geofenceComment.length }}/200
          </p>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <UButton color="neutral" variant="soft" @click="cancelGeofenceComment">
            Cancel
          </UButton>
          <UButton color="primary" icon="i-heroicons-check" @click="submitGeofenceComment">
            Continue
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
