import { ref } from 'vue'

export interface ShiftDef { code: string, label?: string, start: string, end: string }

// Internal cache to avoid repeated network calls
let SHIFTS_CACHE: Map<string, ShiftDef> | null = null
export const shiftsMap = ref<Map<string, ShiftDef> | null>(SHIFTS_CACHE)

export async function ensureShifts() {
  if (SHIFTS_CACHE) {
    shiftsMap.value = SHIFTS_CACHE
    return
  }
  try {
    const res = await $fetch<ShiftDef[]>('/api/shifts')
    const m = new Map((res || []).map((s: any) => [s.code, s]))
    SHIFTS_CACHE = m
    shiftsMap.value = m
  }
  catch {
    // ignore - shift defs optional
  }
}

export function computeShiftStart(ciIso?: string, def?: { start: string, end: string }) {
  if (!ciIso || !def) return null
  const d = new Date(ciIso)
  const [shStr, smStr] = (def.start || '').split(':')
  const [ehStr, emStr] = (def.end || '').split(':')
  const sh = Number(shStr)
  const sm = Number(smStr)
  const eh = Number(ehStr)
  const em = Number(emStr)
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return null
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  const ciMin = d.getHours() * 60 + d.getMinutes()
  const crosses = startMin > endMin
  let y = d.getFullYear()
  let m = d.getMonth()
  let day = d.getDate()
  if (crosses && ciMin < endMin) {
    const prev = new Date(d)
    prev.setDate(prev.getDate() - 1)
    y = prev.getFullYear()
    m = prev.getMonth()
    day = prev.getDate()
  }
  return new Date(y, m, day, sh, sm, 0, 0)
}

export function computeShiftStartForEntry(clockInIso?: string, entry?: any) {
  if (!clockInIso) return null
  const def = entry?.shift || (entry?.shiftCode && shiftsMap.value ? shiftsMap.value.get(entry.shiftCode) : undefined)
  return computeShiftStart(clockInIso, def)
}

export function humanizeMinutes(ms: number) {
  if (!ms) return '0m'
  const total = Math.ceil(ms / 60000)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

export function normalizeCell(cell: any) {
  if (!cell) return []
  if (cell.grouped && typeof cell.grouped === 'object') {
    return Object.keys(cell.grouped).map((k) => {
      const e = cell.grouped[k]
      const base = { ...e, shiftType: e?.shiftType || k }
      if (!base.shift && base.shiftCode && shiftsMap.value) return { ...base, shift: shiftsMap.value.get(base.shiftCode) }
      return base
    }).filter(Boolean)
  }
  if (Array.isArray(cell)) return cell
  const base = [cell]
  if (base[0] && !base[0].shift && base[0].shiftCode && shiftsMap.value) base[0].shift = shiftsMap.value.get(base[0].shiftCode)
  return base
}

export const normalizeCellForExport = normalizeCell

export function entryLateMs(e: any, parentCell?: any, entries?: any[]) {
  if (!e) return 0
  if (typeof e?.lateMs === 'number') return e.lateMs
  if (parentCell && typeof parentCell?.lateMs === 'number' && Array.isArray(entries)) {
    const ins = entries.map((x: any) => x?.clockIn).filter(Boolean)
    if (ins.length === 1 && e?.clockIn) return parentCell.lateMs
  }
  if (!e?.clockIn) return 0
  const def = e.shift || (e.shiftCode && shiftsMap.value ? shiftsMap.value.get(e.shiftCode) : undefined)
  const start = computeShiftStart(e.clockIn, def || e.shift)
  if (!start) return 0
  const diff = new Date(e.clockIn).getTime() - start.getTime()
  return Math.max(0, diff)
}

export function entryEarlyMs(e: any, parentCell?: any, entries?: any[]) {
  if (!e) return 0
  if (typeof e?.earlyMs === 'number') return e.earlyMs
  if (parentCell && typeof parentCell?.earlyMs === 'number' && Array.isArray(entries)) {
    const outs = entries.map((x: any) => x?.clockOut).filter(Boolean)
    if (outs.length === 1 && e?.clockOut) return parentCell.earlyMs
  }
  if (!e?.clockOut) return 0
  const def = e.shift || (e.shiftCode && shiftsMap.value ? shiftsMap.value.get(e.shiftCode) : undefined)
  if (!def) return 0
  const start = computeShiftStart(e.clockIn || e.clockOut, def || e.shift)
  if (!start) return 0
  const [shStr, smStr] = (def.start || '').split(':')
  const [ehStr, emStr] = (def.end || '').split(':')
  const sh = Number(shStr)
  const sm = Number(smStr)
  const eh = Number(ehStr)
  const em = Number(emStr)
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return 0
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  const crosses = startMin > endMin
  const end = new Date(start)
  if (crosses) end.setDate(end.getDate() + 1)
  end.setHours(eh, em, 0, 0)
  const co = new Date(e.clockOut)
  const diff = end.getTime() - co.getTime()
  return Math.max(0, diff)
}

// Compatibility helpers used elsewhere
export const computeLateMsForEntry = entryLateMs
export const computeEarlyMsForEntry = entryEarlyMs
