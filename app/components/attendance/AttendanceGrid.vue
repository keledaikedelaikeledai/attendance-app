<script setup lang="ts">
// eslint-disable-next-line ts/ban-ts-comment -- legacy component: TanStack v9-alpha column-helper typings dropped the `size` field the table runtime applies; rewriting ~20 working grouped-column definitions for alpha typings is regression risk without benefit. Revisit when the table lib stabilises.
// @ts-nocheck
import type { TableColumnDef } from '@sewadah/selaras/table'
import type { AttendanceData } from '~/types/attendance'
import { h } from 'vue'

const props = defineProps<{
  data: AttendanceData
  loading: boolean
}>()

const AttendanceCard = resolveComponent('AttendanceCard')
const AttendanceUser = resolveComponent('AttendanceUser')

const attendances = computed(() => props.data?.rows || [])

const columnHelper = createTableColumnHelper<typeof attendances.value[0]>()

const columns = computed(() => {
  if (!props.data)
    return []
  const baseCols = [
    columnHelper.accessor('name', {
      header: () => h('div', { class: 'text-center w-[200px]' }, 'Member'),
      cell: info => h(AttendanceUser as any, { user: info.row.original }),
      size: 200,
    }),
  ]

  const dayCols = props.data.days.map(day =>
    columnHelper.accessor((row: any) => row?.byDate?.[day], {
      id: `day-${day}`,
      header: () => h('div', { class: 'text-center w-[320px]' }, new Date(day).toLocaleDateString([], { day: '2-digit', month: 'short' })),
      cell: info => h(AttendanceCard as any, { data: info.getValue(), titleDay: day, username: info.row.original.name || info.row.original.username || info.row.original.email }),
      size: 120,
    }),
  )
  return [...baseCols, ...dayCols] as TableColumnDef<typeof attendances.value[0]>[]
})
</script>

<template>
  <div>
    <STable
      :data="attendances"
      :columns="columns"
      :loading="loading"
    />
  </div>
</template>
