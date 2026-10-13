// Limits agreed between the admin geofence form and the admin geofence API.
// The form checks them to keep Save disabled with a visible hint; the API
// re-checks them because the endpoints are callable directly.

export const GEOFENCE_MAX_RADIUS_METERS = 100000
export const GEOFENCE_MAX_NAME_LENGTH = 200
export const GEOFENCE_MAX_VERTICES = 512

// Unlike Number(''), an empty or blank string is not a zero here - a cleared
// form field must not silently become radius 0.
export function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number')
    return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s)
      return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function isValidGeofenceRadius(meters: unknown): boolean {
  const n = toFiniteNumber(meters)
  return n !== null && n > 0 && n <= GEOFENCE_MAX_RADIUS_METERS
}
