<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
// `computed`, `ref`, `onMounted`, etc. are auto-imported by Nuxt; do not import from 'vue' explicitly

const month = ref(new Date().toISOString().slice(0, 7)) // YYYY-MM

// useFetch for attendance (reactive to `month`) and users
const { data: attendanceData, pending: attendancePending, refresh: refreshAttendance } = useFetch('/api/admin/attendance', { method: 'get', credentials: 'include', query: { month } })
const data = computed(() => attendanceData.value ?? { month: '', days: [], rows: [] })
const isLoading = computed(() => Boolean(attendancePending.value))

const ApexChart = shallowRef<any>(null)
const primaryColor = ref('#2563eb')

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
      const found = (style.getPropertyValue('--u-color-primary') || style.getPropertyValue('--u-color-primary-500') || style.getPropertyValue('--u-color-primary-600') || style.getPropertyValue('--u-primary') || '').trim()
      if (found) {
        // ApexCharts works best with hex/rgb values. If the variable is in OKLCH form, fall back to provided hex.
        if (found.startsWith('oklch')) {
          primaryColor.value = '#efb100'
        }
        else {
          primaryColor.value = found
        }
      }
    }
    catch {
      // ignore
    }
  }
  // initial fetch is handled by useFetch; nothing else needed here
})

const totalUsers = computed(() => data.value.rows?.length || 0)
const totalDays = computed(() => data.value.days?.length || 0)

const presentCountsPerDay = computed(() => {
  const days = data.value.days || []
  return days.map((d: string) => {
    return (data.value.rows || []).reduce((acc: number, row: any) => acc + (row.byDate?.[d]?.clockIn ? 1 : 0), 0)
  })
})

const totalPresent = computed(() => presentCountsPerDay.value.reduce((a: number, b: number) => a + b, 0))
const percentPresent = computed(() => {
  const denom = totalUsers.value * totalDays.value
  return denom ? Math.round((totalPresent.value / denom) * 10000) / 100 : 0
})

const lateCountsPerUser = computed(() => (data.value.rows || []).map((row: any) => {
  const days = data.value.days || []
  const count = days.reduce((acc: number, d: string) => acc + ((row.byDate?.[d]?.lateMs || 0) > 0 ? 1 : 0), 0)
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
      const present = !!(v.clockIn || v.clockOut)
      if (!present) continue
      totalWorkingDays++
      if (v.shiftType === 'harian') harian++
      if (v.shiftType === 'bantuan') bantuan++
      lateMsTotal += Number(v.lateMs || 0)

      if (v.clockOut && v.shift?.end) {
        try {
          const parts = d.split('-').map(s => Number(s))
          const [y, m, day] = parts
          const [ehStr, emStr] = (v.shift.end || '').split(':')
          const eh = Number(ehStr)
          const em = Number(emStr)
          if ([y, m, day, eh, em].every(n => typeof n === 'number' && !Number.isNaN(n))) {
            const expectedEnd = new Date(y as number, (m as number) - 1, day as number, eh as number, em as number, 0, 0)
            const actualOut = new Date(v.clockOut)
            const diff = expectedEnd.getTime() - actualOut.getTime()
            if (diff > 0) {
              earlyMsTotal += diff
            }
          }
        }
        catch {
          // ignore parse errors
        }
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

const EXPLICIT_PRIMARY = '#efb100'
const chartOptions = computed(() => ({
  chart: { id: 'presence-chart', toolbar: { show: false } },
  colors: [EXPLICIT_PRIMARY],
  fill: { colors: [EXPLICIT_PRIMARY] },
  xaxis: { categories: data.value.days?.map((d: string) => d.split('-').pop()) || [] },
  yaxis: { title: { text: 'Users present' } },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth' as const },
}))

const chartSeries = computed(() => ([{ name: 'Present', data: presentCountsPerDay.value }]))

function formatPercent(v: number) {
  return `${v}%`
}

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
    fill: #efb100 !important;
  }
</style>
