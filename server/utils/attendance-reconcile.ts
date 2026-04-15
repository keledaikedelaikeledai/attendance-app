export interface AttendanceLogLite {
  id?: string | null
  type: 'clock-in' | 'clock-out'
  shiftType?: string | null
  shiftCode?: string | null
}

export interface ShiftEventLite {
  type: 'clock-in' | 'clock-out'
  timestampMs: number | null
}

export function selectShiftClockBounds<T extends ShiftEventLite>(groupLogs: T[]) {
  const ins = groupLogs
    .filter(g => g.type === 'clock-in')
    .sort((a, b) => (a.timestampMs ?? Number.POSITIVE_INFINITY) - (b.timestampMs ?? Number.POSITIVE_INFINITY))
  const outs = groupLogs
    .filter(g => g.type === 'clock-out')
    .sort((a, b) => (a.timestampMs ?? Number.NEGATIVE_INFINITY) - (b.timestampMs ?? Number.NEGATIVE_INFINITY))

  const clockIn = ins.find(x => x.timestampMs != null) ?? ins[0] ?? null
  let clockOut = [...outs].reverse().find(x => x.timestampMs != null) ?? (outs.length ? outs[outs.length - 1] : null)

  if (clockIn?.timestampMs != null && clockOut?.timestampMs != null && clockOut.timestampMs < clockIn.timestampMs) {
    const inTs = clockIn.timestampMs
    const outAfterIn = [...outs].reverse().find(x => x.timestampMs != null && x.timestampMs >= inTs)
    clockOut = outAfterIn ?? null
  }

  return { clockIn, clockOut }
}

export function reconcileCrossdayOrphanClockOut(logsByDate: Map<string, AttendanceLogLite[]>) {
  const orderedDates = Array.from(logsByDate.keys()).sort((a, b) => a.localeCompare(b))
  for (let i = 1; i < orderedDates.length; i++) {
    const prevDate = orderedDates[i - 1]
    const currDate = orderedDates[i]
    if (!prevDate || !currDate) continue

    const prevLogs = logsByDate.get(prevDate)
    const currLogs = logsByDate.get(currDate)
    if (!prevLogs || !currLogs?.length) continue

    const outTypes = new Set(currLogs.filter(l => l?.type === 'clock-out').map(l => l?.shiftType || 'unknown'))
    for (const st of outTypes) {
      const currHasIn = currLogs.some(l => l?.type === 'clock-in' && ((l?.shiftType || 'unknown') === st))
      if (currHasIn) continue

      const currOuts = currLogs.filter(l => l?.type === 'clock-out' && ((l?.shiftType || 'unknown') === st))
      if (!currOuts.length) continue

      const movedIds = new Set<string>()
      for (const outLog of currOuts) {
        const outShiftCode = outLog?.shiftCode ?? null
        const prevInCandidates = prevLogs.filter((l) => {
          if (l?.type !== 'clock-in') return false
          if ((l?.shiftType || 'unknown') !== st) return false
          if (!outShiftCode) return true
          return (l?.shiftCode ?? null) === outShiftCode
        })
        if (!prevInCandidates.length) continue

        const prevOutCandidates = prevLogs.filter((l) => {
          if (l?.type !== 'clock-out') return false
          if ((l?.shiftType || 'unknown') !== st) return false
          if (!outShiftCode) return false
          return (l?.shiftCode ?? null) === outShiftCode
        })
        if (prevOutCandidates.length > 0) continue

        prevLogs.push(outLog)
        if (outLog?.id) movedIds.add(String(outLog.id))
      }

      if (movedIds.size > 0) {
        const remaining = currLogs.filter(l => !(l?.type === 'clock-out' && l?.id && movedIds.has(String(l.id))))
        logsByDate.set(currDate, remaining)
      }
    }
  }
}
