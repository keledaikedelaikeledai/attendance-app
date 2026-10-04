<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

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
  logs?: Array<any>
}

const loading = ref(false)
const errorMsg = ref<string | null>(null)
const summary = ref<ReportSummary | null>(null)
const days = ref<DaySummary[]>([])

const { t } = useI18n()

function summarizeDay(d: DaySummary) {
  const res = { harian: 0, bantuan: 0, unknown: 0 }
  const shifts = d.shifts || []
  for (const s of shifts) {
    const t = s.shiftType || 'unknown'
    if (t === 'harian') res.harian++
    else if (t === 'bantuan') res.bantuan++
    else res.unknown++
  }
  return { ...res, total: res.harian + res.bantuan + res.unknown }
}

function dayTotalLateMs(d: DaySummary) {
  const shifts = d.shifts || []
  return shifts.reduce((acc, s) => acc + (s.lateMs || 0), 0)
}

function dayTotalEarlyMs(d: DaySummary) {
  const shifts = d.shifts || []
  return shifts.reduce((acc, s) => acc + (s.earlyMs || 0), 0)
}

function formatTime(iso?: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function mapUrl(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return '#'
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

function shiftBadgeColor(code?: string) {
  switch (code) {
    case 'pagi': return 'info'
    case 'siang': return 'primary'
    case 'sore': return 'warning'
    case 'malam': return 'neutral'
    default: return 'secondary'
  }
}

function shiftCrossesMidnight(def?: { start?: string, end?: string } | null) {
  if (!def?.start || !def?.end) return false
  const [sh, sm] = def.start.split(':').map(s => Number(s ?? '0'))
  const [eh, em] = def.end.split(':').map(s => Number(s ?? '0'))
  if ([sh, sm, eh, em].some(Number.isNaN)) return false
  return (sh * 60 + sm) > (eh * 60 + em)
}

function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(s => Number(s ?? '0'))
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
              const cinMs = clockIn.timestampMs
              if (cinMs && cinMs > startMs) lateMs = Math.max(0, cinMs - startMs)
              if (clockOut) {
                const coutMs = clockOut.timestampMs
                if (coutMs && coutMs < endMs) earlyMs = Math.max(0, endMs - coutMs)
              }
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

onMounted(fetchReport)
watch(selectedMonth, fetchReport)
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <p v-if="loading" class="text-sm text-[var(--selaras-resolved-text-muted)]">
      {{ t('report.loading') }}
    </p>
    <div
      v-if="errorMsg"
      class="flex items-start gap-2 rounded-[var(--selaras-resolved-radius-md)] bg-[var(--_selaras-color-subtle)] p-3 text-sm text-[var(--_selaras-color-text)]"
    >
      <SIcon name="i-heroicons-exclamation-triangle" class="mt-0.5 size-4 shrink-0" />
      <span>{{ errorMsg }}</span>
    </div>

    <div v-if="summary && !loading" class="space-y-4">
      <!-- Overview. Five tiles, each with its own icon, so the numbers are
           scannable instead of being a wall of grey captions. -->
      <SCard :ui="{ body: 'p-0' }">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <SIcon name="i-heroicons-calendar-days" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
              <h2 class="text-sm font-semibold text-[var(--selaras-resolved-text-default)]">
                {{ t('report.overview') }}
              </h2>
            </div>
            <span class="shrink-0 font-mono text-sm tabular-nums text-[var(--selaras-resolved-text-muted)]">
              {{ monthLabel(summary?.month) }}
            </span>
          </div>
        </template>

        <dl class="grid grid-cols-2 divide-x divide-y divide-[var(--selaras-resolved-border-muted)] sm:grid-cols-3 sm:divide-y-0">
          <div class="p-4">
            <dt class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
              <SIcon name="i-heroicons-calendar-days" class="size-3.5 shrink-0" />
              {{ t('report.totalWorkingDays') }}
            </dt>
            <dd class="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[var(--selaras-resolved-text-default)]">
              {{ summary.totalWorkingDays }}
            </dd>
          </div>
          <div class="p-4">
            <dt class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
              <SIcon name="i-heroicons-sun" class="size-3.5 shrink-0" />
              {{ t('report.harianShiftDays') }}
            </dt>
            <dd class="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[var(--selaras-resolved-text-default)]">
              {{ summary.totalHarianShift }}
            </dd>
          </div>
          <div class="p-4">
            <dt class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
              <SIcon name="i-heroicons-lifebuoy" class="size-3.5 shrink-0" />
              {{ t('report.bantuanShiftDays') }}
            </dt>
            <dd class="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[var(--selaras-resolved-text-default)]">
              {{ summary.totalBantuanShift }}
            </dd>
          </div>
          <div class="p-4">
            <dt class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
              <SIcon name="i-heroicons-clock" class="size-3.5 shrink-0" />
              {{ t('report.totalLate') }}
            </dt>
            <dd class="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[var(--selaras-resolved-text-default)]">
              {{ fmtMinutes(summary.totalLateMinutes) }}
            </dd>
          </div>
          <div class="p-4">
            <dt class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
              <SIcon name="i-heroicons-arrow-uturn-left" class="size-3.5 shrink-0" />
              {{ t('report.totalEarlyLeave') }}
            </dt>
            <dd class="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[var(--selaras-resolved-text-default)]">
              {{ fmtMinutes(summary.totalEarlyLeaveMinutes) }}
            </dd>
          </div>
        </dl>
      </SCard>

      <p class="px-1 text-xs text-[var(--selaras-resolved-text-muted)]">
        {{ t('report.note') }}
      </p>

      <h3 class="flex items-center gap-2 px-1 pt-2 text-sm font-semibold text-[var(--selaras-resolved-text-default)]">
        <SIcon name="i-heroicons-calendar-days" class="size-4 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
        {{ t('report.dailyDetails') }}
      </h3>

      <div class="space-y-3">
        <SCard
          v-for="d in days"
          :key="d.date"
          :ui="{ body: 'p-0', header: 'flex flex-wrap items-center justify-between gap-2 bg-[var(--selaras-resolved-surface-elevated)] p-4' }"
        >
          <!-- Day header: date on the left, shift summary on the right. -->
          <template #header>
            <div class="font-mono text-sm font-medium tabular-nums text-[var(--selaras-resolved-text-default)]">
              {{ new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) }}
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <template v-if="(d.shifts || []).length">
                <SBadge
                  v-if="summarizeDay(d).harian"
                  color="success"
                  variant="soft"
                  size="sm"
                >
                  {{ t('report.harian') }}: {{ summarizeDay(d).harian }}
                </SBadge>
                <SBadge
                  v-if="summarizeDay(d).bantuan"
                  color="info"
                  variant="soft"
                  size="sm"
                >
                  {{ t('report.bantuan') }}: {{ summarizeDay(d).bantuan }}
                </SBadge>
                <SBadge
                  v-if="summarizeDay(d).unknown"
                  color="neutral"
                  variant="soft"
                  size="sm"
                >
                  {{ t('report.other') }}: {{ summarizeDay(d).unknown }}
                </SBadge>
              </template>
              <span v-else class="text-xs text-[var(--selaras-resolved-text-muted)]">
                {{ t('report.noShifts') }}
              </span>
            </div>
          </template>

          <!-- Day totals. -->
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--selaras-resolved-border-muted)] px-4 py-2 text-xs text-[var(--selaras-resolved-text-muted)]">
            <span class="inline-flex items-center gap-1.5">
              <SIcon name="i-heroicons-clock" class="size-3.5 shrink-0" />
              {{ t('report.late') }}: {{ fmtMinutes(Math.ceil(dayTotalLateMs(d) / 60000)) }}
            </span>
            <span class="inline-flex items-center gap-1.5">
              <SIcon name="i-heroicons-arrow-uturn-left" class="size-3.5 shrink-0" />
              {{ t('report.early') }}: {{ fmtMinutes(Math.ceil(dayTotalEarlyMs(d) / 60000)) }}
            </span>
          </div>

          <div class="divide-y divide-[var(--selaras-resolved-border-muted)]">
            <template v-for="shift in d.shifts" :key="JSON.stringify([shift.selectedShiftCode, shift.shiftType, shift.clockIn, shift.clockOut])">
              <div class="p-4">
                <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div class="w-full sm:w-44 sm:flex-none">
                    <div class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
                      <SIcon name="i-heroicons-clock" class="size-3.5 shrink-0" />
                      {{ t('report.shift') }}
                    </div>
                    <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <SBadge v-if="shift.selectedShiftCode" :color="shiftBadgeColor(shift.selectedShiftCode)" variant="solid">
                        {{ shift.selectedShiftCode }}
                      </SBadge>
                      <SBadge v-else variant="outline">
                        {{ shift.shiftType ?? t('report.unknown') }}
                      </SBadge>
                      <SBadge :color="shift.shiftType === 'bantuan' ? 'info' : 'neutral'" variant="soft" size="sm">
                        {{ shift.shiftType ? (shift.shiftType === 'harian' ? t('report.harian') : t('report.bantuan')) : t('report.unknown') }}
                      </SBadge>
                    </div>
                  </div>

                  <div class="grid w-full gap-4 sm:grid-cols-2">
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
                        <SIcon name="i-heroicons-arrow-right-on-rectangle" class="size-3.5 shrink-0" />
                        {{ t('report.clockIn') }}
                      </div>
                      <div class="mt-1 font-mono text-base font-medium tabular-nums text-[var(--selaras-resolved-text-default)]">
                        {{ formatTime(shift.clockIn) }}
                      </div>
                      <div class="mt-0.5 text-xs text-[var(--selaras-resolved-text-muted)]">
                        <span v-if="shift.clockInLat != null && shift.clockInLng != null">
                          <a
                            :href="mapUrl(shift.clockInLat, shift.clockInLng)"
                            target="_blank"
                            rel="noopener"
                            class="inline-flex items-center gap-1 underline underline-offset-2"
                          >
                            <SIcon name="i-heroicons-map-pin" class="size-3 shrink-0" />
                            {{ shift.clockInLat.toFixed(3) }}, {{ shift.clockInLng.toFixed(3) }}
                          </a>
                        </span>
                        <span v-else>-</span>
                        <span v-if="shift.clockInAccuracy != null"> • ±{{ Math.round(shift.clockInAccuracy) }}m</span>
                      </div>
                    </div>

                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5 text-xs text-[var(--selaras-resolved-text-muted)]">
                        <SIcon name="i-heroicons-arrow-left-on-rectangle" class="size-3.5 shrink-0" />
                        {{ t('report.clockOut') }}
                      </div>
                      <div class="mt-1 font-mono text-base font-medium tabular-nums text-[var(--selaras-resolved-text-default)]">
                        {{ formatTime(shift.clockOut) }}
                      </div>
                      <div class="mt-0.5 text-xs text-[var(--selaras-resolved-text-muted)]">
                        <span v-if="shift.clockOutLat != null && shift.clockOutLng != null">
                          <a
                            :href="mapUrl(shift.clockOutLat, shift.clockOutLng)"
                            target="_blank"
                            rel="noopener"
                            class="inline-flex items-center gap-1 underline underline-offset-2"
                          >
                            <SIcon name="i-heroicons-map-pin" class="size-3 shrink-0" />
                            {{ shift.clockOutLat.toFixed(3) }}, {{ shift.clockOutLng.toFixed(3) }}
                          </a>
                        </span>
                        <span v-else>-</span>
                        <span v-if="shift.clockOutAccuracy != null"> • ±{{ Math.round(shift.clockOutAccuracy) }}m</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </SCard>
      </div>
    </div>
  </div>
</template>
