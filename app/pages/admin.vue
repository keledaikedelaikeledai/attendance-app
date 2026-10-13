<script setup lang="ts">
definePageMeta({
  middleware: ['admin'],
})
</script>

<template>
  <nuxt-layout name="admin">
    <nuxt-page v-slot="{ Component }">
      <component :is="Component" />
    </nuxt-page>
  </nuxt-layout>
</template>
