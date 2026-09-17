export type AttendanceShiftTiming = {
  start: string
  end: string
}

export function resolveHistoricalShiftTiming(
  snapshotStart: unknown,
  snapshotEnd: unknown,
  currentTiming?: AttendanceShiftTiming,
): AttendanceShiftTiming | undefined {
  if (typeof snapshotStart === 'string' && typeof snapshotEnd === 'string') {
    return { start: snapshotStart, end: snapshotEnd }
  }
  return currentTiming
}
