import process from 'node:process'
import { desc } from 'drizzle-orm'
import { createError } from 'h3'
import { user } from '../../database/schema'
import { useDb } from '../../utils/db'

function isAllowedAdmin(email?: string | null) {
  const raw = process.env.NUXT_ADMIN_EMAILS || ''
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (!list.length)
    return true // if not configured, allow any authenticated user (dev-friendly)
  if (!email)
    return false
  return list.includes(String(email).toLowerCase())
}

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (!isAllowedAdmin(session.user.email))
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const db = useDb()
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, username: user.username, createdAt: user.createdAt })
    .from(user)
    .orderBy(desc(user.createdAt))

  return rows
})
