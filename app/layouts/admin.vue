<script setup lang="ts">
import type { NavigationMenuItem } from '@sewadah/selaras/types'

const menus = computed<NavigationMenuItem[]>(() => [
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/admin' },
  { label: 'Users', icon: 'i-heroicons-users', to: '/admin/users' },
  { label: 'Attendance', icon: 'i-heroicons-calendar-days', to: '/admin/attendance' },
  { label: 'Shifts', icon: 'i-heroicons-clock', to: '/admin/shifts' },
  { label: 'Geofence', icon: 'i-heroicons-map-pin', to: '/admin/geofence' },
])

// Selaras' SButton has no `to` handling of its own - a bare `to`
// falls through to the <button> and does nothing. Route via NuxtLink instead.
const NuxtLink = resolveComponent('NuxtLink')

const { data: user } = await authClient.useSession(useFetch)

function onSignOut() {
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
  <!-- Replaces the hand-rolled fixed aside + content divs. The sidebar owns
       its own collapse state now (persisted under auto-save-id), so the
       `isCollapsed` prop and the shared useState are gone. Below 768px the
       sidebar becomes a drawer instead of vanishing, which also fixes the
       missing mobile navigation.

       The plain div owns the viewport height. The group's h-full then resolves
       against something definite instead of an unsized chain, which is what
       left the sidebar at content height with the footer floating mid-page.
       h-screen here also keeps the shell fixed while the panel scrolls
       internally, so the sidebar never needs sticky positioning. -->
  <div class="h-screen overflow-hidden">
    <SDashboardGroup auto-save-id="admin-shell" class="h-full">
      <SDashboardSidebar>
        <template #header="{ isCollapsed }">
          <img
            v-if="!isCollapsed"
            src="/logo-app.png"
            alt="App Logo"
            class="mx-auto w-[150px] h-auto"
          >
        </template>
        <template #default="{ isCollapsed }">
          <SNavigationMenu
            orientation="vertical"
            :items="menus"
            :collapsed="isCollapsed"
          />
        </template>
        <template #footer="{ isCollapsed }">
          <div class="flex flex-col pl-1 pr-2">
            <SSeparator />
            <STooltip
              :ui="{ content: 'w-54 flex flex-col h-auto p-0 gap-0' }"
              :delay-duration="100"
            >
              <template #content>
                <SButton
                  :as="NuxtLink"
                  icon="i-lucide-user-circle"
                  size="sm"
                  color="neutral"
                  variant="text"
                  class="w-full p-[10px]"
                  to="/admin/profile"
                >
                  Profile
                </SButton>
                <SButton
                  icon="i-lucide-log-out"
                  size="sm"
                  color="neutral"
                  variant="text"
                  class="w-full p-[10px]"
                  @click="onSignOut"
                >
                  Sign Out
                </SButton>
              </template>
              <div
                class="w-full flex items-center justify-between mt-2 pt-2 pb-2"
                :class="{ 'pl-2 pr-2': !isCollapsed }"
              >
                <div class="flex items-center">
                  <SAvatar
                    :src="user?.user.image || undefined"
                    :alt="user?.user.username || 'User Avatar'"
                    size="lg"
                    class="border border-neutral-300 dark:border-neutral-700"
                  />
                  <span
                    v-if="!isCollapsed"
                    class="text-xs ml-2"
                  >
                    {{ user?.user.name }}
                  </span>
                </div>
                <SIcon
                  v-if="!isCollapsed"
                  name="i-lucide-ellipsis-vertical"
                />
              </div>
            </STooltip>
          </div>
        </template>
      </SDashboardSidebar>
      <!-- The handle defaults paint a visible 1px line plus a 4px gradient
           strip down the seam. Both are wrong here: the gradient hardcodes
           `surface-default` for the page side, but DashboardPanel has no
           background at all, so the real page colour is `surface-canvas`
           (set on body). That leaves three greys across ~5px - elevated,
           default, canvas. Make the whole handle transparent and bring the
           line back only on hover/drag, so the seam is invisible at rest
           but the edge still announces itself as draggable. The 8px hit
           area is unaffected. -->
      <SDashboardResizeHandle
        :ui="{
          root: 'bg-transparent',
          line: 'opacity-0 group-hover:opacity-100 group-data-[state=drag]:opacity-100',
        }"
      />
      <SDashboardPanel>
        <main class="flex-1 overflow-y-auto p-2">
          <slot />
        </main>
      </SDashboardPanel>
    </SDashboardGroup>
  </div>
</template>
