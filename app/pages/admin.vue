<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const isCollapsed = useState('admin-is-collapsed', () => false)

const menus = computed<NavigationMenuItem[]>(() => [
  { label: 'Menus', type: 'label' },
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/admin', exact: true },
  { label: 'Users', icon: 'i-heroicons-users', to: '/admin/users' },
  { label: 'Attendance', icon: 'i-heroicons-calendar-days', to: '/admin/attendance' },
  { label: 'Attendance (new)', icon: 'i-heroicons-calendar-days', to: '/admin/attendance-new' },
])

definePageMeta({
  middleware: ['admin'],
})
</script>

<template>
  <nuxt-layout :is-collapsed="isCollapsed" name="admin" :menus="menus">
    <nuxt-page v-slot="{ Component }">
      <component :is="Component" />
    </nuxt-page>
  </nuxt-layout>
</template>
