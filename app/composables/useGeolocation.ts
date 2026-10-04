export type GeoPermission = 'prompt' | 'granted' | 'denied' | 'unsupported'

export interface GeoCoords {
  lat?: number
  lng?: number
  accuracy?: number
}

// Module-level state, shared across every consumer for the lifetime of the
// app session - the same pattern useAttendance uses. The browser remembers a
// granted geolocation permission, but this page used to forget everything on
// every visit: its coords, support flag and permission status were page-local
// refs, so navigating away and back reset them, re-ran getCurrentPosition and
// tore the map down and up again. Keeping them here means the second visit
// already knows the answer and renders the cached position instantly.
//
// Freshness is not at risk: every clock action takes its own fix through
// requestLocationOnce before posting, and the Refresh button re-runs it on
// demand. This cache only feeds the display.
const geoSupported = ref<boolean>(false)
const permissionStatus = ref<GeoPermission>('prompt')
const coords = ref<GeoCoords>({})
const locating = ref<boolean>(false)
const geoError = ref<string | null>(null)
// Human-readable locality for the fix, resolved lazily from Nominatim (free,
// no key). Display-only: a failed lookup leaves lat/lng untouched, and the
// position flow never waits for it.
const address = ref<string | null>(null)
const addressCache = new Map<string, string>()
let addressPendingKey: string | null = null

function addressKey(lat: number, lng: number) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

async function resolveAddress(lat: number, lng: number) {
  const key = addressKey(lat, lng)
  const hit = addressCache.get(key)
  if (hit) {
    address.value = hit
    return
  }
  if (addressPendingKey === key)
    return
  addressPendingKey = key
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`)
    if (!res.ok)
      return
    const data = await res.json()
    const short = typeof data?.display_name === 'string'
      ? data.display_name.split(',').slice(0, 2).join(',').trim()
      : null
    if (!short)
      return
    addressCache.set(key, short)
    // Only apply if the fix has not moved on while the lookup was in flight.
    const c = coords.value
    if (typeof c.lat === 'number' && typeof c.lng === 'number' && addressKey(c.lat, c.lng) === key)
      address.value = short
  }
  catch {
    // Silent by design. The coordinates are the source of truth; the address
    // line simply does not render.
  }
  finally {
    if (addressPendingKey === key)
      addressPendingKey = null
  }
}

async function requestLocationOnce() {
  geoError.value = null
  if (!('geolocation' in navigator)) {
    geoSupported.value = false
    permissionStatus.value = 'unsupported'
    return
  }
  geoSupported.value = true
  locating.value = true
  return new Promise<void>((resolve) => {
    navigator.geolocation.getCurrentPosition((pos) => {
      coords.value = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
      locating.value = false
      // Fire and forget: the address line fills in when it arrives.
      void resolveAddress(pos.coords.latitude, pos.coords.longitude)
      resolve()
    }, (err) => {
      geoError.value = err.message
      locating.value = false
      useErrorReporter().captureException(err, { context: 'geolocation' })
      resolve()
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 })
  })
}

async function ensurePermission() {
  if (!('permissions' in navigator)) {
    await requestLocationOnce()
    return
  }
  try {
    const status = await (navigator as any).permissions.query({ name: 'geolocation' })
    permissionStatus.value = status.state
    if (status.state === 'granted') {
      await requestLocationOnce()
    }
    else if (status.state === 'prompt') {
      await requestLocationOnce()
      const status2 = await (navigator as any).permissions.query({ name: 'geolocation' })
      permissionStatus.value = status2.state
    }
    status.onchange = () => {
      permissionStatus.value = status.state
    }
  }
  catch {
    await requestLocationOnce()
  }
}

export function useGeolocation() {
  return {
    geoSupported,
    permissionStatus,
    coords,
    locating,
    geoError,
    address,
    requestLocationOnce,
    ensurePermission,
  }
}
