<template>
  <SApp>
    <nuxt-layout>
      <NuxtPage />
    </nuxt-layout>
    <!-- SApp only establishes the Toast context; the renderer is placed here.
         ClientOnly because toasts are client-triggered. -->
    <ClientOnly>
      <SToast position="top-center" />
    </ClientOnly>
  </SApp>
</template>

<style>
html, body, #__nuxt {
  /* allow the document to grow beyond the viewport so backgrounds cover long pages */
  min-height: 100%;
}

#__nuxt {
  /* Selaras' SApp renders no wrapper element (it is providers + slot only),
     so this replaces Nuxt UI's `.u-app { min-height: 100vh }`. */
  min-height: 100vh;
}

body {
  /* Use UI color variables so the background/text change with color mode */
  font-family: "Plus Jakarta Sans", sans-serif;
  transition: background-color 200ms ease, color 200ms ease;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
