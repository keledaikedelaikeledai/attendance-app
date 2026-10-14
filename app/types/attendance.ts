// Shared shapes for the admin attendance surfaces (board page, table and
// grid components). Mirror of the /api/admin/attendance payload, declared
// once so the board page and its components cannot drift apart.

export interface ShiftEntry {
  clockIn?: string | null
  clockOut?: string | null
  shiftCode?: string | null
  shiftStartIso?: string | null
  shiftEndIso?: string | null
  earlyReason?: string | null
  // Server-side flag: an open shift whose expected window has not ended yet.
  running?: boolean
}

export interface DayCell {
  entries: unknown[]
  grouped?: Record<string, ShiftEntry>
  lateMs?: number
  earlyMs?: number
  workingShifts?: number
}

export interface AttendanceEmployee {
  userId: string
  email?: string | null
  name?: string | null
  username?: string | null
  byDate: Record<string, DayCell>
}

export interface AttendanceData { month: string, days: string[], rows: AttendanceEmployee[] }
