<script setup lang="ts">
// The map, its layers and the Terra Draw wiring live in useGeofenceMap, shared
// with the editor page. This page keeps the list, the selection and the CRUD.
import type { DropdownItem } from '@sewadah/selaras/types'
import { useI18n } from 'vue-i18n'

definePageMeta({
  title: 'Geofence',
  pageTitle: 'Geofence - Admin - Attendance App',
})

const { t } = useI18n()

const toast = useToast()

const { data, pending, refresh } = useFetch('/api/admin/geofences', { method: 'get', credentials: 'include' })

const geofences = computed<any[]>(() => (data.value as any)?.geofences ?? [])
const selectedId = ref<string | null>(null)
const mode = ref<'view' | 'edit' | 'create'>('view')
const isReadOnly = computed(() => mode.value === 'view')

const name = ref('')
const isActive = ref(false)
const interactionPolicy = ref<'disallow' | 'allow' | 'allow_with_comment'>('disallow')
const saving = ref(false)
const showDelete = ref(false)
// The edit/create form lives in a slideover, so a separate flag drives it - mode
// alone is not enough because staying in 'edit' must still let the panel close.
const formOpen = ref(false)
const deleteTarget = ref<any | null>(null)
const isLoading = computed(() => Boolean(pending.value))
const isApplyingConfig = ref(false)
const pointRadiusBackup = ref<number | null>(100)

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
} = geo

// Computed rather than constant so the labels follow the active locale - the
// page used to render these as literal English.
const geofenceItems = computed(() => [
  { label: t('adminGeofence.form.type.point'), value: 'point' },
  { label: t('adminGeofence.form.type.polygon'), value: 'polygon' },
])
const policyItems = computed(() => [
  { label: t('adminGeofence.form.policy.disallow'), value: 'disallow' },
  { label: t('adminGeofence.form.policy.allow'), value: 'allow' },
  { label: t('adminGeofence.form.policy.allowWithComment'), value: 'allow_with_comment' },
])
// The map tool, not the server's `interactionMode`. Renamed from that, which
// collided: the API field means the outside-interaction policy.
const mapToolItems = computed(() => [
  { label: t('adminGeofence.map.tool.move'), value: 'move', icon: 'i-lucide-hand' },
  { label: t('adminGeofence.map.tool.draw'), value: 'add', icon: 'i-lucide-pen-tool' },
])
const isRadiusEditable = computed(() => geofenceType.value === 'point')

// The row itself is the View action - selecting a geofence already loads it
// read-only - so Edit and Delete are all that is left for the overflow menu.
function rowMenuItems(fence: any): DropdownItem[][] {
  return [
    [
      {
        label: t('adminGeofence.actions.edit'),
        icon: 'i-lucide-pencil',
        onSelect: () => applyGeofence(fence, 'edit'),
      },
      {
        label: t('adminGeofence.actions.delete'),
        icon: 'i-lucide-trash',
        destructive: true,
        onSelect: () => confirmDelete(fence),
      },
    ],
  ]
}

function fenceName(fence: any) {
  return fence?.name || t('adminGeofence.list.untitled')
}

// The API stores the policy in a column called `interactionMode`, which is
// unrelated to the map tool above. Translated rather than printed raw,
// because the stored values read as allow_with_comment.
function policyLabel(mode: string) {
  if (mode === 'allow')
    return t('adminGeofence.badge.allow')
  if (mode === 'allow_with_comment')
    return t('adminGeofence.badge.allowWithComment')
  return t('adminGeofence.badge.disallow')
}

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

watch(
  () => isReadOnly.value,
  (val) => {
    if (val)
      mapTool.value = 'move'
  },
)

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
  mode.value = nextMode
  formOpen.value = nextMode !== 'view'
  nextTick(() => {
    isApplyingConfig.value = false
  })
}

// Selecting a fence from the list and clicking it on the map must do the same
// thing, so both go through here.
function selectFence(fence: any) {
  applyGeofence(fence, 'view')
  flyToShape()
}

// Once the map is up, frame the fence the page opened on. Selecting alone leaves
// the map on the default centre, so the selection sits off screen.
watch(mapContainer, (el) => {
  if (el)
    bindMapEvents(id => selectFence(geofences.value.find(g => g.id === id)))
})

function startCreate() {
  selectedId.value = null
  name.value = ''
  isActive.value = false
  interactionPolicy.value = 'disallow'
  geofenceType.value = 'point'
  radiusMeters.value = 100
  center.value = null
  polygon.value = []
  mapTool.value = 'add'
  mode.value = 'create'
  formOpen.value = true
}

function startEdit() {
  if (!selectedId.value)
    return
  mode.value = 'edit'
  formOpen.value = true
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
  formOpen.value = false
}

watch(formOpen, (open) => {
  if (!open && (mode.value === 'edit' || mode.value === 'create'))
    cancelEdit()
})

function distanceMeters(a: [number, number], b: [number, number]) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[1] === undefined ? b[0] : b[0])
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
    toast.add({ title: 'Failed to save geofence', description: err?.message || 'Unknown error', color: 'danger' })
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
    toast.add({ title: 'Failed to delete geofence', description: err?.message || 'Unknown error', color: 'danger' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <PageWrapper>
    <template #navRight>
      <SButton
        color="primary"
        icon="i-heroicons-plus"
        @click="startCreate"
      >
        {{ t('adminGeofence.add') }}
      </SButton>
    </template>

    <!-- The map fills what is left below the header. The header height is
         `--admin-header-h`, published by PageWrapper from a ResizeObserver,
         because it is 65px on most widths and 81px when a page's action row
         wraps. -m-2 cancels PageWrapper's p-2 so the canvas runs to the panel
         edge, matching the header above it. -->
    <div class="relative -m-2 h-[calc(100dvh-var(--admin-header-h,5rem))] min-h-[440px]">
      <ClientOnly>
        <div
          class="absolute inset-0 overflow-hidden rounded-[var(--selaras-resolved-radius-md)] border border-[var(--selaras-resolved-border-default)]"
          :class="mapTool === 'add' && !isReadOnly ? 'cursor-crosshair' : ''"
        >
          <div ref="mapContainer" class="size-full" />
        </div>
        <template #fallback>
          <div class="absolute inset-0 flex items-center justify-center rounded-[var(--selaras-resolved-radius-md)] border border-[var(--selaras-resolved-border-default)] text-sm text-[var(--selaras-resolved-text-muted)]">
            {{ t('adminGeofence.map.loading') }}
          </div>
        </template>
      </ClientOnly>

      <!-- Map toolbar floats over the map, top-right. -->
      <div class="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
        <SToggleGroup
          v-model="mapTool"
          :items="mapToolItems"
          size="sm"
          :disabled="isReadOnly"
          :aria-label="t('adminGeofence.map.tool.label')"
        />
        <div class="flex items-center gap-2 rounded-md border border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-elevated)] px-2 py-1.5 shadow-sm">
          <SBadge size="sm" variant="soft" color="neutral">
            {{ t('adminGeofence.map.polygon.vertices', { count: polygon.length }) }}
          </SBadge>
          <SButton
            size="sm"
            icon="i-heroicons-check"
            :disabled="polygon.length < 3 || isReadOnly"
            @click="geo.finishPolygon"
          >
            {{ t('adminGeofence.map.polygon.finish') }}
          </SButton>
          <SButton
            size="sm"
            variant="soft"
            icon="i-heroicons-arrow-uturn-left"
            :disabled="!polygon.length || isReadOnly"
            @click="geo.undoVertex"
          >
            {{ t('adminGeofence.map.polygon.undo') }}
          </SButton>
          <SButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-heroicons-trash"
            :disabled="!polygon.length || isReadOnly"
            @click="geo.clearPolygon"
          >
            {{ t('adminGeofence.map.polygon.clear') }}
          </SButton>
        </div>
        <p class="mb-2 text-xs text-[var(--selaras-resolved-text-muted)]">
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

      <!-- Left-edge panel with the list, flush to the panel edge. -->
      <aside class="absolute bottom-0 left-0 top-0 z-10 flex w-[300px] flex-col overflow-hidden border-r border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-elevated)]/95 backdrop-blur sm:w-[320px]">
        <div class="flex items-start justify-between gap-2 border-b border-[var(--selaras-resolved-border-default)] p-3">
          <div>
            <p class="text-sm font-medium">
              {{ t('adminGeofence.list.title') }}
            </p>
            <p class="text-xs text-[var(--selaras-resolved-text-muted)]">
              {{ t('adminGeofence.list.description') }}
            </p>
          </div>
          <SButton
            v-if="mode === 'view' && selectedId"
            size="sm"
            variant="soft"
            icon="i-lucide-pencil"
            @click="startEdit"
          >
            {{ t('adminGeofence.actions.edit') }}
          </SButton>
        </div>
        <div class="flex-1 overflow-auto p-3" :class="{ 'opacity-50 pointer-events-none': isLoading }">
          <p v-if="!geofences.length" class="text-xs text-[var(--selaras-resolved-text-muted)]">
            {{ t('adminGeofence.list.empty') }}
          </p>
          <ul v-else class="space-y-2">
            <li v-for="fence in geofences" :key="fence.id">
              <!-- Selection uses the brand ramp from main.css rather than a
                   Selaras token: there is no resolved primary-subtle or
                   primary-border variable to reference outside a component. -->
              <div
                class="flex items-stretch overflow-hidden rounded-md border transition-colors"
                :class="fence.id === selectedId
                  ? 'border-primary-300 bg-primary-50 dark:border-primary-800 dark:bg-primary-950'
                  : 'border-[var(--selaras-resolved-border-default)] hover:bg-[var(--selaras-resolved-surface-elevated)]'"
              >
                <SButton
                  variant="ghost"
                  color="neutral"
                  class="h-auto min-w-0 flex-1 p-0"
                  :aria-current="fence.id === selectedId ? 'true' : undefined"
                  @click="selectFence(fence)"
                >
                  <span class="flex w-full min-w-0 flex-col gap-1 px-3 py-2.5 text-left">
                    <span class="w-full truncate text-sm font-medium">
                      {{ fenceName(fence) }}
                    </span>
                    <span class="flex flex-wrap gap-1">
                      <SBadge size="sm" variant="soft" :color="fence.type === 'polygon' ? 'warning' : 'primary'">
                        {{ fence.type === 'polygon' ? t('adminGeofence.badge.polygon') : t('adminGeofence.badge.point') }}
                      </SBadge>
                      <SBadge size="sm" variant="soft" :color="fence.isActive ? 'primary' : 'neutral'">
                        {{ fence.isActive ? t('adminGeofence.badge.active') : t('adminGeofence.badge.inactive') }}
                      </SBadge>
                      <SBadge size="sm" variant="soft" color="neutral">
                        {{ policyLabel(fence.interactionMode) }}
                      </SBadge>
                    </span>
                  </span>
                </SButton>
                <SDropdown
                  :items="rowMenuItems(fence)"
                  :positioning="{ align: 'end' }"
                >
                  <SButton
                    variant="ghost"
                    color="neutral"
                    class="w-8 shrink-0 self-center"
                    :aria-label="t('adminGeofence.actions.moreLabel', { name: fenceName(fence) })"
                  >
                    <SIcon name="i-lucide-ellipsis-vertical" />
                  </SButton>
                </SDropdown>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <!-- Edit / Create form slides over from the right. -->
      <SSlideover
        v-model:open="formOpen"
        side="right"
        :title="mode === 'create' ? t('adminGeofence.detail.newTitle') : t('adminGeofence.detail.editTitle')"
        :description="t('adminGeofence.detail.description')"
      >
        <template #body>
          <div class="space-y-4" :class="{ 'opacity-50 pointer-events-none': isLoading }">
            <SFormField :label="t('adminGeofence.form.name.label')">
              <SInput
                v-model="name"
                :placeholder="t('adminGeofence.form.name.placeholder')"
                :disabled="isReadOnly"
              />
            </SFormField>

            <!-- `SSwitch` renders its own <label> around the control, so the label
                 toggles the switch without any hand-rolled markup. -->
            <SSwitch
              v-model="isActive"
              :label="t('adminGeofence.form.active.label')"
              :description="t('adminGeofence.form.active.description')"
              :loading="pending"
              :disabled="isReadOnly"
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
                :disabled="isReadOnly"
              />
            </SFormField>

            <div>
              <p class="font-medium mb-1">
                {{ t('adminGeofence.form.type.label') }}
              </p>
              <SRadioGroup
                v-model="geofenceType"
                name="geofence-type"
                :items="geofenceItems"
                :disabled="isReadOnly"
              />
            </div>

            <!-- The map tool and the polygon actions live in a toolbar above the
                 map. They only affect the map, and sitting between "Geofence
                 type" and "Radius" made them read as another field. -->
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
                :disabled="isReadOnly"
              />
            </SFormField>
            <p v-else class="text-xs text-[var(--selaras-resolved-text-muted)]">
              {{ t('adminGeofence.form.radius.fixedForPolygon') }}
            </p>
          </div>
        </template>
        <template #footer>
          <SButton
            size="lg"
            block
            icon="i-heroicons-cloud-arrow-up"
            :loading="saving"
            @click="saveGeofence"
          >
            {{ t('adminGeofence.actions.save') }}
          </SButton>
        </template>
      </SSlideover>
    </div>

    <SModal
      v-model:open="showDelete"
      :title="t('adminGeofence.confirm.deleteTitle')"
    >
      <template #body>
        <p class="text-sm text-[var(--selaras-resolved-text-default)]">
          {{ t('adminGeofence.confirm.deleteBody', { name: deleteTarget?.name || t('adminGeofence.list.untitled') }) }}
        </p>
        <div class="flex justify-end gap-2 mt-4">
          <SButton color="neutral" variant="soft" @click="showDelete = false">
            {{ t('common.confirm.cancel') }}
          </SButton>
          <SButton
            color="danger"
            :loading="saving"
            @click="deleteGeofence"
          >
            {{ t('adminGeofence.actions.delete') }}
          </SButton>
        </div>
      </template>
    </SModal>
  </PageWrapper>
</template>
