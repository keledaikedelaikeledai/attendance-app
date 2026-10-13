<script setup lang="ts">
import type { ShiftDef } from '~/types/shifts'
// Served from public/maplibre/ (kept version-locked with the installed
// maplibre-gl by scripts/sync-maplibre-worker.cjs). The dist worker imports
// './maplibre-gl-shared.mjs', which Vite does NOT emit for ?url imports -
// pointing at /_nuxt killed every map with "Worker failed to load" in prod.
const mapWorkerUrl = '/maplibre/maplibre-gl-worker.mjs'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { evaluateGeofence as evaluateGeofenceAt, formatDistance } from '~~/shared/utils/geofence-geo'
import { getShiftLabel, useAttendance } from '~/composables/useAttendance'
import { useGeolocation } from '~/composables/useGeolocation'
import 'maplibre-gl/dist/maplibre-gl.css'

const toast = useToast()
const { t } = useI18n()
const colorMode = useColorMode()

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
  submitting,
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

// Position and permission live in useGeolocation, shared app-wide. They used
// to be page-local, so every return to this page reset them, re-ran the GPS
// fix and tore the map down and up again. Now the second visit renders the
// cached position instantly. Clock actions still take a fresh fix each time.
const {
  geoSupported,
  permissionStatus,
  coords,
  locating,
  geoError,
  address,
  requestLocationOnce,
  ensurePermission,
} = useGeolocation()
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
const hasLocation = computed(() => typeof coords.value.lat === 'number' && typeof coords.value.lng === 'number')

// Geometry + decision logic live in shared/utils/geofence-geo so the
// server can enforce the exact same rules this guard only previews.
function evaluateGeofenceLatLon(lat?: number, lng?: number) {
  const ev = evaluateGeofenceAt(lat, lng, geofences.value)
  if (!ev.allowed) {
    const message = ev.fence?.type === 'point' && typeof ev.fence?.radiusMeters === 'number'
      ? `You are outside the allowed radius (${formatDistance(ev.dist)} away, limit ${formatDistance(ev.fence.radiusMeters)}). Move closer to the allowed location.`
      : 'You are outside the allowed area. Move inside the polygon to clock in/out.'
    return { allowed: false, requireComment: false, message, fence: ev.fence }
  }
  if (ev.requireComment)
    return { allowed: true, requireComment: true, message: 'You are outside the allowed area. Please add a comment to continue.', fence: ev.fence }
  return { allowed: true, requireComment: false, message: '', fence: ev.fence }
}

function guardGeofenceOrNotify(lat?: number, lng?: number) {
  const { allowed, requireComment, message, fence } = evaluateGeofenceLatLon(lat, lng)
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
    useErrorReporter().captureException(err, { context: 'geofence-load' })
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

// MapLibre renders vector tiles from OpenFreeMap: positron in light mode,
// fiord in dark mode. Both are free with no key and no quota. The engine is
// imported dynamically because it touches window at load, which SSR cannot do.
// The map element lives inside <ClientOnly> in the template, so this only ever
// runs in the browser.
const mapContainer = ref<HTMLElement | null>(null)
let map: import('maplibre-gl').Map | null = null
let marker: import('maplibre-gl').Marker | null = null

const mapStyle = computed(() => colorMode.value === 'dark'
  ? 'https://tiles.openfreemap.org/styles/fiord'
  : 'https://tiles.openfreemap.org/styles/positron')

let initializing = false
async function initMap() {
  // Guard the async gap: two triggers can overlap on the import above, and
  // without this both would build a Map on the same container.
  if (map || initializing || !mapContainer.value)
    return
  initializing = true
  // The map is display-only: it must never break page setup. Any failure here
  // (no WebGL on an old device, a blocked style fetch, a worker that will not
  // load) is contained, and clocking keeps working because the position flow
  // never touches map state.
  try {
    const { Map: MLMap, Marker: MLMarker, setWorkerUrl } = await import('maplibre-gl')
    // Vite does not serve the worker at the path MapLibre guesses, so point it
    // at the bundled file explicitly. Without this every tile fails with
    // "Worker failed to load".
    setWorkerUrl(mapWorkerUrl)
    // transformStyle is a setStyle-only option (the constructor accepts none),
    // so the map starts style-less and the fetched style JSON is sanitized
    // before it is committed - the basemap's null-fragile feature comparisons
    // can then no longer warn per parsed tile.
    map = new MLMap({
      container: mapContainer.value,
      center: [coords.value.lng ?? 106.8, coords.value.lat ?? -6.49],
      zoom: hasLocation.value ? 17 : 14,
      attributionControl: { compact: true },
    })
    map.setStyle(mapStyle.value, { transformStyle: sanitizedMapStyleTransform })
    marker = new MLMarker()
    if (hasLocation.value)
      marker.setLngLat([coords.value.lng!, coords.value.lat!]).addTo(map)
  }
  catch (err) {
    useErrorReporter().captureException(err, { context: 'map-init' })
    map = null
    marker = null
  }
  finally {
    initializing = false
  }
}

// Init when the container element itself appears, not when the position
// arrives. The container lives behind v-if="hasLocation" inside ClientOnly,
// so on a revisit with cached coords it mounts after page setup while
// hasLocation never flips - watching the value missed it entirely and the map
// stayed blank. Watching the element catches every mount.
watch([mapContainer, hasLocation], ([el, located]) => {
  if (el && located)
    initMap()
})
watch(coords, (c) => {
  if (!map || !marker || typeof c.lat !== 'number' || typeof c.lng !== 'number')
    return
  marker.setLngLat([c.lng, c.lat]).addTo(map)
  map.flyTo({ center: [c.lng, c.lat], zoom: 17 })
})

// A theme change re-styles in place. Markers are DOM overlays, not style
// layers, so they survive setStyle untouched. The transform keeps the
// null-comparison sanitizing applied across basemap swaps too.
watch(mapStyle, (style) => {
  map?.setStyle(style, { transformStyle: sanitizedMapStyleTransform })
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  marker?.remove()
  marker = null
  map?.remove()
  map = null
})

async function handleClock(action: 'in' | 'out') {
  await requestLocationOnce()
  if (permissionStatus.value !== 'granted') {
    toast.add({ title: t('index.toast.locationRequired.title'), description: t('index.toast.locationRequired.description'), color: 'danger' })
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
    toast.add({ title: t('index.toast.locationRequired.title'), description: t('index.toast.locationRequired.description'), color: 'danger' })
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

function onVisibilityChange() {
  if (document.visibilityState === 'visible')
    refresh().catch(() => {})
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
  // Wake resync: a backgrounded tab freezes its status and duration, and a
  // stale session state makes every button retry a request the server will
  // 409. Resync when the tab becomes visible again.
  document.addEventListener('visibilitychange', onVisibilityChange)
  await refresh()
  // Only ask for a fix when there is no cached one. A revisit renders the
  // cached position instantly instead of resetting and re-requesting.
  if (!hasLocation.value)
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
  <div class="mx-auto w-full max-w-xl space-y-4">
    <!-- Status. The page's hero, so it leads with the status and the figures. -->
    <SCard>
      <template #header>
        <div class="flex items-center gap-2">
          <SIcon name="i-heroicons-clock" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
          <SBadge :color="clockedIn ? 'primary' : 'neutral'" variant="soft">
            {{ clockedIn ? t('index.clockedIn') : t('index.notClockedIn') }}
          </SBadge>
          <SBadge v-if="clockedIn && isLate" color="danger" variant="soft">
            {{ t('index.lateBadge', { late: lateByHuman }) }}
          </SBadge>
        </div>
      </template>

      <dl class="grid grid-cols-3 divide-x divide-[var(--selaras-resolved-border-muted)]">
        <div class="pr-3">
          <dt class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
            <SIcon name="i-heroicons-arrow-right-on-rectangle" class="size-3.5 shrink-0" />
            {{ t('index.labels.clockIn') }}
          </dt>
          <dd class="mt-1.5 font-mono text-lg tabular-nums whitespace-nowrap text-[var(--selaras-resolved-text-default)] sm:text-xl">
            {{ formatTime(clockInTime) }}
          </dd>
        </div>
        <div class="px-3">
          <dt class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
            <SIcon name="i-heroicons-arrow-left-on-rectangle" class="size-3.5 shrink-0" />
            {{ t('index.labels.clockOut') }}
          </dt>
          <dd class="mt-1.5 font-mono text-lg tabular-nums whitespace-nowrap text-[var(--selaras-resolved-text-default)] sm:text-xl">
            {{ formatTime(clockOutTime) }}
          </dd>
        </div>
        <div class="pl-3">
          <dt class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
            <SIcon name="i-heroicons-clock" class="size-3.5 shrink-0" />
            {{ t('index.labels.duration') }}
          </dt>
          <dd class="mt-1.5 font-mono text-lg tabular-nums whitespace-nowrap text-[var(--selaras-resolved-text-default)] sm:text-xl">
            {{ durationHuman }}
          </dd>
        </div>
      </dl>
    </SCard>

    <!-- Shift selection and the action, in one surface. The action follows the
         selectors because both selectors gate it. -->
    <SCard>
      <template #header>
        <div class="flex items-center gap-2">
          <SIcon name="i-heroicons-briefcase" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
          <h2 class="text-sm font-semibold text-[var(--selaras-resolved-text-default)]">
            {{ t('index.shift.label') }}
          </h2>
        </div>
      </template>

      <div class="space-y-4">
        <div>
          <div class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
            <SIcon name="i-heroicons-clock" class="size-3.5 shrink-0" />
            {{ t('index.shift.label') }}
          </div>
          <SSelect
            v-model="selectedShiftCode"
            :items="shiftItems"
            class="mt-1 w-full"
            adaptive
            :disabled="clockedIn"
            :placeholder="t('index.shift.placeholder')"
            label-key="label"
            value-key="value"
          />
          <p class="mt-1 text-xs text-[var(--selaras-resolved-text-muted)]">
            {{ t('index.shift.help') }}
          </p>
        </div>

        <div>
          <div class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
            <SIcon name="i-heroicons-tag" class="size-3.5 shrink-0" />
            {{ t('index.shiftType.label') }}
          </div>
          <SSelect
            v-model="selectedShiftType"
            :items="[{ label: t('index.shiftType.items.harian'), value: 'harian' }, { label: t('index.shiftType.items.bantuan'), value: 'bantuan' }]"
            class="mt-1 w-full"
            adaptive
            :disabled="clockedIn"
            :placeholder="t('index.shiftType.placeholder')"
            label-key="label"
            value-key="value"
          />
          <p class="mt-1 text-xs text-[var(--selaras-resolved-text-muted)]">
            {{ t('index.shiftType.help') }}
          </p>
        </div>

        <SButton
          v-if="!clockedIn"
          color="primary"
          icon="i-heroicons-play"
          :loading="locating || submitting"
          :disabled="!selectedShiftCode || !selectedShiftType || isShiftActive(selectedShiftType) || submitting"
          size="lg"
          block
          @click="() => handleClock('in')"
        >
          {{ t('index.buttons.clockIn') }}
        </SButton>
        <SButton
          v-else
          color="primary"
          variant="solid"
          icon="i-heroicons-stop"
          :loading="locating || submitting"
          :disabled="submitting"
          size="lg"
          block
          @click="handleClock('out')"
        >
          {{ t('index.buttons.clockOut') }}
        </SButton>
      </div>
    </SCard>

    <!-- Location. Supporting detail, so it sits last and stays quiet. -->
    <SCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <SIcon name="i-heroicons-map-pin" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
            <h2 class="text-sm font-semibold text-[var(--selaras-resolved-text-default)]">
              {{ t('index.location.title') }}
            </h2>
          </div>
          <SBadge size="sm" :color="geoSupported ? 'primary' : 'neutral'">
            {{ permissionStatus }}
          </SBadge>
        </div>
      </template>

      <p v-if="!geoSupported">
        <span class="text-red-500">{{ t('index.location.unsupported') }}</span>
      </p>
      <p v-else-if="geoError">
        <span class="text-red-500">{{ geoError }}</span>
      </p>
      <template v-else>
        <dl class="grid grid-cols-3 divide-x divide-[var(--selaras-resolved-border-muted)]">
          <div class="pr-3">
            <dt class="text-xs text-[var(--selaras-resolved-text-muted)]">
              Lat
            </dt>
            <dd class="mt-1 font-mono tabular-nums whitespace-nowrap text-[var(--selaras-resolved-text-default)]">
              {{ coords.lat?.toFixed(6) || '-' }}
            </dd>
          </div>
          <div class="px-3">
            <dt class="text-xs text-[var(--selaras-resolved-text-muted)]">
              Lng
            </dt>
            <dd class="mt-1 font-mono tabular-nums whitespace-nowrap text-[var(--selaras-resolved-text-default)]">
              {{ coords.lng?.toFixed(6) || '-' }}
            </dd>
          </div>
          <div v-if="coords.accuracy" class="pl-3">
            <dt class="text-xs text-[var(--selaras-resolved-text-muted)]">
              Accuracy
            </dt>
            <dd class="mt-1 font-mono tabular-nums whitespace-nowrap text-[var(--selaras-resolved-text-default)]">
              &plusmn;{{ Math.round(coords.accuracy) }}m
            </dd>
          </div>
        </dl>
      </template>
      <p v-if="address" class="mt-2 truncate text-xs text-[var(--selaras-resolved-text-muted)]">
        {{ address }}
      </p>
      <p v-if="geofenceError" class="mt-2 text-xs text-red-500">
        {{ geofenceError }}
      </p>

      <SButton
        size="sm"
        variant="soft"
        icon="i-heroicons-arrow-path"
        :loading="locating"
        class="mt-4"
        @click="requestLocationOnce"
      >
        {{ t('index.buttons.refreshLocation') }}
      </SButton>

      <ClientOnly>
        <div class="mt-4">
          <div v-if="geoSupported">
            <div
              v-if="hasLocation"
              class="isolate overflow-hidden rounded-[var(--selaras-resolved-radius-md)] border border-[var(--selaras-resolved-border-muted)] bg-[var(--selaras-resolved-surface-elevated)]"
            >
              <!-- MapLibre renders into this element imperatively (see
                   initMap). The isolate wrapper keeps the canvas inside this
                   stacking context so portalled overlays always win. -->
              <div ref="mapContainer" style="height: 220px" class="h-[220px] w-full" />
            </div>
            <div v-else class="text-xs text-[var(--selaras-resolved-text-muted)]">
              {{ t('index.location.mapAllow') }}
            </div>
          </div>
          <div v-else class="text-xs text-[var(--selaras-resolved-text-muted)]">
            {{ t('index.location.mapUnavailable') }}
          </div>
        </div>
      </ClientOnly>
    </SCard>

    <SModal v-model:open="showConfirmOut" :title="t('index.modal.title')" :description="confirmOutMessage">
      <template #body>
        <div v-if="isEarlyOut">
          <SFormField :label="t('index.modal.reasonLabel')" label-mode="static">
            <STextarea
              v-model="earlyReason"
              maxlength="200"
              rows="3"
              class="w-full"
              :placeholder="t('index.modal.reasonPlaceholder')"
            />
          </SFormField>
          <p class="mt-1 text-xs text-[var(--selaras-resolved-text-muted)]">
            {{ earlyReason.length }}/200
          </p>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <SButton color="neutral" variant="soft" @click="onCancelClockOut">
            {{ t('index.modal.cancel') }}
          </SButton>
          <SButton
            color="primary"
            icon="i-heroicons-check"
            :loading="submitting"
            :disabled="submitting"
            @click="onConfirmClockOut"
          >
            {{ t('index.modal.confirmButton') }}
          </SButton>
        </div>
      </template>
    </SModal>

    <SModal
      v-model:open="geofenceBlocked"
      title="Outside allowed area"
      :description="geofenceBlockedMessage || 'You are outside the allowed area. Move closer and try again.'"
    >
      <template #body>
        <div class="flex justify-end gap-2 mt-4">
          <SButton color="primary" variant="solid" @click="() => { geofenceBlocked = false }">
            OK
          </SButton>
        </div>
      </template>
    </SModal>

    <SModal
      v-model:open="geofenceCommentModalOpen"
      title="Comment required"
      :description="geofenceBlockedMessage || 'You are outside the allowed area. Please add a comment to continue.'"
    >
      <template #body>
        <div>
          <SFormField label="Comment" label-mode="static">
            <STextarea
              v-model="geofenceComment"
              maxlength="200"
              rows="3"
              class="w-full"
              placeholder="Add a brief reason..."
            />
          </SFormField>
          <p class="mt-1 text-xs text-[var(--selaras-resolved-text-muted)]">
            {{ geofenceComment.length }}/200
          </p>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <SButton color="neutral" variant="soft" @click="cancelGeofenceComment">
            Cancel
          </SButton>
          <SButton
            color="primary"
            icon="i-heroicons-check"
            :loading="submitting"
            :disabled="submitting"
            @click="submitGeofenceComment"
          >
            Continue
          </SButton>
        </div>
      </template>
    </SModal>
  </div>
</template>
