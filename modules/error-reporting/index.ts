import process from 'node:process'
import { defu } from 'defu'
import { addImports, addPlugin, createResolver, defineNuxtModule } from 'nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'error-reporting' },
  moduleDependencies: {
    '@sentry/nuxt/module': {},
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)

    nuxt.options.runtimeConfig.public.sentry = defu(
      nuxt.options.runtimeConfig.public.sentry,
      { dsn: process.env.NUXT_PUBLIC_SENTRY_DSN },
    )

    addImports({
      name: 'useErrorReporter',
      from: resolver.resolve('runtime/app/composables/useErrorReporter'),
    })

    addPlugin(resolver.resolve('runtime/app/plugins/error-reporting.client.ts'))
  },
})
