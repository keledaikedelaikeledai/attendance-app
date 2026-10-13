import process from 'node:process'
import { createError } from 'h3'

// Admin APIs double-gate on Better Auth's admin role (the admin() plugin
// populates session.user.role) plus an optional email allowlist for
// defense in depth. Role is ALWAYS required - the inline copies this
// replaces returned true for every caller whenever NUXT_ADMIN_EMAILS was
// unset, which in practice meant these endpoints were open to any
// authenticated user, enforced only by the client-side page middleware.
export async function requireAdminUser(event: any) {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if ((session.user as any).role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  const raw = process.env.NUXT_ADMIN_EMAILS || ''
  const allowlist = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (allowlist.length && !allowlist.includes(String(session.user.email).toLowerCase()))
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return session
}
