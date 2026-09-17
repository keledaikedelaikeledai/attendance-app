import { describe, expect, test } from 'bun:test'
import { parseDate, parseTime } from '@internationalized/date'
import { createShiftWindow, formatBusinessDate, resolveBusinessDateFromInstant } from '../../shared/utils/attendance-date'

describe('client attendance business-date boundaries', () => {
  const overnight = { start: '22:00', end: '07:00' }

  test('maps Jakarta after-midnight overnight time to the prior business date', () => {
    const instant = new Date('2026-09-16T17:30:00.000Z')
    expect(formatBusinessDate(resolveBusinessDateFromInstant(instant, overnight, 'Asia/Jakarta'))).toBe('2026-09-16')
  })

  test('maps the exact overnight shift end to the prior business date', () => {
    const instant = new Date('2026-09-17T00:00:00.000Z')
    expect(formatBusinessDate(resolveBusinessDateFromInstant(instant, overnight, 'Asia/Jakarta'))).toBe('2026-09-16')
  })

  test('maps one minute after overnight shift end to the current business date', () => {
    const instant = new Date('2026-09-17T00:01:00.000Z')
    expect(formatBusinessDate(resolveBusinessDateFromInstant(instant, overnight, 'Asia/Jakarta'))).toBe('2026-09-17')
  })

  test('builds the late-start instant from the business date in the selected timezone', () => {
    const window = createShiftWindow(parseDate('2026-09-16'), overnight, 'Asia/Jakarta')
    expect(window.start.toDate().toISOString()).toBe('2026-09-16T15:00:00.000Z')
  })

  test('keeps shift time parsing independent from the host timezone', () => {
    expect(parseTime('22:00').hour).toBe(22)
  })
})
