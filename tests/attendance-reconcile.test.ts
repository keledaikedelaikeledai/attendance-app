import { describe, expect, test } from 'bun:test'
import { reconcileCrossdayOrphanClockOut, selectShiftClockBounds } from '../server/utils/attendance-reconcile'

describe('selectShiftClockBounds', () => {
  test('prefers latest valid clock-out when null timestamp exists', () => {
    const rows = [
      { type: 'clock-out' as const, timestampMs: null },
      { type: 'clock-out' as const, timestampMs: 10 },
      { type: 'clock-out' as const, timestampMs: 20 },
    ]

    const { clockOut } = selectShiftClockBounds(rows)
    expect(clockOut?.timestampMs).toBe(20)
  })

  test('prefers earliest valid clock-in when invalid entries exist', () => {
    const rows = [
      { type: 'clock-in' as const, timestampMs: null },
      { type: 'clock-in' as const, timestampMs: 200 },
      { type: 'clock-in' as const, timestampMs: 100 },
    ]

    const { clockIn } = selectShiftClockBounds(rows)
    expect(clockIn?.timestampMs).toBe(100)
  })

  test('does not pair clock-out that is earlier than selected clock-in', () => {
    const rows = [
      { type: 'clock-out' as const, timestampMs: 1000 },
      { type: 'clock-in' as const, timestampMs: 2000 },
    ]

    const { clockIn, clockOut } = selectShiftClockBounds(rows)
    expect(clockIn?.timestampMs).toBe(2000)
    expect(clockOut).toBeNull()
  })
})

describe('reconcileCrossdayOrphanClockOut', () => {
  test('moves next-day orphan clock-out back to previous day when matching clock-in exists', () => {
    const byDate = new Map<string, any[]>([
      ['2026-04-12', [
        { id: 'in-1', type: 'clock-in', shiftType: 'harian', shiftCode: null },
      ]],
      ['2026-04-13', [
        { id: 'out-1', type: 'clock-out', shiftType: 'harian', shiftCode: null },
      ]],
    ])

    reconcileCrossdayOrphanClockOut(byDate)

    expect(byDate.get('2026-04-12')?.map(x => x.id)).toContain('out-1')
    expect(byDate.get('2026-04-13')?.map(x => x.id)).not.toContain('out-1')
  })

  test('does not move orphan when previous day already has same shiftCode clock-out', () => {
    const byDate = new Map<string, any[]>([
      ['2026-04-12', [
        { id: 'in-1', type: 'clock-in', shiftType: 'harian', shiftCode: 'A' },
        { id: 'out-prev', type: 'clock-out', shiftType: 'harian', shiftCode: 'A' },
      ]],
      ['2026-04-13', [
        { id: 'out-1', type: 'clock-out', shiftType: 'harian', shiftCode: 'A' },
      ]],
    ])

    reconcileCrossdayOrphanClockOut(byDate)

    expect(byDate.get('2026-04-12')?.map(x => x.id)).not.toContain('out-1')
    expect(byDate.get('2026-04-13')?.map(x => x.id)).toContain('out-1')
  })
})
