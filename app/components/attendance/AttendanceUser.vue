<script setup lang="ts">
interface ShiftDef { code: string, label: string, start: string, end: string }
interface DayCell {
  clockIn?: string
  clockOut?: string
  shiftCode?: string
  shiftType?: 'harian' | 'bantuan'
  shift?: ShiftDef
  lateMs?: number
}

const props = defineProps<{ user: { name?: string | null, username?: string | null, email?: string | null, byDate?: Record<string, DayCell> } }>()

const cells = computed(() => Object.values(props.user?.byDate || {}))

function computeShiftStart(ciIso?: string, def?: ShiftDef | undefined) {
  if (!ciIso || !def)
    return null
  const d = new Date(ciIso)
  const [shStr, smStr] = (def.start || '').split(':')
  const [ehStr, emStr] = (def.end || '').split(':')
  const sh = Number(shStr)
  const sm = Number(smStr)
  const eh = Number(ehStr)
  const em = Number(emStr)
  if ([sh, sm, eh, em].some(n => Number.isNaN(n)))
    return null
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  const ciMin = d.getHours() * 60 + d.getMinutes()
  const crosses = startMin > endMin
  let y = d.getFullYear()
  let m = d.getMonth()
  let day = d.getDate()
  if (crosses && ciMin < endMin) {
    const prev = new Date(d)
    prev.setDate(prev.getDate() - 1)
    y = prev.getFullYear()
    m = prev.getMonth()
    day = prev.getDate()
  }
  return new Date(y, m, day, sh, sm, 0, 0)
}

const workedDays = computed(() => cells.value.filter(c => !!c.clockIn).length)
const harianDays = computed(() => cells.value.filter(c => c.clockIn && c.shiftType === 'harian').length)
const bantuanDays = computed(() => cells.value.filter(c => c.clockIn && c.shiftType === 'bantuan').length)
const lateMsTotal = computed(() => cells.value.reduce((acc, c) => {
  if (!c.clockIn)
    return acc
  if (typeof c.lateMs === 'number')
    return acc + c.lateMs
  const start = computeShiftStart(c.clockIn, c.shift)
  if (!start)
    return acc
  const diff = new Date(c.clockIn).getTime() - start.getTime()
  return acc + Math.max(0, diff)
}, 0))

const earlyMsTotal = computed(() => cells.value.reduce((acc, c) => {
  if (!c.clockOut || !c.shift)
    return acc
  const start = computeShiftStart(c.clockIn || c.clockOut, c.shift)
  if (!start)
    return acc
  const [shStr, smStr] = (c.shift.start || '').split(':')
  const [ehStr, emStr] = (c.shift.end || '').split(':')
  const sh = Number(shStr)
  const sm = Number(smStr)
  const eh = Number(ehStr)
  const em = Number(emStr)
  if ([sh, sm, eh, em].some(n => Number.isNaN(n)))
    return acc
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  const crosses = startMin > endMin
  const end = new Date(start)
  if (crosses)
    end.setDate(end.getDate() + 1)
  end.setHours(eh, em, 0, 0)
  const co = new Date(c.clockOut)
  const diff = end.getTime() - co.getTime()
  return acc + Math.max(0, diff)
}, 0))

function humanizeMinutes(ms: number) {
  if (!ms)
    return '0m'
  const total = Math.ceil(ms / 60000)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

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
        Late: {{ humanizeMinutes(lateMsTotal) }}
      </div>
      <div class="text-sm dark:text-gray-400 font-medium" :class="{ 'text-red-500': earlyMsTotal > 0, 'text-green-500': earlyMsTotal === 0 }">
        Early Leave: {{ humanizeMinutes(earlyMsTotal) }}
      </div>
    </template>
  </UCard>
</template>
