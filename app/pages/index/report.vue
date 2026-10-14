<script setup lang="ts">
import type { CellStatus } from '~/utils/attendance-status'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ATTENDANCE_GRACE_MS, earlyShortfallMs, lateDelayMs } from '~~/shared/utils/attendance-grace'

interface ReportSummary {
  month: string
  totalWorkingDays: number
  totalHarianShift: number
  totalBantuanShift: number
  totalLateMinutes: number
  totalEarlyLeaveMinutes: number
}

interface DaySummary {
  date: string
  // server now returns per-shift items; we group them into day buckets with shifts[]
  shifts?: Array<any>
  // legacy single-shift compatibility (optional)
  selectedShiftCode?: string | null
  shiftType?: 'harian' | 'bantuan' | null
  clockIn?: string | null
  clockOut?: string | null
  clockInLat?: number | null
  clockInLng?: number | null
  clockInAccuracy?: number | null
  clockOutLat?: number | null
  clockOutLng?: number | null
  clockOutAccuracy?: number | null
  lateMs?: number
  running?: boolean
  logs?: Array<any>
}

const loading = ref(false)
const errorMsg = ref<string | null>(null)
const summary = ref<ReportSummary | null>(null)
const days = ref<DaySummary[]>([])

const { t, locale } = useI18n()
// Same business clock and language handling as the admin board, so a given
// day reads identically on both pages.
const timezone = 'Asia/Jakarta'
const language = computed(() => locale.value === 'id' ? 'id-ID' : 'en-GB')

function dayTotalLateMs(d: DaySummary) {
  const shifts = d.shifts || []
  return shifts.reduce((acc, s) => acc + (s.lateMs || 0), 0)
}

function dayTotalEarlyMs(d: DaySummary) {
  const shifts = d.shifts || []
  return shifts.reduce((acc, s) => acc + (s.earlyMs || 0), 0)
}

function mapUrl(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return '#'
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

function shiftCrossesMidnight(def?: { start?: string, end?: string } | null) {
  if (!def?.start || !def?.end) return false
  const [sh = 0, sm = 0] = def.start.split(':').map(s => Number(s ?? '0'))
  const [eh = 0, em = 0] = def.end.split(':').map(s => Number(s ?? '0'))
  if ([sh, sm, eh, em].some(Number.isNaN)) return false
  return (sh * 60 + sm) > (eh * 60 + em)
}

function addDaysYmd(ymd: string, days: number) {
  const [y = 1970, m = 1, d = 1] = ymd.split('-').map(s => Number(s ?? '0'))
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function mergeCrossdayShifts(rawDays: any[], shiftMap: Map<string, any>) {
  const sorted = [...(rawDays || [])].sort((a, b) => {
    if (a.date !== b.date) return String(a.date).localeCompare(String(b.date))
    const at = Date.parse(a.clockIn || a.clockOut || '') || 0
    const bt = Date.parse(b.clockIn || b.clockOut || '') || 0
    return at - bt
  })

  const used = new Set<number>()
  const merged: any[] = []

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue
    const base = {
      ...sorted[i],
      logs: Array.isArray(sorted[i]?.logs) ? [...sorted[i].logs] : [],
    }

    const baseShiftCode = base.selectedShiftCode
      ?? base.logs?.find((l: any) => l?.type === 'clock-in')?.shiftCode
      ?? null
    const baseDef = baseShiftCode ? shiftMap.get(baseShiftCode) : null

    const isCrossday = shiftCrossesMidnight(baseDef)
    const hasClockInOnly = !!base.clockIn && !base.clockOut

    if (isCrossday && hasClockInOnly) {
      const nextDate = addDaysYmd(base.date, 1)

      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(j)) continue
        const candidate = sorted[j]
        if (candidate?.date !== nextDate) continue

        const candidateHasClockOutOnly = !candidate?.clockIn && !!candidate?.clockOut
        const sameShiftType = (candidate?.shiftType ?? null) === (base.shiftType ?? null)

        if (candidateHasClockOutOnly && sameShiftType) {
          base.clockOut = candidate.clockOut
          base.clockOutLat = candidate.clockOutLat ?? null
          base.clockOutLng = candidate.clockOutLng ?? null
          base.clockOutAccuracy = candidate.clockOutAccuracy ?? null
          base.earlyMs = (base.earlyMs || 0) + (candidate.earlyMs || 0)
          base.logs = [...(base.logs || []), ...((candidate.logs || []) as any[])]
          base.logs.sort((a: any, b: any) => {
            const at = a?.timestampMs ?? Date.parse(a?.timestamp || '') ?? 0
            const bt = b?.timestampMs ?? Date.parse(b?.timestamp || '') ?? 0
            return at - bt
          })
          used.add(j)
          break
        }
      }
    }

    merged.push(base)
  }

  return merged
}

// month in YYYY-MM
const now = new Date()
const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const selectedMonth = ref(currentMonthStr)

async function fetchReport() {
  loading.value = true
  errorMsg.value = null
  try {
    const res = await $fetch('/api/attendance/report', {
      credentials: 'include',
      query: { month: selectedMonth.value },
    })
    let shiftsForMonth: any[] = []
    try {
      shiftsForMonth = await $fetch<any[]>('/api/shifts', {
        credentials: 'include',
        query: { ts: Date.now() },
      })
    }
    catch {
      shiftsForMonth = []
    }
    const monthShiftMap = new Map((shiftsForMonth || []).map((s: any) => [s.code, s]))

    // If server returned aggregated days, use them
    if ((res as any).days && (res as any).days.length) {
      summary.value = res as ReportSummary
      const rawDays = mergeCrossdayShifts((res as any).days ?? [], monthShiftMap)
      const byDate = new Map<string, any[]>()
      for (const item of rawDays) {
        if (!byDate.has(item.date)) byDate.set(item.date, [])
        byDate.get(item.date)!.push(item)
      }
      days.value = Array.from(byDate.entries()).map(([date, shifts]) => ({ date, shifts })).sort((a: any, b: any) => a.date.localeCompare(b.date))
    }
    // If server returned raw logs & shifts (raw mode), aggregate client-side
    else if ((res as any).logs && (res as any).shifts) {
      const logs = (res as any).logs as any[]
      const shiftsArr = (res as any).shifts as any[]

      // helper: compute UTC instant ms for local YYYY-MM-DD + HH:MM in given IANA tz
      function localDateTimeToUtcMs(dateYmd: string, hh: number, mm: number, tz: string) {
        const localStr = `${dateYmd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
        const wall = new Date(localStr)
        const tzString = new Date(wall.toLocaleString('en-US', { timeZone: tz }))
        const offsetMs = wall.getTime() - tzString.getTime()
        return wall.getTime() + offsetMs
      }

      function computeShiftSpanFromDate(attDateYmd: string, start: string, end: string, tz = 'Asia/Jakarta') {
        const [sh, sm] = start.split(':').map(s => Number(s ?? '0')) as [number, number]
        const [eh, em] = end.split(':').map(s => Number(s ?? '0')) as [number, number]
        const startMs = localDateTimeToUtcMs(attDateYmd, sh, sm, tz)
        let endMs: number
        if (sh * 60 + sm > eh * 60 + em) {
          // crosses midnight -> next day
          const [py, pm, pd] = attDateYmd.split('-').map(s => Number(s ?? '0')) as [number, number, number]
          const d = new Date(py, pm - 1, pd)
          d.setDate(d.getDate() + 1)
          const endYmd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          endMs = localDateTimeToUtcMs(endYmd, eh, em, tz)
        }
        else {
          endMs = localDateTimeToUtcMs(attDateYmd, eh, em, tz)
        }
        return { startMs, endMs }
      }

      // Map shift code -> def for quick lookup
      const shiftMap = new Map(shiftsArr.map(s => [s.code, s]))

      // group logs by date
      const byDate = new Map<string, any[]>()
      for (const l of logs) {
        if (!byDate.has(l.date)) byDate.set(l.date, [])
        byDate.get(l.date)!.push(l)
      }

      const dayItems: any[] = []
      let totalHarian = 0
      let totalBantuan = 0

      for (const [date, dayLogs] of byDate.entries()) {
        // build mapped logs with numeric ms
        const mapped = dayLogs.map(l => ({
          ...l,
          timestampMs: l.timestampMs ?? (l.timestampIso ? Date.parse(l.timestampIso) : null),
        }))

        // group by shiftType
        const groups = new Map<string, any[]>()
        for (const l of mapped) {
          const t = l.shiftType || 'unknown'
          if (!groups.has(t)) groups.set(t, [])
          groups.get(t)!.push(l)
        }

        for (const [st, groupLogs] of groups.entries()) {
          // earliest clock-in and latest clock-out
          const ins = groupLogs.filter(g => g.type === 'clock-in').sort((a, b) => (a.timestampMs ?? Infinity) - (b.timestampMs ?? Infinity))
          const outs = groupLogs.filter(g => g.type === 'clock-out').sort((a, b) => (a.timestampMs ?? -Infinity) - (b.timestampMs ?? -Infinity))
          const clockIn = ins[0] ?? null
          let clockOut = outs.length ? outs[outs.length - 1] : null
          if (clockIn?.timestampMs != null && clockOut?.timestampMs != null && clockOut.timestampMs < clockIn.timestampMs) {
            const validOut = [...outs].reverse().find(o => o?.timestampMs != null && o.timestampMs >= clockIn.timestampMs)
            clockOut = validOut ?? null
          }

          const chosenShiftCode = clockIn?.shiftCode ?? clockOut?.shiftCode ?? null

          let lateMs = 0
          let earlyMs = 0
          if (chosenShiftCode) {
            const def = shiftMap.get(chosenShiftCode)
            if (def && clockIn) {
              const { startMs, endMs } = computeShiftSpanFromDate(date, def.start, def.end)
              lateMs = lateDelayMs(clockIn.timestampMs, startMs)
              if (clockOut)
                earlyMs = earlyShortfallMs(clockOut.timestampMs, endMs)
            }
          }

          // Open shift: running while inside the expected window, missing
          // after - same rule as the aggregated path on the server.
          let running = false
          if (clockIn && !clockOut) {
            const runningDef = chosenShiftCode ? shiftMap.get(chosenShiftCode) : undefined
            if (runningDef) {
              const { endMs: runningEnd } = computeShiftSpanFromDate(date, runningDef.start, runningDef.end)
              running = Date.now() < runningEnd + ATTENDANCE_GRACE_MS
            }
            else {
              const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now())
              running = date === todayYmd
            }
          }

          if (st === 'harian') totalHarian++
          if (st === 'bantuan') totalBantuan++

          dayItems.push({
            date,
            selectedShiftCode: chosenShiftCode,
            shiftType: st === 'unknown' ? null : st,
            clockIn: clockIn?.timestampIso ?? null,
            clockOut: clockOut?.timestampIso ?? null,
            clockInLat: clockIn?.lat ?? null,
            clockInLng: clockIn?.lng ?? null,
            clockInAccuracy: clockIn?.accuracy ?? null,
            clockOutLat: clockOut?.lat ?? null,
            clockOutLng: clockOut?.lng ?? null,
            clockOutAccuracy: clockOut?.accuracy ?? null,
            lateMs,
            earlyMs,
            running,
            logs: groupLogs,
          })
        }
      }

      // compute summary
      const recomputedLate = dayItems.reduce((acc, s) => acc + Math.ceil(((s.lateMs || 0) / 60000)), 0)
      const recomputedEarly = dayItems.reduce((acc, s) => acc + Math.ceil(((s.earlyMs || 0) / 60000)), 0)

      summary.value = {
        month: `${selectedMonth.value}`,
        totalWorkingDays: totalHarian + totalBantuan,
        totalHarianShift: totalHarian,
        totalBantuanShift: totalBantuan,
        totalLateMinutes: recomputedLate,
        totalEarlyLeaveMinutes: recomputedEarly,
      }

      // group dayItems by date into day objects with shifts[]
      const byDate2 = new Map<string, any[]>()
      for (const s of dayItems) {
        if (!byDate2.has(s.date)) byDate2.set(s.date, [])
        byDate2.get(s.date)!.push(s)
      }
      days.value = Array.from(byDate2.entries()).map(([date, shifts]) => ({ date, shifts })).sort((a: any, b: any) => a.date.localeCompare(b.date))
    }
    else {
      // Fallback: ensure the UI has a valid summary (zeros) and empty days to avoid blank page
      summary.value = {
        month: `${selectedMonth.value}`,
        totalWorkingDays: 0,
        totalHarianShift: 0,
        totalBantuanShift: 0,
        totalLateMinutes: 0,
        totalEarlyLeaveMinutes: 0,
      }
      days.value = []
    }
  }
  catch (e: any) {
    errorMsg.value = e?.data?.message || e?.message || t('report.failedToLoad')
  }
  finally {
    loading.value = false
  }
}

function monthLabel(m?: string) {
  if (!m) return '-'
  const [y, mm] = m.split('-')
  const d = new Date(Number(y), Number(mm) - 1, 1)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
}

function fmtMinutes(min: number) {
  if (!min) return '0m'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

function _changeMonth(delta: number) {
  const [yStr, mStr] = selectedMonth.value.split('-')
  let y = Number(yStr)
  let m = Number(mStr)
  m += delta
  if (m < 1) {
    m = 12
    y -= 1
  }
  if (m > 12) {
    m = 1
    y += 1
  }
  selectedMonth.value = `${y}-${String(m).padStart(2, '0')}`
}

// The report starts on the current month and can look back, but never forward.
// A future month cannot hold attendance, so the next button disables itself
// there. Comparison is string-based: the YYYY-MM format sorts chronologically.
const isCurrentMonth = computed(() => selectedMonth.value === currentMonthStr)

function prevMonth() {
  _changeMonth(-1)
}

function nextMonth() {
  if (!isCurrentMonth.value)
    _changeMonth(1)
}

// Direct month jump removed in favor of the original stepper-in-header
// placement: chevrons plus the month label negotiate no width on a phone.

// ── Status language shared with the admin board ─────────────────────────────

// One status per day, same precedence as the admin board: a day missing its
// check-out is the loudest signal, then late, then early. The report endpoint
// hands us per-shift lateMs/earlyMs and the running flag for open shifts, so
// no shift-time math happens here - only the ranking.
function dayStatus(day: DaySummary): CellStatus {
  const shifts = day.shifts ?? []
  let recorded = false
  let late = false
  let early = false
  let missing = false
  let running = false
  for (const s of shifts) {
    const hasIn = !!s.clockIn
    const hasOut = !!s.clockOut
    if (!hasIn && !hasOut)
      continue
    recorded = true
    if (hasIn && !hasOut) {
      // Open shift: the endpoint marks it running while the expected window
      // is still open - a mid-shift worker is not a missed check-out.
      if (s.running)
        running = true
      else
        missing = true
      continue
    }
    if ((s.lateMs ?? 0) > 0)
      late = true
    if ((s.earlyMs ?? 0) > 0)
      early = true
  }
  if (!recorded)
    return 'none'
  if (missing)
    return 'missing'
  if (late)
    return 'late'
  if (early)
    return 'early'
  if (running)
    return 'running'
  return 'onTime'
}

const statusDot: Record<CellStatus, string> = {
  onTime: 'bg-emerald-500 dark:bg-emerald-400',
  late: 'bg-amber-500 dark:bg-amber-400',
  early: 'bg-violet-500 dark:bg-violet-400',
  missing: 'bg-red-500 dark:bg-red-400',
  running: 'bg-sky-500 dark:bg-sky-400',
  none: 'bg-gray-200 dark:bg-neutral-700',
}

// Legend label for a day's status dot: maps the CellStatus to its i18n key.
function statusLabelKey(status: CellStatus) {
  if (status === 'onTime')
    return 'report.onTime'
  if (status === 'late')
    return 'report.late'
  if (status === 'early')
    return 'report.early'
  if (status === 'missing')
    return 'report.missingOut'
  if (status === 'running')
    return 'report.running'
  return 'report.noShifts'
}

// Presentation helpers. Times render in the business timezone so the board
// and the report never disagree about when a shift happened.
function fmtTime(iso?: string | null) {
  return iso ? new Date(iso).toLocaleTimeString(language.value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }) : '—'
}
function fmtDateYmd(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }) {
  return new Intl.DateTimeFormat(language.value, opts).format(new Date(`${date}T00:00:00Z`))
}
function fmtMs(ms?: number) {
  // Ceil: a real late/early must never read as "0 min" - with the grace rule
  // anything reaching display is already >= 1 minute away.
  return `${Math.ceil((ms ?? 0) / 60_000)} ${t('report.minutes')}`
}
function typeLabel(shift: DaySummary) {
  if (shift.shiftType === 'harian')
    return t('report.harian')
  if (shift.shiftType === 'bantuan')
    return t('report.bantuan')
  return t('report.unknown')
}

onMounted(fetchReport)
watch(selectedMonth, fetchReport)
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <!-- Loading keeps the page's shape - overview card, then day cards - so
         the swap from skeleton to data reads as the same page. -->
    <div
      v-if="loading"
      class="space-y-4"
      aria-busy="true"
      aria-live="polite"
    >
      <p class="sr-only">
        {{ t('report.loading') }}
      </p>

      <SCard :ui="{ body: 'p-0', header: 'px-4 py-3' }">
        <template #header>
          <SSkeleton class="h-5 w-40" />
        </template>
        <dl class="grid grid-cols-2 divide-x divide-y divide-[var(--selaras-resolved-border-muted)] sm:grid-cols-3 sm:divide-y-0">
          <div v-for="i in 5" :key="i" class="p-4">
            <SSkeleton class="h-3.5 w-24" />
            <SSkeleton class="mt-3 h-5 w-14" />
          </div>
        </dl>
      </SCard>

      <!-- One daily-details card, matching the real layout below: day header
           rows with a shift block each. -->
      <SCard :ui="{ body: 'p-0', header: 'px-4 py-3' }">
        <template #header>
          <SSkeleton class="h-5 w-40" />
        </template>
        <div class="divide-y divide-[var(--selaras-resolved-border-muted)]">
          <div v-for="i in 3" :key="i" class="p-4 space-y-2.5">
            <SSkeleton class="h-4 w-36" />
            <SSkeleton class="h-24 w-full rounded-lg" />
          </div>
        </div>
      </SCard>
    </div>

    <div
      v-else-if="errorMsg"
      class="p-10 text-center bg-[var(--selaras-resolved-surface-default)] rounded-[var(--selaras-resolved-radius-lg)] border border-[var(--selaras-resolved-border-muted)]"
    >
      <p class="font-medium text-(--selaras-resolved-text-default)">
        {{ t('report.failedToLoad') }}
      </p>
      <p class="text-(--selaras-resolved-text-muted) mt-1">
        {{ errorMsg }}
      </p>
      <SButton
        class="mt-4"
        color="neutral"
        variant="outline"
        icon="i-heroicons-arrow-path"
        @click="fetchReport()"
      >
        {{ t('report.refresh') }}
      </SButton>
    </div>

    <div v-else-if="summary" class="space-y-4">
      <!-- Overview on top, with the month stepper back in the card header:
           the original placement. Chevron buttons plus the month label need
           no width negotiation, so nothing wraps or bounces on a phone. -->
      <SCard :ui="{ body: 'p-0' }">
        <template #header>
          <div class="flex items-center justify-between gap-3 px-4 py-3">
            <div class="flex items-center gap-2">
              <SIcon name="i-heroicons-calendar-days" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
              <h2 class="text-sm font-semibold text-[var(--selaras-resolved-text-default)]">
                {{ t('report.overview') }}
              </h2>
            </div>
            <div class="flex items-center gap-1">
              <SButton
                icon="i-heroicons-chevron-left"
                size="sm"
                variant="ghost"
                color="neutral"
                :aria-label="t('report.prevMonth')"
                @click="prevMonth"
              />
              <span class="shrink-0 font-mono text-sm tabular-nums text-[var(--selaras-resolved-text-muted)]" role="status">
                {{ monthLabel(summary.month ?? selectedMonth) }}
              </span>
              <SButton
                icon="i-heroicons-chevron-right"
                size="sm"
                variant="ghost"
                color="neutral"
                :disabled="isCurrentMonth"
                :aria-label="t('report.nextMonth')"
                @click="nextMonth"
              />
            </div>
          </div>
        </template>

        <dl class="grid grid-cols-2 divide-x divide-y divide-[var(--selaras-resolved-border-muted)] sm:grid-cols-3 sm:divide-y-0">
          <div class="p-4">
            <dt class="text-xs text-[var(--selaras-resolved-text-muted)]">
              {{ t('report.totalWorkingDays') }}
            </dt>
            <dd class="mt-1.5 text-xl font-semibold tabular-nums text-[var(--selaras-resolved-text-default)]">
              {{ summary.totalWorkingDays }}
            </dd>
          </div>
          <div class="p-4">
            <dt class="text-xs text-[var(--selaras-resolved-text-muted)]">
              {{ t('report.harianShiftDays') }}
            </dt>
            <dd class="mt-1.5 text-xl font-semibold tabular-nums text-[var(--selaras-resolved-text-default)]">
              {{ summary.totalHarianShift }}
            </dd>
          </div>
          <div class="p-4">
            <dt class="text-xs text-[var(--selaras-resolved-text-muted)]">
              {{ t('report.bantuanShiftDays') }}
            </dt>
            <dd class="mt-1.5 text-xl font-semibold tabular-nums text-[var(--selaras-resolved-text-default)]">
              {{ summary.totalBantuanShift }}
            </dd>
          </div>
          <div class="p-4">
            <dt class="text-xs text-[var(--selaras-resolved-text-muted)]">
              {{ t('report.totalLate') }}
            </dt>
            <dd class="mt-1.5 text-xl font-semibold tabular-nums" :class="summary.totalLateMinutes ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--selaras-resolved-text-default)]'">
              {{ fmtMinutes(summary.totalLateMinutes) }}
            </dd>
          </div>
          <div class="p-4">
            <dt class="text-xs text-[var(--selaras-resolved-text-muted)]">
              {{ t('report.totalEarlyLeave') }}
            </dt>
            <dd class="mt-1.5 text-xl font-semibold tabular-nums" :class="summary.totalEarlyLeaveMinutes ? 'text-violet-600 dark:text-violet-400' : 'text-[var(--selaras-resolved-text-default)]'">
              {{ fmtMinutes(summary.totalEarlyLeaveMinutes) }}
            </dd>
          </div>
        </dl>

        <template #footer>
          <p class="flex items-start gap-2 text-xs text-[var(--selaras-resolved-text-muted)]">
            <SIcon name="i-heroicons-information-circle" class="size-4 shrink-0" />
            <span>{{ t('report.note') }}</span>
          </p>
        </template>
      </SCard>

      <!-- Daily detail: one card, days stacked as sections that scroll down -
           nothing scrolls sideways and nothing floats on the page background.
           Each shift block keeps the drawer design: times as the headline in
           the business timezone, type and code as quiet context, late/early
           tinted with their status colors, geo trail as one quiet row. -->
      <SCard :ui="{ body: 'p-0', header: 'px-4 py-3' }">
        <template #header>
          <div class="flex items-center gap-2">
            <SIcon name="i-heroicons-calendar-days" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
            <h2 class="text-sm font-semibold text-[var(--selaras-resolved-text-default)]">
              {{ t('report.dailyDetails') }}
            </h2>
          </div>
        </template>

        <div v-if="!days.length" class="px-4 py-10 text-center text-sm text-(--selaras-resolved-text-muted)">
          {{ t('report.noShifts') }}
        </div>

        <div v-else class="divide-y divide-[var(--selaras-resolved-border-muted)]">
          <div
            v-for="d in days"
            :key="d.date"
            class="p-4"
          >
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p class="text-sm font-semibold tabular-nums text-[var(--selaras-resolved-text-default)]">
                {{ fmtDateYmd(d.date) }}
              </p>
              <div class="flex items-center gap-2">
                <span
                  class="size-3 rounded-[4px]"
                  :class="statusDot[dayStatus(d)]"
                  :aria-label="t(statusLabelKey(dayStatus(d)))"
                />
                <SBadge
                  v-if="dayStatus(d) === 'missing'"
                  color="danger"
                  variant="soft"
                  size="sm"
                >
                  {{ t('report.missingOut') }}
                </SBadge>
                <SBadge
                  v-else-if="dayStatus(d) === 'running'"
                  color="info"
                  variant="soft"
                  size="sm"
                >
                  {{ t('report.running') }}
                </SBadge>
                <SBadge
                  v-else-if="dayStatus(d) === 'late'"
                  color="warning"
                  variant="soft"
                  size="sm"
                >
                  {{ t('report.late') }} {{ fmtMs(dayTotalLateMs(d)) }}
                </SBadge>
                <SBadge
                  v-else-if="dayStatus(d) === 'early'"
                  color="primary"
                  variant="soft"
                  size="sm"
                >
                  {{ t('report.early') }} {{ fmtMs(dayTotalEarlyMs(d)) }}
                </SBadge>
                <SBadge
                  v-else-if="dayStatus(d) === 'onTime'"
                  color="success"
                  variant="soft"
                  size="sm"
                >
                  {{ t('report.onTime') }}
                </SBadge>
              </div>
            </div>

            <div class="space-y-2.5">
              <div
                v-for="(shift, i) in d.shifts"
                :key="i"
                class="rounded-lg border border-[var(--selaras-resolved-border-muted)] p-3.5"
              >
                <p class="flex items-center gap-2 text-sm font-medium text-[var(--selaras-resolved-text-default)] mb-2.5">
                  <span>{{ typeLabel(shift) }}</span>
                  <span
                    v-if="shift.selectedShiftCode"
                    class="rounded px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-neutral-800 text-(--selaras-resolved-text-muted)"
                  >{{ shift.selectedShiftCode }}</span>
                </p>
                <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt class="text-xs text-[var(--selaras-resolved-text-muted)]">
                      {{ t('report.clockIn') }}
                    </dt>
                    <dd class="text-base font-medium tabular-nums mt-0.5 text-[var(--selaras-resolved-text-default)]">
                      {{ fmtTime(shift.clockIn) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs text-[var(--selaras-resolved-text-muted)]">
                      {{ t('report.clockOut') }}
                    </dt>
                    <dd class="text-base font-medium tabular-nums mt-0.5 text-[var(--selaras-resolved-text-default)]">
                      {{ fmtTime(shift.clockOut) }}
                    </dd>
                  </div>
                  <div v-if="shift.lateMs > 0">
                    <dt class="text-xs text-amber-600 dark:text-amber-400">
                      {{ t('report.late') }}
                    </dt>
                    <dd class="tabular-nums mt-0.5 text-amber-600 dark:text-amber-400">
                      {{ fmtMs(shift.lateMs) }}
                    </dd>
                  </div>
                  <div v-if="shift.earlyMs > 0">
                    <dt class="text-xs text-violet-600 dark:text-violet-400">
                      {{ t('report.early') }}
                    </dt>
                    <dd class="tabular-nums mt-0.5 text-violet-600 dark:text-violet-400">
                      {{ fmtMs(shift.earlyMs) }}
                    </dd>
                  </div>
                </dl>
                <!-- Geo trail: the report endpoint is the only place the raw
                     coordinates survive, so each block keeps the map links -
                     as one quiet row at the bottom. -->
                <p
                  v-if="shift.clockInLat != null || shift.clockOutLat != null"
                  class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--selaras-resolved-border-muted)] pt-2.5 text-xs text-[var(--selaras-resolved-text-muted)]"
                >
                  <a
                    v-if="shift.clockInLat != null && shift.clockInLng != null"
                    :href="mapUrl(shift.clockInLat, shift.clockInLng)"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-1 underline underline-offset-2"
                  >
                    <SIcon name="i-heroicons-map-pin" class="size-3 shrink-0" />
                    {{ shift.clockInLat.toFixed(3) }}, {{ shift.clockInLng.toFixed(3) }}
                    <span v-if="shift.clockInAccuracy != null">±{{ Math.round(shift.clockInAccuracy) }}m</span>
                  </a>
                  <a
                    v-if="shift.clockOutLat != null && shift.clockOutLng != null"
                    :href="mapUrl(shift.clockOutLat, shift.clockOutLng)"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-1 underline underline-offset-2"
                  >
                    <SIcon name="i-heroicons-map-pin" class="size-3 shrink-0" />
                    {{ shift.clockOutLat.toFixed(3) }}, {{ shift.clockOutLng.toFixed(3) }}
                    <span v-if="shift.clockOutAccuracy != null">±{{ Math.round(shift.clockOutAccuracy) }}m</span>
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </SCard>
    </div>
  </div>
</template>
