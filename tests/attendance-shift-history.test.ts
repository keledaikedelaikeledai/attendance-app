import { describe, expect, test } from 'bun:test'
import { resolveHistoricalShiftTiming } from '../server/utils/attendance-shift-history'

describe('resolveHistoricalShiftTiming', () => {
  test('uses the clock-in snapshot when present', () => {
    expect(resolveHistoricalShiftTiming('08:00', '16:00', { start: '09:00', end: '17:00' })).toEqual({ start: '08:00', end: '16:00' })
  })

  test('falls back to the current shift timing for legacy logs without a snapshot', () => {
    expect(resolveHistoricalShiftTiming(null, null, { start: '09:00', end: '17:00' })).toEqual({ start: '09:00', end: '17:00' })
  })

  test('does not use a partial snapshot', () => {
    expect(resolveHistoricalShiftTiming('08:00', null, { start: '09:00', end: '17:00' })).toEqual({ start: '09:00', end: '17:00' })
  })

  test('returns undefined when neither snapshot nor fallback exists', () => {
    expect(resolveHistoricalShiftTiming(undefined, undefined)).toBeUndefined()
  })
})
