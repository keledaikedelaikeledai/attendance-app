<script setup lang="ts">
const mapTileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const mapAttribution = '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
const toast = useToast()

const { data, pending, refresh } = useFetch('/api/admin/geofences', { method: 'get', credentials: 'include' })

const geofences = computed<any[]>(() => (data.value as any)?.geofences ?? [])
const selectedId = ref<string | null>(null)
const mode = ref<'view' | 'edit' | 'create'>('view')
const isReadOnly = computed(() => mode.value === 'view')

const name = ref('')
const isActive = ref(false)
const interactionPolicy = ref<'disallow' | 'allow' | 'allow_with_comment'>('disallow')
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
const showDelete = ref(false)
const deleteTarget = ref<any | null>(null)
const isLoading = computed(() => Boolean(pending.value))
const isRadiusEditable = computed(() => geofenceType.value === 'point')
const isApplyingConfig = ref(false)

const defaultCenter: [number, number] = [-6.2, 106.816666]

watch(
  () => geofences.value,
  (list) => {
    if (!list.length) return
    if (!selectedId.value) {
      applyGeofence(list[0], 'view')
    }
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

watch(
  () => isReadOnly.value,
  (val) => {
    if (val)
      interactionMode.value = 'move'
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
  const id = selectedId.value || 'new'
  if (geofenceType.value === 'point') {
    if (center.value)
      return `point-${id}-${center.value.lat}-${center.value.lng}`
    return `point-empty-${id}`
  }
  return `polygon-${id}-${polygon.value.length}`
})

function applyGeofence(fence: any, nextMode: 'view' | 'edit' | 'create') {
  isApplyingConfig.value = true
  selectedId.value = fence?.id ?? null
  name.value = fence?.name || ''
  isActive.value = Boolean(fence?.isActive)
  interactionPolicy.value = fence?.interactionMode === 'allow_with_comment'
    ? 'allow_with_comment'
    : fence?.interactionMode === 'allow'
      ? 'allow'
      : 'disallow'
  geofenceType.value = fence?.type === 'polygon' ? 'polygon' : 'point'
  radiusMeters.value = typeof fence?.radiusMeters === 'number' ? fence.radiusMeters : null
  if (fence?.type === 'point' && typeof fence?.centerLat === 'number' && typeof fence?.centerLng === 'number') {
    center.value = { lat: fence.centerLat, lng: fence.centerLng }
  }
  else {
    center.value = null
  }
  polygon.value = Array.isArray(fence?.polygon) ? fence.polygon : []
  drawing.value = false
  mode.value = nextMode
  nextTick(() => {
    isApplyingConfig.value = false
  })
}

function startCreate() {
  selectedId.value = null
  name.value = ''
  isActive.value = false
  interactionPolicy.value = 'disallow'
  geofenceType.value = 'point'
  radiusMeters.value = 100
  center.value = null
  polygon.value = []
  drawing.value = false
  interactionMode.value = 'add'
  mode.value = 'create'
}

function startEdit() {
  if (!selectedId.value)
    return
  mode.value = 'edit'
}

function cancelEdit() {
  if (selectedId.value) {
    const current = geofences.value.find(g => g.id === selectedId.value)
    if (current) {
      applyGeofence(current, 'view')
      return
    }
  }
  mode.value = 'view'
}

function onMapClick(e: any) {
  if (interactionMode.value !== 'add' || isReadOnly.value) return
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
  if (interactionMode.value !== 'add' || isReadOnly.value) return
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

async function saveGeofence() {
  saving.value = true
  try {
    const payload: any = {
      name: name.value,
      isActive: isActive.value,
      interactionMode: interactionPolicy.value,
      type: geofenceType.value,
      radiusMeters: radiusMeters.value,
      centerLat: center.value?.lat ?? null,
      centerLng: center.value?.lng ?? null,
      polygon: polygon.value,
    }
    if (mode.value === 'create') {
      const res: any = await $fetch('/api/admin/geofences', {
        method: 'POST',
        body: payload,
        credentials: 'include',
      })
      toast.add({ title: 'Geofence created', color: 'primary' })
      await refresh()
      if (res?.geofence?.id) {
        const created = geofences.value.find(g => g.id === res.geofence.id)
        if (created)
          applyGeofence(created, 'view')
      }
    }
    else if (selectedId.value) {
      await $fetch(`/api/admin/geofences/${selectedId.value}` as string, {
        method: 'PUT',
        body: payload,
        credentials: 'include',
      })
      toast.add({ title: 'Geofence updated', color: 'primary' })
      await refresh()
      const updated = geofences.value.find(g => g.id === selectedId.value)
      if (updated)
        applyGeofence(updated, 'view')
    }
  }
  catch (err: any) {
    toast.add({ title: 'Failed to save geofence', description: err?.message || 'Unknown error', color: 'error' })
  }
  finally {
    saving.value = false
  }
}

function confirmDelete(fence: any) {
  deleteTarget.value = fence
  showDelete.value = true
}

async function deleteGeofence() {
  if (!deleteTarget.value)
    return
  saving.value = true
  try {
    await $fetch(`/api/admin/geofences/${deleteTarget.value.id}` as string, {
      method: 'DELETE',
      credentials: 'include',
    })
    toast.add({ title: 'Geofence deleted', color: 'primary' })
    showDelete.value = false
    deleteTarget.value = null
    await refresh()
    const nextFence = geofences.value[0]
    if (nextFence)
      applyGeofence(nextFence, 'view')
    else
      startCreate()
  }
  catch (err: any) {
    toast.add({ title: 'Failed to delete geofence', description: err?.message || 'Unknown error', color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <UPageHeader title="Geofences" description="Manage multiple geofences for clock-in/out enforcement." />

    <div class="grid gap-4 lg:grid-cols-3">
      <UCard class="lg:col-span-1">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">
                Geofence list
              </p>
              <p class="text-xs text-gray-500">
                Create, edit, or remove geofences.
              </p>
            </div>
            <UButton size="xs" icon="i-heroicons-plus" @click="startCreate">
              Add
            </UButton>
          </div>
        </template>

        <div class="space-y-3" :class="{ 'opacity-50 pointer-events-none': isLoading }">
          <div v-if="!geofences.length" class="text-xs text-gray-500">
            No geofences yet. Click “Add” to create one.
          </div>
          <div
            v-for="fence in geofences"
            :key="fence.id"
            class="rounded-md border border-gray-200 dark:border-gray-800 p-3 space-y-2"
            :class="{ 'bg-gray-50 dark:bg-gray-900': fence.id === selectedId }"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">
                  {{ fence.name || 'Untitled geofence' }}
                </p>
                <div class="flex flex-wrap gap-1 mt-1 text-xs">
                  <UBadge size="xs" variant="soft" :color="fence.type === 'polygon' ? 'warning' : 'primary'">
                    {{ fence.type }}
                  </UBadge>
                  <UBadge size="xs" variant="soft" :color="fence.isActive ? 'primary' : 'neutral'">
                    {{ fence.isActive ? 'active' : 'inactive' }}
                  </UBadge>
                  <UBadge size="xs" variant="soft" color="neutral">
                    {{ fence.interactionMode || 'disallow' }}
                  </UBadge>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton size="xs" variant="soft" @click="applyGeofence(fence, 'view')">
                View
              </UButton>
              <UButton size="xs" @click="applyGeofence(fence, 'edit')">
                Edit
              </UButton>
              <UButton
                size="xs"
                color="error"
                variant="ghost"
                @click="confirmDelete(fence)"
              >
                Delete
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">
                {{ mode === 'create' ? 'New geofence' : mode === 'edit' ? 'Edit geofence' : 'Geofence details' }}
              </p>
              <p class="text-xs text-gray-500">
                Configure shape, policy, and map coordinates.
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                v-if="mode === 'view' && selectedId"
                size="xs"
                variant="soft"
                @click="startEdit"
              >
                Edit
              </UButton>
              <UButton
                v-if="mode !== 'view'"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="cancelEdit"
              >
                Cancel
              </UButton>
              <UButton
                v-if="mode !== 'view'"
                size="xs"
                :loading="saving"
                icon="i-heroicons-cloud-arrow-up"
                @click="saveGeofence"
              >
                Save
              </UButton>
            </div>
          </div>
        </template>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="space-y-4" :class="{ 'opacity-50 pointer-events-none': isLoading }">
            <div>
              <label class="block text-sm font-medium mb-1">Name</label>
              <UInput v-model="name" placeholder="e.g. HQ geofence" :disabled="isReadOnly" />
            </div>

            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="font-medium">
                  Active geofence
                </p>
                <p class="text-xs text-gray-500">
                  Enable this geofence for clock-in/out checks.
                </p>
              </div>
              <ClientOnly>
                <USwitch v-model="isActive" :loading="pending" :disabled="isReadOnly" />
              </ClientOnly>
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Outside interaction</label>
              <USelect
                v-model="interactionPolicy"
                :items="[
                  { label: 'Disallow', value: 'disallow' },
                  { label: 'Allow', value: 'allow' },
                  { label: 'Allow with comment', value: 'allow_with_comment' },
                ]"
                class="w-full"
                option-attribute="label"
                value-attribute="value"
                :disabled="isReadOnly"
              />
              <p class="text-xs text-gray-500 mt-1">
                Applies when user is outside this geofence and it is active.
              </p>
            </div>

            <div>
              <p class="font-medium mb-1">
                Geofence type
              </p>
              <URadioGroup
                v-model="geofenceType"
                name="geofence-type"
                :items="geofenceItems"
                :disabled="isReadOnly"
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
                  :disabled="isReadOnly"
                  @click="interactionMode = 'move'"
                >
                  Move map
                </UButton>
                <UButton
                  size="xs"
                  :variant="interactionMode === 'add' ? 'solid' : 'soft'"
                  icon="i-heroicons-plus"
                  :disabled="isReadOnly"
                  @click="interactionMode = 'add'"
                >
                  Add point/polygon
                </UButton>
              </div>
              <p class="text-xs text-gray-500">
                When in add mode, clicking the map will place the point or polygon vertices.
              </p>
            </div>

            <div v-if="isRadiusEditable">
              <label class="block text-sm font-medium mb-1">Allowed radius (meters)</label>
              <UInput
                v-model.number="radiusMeters"
                type="number"
                min="0"
                placeholder="e.g. 100"
                :disabled="isReadOnly"
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
                  :disabled="polygon.length < 3 || isReadOnly"
                  @click="finishPolygon"
                >
                  Finish
                </UButton>
                <UButton
                  size="xs"
                  variant="soft"
                  icon="i-heroicons-arrow-uturn-left"
                  :disabled="!polygon.length || isReadOnly"
                  @click="undoVertex"
                >
                  Undo
                </UButton>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-heroicons-trash"
                  :disabled="!polygon.length || isReadOnly"
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
          </div>

          <div>
            <ClientOnly>
              <div class="h-[420px] overflow-hidden rounded-b-lg border border-gray-200 dark:border-gray-800" :class="[interactionMode === 'add' && !isReadOnly ? '!cursor-crosshair' : '']">
                <LMap
                  :key="mapKey"
                  :style="{ height: '420px', cursor: interactionMode === 'add' && !isReadOnly ? 'crosshair' : '' }"
                  :zoom="mapZoom"
                  :center="mapCenter"
                  :use-global-leaflet="false"
                  :options="{ zoomControl: true, dragging: interactionMode === 'move' || isReadOnly, scrollWheelZoom: interactionMode === 'move' || isReadOnly, touchZoom: interactionMode === 'move' || isReadOnly, doubleClickZoom: false, boxZoom: interactionMode === 'move' || isReadOnly, keyboard: interactionMode === 'move' || isReadOnly }"
                  @click="onMapClick"
                  @dblclick="onMapDblClick"
                >
                  <LTileLayer :url="mapTileUrl" :attribution="mapAttribution" />
                  <template v-if="geofenceType === 'point' && center">
                    <LCircle :lat-lng="[center.lat, center.lng]" :radius="radiusMeters || 0" :color="isActive ? 'green' : 'gray'" />
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
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="showDelete" title="Delete geofence?">
      <template #body>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          This will permanently delete <strong>{{ deleteTarget?.name || 'this geofence' }}</strong>.
        </p>
        <div class="flex justify-end gap-2 mt-4">
          <UButton color="neutral" variant="soft" @click="showDelete = false">
            Cancel
          </UButton>
          <UButton
            color="error"
            icon="i-heroicons-trash"
            :loading="saving"
            @click="deleteGeofence"
          >
            Delete
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
