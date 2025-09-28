<script setup lang="ts">
const props = defineProps<{
  log: {
    id: string | number
    type: 'clock-in' | 'clock-out'
    timestamp: string
    lat?: number | null
    lng?: number | null
    accuracy?: number | null
    shiftCode?: string | null
  }
}>()

function formatTime(iso?: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function mapUrl(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return '#'
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

function shiftBadgeColor(code?: string | null) {
  switch (code) {
    case 'pagi':
      return 'info'
    case 'siang':
      return 'primary'
    case 'sore':
      return 'warning'
    case 'malam':
      return 'neutral'
    default:
      return 'secondary'
  }
}
</script>

<template>
  <div class="flex items-center justify-between gap-3 border rounded-md px-3 py-2 bg-gray-50 dark:bg-gray-800/40">
    <div class="flex items-center gap-3">
      <UIcon :name="props.log.type === 'clock-in' ? 'i-heroicons-play' : 'i-heroicons-stop'" class="w-5 h-5" />
      <div>
        <p class="font-medium">
          {{ props.log.type === 'clock-in' ? 'Clock In' : 'Clock Out' }}
        </p>
        <p class="text-xs text-gray-500">
          {{ formatTime(props.log.timestamp) }}
        </p>
        <div class="flex items-center gap-2 mt-1">
          <UBadge v-if="props.log.shiftCode" variant="subtle" :color="shiftBadgeColor(props.log.shiftCode)">
            {{ props.log.shiftCode }}
          </UBadge>
          <span v-if="props.log.lat != null && props.log.lng != null" class="text-xs text-gray-500">{{ props.log.lat.toFixed(3) }}, {{ props.log.lng.toFixed(3) }}</span>
        </div>
      </div>
    </div>

    <div class="text-right text-xs text-gray-500 flex flex-col items-end gap-1">
      <a
        v-if="props.log.lat != null && props.log.lng != null"
        :href="mapUrl(props.log.lat, props.log.lng)"
        target="_blank"
        rel="noopener noreferrer"
        class="underline"
      >
        See on map
      </a>
      <span v-else>-</span>
      <span v-if="props.log.accuracy != null">±{{ Math.round(props.log.accuracy) }}m</span>
    </div>
  </div>
</template>
