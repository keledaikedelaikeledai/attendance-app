<script setup lang="ts">
import * as attendanceTime from '~/composables/useAttendanceTime'

interface ShiftDef { code: string, label: string, start: string, end: string }
interface DayCell {
  clockIn?: string
  clockOut?: string
  shiftCode?: string
  shiftType?: 'harian' | 'bantuan'
  shift?: ShiftDef
  lateMs?: number
  // grouped entries when server returns multiple shifts per day
  grouped?: Record<string, any>
}
// humanizeMinutes provided by composable if needed elsewhere
const props = defineProps<{ user: { name?: string | null, username?: string | null, email?: string | null, byDate?: Record<string, DayCell> } }>()

onMounted(() => {
  const byDate = props.user?.byDate || {}
  for (const v of Object.values(byDate)) {
    if (!v) continue
    if ((v as any).shiftCode || ((v as any).grouped && Object.values((v as any).grouped).some((e: any) => e?.shiftCode))) {
      void attendanceTime.ensureShifts()
      break
    }
  }
})

const cells = computed(() => {
  const byDate = props.user?.byDate || {}
  const vals = Object.values(byDate || {})
  return vals.flatMap(v => attendanceTime.normalizeCell(v))
})

const workedDays = computed(() => cells.value.filter(c => !!c.clockIn).length)
const harianDays = computed(() => cells.value.filter(c => c.clockIn && c.shiftType === 'harian').length)
const bantuanDays = computed(() => cells.value.filter(c => c.clockIn && c.shiftType === 'bantuan').length)
const lateMsTotal = computed(() => cells.value.reduce((acc, c) => {
  if (!c.clockIn) return acc
  if (typeof c.lateMs === 'number') return acc + c.lateMs
  return acc + attendanceTime.entryLateMs(c)
}, 0))

const earlyMsTotal = computed(() => cells.value.reduce((acc, c) => {
  if (typeof c.earlyMs === 'number') return acc + c.earlyMs
  return acc + attendanceTime.entryEarlyMs(c)
}, 0))

// Removed duplicate humanizeMinutes function

const displayName = computed(() => props.user?.name || props.user?.username || props.user?.email || 'N/A')
</script>

<template>
  <UCard class="flex flex-col min-w-0 h-[280px]" variant="subtle">
    <template #header>
      <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
        @{{ props.user?.username || '-' }}
      </div>
      <div class="font-medium truncate">
        {{ displayName }}
      </div>
    </template>

    <div class="mt-1 flex flex-col gap-1 text-[11px]">
      <UBadge size="md" variant="solid" color="primary">
        Working Day(s): {{ workedDays }}
      </UBadge>
      <UBadge size="md" variant="subtle" color="neutral">
        Harian: {{ harianDays }}
      </UBadge>
      <UBadge size="md" variant="subtle" color="info">
        Bantuan: {{ bantuanDays }}
      </UBadge>
    </div>
    <template #footer>
      <div class="text-sm mt-1 dark:text-gray-400 font-medium" :class="{ 'text-red-500': lateMsTotal > 0, 'text-green-500': lateMsTotal === 0 }">
        Late: {{ attendanceTime.humanizeMinutes(lateMsTotal) }}
      </div>
      <div class="text-sm dark:text-gray-400 font-medium" :class="{ 'text-red-500': earlyMsTotal > 0, 'text-green-500': earlyMsTotal === 0 }">
        Early Leave: {{ attendanceTime.humanizeMinutes(earlyMsTotal) }}
      </div>
    </template>
  </UCard>
</template>
