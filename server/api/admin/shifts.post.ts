import { eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { shift } from '~~/server/database/schemas'
import { trackServerEvent } from '../../../modules/error-reporting/runtime/server/utils/error-reporting'
import { requireAdminUser } from '../../utils/admin-access'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

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
