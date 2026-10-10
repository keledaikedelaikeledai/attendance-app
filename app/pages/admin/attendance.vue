<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import * as attendanceTime from '~/composables/useAttendanceTime'

const { t } = useI18n()

definePageMeta({
  title: 'Attendance',
  pageTitle: 'Attendance - Admin - Attendance App',
})

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const month = ref<string>(new Date().toISOString().slice(0, 7))

const { data, refresh, status } = await useFetch('/api/admin/attendance', {
  query: { month },
  credentials: 'include',
})

const days = computed(() => data.value?.days || [])
const normalizedRows = computed(() =>
  attendanceTime.normalizeRowsCrossday((data.value?.rows || []) as any[], days.value),
)
const fetching = computed(() => status.value === 'pending')

// ---------------------------------------------------------------------------
// Per-employee summary
// ---------------------------------------------------------------------------
interface EmployeeStats {
  key: string
  userId: string
  email: string
  name: string
  username: string
  byDate: Record<string, any>
  workingDays: number
  harianDays: number
  bantuanDays: number
  lateCount: number
  earlyCount: number
  lastLate: boolean
  lastEarly: boolean
}

const employees = computed<EmployeeStats[]>(() =>
  normalizedRows.value.map((row: any) => {
    const byDate = attendanceTime.normalizeByDateCrossday(row.byDate || {}, days.value)

    let workingDays = 0
    let harianDays = 0
    let bantuanDays = 0
    let lateCount = 0
    let earlyCount = 0
    let lastDate = ''
    let lastLate = false
    let lastEarly = false

    for (const [date, cell] of Object.entries(byDate)) {
      const entries = attendanceTime.normalizeCell(cell).filter((e: any) => e?.clockIn)
      if (!entries.length)
        continue

      workingDays += entries.length
      for (const e of entries) {
        if (e.shiftType === 'harian')
          harianDays++
        else if (e.shiftType === 'bantuan')
          bantuanDays++

        const late = attendanceTime.entryLateMs(e) > 0
        const early = attendanceTime.entryEarlyMs(e) > 0
        if (late)
          lateCount++
        if (early)
          earlyCount++

        if (date >= lastDate) {
          lastDate = date
          lastLate = late
          lastEarly = early
        }
      }
    }

    return {
      key: row.userId || row.email || row.name,
      userId: row.userId || '',
      email: row.email || '',
      name: row.name || row.username || row.email || 'Unknown',
      username: row.username || '',
      byDate,
      workingDays,
      harianDays,
      bantuanDays,
      lateCount,
      earlyCount,
      lastLate,
      lastEarly,
    }
  }),
)

const totalLate = computed(() => employees.value.reduce((a, e) => a + e.lateCount, 0))
const totalEarly = computed(() => employees.value.reduce((a, e) => a + e.earlyCount, 0))

const summary = computed(() => {
  const lowAttendance = employees.value.filter(e => e.workingDays < days.value.length * 0.6).length
  const lateHigh = employees.value.filter(e => e.lateCount >= 3).length
  return {
    totalEmployees: employees.value.length,
    totalWorkingDays: employees.value.reduce((a, e) => a + e.workingDays, 0),
    lowAttendance,
    lateHigh,
  }
})

// ---------------------------------------------------------------------------
// Row expansion
// ---------------------------------------------------------------------------
const expandedKey = ref<string | null>(null)

function toggleRow(key: string) {
  expandedKey.value = expandedKey.value === key ? null : key
}

// ---------------------------------------------------------------------------
// Day cell helpers
// ---------------------------------------------------------------------------
interface DayState {
  worked: boolean
  harian: boolean
  bantuan: boolean
}

function dayState(cell: any): DayState {
  const entries = attendanceTime.normalizeCell(cell).filter((e: any) => e?.clockIn)
  return {
    worked: entries.length > 0,
    harian: entries.some((e: any) => e.shiftType === 'harian'),
    bantuan: entries.some((e: any) => e.shiftType === 'bantuan'),
  }
}

function dayLabel(state: DayState): string {
  if (state.harian && state.bantuan)
    return 'H·B'
  if (state.harian)
    return 'H'
  if (state.bantuan)
    return 'B'
  return '·'
}

function dayBadgeColor(state: DayState): 'primary' | 'info' | 'neutral' {
  if (state.harian)
    return 'primary'
  if (state.bantuan)
    return 'info'
  return 'neutral'
}

function dayTitle(day: string, state: DayState): string {
  if (!state.worked)
    return day
  const parts: string[] = []
  if (state.harian)
    parts.push(t('admin.attendance.harian'))
  if (state.bantuan)
    parts.push(t('admin.attendance.bantuan'))
  return `${day} · ${parts.join(' + ')}`
}

// ---------------------------------------------------------------------------
// Month selector
// ---------------------------------------------------------------------------
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

const monthLabel = computed(
  () => monthOptions.value.find(o => o.value === month.value)?.label ?? month.value,
)
</script>

<template>
  <PageWrapper>
    <template #navRight>
      <div class="flex items-center gap-3">
        <SSelect
          v-model="month"
          class="w-44 sm:w-56"
          :items="monthOptions"
          label-key="label"
          value-key="value"
        />
        <SButton
          icon="i-heroicons-arrow-path"
          :loading="fetching"
          class="hidden md:inline-flex"
          @click="() => { void refresh() }"
        >
          {{ t('admin.attendance.refresh') }}
        </SButton>
      </div>
    </template>

    <div class="space-y-6 p-6">
      <!-- Title -->
      <div>
        <h1 class="text-2xl font-semibold text-[var(--selaras-resolved-text-default)]">
          {{ t('admin.attendance.title') }}
        </h1>
        <p class="mt-1 text-sm text-[var(--selaras-resolved-text-muted)]">
          {{ monthLabel }}
        </p>
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SCard>
          <div class="flex items-start gap-3.5">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--selaras-resolved-border-muted)] bg-[var(--selaras-resolved-surface-elevated)]">
              <SIcon name="i-heroicons-user-group" class="h-5 w-5 text-[var(--selaras-resolved-text-muted)]" />
            </div>
            <div class="min-w-0">
              <div class="text-sm text-[var(--selaras-resolved-text-muted)]">
                {{ t('admin.attendance.totalEmployees') }}
              </div>
              <div class="text-2xl font-semibold leading-tight">
                {{ summary.totalEmployees }}
              </div>
            </div>
          </div>
        </SCard>

        <SCard>
          <div class="flex items-start gap-3.5">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--selaras-resolved-border-muted)] bg-[var(--selaras-resolved-surface-elevated)]">
              <SIcon name="i-heroicons-calendar-check" class="h-5 w-5 text-[var(--selaras-resolved-text-muted)]" />
            </div>
            <div class="min-w-0">
              <div class="text-sm text-[var(--selaras-resolved-text-muted)]">
                {{ t('admin.attendance.totalWorkingDays') }}
              </div>
              <div class="text-2xl font-semibold leading-tight">
                {{ summary.totalWorkingDays }}
              </div>
            </div>
          </div>
        </SCard>

        <SCard>
          <div class="flex items-start gap-3.5">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--selaras-resolved-border-muted)] bg-[var(--selaras-resolved-surface-elevated)]">
              <SIcon name="i-heroicons-exclamation-triangle" class="h-5 w-5 text-[var(--selaras-resolved-text-muted)]" />
            </div>
            <div class="min-w-0">
              <div class="text-sm text-[var(--selaras-resolved-text-muted)]">
                {{ t('admin.attendance.lowAttendance') }}
              </div>
              <div class="flex items-center gap-2">
                <span class="text-2xl font-semibold leading-tight">{{ summary.lowAttendance }}</span>
                <SBadge
                  v-if="summary.lowAttendance > 0"
                  color="warning"
                  variant="soft"
                  size="sm"
                >
                  {{ t('admin.attendance.needsAttention') }}
                </SBadge>
              </div>
            </div>
          </div>
        </SCard>

        <SCard>
          <div class="flex items-start gap-3.5">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--selaras-resolved-border-muted)] bg-[var(--selaras-resolved-surface-elevated)]">
              <SIcon name="i-heroicons-clock" class="h-5 w-5 text-[var(--selaras-resolved-text-muted)]" />
            </div>
            <div class="min-w-0">
              <div class="text-sm text-[var(--selaras-resolved-text-muted)]">
                {{ t('admin.attendance.lateHigh') }}
              </div>
              <div class="flex items-center gap-2">
                <span class="text-2xl font-semibold leading-tight">{{ summary.lateHigh }}</span>
                <SBadge
                  v-if="summary.lateHigh > 0"
                  color="danger"
                  variant="soft"
                  size="sm"
                >
                  {{ t('admin.attendance.followUp') }}
                </SBadge>
              </div>
            </div>
          </div>
        </SCard>
      </div>

      <!-- Employee attendance -->
      <SCard :ui="{ body: 'p-0' }">
        <!-- Column header -->
        <div class="hidden items-center gap-3 border-b border-[var(--selaras-resolved-border-muted)] px-4 py-3 text-xs font-medium text-[var(--selaras-resolved-text-muted)] sm:flex">
          <div class="min-w-0 flex-1">
            {{ t('admin.attendance.employee') }}
          </div>
          <div class="w-24 text-center">
            {{ t('admin.attendance.worked') }}
          </div>
          <div class="hidden w-44 justify-center gap-4 lg:flex">
            <span>{{ t('admin.attendance.harian') }}</span>
            <span>{{ t('admin.attendance.bantuan') }}</span>
          </div>
          <div class="w-28 text-right">
            {{ t('admin.attendance.status') }}
          </div>
        </div>

        <!-- Loading -->
        <div v-if="fetching" class="flex items-center justify-center py-16 text-[var(--selaras-resolved-text-muted)]">
          <SIcon name="i-heroicons-arrow-path" class="mr-2 h-5 w-5 animate-spin" />
          {{ t('admin.attendance.loading') }}
        </div>

        <!-- Empty -->
        <div v-else-if="employees.length === 0" class="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <SIcon name="i-heroicons-clipboard-document-list" class="h-8 w-8 text-[var(--selaras-resolved-text-muted)]" />
          <div class="font-medium text-[var(--selaras-resolved-text-default)]">
            {{ t('admin.attendance.emptyTitle') }}
          </div>
          <div class="text-sm text-[var(--selaras-resolved-text-muted)]">
            {{ t('admin.attendance.emptySubtitle') }}
          </div>
        </div>

        <!-- Rows -->
        <template v-else>
          <div
            v-for="emp in employees"
            :key="emp.key"
            class="border-b border-[var(--selaras-resolved-border-muted)] last:border-b-0"
          >
            <button
              class="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--selaras-resolved-surface-elevated)] sm:flex-nowrap"
              @click="toggleRow(emp.key)"
            >
              <!-- Employee -->
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <div class="relative shrink-0">
                  <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--selaras-color-primary-subtle)] text-xs font-medium text-[var(--selaras-color-primary-text)]">
                    {{ emp.name.charAt(0).toUpperCase() }}
                  </div>
                  <span
                    v-if="emp.lastLate || emp.lastEarly"
                    class="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--selaras-resolved-surface-elevated)]"
                    :class="emp.lastLate ? 'bg-amber-500' : 'bg-sky-500'"
                  />
                </div>
                <div class="min-w-0">
                  <div class="truncate font-medium text-[var(--selaras-resolved-text-default)]">
                    {{ emp.name }}
                  </div>
                  <div class="truncate text-xs text-[var(--selaras-resolved-text-muted)]">
                    @{{ emp.username || emp.email }}
                  </div>
                </div>
              </div>

              <!-- Worked -->
              <div class="w-24 text-center font-medium tabular-nums">
                {{ emp.workingDays }}<span class="text-[var(--selaras-resolved-text-muted)]">/{{ days.length }}</span>
              </div>

              <!-- Shift breakdown -->
              <div class="hidden w-44 justify-center gap-2 lg:flex">
                <SBadge color="primary" variant="soft" size="sm">
                  {{ t('admin.attendance.harian') }} {{ emp.harianDays }}
                </SBadge>
                <SBadge color="info" variant="soft" size="sm">
                  {{ t('admin.attendance.bantuan') }} {{ emp.bantuanDays }}
                </SBadge>
              </div>

              <!-- Status -->
              <div class="flex w-28 justify-end">
                <SBadge
                  v-if="emp.lateCount === 0 && emp.earlyCount === 0"
                  color="success"
                  variant="soft"
                  size="sm"
                  icon="i-heroicons-check"
                >
                  {{ t('admin.attendance.onTime') }}
                </SBadge>
                <SBadge
                  v-else-if="emp.lateCount > 0 && emp.earlyCount === 0"
                  color="warning"
                  variant="soft"
                  size="sm"
                >
                  {{ t('admin.attendance.lateCount') }} {{ emp.lateCount }}
                </SBadge>
                <SBadge
                  v-else-if="emp.lateCount === 0 && emp.earlyCount > 0"
                  color="info"
                  variant="soft"
                  size="sm"
                >
                  {{ t('admin.attendance.earlyCount') }} {{ emp.earlyCount }}
                </SBadge>
                <SBadge
                  v-else
                  color="danger"
                  variant="soft"
                  size="sm"
                >
                  {{ emp.lateCount }}D · {{ emp.earlyCount }}E
                </SBadge>
              </div>
            </button>

            <!-- Expanded: month grid -->
            <div
              v-if="expandedKey === emp.key"
              class="mx-4 mb-4 rounded-lg border border-[var(--selaras-resolved-border-muted)] p-4"
            >
              <div class="mb-3 text-xs font-medium text-[var(--selaras-resolved-text-muted)]">
                {{ t('admin.attendance.thisMonth') }}
              </div>

              <div class="flex flex-wrap gap-1.5">
                <div v-for="day in days" :key="day" :title="dayTitle(day, dayState(emp.byDate[day]))">
                  <SBadge
                    :color="dayBadgeColor(dayState(emp.byDate[day]))"
                    :variant="dayState(emp.byDate[day]).worked ? 'soft' : 'outline'"
                    size="sm"
                    class="w-9 justify-center tabular-nums"
                  >
                    {{ dayLabel(dayState(emp.byDate[day])) }}
                  </SBadge>
                </div>
              </div>

              <!-- Legend -->
              <div class="mt-4 flex flex-wrap items-center gap-4 text-xs text-[var(--selaras-resolved-text-muted)]">
                <div class="flex items-center gap-1.5">
                  <SBadge
                    color="primary"
                    variant="soft"
                    size="sm"
                    class="w-9 justify-center"
                  >
                    H
                  </SBadge>
                  <span>{{ t('admin.attendance.harian') }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <SBadge
                    color="info"
                    variant="soft"
                    size="sm"
                    class="w-9 justify-center"
                  >
                    B
                  </SBadge>
                  <span>{{ t('admin.attendance.bantuan') }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <SBadge
                    color="neutral"
                    variant="outline"
                    size="sm"
                    class="w-9 justify-center"
                  >
                    ·
                  </SBadge>
                  <span>{{ t('admin.attendance.absent') }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer totals -->
          <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-[var(--selaras-resolved-text-muted)]">
            <div class="flex items-center gap-4">
              <span>{{ t('admin.attendance.lateCount') }}: <strong class="text-[var(--selaras-resolved-text-default)]">{{ totalLate }}</strong></span>
              <span>{{ t('admin.attendance.earlyCount') }}: <strong class="text-[var(--selaras-resolved-text-default)]">{{ totalEarly }}</strong></span>
            </div>
            <span>{{ employees.length }} {{ t('admin.attendance.employees') }}</span>
          </div>
        </template>
      </SCard>
    </div>
  </PageWrapper>
</template>
