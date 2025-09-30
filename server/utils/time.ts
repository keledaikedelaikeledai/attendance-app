// normalize timestamp values stored in DB: some rows may store seconds while others store ms
export function isIsoTimestampString(v: any) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v)
}

export function normalizeTimestampRaw(v: any) {
  if (v == null) return Number.NaN
  if (v instanceof Date) return v.getTime()
  if (isIsoTimestampString(v)) {
    const parsed = Date.parse(v)
    return Number.isNaN(parsed) ? Number.NaN : parsed
  }
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : Number.NaN)
  if (Number.isNaN(n)) return Number.NaN
  return n < 1e12 ? Math.floor(n * 1000) : Math.floor(n)
}
