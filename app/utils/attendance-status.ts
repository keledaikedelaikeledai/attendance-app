// Employee-day status, shared by the admin board (drives the matrix colors
// and the Excel export) and the PDF export (drives the same colors). One
// implementation so printed colors mean exactly what the on-screen colors
// mean. Late/early comparisons all delegate to the shared grace rule so the
// board, the reports, and the exports cannot disagree about a day.

import { earlyMinutes as earlyMinutesGrace, lateMinutes as lateMinutesGrace } from '../../shared/utils/attendance-grace'

export type CellStatus = 'onTime' | 'late' | 'early' | 'missing' | 'none'

export interface AttendanceShiftEntryLike {
  clockIn?: string | null
  clockOut?: string | null
  shiftCode?: string | null
  shiftStartIso?: string | null
  shiftEndIso?: string | null
}

export interface AttendanceDayCellLike {
  grouped?: Record<string, AttendanceShiftEntryLike> | null
}

export interface AttendanceEntryStatusLike {
  clockIn?: string | null
  clockOut?: string | null
  shiftStartIso?: string | null
  shiftEndIso?: string | null
}

// One status per employee-day from the already-reconciled server cells.
// Missing check-out outranks late, which outranks a short shift: a red cell
// says "someone never closed the shift", which is the thing most worth
// spotting from across the room.
export function resolveCellStatus(
  cell: AttendanceDayCellLike | undefined,
  future: boolean,
  shiftType: 'all' | 'harian' | 'bantuan' = 'all',
): CellStatus {
  if (!cell?.grouped)
    return 'none'
  const entries = Object.entries(cell.grouped).filter(([st]) => shiftType === 'all' || st === shiftType)
  if (!entries.length)
    return 'none'
  if (future)
    return entries.some(([, e]) => e.clockIn || e.clockOut) ? 'onTime' : 'none'
  let late = false
  let early = false
  for (const [, e] of entries) {
    if (e.clockIn && !e.clockOut)
      return 'missing'
    if (lateMinutesGrace(e.clockIn, e.shiftStartIso) != null)
      late = true
    if (earlyMinutesGrace(e.clockOut, e.shiftEndIso) != null)
      early = true
  }
  return late ? 'late' : early ? 'early' : 'onTime'
}

// Per-shift-record status for row-level exports (Excel, PDF detail sheets):
// no session-level aggregation, just this entry's in/out vs its snapshot.
export function resolveEntryStatus(e: AttendanceEntryStatusLike): Exclude<CellStatus, 'none'> {
  if (e.clockIn && !e.clockOut)
    return 'missing'
  const late = lateMinutesGrace(e.clockIn, e.shiftStartIso) != null
  const early = earlyMinutesGrace(e.clockOut, e.shiftEndIso) != null
  return late ? 'late' : early ? 'early' : 'onTime'
}

// Late/early minutes for one entry - grace-filtered and ceil'd so the values
// match the board's colors and never show a zero-minute late. Null when the
// entry is on time for that side.
export function entryLateMinutes(e: AttendanceEntryStatusLike) {
  return lateMinutesGrace(e.clockIn, e.shiftStartIso)
}

export function entryEarlyMinutes(e: AttendanceEntryStatusLike) {
  return earlyMinutesGrace(e.clockOut, e.shiftEndIso)
}
