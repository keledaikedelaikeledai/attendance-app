import { createShiftWindow, parseBusinessDate } from '../../shared/utils/attendance-date'
import { resolveHistoricalShiftTiming } from './attendance-shift-history'

export type AttendanceAdminShiftTiming = {
  start: string
  end: string
}

export type AttendanceAdminShiftValue = {
  clockIn?: string
  clockOut?: string
  shiftCode?: string | null
  shiftStart?: string | null
  shiftEnd?: string | null
  shiftCodeLast?: string | null
  shiftStartIso?: string
  shiftEndIso?: string
  [key: string]: unknown
}

export function calculateAttendanceReportMetrics(
  businessDate: string,
  groupedByShiftType: Record<string, AttendanceAdminShiftValue>,
  shiftMap: Record<string, AttendanceAdminShiftTiming | undefined>,
  businessTimezone: string,
) {
  let totalLateMs = 0
  let totalEarlyMs = 0
  let countWorkingShifts = 0
  let harian = 0
  let bantuan = 0

  for (const [st, val] of Object.entries(groupedByShiftType)) {
    if (val.clockIn) {
      countWorkingShifts++
      if (st === 'harian') harian++
      else if (st === 'bantuan') bantuan++

      const currentTiming = val.shiftCode ? shiftMap[val.shiftCode] : undefined
      const timing = resolveHistoricalShiftTiming(val.shiftStart, val.shiftEnd, currentTiming)
      if (timing) {
        const shiftWindow = createShiftWindow(parseBusinessDate(businessDate), timing, businessTimezone)
        const shiftStart = shiftWindow.start.toDate()
        const clockIn = new Date(val.clockIn)
        val.shiftStartIso = shiftStart.toISOString()
        totalLateMs += Math.max(0, clockIn.getTime() - shiftStart.getTime())
      }
    }

    if (val.clockOut) {
      const currentTiming = val.shiftCode ? shiftMap[val.shiftCode] : undefined
      const timing = resolveHistoricalShiftTiming(val.shiftStart, val.shiftEnd, currentTiming)
      if (timing) {
        const shiftWindow = createShiftWindow(parseBusinessDate(businessDate), timing, businessTimezone)
        const shiftStart = shiftWindow.start.toDate()
        const shiftEnd = shiftWindow.end.toDate()
        const clockOut = new Date(val.clockOut)
        val.shiftStartIso = shiftStart.toISOString()
        val.shiftEndIso = shiftEnd.toISOString()
        totalEarlyMs += Math.max(0, shiftEnd.getTime() - clockOut.getTime())
      }
    }
  }

  return {
    grouped: groupedByShiftType,
    lateMs: totalLateMs,
    earlyMs: totalEarlyMs,
    workingShifts: countWorkingShifts,
    harian,
    bantuan,
  }
}
