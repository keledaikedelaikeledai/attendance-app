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
    '@nuxtjs/i18n',
  ],

  ui: {
    // enable color mode so the UI package can manage light/dark themes
    // set to true to use the default color-mode behavior (you can later customize this)
    colorMode: true,
  },

  // Internationalization (i18n) - lazy loaded locales
  i18n: {
    // default locale shown when no prefix is present
    defaultLocale: 'en',
    // locales and the corresponding files (langDir)
    locales: [
      { code: 'en', file: 'en.json', name: 'English' },
      { code: 'id', file: 'id.json', name: 'Indonesian' },
    ],
    // enable lazy loading from the default `i18n/locales/` directory
    // lazy: true,
    // detect browser language and persist user selection in a cookie
    detectBrowserLanguage: {
      // use a cookie to remember user preference
      useCookie: true,
      // cookie name used by the module
      cookieKey: 'i18n_redirected',
      // fallback when detection fails
      fallbackLocale: 'en',
      // when to redirect: 'root' will redirect only the root path
      redirectOn: 'root',
      // do not always redirect (only when appropriate)
      alwaysRedirect: false,
      // allow cross-origin cookie usage if needed (keep false by default)
      cookieCrossOrigin: false,
    },
    // keep the default strategy; ensure defaultLocale is set
    strategy: 'no_prefix',
    // vueI18n configuration should be provided via a config file path (vueI18n: 'path')
    // or left unset when using lazy-loaded locale files. We omit it here to avoid
    // the module attempting to resolve an object as a file path.
  },

  nitro: {
    experimental: {
      openAPI: true,
    },
  },
})
