// One lateness / early-leave rule shared by the user report, the admin board
// and drawer, and every export. Previously each surface compared instants
// with its own strictness and rounding, which produced "Late 0 min" labels
// and made the same day read differently depending on the page.
//
// Rule: a clock-in under one minute after shift start (GPS round-trip, device
// clock drift) is not lateness; a clock-out within one minute before shift
// end is not leaving early. Any real delay ceils to whole minutes so a late
// never displays as "0 min".

export const ATTENDANCE_GRACE_MS = 60_000

function parseTime(value: string | number | null | undefined): number | null {
  if (value == null || value === '')
    return null
  const ms = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

// Milliseconds a clock-in missed its shift start, 0 when on time, before it,
// or inside the grace window. Endpoints carrying lateMs to clients use this
// so every downstream `> 0` check already agrees with the grace rule.
export function lateDelayMs(clockIn: string | number | null | undefined, shiftStart: string | number | null | undefined): number {
  const cin = parseTime(clockIn)
  const start = parseTime(shiftStart)
  if (cin == null || start == null)
    return 0
  const delay = cin - start
  return delay >= ATTENDANCE_GRACE_MS ? delay : 0
}

// Milliseconds between the shift end and an earlier clock-out, 0 when on or
// after shift end (clocking out exactly on time is not leaving early), or
// inside the grace window.
export function earlyShortfallMs(clockOut: string | number | null | undefined, shiftEnd: string | number | null | undefined): number {
  const cout = parseTime(clockOut)
  const end = parseTime(shiftEnd)
  if (cout == null || end == null)
    return 0
  const shortfall = end - cout
  return shortfall >= ATTENDANCE_GRACE_MS ? shortfall : 0
}

// Whole minutes a clock-in was late, or null when on time. Ceils, so the
// smallest possible late reads as "1 min", never "0 min".
export function lateMinutes(clockIn: string | number | null | undefined, shiftStart: string | number | null | undefined): number | null {
  const delay = lateDelayMs(clockIn, shiftStart)
  return delay > 0 ? Math.ceil(delay / 60_000) : null
}

// Whole minutes a shift ended early, or null when not early. Ceils for the
// same reason as lateMinutes.
export function earlyMinutes(clockOut: string | number | null | undefined, shiftEnd: string | number | null | undefined): number | null {
  const shortfall = earlyShortfallMs(clockOut, shiftEnd)
  return shortfall > 0 ? Math.ceil(shortfall / 60_000) : null
}
