<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import * as attendanceTime from '~/composables/useAttendanceTime'
// `computed`, `ref`, `onMounted`, etc. are auto-imported by Nuxt; do not import from 'vue' explicitly

const month = ref(new Date().toISOString().slice(0, 7)) // YYYY-MM

// useFetch for attendance (reactive to `month`) and users
const { data: attendanceData, pending: attendancePending, refresh: refreshAttendance } = useFetch('/api/admin/attendance', { method: 'get', credentials: 'include', query: { month } })
const data = computed(() => attendanceData.value ?? { month: '', days: [], rows: [] })
const isLoading = computed(() => Boolean(attendancePending.value))

const ApexChart = shallowRef<any>(null)
const primaryColor = ref('#2563eb')
const secondaryColor = ref('#60a5fa')

function refreshAll() {
  void refreshAttendance()
}

onMounted(async () => {
  // dynamic import of chart component on client only
  if (process.client) {
    // dynamic import; ensure you have 'vue3-apexcharts' installed for production
    const mod = await import('vue3-apexcharts')
    ApexChart.value = markRaw(mod.default || mod)
    try {
      const style = getComputedStyle(document.documentElement)
      const foundRaw = (
        [
          '--u-color-primary',
          '--u-color-primary-500',
          '--color-primary-500',
          '--u-primary',
        ].map(k => style.getPropertyValue(k)).find(v => v && v.trim()) || ''
      ).trim()

      if (foundRaw) {
        // Create a hidden element to let the browser resolve the color (OKLCH -> rgb if supported)
        try {
          const tmp = document.createElement('div')
          tmp.style.color = foundRaw
          tmp.style.display = 'none'
          document.body.appendChild(tmp)
          const resolved = getComputedStyle(tmp).color
          document.body.removeChild(tmp)
          if (resolved && resolved !== 'rgba(0, 0, 0, 0)') {
            primaryColor.value = resolved
          }
          else {
            primaryColor.value = foundRaw
          }
        }
        catch {
          primaryColor.value = foundRaw
        }
        // try to resolve a secondary tint for the 'bantuan' series from the theme
        try {
          const found2 = (
            ['--u-color-primary-300', '--u-color-primary-200', '--color-primary-300']
              .map(k => style.getPropertyValue(k))
              .find(v => v && v.trim()) || ''
          ).trim()
          if (found2) {
            const tmp2 = document.createElement('div')
            tmp2.style.color = found2
            tmp2.style.display = 'none'
            document.body.appendChild(tmp2)
            const resolved2 = getComputedStyle(tmp2).color
            document.body.removeChild(tmp2)
            if (resolved2 && resolved2 !== 'rgba(0, 0, 0, 0)') secondaryColor.value = resolved2
            else secondaryColor.value = found2
          }
        }
        catch {
          // ignore
        }
      }
    }
    catch {
      // ignore
    }
  }
  // initial fetch is handled by useFetch; nothing else needed here

  // preload shifts definitions for local calculations
  await attendanceTime.ensureShifts().catch(() => {})
})

const totalUsers = computed(() => data.value.rows?.length || 0)
const totalDays = computed(() => data.value.days?.length || 0)

const presentCountsPerDay = computed(() => {
  const days = data.value.days || []
  return days.map((d: string) => {
    return (data.value.rows || []).reduce((acc: number, row: any) => {
      const cell = row.byDate?.[d]
      if (!cell) return acc
      if (typeof cell.workingShifts === 'number') return acc + Math.max(0, Math.floor(cell.workingShifts))
      // fallback: count entries with a clockIn (supports multiple shifts per day)
      const entries = attendanceTime.normalizeCell(cell)
      const countIns = entries.filter((e: any) => e?.clockIn).length
      return acc + countIns
    }, 0)
  })
})

const totalPresent = computed(() => presentCountsPerDay.value.reduce((a: number, b: number) => a + b, 0))
const percentPresent = computed(() => {
  const denom = totalUsers.value * totalDays.value
  return denom ? Math.round((totalPresent.value / denom) * 10000) / 100 : 0
})

const lateCountsPerUser = computed(() => (data.value.rows || []).map((row: any) => {
  const days = data.value.days || []
  const count = days.reduce((acc: number, d: string) => {
    const cell = row.byDate?.[d]
    if (!cell) return acc
    // prefer server aggregate if present, else compute per-entry
    if (typeof cell?.lateMs === 'number') return acc + (cell.lateMs > 0 ? 1 : 0)
    const es = attendanceTime.normalizeCell(cell)
    const hasLate = es.some((e: any) => attendanceTime.entryLateMs(e, cell, es) > 0)
    return acc + (hasLate ? 1 : 0)
  }, 0)
  return { userId: row.userId, name: row.name, username: row.username, email: row.email, lateCount: count }
}))

const averageLatePerUser = computed(() => {
  const arr = lateCountsPerUser.value
  if (!arr.length) return 0
  return Math.round((arr.reduce((a: any, b: any) => a + b.lateCount, 0) / arr.length) * 100) / 100
})

// Top Late Users table removed; we keep lateCountsPerUser and averageLatePerUser for stats

// recentUsersColumns removed; replaced by `recentRecapColumns` for the recap table

const recentRecap = computed(() => {
  const rows = data.value.rows || []
  const days = data.value.days || []
  return rows.map((row: any) => {
    let totalWorkingDays = 0
    let harian = 0
    let bantuan = 0
    let lateMsTotal = 0
    let earlyMsTotal = 0
    for (const d of days) {
      const v = row.byDate?.[d]
      if (!v) continue
      // Count working shifts: prefer server-provided workingShifts, else count entries with clockIn
      const esAll = attendanceTime.normalizeCell(v)
      const presentCount = typeof v?.workingShifts === 'number' ? Math.max(0, Math.floor(v.workingShifts)) : esAll.filter((e: any) => e?.clockIn).length
      if (!presentCount) continue
      totalWorkingDays += presentCount
      harian += v.harian || 0
      bantuan += v.bantuan || 0
      // late total: prefer server aggregate if present, else sum per-entry
      if (typeof v?.lateMs === 'number') lateMsTotal += Number(v.lateMs)
      else lateMsTotal += esAll.reduce((a: number, e: any) => a + attendanceTime.entryLateMs(e, v, esAll), 0)

      // early total: compute per-entry earlyMs and validate server aggregate using 1-hour heuristic
      const computedEarly = esAll.reduce((a: number, e: any) => a + attendanceTime.entryEarlyMs(e, v, esAll), 0)
      if (typeof v?.earlyMs === 'number') {
        if (esAll.length > 0) {
          const diff = Math.abs(Number(v.earlyMs) - computedEarly)
          earlyMsTotal += diff > 60 * 60 * 1000 ? computedEarly : Number(v.earlyMs)
        }
        else {
          earlyMsTotal += Number(v.earlyMs)
        }
      }
      else {
        earlyMsTotal += computedEarly
      }
    }

    const lateHours = Math.round((lateMsTotal / 3600000) * 100) / 100
    const earlyHours = Math.round((earlyMsTotal / 3600000) * 100) / 100

    return {
      userId: row.userId,
      name: row.name,
      username: row.username,
      email: row.email,
      totalWorkingDays,
      harian,
      bantuan,
      lateHours,
      earlyHours,
    }
  })
})

const recentRecapColumns: TableColumn<any>[] = [
  { header: 'Name', accessorKey: 'name', size: 220 },
  { header: 'Total Days', accessorKey: 'totalWorkingDays', size: 120 },
  { header: 'Harian', accessorKey: 'harian', size: 100 },
  { header: 'Bantuan', accessorKey: 'bantuan', size: 100 },
  { header: 'Late Hours', accessorKey: 'lateHours', size: 140 },
  { header: 'Early Leave Hours', accessorKey: 'earlyHours', size: 160 },
]

// Chart color follows the resolved theme primary color. We populate `primaryColor` on mount.
const chartOptions = computed(() => ({
  chart: { id: 'presence-chart', toolbar: { show: false }, stacked: true },
  colors: [primaryColor.value, secondaryColor.value],
  fill: { colors: [primaryColor.value, secondaryColor.value] },
  xaxis: { categories: data.value.days?.map((d: string) => d.split('-').pop()) || [] },
  yaxis: { title: { text: 'Users present' } },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth' as const },
}))

// Produce two series: 'Harian' and 'Bantuan'. We assume attendance data rows aggregate shifts per day
// by `workingShifts`, `harian`, and `bantuan` fields when present. Otherwise we fallback to counting entries.
const chartSeries = computed(() => {
  const days = data.value.days || []
  const rows = data.value.rows || []
  // Count present per day for each type
  const harianCounts = days.map((d: string) => rows.reduce((acc: number, row: any) => {
    const cell = row.byDate?.[d]
    if (!cell) return acc
    if (typeof cell.harian === 'number') return acc + Number(cell.harian)
    // fallback: count entries marked harian (entry.shiftType === 'harian')
    const entries = attendanceTime.normalizeCell(cell)
    return acc + entries.filter((e: any) => e?.shiftType === 'harian' && e?.clockIn).length
  }, 0))

  const bantuanCounts = days.map((d: string) => rows.reduce((acc: number, row: any) => {
    const cell = row.byDate?.[d]
    if (!cell) return acc
    if (typeof cell.bantuan === 'number') return acc + Number(cell.bantuan)
    const entries = attendanceTime.normalizeCell(cell)
    return acc + entries.filter((e: any) => e?.shiftType === 'bantuan' && e?.clockIn).length
  }, 0))

  return [
    { name: 'Harian', data: harianCounts },
    { name: 'Bantuan', data: bantuanCounts },
  ]
})

function formatPercent(v: number) {
  return `${v}%`
}

// Helpers copied/kept lightweight for recap calculations

// dayEarlyMs removed; use entry-level helpers below

// helpers imported from composable: ensureShifts, shiftsMap, normalizeCell, entryLateMs, entryEarlyMs, humanizeMinutes

// month is changed via `v-model` on USelect; use `load()` when needed

const monthOptions = computed(() => {
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

definePageMeta({
  title: 'Admin Dashboard',
  pageTitle: 'Dashboard - Admin - Attendance App',
})
</script>

<template>
  <PageWrapper>
    <!-- <template #navLeft>
      <h1 class="text-2xl font-semibold">
        Admin Dashboard
      </h1>
    </template> -->
    <template #navRight>
      <div class="flex items-center gap-3">
        <label class="text-sm text-muted">Month</label>
        <USelect
          v-model="month"
          class="w-52"
          :items="monthOptions"
          option-attribute="label"
          value-attribute="value"
        />
        <UButton
          :loading="isLoading"
          @click="refreshAll"
        >
          Refresh
        </UButton>
      </div>
    </template>

    <div class="space-y-6 p-6">
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <UCard>
          <div class="text-sm text-muted">
            Total Users
          </div>
          <div class="text-xl font-semibold">
            {{ totalUsers }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-muted">
            Days in Month
          </div>
          <div class="text-xl font-semibold">
            {{ totalDays }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-muted">
            Presence %
          </div>
          <div class="text-xl font-semibold">
            {{ formatPercent(percentPresent) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-muted">
            Avg Late / User
          </div>
          <div class="text-xl font-semibold">
            {{ averageLatePerUser }}
          </div>
        </UCard>
      </div>

      <UCard>
        <div class="mb-4">
          <strong>Daily Presence</strong>
        </div>
        <div>
          <client-only>
            <div v-if="ApexChart" class="admin-presence-chart">
              <component
                :is="ApexChart"
                type="bar"
                :options="chartOptions"
                :series="chartSeries"
                height="320"
              />
            </div>
            <div v-else class="text-sm text-muted">
              Chart loading...
            </div>
          </client-only>
        </div>
      </UCard>

      <div class="space-y-4">
        <UCard>
          <div class="mb-3">
            <strong>User Recap</strong>
          </div>
          <UTable :data="recentRecap" :columns="recentRecapColumns">
            <template #name-cell="{ row }">
              {{ row.original.name }}
            </template>
            <template #totalWorkingDays-cell="{ row }">
              {{ row.original.totalWorkingDays }}
            </template>
            <template #harian-cell="{ row }">
              {{ row.original.harian }}
            </template>
            <template #bantuan-cell="{ row }">
              {{ row.original.bantuan }}
            </template>
            <template #lateHours-cell="{ row }">
              {{ row.original.lateHours }}
            </template>
            <template #earlyHours-cell="{ row }">
              {{ row.original.earlyHours }}
            </template>
          </UTable>
        </UCard>
      </div>
    </div>
  </PageWrapper>
</template>

<style scoped>
.text-muted { color: var(--u-color-muted, #6b7280); }
  .admin-presence-chart :deep(.apexcharts-bar-area .apexcharts-series.apexcharts-series-0 .apexcharts-bar-path) {
    fill: var(--u-color-primary-500, #efb100) !important;
  }
</style>
