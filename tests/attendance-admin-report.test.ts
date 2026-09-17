import { describe, expect, test } from 'bun:test'
import { calculateAttendanceReportMetrics } from '../server/utils/attendance-admin-report'

const shifts = {
  H1: { start: '09:00', end: '17:00' },
  B1: { start: '16:00', end: '23:00' },
}

describe('calculateAttendanceReportMetrics', () => {
  test('uses historical timing snapshot after the current shift is edited', () => {
    const grouped = {
      harian: {
        clockIn: '2026-04-12T01:05:00.000Z',
        clockOut: '2026-04-12T09:00:00.000Z',
        shiftCode: 'H1',
        shiftStart: '08:00',
        shiftEnd: '16:00',
      },
    }

    const result = calculateAttendanceReportMetrics('2026-04-12', grouped, shifts, 'Asia/Jakarta')

    expect(result.lateMs).toBe(5 * 60 * 1000)
    expect(result.earlyMs).toBe(0)
    expect(result.workingShifts).toBe(1)
    expect(result.harian).toBe(1)
    expect(result.bantuan).toBe(0)
  })

  test('falls back to the current timing for legacy logs without snapshots', () => {
    const grouped = {
      harian: {
        clockIn: '2026-04-12T02:05:00.000Z',
        clockOut: '2026-04-12T09:00:00.000Z',
        shiftCode: 'H1',
      },
    }

    const result = calculateAttendanceReportMetrics('2026-04-12', grouped, shifts, 'Asia/Jakarta')

    expect(result.lateMs).toBe(5 * 60 * 1000)
    expect(result.earlyMs).toBe(60 * 60 * 1000)
  })

  test('counts one Harian and one Bantuan session on the same business date', () => {
    const grouped = {
      harian: {
        clockIn: '2026-04-12T01:00:00.000Z',
        clockOut: '2026-04-12T09:00:00.000Z',
        shiftCode: 'H1',
        shiftStart: '08:00',
        shiftEnd: '16:00',
      },
      bantuan: {
        clockIn: '2026-04-12T09:00:00.000Z',
        clockOut: '2026-04-12T15:00:00.000Z',
        shiftCode: 'B1',
        shiftStart: '16:00',
        shiftEnd: '23:00',
      },
    }

    const result = calculateAttendanceReportMetrics('2026-04-12', grouped, shifts, 'Asia/Jakarta')

    expect(result.workingShifts).toBe(2)
    expect(result.harian).toBe(1)
    expect(result.bantuan).toBe(1)
    expect(result.lateMs).toBe(0)
    expect(result.earlyMs).toBe(60 * 60 * 1000)
  })

  test('uses the business date for overnight shift boundaries', () => {
    const grouped = {
      harian: {
        clockIn: '2026-04-12T15:05:00.000Z',
        clockOut: '2026-04-12T23:00:00.000Z',
        shiftCode: 'H1',
        shiftStart: '22:00',
        shiftEnd: '06:00',
      },
    }

    const result = calculateAttendanceReportMetrics('2026-04-12', grouped, shifts, 'Asia/Jakarta')

    expect(result.lateMs).toBe(5 * 60 * 1000)
    expect(result.earlyMs).toBe(0)
    expect(result.grouped.harian.shiftStartIso).toBe('2026-04-12T15:00:00.000Z')
    expect(result.grouped.harian.shiftEndIso).toBe('2026-04-12T23:00:00.000Z')
  })
})
