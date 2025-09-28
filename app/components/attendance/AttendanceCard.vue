<script setup lang="ts">
import * as attendanceTime from '~/composables/useAttendanceTime'

interface ShiftDef { code: string, label: string, start: string, end: string }
interface DayData {
  clockIn?: string
  clockInLat?: number
  clockInLng?: number
  clockInAccuracy?: number
  clockOut?: string
  clockOutLat?: number
  clockOutLng?: number
  clockOutAccuracy?: number
  shiftCode?: string
  shiftType?: 'harian' | 'bantuan'
  shift?: ShiftDef
  lateMs?: number
  // grouped shift entries (for days with multiple shifts)
  grouped?: Record<string, any>
}

const props = defineProps<{ data?: DayData, titleDay?: string, username?: string }>()

function formatTime(iso?: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function shiftTypeLabel(t?: 'harian' | 'bantuan') {
  if (!t) return '-'
  return t === 'harian' ? 'Shift Harian' : 'Shift Bantuan'
}

function mapUrl(lat?: number, lng?: number) {
  if (lat == null || lng == null) return '#'
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

function shiftBadgeColor(code?: string): 'neutral' | 'error' | 'success' | 'primary' | 'secondary' | 'info' | 'warning' {
  switch (code) {
    case 'pagi': return 'info'
    case 'siang': return 'primary'
    case 'sore': return 'warning'
    case 'malam': return 'neutral'
    default: return 'secondary'
  }
}
// normalizeCell, shift helpers and humanizeMinutes are provided by the composable

onMounted(() => {
  // Ensure shifts are loaded if this cell or any grouped entries reference shift codes
  if (props.data?.shiftCode || (props.data?.grouped && Object.values(props.data.grouped || {}).some((v: any) => v?.shiftCode))) {
    void attendanceTime.ensureShifts()
  }
})

watch(() => props.data?.shiftCode, (code) => {
  if (code && !props.data?.shift) void attendanceTime.ensureShifts()
})

const entries = computed(() => attendanceTime.normalizeCell(props.data))

const hasAnyClockIn = computed(() => (entries.value || []).some((e: any) => !!e?.clockIn))

function entriesForGroup(groupVal: any, st?: string) {
  const all = entries.value || []
  return all.filter((e: any) => {
    if (st && e?.shiftType === st) return true
    if (groupVal?.shiftCode && e?.shiftCode === groupVal.shiftCode) return true
    if (e?.shift && groupVal?.shift && e.shift.code === groupVal.shift.code) return true
    return false
  })
}
</script>

<template>
  <div class=" w-[320px]">
    <!-- <template #header>
      <div class="flex items-center justify-between gap-2">
        <div class="font-medium flex items-center gap-2 min-w-0 flex-1">
          <UIcon
            v-if="daySuffix"
            :name="`arcticons:calendar-${daySuffix}`"
            class="text-neutral-950"
            size="24"
          />
          <span v-else>Attendance</span>

          <span v-if="props.username" class="truncate">{{ props.username }}</span>
        </div>
      </div>
    </template> -->

    <div v-if="!props.data || !hasAnyClockIn" class="flex h-full items-center justify-center py-6 text-gray-500 dark:text-gray-400 gap-2">
      <UIcon name="i-heroicons-no-symbol" class="w-5 h-5" />
      <span>No record</span>
    </div>

    <div v-else class="space-y-3 text-sm">
      <template v-if="props.data?.grouped">
        <div v-for="(val, st) in props.data.grouped" :key="st" class="border border-neutral-300 rounded-md p-2 bg-white/50 dark:bg-gray-800/30">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <UBadge variant="subtle" :color="shiftBadgeColor(val.shiftCode)">
                {{ (st === 'harian' ? 'Shift Harian' : (st === 'bantuan' ? 'Shift Bantuan' : st)) }}
              </UBadge>
              <span class="text-xs text-gray-500">{{ val.shiftCode || '-' }}</span>
            </div>
            <div class="text-xs text-gray-500">
              {{ val.clockIn ? new Date(val.clockIn).toLocaleDateString() : '' }}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="font-medium">
                Clock In
              </p>
              <p class="font-medium">
                {{ formatTime(val.clockIn) }}
              </p>
              <div v-if="val.clockInLat != null && val.clockInLng != null" class="text-xs text-gray-500 mt-1">
                <a :href="mapUrl(val.clockInLat, val.clockInLng)" target="_blank" rel="noopener noreferrer">See on map</a>
              </div>
            </div>
            <div>
              <p class="text-xs text-gray-500">
                Clock Out
              </p>
              <p class="font-medium">
                {{ formatTime(val.clockOut) }}
              </p>
              <div v-if="val.clockOutLat != null && val.clockOutLng != null" class="text-xs text-gray-500 mt-1">
                <a :href="mapUrl(val.clockOutLat, val.clockOutLng)" target="_blank" rel="noopener noreferrer">See on map</a>
              </div>
            </div>
          </div>
          <div class="mt-3 pt-3 border-t border-neutral-200 text-sm">
            <div class="flex flex-col gap-2">
              <div v-for="(e, idx) in entriesForGroup(val, st)" :key="idx" class="flex items-center justify-between">
                <UBadge
                  :color="(typeof e?.lateMs === 'number' ? e.lateMs : attendanceTime.computeLateMsForEntry(e)) > 0 ? 'error' : 'success'"
                  variant="solid"
                  size="xs"
                >
                  {{ (typeof e?.lateMs === 'number' ? e.lateMs : attendanceTime.computeLateMsForEntry(e)) > 0 ? `Late · ${attendanceTime.humanizeMinutes(typeof e?.lateMs === 'number' ? e.lateMs : attendanceTime.computeLateMsForEntry(e))}` : 'On time' }}
                </UBadge>
                <UBadge
                  v-if="(typeof e?.earlyMs === 'number' ? e.earlyMs : attendanceTime.computeEarlyMsForEntry(e)) > 0"
                  class="ml-2"
                  color="warning"
                  variant="subtle"
                  size="xs"
                >
                  Early · {{ attendanceTime.humanizeMinutes(typeof e?.earlyMs === 'number' ? e.earlyMs : attendanceTime.computeEarlyMsForEntry(e)) }}
                </UBadge>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="grid sm:grid-cols-2 gap-4">
          <div class="space-y-1">
            <p class="font-medium">
              Clock In
            </p>
            <p class="text-gray-600 dark:text-gray-400">
              {{ formatTime(props.data?.clockIn) }}
            </p>
          </div>
          <div class="space-y-1">
            <p class="font-medium">
              Clock Out
            </p>
            <p class="text-gray-600 dark:text-gray-400">
              {{ formatTime(props.data?.clockOut) }}
            </p>
          </div>
          <div class="space-y-1 sm:col-span-2">
            <p class="font-medium">
              Shift
            </p>
            <div class="flex items-center gap-2 text-xs">
              <UBadge variant="subtle" :color="shiftBadgeColor(props.data?.shift?.code || props.data?.shiftCode)">
                {{ props.data?.shift?.label || props.data?.shiftCode || '-' }}
              </UBadge>
              <UBadge :color="props.data?.shiftType === 'bantuan' ? 'info' : 'neutral'" variant="outline">
                {{ shiftTypeLabel(props.data?.shiftType) }}
              </UBadge>
            </div>
          </div>
          <div class="space-y-1">
            <p class="font-medium">
              Clock In Location
            </p>
            <div v-if="props.data?.clockInLat != null && props.data?.clockInLng != null">
              <div class="flex items-center gap-2">
                <UButton
                  as="a"
                  size="xs"
                  variant="ghost"
                  icon="i-heroicons-map-pin"
                  :href="mapUrl(props.data?.clockInLat, props.data?.clockInLng)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  See on map
                </UButton>
              </div>
            </div>
          </div>
          <div class="space-y-1">
            <p class="font-medium">
              Clock Out Location
            </p>
            <div v-if="props.data?.clockOutLat != null && props.data?.clockOutLng != null">
              <div class="flex items-center gap-2">
                <UButton
                  as="a"
                  size="xs"
                  variant="ghost"
                  icon="i-heroicons-map-pin"
                  :href="mapUrl(props.data?.clockOutLat, props.data?.clockOutLng)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  See on map
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
