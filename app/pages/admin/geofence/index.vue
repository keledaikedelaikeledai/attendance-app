<script setup lang="ts">
// One page, one map, two states.
//
// Browsing shows the fence list on the left over a read-only map. Editing docks
// a form panel on the right and turns the SAME map into the drawing surface -
// there is deliberately no second map inside the form, which is what made the
// earlier slideover attempt unworkable: a MapLibre canvas inside an animated
// panel never gets a stable size, and Terra Draw ended up wired to the wrong
// map. Keeping a single instance means drawing always works while the fields
// that describe the shape stay visible beside it.
import type { DropdownItem } from '@sewadah/selaras/types'
import { useI18n } from 'vue-i18n'
import { isValidGeofenceRadius, toFiniteNumber } from '~~/shared/utils/geofence'

// (module graph refresh marker)

definePageMeta({
  title: 'Geofence',
  pageTitle: 'Geofence - Admin - Attendance App',
})

const { t } = useI18n()

const toast = useToast()

// The key is explicit so a save or delete can invalidate this payload. Without
// it, useFetch keys off the URL and replays the cached list after a mutation.
const { data, pending, refresh } = useFetch('/api/admin/geofences', {
  key: 'admin-geofences',
  method: 'get',
  credentials: 'include',
})

const geofences = computed<any[]>(() => (data.value as any)?.geofences ?? [])
const selectedId = ref<string | null>(null)

// Edit-panel state. `editingId === null` while creating.
const editing = ref(false)
const editingId = ref<string | null>(null)
const isCreate = computed(() => editing.value && editingId.value === null)

const name = ref('')
const isActive = ref(false)
const interactionPolicy = ref<'disallow' | 'allow' | 'allow_with_comment'>('disallow')
const saving = ref(false)
const showDelete = ref(false)

const isLoading = computed(() => Boolean(pending.value))
const mapContainer = ref<HTMLElement | null>(null)
let mapEventsBound = false

const geo = useGeofenceMap({
  editing,
  geofences,
  selectedId,
  isActive,
  mapContainer,
  onReady: onMapReady,
})
const {
  geofenceType,
  radiusMeters,
  center,
  polygon,
  tool,
  setTool,
  suggestedRadius,
  flyToShape,
  bindMapEvents,
  resize,
  finishPolygon,
  clearPolygon,
  undoVertex,
  enterSelect,
  tileSource,
} = geo

function onMapReady() {
  if (!mapEventsBound) {
    bindMapEvents(id => selectFence(geofences.value.find(g => g.id === id)))
    flyToShape({ duration: 0 })
    mapEventsBound = true
  }
  resize()
}

const policyItems = computed(() => [
  { label: t('adminGeofence.form.policy.disallow'), value: 'disallow' },
  { label: t('adminGeofence.form.policy.allow'), value: 'allow' },
  { label: t('adminGeofence.form.policy.allowWithComment'), value: 'allow_with_comment' },
])

// Basemap choices for the map overlay. The current source is named on the
// trigger button rather than shown as an icon, so the label is the state.
const basemapItems = computed<DropdownItem[][]>(() => [[
  { label: t('adminGeofence.map.basemap.openfreemap'), icon: 'i-lucide-layers', onSelect: () => { tileSource.value = 'openfreemap' } },
  { label: t('adminGeofence.map.basemap.osm'), icon: 'i-lucide-map', onSelect: () => { tileSource.value = 'osm' } },
  { label: t('adminGeofence.map.basemap.streets'), icon: 'i-lucide-map-pinned', onSelect: () => { tileSource.value = 'streets' } },
  { label: t('adminGeofence.map.basemap.satellite'), icon: 'i-lucide-satellite', onSelect: () => { tileSource.value = 'satellite' } },
]])

const basemapLabel = computed(() => t(`adminGeofence.map.basemap.${tileSource.value}`))

const hasShape = computed(() => geofenceType.value === 'point'
  ? Boolean(center.value)
  : polygon.value.length >= 3)

// The API rejects an unusable radius (cleared field, zero, negative, enormous)
// with a 400, so Save stays disabled instead - the description under the field
// explains what is wrong.
const canSave = computed(() => editing.value && !isLoading.value && hasShape.value
  && (geofenceType.value !== 'point' || isValidGeofenceRadius(radiusMeters.value)))

// The row itself is the View action - selecting a geofence already loads it
// read-only - so Edit and Delete are all that is left for the overflow menu.
function rowMenuItems(fence: any): DropdownItem[][] {
  return [
    [
      {
        label: t('adminGeofence.actions.edit'),
        icon: 'i-lucide-pencil',
        onSelect: () => openEdit(fence),
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

// The API stores the policy in a column called `interactionMode`. Translated
// rather than printed raw, because the stored values read as allow_with_comment.
function policyLabel(mode: string) {
  if (mode === 'allow')
    return t('adminGeofence.badge.allow')
  if (mode === 'allow_with_comment')
    return t('adminGeofence.badge.allowWithComment')
  return t('adminGeofence.badge.disallow')
}

// Load a fence into the shape + form state for read-only browsing.
function applyGeofence(fence: any) {
  selectedId.value = fence?.id ?? null
  isActive.value = Boolean(fence?.isActive)
  geofenceType.value = fence?.type === 'polygon' ? 'polygon' : 'point'
  radiusMeters.value = typeof fence?.radiusMeters === 'number' ? fence.radiusMeters : null
  center.value = fence?.type === 'point' && typeof fence?.centerLat === 'number' && typeof fence?.centerLng === 'number'
    ? { lat: fence.centerLat, lng: fence.centerLng }
    : null
  polygon.value = Array.isArray(fence?.polygon) ? fence.polygon : []
  tool.value = 'select'
}

watch(
  () => geofences.value,
  (list) => {
    if (editing.value)
      return
    if (!selectedId.value || !list.some(g => g.id === selectedId.value)) {
      applyGeofence(list[0] ?? null)
      nextTick(() => flyToShape())
    }
  },
  { immediate: true },
)

// Selecting a fence from the list and clicking it on the map must do the same
// thing, so both go through here.
function selectFence(fence: any) {
  if (!fence)
    return
  applyGeofence(fence)
  flyToShape()
}

// The edit panel animates its width, and MapLibre sizes its canvas in exact
// pixels - it never follows a CSS width change on its own. Resyncing only at
// the start and end of the animation leaves the canvas clipped mid-slide and
// snapping at the end, which reads as lag. So drive resize() every frame for
// the length of the animation instead (the deadline is a guard against a
// missed end hook); the Transition's after-enter/after-leave hooks settle
// the final frame.
let panelResizeRaf = 0
onBeforeUnmount(() => cancelAnimationFrame(panelResizeRaf))
function trackPanelResize() {
  cancelAnimationFrame(panelResizeRaf)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    resize()
    return
  }
  const deadline = performance.now() + 300
  const tick = () => {
    resize()
    panelResizeRaf = performance.now() < deadline ? requestAnimationFrame(tick) : 0
  }
  panelResizeRaf = requestAnimationFrame(tick)
}

function settleEditorLayout() {
  resize()
  // Fit against the final canvas width, so the docked form cannot hide the
  // point's radius handle or the polygon's outer vertices.
  if (editing.value && editingId.value) flyToShape({ duration: 0 })
}

watch(editing, () => {
  trackPanelResize()
})

function openCreate() {
  editingId.value = null
  name.value = ''
  isActive.value = false
  interactionPolicy.value = 'disallow'
  selectedId.value = null
  center.value = null
  polygon.value = []
  radiusMeters.value = 100
  geofenceType.value = 'point'
  editing.value = true
  // Arm the point tool so the very first click on the map places the centre -
  // no separate "switch to draw" step.
  setTool('point')
}

function openEdit(fence: any) {
  if (!fence)
    return
  editingId.value = fence.id
  name.value = fence?.name || ''
  isActive.value = Boolean(fence?.isActive)
  interactionPolicy.value = fence?.interactionMode === 'allow_with_comment'
    ? 'allow_with_comment'
    : fence?.interactionMode === 'allow'
      ? 'allow'
      : 'disallow'
  selectedId.value = fence.id
  geofenceType.value = fence?.type === 'polygon' ? 'polygon' : 'point'
  radiusMeters.value = typeof fence?.radiusMeters === 'number' ? fence.radiusMeters : null
  center.value = fence?.type === 'point' && typeof fence?.centerLat === 'number' && typeof fence?.centerLng === 'number'
    ? { lat: fence.centerLat, lng: fence.centerLng }
    : null
  polygon.value = Array.isArray(fence?.polygon) ? fence.polygon : []
  tool.value = 'select'
  editing.value = true
  nextTick(() => {
    enterSelect()
  })
}

// Closing the panel discards edits and returns to browsing the selected fence.
function cancelEdit() {
  editing.value = false
  editingId.value = null
  const fence = geofences.value.find(g => g.id === selectedId.value)
  applyGeofence(fence ?? null)
}

async function save() {
  // Closing over `saving` here means a second click in the same beat cannot
  // re-enter while the first request is in flight - it used to duplicate the
  // fence, because canSave alone does not change until the request resolves.
  if (saving.value || !canSave.value)
    return
  const id = editingId.value
  saving.value = true
  try {
    const payload: any = {
      name: name.value,
      isActive: isActive.value,
      interactionMode: interactionPolicy.value,
      type: geofenceType.value,
      radiusMeters: geofenceType.value === 'point' ? toFiniteNumber(radiusMeters.value) : null,
      centerLat: center.value?.lat ?? null,
      centerLng: center.value?.lng ?? null,
      polygon: polygon.value,
    }
    if (isCreate.value) {
      const res = await $fetch('/api/admin/geofences', { method: 'POST', body: payload, credentials: 'include' }) as any
      toast.add({ title: t('adminGeofence.toasts.created.title'), color: 'primary' })
      clearNuxtData('admin-geofences')
      await refresh()
      editing.value = false
      editingId.value = null
      const created = res?.geofence
      if (created?.id) {
        selectedId.value = created.id
        selectFence(geofences.value.find(g => g.id === created.id))
      }
    }
    else {
      await $fetch(`/api/admin/geofences/${id}` as string, { method: 'PUT', body: payload, credentials: 'include' })
      toast.add({ title: t('adminGeofence.toasts.updated.title'), color: 'primary' })
      clearNuxtData('admin-geofences')
      await refresh()
      editing.value = false
      editingId.value = null
      selectFence(geofences.value.find(g => g.id === id))
    }
  }
  catch (err: any) {
    toast.add({
      title: t('adminGeofence.toasts.error.title'),
      description: err?.message || t('adminGeofence.toasts.error.description', { message: 'Unknown error' }),
      color: 'danger',
    })
  }
  finally {
    saving.value = false
  }
}

function confirmDelete(fence: any) {
  editingId.value = fence?.id ?? editingId.value
  selectedId.value = fence?.id ?? selectedId.value
  showDelete.value = true
}

async function remove() {
  if (saving.value)
    return
  const id = editingId.value
  if (!id)
    return
  saving.value = true
  try {
    await $fetch(`/api/admin/geofences/${id}` as string, { method: 'DELETE', credentials: 'include' })
    toast.add({ title: t('adminGeofence.toasts.deleted.title'), color: 'primary' })
    clearNuxtData('admin-geofences')
    showDelete.value = false
    editing.value = false
    editingId.value = null
    selectedId.value = null
    await refresh()
  }
  catch (err: any) {
    toast.add({
      title: t('adminGeofence.toasts.error.title'),
      description: err?.message || t('adminGeofence.toasts.error.description', { message: 'Unknown error' }),
      color: 'danger',
    })
  }
  finally {
    saving.value = false
  }
}

// One prominent, contextual sentence instead of tiny muted corner text. It is
// the only place the user is told what a click will do right now.
const instruction = computed(() => {
  if (!editing.value)
    return ''
  if (tool.value === 'point')
    return t('adminGeofence.map.instruction.point')
  if (tool.value === 'polygon') {
    return polygon.value.length >= 3
      ? t('adminGeofence.map.instruction.polygonFinish')
      : t('adminGeofence.map.instruction.polygonStart')
  }
  if (!hasShape.value)
    return t('adminGeofence.map.instruction.selectEmpty')
  return geofenceType.value === 'point'
    ? t('adminGeofence.map.instruction.selectPoint')
    : t('adminGeofence.map.instruction.selectPolygon')
})

const panelTitle = computed(() => isCreate.value
  ? t('adminGeofence.detail.newTitle')
  : name.value || t('adminGeofence.detail.editTitle'))
</script>

<template>
  <PageWrapper>
    <template #navRight>
      <SButton
        v-if="!editing"
        color="primary"
        icon="i-heroicons-plus"
        @click="openCreate"
      >
        {{ t('adminGeofence.add') }}
      </SButton>
    </template>

    <!-- The map fills what is left below the header inside the card container.
         The list (browsing) or the form (editing) docks beside it; neither ever
         covers the drawing surface. -->
    <div class="relative flex flex-1 h-full min-h-[440px]">
      <!-- Browse: left-edge list, flush to the panel edge. Wrapped in a
           Transition because it overlays the map: the animation is a pure
           transform slide, nothing reflows, and the canvas never resizes. -->
      <Transition name="list-panel">
        <aside
          v-if="!editing"
          class="absolute bottom-0 left-0 top-0 z-10 flex w-[300px] flex-col overflow-hidden border-r border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-elevated)]/95 backdrop-blur sm:w-[320px]"
        >
          <div class="flex items-start justify-between gap-2 border-b border-[var(--selaras-resolved-border-default)] p-3">
            <div>
              <p class="text-sm font-medium">
                {{ t('adminGeofence.list.title') }}
              </p>
              <p class="text-xs text-[var(--selaras-resolved-text-muted)]">
                {{ t('adminGeofence.list.description') }}
              </p>
            </div>
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
      </Transition>

      <!-- The single map. It is the drawing surface in both states. -->
      <div
        class="relative min-w-0 flex-1 overflow-hidden"
        :class="editing && tool !== 'select' ? '[&_.maplibregl-canvas]:cursor-crosshair!' : ''"
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

        <!-- The tool rail. Choosing Point or Polygon is both the interaction and
             the geofence type, so the two can never disagree. -->
        <div
          v-if="editing"
          class="absolute left-3 top-3 z-20 flex flex-col gap-1 rounded-md border border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-elevated)] p-1 shadow-sm"
          role="group"
          :aria-label="t('adminGeofence.map.tool.label')"
        >
          <SButton
            size="sm"
            :variant="tool === 'select' ? 'soft' : 'ghost'"
            :color="tool === 'select' ? 'primary' : 'neutral'"
            icon="i-lucide-mouse-pointer-2"
            :aria-label="t('adminGeofence.map.tool.select')"
            :title="t('adminGeofence.map.tool.select')"
            @click="setTool('select')"
          />
          <SButton
            size="sm"
            :variant="tool === 'point' ? 'soft' : 'ghost'"
            :color="tool === 'point' ? 'primary' : 'neutral'"
            icon="i-lucide-map-pin"
            :aria-label="t('adminGeofence.map.tool.point')"
            :title="t('adminGeofence.map.tool.point')"
            @click="setTool('point')"
          />
          <SButton
            size="sm"
            :variant="tool === 'polygon' ? 'soft' : 'ghost'"
            :color="tool === 'polygon' ? 'primary' : 'neutral'"
            icon="i-lucide-pentagon"
            :aria-label="t('adminGeofence.map.tool.polygon')"
            :title="t('adminGeofence.map.tool.polygon')"
            @click="setTool('polygon')"
          />
        </div>

        <!-- The instruction pill: what a click does right now. -->
        <div
          v-if="editing"
          class="pointer-events-none absolute left-1/2 top-3 z-20 max-w-[min(28rem,calc(100%-6rem))] -translate-x-1/2 rounded-full border border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-elevated)]/95 px-4 py-1.5 text-center text-xs text-[var(--selaras-resolved-text-default)] shadow-sm backdrop-blur"
        >
          {{ instruction }}
        </div>

        <!-- Polygon-in-progress cluster. Only appears while a polygon is open,
             so the screen is quiet the rest of the time. -->
        <div
          v-if="editing && tool === 'polygon'"
          class="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-elevated)] px-2 py-1.5 shadow-sm"
        >
          <SBadge size="sm" variant="soft" color="neutral">
            {{ t('adminGeofence.map.polygon.vertices', { count: polygon.length }) }}
          </SBadge>
          <SButton
            size="sm"
            icon="i-heroicons-check"
            :disabled="polygon.length < 3"
            @click="finishPolygon"
          >
            {{ t('adminGeofence.map.polygon.finish') }}
          </SButton>
          <SButton
            size="sm"
            variant="soft"
            icon="i-heroicons-arrow-uturn-left"
            :disabled="!polygon.length"
            @click="undoVertex"
          >
            {{ t('adminGeofence.map.polygon.undo') }}
          </SButton>
          <SButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-heroicons-trash"
            :disabled="!polygon.length"
            @click="clearPolygon"
          >
            {{ t('adminGeofence.map.polygon.clear') }}
          </SButton>
        </div>

        <!-- Basemap picker. What the map shows is a reading preference, not part
             of browsing or editing, so it stays on screen in both states. Placed
             last in the overlay stack so it paints above the instruction pill;
             that pill is pointer-events-none, so it never steals the click. -->
        <div class="absolute right-3 top-3 z-20">
          <SDropdown :items="basemapItems" :positioning="{ align: 'end' }">
            <SButton
              size="sm"
              variant="soft"
              color="neutral"
              icon="i-lucide-layers"
              :title="t('adminGeofence.map.basemap.label')"
              :aria-label="t('adminGeofence.map.basemap.label')"
            >
              <span class="hidden sm:inline">{{ basemapLabel }}</span>
            </SButton>
          </SDropdown>
        </div>
      </div>

      <!-- Edit: docked form. No map lives in here on purpose. The panel's own
           width animates (the map's width follows frame by frame), so the form
           sits in an inner column with a fixed width - the fields would
           otherwise reflow on every animation frame. MapLibre sizes its canvas
           in pixels, so trackPanelResize re-syncs it every frame while the
           animation runs and the after hooks settle the last one. -->
      <Transition name="edit-panel" @after-enter="settleEditorLayout" @after-leave="resize">
        <aside
          v-if="editing"
          class="edit-panel flex shrink-0 flex-col overflow-hidden bg-[var(--selaras-resolved-surface-default)]"
        >
          <div class="flex min-h-0 w-[22rem] flex-1 flex-col overflow-y-auto border-s border-[var(--selaras-resolved-border-default)] p-4 xl:w-[24rem]">
            <h2 class="text-base font-semibold">
              {{ panelTitle }}
            </h2>
            <p class="mt-1 text-xs text-[var(--selaras-resolved-text-muted)]">
              {{ t('adminGeofence.detail.description') }}
            </p>

            <div class="mt-4 space-y-4" :class="{ 'pointer-events-none opacity-50': isLoading }">
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

              <!-- The type is a read-only summary of the tool chosen on the map, not
                   a second control that has to be kept in sync with it. -->
              <div class="flex items-center justify-between rounded-md border border-[var(--selaras-resolved-border-default)] px-3 py-2">
                <span class="text-sm text-[var(--selaras-resolved-text-muted)]">
                  {{ t('adminGeofence.form.type.label') }}
                </span>
                <SBadge size="sm" variant="soft" :color="geofenceType === 'polygon' ? 'warning' : 'primary'">
                  {{ geofenceType === 'polygon' ? t('adminGeofence.form.type.polygon') : t('adminGeofence.form.type.point') }}
                </SBadge>
              </div>

              <SFormField
                v-if="geofenceType === 'point'"
                :label="t('adminGeofence.form.radius.label')"
                :description="!isValidGeofenceRadius(radiusMeters)
                  ? t('adminGeofence.form.radius.invalid')
                  : (suggestedRadius
                    ? t('adminGeofence.form.radius.suggested', { m: Math.round(suggestedRadius) })
                    : undefined)"
              >
                <SInput
                  v-model.number="radiusMeters"
                  type="number"
                  min="1"
                  :placeholder="t('adminGeofence.form.radius.placeholder')"
                />
              </SFormField>
              <p v-else class="text-xs text-[var(--selaras-resolved-text-muted)]">
                {{ t('adminGeofence.form.radius.fixedForPolygon') }}
              </p>
            </div>

            <div class="mt-auto flex items-center justify-end gap-2 pt-4">
              <SButton
                v-if="editingId"
                color="neutral"
                variant="ghost"
                icon="i-heroicons-trash"
                :disabled="saving"
                @click="showDelete = true"
              >
                {{ t('adminGeofence.actions.delete') }}
              </SButton>
              <SButton
                color="neutral"
                variant="soft"
                :disabled="saving"
                @click="cancelEdit"
              >
                {{ t('adminGeofence.actions.cancel') }}
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
          </div>
        </aside>
      </Transition>
    </div>

    <SModal
      v-model:open="showDelete"
      :title="t('adminGeofence.confirm.deleteTitle')"
    >
      <template #body>
        <p class="text-sm text-[var(--selaras-resolved-text-default)]">
          {{ t('adminGeofence.confirm.deleteBody', { name: name || fenceName(geofences.find(g => g.id === editingId)) }) }}
        </p>
        <div class="flex justify-end gap-2 mt-4">
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
    </SModal>
  </PageWrapper>
</template>

<style scoped>
/* Panel show/hide animations. Deliberately short (~150ms) with a fast-out,
   soft-landing curve: this is wayfinding that browsing became editing and
   back, and anything slower drags on a page where both panels border a live
   map. */

/* The list overlays the map, so a transform slide is all it needs - nothing
   reflows and the map canvas never has to resize. */
.list-panel-enter-active {
  transition: transform 0.16s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.16s ease-out;
}
.list-panel-leave-active {
  transition: transform 0.14s cubic-bezier(0.5, 0, 1, 1), opacity 0.12s ease-in;
}
.list-panel-enter-from,
.list-panel-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

/* The form shares a flex row with the map, so its width animates and the map
   width follows frame by frame (kept in sync by trackPanelResize - MapLibre
   sizes its canvas in pixels and cannot follow the CSS on its own). The base
   width lives here instead of in a Tailwind class so the 0-width transition
   states can override it cleanly; the form content sits in a fixed-width
   inner column (template) so the fields do not reflow while opening. */
.edit-panel {
  width: 22rem;
}
@media (min-width: 1280px) {
  .edit-panel {
    width: 24rem;
  }
}
.edit-panel-enter-active {
  transition: width 0.16s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.16s ease-out;
}
.edit-panel-leave-active {
  pointer-events: none;
  transition: width 0.14s cubic-bezier(0.5, 0, 1, 1), opacity 0.12s ease-in;
}
.edit-panel-enter-from,
.edit-panel-leave-to {
  width: 0;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .list-panel-enter-active,
  .list-panel-leave-active,
  .edit-panel-enter-active,
  .edit-panel-leave-active {
    transition: none;
  }
}
</style>
