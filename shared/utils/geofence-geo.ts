// Geofence geometry math shared by the client guard (advisory, draws the
// modals) and the server enforcement (authoritative, rejects forged
// requests). One implementation so "inside" means the same thing on both
// sides of the wire.

export interface GeofenceLike {
  id?: string | null
  name?: string | null
  type?: 'point' | 'polygon' | string | null
  centerLat?: number | null
  centerLng?: number | null
  radiusMeters?: number | null
  /** Array of [lat, lng] pairs. */
  polygon?: Array<[number, number]> | null
  interactionMode?: 'disallow' | 'allow' | 'allow_with_comment' | string | null
  isActive?: boolean | null
}

export interface GeofenceEvaluation {
  allowed: boolean
  requireComment: boolean
  fence: GeofenceLike | null
  /** Distance in meters from the closest fence, null when unknown. */
  dist: number | null
  /** Whether the point is inside the closest fence, null when unknown. */
  inside: boolean | null
}

export function haversineMeters(a: [number, number], b: [number, number]) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function distanceToSegmentMeters(point: [number, number], a: [number, number], b: [number, number]) {
  const R = 6371000
  const lat0 = (point[0] * Math.PI) / 180
  const toXY = ([lat, lng]: [number, number]) => {
    const x = ((lng - point[1]) * Math.PI / 180) * Math.cos(lat0) * R
    const y = ((lat - point[0]) * Math.PI / 180) * R
    return { x, y }
  }
  const p = { x: 0, y: 0 }
  const aXY = toXY(a)
  const bXY = toXY(b)
  const dx = bXY.x - aXY.x
  const dy = bXY.y - aXY.y
  const len2 = dx * dx + dy * dy
  if (!len2) {
    return Math.sqrt((p.x - aXY.x) ** 2 + (p.y - aXY.y) ** 2)
  }
  let t = ((p.x - aXY.x) * dx + (p.y - aXY.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const projX = aXY.x + t * dx
  const projY = aXY.y + t * dy
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2)
}

export function pointInPolygon(point: [number, number], poly: Array<[number, number]>) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const curr = poly[i]
    const prev = poly[j]
    if (!curr || !prev)
      continue
    const xi = curr[1]
    const yi = curr[0]
    const xj = prev[1]
    const yj = prev[0]
    const intersect = ((yi > point[0]) !== (yj > point[0])) && (point[1] < ((xj - xi) * (point[0] - yi)) / (yj - yi) + xi)
    if (intersect)
      inside = !inside
  }
  return inside
}

export function distanceToPolygonMeters(point: [number, number], poly: Array<[number, number]>) {
  if (!poly.length)
    return Infinity
  if (pointInPolygon(point, poly))
    return 0
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b)
      continue
    const dist = distanceToSegmentMeters(point, a, b)
    if (dist < min)
      min = dist
  }
  return min
}

export function formatDistance(meters?: number | null) {
  if (meters == null)
    return ''
  if (meters < 1000)
    return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

function getClosestActiveGeofence(lat: number, lng: number, geofences: GeofenceLike[]) {
  const active = geofences.filter(g => g?.isActive)
  if (!active.length)
    return null
  let best: { fence: GeofenceLike, dist: number, inside: boolean } | null = null
  for (const fence of active) {
    let dist = Infinity
    let inside = false
    if (fence.type === 'point' && typeof fence.centerLat === 'number' && typeof fence.centerLng === 'number') {
      dist = haversineMeters([lat, lng], [fence.centerLat, fence.centerLng])
      inside = typeof fence.radiusMeters === 'number' ? dist <= fence.radiusMeters : false
    }
    else if (fence.type === 'polygon' && Array.isArray(fence.polygon) && fence.polygon.length >= 3) {
      inside = pointInPolygon([lat, lng], fence.polygon)
      dist = distanceToPolygonMeters([lat, lng], fence.polygon)
    }
    if (!best || dist < best.dist)
      best = { fence, dist, inside }
  }
  return best
}

// Mirrors the client guard's decision table exactly: no fences -> open;
// closest active fence by distance; `allow` records the fence without
// blocking; inside is always fine; `allow_with_comment` lets an outside
// point through only with a comment; `disallow` blocks with the distance
// detail. Missing coords yields "allowed" here - whether that is a policy
// failure is the caller's call (the server treats it as one).
export function evaluateGeofence(lat: number | undefined, lng: number | undefined, geofences: GeofenceLike[]): GeofenceEvaluation {
  if (!geofences.length || typeof lat !== 'number' || typeof lng !== 'number')
    return { allowed: true, requireComment: false, fence: null, dist: null, inside: null }
  const closest = getClosestActiveGeofence(lat, lng, geofences)
  if (!closest)
    return { allowed: true, requireComment: false, fence: null, dist: null, inside: null }
  const { fence, dist, inside } = closest
  const mode = fence.interactionMode || 'disallow'
  if (mode === 'allow' || inside)
    return { allowed: true, requireComment: false, fence, dist, inside }
  if (mode === 'allow_with_comment')
    return { allowed: true, requireComment: true, fence, dist, inside }
  return { allowed: false, requireComment: false, fence, dist, inside }
}
