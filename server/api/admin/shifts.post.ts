import process from 'node:process'
import { eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { shift } from '~~/server/database/schemas'
import { trackServerEvent } from '../../../modules/error-reporting/runtime/server/utils/error-reporting'
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
    const log = useLogger()
    log.info({ action: 'create', code, label }, 'Shift created')
    trackServerEvent('admin.shift', { action: 'create', code })
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
    const log = useLogger()
    log.info({ action: 'delete', code }, 'Shift deleted')
    trackServerEvent('admin.shift', { action: 'delete', code })
    return { ok: true }
  }

  throw createError({ statusCode: 400, statusMessage: 'unknown action' })
})
