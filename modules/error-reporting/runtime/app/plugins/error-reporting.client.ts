import * as Sentry from '@sentry/nuxt'

export default defineNuxtPlugin(async () => {
  const { data: session } = await authClient.useSession(useFetch)

  watch(session, (s) => {
    if (s?.user) {
      Sentry.setUser({
        id: s.user.id,
        email: s.user.email ?? undefined,
        username: s.user.username ?? undefined,
      })
    }
    else {
      Sentry.setUser(null)
    }
  }, { immediate: true })
})
