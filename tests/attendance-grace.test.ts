import { describe, expect, test } from 'bun:test'
import { ATTENDANCE_GRACE_MS, earlyMinutes, earlyShortfallMs, lateDelayMs, lateMinutes } from '../shared/utils/attendance-grace'

// Fixed reference shift WIB: start 07:00, end 19:00, business date 2026-09-02.
// WIB = UTC+7, so 07:00 WIB = 2026-09-02T00:00:00Z.
const START = '2026-09-02T00:00:00.000Z'
const END = '2026-09-02T12:00:00.000Z'

describe('attendance grace rule', () => {
  test('clock-in exactly on shift start is on time', () => {
    expect(lateMinutes(START, START)).toBeNull()
    expect(lateDelayMs(START, START)).toBe(0)
  })

  test('clock-in before shift start is on time, never negative', () => {
    expect(lateMinutes('2026-09-01T17:00:18.801Z', START)).toBeNull()
    expect(lateDelayMs('2026-09-01T17:00:18.801Z', START)).toBe(0)
  })

  test('sub-minute delay stays inside the grace window (the old "Late 0 min" case)', () => {
    const delay = ATTENDANCE_GRACE_MS - 1000 // 59s
    expect(lateDelayMs(delay, 0)).toBe(0)
    expect(lateMinutes(delay, 0)).toBeNull()
  })

  test('exactly one minute late is late, ceil to 1 min', () => {
    expect(lateDelayMs(60_000, 0)).toBe(60_000)
    expect(lateMinutes(60_000, 0)).toBe(1)
  })

  test('fractional minutes ceil so a late never displays as 0 min', () => {
    expect(lateMinutes(START + 1, START)).toBeNull() // 1ms - grace
    expect(lateMinutes(3_660_000, 0)).toBe(61) // 61 min
    expect(lateMinutes(90_000, 0)).toBe(2) // 90s -> 2 (ceil)
  })

  test('missing inputs are never late', () => {
    expect(lateMinutes(null, START)).toBeNull()
    expect(lateMinutes(START, null)).toBeNull()
    expect(lateMinutes('nonsense', START)).toBeNull()
    expect(lateDelayMs(undefined, 0)).toBe(0)
  })

  test('clock-out exactly on shift end is not leaving early', () => {
    expect(earlyMinutes(END, END)).toBeNull()
    expect(earlyShortfallMs(END, END)).toBe(0)
  })

  test('clock-out after shift end is not early', () => {
    expect(earlyMinutes('2026-09-02T12:30:00.000Z', END)).toBeNull()
    expect(earlyShortfallMs('2026-09-02T13:00:00.000Z', END)).toBe(0)
  })

  test('sub-minute early shortfall stays inside the grace window', () => {
    expect(earlyMinutes(END - 1000, END)).toBeNull()
    expect(earlyShortfallMs(END - 59_999, END)).toBe(0)
  })

  test('one minute early counts, fractional ceils', () => {
    const end = new Date(END).getTime()
    expect(earlyMinutes(end - 60_000, END)).toBe(1)
    expect(earlyMinutes(end - 90_000, END)).toBe(2)
    expect(earlyMinutes(end - 418 * 60_000 - 20_000, END)).toBe(419) // 418min20s ceils
  })

  test('missing clock-out is never early', () => {
    expect(earlyMinutes(null, END)).toBeNull()
    expect(earlyShortfallMs(undefined, END)).toBe(0)
  })
})
