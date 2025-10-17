<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

// const { menus } = defineProps<{
//   menus?: any
// }>()

const route = useRoute()

const isCollapsed = useState('admin-is-collapsed')

const menus = computed<NavigationMenuItem[]>(() => [
  { label: 'Menus', type: 'label', hidden: true },
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/admin', exact: true },
  { label: 'Users', icon: 'i-heroicons-users', to: '/admin/users' },
  { label: 'Attendance', icon: 'i-heroicons-calendar-days', to: '/admin/attendance' },
  { label: 'Shifts', icon: 'i-heroicons-clock', to: '/admin/shifts' },
])
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
          <div class="w-[60vw] p-4">
            <UNavigationMenu
              orientation="vertical"
              :items="menus"
              class="data-[orientation=vertical]:w-full flex-1 overflow-y-auto"
            />
          </div>
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
      <!-- <LocaleToggler /> -->
      <!-- <ClientOnly> -->
      <!--   <ColorModeToggler /> -->
      <!-- </ClientOnly> -->
    </template>
  </HeaderColumn>
  <div class="p-2 border-2 border-neutral-200 border-dashed rounded-lg dark:border-neutral-700 flex-1 overflow-auto">
    <slot />
  </div>
</template>
