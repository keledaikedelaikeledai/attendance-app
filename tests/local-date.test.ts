import { describe, expect, test } from 'bun:test'
import { addDaysYmd, isYmd, localDateTimeToUtcMs, localNowYmdFromOffset } from '../server/utils/local-date'

describe('local-date helpers', () => {
  test('validates YMD correctly', () => {
    expect(isYmd('2026-04-15')).toBe(true)
    expect(isYmd('2026-4-15')).toBe(false)
    expect(isYmd('not-a-date')).toBe(false)
  })

  test('adds and subtracts days safely', () => {
    expect(addDaysYmd('2026-04-15', -1)).toBe('2026-04-14')
    expect(addDaysYmd('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01')
  })

  test('computes local date from tzOffset semantics', () => {
    // 2026-04-14 23:33:23Z equals 2026-04-15 06:33:23 at UTC+7 (offset -420)
    const now = new Date('2026-04-14T23:33:23.000Z')
    expect(localNowYmdFromOffset(now, -420)).toBe('2026-04-15')
  })

  test('converts local wall clock to UTC ms using offset', () => {
    // Local 2026-04-15 07:00 at UTC+7 is 2026-04-15T00:00:00Z
    const ms = localDateTimeToUtcMs('2026-04-15', 7, 0, -420)
    expect(new Date(ms).toISOString()).toBe('2026-04-15T00:00:00.000Z')
  })
})
