import { describe, expect, test } from 'bun:test'
import { entryEarlyMinutes, entryLateMinutes, resolveCellStatus, resolveEntryStatus } from '../app/utils/attendance-status'

// These four helpers are exactly what the Excel export (admin attendance page)
// and the PDF export print per row. The tests pin the export contract of the
// shared grace rule: sub-minute deviations read as on time, real ones ceil so
// no exported file can contain "late 0 min" against a late status.

// WIB shift pagi 07:00-19:00 on 2026-09-02.
const START = '2026-09-02T00:00:00.000Z'
const END = '2026-09-02T12:00:00.000Z'

describe('export status contract (Excel + PDF rows)', () => {
  test('clock-in 18.8s after shift start - the syaiful Sept 2 shape - is on time', () => {
    const e = { clockIn: '2026-09-01T17:00:18.801Z', clockOut: '2026-09-02T05:01:36.524Z', shiftStartIso: START, shiftEndIso: END }
    expect(resolveEntryStatus(e)).toBe('early') // 12:01 out vs 19:00 end
    expect(entryLateMinutes(e)).toBeNull() // exports print blank, not "0"
    expect(entryEarlyMinutes(e)).toBe(419)
  })

  test('clock-in exactly at shift start is on time, no minutes printed', () => {
    const e = { clockIn: START, clockOut: END, shiftStartIso: START, shiftEndIso: END }
    expect(resolveEntryStatus(e)).toBe('onTime')
    expect(entryLateMinutes(e)).toBeNull()
    expect(entryEarlyMinutes(e)).toBeNull()
  })

  test('clock-in 59s late stays on time and prints blank in the Late column', () => {
    const e = { clockIn: '2026-09-02T00:00:59.000Z', clockOut: END, shiftStartIso: START, shiftEndIso: END }
    expect(resolveEntryStatus(e)).toBe('onTime')
    expect(entryLateMinutes(e)).toBeNull()
  })

  test('clock-in 90s late is late with 2 min exported, never 0', () => {
    const e = { clockIn: '2026-09-02T00:01:30.000Z', clockOut: END, shiftStartIso: START, shiftEndIso: END }
    expect(resolveEntryStatus(e)).toBe('late')
    expect(entryLateMinutes(e)).toBe(2)
    expect(entryEarlyMinutes(e)).toBeNull()
  })

  test('board cell (day dot) agrees with the row export for the same entries', () => {
    const cell = { grouped: { harian: { clockIn: '2026-09-02T00:01:30.000Z', clockOut: END, shiftStartIso: START, shiftEndIso: END } } }
    expect(resolveCellStatus(cell, false)).toBe('late')
    const onTime = { grouped: { harian: { clockIn: START, clockOut: END, shiftStartIso: START, shiftEndIso: END } } }
    expect(resolveCellStatus(onTime, false)).toBe('onTime')
  })

  test('missing check-out still outranks late in both surfaces', () => {
    const e = { clockIn: '2026-09-02T00:01:30.000Z', shiftStartIso: START }
    expect(resolveEntryStatus(e)).toBe('missing')
    const cell = { grouped: { harian: { clockIn: '2026-09-02T00:01:30.000Z', shiftStartIso: START } } }
    expect(resolveCellStatus(cell, false)).toBe('missing')
  })
})
