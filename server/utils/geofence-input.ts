// One parse/validate pass shared by the admin geofence create and update
// endpoints. Rejects with a 400 whose statusMessage doubles as the toast the
// admin sees, and never silently "fixes" bad input: a zero or negative radius,
// a flipped [lng, lat] polygon or an unbounded vertex list all read as valid
// data downstream, so they must not be stored.

import { createError } from 'h3'
import {
  GEOFENCE_MAX_NAME_LENGTH,
  GEOFENCE_MAX_RADIUS_METERS,
  GEOFENCE_MAX_VERTICES,
  isValidGeofenceRadius,
  toFiniteNumber,
} from '~~/shared/utils/geofence'

export interface GeofenceInput {
  name: string
  isActive: boolean
  interactionMode: 'disallow' | 'allow' | 'allow_with_comment'
  type: 'point' | 'polygon'
  centerLat: number | null
  centerLng: number | null
  radiusMeters: number | null
  polygon: Array<[number, number]> | null
}

export function parseGeofenceInput(body: any): GeofenceInput {
  const isActive = Boolean(body?.isActive)
  const interactionMode = body?.interactionMode === 'allow_with_comment'
    ? 'allow_with_comment'
    : body?.interactionMode === 'allow'
      ? 'allow'
      : 'disallow'
  const type = body?.type === 'polygon' ? 'polygon' : 'point'

  const rawName = typeof body?.name === 'string' ? body.name.trim() : ''
  if (rawName.length > GEOFENCE_MAX_NAME_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `Name must be at most ${GEOFENCE_MAX_NAME_LENGTH} characters` })
  }
  const name = rawName || 'Untitled geofence'

  const centerLat = toFiniteNumber(body?.centerLat)
  const centerLng = toFiniteNumber(body?.centerLng)
  if (centerLat !== null && (centerLat < -90 || centerLat > 90)) {
    throw createError({ statusCode: 400, statusMessage: 'Latitude must be between -90 and 90' })
  }
  if (centerLng !== null && (centerLng < -180 || centerLng > 180)) {
    throw createError({ statusCode: 400, statusMessage: 'Longitude must be between -180 and 180' })
  }

  if (type === 'point') {
    if (centerLat === null || centerLng === null) {
      throw createError({ statusCode: 400, statusMessage: 'Center lat/lng are required for point mode' })
    }
    if (!isValidGeofenceRadius(body?.radiusMeters)) {
      throw createError({ statusCode: 400, statusMessage: `Radius must be between 1 and ${GEOFENCE_MAX_RADIUS_METERS} meters for point mode` })
    }
  }

  const polygon = parsePolygon(body?.polygon)
  if (type === 'polygon' && polygon.length < 3) {
    throw createError({ statusCode: 400, statusMessage: 'Polygon requires at least 3 points' })
  }

  return {
    name,
    isActive,
    interactionMode,
    type,
    centerLat: type === 'point' ? centerLat : null,
    centerLng: type === 'point' ? centerLng : null,
    radiusMeters: type === 'point' ? toFiniteNumber(body?.radiusMeters) : null,
    polygon: type === 'polygon' ? polygon : null,
  }
}

function parsePolygon(raw: any): Array<[number, number]> {
  if (!Array.isArray(raw))
    return []
  if (raw.length > GEOFENCE_MAX_VERTICES) {
    throw createError({ statusCode: 400, statusMessage: `Polygon supports at most ${GEOFENCE_MAX_VERTICES} vertices` })
  }
  const points: Array<[number, number]> = []
  for (const p of raw) {
    if (!Array.isArray(p) || p.length < 2)
      continue
    const lat = Number(p[0])
    const lng = Number(p[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
      continue
    // Storage order is [lat, lng]. A GeoJSON-style [lng, lat] pair would be
    // stored silently reversed and render on the wrong side of the world, and
    // Jakarta coordinates (lng ~107) are outside the latitude range, so reject
    // anything that cannot be parsed as [lat, lng].
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw createError({ statusCode: 400, statusMessage: 'Polygon points must be [lat, lng] pairs within lat -90..90 and lng -180..180' })
    }
    points.push([lat, lng])
  }
  return points
}
