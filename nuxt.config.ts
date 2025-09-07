import process from 'node:process'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    dbUrl: process.env.NUXT_DB_URL,
    dbAuthToken: process.env.NUXT_DB_AUTH_TOKEN,
  },

  modules: [
    '@nuxt/ui',
    '@nuxt/fonts',
    '@vee-validate/nuxt',
    '@nuxthub/core',
    '@vueuse/nuxt',
  ],

  ui: {
    colorMode: false,
  },

  nitro: {
    experimental: {
      openAPI: true,
    },
  },

  hub: {
    bindings: {
      observability: {
        logs: true,
      },
    },
  },
})
