import {
  CalendarDate,
  CalendarDateTime,
  Time,
  ZonedDateTime,
  fromDate,
  parseDate,
  toCalendarDate,
  toZoned,
} from '@internationalized/date'

export type AttendanceDate = CalendarDate
export type AttendanceTime = Time
export type AttendanceDateTime = CalendarDateTime
export type AttendanceZonedDateTime = ZonedDateTime

export interface ShiftTimeDefinition {
  start: string
  end: string
}

export interface ShiftWindow {
  date: AttendanceDate
  start: AttendanceZonedDateTime
  end: AttendanceZonedDateTime
  overnight: boolean
}

export function isBusinessDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  try {
    parseDate(value)
    return true
  }
  catch {
    return false
  }
}

export function parseBusinessDate(value: string): AttendanceDate {
  if (!isBusinessDate(value)) throw new RangeError(`Invalid business date: ${value}`)
  return parseDate(value)
}

export function formatBusinessDate(value: AttendanceDate): string {
  return value.toString()
}

export function addBusinessDays(value: AttendanceDate, days: number): AttendanceDate {
  if (!Number.isInteger(days)) throw new RangeError('days must be an integer')
  return value.add({ days })
}

export function getTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function getZonedDateTime(date: Date, timeZone: string): AttendanceZonedDateTime {
  if (!timeZone) throw new RangeError('timeZone is required')
  return fromDate(date, timeZone)
}

export function getCalendarDate(date: Date, timeZone: string): AttendanceDate {
  return toCalendarDate(getZonedDateTime(date, timeZone))
}

export function parseShiftTime(value: string): AttendanceTime {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new RangeError(`Invalid shift time: ${value}`)
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new RangeError(`Invalid shift time: ${value}`)
  return new Time(hour, minute)
}

export function timeToMinutes(value: AttendanceTime): number {
  return value.hour * 60 + value.minute
}

export function isOvernightShift(shift: ShiftTimeDefinition): boolean {
  return timeToMinutes(parseShiftTime(shift.start)) > timeToMinutes(parseShiftTime(shift.end))
}

export function createShiftWindow(
  businessDate: AttendanceDate,
  shift: ShiftTimeDefinition,
  timeZone: string,
): ShiftWindow {
  const startTime = parseShiftTime(shift.start)
  const endTime = parseShiftTime(shift.end)
  const overnight = timeToMinutes(startTime) > timeToMinutes(endTime)
  const start = toZoned(new CalendarDateTime(
    businessDate.year,
    businessDate.month,
    businessDate.day,
    startTime.hour,
    startTime.minute,
  ), timeZone)
  const endDate = overnight ? businessDate.add({ days: 1 }) : businessDate
  const end = toZoned(new CalendarDateTime(
    endDate.year,
    endDate.month,
    endDate.day,
    endTime.hour,
    endTime.minute,
  ), timeZone)

  return { date: businessDate, start, end, overnight }
}

export function resolveBusinessDate(
  calendarDate: AttendanceDate,
  localTime: AttendanceTime,
  shift: ShiftTimeDefinition,
): AttendanceDate {
  const start = parseShiftTime(shift.start)
  const end = parseShiftTime(shift.end)
  const overnight = timeToMinutes(start) > timeToMinutes(end)
  if (overnight && timeToMinutes(localTime) <= timeToMinutes(end)) {
    return calendarDate.subtract({ days: 1 })
  }
  return calendarDate
}

export function resolveBusinessDateFromInstant(
  instant: Date,
  shift: ShiftTimeDefinition,
  timeZone: string,
): AttendanceDate {
  const zoned = getZonedDateTime(instant, timeZone)
  const calendarDate = toCalendarDate(zoned)
  const localTime = new Time(zoned.hour, zoned.minute, zoned.second, zoned.millisecond)
  return resolveBusinessDate(calendarDate, localTime, shift)
}
