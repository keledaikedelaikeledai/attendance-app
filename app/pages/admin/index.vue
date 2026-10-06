<script setup lang="ts">
import type { TableColumnDef } from '@sewadah/selaras/table'
import { useI18n } from 'vue-i18n'
// `computed`, `ref`, `onMounted`, etc. are auto-imported by Nuxt; do not import from 'vue' explicitly

// useI18n imported once below
import * as attendanceTime from '~/composables/useAttendanceTime'

const { t } = useI18n()

const month = ref(new Date().toISOString().slice(0, 7)) // YYYY-MM

// useFetch for attendance (reactive to `month`) and users
const { data: attendanceData, pending: attendancePending, refresh: refreshAttendance } = useFetch('/api/admin/attendance', { method: 'get', credentials: 'include', query: { month } })
const data = computed(() => attendanceData.value ?? { month: '', days: [], rows: [] })
const normalizedRows = computed(() => attendanceTime.normalizeRowsCrossday((data.value?.rows || []) as any[], data.value?.days || []))
const isLoading = computed(() => Boolean(attendancePending.value))

const ApexChart = shallowRef<any>(null)
const primaryColor = ref('#2563eb')
const emptyCellColor = ref('#e5e7eb')

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
          '--selaras-resolved-color-primary-fill',
          '--selaras-color-primary-fill',
          '--color-primary-500',
        ].map(k => style.getPropertyValue(k)).find(v => v && v.trim()) || ''
      ).trim()

      if (foundRaw) {
        // Resolve the oklch() custom property to a concrete rgb() string via a
        // canvas: getComputedStyle returns oklch() verbatim in Chrome, which we
        // cannot parse as RGB components for mixing.
        try {
          const cv = document.createElement('canvas')
          cv.width = cv.height = 1
          const cx = cv.getContext('2d')!
          cx.fillStyle = foundRaw
          cx.fillRect(0, 0, 1, 1)
          const [r, g, b] = cx.getImageData(0, 0, 1, 1).data
          primaryColor.value = `rgb(${r}, ${g}, ${b})`
        }
        catch {
          primaryColor.value = foundRaw
        }
      }

      // Empty cells use the theme border color so "no work logged" reads as a
      // neutral gap in both light and dark mode.
      try {
        const foundB = (
          ['--selaras-resolved-border-default', '--selaras-resolved-border-muted']
            .map(k => style.getPropertyValue(k))
            .find(v => v && v.trim()) || ''
        ).trim()
        if (foundB) {
          const cvB = document.createElement('canvas')
          cvB.width = cvB.height = 1
          const cxB = cvB.getContext('2d')!
          cxB.fillStyle = foundB
          cxB.fillRect(0, 0, 1, 1)
          const [r2, g2, b2] = cxB.getImageData(0, 0, 1, 1).data
          emptyCellColor.value = `rgb(${r2}, ${g2}, ${b2})`
        }
      }
      catch {
        // keep the fallback
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
    return (normalizedRows.value || []).reduce((acc: number, row: any) => {
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

const lateCountsPerUser = computed(() => (normalizedRows.value || []).map((row: any) => {
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
  const rows = normalizedRows.value || []
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

const recentRecapColumns = computed<TableColumnDef<any>[]>(() => [
  { header: t('admin.index.name'), accessorKey: 'name', size: 220 },
  { header: t('admin.index.totalDays'), accessorKey: 'totalWorkingDays', size: 120 },
  { header: t('admin.index.harian'), accessorKey: 'harian', size: 100 },
  { header: t('admin.index.bantuan'), accessorKey: 'bantuan', size: 100 },
  { header: t('admin.index.lateHours'), accessorKey: 'lateHours', size: 140 },
  { header: t('admin.index.earlyHours'), accessorKey: 'earlyHours', size: 160 },
])

// Heatmap: one row per user, one column per day, color intensity = hours worked.
// A single theme color with ApexCharts shades is the closest match to the
// ui-thing heatmap example without hard-coding a ramp.
const heatmapHeight = computed(() => {
  const users = (normalizedRows.value || []).length
  return Math.max(280, Math.min(560, users * 28 + 60))
})

function dayWorkedHours(row: any, d: string): number {
  const cell = row.byDate?.[d]
  if (!cell) return 0
  const entries = attendanceTime.normalizeCell(cell)
  const ms = entries.reduce((a: number, e: any) => {
    if (!e?.clockIn || !e?.clockOut) return a
    return a + (new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime())
  }, 0)
  return Math.round((ms / 3600000) * 10) / 10
}

const heatmapSeries = computed(() => {
  const days = data.value.days || []
  return (normalizedRows.value || []).map((row: any) => ({
    name: row.name || row.username || row.email,
    data: days.map((d: string) => ({ x: d.split('-').pop(), y: dayWorkedHours(row, d) })),
  }))
})

// Mix a resolved `rgb(r,g,b)` string toward white (light) or black (dark) by
// `ratio` in [0,1]. Used to build a 3-step theme ramp for the heatmap.
function mixColor(resolved: string, ratio: number, dark: boolean): string {
  const m = resolved.match(/\d+(\.\d+)?/g)
  if (!m || m.length < 3) return resolved
  const [r, g, b] = m.slice(0, 3).map(Number)
  const target = dark ? 0 : 255
  const mix = (c: number) => Math.round(c + (target - c) * ratio)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

const heatmapOptions = computed(() => {
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const base = primaryColor.value
  return {
    chart: { toolbar: { show: false } },
    colors: [base],
    plotOptions: {
      heatmap: {
        // Without this, ApexCharts re-shades every range colour with its own
        // white/black ramp and the theme colours never reach the cells.
        enableShades: false,
        colorScale: {
          ranges: [
            { from: -1, to: 0, color: emptyCellColor.value, name: 'none' },
            { from: 0.01, to: 4, color: mixColor(base, 0.8, dark), name: 'light' },
            { from: 4.01, to: 8, color: mixColor(base, 0.45, dark), name: 'moderate' },
            { from: 8.01, to: 24, color: base, name: 'full' },
          ],
        },
      },
    },
    dataLabels: { enabled: false },
    stroke: { colors: ['var(--selaras-resolved-surface-elevated, #ffffff)'], width: 2 },
    grid: { borderColor: 'var(--selaras-resolved-border-muted, #e5e7eb)' },
    xaxis: {
      position: 'top' as const,
      labels: { rotate: -45, hideOverlappingLabels: true, trim: true },
    },
    yaxis: { labels: { trim: true } },
    tooltip: { y: { formatter: (v: number) => `${v}h` } },
  }
})

const totalLateUserDays = computed(() =>
  lateCountsPerUser.value.reduce((a: number, u: any) => a + (u.lateCount || 0), 0),
)

const statCards = computed(() => [
  {
    key: 'users',
    label: t('admin.index.totalUsers'),
    value: String(totalUsers.value),
    sub: t('admin.index.totalUsersSub'),
    icon: 'i-heroicons-users',
  },
  {
    key: 'days',
    label: t('admin.index.daysInMonth'),
    value: String(totalDays.value),
    sub: t('admin.index.daysInMonthSub'),
    icon: 'i-heroicons-calendar-days',
  },
  {
    key: 'presence',
    label: t('admin.index.presencePercent'),
    value: `${percentPresent.value}%`,
    sub: t('admin.index.presenceSub', { present: totalPresent.value, total: totalUsers.value * totalDays.value }),
    icon: 'i-heroicons-check-badge',
  },
  {
    key: 'late',
    label: t('admin.index.avgLatePerUser'),
    value: String(averageLatePerUser.value),
    sub: t('admin.index.avgLateSub', { days: totalLateUserDays.value }),
    icon: 'i-heroicons-clock',
  },
])

// Helpers copied/kept lightweight for recap calculations

// dayEarlyMs removed; use entry-level helpers below

// helpers imported from composable: ensureShifts, shiftsMap, normalizeCell, entryLateMs, entryEarlyMs, humanizeMinutes

// month is changed via `v-model` on SSelect; use `load()` when needed

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
    <template #navRight>
      <div class="flex items-center gap-3">
        <label class="text-sm text-muted">{{ t('admin.index.month') }}</label>
        <SSelect
          v-model="month"
          class="w-52"
          :items="monthOptions"
          label-key="label"
          value-key="value"
        />
        <SButton
          icon="i-heroicons-arrow-path"
          :loading="isLoading"
          class="hidden md:inline-flex"
          @click="refreshAll"
        >
          {{ t('admin.index.refresh') }}
        </SButton>
      </div>
    </template>

    <div class="space-y-6 p-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SCard v-for="card in statCards" :key="card.key">
          <div class="flex items-start gap-3.5">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--selaras-resolved-border-muted)] bg-[var(--selaras-resolved-surface-elevated)]">
              <SIcon :name="card.icon" class="h-5 w-5 text-[var(--selaras-resolved-color-primary-fill,#2563eb)]" />
            </div>
            <div class="min-w-0">
              <div class="text-sm text-muted">
                {{ card.label }}
              </div>
              <div class="text-2xl font-semibold leading-tight">
                {{ card.value }}
              </div>
              <div class="mt-0.5 text-xs text-muted">
                {{ card.sub }}
              </div>
            </div>
          </div>
        </SCard>
      </div>

      <SCard>
        <div class="mb-1 flex items-baseline justify-between">
          <strong>{{ t('admin.index.heatmapTitle') }}</strong>
        </div>
        <div class="mb-4 text-xs text-muted">
          {{ t('admin.index.heatmapDesc') }}
        </div>
        <div>
          <client-only>
            <div v-if="ApexChart" class="admin-presence-chart">
              <component
                :is="ApexChart"
                type="heatmap"
                :options="heatmapOptions"
                :series="heatmapSeries"
                :height="heatmapHeight"
              />
            </div>
            <div v-else class="text-sm text-muted">
              {{ t('admin.index.heatmapLoading') }}
            </div>
          </client-only>
        </div>
      </SCard>

      <div class="space-y-4">
        <SCard>
          <div class="mb-1">
            <strong>{{ t('admin.index.userRecap') }}</strong>
          </div>
          <div class="mb-3 text-xs text-muted">
            {{ t('admin.index.userRecapDesc') }}
          </div>
          <!-- Cells render the raw field value, which is TanStack default. The
               per-column size widths live in recentRecapColumns, so the :columns
               escape hatch is kept rather than SColumn children (no width prop). -->
          <STable :data="recentRecap" :columns="recentRecapColumns" />
        </SCard>
      </div>
    </div>
  </PageWrapper>
</template>

<style scoped>
.text-muted { color: var(--selaras-resolved-text-muted, #6b7280); }
  /* Target the bare <path> in the first series group. apexcharts 7 dropped the
     `.apexcharts-bar-path` class this relied on, which left the rule dead. */
  .admin-presence-chart :deep(.apexcharts-bar-area .apexcharts-series.apexcharts-series-0 path) {
    fill: var(--selaras-resolved-color-primary-fill, #efb100) !important;
  }
</style>
