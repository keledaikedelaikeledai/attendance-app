export default defineNuxtRouteMiddleware(async (
  to,
) => {
  const { data: session } = await authClient.useSession(useFetch)

  const authMeta = to.meta.auth
  // if no auth meta, then route is auth only
  if (!authMeta) {
    if (!session.value) {
      if (to.path !== '/login') {
        return navigateTo('/login')
      }
    }
  }
  // if authMeta.unauthenticatedOnly is true, then route is guest only

  else if (authMeta.unauthenticatedOnly) {
    const navigateLink = authMeta?.navigateAuthenticatedTo || '/'
    if (session.value) {
      return navigateTo(navigateLink)
    }
  }

  // if authMeta.unauthenticatedOnly is false, then route is is open to all (both authenticated and unauthenticated users
})
