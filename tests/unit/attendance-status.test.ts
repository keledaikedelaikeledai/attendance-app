import { describe, expect, test } from 'bun:test'
import { entryLateMinutes, resolveCellStatus, resolveEntryStatus } from '../../app/utils/attendance-status'

const start = '2026-10-13T00:00:00.000Z' // shift 07:00-15:00 WIB
const end = '2026-10-13T08:00:00.000Z'

function entry(overrides: Record<string, string>) {
  return { clockIn: undefined, clockOut: undefined, shiftStartIso: undefined, shiftEndIso: undefined, ...overrides }
}

describe('resolveEntryStatus', () => {
  test('open session is missing regardless of lateness', () => {
    expect(resolveEntryStatus(entry({ clockIn: start }))).toBe('missing')
    expect(resolveEntryStatus(entry({ clockIn: '2026-10-13T01:00:00.000Z' }))).toBe('missing')
  })

  test('late outranks early within one entry', () => {
    expect(resolveEntryStatus(entry({ clockIn: start, clockOut: end, shiftStartIso: start, shiftEndIso: end }))).toBe('onTime')
    expect(resolveEntryStatus(entry({ clockIn: '2026-10-13T01:30:00.000Z', clockOut: end, shiftStartIso: start, shiftEndIso: end }))).toBe('late')
    expect(resolveEntryStatus(entry({ clockIn: start, clockOut: '2026-10-13T06:30:00.000Z', shiftStartIso: start, shiftEndIso: end }))).toBe('early')
  })

  test('late/early minutes use the snapshot, rounded', () => {
    expect(entryLateMinutes(entry({ clockIn: '2026-10-13T00:30:00.000Z', shiftStartIso: start }))).toBe(30)
    expect(entryLateMinutes(entry({ clockIn: '2026-10-13T00:15:40.000Z', shiftStartIso: start }))).toBe(16)
    expect(entryLateMinutes(entry({ clockIn: start, shiftStartIso: start }))).toBeNull()
  })
})

describe('resolveCellStatus', () => {
  const cell = (entries: Record<string, Record<string, string>>) => ({ grouped: entries })

  test('empty or absent cell is none', () => {
    expect(resolveCellStatus(undefined, false)).toBe('none')
    expect(resolveCellStatus(cell({}), false)).toBe('none')
    expect(resolveCellStatus({ grouped: undefined }, false)).toBe('none')
  })

  test('missing outranks late across entries in the day', () => {
    const open = cell({ harian: { clockIn: '2026-10-13T01:30:00.000Z' } })
    expect(resolveCellStatus(open, false)).toBe('missing')
  })

  test('late day: late entry wins over an on-time one', () => {
    const day = cell({
      harian: { clockIn: start, clockOut: end, shiftStartIso: start, shiftEndIso: end },
      bantuan: { clockIn: '2026-10-13T02:00:00.000Z', clockOut: end, shiftStartIso: start, shiftEndIso: end },
    })
    expect(resolveCellStatus(day, false)).toBe('late')
  })

  test('shift-type filter narrows the evaluation', () => {
    const day = cell({
      harian: { clockIn: start, clockOut: end, shiftStartIso: start, shiftEndIso: end },
      bantuan: { clockIn: '2026-10-13T02:00:00.000Z' }, // open -> missing
    })
    expect(resolveCellStatus(day, false, 'harian')).toBe('onTime')
    expect(resolveCellStatus(day, false, 'bantuan')).toBe('missing')
    expect(resolveCellStatus(day, false, 'all')).toBe('missing')
  })

  test('future days with records collapse to onTime, never missing', () => {
    const future = cell({ harian: { clockIn: '2026-10-20T01:30:00.000Z' } })
    expect(resolveCellStatus(future, true)).toBe('onTime')
    expect(resolveCellStatus(cell({}), true)).toBe('none')
  })
})
