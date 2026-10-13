<script setup lang="ts">
import type { AttendanceEntryStatusLike } from '~/utils/attendance-status'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { entryEarlyMinutes as entryEarlyMinutesShared, entryLateMinutes as entryLateMinutesShared } from '~/utils/attendance-status'

definePageMeta({
  title: 'Admin Dashboard',
  pageTitle: 'Dashboard - Admin - Attendance App',
})

// A dashboard sits next to a full report, so it must not re-answer the
// report's question ("what happened this month?"). Everything here answers
// the ops question instead: what is happening TODAY, and what has fallen
// through the cracks. One fetch of the current month feeds it all.
interface ShiftEntry {
  clockIn?: string | null
  clockOut?: string | null
  shiftCode?: string | null
  shiftStartIso?: string | null
  shiftEndIso?: string | null
  earlyReason?: string | null
  running?: boolean
}
interface DayCell {
  grouped?: Record<string, ShiftEntry>
}
interface Employee {
  userId: string
  email?: string | null
  name?: string | null
  username?: string | null
  byDate: Record<string, DayCell>
}
interface Report { month: string, days: string[], rows: Employee[] }

const { locale } = useI18n()
const timezone = 'Asia/Jakarta'

const copy = {
  en: {
    title: 'Dashboard',
    intro: 'Today at a glance, plus anything that needs a follow-up.',
    refresh: 'Refresh',
    clockedIn: 'Clocked in today',
    clockedInSub: 'employees with a check-in',
    onSite: 'On-site now',
    onSiteSub: 'in, not yet out',
    lateToday: 'Late today',
    lateTodaySub: 'arrived after shift start',
    earlyToday: 'Left early today',
    earlyTodaySub: 'clocked out before shift end',
    attention: 'Needs attention',
    allClear: 'All clear - nothing needs attention.',
    missingCheckout: 'Missing check-out',
    missingSince: 'last seen',
    lateSection: 'Late today',
    earlySection: 'Left early today',
    minutesAgo: 'min',
    onSiteNow: 'On-site now',
    nobodyOnSite: 'Nobody on-site right now.',
    thisMonth: 'This month',
    workedDays: 'Worked days',
    lateDays: 'Late days',
    earlyDays: 'Short days',
    missingDays: 'Missing check-outs',
    employees: 'Employees',
    openBoard: 'Open attendance board',
    errorTitle: 'Could not load the dashboard',
    errorHelp: 'Please try refreshing.',
  },
  id: {
    title: 'Dasbor',
    intro: 'Ringkasan hari ini, ditambah hal yang perlu ditindaklanjuti.',
    refresh: 'Muat ulang',
    clockedIn: 'Absen masuk hari ini',
    clockedInSub: 'karyawan sudah check-in',
    onSite: 'Sedang di lokasi',
    onSiteSub: 'masuk, belum keluar',
    lateToday: 'Terlambat hari ini',
    lateTodaySub: 'datang lewat jam mulai shift',
    earlyToday: 'Pulang awal hari ini',
    earlyTodaySub: 'absen keluar sebelum shift selesai',
    attention: 'Perlu perhatian',
    allClear: 'Semua aman - tidak ada yang perlu diperhatikan.',
    missingCheckout: 'Belum absen keluar',
    missingSince: 'terakhir terlihat',
    lateSection: 'Terlambat hari ini',
    earlySection: 'Pulang awal hari ini',
    minutesAgo: 'mnt',
    onSiteNow: 'Sedang di lokasi',
    nobodyOnSite: 'Tidak ada yang sedang di lokasi.',
    thisMonth: 'Bulan ini',
    workedDays: 'Hari kerja',
    lateDays: 'Hari terlambat',
    earlyDays: 'Hari kurang',
    missingDays: 'Belum absen keluar',
    employees: 'Karyawan',
    openBoard: 'Buka papan kehadiran',
    errorTitle: 'Gagal memuat dasbor',
    errorHelp: 'Silakan coba muat ulang.',
  },
}
const c = computed(() => copy[locale.value === 'id' ? 'id' : 'en'])
const language = computed(() => locale.value === 'id' ? 'id-ID' : 'en-GB')

// The business clock ticks once a minute so "on-site since" stays honest.
const now = ref(new Date())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  clock = setInterval(() => (now.value = new Date()), 60_000)
})
onBeforeUnmount(() => clearInterval(clock))
const today = computed(() => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now.value))
const month = computed(() => today.value.slice(0, 7))
const clockLabel = computed(() => now.value.toLocaleTimeString(language.value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }))

const { data, status, error, refresh } = await useFetch<Report>('/api/admin/attendance', { query: { month }, credentials: 'include' })
const pending = computed(() => status.value === 'pending')
// A one-minute re-fetch keeps the today numbers fresh without any socket work.
let poller: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  poller = setInterval(() => void refresh(), 60_000)
})
onBeforeUnmount(() => clearInterval(poller))
const employees = computed(() => data.value?.month === month.value ? data.value.rows : [])

function fmtTime(iso?: string | null) {
  return iso ? new Date(iso).toLocaleTimeString(language.value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }) : '—'
}
function fmtDate(date: string) {
  return new Intl.DateTimeFormat(language.value, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}
function entryLateMinutes(e: AttendanceEntryStatusLike) {
  // Shared grace rule - same numbers as the board, reports, and exports.
  return entryLateMinutesShared(e) ?? 0
}
function entryEarlyMinutes(e: AttendanceEntryStatusLike) {
  return entryEarlyMinutesShared(e) ?? 0
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')
}
function displayName(e: Employee) {
  return e.name || e.username || '-'
}

// A day's visible entries honour the shift type later if ever needed; the
// dashboard reads ALL shift types - an admin cares that someone is on-site,
// not which bucket it lands in.
function dayEntries(employee: Employee, date: string): Array<[string, ShiftEntry]> {
  return Object.entries(employee.byDate[date]?.grouped ?? {})
}

const todayRows = computed(() => employees.value.map(employee => ({
  employee,
  entries: dayEntries(employee, today.value),
})))

// TODAY strip ---------------------------------------------------------------
const clockedIn = computed(() => todayRows.value.reduce((acc, row) => acc + (row.entries.some(([, e]) => e.clockIn) ? 1 : 0), 0))
// On-site = an open clock-in whose shift window is still open (the server
// stamps `running` on the entry at fetch time - same signal that paints the
// board cell blue). Scanned across all days up to today, not just today: a
// malam shift clocked in yesterday before midnight is still on-site at 01:00,
// and its record lives in yesterday's cell.
const onSiteList = computed(() => {
  const list: Array<{ employee: Employee, in: string, shiftType: string }> = []
  for (const employee of employees.value) {
    let best: { in: string, shiftType: string } | null = null
    for (const day of data.value?.days ?? []) {
      if (day > today.value)
        break
      for (const [shiftType, e] of dayEntries(employee, day)) {
        if (!e.clockIn || e.clockOut || !e.running)
          continue
        if (!best || e.clockIn < best.in)
          best = { in: e.clockIn, shiftType }
      }
    }
    if (best)
      list.push({ employee, in: best.in, shiftType: best.shiftType })
  }
  return list
})
const lateToday = computed(() => todayRows.value.flatMap(({ employee, entries }) => {
  const worst = Math.max(0, ...entries.map(([, e]) => entryLateMinutes(e)))
  if (!worst)
    return []
  return [{ employee, minutes: worst, in: entries.map(([, e]) => e.clockIn).filter(Boolean).sort()[0] ?? '' }]
}))
const earlyToday = computed(() => todayRows.value.flatMap(({ employee, entries }) => {
  const worst = Math.max(0, ...entries.map(([, e]) => entryEarlyMinutes(e)))
  if (!worst)
    return []
  return [{ employee, minutes: worst, out: entries.map(([, e]) => e.clockOut).filter(Boolean).sort().at(-1) ?? '' }]
}))

// NEEDS ATTENTION -----------------------------------------------------------
// Missing check-outs from before today are the real follow-ups: today's open
// entries are just "still on-site", but a yesterday without a clock-out means
// the record needs a human.
const missingCheckouts = computed(() => {
  const list: Array<{ employee: Employee, day: string, in: string }> = []
  for (const employee of employees.value) {
    for (const day of data.value?.days ?? []) {
      if (day >= today.value)
        break
      for (const [, e] of dayEntries(employee, day)) {
        if (e.clockIn && !e.clockOut)
          list.push({ employee, day, in: e.clockIn })
      }
    }
  }
  return list.sort((a, b) => b.day.localeCompare(a.day))
})
const missingOverflow = computed(() => Math.max(0, missingCheckouts.value.length - 8))

// THIS MONTH ----------------------------------------------------------------
const monthStats = computed(() => {
  let workedDays = 0
  let lateDays = 0
  let earlyDays = 0
  for (const employee of employees.value) {
    for (const day of data.value?.days ?? []) {
      if (day > today.value)
        break
      const entries = dayEntries(employee, day).filter(([, e]) => e.clockIn || e.clockOut)
      if (!entries.length)
        continue
      workedDays++
      if (entries.some(([, e]) => entryLateMinutes(e) > 0))
        lateDays++
      if (day !== today.value && entries.some(([, e]) => entryEarlyMinutes(e) > 0))
        earlyDays++
    }
  }
  return { workedDays, lateDays, earlyDays, missingDays: missingCheckouts.value.length, employees: employees.value.length }
})

const attentionEmpty = computed(() => !missingCheckouts.value.length && !lateToday.value.length && !earlyToday.value.length)
</script>

<template>
  <PageWrapper>
    <div class="px-4 py-6 text-sm text-(--selaras-resolved-text-default) sm:px-8 sm:py-7 max-[640px]:py-5">
      <header class="flex flex-wrap items-start gap-4 justify-between mb-6">
        <div>
          <h2 class="text-2xl font-[650] tracking-[-0.025em] leading-[1.3]">
            {{ c.title }}
          </h2>
          <p class="text-(--selaras-resolved-text-muted) mt-1.5 max-w-prose">
            {{ c.intro }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="hidden sm:inline-flex items-center gap-1.5 text-xs text-(--selaras-resolved-text-muted) border border-[var(--selaras-resolved-border-default)] rounded-lg px-2.5 py-1.5 tabular-nums">
            <SIcon name="i-heroicons-clock" class="size-3.5" /> {{ clockLabel }} <span class="text-[10px] uppercase tracking-wide">WIB</span>
          </span>
          <SButton
            color="neutral"
            variant="outline"
            icon="i-heroicons-arrow-path"
            :loading="pending"
            @click="refresh()"
          >
            {{ c.refresh }}
          </SButton>
        </div>
      </header>

      <!-- Loading skeleton keeps both columns' shapes so the swap is calm. -->
      <div v-if="pending" class="space-y-4" aria-busy="true">
        <div class="grid gap-4 grid-cols-2 xl:grid-cols-4">
          <div v-for="i in 4" :key="i" class="h-24 rounded-xl bg-gray-100 dark:bg-neutral-800 animate-pulse" />
        </div>
        <div class="grid gap-4 lg:grid-cols-5">
          <div class="h-72 rounded-xl bg-gray-100 dark:bg-neutral-800 animate-pulse lg:col-span-3" />
          <div class="h-72 rounded-xl bg-gray-100 dark:bg-neutral-800 animate-pulse lg:col-span-2" />
        </div>
      </div>

      <div v-else-if="error" class="p-10 text-center">
        <p class="font-medium text-(--selaras-resolved-text-default)">
          {{ c.errorTitle }}
        </p>
        <p class="text-(--selaras-resolved-text-muted) mt-1">
          {{ c.errorHelp }}
        </p>
        <SButton
          class="mt-4"
          color="neutral"
          variant="outline"
          icon="i-heroicons-arrow-path"
          @click="refresh()"
        >
          {{ c.refresh }}
        </SButton>
      </div>

      <template v-else>
        <!-- TODAY strip: four live numbers, refreshed every minute. -->
        <div class="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-4">
          <SCard
            v-for="tile in [
              { key: 'in', label: c.clockedIn, sub: c.clockededInSub, value: clockedIn, icon: 'i-heroicons-arrow-right-start-on-rectangle', tone: 'text-emerald-600 dark:text-emerald-400' },
              { key: 'site', label: c.onSite, sub: c.onSiteSub, value: onSiteList.length, icon: 'i-heroicons-map-pin', tone: 'text-sky-600 dark:text-sky-400' },
              { key: 'late', label: c.lateToday, sub: c.lateTodaySub, value: lateToday.length, icon: 'i-heroicons-clock', tone: lateToday.length ? 'text-amber-600 dark:text-amber-400' : '' },
              { key: 'early', label: c.earlyToday, sub: c.earlyTodaySub, value: earlyToday.length, icon: 'i-heroicons-arrow-right-end-on-rectangle', tone: earlyToday.length ? 'text-violet-600 dark:text-violet-400' : '' },
            ]"
            :key="tile.key"
            :ui="{ body: 'p-4' }"
          >
            <div class="flex items-start gap-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--selaras-resolved-border-muted)] bg-[var(--selaras-resolved-surface-elevated)]">
                <SIcon :name="tile.icon" class="size-4.5" :class="tile.tone" />
              </div>
              <div class="min-w-0">
                <div class="text-2xl font-semibold leading-tight tabular-nums">
                  {{ tile.value }}
                </div>
                <div class="mt-0.5 text-xs font-medium text-(--selaras-resolved-text-default) truncate">
                  {{ tile.label }}
                </div>
                <div class="text-[11px] text-(--selaras-resolved-text-muted) truncate">
                  {{ tile.sub }}
                </div>
              </div>
            </div>
          </SCard>
        </div>

        <div class="grid gap-4 lg:grid-cols-5 items-start">
          <!-- Needs attention: follow-ups, most broken thing first. -->
          <SCard class="lg:col-span-3" :ui="{ body: 'p-0' }">
            <template #header>
              <div class="flex items-center gap-3 px-4 py-3">
                <SIcon name="i-heroicons-flag" class="size-5 shrink-0 text-(--selaras-resolved-text-muted)" />
                <h3 class="text-sm font-semibold text-(--selaras-resolved-text-default)">
                  {{ c.attention }}
                </h3>
              </div>
            </template>

            <div v-if="attentionEmpty" class="px-4 py-10 text-center">
              <SIcon name="i-heroicons-check-circle" class="size-8 mx-auto text-emerald-500" />
              <p class="mt-2 text-(--selaras-resolved-text-muted)">
                {{ c.allClear }}
              </p>
            </div>

            <div v-else class="divide-y divide-[var(--selaras-resolved-border-muted)]">
              <!-- Missing check-outs first: they need actual fixing. -->
              <div v-if="missingCheckouts.length" class="p-4">
                <p class="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-2">
                  {{ c.missingCheckout }} · {{ missingCheckouts.length }}
                </p>
                <ul class="space-y-1">
                  <li v-for="item in missingCheckouts.slice(0, 8)" :key="`${item.employee.userId}-${item.day}`" class="flex items-center gap-3 py-1">
                    <SAvatar
                      :src="userAvatarUri(item.employee.userId)"
                      :text="initials(displayName(item.employee))"
                      :alt="displayName(item.employee)"
                      size="xs"
                      class="shrink-0"
                    />
                    <span class="truncate flex-1 min-w-0 font-medium text-(--selaras-resolved-text-default)">{{ displayName(item.employee) }}</span>
                    <span class="shrink-0 text-xs text-(--selaras-resolved-text-muted) tabular-nums">
                      {{ fmtDate(item.day) }} · {{ c.missingSince }} {{ fmtTime(item.in) }}
                    </span>
                  </li>
                </ul>
                <p v-if="missingOverflow" class="mt-2 text-xs text-(--selaras-resolved-text-muted)">
                  +{{ missingOverflow }} more
                </p>
              </div>

              <div v-if="lateToday.length" class="p-4">
                <p class="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2">
                  {{ c.lateSection }} · {{ lateToday.length }}
                </p>
                <ul class="space-y-1">
                  <li v-for="item in lateToday" :key="item.employee.userId" class="flex items-center gap-3 py-1">
                    <SAvatar
                      :src="userAvatarUri(item.employee.userId)"
                      :text="initials(displayName(item.employee))"
                      :alt="displayName(item.employee)"
                      size="xs"
                      class="shrink-0"
                    />
                    <span class="truncate flex-1 min-w-0 font-medium text-(--selaras-resolved-text-default)">{{ displayName(item.employee) }}</span>
                    <span class="shrink-0 text-xs text-amber-600 dark:text-amber-400 tabular-nums">
                      {{ fmtTime(item.in) }} · +{{ item.minutes }} {{ c.minutesAgo }}
                    </span>
                  </li>
                </ul>
              </div>

              <div v-if="earlyToday.length" class="p-4">
                <p class="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 mb-2">
                  {{ c.earlySection }} · {{ earlyToday.length }}
                </p>
                <ul class="space-y-1">
                  <li v-for="item in earlyToday" :key="item.employee.userId" class="flex items-center gap-3 py-1">
                    <SAvatar
                      :src="userAvatarUri(item.employee.userId)"
                      :text="initials(displayName(item.employee))"
                      :alt="displayName(item.employee)"
                      size="xs"
                      class="shrink-0"
                    />
                    <span class="truncate flex-1 min-w-0 font-medium text-(--selaras-resolved-text-default)">{{ displayName(item.employee) }}</span>
                    <span class="shrink-0 text-xs text-violet-600 dark:text-violet-400 tabular-nums">
                      {{ fmtTime(item.out) }} · -{{ item.minutes }} {{ c.minutesAgo }}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </SCard>

          <!-- Right rail: on-site now, then the month context. -->
          <div class="space-y-4 lg:col-span-2">
            <SCard :ui="{ body: 'p-0' }">
              <template #header>
                <div class="flex items-center justify-between gap-3 px-4 py-3">
                  <div class="flex items-center gap-3">
                    <span class="relative flex size-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                      <span class="relative inline-flex rounded-full size-2 bg-emerald-500" />
                    </span>
                    <h3 class="text-sm font-semibold text-(--selaras-resolved-text-default)">
                      {{ c.onSiteNow }}
                    </h3>
                  </div>
                  <span class="text-xs tabular-nums text-(--selaras-resolved-text-muted)">{{ clockLabel }}</span>
                </div>
              </template>
              <div v-if="!onSiteList.length" class="px-4 py-8 text-center text-(--selaras-resolved-text-muted)">
                {{ c.nobodyOnSite }}
              </div>
              <ul v-else class="divide-y divide-[var(--selaras-resolved-border-muted)]">
                <li v-for="item in onSiteList" :key="item.employee.userId" class="flex items-center gap-3 px-4 py-2.5">
                  <SAvatar
                    :src="userAvatarUri(item.employee.userId)"
                    :text="initials(displayName(item.employee))"
                    :alt="displayName(item.employee)"
                    size="xs"
                    class="shrink-0"
                  />
                  <span class="truncate flex-1 min-w-0">
                    <span class="block font-medium text-(--selaras-resolved-text-default) truncate">{{ displayName(item.employee) }}</span>
                    <span class="block text-[11px] text-(--selaras-resolved-text-muted) capitalize">{{ item.shiftType }}</span>
                  </span>
                  <span class="shrink-0 text-xs tabular-nums text-(--selaras-resolved-text-muted)">
                    {{ c.onSite }} {{ fmtTime(item.in) }}
                  </span>
                </li>
              </ul>
            </SCard>

            <SCard :ui="{ body: 'p-4' }">
              <div class="flex items-center justify-between gap-3 mb-3">
                <h3 class="text-sm font-semibold text-(--selaras-resolved-text-default)">
                  {{ c.thisMonth }}
                </h3>
                <span class="text-xs text-(--selaras-resolved-text-muted) tabular-nums">{{ month }}</span>
              </div>
              <dl class="grid grid-cols-2 gap-3 text-sm">
                <div class="rounded-lg border border-[var(--selaras-resolved-border-muted)] p-3">
                  <dd class="text-xl font-semibold tabular-nums">
                    {{ monthStats.workedDays }}
                  </dd>
                  <dt class="text-xs text-(--selaras-resolved-text-muted) mt-0.5">
                    {{ c.workedDays }}
                  </dt>
                </div>
                <div class="rounded-lg border border-[var(--selaras-resolved-border-muted)] p-3">
                  <dd class="text-xl font-semibold tabular-nums" :class="monthStats.lateDays ? 'text-amber-600 dark:text-amber-400' : ''">
                    {{ monthStats.lateDays }}
                  </dd>
                  <dt class="text-xs text-(--selaras-resolved-text-muted) mt-0.5">
                    {{ c.lateDays }}
                  </dt>
                </div>
                <div class="rounded-lg border border-[var(--selaras-resolved-border-muted)] p-3">
                  <dd class="text-xl font-semibold tabular-nums" :class="monthStats.earlyDays ? 'text-violet-600 dark:text-violet-400' : ''">
                    {{ monthStats.earlyDays }}
                  </dd>
                  <dt class="text-xs text-(--selaras-resolved-text-muted) mt-0.5">
                    {{ c.earlyDays }}
                  </dt>
                </div>
                <div class="rounded-lg border border-[var(--selaras-resolved-border-muted)] p-3">
                  <dd class="text-xl font-semibold tabular-nums" :class="monthStats.missingDays ? 'text-red-600 dark:text-red-400' : ''">
                    {{ monthStats.missingDays }}
                  </dd>
                  <dt class="text-xs text-(--selaras-resolved-text-muted) mt-0.5">
                    {{ c.missingDays }}
                  </dt>
                </div>
              </dl>
              <div class="flex items-center justify-between gap-3 mt-3 text-xs text-(--selaras-resolved-text-muted)">
                <span>{{ c.employees }}: <strong class="tabular-nums text-(--selaras-resolved-text-default)">{{ monthStats.employees }}</strong></span>
                <NuxtLink to="/admin/attendance" class="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline">
                  {{ c.openBoard }} <SIcon name="i-heroicons-arrow-right" class="size-3.5" />
                </NuxtLink>
              </div>
            </SCard>
          </div>
        </div>
      </template>
    </div>
  </PageWrapper>
</template>
