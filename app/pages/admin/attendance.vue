<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { createColumnHelper } from '@tanstack/vue-table'
import { h } from 'vue'

const AttendanceCard = resolveComponent('AttendanceCard')
const AttendanceUser = resolveComponent('AttendanceUser')

const month = ref<string>(new Date().toISOString().slice(0, 7)) // YYYY-MM

const { data, refresh, status, pending } = await useFetch('/api/admin/attendance', {
  query: { month },
  credentials: 'include',
})

const attendances = computed(() => data.value?.rows || [])

const columnHelper = createColumnHelper<typeof attendances.value[0]>()

const columns = computed(() => {
  if (!data.value)
    return []
  const baseCols = [
    columnHelper.accessor('name', {
      header: () => h('div', { class: 'text-center w-[200px]' }, 'Member'),
      cell: info => h(AttendanceUser as any, { user: info.row.original }),
      size: 200,
    }),
  ]

  const dayCols = data.value.days.map(day =>
    columnHelper.accessor((row: any) => row?.byDate?.[day], {
      id: `day-${day}`,
      header: () => h('div', { class: 'text-center w-[320px]' }, new Date(day).toLocaleDateString([], { day: '2-digit', month: 'short' })),
      cell: info => h(AttendanceCard as any, { data: info.getValue(), titleDay: day, username: info.row.original.name || info.row.original.username || info.row.original.email }),
      size: 120,
    }),
  )
  return [...baseCols, ...dayCols] as TableColumn<typeof attendances.value[0]>[]
})

const monthOptions = computed(() => {
  // Provide last 12 months including current
  const arr: Array<{ label: string, value: string }> = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const dt = new Date(now)
    dt.setMonth(now.getMonth() - i)
    const val = dt.toISOString().slice(0, 7)
    const label = dt.toLocaleDateString([], { year: 'numeric', month: 'long' })
    arr.push({ label, value: val })
  }
  return arr
})

function onRefresh() {
  refresh()
}

definePageMeta({
  title: 'Attendance',
  pageTitle: 'Attendance - Admin - Attendance App',
})
</script>

<template>
  <PageWrapper>
    <template #navRight>
      <div class="flex items-center gap-3">
        <USelect
          v-model="month"
          class="w-50"
          :items="monthOptions"
          option-attribute="label"
          value-attribute="value"
        />

        <UButton
          icon="i-heroicons-arrow-path"
          variant="soft"
          :loading="status === 'pending'"
          @click="onRefresh"
        >
          Refresh
        </UButton>
      </div>
    </template>
    <div v-if="!pending">
      <u-table
        :data="attendances"
        :columns="columns"
      />
    </div>
  </PageWrapper>
</template>
