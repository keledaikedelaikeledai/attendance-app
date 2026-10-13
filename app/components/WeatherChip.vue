<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// A quiet current-conditions chip: icon + temperature, with the day's range
// as a tooltip. Hidden entirely until data exists or on failure - a broken
// weather chip must never look like a broken header.
const { t } = useI18n()
const { weather, refresh } = useWeather()
let poller: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  void refresh()
  // The strip lives in the layout, so this survives route changes.
  poller = setInterval(() => void refresh(), 30 * 60 * 1000)
})
onBeforeUnmount(() => clearInterval(poller))

// WMO weather codes -> the handful of heroicons we have. Rain and drizzle
// share the cloud: without a rain glyph, temperature carries the message.
function condition(weather: { code: number, isDay: boolean }): { icon: string, label: string } {
  const code = weather.code
  if (code === 0)
    return { icon: weather.isDay ? 'i-heroicons-sun' : 'i-heroicons-moon', label: 'clear' }
  if (code <= 2)
    return { icon: weather.isDay ? 'i-heroicons-sun' : 'i-heroicons-moon', label: 'partly' }
  if (code <= 48)
    return { icon: 'i-heroicons-cloud', label: 'cloudy' }
  if (code <= 67 || (code >= 80 && code <= 82))
    return { icon: 'i-heroicons-cloud', label: 'rain' }
  if (code <= 77 || code === 85 || code === 86)
    return { icon: 'i-heroicons-sparkles', label: 'snow' }
  if (code <= 99)
    return { icon: 'i-heroicons-bolt', label: 'storm' }
  return { icon: 'i-heroicons-cloud', label: 'cloudy' }
}

const detail = computed(() => {
  const w = weather.value
  if (!w)
    return ''
  const parts = [t(`weather.${condition(w).label}`)]
  if (typeof w.high === 'number' && typeof w.low === 'number')
    parts.push(`${Math.round(w.high)}° / ${Math.round(w.low)}°`)
  return parts.join(' · ')
})
</script>

<template>
  <div
    v-if="weather && typeof weather.temp === 'number'"
    class="flex items-center gap-1.5 text-[var(--selaras-resolved-text-muted)]"
    :title="detail"
  >
    <SIcon :name="condition(weather).icon" class="size-4 shrink-0" />
    <span class="text-sm font-medium tabular-nums text-[var(--selaras-resolved-text-default)]">
      {{ Math.round(weather.temp) }}°
    </span>
  </div>
</template>
