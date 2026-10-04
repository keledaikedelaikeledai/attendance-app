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
    requestLocationOnce,
    ensurePermission,
  }
}
