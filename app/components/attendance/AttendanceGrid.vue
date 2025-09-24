<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AttendanceData } from '~/pages/admin/attendance.vue'
import { createColumnHelper } from '@tanstack/vue-table'
import { h } from 'vue'

const props = defineProps<{
  data: AttendanceData
  loading: boolean
}>()

const AttendanceCard = resolveComponent('AttendanceCard')
const AttendanceUser = resolveComponent('AttendanceUser')

const attendances = computed(() => props.data?.rows || [])

const columnHelper = createColumnHelper<typeof attendances.value[0]>()

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
  return [...baseCols, ...dayCols] as TableColumn<typeof attendances.value[0]>[]
})
</script>

<template>
  <div>
    <u-table
      :data="attendances"
      :columns="columns"
      :loading="loading"
    />
  </div>
</template>
