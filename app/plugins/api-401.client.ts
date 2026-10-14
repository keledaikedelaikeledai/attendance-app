// A parked page outlives its session. The auth middleware only session-checks
// on route navigation, so once the session expires server-side (cookie still
// present, record dead), every API call comes back 401 and the page sits in
// its per-fetch error slot forever - no logout, no redirect, silent polling.
//
// This plugin installs an app-wide $fetch (which useFetch and $fetch inside
// the app use) that reacts to any 401 from the app API: clear the dead
// session client-side and land on the login page with an explicit "session
// expired" notice. Better Auth's own /api/auth/* endpoints are excluded so a
// failed login attempt never bounces the user.
let redirecting = false

export default defineNuxtPlugin((nuxtApp) => {
  const api401Fetch = globalThis.$fetch.create({
    onResponseError({ response }) {
      if (response.status !== 401 || redirecting)
        return
      const path = response.url ?? ''
      if (path.includes('/api/auth/'))
        return
      redirecting = true
      // Best-effort: signOut clears the stale cookie server-side. It can
      // itself fail against a dead session - that is fine, navigating is
      // the point.
      authClient.signOut().finally(() => {
        nuxtApp.runWithContext(() => {
          navigateTo('/login?expired=1')
        })
      })
    },
  })

  // Any completed navigation resets the latch, so the next (re)login gets a
  // working expiry detector instead of a one-shot.
  nuxtApp.$router.afterEach(() => {
    redirecting = false
  })

  return {
    provide: {
      fetch: api401Fetch,
    },
  }
})
