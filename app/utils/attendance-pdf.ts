import type { AttendanceDayCellLike, AttendanceShiftEntryLike } from './attendance-status'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { entryEarlyMinutes, entryLateMinutes, resolveCellStatus, resolveEntryStatus } from './attendance-status'

export interface AttendancePdfEmployee {
  name?: string | null
  username?: string | null
  byDate: Record<string, AttendanceDayCellLike>
}

export interface AttendancePdfReport {
  month: string
  days: string[]
  rows: AttendancePdfEmployee[]
}

// All strings come from the caller (the page's en/id copy table) so the
// document follows the UI language.
export interface AttendancePdfCopy {
  title: string
  generatedAt: string
  detailTitle: string
  colType: string
  page: string
  colDate: string
  colShift: string
  colIn: string
  colOut: string
  colStatus: string
  employee: string
  totalDays: string
  totalLate: string
  totalMissing: string
  colLateMin: string
  colEarlyMin: string
  onTime: string
  late: string
  earlyLeave: string
  missing: string
  none: string
}

export interface AttendancePdfOptions {
  copy: AttendancePdfCopy
  /** e.g. "September 2026", already localized. */
  monthLabel: string
  /** Rendered "generated at" timestamp string, already localized + zoned. */
  generatedAt: string
  /** Business timezone for clock time rendering. */
  timezone: string
  /** BCP47 locale for date rendering. */
  language: string
  /** Local today (YYYY-MM-DD) in the business timezone - future-day guard. */
  todayYmd: string
}

const MARGIN = 36

const statusFill: Record<string, [number, number, number]> = {
  onTime: [209, 250, 229],
  late: [254, 243, 199],
  early: [237, 233, 254],
  missing: [254, 226, 226],
}
const statusText: Record<string, [number, number, number]> = {
  onTime: [6, 95, 70],
  late: [146, 64, 14],
  early: [76, 29, 149],
  missing: [127, 29, 29],
}

function fmtTime(iso?: string | null, timezone?: string, language?: string | null) {
  if (!iso || !timezone || !language)
    return '-'
  return new Date(iso).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone })
}

function fmtDay(date: string, language: string) {
  return new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

// Builds the whole document: recap page (KPIs + per-employee summary), the
// employee x day matrix mirroring the board's colors, then per-employee
// daily detail sheets. Returns the doc; caller handles save/download.
export function buildAttendancePdf(report: AttendancePdfReport, opts: AttendancePdfOptions): jsPDF {
  const { copy, monthLabel, generatedAt, timezone, language, todayYmd } = opts
  // eslint-disable-next-line new-cap -- "jsPDF" is the library's real name
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()

  const rows = [...report.rows].sort((a, b) => String(a.name ?? a.username ?? '').localeCompare(String(b.name ?? b.username ?? '')))
  const statusesFor = (e: AttendancePdfEmployee, date: string) => resolveCellStatus(e.byDate?.[date], date > todayYmd, 'all')

  // ---- KPIs over every employee-day cell -------------------------------
  let onTime = 0
  let lateCount = 0
  let earlyCount = 0
  let missingCount = 0
  let lateMinutes = 0
  let earlyMinutes = 0
  for (const e of report.rows) {
    for (const day of report.days) {
      const st = statusesFor(e, day)
      if (st === 'onTime')
        onTime++
      else if (st === 'late')
        lateCount++
      else if (st === 'early')
        earlyCount++
      else if (st === 'missing')
        missingCount++
      for (const entry of Object.values(e.byDate[day]?.grouped ?? {})) {
        lateMinutes += entryLateMinutes(entry) ?? 0
        earlyMinutes += entryEarlyMinutes(entry) ?? 0
      }
    }
  }

  // ---- Page 1 header ----------------------------------------------------
  let y = 44
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(copy.title, MARGIN, y)
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(monthLabel, MARGIN, y)
  y += 14
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(`${copy.generatedAt}: ${generatedAt}`, MARGIN, y)
  doc.setTextColor(20)
  y += 20

  // KPI strip: two text rows, values first, colored squares for statuses.
  const kpis: Array<{ label: string, value: string, fill?: [number, number, number] }> = [
    { label: copy.employee, value: String(report.rows.length) },
    { label: copy.onTime, value: String(onTime), fill: statusFill.onTime },
    { label: copy.late, value: String(lateCount), fill: statusFill.late },
    { label: copy.earlyLeave, value: String(earlyCount), fill: statusFill.early },
    { label: copy.totalMissing, value: String(missingCount), fill: statusFill.missing },
    { label: copy.colLateMin, value: String(lateMinutes) },
    { label: copy.colEarlyMin, value: String(earlyMinutes) },
  ]
  // KPI strip: two fixed rows so the layout is deterministic. Values bold,
  // labels muted, status chips get their board color swatch.
  const kpiRows = [
    kpis.slice(0, 4),
    kpis.slice(4),
  ]
  {
    doc.setFontSize(9)
    for (const [rowIndex, row] of kpiRows.entries()) {
      const rowY = y + rowIndex * 16
      let x = MARGIN
      for (const kpi of row) {
        if (kpi.fill) {
          doc.setFillColor(kpi.fill[0], kpi.fill[1], kpi.fill[2])
          doc.rect(x, rowY - 7, 8, 8, 'F')
          x += 12
        }
        doc.setFont('helvetica', 'bold')
        doc.text(kpi.value, x, rowY)
        x += doc.getTextWidth(kpi.value) + 4
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(110)
        doc.text(kpi.label, x, rowY)
        x += doc.getTextWidth(kpi.label) + 24
        doc.setTextColor(20)
      }
    }
    y += kpiRows.length * 16 + 14
  }

  // ---- Per-employee monthly summary ------------------------------------
  autoTable(doc, {
    startY: y,
    margin: { top: 42, left: MARGIN, right: MARGIN },
    head: [[copy.employee, copy.totalDays, copy.totalLate, copy.colLateMin, copy.colEarlyMin, copy.totalMissing]],
    body: rows.map((e) => {
      let worked = 0
      let late = 0
      let missing = 0
      let lateMin = 0
      let earlyMin = 0
      for (const day of report.days) {
        const st = statusesFor(e, day)
        if (st === 'onTime' || st === 'late' || st === 'early')
          worked++
        if (st === 'late')
          late++
        if (st === 'missing')
          missing++
        for (const entry of Object.values(e.byDate[day]?.grouped ?? {})) {
          lateMin += entryLateMinutes(entry) ?? 0
          earlyMin += entryEarlyMinutes(entry) ?? 0
        }
      }
      return [String(e.name ?? e.username ?? '-'), worked, late, lateMin, earlyMin, missing]
    }),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [55, 65, 81], textColor: 255, fontSize: 8 },
    columnStyles: {
      1: { halign: 'center', cellWidth: 60 },
      2: { halign: 'center', cellWidth: 70 },
      3: { halign: 'center', cellWidth: 70 },
      4: { halign: 'center', cellWidth: 80 },
      5: { halign: 'center', cellWidth: 80 },
    },
  })
  y = (doc as any).lastAutoTable.finalY + 26

  // ---- Employee x day matrix --------------------------------------------
  const letters: Record<string, string> = { onTime: '\u2022', late: 'L', early: 'E', missing: 'M', none: '' }
  const head1: any[] = [{ content: copy.employee, rowSpan: 2, styles: { valign: 'middle' } }]
  const head2: (string | { content: string })[] = []
  for (const day of report.days) {
    const d = new Date(`${day}T00:00:00Z`)
    head1.push(String(d.getUTCDate()))
    head2.push({ content: new Intl.DateTimeFormat(language, { weekday: 'narrow', timeZone: 'UTC' }).format(d), styles: { fontSize: 5.5, textColor: [110, 110, 110] } })
  }
  const matrix = rows.map(e => [String(e.name ?? e.username ?? '-'), ...report.days.map((day) => {
    const st = statusesFor(e, day)
    return st === 'none' ? '' : letters[st]
  })])
  autoTable(doc, {
    startY: y,
    margin: { top: 42, left: MARGIN, right: MARGIN },
    head: [head1, head2],
    body: matrix,
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1.8, halign: 'center', lineColor: [225, 225, 225], lineWidth: 0.4 },
    headStyles: { fillColor: [55, 65, 81], textColor: 255, halign: 'center', fontSize: 6.5 },
    columnStyles: {
      0: { halign: 'left', cellWidth: 110, fontSize: 6.5 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body')
        return
      const dayIndex = data.column.index - 1
      const employee = rows[data.row.index]
      const day = report.days[dayIndex]
      if (!employee || !day)
        return
      const st = statusesFor(employee, day)
      const fill = statusFill[st]
      const text = statusText[st]
      if (fill)
        data.cell.styles.fillColor = fill
      if (text)
        data.cell.styles.textColor = text
      if (st === 'missing')
        data.cell.styles.fontStyle = 'bold'
    },
  })
  y = (doc as any).lastAutoTable.finalY + 16

  // Legend directly under the matrix, space permitting.
  const legend = [
    { label: `${copy.onTime} (\u2022)`, fill: statusFill.onTime },
    { label: `${copy.late} (L)`, fill: statusFill.late },
    { label: `${copy.earlyLeave} (E)`, fill: statusFill.early },
    { label: `${copy.totalMissing} (M)`, fill: statusFill.missing },
    { label: `${copy.none} (-)`, fill: null },
  ]
  if (y > doc.internal.pageSize.getHeight() - 90)
    doc.addPage()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  let lx = MARGIN
  for (const item of legend) {
    const w = doc.getTextWidth(item.label) + 30
    if (lx + w > W - MARGIN) {
      lx = MARGIN
      y += 14
    }
    if (item.fill) {
      doc.setFillColor(item.fill![0], item.fill![1], item.fill![2])
      doc.rect(lx, y - 6, 8, 7, 'F')
    }
    doc.setTextColor(80)
    doc.text(item.label, lx + 11, y)
    lx += w
  }
  y += 20

  // ---- Per-employee daily detail ----------------------------------------
  for (const e of rows) {
    const entries: Array<[string, string, AttendanceShiftEntryLike, AttendanceDayCellLike]> = []
    for (const day of report.days) {
      const cell = e.byDate?.[day]
      for (const [st, entry] of Object.entries(cell?.grouped ?? {})) {
        if (!entry.clockIn && !entry.clockOut)
          continue
        entries.push([day, st, entry, cell!])
      }
    }
    if (!entries.length)
      continue

    const name = String(e.name ?? e.username ?? '-')
    if (y > doc.internal.pageSize.getHeight() - 170) {
      doc.addPage()
      y = 42
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`${copy.detailTitle} - ${name}`, MARGIN, y)
    y += 8

    autoTable(doc, {
      startY: y + 8,
      margin: { top: 42, left: MARGIN, right: MARGIN },
      head: [[copy.colDate, copy.colShift, copy.colType, copy.colIn, copy.colOut, copy.colLateMin, copy.colEarlyMin, copy.colStatus]],
      body: entries.map(([day, st, entry]) => {
        const lateMin = entryLateMinutes(entry)
        const earlyMin = entryEarlyMinutes(entry)
        const status = resolveEntryStatus(entry)
        const statusLabel = status === 'onTime' ? copy.onTime : status === 'late' ? copy.late : status === 'early' ? copy.earlyLeave : copy.missing
        return [fmtDay(day, language), entry.shiftCode ?? '-', st, fmtTime(entry.clockIn, timezone, language), fmtTime(entry.clockOut, timezone, language), lateMin ?? '-', earlyMin ?? '-', statusLabel]
      }),
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: [55, 65, 81], textColor: 255, fontSize: 7.5 },
      columnStyles: {
        5: { halign: 'center', cellWidth: 52 },
        6: { halign: 'center', cellWidth: 52 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body')
          return
        const status = resolveEntryStatus(entries[data.row.index][2])
        const fill = statusFill[status]
        const text = statusText[status]
        if (fill)
          data.cell.styles.textColor = text
        if (data.column.index === 7 && fill)
          data.cell.styles.fillColor = fill
      },
    })
    y = (doc as any).lastAutoTable.finalY + 24
  }

  // ---- Uniform page furniture -------------------------------------------
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(140)
    doc.text(`${copy.title} - ${monthLabel}`, MARGIN, 20)
    doc.text(`${copy.page} ${i}/${pages}`, W - MARGIN, 20)
    doc.text(generatedAt, MARGIN, doc.internal.pageSize.getHeight() - 16)
  }

  return doc
}
