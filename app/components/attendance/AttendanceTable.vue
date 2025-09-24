<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AttendanceData } from '~/pages/admin/attendance.vue'
import { createColumnHelper } from '@tanstack/vue-table'
import { h, onMounted } from 'vue'

const props = defineProps<{
  data: AttendanceData
  loading: boolean
}>()

const attendances = computed(() => props.data?.rows || [])

function computeShiftStart(ciIso?: string, def?: { start: string, end: string }) {
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

function humanizeMinutes(ms: number) {
  if (!ms)
    return '0m'
  const total = Math.ceil(ms / 60000)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

function shiftTypeLabel(t?: 'harian' | 'bantuan') {
  if (!t)
    return '-'
  return t === 'bantuan' ? 'Shift Bantuan' : 'Shift Harian'
}

function dayLateMs(cell: any) {
  if (!cell?.clockIn)
    return 0
  if (typeof cell?.lateMs === 'number')
    return cell.lateMs
  const start = computeShiftStart(cell.clockIn, cell.shift)
  if (!start)
    return 0
  const diff = new Date(cell.clockIn).getTime() - start.getTime()
  return Math.max(0, diff)
}

function dayEarlyMs(cell: any) {
  if (!cell?.clockOut || !cell?.shift)
    return 0
  const start = computeShiftStart(cell.clockIn || cell.clockOut, cell.shift)
  if (!start)
    return 0
  const [ehStr, emStr] = (cell.shift.end || '').split(':')
  const eh = Number(ehStr)
  const em = Number(emStr)
  if (Number.isNaN(eh) || Number.isNaN(em))
    return 0
  const [shStr, smStr] = (cell.shift.start || '').split(':')
  const sh = Number(shStr)
  const sm = Number(smStr)
  const crosses = (sh * 60 + sm) > (eh * 60 + em)
  const end = new Date(start)
  if (crosses)
    end.setDate(end.getDate() + 1)
  end.setHours(eh, em, 0, 0)
  const co = new Date(cell.clockOut)
  const diff = end.getTime() - co.getTime()
  return Math.max(0, diff)
}

const columnHelper = createColumnHelper<typeof attendances.value[0]>()

const columns = computed(() => {
  if (!props.data)
    return []

  function summarizeRow(row: any) {
    const cells: any[] = Object.values(row?.byDate || {})
    const workingDays = cells.filter(c => c?.clockIn).length
    const harian = cells.filter(c => c?.clockIn && c?.shiftType === 'harian').length
    const bantuan = cells.filter(c => c?.clockIn && c?.shiftType === 'bantuan').length
    const lateMs = cells.reduce((acc, c) => {
      if (!c?.clockIn)
        return acc
      if (typeof c?.lateMs === 'number')
        return acc + c.lateMs
      const start = computeShiftStart(c.clockIn, c.shift)
      if (!start)
        return acc
      const diff = new Date(c.clockIn).getTime() - start.getTime()
      return acc + Math.max(0, diff)
    }, 0)
    const earlyMs = cells.reduce((acc, c) => {
      if (!c?.clockOut || !c?.shift)
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
    }, 0)
    return { workingDays, harian, bantuan, lateMs, earlyMs }
  }

  const baseCols = [
    columnHelper.accessor('name', {
      header: 'Nama',
      cell: info => info.getValue() || info.row.original.username || info.row.original.email || 'N/A',
      size: 200,
    }),
    columnHelper.display({
      id: 'working-days',
      header: () => h('div', { class: 'text-center w-[120px]' }, 'Hari Kerja'),
      cell: (info) => {
        const s = summarizeRow(info.row.original)
        return h('div', { class: 'text-center w-[120px]' }, String(s.workingDays))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
    columnHelper.display({
      id: 'shift-harian',
      header: () => h('div', { class: 'text-center w-[120px]' }, 'Shift Harian'),
      cell: (info) => {
        const s = summarizeRow(info.row.original)
        return h('div', { class: 'text-center w-[120px]' }, String(s.harian))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
    columnHelper.display({
      id: 'shift-bantuan',
      header: () => h('div', { class: 'text-center w-[120px]' }, 'Shift Bantuan'),
      cell: (info) => {
        const s = summarizeRow(info.row.original)
        return h('div', { class: 'text-center w-[120px]' }, String(s.bantuan))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
    columnHelper.display({
      id: 'late-hours',
      header: () => h('div', { class: 'text-center w-[120px]' }, 'Keterlambatan'),
      cell: (info) => {
        const s = summarizeRow(info.row.original)
        return h('div', { class: 'text-center w-[120px]' }, humanizeMinutes(s.lateMs))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
    columnHelper.display({
      id: 'early-hours',
      header: () => h('div', { class: 'text-center w-[120px]' }, 'Cepat Pulang'),
      cell: (info) => {
        const s = summarizeRow(info.row.original)
        return h('div', { class: 'text-center w-[120px]' }, humanizeMinutes(s.earlyMs))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
  ]

  const dayCols = props.data?.days.map(day =>
    columnHelper.group({
      id: `day-${day}`,
      header: () => h('div', { class: 'text-center' }, day.slice(-2)),
      columns: [
        columnHelper.accessor((row: any) => row?.byDate?.[day]?.clockIn as string | undefined, {
          id: `in-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'M'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            const isLate = dayLateMs(cell) > 0
            const cls = `text-center w-[120px] ${isLate ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded' : ''}`
            return h('div', { class: cls }, formatTime(cell?.clockIn))
          },
          size: 120,
        }),
        columnHelper.accessor((row: any) => row?.byDate?.[day]?.clockOut as string | undefined, {
          id: `out-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'P'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            const isEarly = dayEarlyMs(cell) > 0
            const cls = `text-center w-[120px] ${isEarly ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded' : ''}`
            return h('div', { class: cls }, formatTime(cell?.clockOut))
          },
          size: 120,
        }),
        columnHelper.display({
          id: `late-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'T'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            return h('div', { class: 'text-center w-[120px]' }, humanizeMinutes(dayLateMs(cell)))
          },
          size: 120,
        }) as unknown as TableColumn<typeof attendances.value[0]>,
        columnHelper.display({
          id: `early-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'CP'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            return h('div', { class: 'text-center w-[120px]' }, humanizeMinutes(dayEarlyMs(cell)))
          },
          size: 120,
        }) as unknown as TableColumn<typeof attendances.value[0]>,
        columnHelper.display({
          id: `shift-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'Shift'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            return h('div', { class: 'text-center w-[120px]' }, shiftTypeLabel(cell?.shiftType))
          },
          size: 120,
        }) as unknown as TableColumn<typeof attendances.value[0]>,
      ],
    }) as unknown as TableColumn<typeof attendances.value[0]>,
  )
  return [...baseCols, ...dayCols] as TableColumn<typeof attendances.value[0]>[]
})

function formatTime(iso?: string) {
  if (!iso)
    return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {})
</script>

<template>
  <div class="border-y border-gray-200">
    <u-table
      :data="attendances"
      :columns="columns"
      :ui="{
        th: 'border-b border-r border-gray-200 dark:border-gray-800 last:border-r-0',
        td: 'border-r border-gray-200 dark:border-gray-800 last:border-r-0',
      }"
    />
  </div>
</template>
