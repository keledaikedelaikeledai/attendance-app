<script setup lang="ts">
import type { DropdownItem, NavigationMenuItem } from '@sewadah/selaras/types'

const menus = computed<NavigationMenuItem[]>(() => [
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/admin' },
  { label: 'Users', icon: 'i-heroicons-users', to: '/admin/users' },
  { label: 'Attendance', icon: 'i-heroicons-calendar-days', to: '/admin/attendance' },
  { label: 'Shifts', icon: 'i-heroicons-clock', to: '/admin/shifts' },
  { label: 'Geofence', icon: 'i-heroicons-map-pin', to: '/admin/geofence' },
])

const { data: user } = await authClient.useSession(useFetch)

// Better Auth's username plugin is optional, so fall back to the email. The @
// prefix makes the username read as a handle rather than a second name.
const userHandle = computed(() => {
  const u = user.value?.user
  if (!u) return ''
  return u.username ? `@${u.username}` : (u.email ?? '')
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

// The sidebar footer's menu. `to` renders a real NuxtLink, so Profile needs no
// click handler. `destructive` is the one flag Selaras provides for a
// delete-style action, which is what a sign out is.
const userMenuItems = computed<DropdownItem[][]>(() => [
  [
    { label: 'Profile', icon: 'i-lucide-user-circle', to: '/admin/profile' },
    { label: 'Sign Out', icon: 'i-lucide-log-out', destructive: true, onSelect: onSignOut },
  ],
])
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
      <!-- The footer slot theme is `border-t border-default`, while this
           sidebar's own root is `surface-elevated`, and main.css maps both of those
           tokens to neutral-800 in dark mode, so the divider rendered at
           L* distance 0 and vanished. Light was fine (gray-200 on gray-50,
           6.6), which is why only dark mode looked broken.

           This override is still required after the token work in main.css,
           because border-default needs to stay quiet for card dividers and
           therefore keeps sharing surface-elevated's step. border-hover is
           distinct from both modes' elevated surface (gray-300, 13.1;
           neutral-700, 11.9), and it is the token the dashed frame already
           uses, so the two dividers match. -->
      <SDashboardSidebar
        :ui="{ footer: 'border-[var(--selaras-resolved-border-hover)]' }"
      >
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
          <!-- No SSeparator here. The footer slot theme is already
               `shrink-0 border-t ... p-4`, so a separator drew a second line
               directly on top of it.

               This replaces an STooltip that held two SButtons, which was the
               wrong component twice over. A tooltip is a transient label, not
               a menu, so it closed on pointer-leave while you were still
               reaching for an item. And its content is surface-inverted, which
               is near-black in light mode, while the buttons inside were the
               neutral text variant - dark text on a near-black panel. That is
               the black popover. An SDropdown themes itself for both modes.

               side: 'top' because the trigger is at the bottom of the sidebar;
               an unanchored menu opened downwards and off the viewport.

               The content width matches the trigger. Reka sets
               --reka-dropdown-menu-trigger-width as an inline style on the
               content element itself, pointing at the anchor width, so
               reading that variable from the content sizes it to the card.
               w-full would not work - the content is portalled to body, so
               that is the viewport width. The theme's min-w-40 is left in
               place as a floor, because the collapsed rail's trigger is only
               32px and 'Sign Out' needs somewhere to go. -->
          <SDropdown
            :items="userMenuItems"
            :positioning="{ side: 'top', align: 'start', sideOffset: 6 }"
            :ui="{ content: 'w-[var(--reka-dropdown-menu-trigger-width)]' }"
          >
            <SButton
              block
              variant="ghost"
              color="neutral"
              class="h-auto p-0"
              :aria-label="isCollapsed ? (user?.user.name ?? 'User menu') : undefined"
            >
              <!-- One wrapper owns the whole row. SButton's root is
                   inline-flex justify-center, and overriding that with
                   justify-start left the text block floating in the middle.
                   A w-full child fills the line whatever the button
                   justifies, so the wrapper lays itself out instead.

                   The avatar steps down in the collapsed rail: the sidebar
                   is 64px there and the footer's own p-4 leaves 32px, which
                   will not take a 40px lg avatar. Expanded, 260px wide. -->
              <span
                class="flex w-full items-center gap-2.5 py-2 text-left"
                :class="isCollapsed ? 'justify-center px-0' : 'justify-start px-2'"
              >
                <SAvatar
                  :src="user?.user.image || undefined"
                  :alt="user?.user.username || 'User Avatar'"
                  :size="isCollapsed ? 'sm' : 'lg'"
                  class="shrink-0"
                />
                <template v-if="!isCollapsed">
                  <span class="flex min-w-0 flex-1 flex-col text-left">
                    <span class="w-full truncate text-sm font-semibold text-[var(--selaras-resolved-text-default)]">
                      {{ user?.user.name }}
                    </span>
                    <span class="w-full truncate text-xs text-[var(--selaras-resolved-text-muted)]">
                      {{ userHandle }}
                    </span>
                  </span>
                  <SIcon
                    name="i-lucide-chevrons-up-down"
                    class="shrink-0 text-[var(--selaras-resolved-text-muted)]"
                  />
                </template>
              </span>
            </SButton>
          </SDropdown>
        </template>
      </SDashboardSidebar>
      <!-- 0.5.0 removed the gradient stripe that motivated this override
           (sewadahapp/selaras#8): the root is now `z-10 -mx-1 w-2
           bg-transparent`, overlapping the boundary without painting either
           surface. So the root override is gone as redundant.

           The line override stays, and is now the library's own documented
           pattern. Their new `line` slot carries no base opacity, so opacity-0
           is still what hides the divider at rest - but their example also
           restores it on keyboard focus, which my first version omitted. That
           omission left the divider invisible to keyboard users. -->
      <SDashboardResizeHandle
        :ui="{
          line: 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=drag]:opacity-100',
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
