<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { menus, isCollapsed } = defineProps<{
  menus?: NavigationMenuItem[]
  isCollapsed: boolean
}>()

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
  <div>
    <aside
      class="fixed top-0 left-0 transition-all duration-300 hidden sm:block"
      :class="[isCollapsed ? 'w-15' : 'w-64']"
    >
      <div class="h-screen flex flex-col px-3 py-4 bg-zinc-100 dark:bg-neutral-800">
        <div class="flex flex-col items-center justify-center mb-12">
          <img src="/logo-app.png" alt="App Logo" class="mx-auto w-[150px] h-auto mb-4">
        </div>
        <UNavigationMenu
          orientation="vertical"
          :items="menus"
          class="data-[orientation=vertical]:w-full flex-1 overflow-y-auto"
        />
        <div class="flex flex-col pl-1 pr-2">
          <USeparator />
          <UTooltip
            :ui="{ content: 'w-54 flex flex-col h-auto p-0 gap-0' }"
            :delay-duration="100"
            :disable-closing-trigger="true"
          >
            <template #content>
              <UButton
                icon="i-lucide-log-out"
                size="sm"
                color="neutral"
                variant="link"
                class="w-full p-[10px]"
                @click="onSignOut"
              >
                Sign Out
              </UButton>
            </template>
            <div
              class="w-full flex items-center justify-between mt-2 pt-2 pb-2"
              :class="{ 'pl-2 pr-2': !isCollapsed }"
            >
              <div class="flex items-center">
                <UAvatar
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
              <UIcon
                v-if="!isCollapsed"
                name="i-lucide-ellipsis-vertical"
              />
            </div>
          </UTooltip>
        </div>
      </div>
    </aside>
    <div
      class="p-2 h-screen bg-white dark:bg-neutral-900 transition-all duration-300 overflow-hidden flex flex-col"
      :class="[isCollapsed ? 'sm:ml-15' : 'sm:ml-64']"
    >
      <slot />
    </div>
  </div>
</template>
