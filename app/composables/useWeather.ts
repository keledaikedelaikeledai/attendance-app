// Current-conditions chip fed by Open-Meteo - free, keyless, CORS-enabled.
// Coordinates are the employee's fix when geolocation is granted, otherwise
// the office default. Either way they are rounded to 2 decimals (~1 km) so
// the employee's exact position never reaches a third party's logs.
//
// The layout never prompts for geolocation itself: if permission has not
// been granted the office coords just quietly produce the weather instead.
export interface WeatherNow {
  temp: number
  high: number
  low: number
  code: number
  isDay: boolean
  fetchedAt: number
}

// Sukahati, Cibinong - the business location, rounded.
const OFFICE = { lat: -6.49, lng: 106.81 }
const MAX_AGE = 30 * 60 * 1000

const weather = ref<WeatherNow | null>(null)
let inflight: Promise<void> | null = null

async function fetchWeather(lat: number, lng: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok)
    throw new Error(`weather: HTTP ${res.status}`)
  const data = await res.json()
  weather.value = {
    temp: data.current?.temperature_2m,
    high: data.daily?.temperature_2m_max?.[0],
    low: data.daily?.temperature_2m_min?.[0],
    code: data.current?.weather_code,
    isDay: !!data.current?.is_day,
    fetchedAt: Date.now(),
  }
}

export function useWeather() {
  const { coords, permissionStatus } = useGeolocation()

  const source = computed(() => {
    if (permissionStatus.value === 'granted' && typeof coords.value.lat === 'number' && typeof coords.value.lng === 'number')
      return { lat: coords.value.lat.toFixed(2), lng: coords.value.lng.toFixed(2) }
    return OFFICE
  })

  async function refresh(force = false) {
    if (!force && weather.value && Date.now() - weather.value.fetchedAt < MAX_AGE)
      return
    if (inflight)
      return inflight
    const { lat, lng } = source.value
    inflight = fetchWeather(lat, lng).catch(() => {
      // Silent by design: the chip simply stays hidden on failure.
    }).finally(() => {
      inflight = null
    })
    return inflight
  }

  // A fresh geolocation grant upgrades the chip's coords; refetch so the
  // weather follows the employee instead of the office.
  watch(source, () => void refresh(true))

  return { weather, refresh }
}
