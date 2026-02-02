<script setup lang="ts">
const mapTileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const mapAttribution = '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
const toast = useToast()

const { data, pending, refresh } = useFetch('/api/admin/geofence', { method: 'get', credentials: 'include' })

const useRadius = ref(false)
const geofenceType = ref<'point' | 'polygon'>('point')
const geofenceItems = [
  { label: 'Point', value: 'point' },
  { label: 'Polygon', value: 'polygon' },
]
const interactionMode = ref<'move' | 'add'>('move')
const radiusMeters = ref<number | null>(100)
const pointRadiusBackup = ref<number | null>(100)
const center = ref<{ lat: number, lng: number } | null>(null)
const polygon = ref<Array<[number, number]>>([])
const drawing = ref(false)
const saving = ref(false)
const isLoading = computed(() => Boolean(pending.value))
const isRadiusEditable = computed(() => geofenceType.value === 'point')
const isApplyingConfig = ref(false)

const defaultCenter: [number, number] = [-6.2, 106.816666]

watch(
  () => data.value,
  async (val) => {
    const cfg = (val as any)?.config
    if (!cfg) return
    isApplyingConfig.value = true
    useRadius.value = Boolean(cfg.useRadius)
    geofenceType.value = cfg.type === 'polygon' ? 'polygon' : 'point'
    radiusMeters.value = typeof cfg.radiusMeters === 'number' ? cfg.radiusMeters : null
    if (cfg.type === 'point' && typeof cfg.centerLat === 'number' && typeof cfg.centerLng === 'number') {
      center.value = { lat: cfg.centerLat, lng: cfg.centerLng }
    }
    else {
      center.value = null
    }
    if (Array.isArray(cfg.polygon)) {
      polygon.value = cfg.polygon as Array<[number, number]>
    }
    else {
      polygon.value = []
    }
    await nextTick()
    isApplyingConfig.value = false
  },
  { immediate: true },
)

watch(
  () => geofenceType.value,
  (val, prev) => {
    if (isApplyingConfig.value || val === prev)
      return
    if (val === 'polygon') {
      center.value = null
      pointRadiusBackup.value = radiusMeters.value ?? pointRadiusBackup.value
      radiusMeters.value = 0
      polygon.value = []
      drawing.value = false
    }
    else {
      radiusMeters.value = pointRadiusBackup.value ?? 100
      polygon.value = []
      drawing.value = false
    }
  },
)

const mapCenter = computed<[number, number]>(() => {
  if (geofenceType.value === 'point' && center.value) return [center.value.lat, center.value.lng]
  if (polygon.value.length) {
    const sum = polygon.value.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0])
    return [sum[0] / polygon.value.length, sum[1] / polygon.value.length]
  }
  return defaultCenter
})

const mapZoom = computed(() => {
  if (geofenceType.value === 'point')
    return center.value ? 16 : 12
  return 12
})

const mapKey = computed(() => {
  if (geofenceType.value === 'point') {
    if (center.value)
      return `point-${center.value.lat}-${center.value.lng}`
    return 'point-empty'
  }
  return 'polygon'
})

function onMapClick(e: any) {
  if (interactionMode.value !== 'add') return
  // Prevent zoom on double-click leak
  if (e.originalEvent) {
    e.originalEvent.preventDefault?.()
    e.originalEvent.stopPropagation?.()
  }
  const { lat, lng } = e.latlng
  if (geofenceType.value === 'point') {
    center.value = { lat, lng }
  }
  else {
    if (!drawing.value) polygon.value = []
    drawing.value = true
    polygon.value = [...polygon.value, [lat, lng]]
  }
}

function onMapDblClick(e: any) {
  if (interactionMode.value !== 'add') return
  if (e.originalEvent) {
    e.originalEvent.preventDefault?.()
    e.originalEvent.stopPropagation?.()
  }
}

function undoVertex() {
  polygon.value = polygon.value.slice(0, -1)
  if (polygon.value.length === 0) drawing.value = false
}

function clearPolygon() {
  polygon.value = []
  drawing.value = false
}

function finishPolygon() {
  if (polygon.value.length >= 3) drawing.value = false
}

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

const suggestedRadius = computed(() => {
  if (geofenceType.value === 'point' && center.value) return null
  if (geofenceType.value === 'polygon' && polygon.value.length >= 2) {
    const centroid = mapCenter.value
    const distances = polygon.value.map(p => distanceMeters([centroid[0], centroid[1]], p))
    return Math.max(...distances)
  }
  return null
})

async function saveConfig() {
  saving.value = true
  try {
    const payload: any = {
      useRadius: useRadius.value,
      type: geofenceType.value,
      radiusMeters: radiusMeters.value,
      centerLat: center.value?.lat ?? null,
      centerLng: center.value?.lng ?? null,
      polygon: polygon.value,
    }
    await $fetch('/api/admin/geofence', {
      method: 'POST',
      body: payload,
      credentials: 'include',
    })
    toast.add({ title: 'Geofence saved', color: 'primary' })
    await refresh()
  }
  catch (err: any) {
    toast.add({ title: 'Failed to save geofence', description: err?.message || 'Unknown error', color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <UPageHeader title="Geofence & Radius" description="Configure clock-in/out radius and geofence shape." />

    <div class="grid gap-4 lg:grid-cols-3">
      <UCard class="lg:col-span-1">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">
                Settings
              </p>
              <p class="text-xs text-gray-500">
                Toggle radius and choose shape type.
              </p>
            </div>
          </div>
        </template>

        <div class="space-y-4" :class="{ 'opacity-50 pointer-events-none': isLoading }">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="font-medium">
                Use radius enforcement
              </p>
              <p class="text-xs text-gray-500">
                Require location to be within allowed radius.
              </p>
            </div>
            <ClientOnly>
              <USwitch v-model="useRadius" :loading="pending" />
            </ClientOnly>
          </div>

          <div>
            <p class="font-medium mb-1">
              Geofence type
            </p>
            <URadioGroup
              v-model="geofenceType"
              name="geofence-type"
              :items="geofenceItems"
            />
          </div>

          <div class="space-y-1">
            <p class="font-medium">
              Interaction mode
            </p>
            <div class="flex flex-wrap gap-2 text-xs text-gray-500">
              <UButton
                size="xs"
                :variant="interactionMode === 'move' ? 'solid' : 'soft'"
                icon="i-heroicons-hand-raised"
                @click="interactionMode = 'move'"
              >
                Move map
              </UButton>
              <UButton
                size="xs"
                :variant="interactionMode === 'add' ? 'solid' : 'soft'"
                icon="i-heroicons-plus"
                @click="interactionMode = 'add'"
              >
                Add point/polygon
              </UButton>
            </div>
            <p class="text-xs text-gray-500">
              When in add mode, clicking the map will place the point or polygon vertices. Switch to move to pan/zoom without placing.
            </p>
          </div>

          <div v-if="isRadiusEditable">
            <label class="block text-sm font-medium mb-1">Allowed radius (meters)</label>
            <UInput
              v-model.number="radiusMeters"
              type="number"
              min="0"
              placeholder="e.g. 100"
            />
            <p v-if="suggestedRadius" class="text-xs text-gray-500 mt-1">
              Suggested from polygon: ~{{ Math.round(suggestedRadius) }} m
            </p>
          </div>
          <p v-else class="text-xs text-gray-500">
            Radius is fixed to 0 while using polygons; switch to point to edit.
          </p>

          <div v-if="geofenceType === 'point'" class="text-xs text-gray-500">
            Click on the map to set the allowed center point.
            <div v-if="center" class="mt-1 text-[11px]">
              Current: {{ center.lat.toFixed(5) }}, {{ center.lng.toFixed(5) }}
            </div>
          </div>

          <div v-else class="text-xs text-gray-500 space-y-2">
            <p>Click on the map to add polygon vertices. Minimum 3 points.</p>
            <div class="flex flex-wrap gap-2">
              <UButton
                size="xs"
                icon="i-heroicons-check"
                :disabled="polygon.length < 3"
                @click="finishPolygon"
              >
                Finish
              </UButton>
              <UButton
                size="xs"
                variant="soft"
                icon="i-heroicons-arrow-uturn-left"
                :disabled="!polygon.length"
                @click="undoVertex"
              >
                Undo
              </UButton>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-trash"
                :disabled="!polygon.length"
                @click="clearPolygon"
              >
                Clear
              </UButton>
            </div>
            <p class="text-xs text-gray-500">
              Radius value is fixed to 0 while using polygons and becomes editable again when switching back to point.
            </p>
            <ul v-if="polygon.length" class="text-[11px] space-y-1">
              <li v-for="(p, i) in polygon" :key="i">
                #{{ i + 1 }}: {{ p[0].toFixed(5) }}, {{ p[1].toFixed(5) }}
              </li>
            </ul>
          </div>

          <div class="flex justify-end pt-2">
            <UButton :loading="saving" icon="i-heroicons-cloud-arrow-up" @click="saveConfig">
              Save
            </UButton>
          </div>
        </div>
      </UCard>

      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">
                Map
              </p>
              <p class="text-xs text-gray-500">
                Set the point or draw the polygon.
              </p>
            </div>
          </div>
        </template>

        <ClientOnly>
          <div
            class="h-[420px] overflow-hidden rounded-b-lg border border-gray-200 dark:border-gray-800"
            :class="[interactionMode === 'add' ? '!cursor-crosshair' : '']"
          >
            <LMap
              :key="mapKey"
              :style="{ height: '420px', cursor: interactionMode === 'add' ? 'crosshair' : '' }"
              :zoom="mapZoom"
              :center="mapCenter"
              :use-global-leaflet="false"
              :options="{ zoomControl: true, dragging: interactionMode === 'move', scrollWheelZoom: interactionMode === 'move', touchZoom: interactionMode === 'move', doubleClickZoom: false, boxZoom: interactionMode === 'move', keyboard: interactionMode === 'move' }"
              @click="onMapClick"
              @dblclick="onMapDblClick"
            >
              <LTileLayer :url="mapTileUrl" :attribution="mapAttribution" />
              <template v-if="geofenceType === 'point' && center">
                <LCircle :lat-lng="[center.lat, center.lng]" :radius="radiusMeters || 0" :color="useRadius ? 'green' : 'gray'" />
                <LMarker :lat-lng="[center.lat, center.lng]" />
              </template>
              <template v-else>
                <LPolygon v-if="polygon.length >= 3" :lat-lngs="polygon" :color="drawing ? 'orange' : 'blue'" />
                <LPolyline v-else-if="polygon.length >= 2" :lat-lngs="polygon" color="orange" />
                <LMarker v-for="(p, idx) in polygon" :key="idx" :lat-lng="p" />
              </template>
            </LMap>
          </div>
          <template #fallback>
            <div class="h-[420px] flex items-center justify-center text-sm text-gray-500">
              Loading map...
            </div>
          </template>
        </ClientOnly>
      </UCard>
    </div>
  </div>
</template>
