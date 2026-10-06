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
const router = useRouter()

// The key is explicit so the editor can invalidate this payload after a save or
// delete. Without it, useFetch keys off the URL and a client-side navigation
// back to this page replays the cached list - a newly saved geofence was missing
// until a hard reload.
const { data, pending, refresh } = useFetch('/api/admin/geofences', {
  key: 'admin-geofences',
  method: 'get',
  credentials: 'include',
})

const geofences = computed<any[]>(() => (data.value as any)?.geofences ?? [])
const selectedId = ref<string | null>(null)

const isActive = ref(false)
const saving = ref(false)
const showDelete = ref(false)
const deleteTarget = ref<any | null>(null)
const isLoading = computed(() => Boolean(pending.value))

const mapContainer = ref<HTMLElement | null>(null)

// The overview does not draw. Editing lives on /admin/geofence/:id, where the
// form sits beside the map instead of over it.
const geo = useGeofenceMap({
  editable: false,
  geofences,
  selectedId,
  isActive,
  mapContainer,
  onReady: () => onMapReady(),
})
// radiusMeters is still needed here: the radius ring of a point fence is drawn
// by our own layers, not by Terra Draw, which the overview does not load.
const {
  geofenceType,
  radiusMeters,
  center,
  polygon,
  flyToShape,
  bindMapEvents,
} = geo

// The row itself is the View action - selecting a geofence already loads it
// read-only - so Edit and Delete are all that is left for the overflow menu.
function rowMenuItems(fence: any): DropdownItem[][] {
  return [
    [
      {
        label: t('adminGeofence.actions.edit'),
        icon: 'i-lucide-pencil',
        onSelect: () => goEdit(fence.id),
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
      applyGeofence(list[0])
    }
  },
  { immediate: true },
)

// The overview only ever views a fence. Editing is a different route.
function applyGeofence(fence: any) {
  selectedId.value = fence?.id ?? null
  isActive.value = Boolean(fence?.isActive)
  geofenceType.value = fence?.type === 'polygon' ? 'polygon' : 'point'
  radiusMeters.value = typeof fence?.radiusMeters === 'number' ? fence.radiusMeters : null
  center.value = fence?.type === 'point' && typeof fence?.centerLat === 'number' && typeof fence?.centerLng === 'number'
    ? { lat: fence.centerLat, lng: fence.centerLng }
    : null
  polygon.value = Array.isArray(fence?.polygon) ? fence.polygon : []
}

// Selecting a fence from the list and clicking it on the map must do the same
// thing, so both go through here.
function selectFence(fence: any) {
  applyGeofence(fence)
  flyToShape()
}

// Once the map is up, frame the fence the page opened on. Selecting alone leaves
// the map on the default centre, so the selection sits off screen.
watch(mapContainer, (el) => {
  if (el)
    bindMapEvents(id => selectFence(geofences.value.find(g => g.id === id)))
})

function goCreate() {
  router.push('/admin/geofence/new')
}

function goEdit(id: string) {
  router.push(`/admin/geofence/${id}`)
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
    toast.add({ title: t('adminGeofence.toasts.deleted.title'), color: 'primary' })
    showDelete.value = false
    deleteTarget.value = null
    await refresh()
    const nextFence = geofences.value[0]
    if (nextFence)
      applyGeofence(nextFence)
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
</script>

<template>
  <PageWrapper>
    <template #navRight>
      <SButton
        color="primary"
        icon="i-heroicons-plus"
        @click="goCreate"
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
        <div class="absolute inset-0 overflow-hidden rounded-[var(--selaras-resolved-radius-md)] border border-[var(--selaras-resolved-border-default)]">
          <div ref="mapContainer" class="size-full" />
        </div>
        <template #fallback>
          <div class="absolute inset-0 flex items-center justify-center rounded-[var(--selaras-resolved-radius-md)] border border-[var(--selaras-resolved-border-default)] text-sm text-[var(--selaras-resolved-text-muted)]">
            {{ t('adminGeofence.map.loading') }}
          </div>
        </template>
      </ClientOnly>

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
            v-if="selectedId"
            size="sm"
            variant="soft"
            icon="i-lucide-pencil"
            @click="selectedId && goEdit(selectedId)"
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
