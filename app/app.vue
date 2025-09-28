<template>
  <UApp :toaster="{ position: 'top-center' }">
    <nuxt-layout>
      <NuxtPage />
    </nuxt-layout>
  </UApp>
</template>

<style>
body {
  background-color: var(--u-bg);
  font-family: "Plus Jakarta Sans", sans-serif;
}
</style>
