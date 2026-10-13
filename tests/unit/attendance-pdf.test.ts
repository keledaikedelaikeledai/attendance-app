import type { AttendancePdfReport } from '../../app/utils/attendance-pdf'
import { describe, expect, test } from 'bun:test'
import { buildAttendancePdf, formatDuration } from '../../app/utils/attendance-pdf'

const copy = {
  title: 'Attendance Report',
  generatedAt: 'Generated',
  detailTitle: 'Daily detail',
  colType: 'Shift type',
  page: 'Page',
  colDate: 'Date',
  colShift: 'Shift',
  colIn: 'In',
  colOut: 'Out',
  colStatus: 'Status',
  employee: 'Employee',
  totalDays: 'Days worked',
  totalLate: 'Late arrivals',
  totalMissing: 'Missing check-outs',
  colLateMin: 'Late (min)',
  colEarlyMin: 'Left early (min)',
  onTime: 'On time',
  late: 'Late',
  earlyLeave: 'Left early',
  missing: 'Missing',
  none: 'No record',
}

const days = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)
const report: AttendancePdfReport = {
  month: '2026-09',
  days,
  rows: [
    {
      name: 'Budi',
      byDate: {
        '2026-09-14': { grouped: { harian: { clockIn: '2026-09-14T00:30:00.000Z', clockOut: '2026-09-14T07:30:00.000Z', shiftStartIso: '2026-09-14T00:00:00.000Z', shiftEndIso: '2026-09-14T08:00:00.000Z', shiftCode: 'pagi' } } },
        '2026-09-15': { grouped: { harian: { clockIn: '2026-09-15T00:10:00.000Z', shiftStartIso: '2026-09-15T00:00:00.000Z', shiftCode: 'pagi' } } },
      },
    },
    {
      name: 'Ani',
      byDate: {
        '2026-09-14': { grouped: { harian: { clockIn: '2026-09-14T00:00:00.000Z', clockOut: '2026-09-14T08:00:00.000Z', shiftStartIso: '2026-09-14T00:00:00.000Z', shiftEndIso: '2026-09-14T08:00:00.000Z', shiftCode: 'pagi' } } },
      },
    },
  ],
}

describe('buildAttendancePdf', () => {
  test('builds a multi-section document without throwing', () => {
    const doc = buildAttendancePdf(report, {
      copy,
      monthLabel: 'September 2026',
      generatedAt: '13 Oct 2026, 17:00',
      timezone: 'Asia/Jakarta',
      language: 'en-GB',
      todayYmd: '2026-10-01',
    })
    // Header + KPIs + summary + matrix + detail sheets (all sections on one
    // page for this small fixtures set; a real month spans several).
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    const bytes = doc.output('arraybuffer') as ArrayBuffer
    // Tables + text make it comfortably larger than an empty doc.
    expect(bytes.byteLength).toBeGreaterThan(2000)
    // %PDF header
    expect(String.fromCharCode(...new Uint8Array(bytes.slice(0, 4)))).toBe('%PDF')
  })

  test('empty report still produces a valid document', () => {
    const doc = buildAttendancePdf({ month: '2026-09', days, rows: [] }, {
      copy,
      monthLabel: 'September 2026',
      generatedAt: 'x',
      timezone: 'Asia/Jakarta',
      language: 'en-GB',
      todayYmd: '2026-10-01',
    })
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })
})

describe('formatDuration', () => {
  test('omits zero units, smallest last', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(60)).toBe('1 hr')
    expect(formatDuration(75)).toBe('1 hr 15 min')
    expect(formatDuration(1328)).toBe('22 hr 8 min')
    expect(formatDuration(1440)).toBe('1 d')
    expect(formatDuration(1501)).toBe('1 d 1 hr 1 min')
  })
})
