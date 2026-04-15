function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function isYmd(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

// JS getTimezoneOffset semantics: UTC = local + offset
// so local = UTC - offset
export function localNowYmdFromOffset(now: Date, tzOffsetMinutes: number) {
  const localMs = now.getTime() - (tzOffsetMinutes * 60000)
  return toYmd(new Date(localMs))
}

// Converts a local wall-clock datetime into UTC epoch milliseconds using getTimezoneOffset semantics.
export function localDateTimeToUtcMs(ymd: string, hh: number, mm: number, tzOffsetMinutes: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d, hh, mm, 0, 0) + (tzOffsetMinutes * 60000)
}
