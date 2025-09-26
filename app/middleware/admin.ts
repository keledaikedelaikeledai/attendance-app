export default defineNuxtRouteMiddleware(async () => {
  // admin middleware logic here
  const { data: session } = await authClient.useSession(useFetch)

  if (!session.value || !session.value.user || !session.value.user.role || session.value.user.role !== 'admin') {
    return navigateTo('/403')
  }
})
