<script setup lang="ts">
import SColumn from '@sewadah/selaras/components/Column.js'
import { useI18n } from 'vue-i18n'
import { createShiftWindow, getCalendarDate, parseBusinessDate } from '~~/shared/utils/attendance-date'

definePageMeta({ title: 'Attendance 3', pageTitle: 'Attendance report - Admin' })

interface Entry {
  shiftType: string
  shiftCode?: string | null
  shiftStart?: string | null
  shiftEnd?: string | null
  shiftStartIso?: string
  shiftEndIso?: string
  clockIn?: string
  clockOut?: string
  earlyReason?: string | null
}
interface Cell { grouped: Record<string, Omit<Entry, 'shiftType'>> }
interface Employee {
  userId: string
  name?: string | null
  username?: string | null
  email: string
  byDate: Record<string, Cell>
}
interface Report { month: string, days: string[], rows: Employee[] }
interface Shift { code: string, label?: string | null, start: string, end: string }
type AttendanceStatus = 'onTime' | 'late' | 'unknown' | 'noCheckIn' | 'noRecord'

const { locale } = useI18n()
const copy = {
  en: {
    title: 'Attendance report',
    intro: 'Review daily attendance and monthly employee totals.',
    daily: 'Daily report',
    recap: 'Monthly recap',
    today: 'Today',
    previous: 'Previous day',
    next: 'Next day',
    date: 'Report date',
    month: 'Report month',
    refresh: 'Refresh',
    export: 'Export CSV',
    employees: 'Employees',
    checkedIn: 'Checked in',
    noCheckIn: 'No check-in',
    late: 'Late',
    missing: 'Missing check-out',
    attendedDays: 'Attendance days',
    harian: 'Harian shifts',
    bantuan: 'Bantuan shifts',
    lateShifts: 'Late shifts',
    search: 'Search name, username or email…',
    searchLabel: 'Search employees',
    allShifts: 'All shift types',
    allStatuses: 'All statuses',
    onTime: 'On time',
    unknown: 'Timing unavailable',
    noRecord: 'No record',
    early: 'Left early',
    active: 'Not checked out',
    complete: 'Checked out',
    employee: 'Employee',
    shift: 'Shift',
    attendance: 'Arrival',
    clockIn: 'Check-in',
    clockOut: 'Check-out',
    duration: 'Recorded hours',
    departure: 'Departure',
    details: 'Details',
    hideDetails: 'Hide details',
    schedule: 'Shift time',
    reason: 'Early departure reason',
    noData: 'No employees to report',
    noDataHelp: 'Employee attendance will appear here once employee accounts are available.',
    noMatches: 'No employees match these filters',
    noMatchesHelp: 'Try another name or clear the filters to see everyone.',
    clear: 'Clear filters',
    error: 'Could not load attendance',
    errorHelp: 'Please try refreshing the report.',
    retry: 'Try again',
    dailyNote: 'No check-in means no recorded arrival. It does not confirm absence without a roster or leave schedule.',
    recapNote: 'Attendance days count distinct dates. Harian and Bantuan count shifts with a check-in; both can occur on the same day.',
    hoursNote: 'Recorded hours are completed check-in to check-out spans; breaks are not deducted. All times are WIB (Asia/Jakarta).',
    noEntries: 'No attendance records for this date.',
    noMonthEntries: 'No attendance records for this month.',
    showing: 'Showing',
    of: 'of',
    people: 'employees',
    page: 'Page',
    previousPage: 'Previous page',
    nextPage: 'Next page',
    sort: 'Sort employees',
    nameSort: 'Name A–Z',
    lateSort: 'Most late shifts',
    daysSort: 'Most attendance days',
    attentionSort: 'Needs review first',
    lateDuration: 'Total lateness',
    earlyShifts: 'Early departures',
    recordedShifts: 'Recorded shifts',
    review: 'Needs review',
    viewDay: 'View daily report',
    incomplete: 'Incomplete record',
    futureNote: 'This date is in the future. A missing record does not indicate absence.',
    noTiming: 'No shift timing available',
    loading: 'Loading attendance report',
    records: 'shift records',
  },
  id: {
    title: 'Laporan kehadiran',
    intro: 'Periksa kehadiran harian dan rekap bulanan karyawan.',
    daily: 'Laporan harian',
    recap: 'Rekap bulanan',
    today: 'Hari ini',
    previous: 'Hari sebelumnya',
    next: 'Hari berikutnya',
    date: 'Tanggal laporan',
    month: 'Bulan laporan',
    refresh: 'Muat ulang',
    export: 'Ekspor CSV',
    employees: 'Karyawan',
    checkedIn: 'Sudah masuk',
    noCheckIn: 'Belum tercatat masuk',
    late: 'Terlambat',
    missing: 'Belum tercatat keluar',
    attendedDays: 'Hari hadir',
    harian: 'Shift harian',
    bantuan: 'Shift bantuan',
    lateShifts: 'Shift terlambat',
    search: 'Cari nama, username atau email…',
    searchLabel: 'Cari karyawan',
    allShifts: 'Semua jenis shift',
    allStatuses: 'Semua status',
    onTime: 'Tepat waktu',
    unknown: 'Waktu shift tidak tersedia',
    noRecord: 'Tidak ada catatan',
    early: 'Pulang awal',
    active: 'Belum absen keluar',
    complete: 'Sudah keluar',
    employee: 'Karyawan',
    shift: 'Shift',
    attendance: 'Kedatangan',
    clockIn: 'Absen masuk',
    clockOut: 'Absen keluar',
    duration: 'Jam tercatat',
    departure: 'Kepulangan',
    details: 'Detail',
    hideDetails: 'Tutup detail',
    schedule: 'Waktu shift',
    reason: 'Alasan pulang awal',
    noData: 'Belum ada karyawan',
    noDataHelp: 'Kehadiran akan ditampilkan setelah akun karyawan tersedia.',
    noMatches: 'Tidak ada karyawan yang cocok',
    noMatchesHelp: 'Coba nama lain atau hapus filter untuk melihat semua karyawan.',
    clear: 'Hapus filter',
    error: 'Gagal memuat kehadiran',
    errorHelp: 'Silakan muat ulang laporan.',
    retry: 'Coba lagi',
    dailyNote: 'Belum tercatat masuk berarti tidak ada catatan kedatangan. Ketidakhadiran belum bisa dipastikan tanpa jadwal kerja atau cuti.',
    recapNote: 'Hari hadir dihitung per tanggal. Harian dan Bantuan menghitung shift dengan absen masuk; keduanya bisa terjadi pada hari yang sama.',
    hoursNote: 'Jam tercatat dihitung dari absen masuk hingga keluar yang lengkap, tanpa pengurangan istirahat. Semua waktu dalam WIB (Asia/Jakarta).',
    noEntries: 'Tidak ada catatan kehadiran pada tanggal ini.',
    noMonthEntries: 'Tidak ada catatan kehadiran pada bulan ini.',
    showing: 'Menampilkan',
    of: 'dari',
    people: 'karyawan',
    page: 'Halaman',
    previousPage: 'Halaman sebelumnya',
    nextPage: 'Halaman berikutnya',
    sort: 'Urutkan karyawan',
    nameSort: 'Nama A–Z',
    lateSort: 'Shift terlambat terbanyak',
    daysSort: 'Hari hadir terbanyak',
    attentionSort: 'Perlu diperiksa dahulu',
    lateDuration: 'Total keterlambatan',
    earlyShifts: 'Pulang awal',
    recordedShifts: 'Shift tercatat',
    review: 'Perlu diperiksa',
    viewDay: 'Lihat laporan harian',
    incomplete: 'Catatan tidak lengkap',
    futureNote: 'Tanggal ini belum tiba. Tidak adanya catatan bukan berarti tidak hadir.',
    noTiming: 'Waktu shift tidak tersedia',
    loading: 'Memuat laporan kehadiran',
    records: 'catatan shift',
  },
}
const c = computed(() => copy[locale.value === 'id' ? 'id' : 'en'])
const language = computed(() => locale.value === 'id' ? 'id-ID' : 'en-GB')
const timezone = 'Asia/Jakarta'
const now = ref(new Date())
const today = computed(() => getCalendarDate(now.value, timezone).toString())
// Preserve report context when the dashboard remounts its mobile slot.
const selectedDate = useState('attendance-3:selectedDate', () => today.value)
const month = useState('attendance-3:month', () => today.value.slice(0, 7))
const view = useState<'daily' | 'recap'>('attendance-3:view', () => 'daily')
const search = useState('attendance-3:search', () => '')
const shiftType = useState('attendance-3:shiftType', () => 'all')
const statusFilter = useState('attendance-3:statusFilter', () => 'all')
const sort = useState('attendance-3:sort', () => 'name')
const expanded = ref<string | null>(null)
const page = ref(1)
const pageSize = 20

const { data, status, error, refresh } = await useFetch<Report>('/api/admin/attendance', {
  query: { month },
  credentials: 'include',
})
const { data: shifts } = await useFetch<Shift[]>('/api/shifts')
const pending = computed(() => status.value === 'pending')
// The server already reconciles overnight records and supplies historical timing.
const employees = computed(() => data.value?.month === month.value ? data.value.rows : [])

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 60000)
})
onBeforeUnmount(() => clearInterval(timer))

watch(selectedDate, (date) => {
  if (date) month.value = date.slice(0, 7)
})
watch(month, (value) => {
  if (selectedDate.value.slice(0, 7) !== value)
    selectedDate.value = value === today.value.slice(0, 7) ? today.value : `${value}-01`
})
watch([view, search, shiftType, statusFilter, sort, selectedDate, month], () => {
  page.value = 1
  expanded.value = null
})

function name(employee: Employee) {
  return employee.name || employee.username || employee.email
}
function initials(employee: Employee) {
  return name(employee).split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase()
}
function entries(employee: Employee, date: string): Entry[] {
  return Object.entries(employee.byDate[date]?.grouped || {})
    .filter(([type]) => shiftType.value === 'all' || type === shiftType.value)
    .map(([type, entry]) => ({ ...entry, shiftType: type }))
}
function windowFor(entry: Entry, date: string) {
  const current = shifts.value?.find(shift => shift.code === entry.shiftCode)
  const timing = entry.shiftStart && entry.shiftEnd ? { start: entry.shiftStart, end: entry.shiftEnd } : current
  const start = timing?.start
  const end = timing?.end
  if (!start || !end) return null
  try {
    return createShiftWindow(parseBusinessDate(date), { start, end }, timezone)
  }
  catch {
    return null
  }
}
function lateMs(entry: Entry, date: string): number | null {
  if (!entry.clockIn) return null
  const start = entry.shiftStartIso ? Date.parse(entry.shiftStartIso) : windowFor(entry, date)?.start.toDate().getTime()
  const clockIn = Date.parse(entry.clockIn)
  return start != null && Number.isFinite(start) && Number.isFinite(clockIn) ? Math.max(0, clockIn - start) : null
}
function earlyMs(entry: Entry, date: string) {
  if (!entry.clockOut) return 0
  const end = entry.shiftEndIso ? Date.parse(entry.shiftEndIso) : windowFor(entry, date)?.end.toDate().getTime()
  return end != null && Number.isFinite(end) ? Math.max(0, end - Date.parse(entry.clockOut)) : 0
}
function isMissing(entry: Entry, date: string) {
  if (!entry.clockIn || entry.clockOut) return false
  const end = entry.shiftEndIso ? Date.parse(entry.shiftEndIso) : windowFor(entry, date)?.end.toDate().getTime()
  return end != null && Number.isFinite(end) ? now.value.getTime() > end : date < today.value
}
function durationMs(entry: Entry) {
  return entry.clockIn && entry.clockOut ? Math.max(0, Date.parse(entry.clockOut) - Date.parse(entry.clockIn)) : 0
}
function arrival(entry: Entry, date: string): AttendanceStatus {
  if (!entry.clockIn) return date > today.value ? 'noRecord' : 'noCheckIn'
  const late = lateMs(entry, date)
  return late == null ? 'unknown' : late > 0 ? 'late' : 'onTime'
}
function dayStatus(employee: Employee): AttendanceStatus {
  const arrived = entries(employee, selectedDate.value).filter(entry => entry.clockIn)
  if (!arrived.length) return selectedDate.value > today.value ? 'noRecord' : 'noCheckIn'
  if (arrived.some(entry => arrival(entry, selectedDate.value) === 'late')) return 'late'
  return arrived.some(entry => arrival(entry, selectedDate.value) === 'unknown') ? 'unknown' : 'onTime'
}
function monthEntries(employee: Employee) {
  return Object.keys(employee.byDate).sort().flatMap(date => entries(employee, date).map(entry => ({ date, entry })))
}
function totals(employee: Employee) {
  const records = monthEntries(employee)
  const arrived = records.filter(({ entry }) => entry.clockIn)
  return {
    days: new Set(arrived.map(record => record.date)).size,
    harian: arrived.filter(({ entry }) => entry.shiftType === 'harian').length,
    bantuan: arrived.filter(({ entry }) => entry.shiftType === 'bantuan').length,
    late: arrived.filter(({ entry, date }) => (lateMs(entry, date) ?? 0) > 0).length,
    lateMs: arrived.reduce((sum, { entry, date }) => sum + (lateMs(entry, date) ?? 0), 0),
    early: records.filter(({ entry, date }) => earlyMs(entry, date) > 0).length,
    missing: records.filter(({ entry, date }) => isMissing(entry, date)).length,
    incomplete: records.filter(({ entry }) => !entry.clockIn && entry.clockOut).length,
    hours: records.reduce((sum, { entry }) => sum + durationMs(entry), 0),
  }
}
const stats = computed(() => new Map(employees.value.map(employee => [employee.userId, totals(employee)])))
function employeeStats(employee: Employee) {
  return stats.value.get(employee.userId)!
}
const dailyScope = computed(() => employees.value.filter(employee => shiftType.value === 'all' || entries(employee, selectedDate.value).length))
const recapScope = computed(() => employees.value.filter(employee => shiftType.value === 'all' || monthEntries(employee).length))
const dailySummary = computed(() => ({
  employees: dailyScope.value.length,
  checkedIn: dailyScope.value.filter(employee => entries(employee, selectedDate.value).some(entry => entry.clockIn)).length,
  noCheckIn: dailyScope.value.filter(employee => !entries(employee, selectedDate.value).some(entry => entry.clockIn)).length,
  late: dailyScope.value.filter(employee => dayStatus(employee) === 'late').length,
  missing: dailyScope.value.filter(employee => entries(employee, selectedDate.value).some(entry => isMissing(entry, selectedDate.value))).length,
}))
const recapSummary = computed(() => recapScope.value.reduce((sum, employee) => {
  const value = employeeStats(employee)
  return { days: sum.days + value.days, harian: sum.harian + value.harian, bantuan: sum.bantuan + value.bantuan, late: sum.late + value.late }
}, { days: 0, harian: 0, bantuan: 0, late: 0 }))
const summaryItems = computed(() => view.value === 'daily'
  ? [
      { label: c.value.employees, value: dailySummary.value.employees, filter: 'all' },
      { label: c.value.checkedIn, value: dailySummary.value.checkedIn, filter: 'checkedIn' },
      { label: selectedDate.value > today.value ? c.value.noRecord : c.value.noCheckIn, value: dailySummary.value.noCheckIn, filter: 'noCheckIn' },
      { label: c.value.late, value: dailySummary.value.late, filter: 'late' },
      { label: c.value.missing, value: dailySummary.value.missing, filter: 'missing' },
    ]
  : [
      { label: c.value.employees, value: recapScope.value.length, filter: 'all' },
      { label: c.value.attendedDays, value: recapSummary.value.days, filter: 'all' },
      { label: c.value.harian, value: recapSummary.value.harian, filter: 'all' },
      { label: c.value.bantuan, value: recapSummary.value.bantuan, filter: 'all' },
      { label: c.value.lateShifts, value: recapSummary.value.late, filter: 'late' },
    ])
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return (view.value === 'daily' ? dailyScope.value : recapScope.value).filter((employee) => {
    if (query && ![employee.name, employee.username, employee.email].some(value => value?.toLocaleLowerCase().includes(query))) return false
    const records = view.value === 'daily' ? entries(employee, selectedDate.value).map(entry => ({ entry, date: selectedDate.value })) : monthEntries(employee)
    switch (statusFilter.value) {
      case 'checkedIn': return records.some(({ entry }) => entry.clockIn)
      case 'noCheckIn': return !records.some(({ entry }) => entry.clockIn)
      case 'late': return records.some(({ entry, date }) => arrival(entry, date) === 'late')
      case 'onTime': return view.value === 'daily' ? dayStatus(employee) === 'onTime' : records.some(({ entry, date }) => arrival(entry, date) === 'onTime')
      case 'unknown': return records.some(({ entry, date }) => arrival(entry, date) === 'unknown')
      case 'early': return records.some(({ entry, date }) => earlyMs(entry, date) > 0)
      case 'incomplete': return records.some(({ entry }) => !entry.clockIn && entry.clockOut)
      case 'missing': return records.some(({ entry, date }) => isMissing(entry, date))
      default: return true
    }
  }).sort((a, b) => {
    const lateCount = (employee: Employee) => view.value === 'recap' ? employeeStats(employee).late : entries(employee, selectedDate.value).filter(entry => (lateMs(entry, selectedDate.value) ?? 0) > 0).length
    const attention = (employee: Employee) => view.value === 'recap'
      ? employeeStats(employee).late + employeeStats(employee).early + employeeStats(employee).missing + employeeStats(employee).incomplete
      : entries(employee, selectedDate.value).filter(entry => (!entry.clockIn && !!entry.clockOut) || isMissing(entry, selectedDate.value) || earlyMs(entry, selectedDate.value) > 0 || (lateMs(entry, selectedDate.value) ?? 0) > 0).length
    const diff = sort.value === 'late' ? lateCount(b) - lateCount(a) : sort.value === 'days' ? employeeStats(b).days - employeeStats(a).days : sort.value === 'attention' ? attention(b) - attention(a) : 0
    return diff || name(a).localeCompare(name(b), language.value)
  })
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count)
})
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const dateLabel = computed(() => formatDate(selectedDate.value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
const monthLabel = computed(() => formatDate(`${month.value}-01`, { month: 'long', year: 'numeric' }))

function formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return parseBusinessDate(date).toDate(timezone).toLocaleDateString(language.value, { ...options, timeZone: timezone })
}
function time(iso?: string) {
  return iso ? new Date(iso).toLocaleTimeString(language.value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }) : '—'
}
function minutes(ms: number) {
  return `${Math.ceil(ms / 60000)} ${locale.value === 'id' ? 'mnt' : 'min'}`
}
function hours(ms: number) {
  const mins = Math.floor(ms / 60000)
  return `${Math.floor(mins / 60)}${locale.value === 'id' ? 'j' : 'h'} ${mins % 60}m`
}
function shiftLabel(entry: Entry) {
  return shifts.value?.find(shift => shift.code === entry.shiftCode)?.label || entry.shiftCode || '—'
}
function schedule(entry: Entry, date: string) {
  const window = windowFor(entry, date)
  return window ? `${time(window.start.toDate().toISOString())}–${time(window.end.toDate().toISOString())}${window.overnight ? ' (+1)' : ''}` : c.value.noTiming
}
function departure(entry: Entry, date: string) {
  if (!entry.clockIn) return c.value.incomplete
  if (entry.clockOut) return earlyMs(entry, date) > 0 ? `${c.value.early} · ${minutes(earlyMs(entry, date))}` : c.value.complete
  return entry.clockIn ? (isMissing(entry, date) ? c.value.missing : c.value.active) : c.value.incomplete
}
function moveDate(amount: number) {
  selectedDate.value = parseBusinessDate(selectedDate.value).add({ days: amount }).toString()
}
function clearFilters() {
  search.value = ''
  shiftType.value = 'all'
  statusFilter.value = 'all'
}
function toggle(employee: Employee) {
  expanded.value = expanded.value === employee.userId ? null : employee.userId
}
function onEmployeeRowClick(employee: Employee, event: MouseEvent) {
  // Controls handle their own action; bubbling must not toggle the row twice.
  if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, [role="button"], [data-row-click-ignore]')) return
  toggle(employee)
}
function viewDate(date: string) {
  selectedDate.value = date
  view.value = 'daily'
}
function detailRecords(employee: Employee) {
  return view.value === 'daily' ? entries(employee, selectedDate.value).map(entry => ({ date: selectedDate.value, entry })) : monthEntries(employee)
}
const datePickerValue = computed({
  get: () => parseBusinessDate(selectedDate.value),
  set: (value) => { if (value) selectedDate.value = value.toString() },
})
const viewItems = computed(() => [
  { label: c.value.daily, value: 'daily', icon: 'i-heroicons-calendar-days' },
  { label: c.value.recap, value: 'recap', icon: 'i-heroicons-table-cells' },
])
const monthItems = computed(() => {
  const current = parseBusinessDate(`${today.value.slice(0, 7)}-01`)
  const values = new Set([month.value, ...Array.from({ length: 24 }, (_, index) => current.subtract({ months: index }).toString().slice(0, 7))])
  return [...values].sort().reverse().map(value => ({ value, label: formatDate(`${value}-01`, { month: 'long', year: 'numeric' }) }))
})
const shiftItems = computed(() => [
  { label: c.value.allShifts, value: 'all' },
  { label: 'Harian', value: 'harian' },
  { label: 'Bantuan', value: 'bantuan' },
])
const statusItems = computed(() => [
  { label: c.value.allStatuses, value: 'all' },
  { label: c.value.checkedIn, value: 'checkedIn' },
  { label: view.value === 'daily' && selectedDate.value > today.value ? c.value.noRecord : c.value.noCheckIn, value: 'noCheckIn' },
  { label: c.value.onTime, value: 'onTime' },
  { label: c.value.late, value: 'late' },
  { label: c.value.incomplete, value: 'incomplete' },
  { label: c.value.unknown, value: 'unknown' },
  { label: c.value.early, value: 'early' },
  { label: c.value.missing, value: 'missing' },
])
const sortItems = computed(() => [
  { label: c.value.nameSort, value: 'name' },
  { label: c.value.attentionSort, value: 'attention' },
  { label: c.value.lateSort, value: 'late' },
  ...(view.value === 'recap' ? [{ label: c.value.daysSort, value: 'days' }] : []),
])
const tableRows = computed(() => visible.value.map(employee => ({
  ...employee,
  ...employeeStats(employee),
  reportEntries: entries(employee, selectedDate.value),
  arrivalStatus: dayStatus(employee),
  checkIn: entries(employee, selectedDate.value).map(entry => time(entry.clockIn)).join(', '),
  checkOut: entries(employee, selectedDate.value).map(entry => time(entry.clockOut)).join(', '),
  departureStatus: entries(employee, selectedDate.value).map(entry => departure(entry, selectedDate.value)).join(', '),
})))
const tableExpanded = computed<Record<string, boolean>>({
  get: () => expanded.value ? { [expanded.value]: true } : {},
  set: (value) => {
    const keys = Object.keys(value).filter(key => value[key])
    expanded.value = keys.find(key => key !== expanded.value) || keys[0] || null
  },
})
const tableUi = {
  wrapper: 'relative rounded-none ring-0 overflow-x-auto',
  th: 'text-xs px-4 py-3',
  td: 'text-[13px] px-4 py-3 whitespace-nowrap',
  expandedCell: 'p-0',
}
function arrivalColor(entry: Entry, date: string): 'success' | 'warning' | 'neutral' {
  const value = arrival(entry, date)
  return value === 'onTime' ? 'success' : value === 'late' ? 'warning' : 'neutral'
}
function departureColor(entry: Entry, date: string): 'danger' | 'warning' | 'success' | 'info' {
  if (!entry.clockIn || isMissing(entry, date)) return 'danger'
  if (entry.clockOut) return earlyMs(entry, date) > 0 ? 'warning' : 'success'
  return 'info'
}
function exportCsv() {
  const header = view.value === 'daily'
    ? [c.value.employee, 'Email', c.value.date, c.value.shift, c.value.schedule, c.value.attendance, c.value.clockIn, c.value.clockOut, c.value.duration, c.value.departure, c.value.reason]
    : [c.value.employee, 'Email', c.value.month, c.value.attendedDays, c.value.harian, c.value.bantuan, c.value.lateShifts, c.value.lateDuration, c.value.earlyShifts, c.value.missing, c.value.duration]
  const rows = filtered.value.flatMap((employee) => {
    if (view.value === 'recap') {
      const value = employeeStats(employee)
      return [[name(employee), employee.email, month.value, value.days, value.harian, value.bantuan, value.late, minutes(value.lateMs), value.early, value.missing, hours(value.hours)]]
    }
    const records = detailRecords(employee)
    if (!records.length) return [[name(employee), employee.email, selectedDate.value, '', '', c.value[dayStatus(employee)], '', '', '', '', '']]
    return records.map(({ entry, date }) => [name(employee), employee.email, date, `${entry.shiftType} · ${shiftLabel(entry)}`, schedule(entry, date), c.value[arrival(entry, date)], time(entry.clockIn), time(entry.clockOut), entry.clockIn && entry.clockOut ? hours(durationMs(entry)) : '', departure(entry, date), entry.earlyReason || ''])
  })
  // Escape spreadsheet formulas as well as CSV delimiters in user-supplied text.
  const csv = [header, ...rows].map(row => row.map((value) => {
    let text = String(value ?? '')
    if (/^\s*[=+@-]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `attendance-${view.value}-${view.value === 'daily' ? selectedDate.value : month.value}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <PageWrapper>
    <div class="attendance-report px-8 py-7 text-sm text-(--selaras-resolved-text-default) max-[1100px]:p-6 max-[640px]:px-3.5 max-[640px]:py-5">
      <header class="report-heading flex justify-between gap-4 items-start mb-7 [&_h2]:text-2xl [&_h2]:font-[650] [&_h2]:tracking-[-0.025em] [&_h2]:leading-[1.3] [&_p]:text-(--selaras-resolved-text-muted) [&_p]:mt-1.5 max-[640px]:flex-col max-[640px]:mb-6 max-[640px]:[&_h2]:text-[22px]">
        <div><h2>{{ c.title }}</h2><p>{{ c.intro }}</p></div>
        <div class="heading-actions flex items-center gap-2 max-[640px]:w-full">
          <SButton
            color="neutral"
            variant="outline"
            icon="i-heroicons-arrow-path"
            :loading="pending"
            @click="refresh()"
          >
            {{ c.refresh }}
          </SButton>
          <SButton icon="i-heroicons-arrow-down-tray" :disabled="pending || !!error || !filtered.length" @click="exportCsv">
            {{ c.export }}
          </SButton>
        </div>
      </header>
      <div class="report-navigation flex items-center justify-between gap-4 mb-[18px] flex-wrap">
        <STabs
          v-model="view"
          :items="viewItems"
          variant="pill"
          class="view-tabs max-[640px]:w-full"
          :ui="{ root: 'w-auto', content: 'hidden' }"
        />
        <div class="date-controls flex items-center gap-2 max-[640px]:w-full">
          <template v-if="view === 'daily'">
            <SButton
              color="neutral"
              variant="ghost"
              icon="i-heroicons-chevron-left"
              :aria-label="c.previous"
              @click="moveDate(-1)"
            />
            <div class="report-date w-[180px] min-w-0 max-[640px]:flex-1">
              <SDatePicker
                v-model="datePickerValue"
                :locale="language"
                :aria-label="c.date"
                trigger-mode="button"
                class="w-full"
              />
            </div>
            <SButton
              color="neutral"
              variant="ghost"
              icon="i-heroicons-chevron-right"
              :aria-label="c.next"
              @click="moveDate(1)"
            />
            <SButton color="primary" variant="ghost" @click="selectedDate = today">
              {{ c.today }}
            </SButton>
          </template>
          <div v-else class="report-month w-[220px]">
            <SSelect
              v-model="month"
              :items="monthItems"
              label-key="label"
              value-key="value"
              :aria-label="c.month"
              class="w-full"
            />
          </div>
        </div>
      </div>
      <SCard class="report-surface overflow-hidden" :ui="{ header: 'p-0', body: 'p-0' }" :aria-busy="pending">
        <template #header>
          <div class="period-heading flex items-center justify-between gap-4 px-6 pt-5 pb-2 [&>h3]:text-base [&>h3]:font-semibold max-[640px]:px-4 max-[640px]:pt-[18px] max-[640px]:items-start max-[640px]:[&>h3]:text-sm">
            <h3>{{ view === 'daily' ? dateLabel : monthLabel }}</h3><span class="text-(--selaras-resolved-text-muted) text-xs">WIB · UTC+7</span>
          </div>
          <div
            v-if="pending"
            class="loading-summary grid grid-cols-5 px-6 py-[22px] gap-2 max-[640px]:grid-cols-3 max-[640px]:p-2 max-[640px]:gap-1"
            :aria-label="c.loading"
            role="status"
          >
            <SSkeleton v-for="item in 5" :key="item" class="h-16" />
          </div>
          <div v-else-if="!error" class="summary-strip grid grid-cols-5 px-3 pt-3 pb-5 gap-2 max-[640px]:grid-cols-3 max-[640px]:p-2 max-[640px]:gap-1">
            <template v-for="(item, index) in summaryItems" :key="item.label">
              <SButton
                v-if="view === 'daily' || index === 4"
                :color="statusFilter === item.filter ? 'primary' : 'neutral'"
                :variant="statusFilter === item.filter ? 'subtle' : 'ghost'"
                class="summary-item h-auto flex flex-col items-start px-3 py-2.5 text-left gap-2 [&>span]:text-xs [&>strong]:text-[26px] [&>strong]:leading-none [&>strong]:font-semibold [&>strong]:tabular-nums max-[640px]:px-2 max-[640px]:py-3 max-[640px]:[&>strong]:text-2xl"
                :aria-pressed="statusFilter === item.filter"
                @click="statusFilter = item.filter"
              >
                <span :class="statusFilter === item.filter ? 'text-inherit' : 'text-(--selaras-resolved-text-muted)'">{{ item.label }}</span><strong :class="{ 'text-amber-800 dark:text-amber-300': item.filter === 'late' && item.value > 0, 'text-red-700 dark:text-red-300': item.filter === 'missing' && item.value > 0 }">{{ item.value }}</strong>
              </SButton>
              <div v-else class="summary-item h-auto flex flex-col items-start px-3 py-2.5 text-left gap-2 [&>span]:text-xs [&>span]:text-(--selaras-resolved-text-muted) [&>strong]:text-[26px] [&>strong]:leading-none [&>strong]:font-semibold [&>strong]:tabular-nums max-[640px]:px-2 max-[640px]:py-3 max-[640px]:[&>strong]:text-2xl">
                <span>{{ item.label }}</span><strong>{{ item.value }}</strong>
              </div>
            </template>
          </div>
        </template>
        <div class="report-toolbar flex items-center justify-between px-6 py-4 gap-2.5 flex-wrap max-[640px]:px-4 max-[640px]:py-3.5">
          <div class="search-field flex-[1_1_240px] max-[1100px]:basis-full">
            <SInput
              v-model="search"
              type="search"
              icon="i-heroicons-magnifying-glass"
              :placeholder="c.search"
              :aria-label="c.searchLabel"
              class="w-full"
              clearable
            />
          </div>
          <div class="report-filter w-40 max-[1100px]:flex-[1_1_140px] max-[1100px]:w-auto max-[640px]:basis-[calc(50%-5px)] max-[640px]:w-[calc(50%-5px)]">
            <SSelect
              v-model="shiftType"
              :items="shiftItems"
              label-key="label"
              value-key="value"
              :aria-label="c.shift"
              class="w-full"
            />
          </div>
          <div class="report-filter w-40 max-[1100px]:flex-[1_1_140px] max-[1100px]:w-auto max-[640px]:basis-[calc(50%-5px)] max-[640px]:w-[calc(50%-5px)]">
            <SSelect
              v-model="statusFilter"
              :items="statusItems"
              label-key="label"
              value-key="value"
              :aria-label="c.attendance"
              class="w-full"
            />
          </div>
          <div class="report-filter w-40 max-[1100px]:flex-[1_1_140px] max-[1100px]:w-auto max-[640px]:basis-[calc(50%-5px)] max-[640px]:w-[calc(50%-5px)] sort-filter min-[1101px]:w-[185px] max-[640px]:basis-full">
            <SSelect
              v-model="sort"
              :items="sortItems"
              label-key="label"
              value-key="value"
              :aria-label="c.sort"
              class="w-full"
            />
          </div>
        </div>
        <div v-if="error" class="empty-state py-14 px-6 text-center [&_h4]:font-semibold [&_h4]:mt-3.5 [&_h4]:mb-1.5 [&_p]:text-(--selaras-resolved-text-muted) [&_p]:mb-5" role="alert">
          <SIcon name="i-heroicons-exclamation-triangle" class="size-7" /><h4>{{ c.error }}</h4><p>{{ c.errorHelp }}</p>
          <SButton color="neutral" variant="outline" @click="refresh()">
            {{ c.retry }}
          </SButton>
        </div>
        <div
          v-else-if="pending"
          class="loading-table px-6 pt-2 pb-6"
          :aria-label="c.loading"
          role="status"
        >
          <SSkeleton v-for="row in 6" :key="row" class="my-3 h-11" />
        </div>
        <div v-else-if="!filtered.length" class="empty-state py-14 px-6 text-center [&_h4]:font-semibold [&_h4]:mt-3.5 [&_h4]:mb-1.5 [&_p]:text-(--selaras-resolved-text-muted) [&_p]:mb-5">
          <SIcon name="i-heroicons-user-group" class="size-7" /><h4>{{ employees.length ? c.noMatches : c.noData }}</h4><p>{{ employees.length ? c.noMatchesHelp : c.noDataHelp }}</p>
          <SButton
            v-if="employees.length"
            color="neutral"
            variant="outline"
            @click="clearFilters"
          >
            {{ c.clear }}
          </SButton>
        </div>
        <template v-else>
          <div
            class="table-scroll relative overflow-auto"
            role="region"
            :aria-label="view === 'daily' ? c.daily : c.recap"
            tabindex="0"
          >
            <STable
              :key="view"
              v-model:expanded="tableExpanded"
              :data="tableRows"
              :get-row-id="(row: Employee) => row.userId"
              :ui="tableUi"
              expandable
              row-hover
              class="employee-table"
              @row-click="onEmployeeRowClick"
            >
              <SColumn field="name" :header="c.employee">
                <template #default="{ row }">
                  <SButton
                    color="neutral"
                    variant="ghost"
                    class="employee-button justify-start text-left p-1 -m-1"
                    :aria-expanded="expanded === row.userId"
                    @click="toggle(row)"
                  >
                    <SAvatar :text="initials(row)" :alt="name(row)" size="sm" />
                    <span class="employee-name flex flex-col gap-[3px] [&>strong]:font-[550] [&>strong]:max-w-[230px] [&>strong]:truncate [&>span]:text-xs [&>span]:text-(--selaras-resolved-text-muted) [&>span]:max-w-[230px] [&>span]:truncate"><strong>{{ name(row) }}</strong><span>{{ row.username ? `@${row.username}` : row.email }}</span></span>
                  </SButton>
                </template>
              </SColumn>
              <template v-if="view === 'daily'">
                <SColumn field="reportEntries" :header="c.shift">
                  <template #default="{ row }">
                    <div v-for="entry in row.reportEntries" :key="entry.shiftType" class="shift-line flex items-center gap-1.5 min-h-[30px]">
                      <SBadge :color="entry.shiftType === 'bantuan' ? 'info' : 'primary'" variant="soft" class="capitalize">
                        {{ entry.shiftType }}
                      </SBadge><span class="text-(--selaras-resolved-text-muted)">{{ entry.shiftCode || '—' }}</span>
                    </div>
                    <span v-if="!row.reportEntries.length" class="text-(--selaras-resolved-text-muted)">—</span>
                  </template>
                </SColumn>
                <SColumn field="arrivalStatus" :header="c.attendance">
                  <template #default="{ row }">
                    <template v-if="row.reportEntries.length">
                      <div v-for="entry in row.reportEntries" :key="entry.shiftType" class="shift-line flex items-center gap-1.5 min-h-[30px]">
                        <SBadge :color="arrivalColor(entry, selectedDate)" variant="soft">
                          {{ c[arrival(entry, selectedDate)] }}<template v-if="arrival(entry, selectedDate) === 'late'">
                            · {{ minutes(lateMs(entry, selectedDate)!) }}
                          </template>
                        </SBadge>
                      </div>
                    </template>
                    <SBadge v-else color="neutral" variant="soft">
                      {{ c[dayStatus(row)] }}
                    </SBadge>
                  </template>
                </SColumn>
                <SColumn field="checkIn" :header="c.clockIn">
                  <template #default="{ row }">
                    <div v-for="entry in row.reportEntries" :key="entry.shiftType" class="shift-line flex items-center gap-1.5 min-h-[30px] tabular-nums">
                      {{ time(entry.clockIn) }}
                    </div><span v-if="!row.reportEntries.length" class="text-(--selaras-resolved-text-muted)">—</span>
                  </template>
                </SColumn>
                <SColumn field="checkOut" :header="c.clockOut">
                  <template #default="{ row }">
                    <div v-for="entry in row.reportEntries" :key="entry.shiftType" class="shift-line flex items-center gap-1.5 min-h-[30px] tabular-nums">
                      {{ time(entry.clockOut) }}
                    </div><span v-if="!row.reportEntries.length" class="text-(--selaras-resolved-text-muted)">—</span>
                  </template>
                </SColumn>
                <SColumn field="hours" :header="c.duration">
                  <template #default="{ row }">
                    <div v-for="entry in row.reportEntries" :key="entry.shiftType" class="shift-line flex items-center gap-1.5 min-h-[30px] tabular-nums">
                      {{ entry.clockIn && entry.clockOut ? hours(durationMs(entry)) : '—' }}
                    </div><span v-if="!row.reportEntries.length" class="text-(--selaras-resolved-text-muted)">—</span>
                  </template>
                </SColumn>
                <SColumn field="departureStatus" :header="c.departure">
                  <template #default="{ row }">
                    <div v-for="entry in row.reportEntries" :key="entry.shiftType" class="shift-line flex items-center gap-1.5 min-h-[30px]">
                      <span :class="{ 'text-red-700 dark:text-red-300': isMissing(entry, selectedDate), 'text-amber-800 dark:text-amber-300': earlyMs(entry, selectedDate) > 0, 'text-(--selaras-resolved-text-muted)': !isMissing(entry, selectedDate) && !earlyMs(entry, selectedDate) }">{{ departure(entry, selectedDate) }}</span>
                    </div><span v-if="!row.reportEntries.length" class="text-(--selaras-resolved-text-muted)">—</span>
                  </template>
                </SColumn>
              </template>
              <template v-else>
                <SColumn field="days" :header="c.attendedDays">
                  <template #default="{ value }">
                    <strong class="tabular-nums">{{ value }}</strong>
                  </template>
                </SColumn>
                <SColumn field="harian" header="Harian" />
                <SColumn field="bantuan" header="Bantuan" />
                <SColumn field="late" :header="c.lateShifts">
                  <template #default="{ value }">
                    <span class="tabular-nums" :class="{ 'text-amber-800 dark:text-amber-300': value > 0 }">{{ value }}</span>
                  </template>
                </SColumn>
                <SColumn field="early" :header="c.earlyShifts">
                  <template #default="{ value }">
                    <span class="tabular-nums" :class="{ 'text-amber-800 dark:text-amber-300': value > 0 }">{{ value }}</span>
                  </template>
                </SColumn>
                <SColumn field="missing" :header="c.missing">
                  <template #default="{ value }">
                    <span class="tabular-nums" :class="{ 'text-red-700 dark:text-red-300': value > 0 }">{{ value }}</span>
                  </template>
                </SColumn>
                <SColumn field="hours" :header="c.duration">
                  <template #default="{ value }">
                    <span class="tabular-nums">{{ hours(value) }}</span>
                  </template>
                </SColumn>
              </template>
              <template #expanded="{ row }">
                <div class="detail-content px-6 pt-5 pb-6">
                  <div class="detail-heading flex items-center justify-between gap-4 mb-3.5 [&_h4]:font-semibold [&_h4_span]:font-normal [&_h4_span]:text-(--selaras-resolved-text-muted)">
                    <h4>{{ name(row) }} <span>· {{ view === 'daily' ? formatDate(selectedDate) : monthLabel }}</span></h4>
                    <span class="text-(--selaras-resolved-text-muted)">{{ detailRecords(row).length }} {{ c.records }}</span>
                  </div>
                  <p v-if="!detailRecords(row).length" class="text-(--selaras-resolved-text-muted)">
                    {{ view === 'daily' ? c.noEntries : c.noMonthEntries }}
                  </p>
                  <div v-for="{ entry, date } in detailRecords(row)" :key="`${date}-${entry.shiftType}`" class="detail-record border-t border-(--selaras-resolved-border-default) py-4 last:pb-0">
                    <div class="detail-shift flex items-center gap-2.5 mb-3.5 flex-wrap [&>strong]:font-[550]">
                      <SButton
                        v-if="view === 'recap'"
                        color="primary"
                        variant="soft"
                        size="sm"
                        :aria-label="`${c.viewDay}: ${formatDate(date)}`"
                        @click="viewDate(date)"
                      >
                        {{ formatDate(date) }}
                      </SButton>
                      <SBadge :color="entry.shiftType === 'bantuan' ? 'info' : 'primary'" variant="soft" class="capitalize">
                        {{ entry.shiftType }}
                      </SBadge>
                      <strong>{{ shiftLabel(entry) }}</strong>
                      <span class="text-(--selaras-resolved-text-muted)">{{ schedule(entry, date) }}</span>
                    </div>
                    <dl class="detail-values grid grid-cols-5 gap-4 [&_dt]:text-[11px] [&_dt]:text-(--selaras-resolved-text-muted) [&_dt]:mb-[5px] [&_dd]:text-[13px] [&_dd]:tabular-nums max-[640px]:grid-cols-2">
                      <div><dt>{{ c.clockIn }}</dt><dd>{{ time(entry.clockIn) }}</dd></div>
                      <div><dt>{{ c.clockOut }}</dt><dd>{{ time(entry.clockOut) }}<span v-if="entry.clockOut && getCalendarDate(new Date(entry.clockOut), timezone).toString() !== date" class="text-(--selaras-resolved-text-muted)"> · {{ formatDate(getCalendarDate(new Date(entry.clockOut), timezone).toString()) }}</span></dd></div>
                      <div>
                        <dt>{{ c.attendance }}</dt><dd>
                          <SBadge :color="arrivalColor(entry, date)" variant="soft">
                            {{ c[arrival(entry, date)] }}<template v-if="arrival(entry, date) === 'late'">
                              · {{ minutes(lateMs(entry, date)!) }}
                            </template>
                          </SBadge>
                        </dd>
                      </div>
                      <div>
                        <dt>{{ c.departure }}</dt><dd>
                          <SBadge :color="departureColor(entry, date)" variant="soft">
                            {{ departure(entry, date) }}
                          </SBadge>
                        </dd>
                      </div>
                      <div><dt>{{ c.duration }}</dt><dd>{{ entry.clockIn && entry.clockOut ? hours(durationMs(entry)) : '—' }}</dd></div>
                    </dl>
                    <p v-if="entry.earlyReason" class="reason mt-3 [overflow-wrap:anywhere] [&>strong]:font-[550]">
                      <strong>{{ c.reason }}:</strong> {{ entry.earlyReason }}
                    </p>
                  </div>
                </div>
              </template>
            </STable>
          </div>
          <footer class="table-footer flex items-center justify-between gap-4 px-6 py-3.5 text-xs text-(--selaras-resolved-text-muted) max-[640px]:px-4 max-[640px]:py-3 max-[640px]:flex-col max-[640px]:gap-2">
            <span aria-live="polite">{{ c.showing }} {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, filtered.length) }} {{ c.of }} {{ filtered.length }} {{ c.people }}</span>
            <SPagination
              v-model:page="page"
              :total="filtered.length"
              :items-per-page="pageSize"
              size="sm"
              @update:page="expanded = null"
            />
          </footer>
        </template>
      </SCard>
      <div class="report-notes flex gap-[9px] py-4 px-1 text-xs leading-[1.7] text-(--selaras-resolved-text-muted) [&_p+p]:mt-1">
        <SIcon name="i-heroicons-information-circle" class="size-4 shrink-0 mt-1" /><div><p>{{ view === 'recap' ? c.recapNote : selectedDate > today ? c.futureNote : c.dailyNote }}</p><p>{{ c.hoursNote }}</p></div>
      </div>
    </div>
  </PageWrapper>
</template>
