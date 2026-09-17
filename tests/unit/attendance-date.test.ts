import { describe, expect, test } from 'bun:test'
import { parseDate } from '@internationalized/date'
import {
  addBusinessDays,
  createShiftWindow,
  formatBusinessDate,
  getCalendarDate,
  isOvernightShift,
  parseBusinessDate,
  parseShiftTime,
  resolveBusinessDate,
  resolveBusinessDateFromInstant,
} from '../../shared/utils/attendance-date'

const overnightShift = { start: '22:00', end: '07:00' }
const dayShift = { start: '07:00', end: '15:00' }

describe('attendance date foundation', () => {
  test('parses and formats business dates without timezone conversion', () => {
    const date = parseBusinessDate('2026-09-16')
    expect(formatBusinessDate(date)).toBe('2026-09-16')
    expect(formatBusinessDate(addBusinessDays(date, 1))).toBe('2026-09-17')
  })

  test('rejects invalid calendar dates', () => {
    expect(() => parseBusinessDate('2026-02-30')).toThrow()
    expect(() => parseBusinessDate('2026-9-16')).toThrow()
  })

  test('parses shift times and identifies overnight shifts', () => {
    expect(parseShiftTime('22:30').hour).toBe(22)
    expect(isOvernightShift(overnightShift)).toBe(true)
    expect(isOvernightShift(dayShift)).toBe(false)
  })

  test('assigns after-midnight overnight events to the previous business date', () => {
    const calendarDate = parseDate('2026-09-17')
    expect(resolveBusinessDate(calendarDate, parseShiftTime('00:30'), overnightShift).toString()).toBe('2026-09-16')
    expect(resolveBusinessDate(calendarDate, parseShiftTime('07:00'), overnightShift).toString()).toBe('2026-09-16')
    expect(resolveBusinessDate(calendarDate, parseShiftTime('07:01'), overnightShift).toString()).toBe('2026-09-17')
  })

  test('builds an overnight window across calendar midnight', () => {
    const window = createShiftWindow(parseDate('2026-09-16'), overnightShift, 'Asia/Jakarta')
    expect(window.start.toString()).toContain('2026-09-16T22:00')
    expect(window.end.toString()).toContain('2026-09-17T07:00')
    expect(window.overnight).toBe(true)
  })

  test('derives calendar and business dates from an instant in an explicit timezone', () => {
    const instant = new Date('2026-09-16T17:30:00.000Z')
    expect(getCalendarDate(instant, 'Asia/Jakarta').toString()).toBe('2026-09-17')
    expect(resolveBusinessDateFromInstant(instant, overnightShift, 'Asia/Jakarta').toString()).toBe('2026-09-16')
  })
})
