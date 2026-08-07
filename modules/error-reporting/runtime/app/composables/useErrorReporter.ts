import * as Sentry from '@sentry/nuxt'

export function useErrorReporter() {
  return {
    captureException: (error: unknown, context?: Record<string, unknown>) => {
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
    },
    captureMessage: (message: string, level: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug' = 'info') => {
      Sentry.captureMessage(message, level)
    },
    trackEvent: (name: string, data?: Record<string, unknown>) => {
      Sentry.addBreadcrumb({ category: 'app', message: name, data, level: 'info' })
      Sentry.captureMessage(name, 'info')
    },
    setUser: (user: { id: string, email?: string, username?: string }) => {
      Sentry.setUser(user)
    },
    removeUser: () => {
      Sentry.setUser(null)
    },
    setTag: (key: string, value: string) => {
      Sentry.setTag(key, value)
    },
  }
}
