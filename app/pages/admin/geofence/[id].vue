<script setup lang="ts">
// One page for both jobs: /admin/geofence/new creates, /admin/geofence/:id edits.
// The map and the form sit side by side rather than one over the other, so the
// geometry and the fields that describe it are visible and usable together.
// That was the whole point of splitting this off the overview: as a slideover the
// form covered the map and the shape could not be drawn at all.
import { useI18n } from 'vue-i18n'

definePageMeta({
  title: 'Geofence',
  pageTitle: 'Geofence - Admin - Attendance App',
})

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useToast()

const fenceId = computed(() => String(route.params.id ?? ''))
const isCreate = computed(() => fenceId.value === 'new')

// Same key as the overview, so clearing it after a mutation makes the list that
// comes back from it fresh rather than the pre-save payload.
const { data, pending } = await useFetch('/api/admin/geofences', {
  key: 'admin-geofences',
  method: 'get',
  credentials: 'include',
})
const geofences = computed<any[]>(() => (data.value as any)?.geofences ?? [])

const name = ref('')
const isActive = ref(false)
const interactionPolicy = ref<'disallow' | 'allow' | 'allow_with_comment'>('disallow')
const saving = ref(false)
const showDelete = ref(false)
const pointRadiusBackup = ref<number | null>(100)
// Guards the type watcher while a loaded fence is being applied, so loading a
// polygon does not look like the user switching type and wipe the geometry.
const isApplyingConfig = ref(false)
const loaded = ref(false)
const missing = ref(false)

const selectedId = computed(() => (isCreate.value ? null : fenceId.value))
const mapContainer = ref<HTMLElement | null>(null)

const geo = useGeofenceMap({
  editable: true,
  geofences,
  selectedId,
  isActive,
  mapContainer,
})
const {
  geofenceType,
  radiusMeters,
  center,
  polygon,
  mapTool,
  mapCenter,
  flyToShape,
  bindMapEvents,
  resize,
} = geo

const geofenceItems = computed(() => [
  { label: t('adminGeofence.form.type.point'), value: 'point' },
  { label: t('adminGeofence.form.type.polygon'), value: 'polygon' },
])
const policyItems = computed(() => [
  { label: t('adminGeofence.form.policy.disallow'), value: 'disallow' },
  { label: t('adminGeofence.form.policy.allow'), value: 'allow' },
  { label: t('adminGeofence.form.policy.allowWithComment'), value: 'allow_with_comment' },
])
const mapToolItems = computed(() => [
  { label: t('adminGeofence.map.tool.move'), value: 'move', icon: 'i-lucide-hand' },
  { label: t('adminGeofence.map.tool.draw'), value: 'add', icon: 'i-lucide-pen-tool' },
])
const isRadiusEditable = computed(() => geofenceType.value === 'point')
const isLoading = computed(() => Boolean(pending.value) || !loaded.value)

const panelTitle = computed(() => {
  if (isCreate.value)
    return t('adminGeofence.detail.newTitle')
  return name.value || t('adminGeofence.detail.editTitle')
})

// Load the fence into the shape state. Same mapping the overview used, so a
// round trip through the editor and back shows the same shape.
function applyFence(fence: any) {
  isApplyingConfig.value = true
  name.value = fence?.name || ''
  isActive.value = Boolean(fence?.isActive)
  interactionPolicy.value = fence?.interactionMode === 'allow_with_comment'
    ? 'allow_with_comment'
    : fence?.interactionMode === 'allow'
      ? 'allow'
      : 'disallow'
  geofenceType.value = fence?.type === 'polygon' ? 'polygon' : 'point'
  radiusMeters.value = typeof fence?.radiusMeters === 'number' ? fence.radiusMeters : null
  center.value = fence?.type === 'point' && typeof fence?.centerLat === 'number' && typeof fence?.centerLng === 'number'
    ? { lat: fence.centerLat, lng: fence.centerLng }
    : null
  polygon.value = Array.isArray(fence?.polygon) ? fence.polygon : []
  nextTick(() => {
    isApplyingConfig.value = false
  })
}

watch(
  () => geofences.value,
  (list) => {
    if (isCreate.value) {
      if (!loaded.value) {
        applyFence(null)
        loaded.value = true
      }
      return
    }
    if (!list.length)
      return
    const fence = list.find(g => g.id === fenceId.value)
    if (!fence) {
      missing.value = true
      return
    }
    if (!loaded.value) {
      applyFence(fence)
      loaded.value = true
      flyToShape()
    }
  },
  { immediate: true },
)

watch(
  () => geofenceType.value,
  (val, prev) => {
    if (isApplyingConfig.value || val === prev)
      return
    mapTool.value = 'move'
    if (val === 'polygon') {
      center.value = null
      pointRadiusBackup.value = radiusMeters.value ?? pointRadiusBackup.value
      radiusMeters.value = 0
      polygon.value = []
    }
    else {
      radiusMeters.value = pointRadiusBackup.value ?? 100
      polygon.value = []
    }
  },
)

// The container's width is set by the flex layout beside the form, and MapLibre
// caches its canvas size, so it has to be told once the panel exists.
watch(mapContainer, (el) => {
  if (!el)
    return
  bindMapEvents(() => {})
  nextTick(() => resize())
  requestAnimationFrame(() => resize())
})

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

const canSave = computed(() => {
  if (isLoading.value)
    return false
  if (geofenceType.value === 'point')
    return !!center.value
  return polygon.value.length >= 3
})

async function save() {
  if (!canSave.value)
    return
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
    if (isCreate.value) {
      await $fetch('/api/admin/geofences', { method: 'POST', body: payload, credentials: 'include' })
      toast.add({ title: t('adminGeofence.toasts.created.title'), color: 'primary' })
      clearNuxtData('admin-geofences')
    }
    else {
      await $fetch(`/api/admin/geofences/${fenceId.value}` as string, { method: 'PUT', body: payload, credentials: 'include' })
      toast.add({ title: t('adminGeofence.toasts.updated.title'), color: 'primary' })
      clearNuxtData('admin-geofences')
    }
    await router.push('/admin/geofence')
  }
  catch (err: any) {
    toast.add({
      title: t('adminGeofence.toasts.error.title'),
      description: err?.message || t('adminGeofence.toasts.error.description'),
      color: 'danger',
    })
  }
  finally {
    saving.value = false
  }
}

async function remove() {
  saving.value = true
  try {
    await $fetch(`/api/admin/geofences/${fenceId.value}` as string, { method: 'DELETE', credentials: 'include' })
    toast.add({ title: t('adminGeofence.toasts.deleted.title'), color: 'primary' })
    clearNuxtData('admin-geofences')
    showDelete.value = false
    await router.push('/admin/geofence')
  }
  catch (err: any) {
    toast.add({
      title: t('adminGeofence.toasts.error.title'),
      description: err?.message || t('adminGeofence.toasts.error.description'),
      color: 'danger',
    })
  }
  finally {
    saving.value = false
  }
}

function goBack() {
  router.push('/admin/geofence')
}
</script>

<template>
  <PageWrapper>
    <template #navRight>
      <div class="flex items-center gap-2">
        <SButton
          v-if="!isCreate"
          color="neutral"
          variant="soft"
          icon="i-heroicons-trash"
          :disabled="saving"
          @click="showDelete = true"
        >
          {{ t('adminGeofence.actions.delete') }}
        </SButton>
        <SButton
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="goBack"
        >
          {{ t('common.confirm.cancel') }}
        </SButton>
        <SButton
          color="primary"
          icon="i-heroicons-cloud-arrow-up"
          :loading="saving"
          :disabled="!canSave"
          @click="save"
        >
          {{ t('adminGeofence.actions.save') }}
        </SButton>
      </div>
    </template>

    <!-- Map and form share the height instead of one covering the other. The map
         takes the remaining width and the form a fixed column, so the shape stays
         visible and clickable while the fields beside it are filled in.
         --admin-header-h comes from PageWrapper; -m-2 cancels its p-2 so both run
         to the panel edges, matching the header above. -->
    <div class="relative -m-2 flex h-[calc(100dvh-var(--admin-header-h,5rem))] min-h-[440px]">
      <div
        class="relative min-w-0 flex-1 overflow-hidden"
        :class="mapTool === 'add' ? 'cursor-crosshair' : ''"
      >
        <ClientOnly>
          <div class="absolute inset-0">
            <div ref="mapContainer" class="size-full" />
          </div>
          <template #fallback>
            <div class="absolute inset-0 flex items-center justify-center text-sm text-[var(--selaras-resolved-text-muted)]">
              {{ t('adminGeofence.map.loading') }}
            </div>
          </template>
        </ClientOnly>

        <!-- Toolbar over the map. These only affect the map, which is why they sit
             here rather than among the geofence's own fields. -->
        <div class="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
          <SToggleGroup
            v-model="mapTool"
            :items="mapToolItems"
            size="sm"
            :aria-label="t('adminGeofence.map.tool.label')"
          />
          <div class="flex items-center gap-2 rounded-md border border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-elevated)] px-2 py-1.5 shadow-sm">
            <SBadge size="sm" variant="soft" color="neutral">
              {{ t('adminGeofence.map.polygon.vertices', { count: polygon.length }) }}
            </SBadge>
            <SButton
              size="sm"
              icon="i-heroicons-check"
              :disabled="polygon.length < 3"
              @click="geo.finishPolygon"
            >
              {{ t('adminGeofence.map.polygon.finish') }}
            </SButton>
            <SButton
              size="sm"
              variant="soft"
              icon="i-heroicons-arrow-uturn-left"
              :disabled="!polygon.length"
              @click="geo.undoVertex"
            >
              {{ t('adminGeofence.map.polygon.undo') }}
            </SButton>
            <SButton
              size="sm"
              variant="ghost"
              color="neutral"
              icon="i-heroicons-trash"
              :disabled="!polygon.length"
              @click="geo.clearPolygon"
            >
              {{ t('adminGeofence.map.polygon.clear') }}
            </SButton>
          </div>
          <p class="mb-2 max-w-[22rem] text-end text-xs text-[var(--selaras-resolved-text-muted)]">
            <template v-if="mapTool === 'add'">
              {{ geofenceType === 'polygon'
                ? t('adminGeofence.map.polygon.hint')
                : t('adminGeofence.map.point.hint') }}
            </template>
            <template v-else-if="center && geofenceType === 'point'">
              {{ t('adminGeofence.map.point.current') }}: {{ center.lat.toFixed(5) }}, {{ center.lng.toFixed(5) }}
            </template>
            <template v-else-if="!center && !polygon.length">
              {{ t('adminGeofence.map.empty') }}
            </template>
          </p>
        </div>
      </div>

      <!-- Form column. Its own scroll container, so a long form never scrolls the
           map out of view. -->
      <aside class="flex w-[22rem] shrink-0 flex-col overflow-y-auto border-s border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-default)] p-4 xl:w-[24rem]">
        <h2 class="text-base font-semibold">
          {{ panelTitle }}
        </h2>
        <p class="mt-1 text-xs text-[var(--selaras-resolved-text-muted)]">
          {{ t('adminGeofence.detail.description') }}
        </p>

        <div v-if="missing" class="mt-6 rounded-md border border-[var(--selaras-resolved-color-danger)] p-3 text-sm">
          {{ t('adminGeofence.detail.missing') }}
        </div>

        <div v-else class="mt-4 space-y-4" :class="{ 'pointer-events-none opacity-50': isLoading }">
          <SFormField :label="t('adminGeofence.form.name.label')">
            <SInput
              v-model="name"
              :placeholder="t('adminGeofence.form.name.placeholder')"
            />
          </SFormField>

          <SSwitch
            v-model="isActive"
            :label="t('adminGeofence.form.active.label')"
            :description="t('adminGeofence.form.active.description')"
          />

          <SFormField
            :label="t('adminGeofence.form.policy.label')"
            :description="t('adminGeofence.form.policy.description')"
          >
            <SSelect
              v-model="interactionPolicy"
              :items="policyItems"
              class="w-full"
              label-key="label"
              value-key="value"
            />
          </SFormField>

          <div>
            <p class="mb-1 font-medium">
              {{ t('adminGeofence.form.type.label') }}
            </p>
            <SRadioGroup
              v-model="geofenceType"
              name="geofence-type"
              :items="geofenceItems"
            />
          </div>

          <SFormField
            v-if="isRadiusEditable"
            :label="t('adminGeofence.form.radius.label')"
            :description="suggestedRadius
              ? t('adminGeofence.form.radius.suggested', { m: Math.round(suggestedRadius) })
              : undefined"
          >
            <SInput
              v-model.number="radiusMeters"
              type="number"
              min="0"
              :placeholder="t('adminGeofence.form.radius.placeholder')"
            />
          </SFormField>
          <p v-else class="text-xs text-[var(--selaras-resolved-text-muted)]">
            {{ t('adminGeofence.form.radius.fixedForPolygon') }}
          </p>
        </div>
      </aside>
    </div>

    <SSlideover
      v-model:open="showDelete"
      :title="t('adminGeofence.confirm.deleteTitle')"
    >
      <template #body>
        <p class="text-sm text-[var(--selaras-resolved-text-default)]">
          {{ t('adminGeofence.confirm.deleteBody', { name: name || t('adminGeofence.list.untitled') }) }}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <SButton color="neutral" variant="soft" @click="showDelete = false">
            {{ t('common.confirm.cancel') }}
          </SButton>
          <SButton
            color="danger"
            :loading="saving"
            @click="remove"
          >
            {{ t('adminGeofence.actions.delete') }}
          </SButton>
        </div>
      </template>
    </SSlideover>
  </PageWrapper>
</template>
