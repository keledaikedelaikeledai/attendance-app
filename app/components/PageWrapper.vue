<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'
import { useI18n } from 'vue-i18n'

const route = useRoute()

// get current user session for profile/avatar in mobile drawer
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

const isCollapsed = useState('admin-is-collapsed')

const menus = computed<NavigationMenuItem[]>(() => [
  { label: 'Menus', type: 'label', hidden: true },
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/admin', exact: true },
  { label: 'Users', icon: 'i-heroicons-users', to: '/admin/users' },
  { label: 'Attendance', icon: 'i-heroicons-calendar-days', to: '/admin/attendance' },
  { label: 'Shifts', icon: 'i-heroicons-clock', to: '/admin/shifts' },
])

// locales available (kept in sync with nuxt.config i18n locales)
const availableLocales = [
  { code: 'en', name: 'English' },
  { code: 'id', name: 'Indonesian' },
]

const { locale, setLocale } = useI18n()

const localeItems = computed<DropdownMenuItem[]>(() => {
  // determine current locale from the nuxt-i18n `locale` ref
  let currentLocale: string | undefined
  const composerLocale = locale as any
  if (composerLocale && typeof composerLocale === 'object' && 'value' in composerLocale) {
    currentLocale = composerLocale.value
  }
  else if (typeof composerLocale === 'string') {
    currentLocale = composerLocale
  }

  return availableLocales.map(l => ({
    label: l.name,
    value: l.code,
    // leading language icon
    icon: `i-circle-flags-${l.code}`,
    // use the checkbox item type from Nuxt UI so the check appears on the right
    type: 'checkbox',
    checked: l.code === currentLocale,
    // handler invoked when the checkbox is toggled
    onUpdateChecked(checked: boolean) {
      if (!checked) return
      // use nuxt-i18n setLocale to trigger lazy loading, hooks and cookie update
      try {
        void (setLocale as any)(l.code)
      }
      catch {
      }
    },
    // prevent default navigation behavior (checkbox items usually prevent links)
    onSelect(e: Event) {
      e.preventDefault()
    },
  }))
})
</script>

<template>
  <HeaderColumn class="mb-2 flex-none">
    <template #left>
      <UDrawer
        class="sm:hidden"
        direction="left"
        as="aside"
        :handle="false"
      >
        <UButton
          icon="i-lucide-menu"
          class="w-8 h-8"
          color="neutral"
          variant="ghost"
        />
        <template #content>
          <!-- <div class="w-[60vw] p-4"> -->
          <div class="h-screen flex flex-col px-3 py-4 bg-zinc-100 dark:bg-neutral-800">
            <div class="flex flex-col items-center justify-center mb-6">
              <img src="/logo-app.png" alt="App Logo" class="mx-auto w-[150px] h-auto mb-4">
            </div>

            <UNavigationMenu
              orientation="vertical"
              :items="menus"
              class="data-[orientation=vertical]:w-full flex-1 overflow-y-auto"
            />

            <div class="flex flex-col pl-1 pr-2 mt-4">
              <USeparator />
              <UPopover :ui="{ content: 'w-54 flex flex-col h-auto p-0 gap-0' }" trigger="click">
                <template #content>
                  <UButton
                    icon="i-lucide-user-circle"
                    size="sm"
                    color="neutral"
                    variant="link"
                    class="w-full p-[10px]"
                    to="/admin/profile"
                  >
                    Profile
                  </UButton>
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

                <UButton
                  color="neutral"
                  variant="ghost"
                  class="w-full flex items-center justify-between mt-2 pt-2 pb-2 p-0"
                  aria-label="User menu"
                >
                  <div class="flex items-center">
                    <UAvatar
                      :src="user?.user.image || undefined"
                      :alt="user?.user.username || 'User Avatar'"
                      size="lg"
                      class="border border-neutral-300 dark:border-neutral-700"
                    />
                    <span v-if="true" class="text-xs ml-2">
                      {{ user?.user.name }}
                    </span>
                  </div>
                  <UIcon name="i-lucide-ellipsis-vertical" />
                </UButton>
              </UPopover>
            </div>
          </div>
          <!-- </div> -->
        </template>
      </UDrawer>
      <UButton
        :icon="isCollapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
        class="w-8 h-8 hidden sm:block"
        color="neutral"
        variant="ghost"
        @click="isCollapsed = !isCollapsed"
      />
      <title>{{ route.meta.pageTitle }}</title>
      <h1 class="font-semibold">
        {{ route.meta.title }}
      </h1>
      <slot name="navLeft" />
    </template>
    <template #middle>
      <slot name="navMiddle" />
    </template>
    <template #right>
      <slot name="navRight" />
      <ClientOnly>
        <UDropdownMenu :items="localeItems" :content="{ align: 'end' }" :ui="{ content: 'w-48' }">
          <UButton
            icon="i-heroicons-language"
            class="w-8 h-8"
            color="neutral"
            variant="ghost"
            aria-label="Language"
          />
        </UDropdownMenu>
      </ClientOnly>

      <UColorModeButton />
    </template>
  </HeaderColumn>
  <div class="p-2 border-2 border-neutral-200 border-dashed rounded-lg dark:border-neutral-700 flex-1 overflow-auto">
    <slot />
  </div>
</template>
