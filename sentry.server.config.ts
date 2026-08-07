import process from 'node:process'
import * as Sentry from '@sentry/nuxt'

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: 0.2,

  enableLogs: true,

  dataCollection: {},

  debug: false,
})
