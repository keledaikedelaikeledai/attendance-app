export default defineEventHandler(async (event) => {
  try {
    const { auth } = await import('../../utils/auth')

    const session = await auth.api.getSession({ headers: event.node.req.headers as any })
    return {
      ok: true,
      provider: 'better-auth',
      authenticated: Boolean(session?.user),
      user: session?.user
        ? {
            id: session.user.id,
            email: (session.user as any).email ?? null,
            username: (session.user as any).username ?? null,
          }
        : null,
      timestamp: new Date().toISOString(),
    }
  }
  catch (err: any) {
    return {
      ok: false,
      provider: 'better-auth',
      authenticated: false,
      error: err?.message || String(err),
      timestamp: new Date().toISOString(),
    }
  }
})
