import { createShiftWindow, parseBusinessDate } from '../../shared/utils/attendance-date'
import { ATTENDANCE_GRACE_MS, earlyShortfallMs, lateDelayMs } from '../../shared/utils/attendance-grace'
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
  nowMs: number = Date.now(),
) {
  let totalLateMs = 0
  let totalEarlyMs = 0
  let countWorkingShifts = 0
  let harian = 0
  let bantuan = 0

  // Local today (YYYY-MM-DD) in the business timezone - the fallback running
  // bound for open shifts whose shift definition no longer exists.
  const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: businessTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(nowMs)

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
        const shiftEnd = shiftWindow.end.toDate()
        val.shiftStartIso = shiftStart.toISOString()
        val.shiftEndIso = shiftEnd.toISOString()
        // Grace-filtered: sub-minute delays count as on time, so cells, the
        // board, and the exports all agree on what "late" means.
        totalLateMs += lateDelayMs(val.clockIn, shiftStart.toISOString())
        // An open shift (no clock-out) inside its expected window is running,
        // not missing - someone mid-shift is not a missed check-out. Once the
        // window has been over by more than the grace window, it turns into
        // missing farther down (the resolver treats open && !running as such).
        if (!val.clockOut)
          val.running = nowMs < shiftEnd.getTime() + ATTENDANCE_GRACE_MS
      }
      else if (!val.clockOut && businessDate === todayYmd) {
        // Unknown shift code (removed from the current defs): judge running by
        // the business date alone - today gets the benefit of the doubt, any
        // past date is a genuine missing check-out. Shift-proof: editing or
        // retiring shift records never recolors history.
        val.running = true
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
