<script setup lang="ts">
const colorMode = useColorMode()

function toggle() {
  colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <SButton
    variant="ghost"
    color="neutral"
    size="sm"
    aria-label="Toggle color mode"
    @click="toggle"
  >
    <SIcon v-if="colorMode.preference === 'dark'" name="i-heroicons-sun" />
    <SIcon v-else name="i-heroicons-moon" />
  </SButton>
</template>
