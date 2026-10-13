<script setup lang="ts">
import type { CellStatus } from '~/utils/attendance-status'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseBusinessDate } from '~~/shared/utils/attendance-date'
import { entryEarlyMinutes as entryEarlyMinutesShared, entryLateMinutes as entryLateMinutesShared, resolveCellStatus, resolveEntryStatus } from '~/utils/attendance-status'

definePageMeta({ title: 'Attendance', pageTitle: 'Attendance - Admin - Attendance App' })

interface ShiftEntry {
  clockIn?: string | null
  clockOut?: string | null
  shiftCode?: string | null
  shiftStartIso?: string | null
  shiftEndIso?: string | null
  earlyReason?: string | null
}
interface DayCell {
  entries: unknown[]
  grouped?: Record<string, ShiftEntry>
  lateMs?: number
  earlyMs?: number
  workingShifts?: number
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
    title: 'Attendance board',
    intro: 'Every employee against every day of the month. Click a cell for that shift\'s detail, a name for the whole month.',
    refresh: 'Refresh',
    export: 'Export Excel',
    today: 'Today',
    prev: 'Previous month',
    next: 'Next month',
    close: 'Close',
    search: 'Search name, username or email…',
    searchLabel: 'Search employees',
    allShifts: 'All shifts',
    allStatuses: 'All statuses',
    onTime: 'On time',
    late: 'Late',
    earlyLeave: 'Left early',
    missing: 'Missing check-out',
    none: 'No record',
    employee: 'Employee',
    days: 'Days',
    lateCol: 'Late',
    dayDetails: 'Day detail',
    monthSummary: 'Month summary',
    showMonth: 'Show month summary',
    in: 'In',
    out: 'Out',
    minutes: 'min',
    early: 'left early by',
    note: 'Note',
    noRecords: 'No records for this day.',
    futureDay: 'Not yet recorded - day is in the future.',
    colDate: 'Date',
    colEmail: 'Email',
    colShift: 'Shift',
    colCode: 'Code',
    colIn: 'Clock in',
    colOut: 'Clock out',
    colStatus: 'Status',
    colLateMin: 'Late (min)',
    colEarlyMin: 'Left early (min)',
    colReason: 'Reason',
    totalDays: 'Days worked',
    totalLate: 'Late arrivals',
    totalMissing: 'Missing check-outs',
    errorTitle: 'Could not load the report',
    errorHelp: 'Please try refreshing.',
    emptyFiltered: 'No employees match the current search or filters.',
    exportPdf: 'Export PDF',
    pdfTitle: 'Attendance Report',
    pdfGenerated: 'Generated',
    pdfDetail: 'Daily detail',
    pdfColType: 'Shift type',
    pdfPage: 'Page',
    pdfFailed: 'Could not build the PDF',
  },
  id: {
    title: 'Papan kehadiran',
    intro: 'Setiap karyawan terhadap setiap hari dalam bulan. Klik sel untuk detail shift, klik nama untuk rekap bulanan.',
    refresh: 'Muat ulang',
    export: 'Ekspor Excel',
    today: 'Hari ini',
    prev: 'Bulan sebelumnya',
    next: 'Bulan berikutnya',
    close: 'Tutup',
    search: 'Cari nama, nama pengguna, atau email…',
    searchLabel: 'Cari karyawan',
    allShifts: 'Semua shift',
    allStatuses: 'Semua status',
    onTime: 'Tepat waktu',
    late: 'Terlambat',
    earlyLeave: 'Pulang awal',
    missing: 'Belum absen keluar',
    none: 'Tanpa catatan',
    employee: 'Karyawan',
    days: 'Hari',
    lateCol: 'Telat',
    dayDetails: 'Detail hari',
    monthSummary: 'Ringkasan bulan',
    showMonth: 'Lihat ringkasan bulan',
    in: 'Masuk',
    out: 'Keluar',
    minutes: 'mnt',
    early: 'pulang awal',
    note: 'Catatan',
    noRecords: 'Tidak ada catatan untuk hari ini.',
    futureDay: 'Belum tercatat - hari belum terjadi.',
    colDate: 'Tanggal',
    colEmail: 'Email',
    colShift: 'Shift',
    colCode: 'Kode',
    colIn: 'Jam masuk',
    colOut: 'Jam keluar',
    colStatus: 'Status',
    colLateMin: 'Telat (mnt)',
    colEarlyMin: 'Pulang awal (mnt)',
    colReason: 'Alasan',
    totalDays: 'Hari kerja',
    totalLate: 'Datang terlambat',
    totalMissing: 'Belum absen keluar',
    errorTitle: 'Gagal memuat laporan',
    errorHelp: 'Silakan coba muat ulang.',
    emptyFiltered: 'Tidak ada karyawan yang cocok dengan pencarian atau filter.',
    exportPdf: 'Ekspor PDF',
    pdfTitle: 'Laporan Kehadiran',
    pdfGenerated: 'Dibuat',
    pdfDetail: 'Rincian harian',
    pdfColType: 'Jenis shift',
    pdfPage: 'Halaman',
    pdfFailed: 'Gagal membuat PDF',
  },
}
const c = computed(() => copy[locale.value === 'id' ? 'id' : 'en'])

// Business calendar helpers. Dates arrive as YYYY-MM-DD strings keyed to the
// business timezone; the vetted shared utils exist, but only two tiny things
// are needed here - the local today string and weekday letters - and both are
// pure Intl, so the page computes them inline.
const language = computed(() => locale.value === 'id' ? 'id-ID' : 'en-GB')
const now = ref(new Date())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  clock = setInterval(() => (now.value = new Date()), 60_000)
})
onBeforeUnmount(() => clearInterval(clock))
const today = computed(() => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now.value))

// Month state. Pure UTC Date math on YYYY-MM strings - no Temporal needed to
// step one month back or forward.
const month = ref(today.value.slice(0, 7))
const monthDate = computed(() => new Date(`${month.value}-01T00:00:00Z`))
const currentMonth = computed(() => today.value.slice(0, 7))
function stepMonth(amount: number) {
  const d = monthDate.value
  month.value = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + amount, 1)).toISOString().slice(0, 7)
}
const monthLabel = computed(() => new Intl.DateTimeFormat(language.value, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(monthDate.value))
const canGoNext = computed(() => month.value < currentMonth.value)

// Direct month jump: the Selaras date picker in month granularity models the
// selection as a day-1 calendar date, so bridge it to the YYYY-MM string the
// board and the endpoint speak. Future months are not pickable.
const monthPickerValue = computed({
  get: () => parseBusinessDate(`${month.value}-01`),
  set: (value) => {
    if (!value)
      return
    month.value = String(value.toString()).slice(0, 7)
  },
})
function isMonthDisabled(date: { toString: () => string }) {
  return date.toString().slice(0, 7) > currentMonth.value
}

const search = ref('')
const shiftType = ref<'all' | 'harian' | 'bantuan'>('all')
const statusFilter = ref<'all' | CellStatus>('all')

const { data, status, error, refresh } = await useFetch<Report>('/api/admin/attendance', { query: { month }, credentials: 'include' })
const pending = computed(() => status.value === 'pending')
// Guard against a stale response rendering over a freshly selected month.
const employees = computed(() => data.value?.month === month.value ? data.value.rows : [])
const days = computed(() => data.value?.month === month.value ? (data.value.days ?? []) : [])
const dayHead = computed(() => days.value.map((date) => {
  const d = new Date(`${date}T00:00:00Z`)
  return {
    date,
    num: d.getUTCDate(),
    weekday: new Intl.DateTimeFormat(language.value, { weekday: 'narrow', timeZone: 'UTC' }).format(d),
    weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
    future: date > today.value,
    isToday: date === today.value,
  }
}))

// One status per employee-day from the already-reconciled server cells.
// Missing check-out outranks late, which outranks a short shift: a red cell
// says "someone never closed the shift", which is the thing most worth
// spotting from across the room.
function cellStatus(cell: DayCell | undefined, future: boolean): CellStatus {
  return resolveCellStatus(cell, future, shiftType.value)
}

const statusDot: Record<CellStatus, string> = {
  onTime: 'bg-emerald-500/90 hover:bg-emerald-500 dark:bg-emerald-400/90 dark:hover:bg-emerald-400',
  late: 'bg-amber-500/90 hover:bg-amber-500 dark:bg-amber-400/90 dark:hover:bg-amber-400',
  early: 'bg-violet-500/90 hover:bg-violet-500 dark:bg-violet-400/90 dark:hover:bg-violet-400',
  missing: 'bg-red-500/90 hover:bg-red-500 dark:bg-red-400/90 dark:hover:bg-red-400',
  none: 'bg-gray-200 hover:bg-gray-300 dark:bg-neutral-700/70 dark:hover:bg-neutral-600/70',
}

function fmtTime(iso?: string | null) {
  return iso ? new Date(iso).toLocaleTimeString(language.value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }) : '—'
}
function fmtDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) {
  return new Intl.DateTimeFormat(language.value, opts).format(new Date(`${date}T00:00:00Z`))
}
function fmtMinutes(ms?: number) {
  const min = Math.round((ms ?? 0) / 60_000)
  return `${min} ${c.value.minutes}`
}

// Native title tooltips carry the per-cell numbers - hoverable context
// without shipping a tooltip dependency into the page.
function cellTitle(employee: Employee, date: string, future: boolean) {
  const cell = employee.byDate[date]
  const status = cellStatus(cell, future)
  const base = `${fmtDate(date)}`
  if (status === 'none')
    return `${base} — ${c.value.none}`
  const lines = Object.entries(cell?.grouped ?? {}).filter(([st]) => shiftType.value === 'all' || st === shiftType.value).map(([st, e]) => `${st}${e.shiftCode ? ` (${e.shiftCode})` : ''}: ${c.value.in} ${fmtTime(e.clockIn)}, ${c.value.out} ${fmtTime(e.clockOut)}${lateSuffix(e)}${earlySuffix(e)}`)
  return [base, ...lines].join('\n')
}
function lateSuffix(e: ShiftEntry) {
  return e.clockIn && e.shiftStartIso && Date.parse(e.clockIn) > Date.parse(e.shiftStartIso) ? ` • ${c.value.late.toLowerCase()} ${fmtMinutes(Date.parse(e.clockIn) - Date.parse(e.shiftStartIso))}` : ''
}
function earlySuffix(e: ShiftEntry) {
  return e.clockOut && e.shiftEndIso && Date.parse(e.clockOut) < Date.parse(e.shiftEndIso) ? ` • ${c.value.early} ${fmtMinutes(Date.parse(e.shiftEndIso) - Date.parse(e.clockOut))}` : ''
}

// Employee month totals for the right-hand columns of the board.
function totals(employee: Employee) {
  let worked = 0
  let late = 0
  let missing = 0
  for (const day of days.value) {
    const cell = employee.byDate[day]
    const st = cellStatus(cell, day > today.value)
    if (st !== 'none')
      worked += st === 'onTime' || st === 'late' ? 1 : 0
    if (st === 'late') late++
    if (st === 'missing') missing++
  }
  return { worked, late, missing }
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return employees.value.filter((e) => {
    const hay = `${e.name ?? ''} ${e.username ?? ''} ${e.email ?? ''}`.toLowerCase()
    if (q && !hay.includes(q))
      return false
    if (statusFilter.value === 'all')
      return true
    return days.value.some(day => cellStatus(e.byDate[day], day > today.value) === statusFilter.value)
  })
})

// Summary counts over the visible employees - one number chip per status.
const summary = computed(() => {
  let late = 0
  let early = 0
  let missing = 0
  let onTime = 0
  for (const e of filtered.value) {
    for (const day of days.value) {
      const st = cellStatus(e.byDate[day], day > today.value)
      if (st === 'late') late++
      else if (st === 'early') early++
      else if (st === 'missing') missing++
      else if (st === 'onTime' && day <= today.value) onTime++
    }
  }
  return { late, early, missing, onTime }
})

// Excel export in the spirit of the original attendance page: a real .xlsx
// via ExcelJS, one row per shift record, honouring the current search /
// shift-type / status filters. Labels come from the copy table so the file
// follows the UI language.
function recordStatus(e: ShiftEntry): CellStatus {
  return resolveEntryStatus(e)
}
function statusLabel(status: CellStatus) {
  // 'early' has no direct copy key - the label lives in earlyLeave.
  return c.value[status === 'early' ? 'earlyLeave' : status]
}
function entryLateMinutes(e: ShiftEntry) {
  return entryLateMinutesShared(e) ?? ''
}
function entryEarlyMinutes(e: ShiftEntry) {
  return entryEarlyMinutesShared(e) ?? ''
}
function exportRecords() {
  return filtered.value.flatMap((employee) => {
    const out: Array<Array<string | number>> = []
    for (const day of days.value) {
      for (const [st, entry] of Object.entries(employee.byDate[day]?.grouped ?? {}).filter(([type]) => shiftType.value === 'all' || type === shiftType.value)) {
        if (!entry.clockIn && !entry.clockOut)
          continue
        out.push([
          employee.name || employee.username || '-',
          employee.email ?? '',
          day,
          String(st),
          entry.shiftCode ?? '',
          fmtTime(entry.clockIn),
          fmtTime(entry.clockOut),
          statusLabel(recordStatus(entry)),
          entryLateMinutes(entry),
          entryEarlyMinutes(entry),
          entry.earlyReason ?? '',
        ])
      }
    }
    return out
  })
}
async function getExcelJS() {
  const mod: any = await import('exceljs')
  return mod?.default ?? mod
}
async function exportXlsx() {
  const ExcelJS = await getExcelJS()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(month.value)
  ws.columns = [
    { width: 24 },
    { width: 28 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 16 },
    { width: 12 },
    { width: 16 },
    { width: 32 },
  ].map((col, i) => ({ ...col, header: [c.value.employee, c.value.colEmail, c.value.colDate, c.value.colShift, c.value.colCode, c.value.colIn, c.value.colOut, c.value.colStatus, c.value.colLateMin, c.value.colEarlyMin, c.value.colReason][i] }))
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.addRows(exportRecords())
  const buffer = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `attendance-board-${month.value}.xlsx`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// PDF export: the document always covers the whole month for every
// employee regardless of on-screen filters, so a printed report tells one
// consistent story. Statuses and colors come from the shared
// attendance-status util - the same machinery behind the board's matrix -
// so a printed cell means what the screen shows.
async function exportPdf() {
  try {
    const { buildAttendancePdf } = await import('~/utils/attendance-pdf')
    const doc = buildAttendancePdf(
      { month: month.value, days: days.value, rows: employees.value },
      {
        copy: {
          title: c.value.pdfTitle,
          generatedAt: c.value.pdfGenerated,
          detailTitle: c.value.pdfDetail,
          colType: c.value.pdfColType,
          page: c.value.pdfPage,
          colDate: c.value.colDate,
          colShift: c.value.colShift,
          colIn: c.value.colIn,
          colOut: c.value.colOut,
          colStatus: c.value.colStatus,
          employee: c.value.employee,
          totalDays: c.value.totalDays,
          totalLate: c.value.totalLate,
          totalMissing: c.value.totalMissing,
          colLateMin: c.value.colLateMin,
          colEarlyMin: c.value.colEarlyMin,
          onTime: c.value.onTime,
          late: c.value.late,
          earlyLeave: c.value.earlyLeave,
          missing: c.value.missing,
          none: c.value.none,
        },
        monthLabel: monthLabel.value,
        generatedAt: new Intl.DateTimeFormat(language.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date()),
        timezone,
        language: language.value,
        todayYmd: today.value,
      },
    )
    doc.save(`attendance-${month.value}.pdf`)
  }
  catch (err) {
    useToast().add({ title: c.value.pdfFailed, description: err instanceof Error ? err.message : String(err), color: 'danger' })
    useErrorReporter().captureException(err, { context: 'attendance-pdf-export' })
  }
}

// Drill-down drawer: a clicked cell focuses one day, a clicked name focuses
// the employee's whole month with clickable days.
const selected = ref<{ userId: string, date: string | null } | null>(null)
const selectedEmployee = computed(() => selected.value ? employees.value.find(e => e.userId === selected.value!.userId) ?? null : null)
const selectedCell = computed(() => selected.value?.date ? selectedEmployee.value?.byDate[selected.value.date] : undefined)
const selectedEntries = computed(() => {
  if (!selected.value?.date)
    return []
  return Object.entries(selectedCell.value?.grouped ?? {}).filter(([st]) => shiftType.value === 'all' || st === shiftType.value)
})
const monthNotes = computed(() => {
  if (!selected.value || selected.value.date || !selectedEmployee.value)
    return []
  return days.value
    .filter((day) => {
      const grouped = selectedEmployee.value!.byDate[day]?.grouped
      return grouped && Object.entries(grouped).some(([st]) => shiftType.value === 'all' || st === shiftType.value)
    })
    .map(day => ({ day, entries: Object.entries(selectedEmployee.value!.byDate[day].grouped!).filter(([st]) => shiftType.value === 'all' || st === shiftType.value) }))
})

function openDay(userId: string, date: string) {
  selected.value = { userId, date }
}
function openMonth(userId: string) {
  selected.value = { userId, date: null }
}
function closeDrawer() {
  selected.value = null
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape')
    closeDrawer()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const shiftItems = computed(() => [
  { label: c.value.allShifts, value: 'all' },
  { label: 'Harian', value: 'harian' },
  { label: 'Bantuan', value: 'bantuan' },
])
const statusItems = computed(() => [
  { label: c.value.allStatuses, value: 'all' },
  { label: c.value.onTime, value: 'onTime' },
  { label: c.value.late, value: 'late' },
  { label: c.value.earlyLeave, value: 'early' },
  { label: c.value.missing, value: 'missing' },
  { label: c.value.none, value: 'none' },
])
</script>

<template>
  <PageWrapper>
    <div class="px-4 py-6 text-sm text-(--selaras-resolved-text-default) sm:px-8 sm:py-7 max-[640px]:py-5">
      <!-- Heading with month stepper: the month is the primary navigation on a
           board like this, so it sits next to the title, not in a toolbar. -->
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
          <div class="flex items-center rounded-lg border border-[var(--selaras-resolved-border-default)] overflow-hidden">
            <button
              type="button"
              class="px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-neutral-800 text-(--selaras-resolved-text-muted) cursor-pointer"
              :aria-label="c.prev"
              @click="stepMonth(-1)"
            >
              <SIcon name="i-heroicons-chevron-left" class="size-4" />
            </button>
            <SDatePicker
              v-model="monthPickerValue"
              granularity="month"
              trigger-mode="button"
              :locale="language"
              :is-month-disabled="isMonthDisabled"
              :aria-label="monthLabel"
              class="min-w-44"
            />
            <button
              type="button"
              class="px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-neutral-800 text-(--selaras-resolved-text-muted) disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              :aria-label="c.next"
              :disabled="!canGoNext"
              @click="stepMonth(1)"
            >
              <SIcon name="i-heroicons-chevron-right" class="size-4" />
            </button>
          </div>
          <SButton
            color="neutral"
            variant="outline"
            icon="i-heroicons-calendar-days"
            :disabled="month === currentMonth"
            @click="month = currentMonth"
          >
            {{ c.today }}
          </SButton>
          <SButton
            color="neutral"
            variant="outline"
            icon="i-heroicons-arrow-path"
            :loading="pending"
            @click="refresh()"
          >
            {{ c.refresh }}
          </SButton>
          <SButton
            color="neutral"
            variant="outline"
            icon="i-heroicons-arrow-down-tray"
            :disabled="pending || !!error || !filtered.length"
            @click="exportXlsx()"
          >
            {{ c.export }}
          </SButton>
          <SButton
            color="neutral"
            variant="outline"
            icon="i-heroicons-document-arrow-down"
            :disabled="pending || !!error || !employees.length"
            @click="exportPdf()"
          >
            {{ c.exportPdf }}
          </SButton>
        </div>
      </header>

      <!-- Legend doubles as the live month summary: the count sits right next
           to the color it counts. -->
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-xs text-(--selaras-resolved-text-muted)">
        <span class="inline-flex items-center gap-1.5">
          <span class="size-3 rounded-[4px] bg-emerald-500 dark:bg-emerald-400" /> {{ c.onTime }} <span class="tabular-nums font-semibold text-(--selaras-resolved-text-default)">{{ summary.onTime }}</span>
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="size-3 rounded-[4px] bg-amber-500 dark:bg-amber-400" /> {{ c.late }} <span class="tabular-nums font-semibold text-(--selaras-resolved-text-default)">{{ summary.late }}</span>
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="size-3 rounded-[4px] bg-violet-500 dark:bg-violet-400" /> {{ c.earlyLeave }} <span class="tabular-nums font-semibold text-(--selaras-resolved-text-default)">{{ summary.early }}</span>
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="size-3 rounded-[4px] bg-red-500 dark:bg-red-400" /> {{ c.missing }} <span class="tabular-nums font-semibold text-(--selaras-resolved-text-default)">{{ summary.missing }}</span>
        </span>
      </div>

      <SCard class="overflow-hidden" :ui="{ header: 'p-0', body: 'p-0' }">
        <!-- Toolbar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--selaras-resolved-border-muted)]">
          <SInput
            v-model="search"
            type="search"
            icon="i-heroicons-magnifying-glass"
            :placeholder="c.search"
            :aria-label="c.searchLabel"
            class="w-full sm:w-72"
          />
          <SSelect v-model="shiftType" :items="shiftItems" class="w-40" />
          <SSelect v-model="statusFilter" :items="statusItems" class="w-44" />
        </div>

        <!-- Loading skeleton: keep the board's shape so the swap is calm. -->
        <div v-if="pending" class="p-4 space-y-3" aria-busy="true">
          <div
            v-for="i in 8"
            :key="i"
            class="h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 animate-pulse"
            :style="{ width: `${70 + ((i * 13) % 25)}%` }"
          />
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

        <div v-else-if="!filtered.length" class="p-10 text-center text-(--selaras-resolved-text-muted)">
          {{ c.emptyFiltered }}
        </div>

        <!-- The board. A real table: sticky header, sticky name column, and
             one compact cell per day. Weekend and today columns get a wash so
             the eye can find its bearings without reading numbers. -->
        <div v-else class="overflow-x-auto">
          <table class="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th class="sticky left-0 top-0 z-30 bg-white dark:bg-neutral-900 border-b border-r border-[var(--selaras-resolved-border-muted)] px-4 py-2.5 text-left font-medium text-(--selaras-resolved-text-muted) min-w-52">
                  {{ c.employee }}
                </th>
                <th
                  v-for="h in dayHead"
                  :key="h.date"
                  class="sticky top-0 z-20 bg-white dark:bg-neutral-900 border-b border-[var(--selaras-resolved-border-muted)] px-0 py-1.5 text-center font-medium min-w-9"
                  :class="[h.weekend && !h.isToday ? 'bg-gray-50/80 dark:bg-neutral-950/60' : '', h.isToday ? 'bg-sky-50 dark:bg-sky-950/40' : '']"
                >
                  <div class="text-[10px] uppercase tracking-wide text-(--selaras-resolved-text-muted)" :class="h.isToday ? 'text-sky-600 dark:text-sky-400' : ''">
                    {{ h.weekday }}
                  </div>
                  <div class="text-xs tabular-nums" :class="h.isToday ? 'text-sky-600 dark:text-sky-400 font-semibold' : 'text-(--selaras-resolved-text-muted)'">
                    {{ h.num }}
                  </div>
                </th>
                <th class="sticky top-0 z-20 bg-white dark:bg-neutral-900 border-b border-l border-[var(--selaras-resolved-border-muted)] px-3 py-2.5 text-center font-medium text-(--selaras-resolved-text-muted) min-w-16">
                  {{ c.days }}
                </th>
                <th class="sticky top-0 z-20 bg-white dark:bg-neutral-900 border-b border-[var(--selaras-resolved-border-muted)] px-3 py-2.5 text-center font-medium text-(--selaras-resolved-text-muted) min-w-16">
                  {{ c.lateCol }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="e in filtered"
                :key="e.userId"
                class="group/row"
              >
                <th
                  scope="row"
                  class="sticky left-0 z-10 bg-white dark:bg-neutral-900 border-b border-r border-[var(--selaras-resolved-border-muted)] px-4 py-1.5 text-left font-normal group-hover/row:bg-gray-50 dark:group-hover/row:bg-neutral-800/60"
                >
                  <button
                    type="button"
                    class="flex items-center gap-2 max-w-full cursor-pointer text-left"
                    :title="c.showMonth"
                    @click="openMonth(e.userId)"
                  >
                    <SAvatar
                      :src="userAvatarUri(e.userId)"
                      :text="String(e.name || e.username || '?').split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')"
                      :alt="e.name || e.username || '?'"
                      size="xs"
                      class="shrink-0"
                    />
                    <span class="truncate">
                      <span class="font-medium text-(--selaras-resolved-text-default)">{{ e.name || e.username }}</span>
                      <span v-if="e.name && e.username" class="text-xs text-(--selaras-resolved-text-muted)"> · @{{ e.username }}</span>
                    </span>
                  </button>
                </th>
                <td
                  v-for="h in dayHead"
                  :key="h.date"
                  class="border-b border-[var(--selaras-resolved-border-muted)] p-0 text-center"
                  :class="[h.weekend && !h.isToday ? 'bg-gray-50/60 dark:bg-neutral-950/40' : '', h.isToday ? 'bg-sky-50/70 dark:bg-sky-950/30' : '']"
                >
                  <button
                    v-if="!h.future"
                    type="button"
                    class="mx-auto my-1 size-[18px] rounded-[5px] cursor-pointer transition-colors grid place-items-center"
                    :class="[
                      statusDot[cellStatus(e.byDate[h.date], h.future)],
                      statusFilter !== 'all' && cellStatus(e.byDate[h.date], h.future) !== statusFilter ? 'opacity-15' : '',
                      selected?.userId === e.userId && selected?.date === h.date ? 'ring-2 ring-sky-500 ring-offset-1 ring-offset-white dark:ring-offset-neutral-900' : '',
                    ]"
                    :title="cellTitle(e, h.date, h.future)"
                    :aria-label="cellTitle(e, h.date, h.future)"
                    @click="openDay(e.userId, h.date)"
                  >
                    <span
                      v-if="cellStatus(e.byDate[h.date], h.future) === 'none'"
                      class="size-1 rounded-full bg-gray-400/70 dark:bg-neutral-500/70"
                    />
                  </button>
                </td>
                <td class="border-b border-l border-[var(--selaras-resolved-border-muted)] p-0 text-center tabular-nums text-(--selaras-resolved-text-muted)">
                  <span class="block bg-white dark:bg-neutral-900 group-hover/row:bg-gray-50 dark:group-hover/row:bg-neutral-800/60 h-full py-2.5">{{ totals(e).worked }}</span>
                </td>
                <td class="border-b border-[var(--selaras-resolved-border-muted)] p-0 text-center tabular-nums">
                  <span
                    class="block bg-white dark:bg-neutral-900 group-hover/row:bg-gray-50 dark:group-hover/row:bg-neutral-800/60 h-full py-2.5 px-3"
                    :class="totals(e).late ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-(--selaras-resolved-text-muted)'"
                  >{{ totals(e).late }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SCard>

      <!-- Drawer: day detail or month summary depending on what was clicked. -->
      <Teleport to="body">
        <Transition name="drawer">
          <div
            v-if="selected && selectedEmployee"
            class="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-[var(--selaras-resolved-border-muted)] bg-white dark:bg-neutral-900 shadow-2xl flex flex-col"
            role="dialog"
            :aria-label="selected.date ? c.dayDetails : c.monthSummary"
          >
            <div class="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--selaras-resolved-border-muted)]">
              <div class="min-w-0">
                <p class="font-semibold text-(--selaras-resolved-text-default) truncate">
                  {{ selectedEmployee.name || selectedEmployee.username }}
                </p>
                <p class="text-xs text-(--selaras-resolved-text-muted) mt-0.5">
                  @{{ selectedEmployee.username }} · {{ selectedEmployee.email }}
                </p>
              </div>
              <SButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-heroicons-x-mark"
                :aria-label="c.close"
                @click="closeDrawer"
              />
            </div>

            <!-- Day mode -->
            <template v-if="selected.date">
              <div class="px-5 py-3 border-b border-[var(--selaras-resolved-border-muted)] flex items-center justify-between gap-2">
                <p class="text-sm font-medium text-(--selaras-resolved-text-default)">
                  {{ fmtDate(selected.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) }}
                </p>
                <button
                  type="button"
                  class="text-xs text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                  @click="selected = { userId: selected.userId, date: null }"
                >
                  {{ c.monthSummary }}
                </button>
              </div>
              <div v-if="!selectedEntries.length" class="px-5 py-8 text-center text-(--selaras-resolved-text-muted)">
                {{ selected.date > today ? c.futureDay : c.noRecords }}
              </div>
              <div v-else class="px-5 py-4 space-y-3 overflow-y-auto">
                <div
                  v-for="[st, e] in selectedEntries"
                  :key="st"
                  class="rounded-lg border border-[var(--selaras-resolved-border-muted)] p-3.5"
                >
                  <p class="flex items-center gap-2 text-sm font-medium text-(--selaras-resolved-text-default) mb-2.5">
                    <span class="capitalize">{{ st }}</span>
                    <span v-if="e.shiftCode" class="rounded px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-neutral-800 text-(--selaras-resolved-text-muted)">{{ e.shiftCode }}</span>
                  </p>
                  <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt class="text-xs text-(--selaras-resolved-text-muted)">
                        {{ c.in }}
                      </dt>
                      <dd class="tabular-nums mt-0.5">
                        {{ fmtTime(e.clockIn) }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-xs text-(--selaras-resolved-text-muted)">
                        {{ c.out }}
                      </dt>
                      <dd class="tabular-nums mt-0.5">
                        {{ fmtTime(e.clockOut) }}
                      </dd>
                    </div>
                    <div v-if="e.clockIn && e.shiftStartIso && Date.parse(e.clockIn) > Date.parse(e.shiftStartIso)">
                      <dt class="text-xs text-amber-600 dark:text-amber-400">
                        {{ c.late }}
                      </dt>
                      <dd class="tabular-nums mt-0.5 text-amber-600 dark:text-amber-400">
                        {{ fmtMinutes(Date.parse(e.clockIn) - Date.parse(e.shiftStartIso)) }}
                      </dd>
                    </div>
                    <div v-if="e.clockOut && e.shiftEndIso && Date.parse(e.clockOut) < Date.parse(e.shiftEndIso)">
                      <dt class="text-xs text-(--selaras-resolved-text-muted)">
                        {{ c.early }}
                      </dt>
                      <dd class="tabular-nums mt-0.5">
                        {{ fmtMinutes(Date.parse(e.shiftEndIso) - Date.parse(e.clockOut)) }}
                      </dd>
                    </div>
                  </dl>
                  <p v-if="e.earlyReason" class="mt-2.5 text-xs text-(--selaras-resolved-text-muted) border-t border-[var(--selaras-resolved-border-muted)] pt-2.5">
                    <span class="font-medium">{{ c.note }}:</span> {{ e.earlyReason }}
                  </p>
                </div>
              </div>
            </template>

            <!-- Month mode -->
            <template v-else>
              <div class="px-5 py-4 grid grid-cols-3 gap-3 border-b border-[var(--selaras-resolved-border-muted)]">
                <div class="text-center">
                  <p class="text-xl font-semibold tabular-nums">
                    {{ totals(selectedEmployee).worked }}
                  </p>
                  <p class="text-xs text-(--selaras-resolved-text-muted) mt-0.5">
                    {{ c.totalDays }}
                  </p>
                </div>
                <div class="text-center">
                  <p class="text-xl font-semibold tabular-nums" :class="totals(selectedEmployee).late ? 'text-amber-600 dark:text-amber-400' : ''">
                    {{ totals(selectedEmployee).late }}
                  </p>
                  <p class="text-xs text-(--selaras-resolved-text-muted) mt-0.5">
                    {{ c.totalLate }}
                  </p>
                </div>
                <div class="text-center">
                  <p class="text-xl font-semibold tabular-nums" :class="totals(selectedEmployee).missing ? 'text-red-600 dark:text-red-400' : ''">
                    {{ totals(selectedEmployee).missing }}
                  </p>
                  <p class="text-xs text-(--selaras-resolved-text-muted) mt-0.5">
                    {{ c.totalMissing }}
                  </p>
                </div>
              </div>
              <div class="px-5 py-4 overflow-y-auto space-y-1.5">
                <button
                  v-for="{ day, entries } in monthNotes"
                  :key="day"
                  type="button"
                  class="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-neutral-800/60 cursor-pointer"
                  @click="selected = { userId: selected.userId, date: day }"
                >
                  <span
                    class="size-3 rounded-[4px] shrink-0"
                    :class="statusDot[cellStatus(selectedEmployee.byDate[day], day > today)]"
                  />
                  <span class="w-24 shrink-0 text-sm tabular-nums text-(--selaras-resolved-text-muted)">{{ fmtDate(day) }}</span>
                  <span class="text-sm tabular-nums truncate">
                    <template v-for="([st, e], i) in entries" :key="st">
                      <span v-if="i" class="text-(--selaras-resolved-text-muted)"> · </span>
                      <span>{{ fmtTime(e.clockIn) }}–{{ fmtTime(e.clockOut) }}</span>
                    </template>
                  </span>
                </button>
              </div>
            </template>
          </div>
        </Transition>
      </Teleport>
    </div>
  </PageWrapper>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
  opacity: 0.5;
}
</style>
