import * as Sentry from '@sentry/nuxt'

export function trackServerEvent(name: string, data?: Record<string, unknown>) {
  Sentry.addBreadcrumb({ category: 'server', message: name, data, level: 'info' })
  Sentry.captureMessage(name, 'info')
}

export function trackServerException(error: unknown, context?: Record<string, unknown>) {
  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context))
        scope.setContext(key, value as any)
      Sentry.captureException(error)
    })
  }
  else {
    Sentry.captureException(error)
  }
}
