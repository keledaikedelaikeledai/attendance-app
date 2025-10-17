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
    '@vueuse/nuxt',
    '@nuxtjs/leaflet',
  ],

  ui: {
    // enable color mode so the UI package can manage light/dark themes
    // set to true to use the default color-mode behavior (you can later customize this)
    colorMode: true,
  },

  nitro: {
    experimental: {
      openAPI: true,
    },
  },
})
