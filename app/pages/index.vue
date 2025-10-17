<script setup lang="ts">
definePageMeta({
  middleware: ['user'],
})
</script>

<template>
  <NuxtLayout name="user">
    <nuxt-page />
  </NuxtLayout>
</template>
