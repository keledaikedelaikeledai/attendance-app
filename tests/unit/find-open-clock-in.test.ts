import { describe, expect, test } from 'bun:test'
import { findOpenClockIn } from '../../server/utils/attendance-session'

interface Log { type: 'clock-in' | 'clock-out', date?: string }

function logs(...specs: Array<'in' | 'out'>): Log[] {
  return specs.map((s, i) => ({ type: s === 'in' ? 'clock-in' : 'clock-out', date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` }))
}

describe('findOpenClockIn', () => {
  test('closed session -> none', () => {
    expect(findOpenClockIn(logs('in', 'out'))).toBeUndefined()
  })

  test('plain open session', () => {
    const open = findOpenClockIn(logs('in'))
    expect(open?.type).toBe('clock-in')
  })

  test('session open across multiple days is still found - the reported case', () => {
    const multiDay = [
      { type: 'clock-in', date: '2026-10-04' },
      { type: 'clock-in', date: '2026-10-13' }, // hypothetical later entries
    ] as Log[]
    expect(findOpenClockIn(multiDay)?.date).toBe('2026-10-13')
    expect(findOpenClockIn([{ type: 'clock-in', date: '2026-10-04' }])?.date).toBe('2026-10-04')
  })

  test('older open session with a newer closed one: the closed newest wins', () => {
    // sessions: Oct 4 in (never closed), Oct 12 in + closed. The walk pairs
    // the out with the nearest open in, so nothing is detected as open - the
    // Oct 4 orphan is an admin-cleanup case (dashboard missing-check-out),
    // not a live session.
    const l: Log[] = [
      { type: 'clock-in', date: '2026-10-04' },
      { type: 'clock-in', date: '2026-10-12' },
      { type: 'clock-out', date: '2026-10-12' },
    ]
    expect(findOpenClockIn(l)).toBeUndefined()
  })

  test('empty history -> none', () => {
    expect(findOpenClockIn([])).toBeUndefined()
  })

  test('multiple open sessions pair the latest (LIFO unwind)', () => {
    const l = logs('in', 'in', 'in')
    expect(findOpenClockIn(l)?.date).toBe(l[2]?.date)
  })
})
