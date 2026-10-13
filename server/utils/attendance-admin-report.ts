import { createShiftWindow, parseBusinessDate } from '../../shared/utils/attendance-date'
import { earlyShortfallMs, lateDelayMs } from '../../shared/utils/attendance-grace'
import { resolveHistoricalShiftTiming } from './attendance-shift-history'

export interface AttendanceAdminShiftTiming {
  start: string
  end: string
}

export interface AttendanceAdminShiftValue {
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
        val.shiftStartIso = shiftStart.toISOString()
        // Grace-filtered: sub-minute delays count as on time, so cells, the
        // board, and the exports all agree on what "late" means.
        totalLateMs += lateDelayMs(val.clockIn, shiftStart.toISOString())
      }
    }

    if (val.clockOut) {
      const currentTiming = val.shiftCode ? shiftMap[val.shiftCode] : undefined
      const timing = resolveHistoricalShiftTiming(val.shiftStart, val.shiftEnd, currentTiming)
      if (timing) {
        const shiftWindow = createShiftWindow(parseBusinessDate(businessDate), timing, businessTimezone)
        const shiftStart = shiftWindow.start.toDate()
        const shiftEnd = shiftWindow.end.toDate()
        val.shiftStartIso = shiftStart.toISOString()
        val.shiftEndIso = shiftEnd.toISOString()
        totalEarlyMs += earlyShortfallMs(val.clockOut, shiftEnd.toISOString())
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
