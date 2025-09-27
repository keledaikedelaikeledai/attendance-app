<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AttendanceData } from '~/pages/admin/attendance.vue'
import { createColumnHelper } from '@tanstack/vue-table'
import { h, onMounted } from 'vue'
import * as attendanceTime from '~/composables/useAttendanceTime'

const props = defineProps<{
  data: AttendanceData
  loading: boolean
}>()

const attendances = computed(() => props.data?.rows || [])

// helpers imported from composable

function shiftTypeLabel(t?: 'harian' | 'bantuan') {
  if (!t)
    return '-'
  return t === 'bantuan' ? 'Shift Bantuan' : 'Shift Harian'
}

// Shifts cache so multiple table instances don't duplicate network calls
// shifts ensured via composable ensureShifts

// (removed legacy day-level helpers; per-entry helpers `entryLateMs` and
// `entryEarlyMs` are used for stacked rendering below)

// entryLateMs/entryEarlyMs imported from composable

// Normalize a cell into an array of shift entries. Supports legacy single-shift cell
// and the newer cell.grouped shape where grouped is an object keyed by shiftType.
// normalizeCell imported from composable

const columnHelper = createColumnHelper<typeof attendances.value[0]>()

const columns = computed(() => {
  if (!props.data)
    return []

  function summarizeRow(row: any) {
    const byDate = row?.byDate || {}
    // flatten entries for counting shift types
    const entries: any[] = Object.values(byDate).flatMap((c: any) => attendanceTime.normalizeCell(c))
    // Count working days as the total number of shifts worked.
    // If the server provides `workingShifts` for a date, use that; otherwise count entries with a clockIn.
    const workingDays = Object.values(byDate).reduce((sum: number, c: any) => {
      if (!c) return sum
      if (typeof c?.workingShifts === 'number') return sum + Math.max(0, Math.floor(c.workingShifts))
      const es = attendanceTime.normalizeCell(c)
      const countIns = es.filter((e: any) => e?.clockIn).length
      return sum + countIns
    }, 0)
    const harian = entries.filter(c => c?.clockIn && c?.shiftType === 'harian').length
    const bantuan = entries.filter(c => c?.clockIn && c?.shiftType === 'bantuan').length

    // Compute lateMs and earlyMs by iterating per-date cell so we can honor
    // any server-provided aggregated values that live on the parent cell
    // (including grouped cells).
    const lateMs = Object.values(byDate).reduce((acc: number, cell: any) => {
      if (!cell)
        return acc
      if (typeof cell?.lateMs === 'number')
        return acc + cell.lateMs
      // otherwise sum per-entry values for this cell
      const es = attendanceTime.normalizeCell(cell)
      const v = es.reduce((a: number, c: any) => {
        if (!c?.clockIn)
          return a
        if (typeof c?.lateMs === 'number')
          return a + c.lateMs
        const start = attendanceTime.computeShiftStartForEntry(c.clockIn, c)
        if (!start)
          return a
        const diff = new Date(c.clockIn).getTime() - start.getTime()
        return a + Math.max(0, diff)
      }, 0)
      return acc + v
    }, 0)

    const earlyMs = Object.values(byDate).reduce((acc: number, cell: any) => {
      if (!cell) return acc
      // Prefer server-provided aggregate when present
      if (typeof cell?.earlyMs === 'number') return acc + cell.earlyMs
      // Otherwise sum per-entry values for this cell
      const es = attendanceTime.normalizeCell(cell)
      const v = es.reduce((a: number, c: any) => {
        if (!c?.clockOut || !c?.shift) return a
        if (typeof c?.earlyMs === 'number') return a + c.earlyMs
        const start = attendanceTime.computeShiftStartForEntry(c.clockIn || c.clockOut, c)
        if (!start) return a
        const [shStr, smStr] = (c.shift.start || '').split(':')
        const [ehStr, emStr] = (c.shift.end || '').split(':')
        const sh = Number(shStr)
        const sm = Number(smStr)
        const eh = Number(ehStr)
        const em = Number(emStr)
        if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return a
        const startMin = sh * 60 + sm
        const endMin = eh * 60 + em
        const crosses = startMin > endMin
        const end = new Date(start)
        if (crosses) end.setDate(end.getDate() + 1)
        end.setHours(eh, em, 0, 0)
        const co = new Date(c.clockOut)
        const diff = end.getTime() - co.getTime()
        return a + Math.max(0, diff)
      }, 0)
      return acc + v
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
        return h('div', { class: 'text-center w-[120px]' }, attendanceTime.humanizeMinutes(s.lateMs))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
    columnHelper.display({
      id: 'early-hours',
      header: () => h('div', { class: 'text-center w-[120px]' }, 'Cepat Pulang'),
      cell: (info) => {
        const s = summarizeRow(info.row.original)
        return h('div', { class: 'text-center w-[120px]' }, attendanceTime.humanizeMinutes(s.earlyMs))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
  ]

  const dayCols = props.data?.days.map(day =>
    columnHelper.group({
      id: `day-${day}`,
      header: () => h('div', { class: 'text-center' }, day.slice(-2)),
      columns: [
        columnHelper.accessor((row: any) => {
          const cell = row?.byDate?.[day]
          const entries = attendanceTime.normalizeCell(cell)
          // return sorted clockIn times (may be multiple)
          const times = entries.map(e => e?.clockIn).filter(Boolean).sort()
          return times.length ? times as string[] : undefined
        }, {
          id: `in-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'M'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            const vals = info.getValue() as string[] | undefined
            const entries = attendanceTime.normalizeCell(cell)
            // Render as split top/bottom slots (support up to 2 shifts)
            const topT = vals && vals[0] ? vals[0] : undefined
            const botT = vals && vals[1] ? vals[1] : undefined
            const eTop = topT ? (entries[0] || entries.find((x: any) => x.clockIn === topT) || {}) : {}
            const eBot = botT ? (entries[1] || entries.find((x: any) => x.clockIn === botT) || {}) : {}
            const topLate = topT ? attendanceTime.entryLateMs(eTop, cell, entries) > 0 : false
            const botLate = botT ? attendanceTime.entryLateMs(eBot, cell, entries) > 0 : false
            const slotCls = (isHighlighted: boolean) => `w-[120px] h-6 flex items-center justify-center ${isHighlighted ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded' : ''}`
            const topNode = h('div', { class: slotCls(topLate), style: { lineHeight: '1' } }, topT ? formatTime(topT) : '')
            const botNode = h('div', { class: slotCls(botLate), style: { lineHeight: '1' } }, botT ? formatTime(botT) : '')
            return h('div', { class: 'text-center w-[120px] flex flex-col items-center justify-center' }, [topNode, botNode])
          },
          size: 120,
        }),
        columnHelper.accessor((row: any) => {
          const cell = row?.byDate?.[day]
          const entries = attendanceTime.normalizeCell(cell)
          // return clockOut times sorted descending so display order matches ins
          const times = entries.map(e => e?.clockOut).filter(Boolean).sort().reverse()
          return times.length ? times as string[] : undefined
        }, {
          id: `out-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'P'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            const vals = info.getValue() as string[] | undefined
            const entries = attendanceTime.normalizeCell(cell)
            const topT = vals && vals[0] ? vals[0] : undefined
            const botT = vals && vals[1] ? vals[1] : undefined
            const eTop = topT ? (entries[0] || entries.find((x: any) => x.clockOut === topT) || {}) : {}
            const eBot = botT ? (entries[1] || entries.find((x: any) => x.clockOut === botT) || {}) : {}
            const topEarly = topT ? attendanceTime.entryEarlyMs(eTop, cell, entries) > 0 : false
            const botEarly = botT ? attendanceTime.entryEarlyMs(eBot, cell, entries) > 0 : false
            const slotCls = (isHighlighted: boolean) => `w-[120px] h-6 flex items-center justify-center ${isHighlighted ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded' : ''}`
            const topNode = h('div', { class: slotCls(topEarly), style: { lineHeight: '1' } }, topT ? formatTime(topT) : '')
            const botNode = h('div', { class: slotCls(botEarly), style: { lineHeight: '1' } }, botT ? formatTime(botT) : '')
            return h('div', { class: 'text-center w-[120px] flex flex-col items-center justify-center' }, [topNode, botNode])
          },
          size: 120,
        }),
        columnHelper.display({
          id: `late-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'T'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            const entries = attendanceTime.normalizeCell(cell)
            const topE = entries[0] || {}
            const botE = entries[1] || {}
            const topMs = attendanceTime.entryLateMs(topE, cell, entries)
            const botMs = attendanceTime.entryLateMs(botE, cell, entries)
            const topNode = h('div', { class: 'w-[120px] h-6 flex items-center justify-center', style: { lineHeight: '1' } }, topMs > 0 ? attendanceTime.humanizeMinutes(topMs) : '')
            const botNode = h('div', { class: 'w-[120px] h-6 flex items-center justify-center', style: { lineHeight: '1' } }, botMs > 0 ? attendanceTime.humanizeMinutes(botMs) : '')
            return h('div', { class: 'text-center w-[120px] flex flex-col items-center justify-center' }, [topNode, botNode])
          },
          size: 120,
        }) as unknown as TableColumn<typeof attendances.value[0]>,
        columnHelper.display({
          id: `early-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'CP'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            const entries = attendanceTime.normalizeCell(cell)
            const topE = entries[0] || {}
            const botE = entries[1] || {}
            const topMs = attendanceTime.entryEarlyMs(topE, cell, entries)
            const botMs = attendanceTime.entryEarlyMs(botE, cell, entries)
            const topNode = h('div', { class: 'w-[120px] h-6 flex items-center justify-center', style: { lineHeight: '1' } }, topMs > 0 ? attendanceTime.humanizeMinutes(topMs) : '')
            const botNode = h('div', { class: 'w-[120px] h-6 flex items-center justify-center', style: { lineHeight: '1' } }, botMs > 0 ? attendanceTime.humanizeMinutes(botMs) : '')
            return h('div', { class: 'text-center w-[120px] flex flex-col items-center justify-center' }, [topNode, botNode])
          },
          size: 120,
        }) as unknown as TableColumn<typeof attendances.value[0]>,
        columnHelper.display({
          id: `shift-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'Shift'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            const entries = attendanceTime.normalizeCell(cell)
            const topE = entries[0] || {}
            const botE = entries[1] || {}
            const topDef = topE?.shiftCode ? attendanceTime.shiftsMap.value?.get(topE.shiftCode) : undefined
            const botDef = botE?.shiftCode ? attendanceTime.shiftsMap.value?.get(botE.shiftCode) : undefined
            const topLabel = topE?.shiftType ? shiftTypeLabel(topE.shiftType as 'harian' | 'bantuan' | undefined) : (topDef ? (topDef.label || topDef.code) : (topE?.shiftCode || ''))
            const botLabel = botE?.shiftType ? shiftTypeLabel(botE.shiftType as 'harian' | 'bantuan' | undefined) : (botDef ? (botDef.label || botDef.code) : (botE?.shiftCode || ''))
            const topNode = h('div', { class: 'w-[120px] h-6 flex items-center justify-center', style: { lineHeight: '1' } }, topLabel || '')
            const botNode = h('div', { class: 'w-[120px] h-6 flex items-center justify-center', style: { lineHeight: '1' } }, botLabel || '')
            return h('div', { class: 'text-center w-[120px] flex flex-col items-center justify-center' }, [topNode, botNode])
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

onMounted(() => {
  attendanceTime.ensureShifts()
})
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
