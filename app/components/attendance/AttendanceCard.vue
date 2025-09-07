<script setup lang="ts">
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
}

const props = defineProps<{ data?: DayData, titleDay?: string, username?: string }>()

let SHIFTS_CACHE: Map<string, ShiftDef> | null = null
const shiftsMap = ref<Map<string, ShiftDef> | null>(SHIFTS_CACHE)

async function ensureShifts() {
  if (SHIFTS_CACHE)
    return
  try {
    const res = await $fetch<ShiftDef[]>('/api/shifts')
    const m = new Map<string, ShiftDef>()
    for (const s of res)
      m.set(s.code, s)
    SHIFTS_CACHE = m
    shiftsMap.value = m
  }
  catch {
    // ignore fetch errors; lateness will remain 0 without shift
  }
}

function formatTime(iso?: string) {
  if (!iso)
    return '-'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function shiftTypeLabel(t?: 'harian' | 'bantuan') {
  if (!t)
    return '-'
  return t === 'harian' ? 'Shift Harian' : 'Shift Bantuan'
}

const daySuffix = computed(() => {
  const t = props.titleDay
  if (!t)
    return null
  const n = Number(t.slice(-2))
  if (!Number.isFinite(n))
    return null
  return String(n)
})

function mapUrl(lat?: number, lng?: number) {
  if (lat == null || lng == null)
    return '#'
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

function shiftBadgeColor(code?: string): 'neutral' | 'error' | 'success' | 'primary' | 'secondary' | 'info' | 'warning' {
  switch (code) {
    case 'pagi':
      return 'info' // sky-ish
    case 'siang':
      return 'primary' // teal-ish
    case 'sore':
      return 'warning' // amber
    case 'malam':
      return 'neutral' // stone/gray
    default:
      return 'secondary'
  }
}

function getShiftFromData(): ShiftDef | undefined {
  if (props.data?.shift)
    return props.data.shift
  const code = props.data?.shiftCode
  if (code && shiftsMap.value)
    return shiftsMap.value.get(code)
  return undefined
}

onMounted(() => {
  if (!props.data?.shift && props.data?.shiftCode)
    ensureShifts()
})

watch(() => props.data?.shiftCode, (code) => {
  if (code && !props.data?.shift)
    ensureShifts()
})

function computeShiftStart(clockInIso?: string) {
  if (!clockInIso)
    return null
  const def = getShiftFromData()
  if (!def)
    return null
  const d = new Date(clockInIso)
  const [shStr, smStr] = def.start.split(':')
  const [ehStr, emStr] = def.end.split(':')
  const sh = Number(shStr)
  const sm = Number(smStr)
  const eh = Number(ehStr)
  const em = Number(emStr)
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em))
    return null
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  const ciMin = d.getHours() * 60 + d.getMinutes()
  const crossesMidnight = startMin > endMin
  let year = d.getFullYear()
  let month = d.getMonth()
  let day = d.getDate()
  if (crossesMidnight && ciMin < endMin) {
    const prev = new Date(d)
    prev.setDate(prev.getDate() - 1)
    year = prev.getFullYear()
    month = prev.getMonth()
    day = prev.getDate()
  }
  return new Date(year, month, day, sh, sm, 0, 0)
}

const lateMs = computed(() => {
  if (typeof props.data?.lateMs === 'number')
    return props.data.lateMs
  const ci = props.data?.clockIn
  if (!ci)
    return 0
  const start = computeShiftStart(ci)
  if (!start)
    return 0
  const ciDate = new Date(ci)
  return Math.max(0, ciDate.getTime() - start.getTime())
})

function humanizeMinutes(ms: number) {
  if (!ms)
    return '0m'
  const total = Math.ceil(ms / 60000)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h}h ${m}m` : `${m}m`
}
</script>

<template>
  <UCard class="h-[280px] w-[320px]">
    <template #header>
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
        <template v-if="props.data?.clockIn">
          <UBadge :color="lateMs > 0 ? 'error' : 'success'" variant="solid">
            {{ lateMs > 0 ? `Late · ${humanizeMinutes(lateMs)}` : 'On time' }}
          </UBadge>
        </template>
      </div>
    </template>

    <div v-if="!props.data || !props.data.clockIn" class="flex items-center justify-center py-6 text-gray-500 dark:text-gray-400 gap-2">
      <UIcon name="i-heroicons-no-symbol" class="w-5 h-5" />
      <span>No record</span>
    </div>
    <div v-else class="grid sm:grid-cols-2 gap-4 text-sm">
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
          <UBadge
            variant="subtle"
            :color="shiftBadgeColor(props.data?.shift?.code || props.data?.shiftCode)"
          >
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
      <div class="space-y-1">
        <p class="font-medium">
          Clock Out Location
        </p>
        <div v-if="props.data?.clockOutLat != null && props.data?.clockOutLng != null">
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
  </UCard>
</template>
