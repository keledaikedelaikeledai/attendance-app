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
    // '@nuxthub/core',
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

  // Ensure imports of @libsql/client and drizzle's libsql adapter resolve to the
  // pure-JS web entrypoints during build. This prevents bundlers from pulling in
  // native libsql binaries (eg. @libsql/linux-arm64-gnu) when building for
  // non-native/ARM targets.
  // vite: {
  //   resolve: {
  //     alias: {
  //       '@libsql/client': '@libsql/client/web',
  //       'drizzle-orm/libsql': 'drizzle-orm/libsql/web',
  //     },
  //   },
  // },

  // hub: {
  //   bindings: {
  //     observability: {
  //       logs: true,
  //     },
  //   },
  // },
})
