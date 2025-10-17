<template>
  <UApp :toaster="{ position: 'top-center' }">
    <nuxt-layout>
      <NuxtPage />
    </nuxt-layout>
  </UApp>
</template>

<style>
html, body, #__nuxt {
  /* allow the document to grow beyond the viewport so backgrounds cover long pages */
  min-height: 100%;
}

body {
  /* Use UI color variables so the background/text change with color mode */
  font-family: "Plus Jakarta Sans", sans-serif;
  transition: background-color 200ms ease, color 200ms ease;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Ensure the app wrapper fills the viewport so background is visible */
.u-app {
  min-height: 100vh;
}
</style>
