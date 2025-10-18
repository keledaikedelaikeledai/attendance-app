<script setup lang="ts">
const colorMode = useColorMode()

function toggle() {
  colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <UButton
    variant="ghost"
    color="neutral"
    size="sm"
    aria-label="Toggle color mode"
    @click="toggle"
  >
    <UIcon v-if="colorMode.preference === 'dark'" name="i-heroicons-sun" />
    <UIcon v-else name="i-heroicons-moon" />
  </UButton>
</template>
