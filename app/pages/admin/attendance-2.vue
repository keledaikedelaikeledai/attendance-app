<script setup lang="ts">
import { CalendarDate } from '@internationalized/date'
import { useI18n } from 'vue-i18n'

import * as attendanceTime from '~/composables/useAttendanceTime'

const { t } = useI18n()

definePageMeta({
  title: 'Attendance 2',
  pageTitle: 'Attendance 2 - Admin - Attendance App',
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
      }

      // lateMs/earlyMs are aggregated on the day cell by the server; the
      // individual shift entries do not carry them, so read the cell values.
      const late = Number(cell?.lateMs) > 0
      const early = Number(cell?.earlyMs) > 0
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

// ---------------------------------------------------------------------------
// Team overview calendar
// ---------------------------------------------------------------------------
interface DayPerson {
  name: string
  initials: string
  harian: boolean
  bantuan: boolean
}

// Avatars are generated initials (no profile images). The colour is hashed from
// a stable seed so a given employee keeps the same one, and only from roles that
// do not carry state.
const AVATAR_COLORS = ['primary', 'secondary', 'info', 'neutral'] as const

function avatarColor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++)
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length)
    return '?'
  if (parts.length === 1)
    return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function personTitle(person: DayPerson): string {
  const types: string[] = []
  if (person.harian)
    types.push(t('admin.attendance.harian'))
  if (person.bantuan)
    types.push(t('admin.attendance.bantuan'))
  return types.length ? `${person.name} · ${types.join(' + ')}` : person.name
}

const teamByDate = computed<Record<string, DayPerson[]>>(() => {
  const map: Record<string, DayPerson[]> = {}
  for (const emp of employees.value) {
    for (const [date, cell] of Object.entries(emp.byDate)) {
      const entries = attendanceTime.normalizeCell(cell).filter((e: any) => e?.clockIn)
      if (!entries.length)
        continue

      if (!map[date])
        map[date] = []
      map[date].push({
        name: emp.name,
        initials: initials(emp.name),
        harian: entries.some((e: any) => e.shiftType === 'harian'),
        bantuan: entries.some((e: any) => e.shiftType === 'bantuan'),
      })
    }
  }
  for (const date of Object.keys(map))
    map[date].sort((a, b) => a.name.localeCompare(b.name))
  return map
})

const MAX_CHIPS = 6

function peopleForDate(date: { toString: () => string }): DayPerson[] {
  return teamByDate.value[date.toString()] || []
}

// SAvatarGroup's `max`/overlap do not work with v-for children (the slot
// compiles to a single Fragment vnode), so the day-cell stack is capped here.
function visiblePeople(date: { toString: () => string }): DayPerson[] {
  return peopleForDate(date).slice(0, MAX_CHIPS)
}

function overflowForDate(date: { toString: () => string }): number {
  return Math.max(0, peopleForDate(date).length - MAX_CHIPS)
}

function overflowTitle(date: { toString: () => string }): string {
  return peopleForDate(date).slice(MAX_CHIPS).map(personTitle).join(', ')
}

// Displays the selected month, kept in sync with the page month selector.
const calendarMonth = computed({
  get: () => {
    const [y, m] = month.value.split('-').map(Number)
    return new CalendarDate(y, m, 1)
  },
  set: (value) => {
    if (!value)
      return
    month.value = `${value.year}-${String(value.month).padStart(2, '0')}`
  },
})
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
                <SAvatar
                  :text="initials(emp.name)"
                  :color="avatarColor(emp.key)"
                  :status="emp.lastLate || emp.lastEarly"
                  :status-color="emp.lastLate ? 'warning' : 'info'"
                  size="md"
                />
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

      <!-- Team month overview -->
      <SCard>
        <div class="mb-4">
          <h2 class="text-lg font-semibold text-[var(--selaras-resolved-text-default)]">
            {{ t('admin.attendance.monthOverview') }}
          </h2>
          <p class="mt-0.5 text-sm text-[var(--selaras-resolved-text-muted)]">
            {{ t('admin.attendance.monthOverviewSubtitle') }}
          </p>
        </div>

        <div class="overflow-x-auto">
          <SCalendar
            v-model:placeholder="calendarMonth"
            :week-starts-on="1"
            class="w-full"
            style="min-width: 44rem"
            :calendar-label="t('admin.attendance.monthOverview')"
            :ui="{
              grids: 'block',
              grid: { class: 'w-full', style: { tableLayout: 'fixed' } },
              headCell: { style: { width: '14.285714%' } },
              cell: {
                class: 'border border-[var(--selaras-resolved-border-muted)] p-1 align-top',
                style: { height: '6.5rem' },
              },
              dayDetails: {
                class: 'flex flex-wrap content-start justify-center gap-0.5 overflow-hidden pt-1',
                style: { maxHeight: '5rem' },
              },
            }"
          >
            <template #day-details="{ date }">
              <!-- SAvatarGroup's max/stacking do not work with v-for children
                   (the slot compiles to a single Fragment vnode), so the stack
                   is built here using the same classes AvatarGroup applies. -->
              <div class="flex flex-row-reverse flex-wrap justify-center">
                <span
                  v-if="overflowForDate(date) > 0"
                  :title="overflowTitle(date)"
                  class="relative -me-1 flex size-6 items-center justify-center rounded-full bg-[var(--selaras-resolved-surface-elevated)] text-[10px] font-medium text-[var(--selaras-resolved-text-muted)] ring-1 ring-[var(--selaras-resolved-surface-default)]"
                >
                  +{{ overflowForDate(date) }}
                </span>
                <SAvatar
                  v-for="person in visiblePeople(date)"
                  :key="person.name"
                  :text="person.initials"
                  :color="avatarColor(person.name)"
                  :title="personTitle(person)"
                  :alt="personTitle(person)"
                  size="sm"
                  class="-me-1 ring-1 ring-[var(--selaras-resolved-surface-default)]"
                />
              </div>
            </template>
          </SCalendar>
        </div>
      </SCard>
    </div>
  </PageWrapper>
</template>
