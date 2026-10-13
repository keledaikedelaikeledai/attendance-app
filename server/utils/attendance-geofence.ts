import type { GeofenceLike } from '~~/shared/utils/geofence-geo'
import { createError } from 'h3'
import { geoFence } from '~~/server/database/schemas'
import { evaluateGeofence, formatDistance } from '~~/shared/utils/geofence-geo'
import { useDb } from './db'

export interface ClockGeofenceResult {
  geofenceId: string | null
  geofenceName: string | null
}

// Server-side geofence enforcement for the clock endpoints. The client's
// guard is advisory only - nothing stopped a hand-crafted request from
// claiming membership of any fence, or omitting coordinates altogether.
// This loads the fences, applies the same evaluation and either throws
// (403) or returns the fence the SERVER matched. Clock logs must record
// that fence, never the client-supplied id/name.
export async function resolveGeofenceForClock(coords?: { latitude?: number, longitude?: number }, comment?: string | null): Promise<ClockGeofenceResult> {
  const db = useDb()
  const rows = await db.select().from(geoFence)
  const fences: GeofenceLike[] = (rows || []).map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    centerLat: r.centerLat,
    centerLng: r.centerLng,
    radiusMeters: r.radiusMeters,
    polygon: (r.polygon ?? null) as Array<[number, number]> | null,
    interactionMode: r.interactionMode,
    isActive: r.isActive,
  }))
  const hasActiveFences = fences.some(f => f.isActive)
  const lat = typeof coords?.latitude === 'number' ? coords.latitude : undefined
  const lng = typeof coords?.longitude === 'number' ? coords.longitude : undefined

  // Active fences make location mandatory - a coordinate-less clock would
  // be unverifiable and the client already refuses to send one.
  if (hasActiveFences && (lat === undefined || lng === undefined))
    throw createError({ statusCode: 403, statusMessage: 'Location is required to clock in/out.' })

  const ev = evaluateGeofence(lat, lng, fences)
  if (!ev.allowed) {
    const detail = ev.fence?.type === 'point' && typeof ev.fence?.radiusMeters === 'number'
      ? `You are outside the allowed radius (${formatDistance(ev.dist)} away, limit ${formatDistance(ev.fence.radiusMeters)}). Move closer to the allowed location.`
      : 'You are outside the allowed area. Move inside the allowed location to clock in/out.'
    throw createError({ statusCode: 403, statusMessage: detail })
  }
  if (ev.requireComment && !comment?.trim())
    throw createError({ statusCode: 403, statusMessage: 'You are outside the allowed area. Please add a comment to continue.' })

  const fence = ev.fence
  return {
    geofenceId: fence?.id ?? null,
    geofenceName: fence?.name ?? null,
  }
}
