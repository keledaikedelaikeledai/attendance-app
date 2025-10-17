export default defineNuxtRouteMiddleware(async (to) => {
  // If the logged in user is an admin, restrict them to /admin/** pages only.
  // Any attempt to open non-admin pages will redirect them to /admin.
  const { data: session } = await authClient.useSession(useFetch)

  const user = session?.value?.user
  if (!user)
    return

  if (user.role === 'admin') {
    // allow anything under /admin
    if (to.path.startsWith('/admin'))
      return

    // avoid redirect loops for some special pages
    const allowPaths = ['/403']
    if (allowPaths.includes(to.path))
      return

    return navigateTo('/admin')
  }
})
