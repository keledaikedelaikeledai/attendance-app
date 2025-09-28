<script setup lang="ts">
const items = ref([
  {
    label: 'Home',
    icon: 'i-heroicons-home',
    to: '/',
    exact: true,
  },
  {
    label: 'Reports',
    icon: 'i-heroicons-chart-bar',
    to: '/report',
  },
  {
    label: 'Profile',
    icon: 'i-heroicons-user-circle',
    to: '/profile',
  },
])
</script>

<template>
  <UContainer class="py-8 space-y-8 pb-28 md:pb-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">
          Today's Attendance
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Manage your clock-in and clock-out with location.
        </p>
      </div>
      <div class="hidden md:block">
        <UNavigationMenu :items="items" highlight />
      </div>
    </div>

    <slot />

    <UDrawer
      direction="bottom"
      :handle="false"
      :open="true"
      :overlay="false"
      :modal="false"
      class="md:hidden"
    >
      <template #content>
        <UContainer>
          <UNavigationMenu
            :items="items"
            variant="pill"
            class="w-full"
            :ui="{ root: 'flex [&>div]:w-full', list: 'w-full', item: 'flex-1' }"
          >
            <template #item="{ item }">
              <div class="w-full flex flex-col justify-center items-center">
                <UIcon :name="item.icon" class="w-5 h-5 mb-1" />
                {{ item.label }}
              </div>
            </template>
          </UNavigationMenu>
        </UContainer>
      </template>
    </UDrawer>
  </UContainer>
</template>
