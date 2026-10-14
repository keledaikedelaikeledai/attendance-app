import process from 'node:process'
import * as Sentry from '@sentry/nuxt'

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: 0.2,

  // @ts-expect-error - accepted by the SDK at runtime; typings lag behind
  enableLogs: true,

  dataCollection: {},

  debug: false,
})
