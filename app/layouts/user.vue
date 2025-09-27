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
  <div>
    <slot />

    <KeepAlive>
      <UDrawer
        direction="bottom"
        :handle="false"
        :open="true"
        :overlay="false"
        :modal="false"
      >
        <template #content>
          <UContainer class="py-2">
            <UNavigationMenu :items="items" highlight />
          </UContainer>
        </template>
      </UDrawer>
    </KeepAlive>
  </div>
</template>
