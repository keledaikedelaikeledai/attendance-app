import type { ShiftDef } from '~/types/shifts'
import { ref } from 'vue'

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

function cloneCell(cell: any) {
  if (!cell || typeof cell !== 'object') return cell
  const grouped = (cell.grouped && typeof cell.grouped === 'object')
    ? Object.fromEntries(Object.entries(cell.grouped).map(([k, v]) => [k, v && typeof v === 'object' ? { ...v } : v]))
    : undefined
  return {
    ...cell,
    ...(grouped ? { grouped } : {}),
  }
}

function recomputeCellAggregates(cell: any) {
  if (!cell || typeof cell !== 'object') return cell
  const entries = normalizeCell(cell)
  const withClockIn = entries.filter((e: any) => e?.clockIn)
  const workingShifts = withClockIn.length
  const harian = withClockIn.filter((e: any) => e?.shiftType === 'harian').length
  const bantuan = withClockIn.filter((e: any) => e?.shiftType === 'bantuan').length
  const lateMs = entries.reduce((a: number, e: any) => a + entryLateMs(e, undefined, entries), 0)
  const earlyMs = entries.reduce((a: number, e: any) => a + entryEarlyMs(e, undefined, entries), 0)
  return {
    ...cell,
    workingShifts,
    harian,
    bantuan,
    lateMs,
    earlyMs,
  }
}

export function normalizeByDateCrossday(byDate: Record<string, any>, orderedDays?: string[]) {
  const source = byDate || {}
  const days = Array.isArray(orderedDays) && orderedDays.length
    ? [...orderedDays]
    : Object.keys(source).sort((a, b) => a.localeCompare(b))

  const out: Record<string, any> = Object.fromEntries(
    days.map(d => [d, cloneCell(source[d] || { grouped: {}, lateMs: 0, earlyMs: 0, workingShifts: 0, harian: 0, bantuan: 0 })]),
  )

  for (let i = 1; i < days.length; i++) {
    const prevDay = days[i - 1]
    const currDay = days[i]
    if (!prevDay || !currDay) continue
    const prevCell = out[prevDay]
    const currCell = out[currDay]
    const prevGrouped = prevCell?.grouped
    const currGrouped = currCell?.grouped
    if (!prevGrouped || !currGrouped || typeof prevGrouped !== 'object' || typeof currGrouped !== 'object') continue

    let changed = false
    for (const [st, currVal] of Object.entries(currGrouped as Record<string, any>)) {
      if (!currVal || currVal.clockIn || !currVal.clockOut) continue
      const prevVal = (prevGrouped as Record<string, any>)[st]
      if (prevVal?.clockIn && !prevVal?.clockOut) {
        prevVal.clockOut = currVal.clockOut
        prevVal.clockOutLat = currVal.clockOutLat
        prevVal.clockOutLng = currVal.clockOutLng
        prevVal.clockOutAccuracy = currVal.clockOutAccuracy
        if (currVal.earlyReason != null) prevVal.earlyReason = currVal.earlyReason
        if (!prevVal.shiftCode && currVal.shiftCode) prevVal.shiftCode = currVal.shiftCode
        delete (currGrouped as Record<string, any>)[st]
        changed = true
      }
    }

    if (changed) {
      out[prevDay] = recomputeCellAggregates(prevCell)
      out[currDay] = recomputeCellAggregates(currCell)
    }
  }

  return out
}

export function normalizeRowsCrossday<T extends { byDate?: Record<string, any> }>(rows: T[], orderedDays?: string[]) {
  return (rows || []).map((row) => {
    const byDate = normalizeByDateCrossday((row as any)?.byDate || {}, orderedDays)
    return {
      ...row,
      byDate,
    }
  }) as T[]
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
