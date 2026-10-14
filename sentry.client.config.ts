import * as Sentry from '@sentry/nuxt'

const dsn = useRuntimeConfig().public.sentry?.dsn as string | undefined

// Sentry is optional: the app must run without it. Without a DSN the SDK
// would still run its full tracing and replay instrumentation into the void -
// burning CPU on employees' phones and tripping web-vitals crashes (such as
// `reportAllChanges` reading `startTime` of undefined) with nowhere to send
// them. Skip init entirely instead. Every useErrorReporter call no-ops safely
// when init never ran.
if (dsn) {
  Sentry.init({
    dsn,

    tracesSampleRate: 0.2,

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [Sentry.replayIntegration()],

    // @ts-expect-error - accepted by the SDK at runtime; typings lag behind
    enableLogs: true,

    dataCollection: {},

    debug: false,
  })
}
