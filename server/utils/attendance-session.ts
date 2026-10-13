// Shared open-session detection for the attendance mutations.
//
// This is the same pairing walk the dashboard and the status endpoint use:
// walking a user's logs in chronological order, the session is "open" when
// the latest unmatched entry is a clock-in. The window must span ALL of a
// user's logs, not just today and yesterday - the two-day window that the
// endpoints once used exists for overnight shifts crossing one midnight,
// and it stranded any session left open longer than that: the status
// endpoint reported "clocked in for 9 days" while clock-out answered 409,
// leaving the employee unable to ever close the session.
export interface AttendanceTypeLog {
  type: 'clock-in' | 'clock-out'
}

export function findOpenClockIn<T extends AttendanceTypeLog>(logsAscending: T[]): T | undefined {
  let openClockIn: T | undefined
  for (const log of logsAscending) {
    if (log.type === 'clock-in')
      openClockIn = log
    else if (log.type === 'clock-out' && openClockIn)
      openClockIn = undefined
  }
  return openClockIn
}
