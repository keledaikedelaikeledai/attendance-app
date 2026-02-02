import process from 'node:process'
import { eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { geoFence } from '~~/server/database/schemas'
import { useDb } from '../../utils/db'

type GeofenceType = 'point' | 'polygon'

function isAllowedAdmin(email?: string | null) {
  const raw = process.env.NUXT_ADMIN_EMAILS || ''
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (!list.length)
    return true
  if (!email)
    return false
  return list.includes(String(email).toLowerCase())
}

function toNumberOrNull(v: any) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export default defineEventHandler(async (event) => {
  const auth = useBetterAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as any })
  if (!session?.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (!isAllowedAdmin(session.user.email))
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const body = await readBody<any>(event)
  const isActive = Boolean(body?.isActive)
  const interactionMode: 'disallow' | 'allow' | 'allow_with_comment' = body?.interactionMode === 'allow_with_comment'
    ? 'allow_with_comment'
    : body?.interactionMode === 'allow'
      ? 'allow'
      : 'disallow'
  const type: GeofenceType = body?.type === 'polygon' ? 'polygon' : 'point'
  const radiusMeters = toNumberOrNull(body?.radiusMeters)
  const centerLat = toNumberOrNull(body?.centerLat)
  const centerLng = toNumberOrNull(body?.centerLng)
  const polygonRaw = Array.isArray(body?.polygon) ? body.polygon : []

  let polygon: Array<[number, number]> = []
  if (polygonRaw.length) {
    polygon = polygonRaw
      .map((p: any) => Array.isArray(p) && p.length >= 2 ? [Number(p[0]), Number(p[1])] as [number, number] : null)
      .filter((p: any) => Array.isArray(p) && p.every(q => Number.isFinite(q))) as Array<[number, number]>
  }

  if (type === 'point' && (centerLat == null || centerLng == null)) {
    throw createError({ statusCode: 400, statusMessage: 'Center lat/lng are required for point mode' })
  }
  if (type === 'polygon' && polygon.length < 3) {
    throw createError({ statusCode: 400, statusMessage: 'Polygon requires at least 3 points' })
  }

  const db = useDb()
  const [existing] = await db.select().from(geoFence).where(eq(geoFence.id, 'global')).limit(1)
  const payload = {
    id: existing?.id || 'global',
    name: existing?.name || 'Global',
    isActive,
    type,
    centerLat: type === 'point' ? centerLat : null,
    centerLng: type === 'point' ? centerLng : null,
    radiusMeters: radiusMeters != null ? radiusMeters : null,
    polygon: type === 'polygon' ? polygon : null,
    interactionMode,
    updatedAt: new Date(),
  }

  if (existing) {
    await db.update(geoFence).set(payload).where(eq(geoFence.id, existing.id))
  }
  else {
    await db.insert(geoFence).values({ ...payload, createdAt: new Date() })
  }

  const [config] = await db.select().from(geoFence).where(eq(geoFence.id, 'global')).limit(1)
  return { config }
})
