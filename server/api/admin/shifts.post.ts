import process from 'node:process'
import { eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { shift } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'

function isAllowedAdmin(email?: string | null) {
  const raw = process.env.NUXT_ADMIN_EMAILS || ''
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (!list.length)
    return true
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

  const body = await readBody(event)
  const { action } = body as any
  const db = useDb()

  if (action === 'create') {
    const { code, label, start, end, active = true, sortOrder = 0 } = body as any
    if (!code || !label || !start || !end)
      throw createError({ statusCode: 400, statusMessage: 'missing fields' })
    await db.insert(shift).values({ code, label, start, end, active: !!active, sortOrder: Number(sortOrder), createdAt: new Date(), updatedAt: new Date() } as any)
    const [row] = await db.select().from(shift).where(eq(shift.code, code)).limit(1)
    return row
  }

  if (action === 'update') {
    const { code, label, start, end, active = true, sortOrder = 0 } = body as any
    if (!code)
      throw createError({ statusCode: 400, statusMessage: 'code required' })
    await db.update(shift).set({ label, start, end, active: !!active, sortOrder: Number(sortOrder), updatedAt: new Date() } as any).where(eq(shift.code, code))
    const [row] = await db.select().from(shift).where(eq(shift.code, code)).limit(1)
    return row
  }

  if (action === 'delete') {
    const { code } = body as any
    if (!code)
      throw createError({ statusCode: 400, statusMessage: 'code required' })
    await db.delete(shift).where(eq(shift.code, code))
    return { ok: true }
  }

  throw createError({ statusCode: 400, statusMessage: 'unknown action' })
})
