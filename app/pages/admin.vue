<script setup lang="ts">
import type { NavigationMenuItem } from '@sewadah/selaras/types'

const isCollapsed = useState('admin-is-collapsed', () => false)

const menus = computed<NavigationMenuItem[]>(() => [
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/admin' },
  { label: 'Users', icon: 'i-heroicons-users', to: '/admin/users' },
  { label: 'Attendance', icon: 'i-heroicons-calendar-days', to: '/admin/attendance' },
  { label: 'Shifts', icon: 'i-heroicons-clock', to: '/admin/shifts' },
  { label: 'Geofence', icon: 'i-heroicons-map-pin', to: '/admin/geofence' },
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
