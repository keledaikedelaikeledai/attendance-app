<script setup lang="ts">
import type { DropdownItem, NavigationMenuItem } from '@sewadah/selaras/types'

const menus = computed<NavigationMenuItem[]>(() => [
  { label: 'Dashboard', icon: 'i-heroicons-squares-2x2', to: '/admin' },
  { label: 'Users', icon: 'i-heroicons-users', to: '/admin/users' },
  { label: 'Attendance', icon: 'i-heroicons-calendar-days', to: '/admin/attendance' },
  { label: 'Shifts', icon: 'i-heroicons-clock', to: '/admin/shifts' },
  { label: 'Geofence', icon: 'i-heroicons-map-pin', to: '/admin/geofence' },
])

const route = useRoute()

// ---------------------------------------------------------------------------
// Collapsed state (Selaras 0.6.0, sewadahapp/selaras#11).
// ---------------------------------------------------------------------------

const sidebarCollapsed = ref<boolean | undefined>(undefined)
let userCollapsed = false

const isCanvasRoute = computed(() => route.path.startsWith('/admin/geofence'))
let restoreCollapsedTo: boolean | null = null

function onCollapsedChange(value: boolean) {
  userCollapsed = value
  sidebarCollapsed.value = value
}

watch(isCanvasRoute, (canvas) => {
  if (canvas) {
    if (restoreCollapsedTo === null) {
      restoreCollapsedTo = userCollapsed
      sidebarCollapsed.value = true
    }
    return
  }
  if (restoreCollapsedTo !== null) {
    userCollapsed = restoreCollapsedTo
    sidebarCollapsed.value = restoreCollapsedTo
    restoreCollapsedTo = null
  }
}, { immediate: true })

const { data: user } = await authClient.useSession(useFetch)

const userHandle = computed(() => {
  const u = user.value?.user
  if (!u) return ''
  return u.username ? `@${u.username}` : (u.email ?? '')
})

const userInitials = computed(() => {
  const name = user.value?.user?.name || user.value?.user?.username || ''
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
})

const displayMenus = computed(() => {
  if (sidebarCollapsed.value) {
    return menus.value.filter(m => m.type !== 'label')
  }
  return menus.value
})

function onSignOut() {
  authClient.signOut({
    fetchOptions: {
      onSuccess() {
        navigateTo('/login', { external: true })
      },
    },
  })
}

const userMenuItems = computed<DropdownItem[][]>(() => [
  [
    { label: 'Profile', icon: 'i-lucide-user-circle', to: '/admin/profile' },
    { label: 'Sign Out', icon: 'i-lucide-log-out', destructive: true, onSelect: onSignOut },
  ],
])
</script>

<template>
  <div class="h-screen overflow-hidden bg-[var(--selaras-surface-canvas)]">
    <SDashboardGroup auto-save-id="admin-shell" class="h-full">
      <SDashboardSidebar
        :collapsed="sidebarCollapsed"
        :ui="{
          root: 'bg-transparent border-0',
          header: 'p-4 sm:p-5',
          body: 'px-3 py-2',
          footer: 'p-3 sm:p-4 border-t border-transparent',
        }"
        @update:collapsed="onCollapsedChange"
      >
        <template #header="{ isCollapsed }">
          <div class="flex items-center px-1">
            <img
              v-if="!isCollapsed"
              src="/logo-app.png"
              alt="App Logo"
              class="w-[145px] h-auto object-contain"
            >
            <img
              v-else
              src="/logo-mark.webp"
              alt="App Logo"
              class="mx-auto w-7 h-auto"
            >
          </div>
        </template>
        <template #default="{ isCollapsed }">
          <SNavigationMenu
            orientation="vertical"
            :items="displayMenus"
            :collapsed="isCollapsed"
            tooltip
            :ui="{
              groupLabel: 'px-3 pb-1.5 pt-3 text-[11px] font-semibold text-gray-400 dark:text-neutral-500 tracking-wider',
            }"
          />
        </template>
        <template #footer="{ isCollapsed }">
          <SDropdown
            :items="userMenuItems"
            :positioning="{ side: 'top', align: 'start', sideOffset: 6 }"
            :ui="{ content: 'w-[var(--reka-dropdown-menu-trigger-width)]' }"
          >
            <SButton
              block
              variant="ghost"
              color="neutral"
              class="h-auto p-0 hover:bg-gray-200/50 dark:hover:bg-neutral-800/50 rounded-xl"
              :aria-label="isCollapsed ? (user?.user.name ?? 'User menu') : undefined"
            >
              <span
                class="flex w-full items-center gap-2.5 py-1.5 text-left"
                :class="isCollapsed ? 'justify-center px-0' : 'justify-start px-2'"
              >
                <SAvatar
                  :src="user?.user.image || undefined"
                  :text="userInitials"
                  :alt="user?.user.username || 'User Avatar'"
                  :size="isCollapsed ? 'sm' : 'md'"
                  class="shrink-0 bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 font-semibold"
                />
                <template v-if="!isCollapsed">
                  <span class="flex min-w-0 flex-1 flex-col text-left">
                    <span class="w-full truncate text-sm font-semibold text-[var(--selaras-resolved-text-default)]">
                      {{ user?.user.name }}
                    </span>
                    <span class="w-full truncate text-xs text-[var(--selaras-resolved-text-muted)]">
                      {{ user?.user.email || userHandle }}
                    </span>
                  </span>
                  <SIcon
                    name="i-heroicons-chevron-up-down"
                    class="shrink-0 w-4 h-4 text-[var(--selaras-resolved-text-muted)]"
                  />
                </template>
              </span>
            </SButton>
          </SDropdown>
        </template>
      </SDashboardSidebar>

      <SDashboardResizeHandle
        :ui="{
          line: 'bg-transparent transition-colors group-hover:bg-primary-500/30 group-focus-visible:bg-primary-500/30 group-data-[state=drag]:bg-primary-500/50',
        }"
      />

      <SDashboardPanel class="h-full p-2 sm:py-3 sm:pr-3 sm:pl-0 md:py-3.5 md:pr-3.5 md:pl-0 lg:py-4 lg:pr-4 lg:pl-0 bg-transparent overflow-hidden">
        <div class="flex flex-col flex-1 h-full min-h-0 rounded-2xl md:rounded-3xl border border-gray-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs overflow-hidden">
          <slot />
        </div>
      </SDashboardPanel>
    </SDashboardGroup>
  </div>
</template>
