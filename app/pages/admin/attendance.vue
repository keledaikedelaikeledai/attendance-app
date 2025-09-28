<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

import * as attendanceTime from '~/composables/useAttendanceTime'

const toast = useToast()

const month = ref<string>(new Date().toISOString().slice(0, 7)) // YYYY-MM

const { data, refresh, status } = await useFetch('/api/admin/attendance', {
  query: { month },
  credentials: 'include',
})

export type AttendanceData = typeof data.value

const monthOptions = computed(() => {
  // Provide last 12 months including current
  const arr: Array<{ label: string, value: string }> = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const dt = new Date(now)
    dt.setMonth(now.getMonth() - i)
    const val = dt.toISOString().slice(0, 7)
    const label = dt.toLocaleDateString([], { year: 'numeric', month: 'long' })
    arr.push({ label, value: val })
  }
  return arr
})

function onRefresh() {
  refresh()
}

const type = ref<TabsItem[]>([
  {
    label: 'Grid',
    icon: 'lucide:layout-grid',
    value: 'grid',
  },
  {
    label: 'Table',
    icon: 'lucide:table',
    value: 'table',
  },
])
const activeType = ref<'table' | 'grid'>('grid')

const attendances = computed(() => data.value?.rows || [])

// legacy per-cell lateMs helper removed in favor of entry-level calculations

// dayEarlyMs removed; entryEarlyMs handles entry-level early calculations

// Shifts cache so export uses same shift defs as table rendering
// re-exported from composable

// Entry-level helpers mirror AttendanceTable.vue logic
// imported: entryLateMs, entryEarlyMs

// computeEntryEarlyMs removed - use entryEarlyMs which mirrors table logic

// Compute validated cell-level earlyMs: sum per-entry values and compare to server-provided aggregate
// keep local validator helper but use composable helpers
function cellTotalEarlyMs(cell: any) {
  if (!cell) return 0
  const es = attendanceTime.normalizeCellForExport(cell)
  const perEntry = es.reduce((a: number, e: any) => a + attendanceTime.entryEarlyMs(e, cell, es), 0)
  if (typeof cell?.earlyMs === 'number') {
    if (es.length > 0) {
      const diff = Math.abs(cell.earlyMs - perEntry)
      if (diff > 60 * 60 * 1000) return perEntry
      return cell.earlyMs
    }
    return cell.earlyMs
  }
  return perEntry
}

function toDateLabel(iso?: string) {
  if (!iso)
    return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function buildDataAoA() {
  const days = data.value?.days || []
  const rows: any[][] = []
  const dayTwoFlagsAll: boolean[][] = []
  // ensure we have shift defs available for accurate per-entry calculations
  // (no-op if already cached)
  // Note: exportWithExcelJS will await this before calling buildDataAoA
  for (const r of attendances.value as any[]) {
    const byDate = (r?.byDate) || {}
    // Work per-date so we can respect any aggregated values the server provides
    const cellsRaw: any[] = Object.values(byDate)
    const entriesAll: any[] = cellsRaw.flatMap(c => attendanceTime.normalizeCellForExport(c))
    // Count working days as total number of shifts worked.
    // Use server-provided `workingShifts` if present for a date; otherwise count entries with clockIn.
    const workingDays = Object.values(byDate).reduce((sum: number, c: any) => {
      if (!c) return sum
      if (typeof c?.workingShifts === 'number') return sum + Math.max(0, Math.floor(c.workingShifts))
      const es = attendanceTime.normalizeCellForExport(c)
      return sum + es.filter((e: any) => e?.clockIn).length
    }, 0)
    const harian = entriesAll.filter(c => c?.clockIn && c?.shiftType === 'harian').length
    const bantuan = entriesAll.filter(c => c?.clockIn && c?.shiftType === 'bantuan').length
    const totalLate = cellsRaw.reduce((acc: number, cell: any) => {
      if (!cell) return acc
      if (typeof cell?.lateMs === 'number') return acc + cell.lateMs
      const es = attendanceTime.normalizeCellForExport(cell)
      return acc + es.reduce((a: number, e: any) => a + attendanceTime.entryLateMs(e, cell, es), 0)
    }, 0)
    const totalEarly = cellsRaw.reduce((acc: number, cell: any) => acc + cellTotalEarlyMs(cell), 0)

    const row: any[] = [
      r.name || r.username || r.email || 'N/A',
      workingDays,
      harian,
      bantuan,
      attendanceTime.humanizeMinutes(totalLate),
      attendanceTime.humanizeMinutes(totalEarly),
    ]
    const dayFlags: boolean[] = []
    for (const day of days) {
      const c = byDate[day] || {}
      const entries = attendanceTime.normalizeCellForExport(c)
      const dayHasTwo = Array.isArray(entries) && entries.length > 1
      dayFlags.push(!!dayHasTwo)
      // We'll export top/bottom values in the same cell separated by a newline so Excel shows split cells
      const topE = entries[0] || {}
      const botE = entries[1] || {}
      const topM = topE?.clockIn ? toDateLabel(topE.clockIn) : ''
      const botM = botE?.clockIn ? toDateLabel(botE.clockIn) : ''
      const topP = topE?.clockOut ? toDateLabel(topE.clockOut) : ''
      const botP = botE?.clockOut ? toDateLabel(botE.clockOut) : ''
      const topReason = topE?.earlyReason ? String(topE.earlyReason) : ''
      const botReason = botE?.earlyReason ? String(botE.earlyReason) : ''
      // Per-slot T and CP: prefer entry-level values, else compute via dayLateMs/dayEarlyMs
      const topTms = typeof topE?.lateMs === 'number' ? topE.lateMs : attendanceTime.entryLateMs(topE, c, entries)
      const botTms = typeof botE?.lateMs === 'number' ? botE.lateMs : attendanceTime.entryLateMs(botE, c, entries)
      const topCpms = typeof topE?.earlyMs === 'number' ? topE.earlyMs : attendanceTime.entryEarlyMs(topE, c, entries)
      const botCpms = typeof botE?.earlyMs === 'number' ? botE.earlyMs : attendanceTime.entryEarlyMs(botE, c, entries)
      const topT = topTms ? attendanceTime.humanizeMinutes(topTms) : ''
      const botT = botTms ? attendanceTime.humanizeMinutes(botTms) : ''
      const topCp = topCpms ? attendanceTime.humanizeMinutes(topCpms) : ''
      const botCp = botCpms ? attendanceTime.humanizeMinutes(botCpms) : ''
      const m = [topM, botM].filter(Boolean).join('\n')
      const p = [topP, botP].filter(Boolean).join('\n')
      // For T and CP keep per-slot strings (empty lines allowed)
      const t = [topT, botT].join('\n')
      const cp = [topCp, botCp].join('\n')
      // Shift label: use shiftType if present else shiftCode
      const topSh = topE?.shiftType ? (topE.shiftType === 'bantuan' ? 'Shift Bantuan' : 'Shift Harian') : (topE?.shiftCode || '')
      const botSh = botE?.shiftType ? (botE.shiftType === 'bantuan' ? 'Shift Bantuan' : 'Shift Harian') : (botE?.shiftCode || '')
      const sh = [topSh, botSh].filter(Boolean).join('\n')
      const ket = [topReason, botReason].filter(Boolean).join('\n')
      row.push(m, p, t, cp, sh, ket)
    }
    rows.push(row)
    dayTwoFlagsAll.push(dayFlags)
  }
  return { rows, dayTwoFlagsList: dayTwoFlagsAll }
}

// imported normalizeCellForExport

async function getExcelJS() {
  if (process.server)
    throw new Error('ExcelJS is client-only')
  const mod: any = await import('exceljs')
  return mod?.default ?? mod
}

function buildHeaderAoA() {
  const subCols = ['M', 'P', 'T', 'CP', 'Shift', 'Ket']
  const days = data.value?.days || []
  const headerRow1: string[] = ['Nama', 'Hari Kerja', 'Shift Harian', 'Shift Bantuan', 'Keterlambatan', 'Cepat Pulang']
  const headerRow2: string[] = ['', '', '', '', '', '']
  for (const day of days) {
    const label = day.slice(-2)
    let isFirst = true
    for (const _ of subCols) {
      headerRow1.push(isFirst ? label : '')
      headerRow2.push(_)
      isFirst = false
    }
  }
  return { headerRow1, headerRow2, subCols, days }
}

async function exportWithExcelJS() {
  // ensure shifts are loaded so per-entry calculations use shift defs when available
  await attendanceTime.ensureShifts()
  const ExcelJS = await getExcelJS()
  // Try template first
  try {
    const resp = await fetch('/attendance-template.xlsx')
    if (!resp.ok) throw new Error('no template')
    const buf = await resp.arrayBuffer()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    if (!ws)
      throw new Error('Template has no worksheets')

    // Freeze the first column (Name) so it stays visible when horizontally scrolling
    try {
      ws.views = [{ state: 'frozen', xSplit: 1 }]
    }
    catch {}

    const { rows, dayTwoFlagsList: dayTwoFlagsFromBuild } = buildDataAoA()
    const { headerRow1, headerRow2, subCols, days } = buildHeaderAoA()
    const insertAt = 5
    // Snapshot existing merges below insertion to restore after splice (prevents footer duplication)
    const mergesBefore: Array<{ sRow: number, sCol: number, eRow: number, eCol: number }> = []
    try {
      const mm = (ws as any)._merges
      if (mm && typeof mm.forEach === 'function') {
        mm.forEach((v: any, k: any) => {
          const key = typeof k === 'string' ? k : (v && v.shortAddress ? v.shortAddress : null)
          if (!key) return
          const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(key)
          if (!m) return
          const colToNum = (s: string) => s.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0)
          const sCol = colToNum(m[1]!)
          const sRow = Number.parseInt(m[2]!)
          const eCol = colToNum(m[3]!)
          const eRow = Number.parseInt(m[4]!)
          if (sRow >= insertAt) mergesBefore.push({ sRow, sCol, eRow, eCol })
        })
      }
    }
    catch {}

    // Expand each logical row into two physical rows (top/bottom)
    const expandedRows: any[] = []
    const effectiveDayTwoFlags: boolean[][] = []
    const dayCount = days.length
    const subLen = subCols.length
    for (let ri = 0; ri < (rows || []).length; ri++) {
      const r = rows[ri]
      const top: any[] = []
      const bot: any[] = []
      // summary cols
      for (let c = 0; c < 6; c++) {
        top.push(r[c])
        bot.push('')
      }
      const srcFlags = Array.isArray(dayTwoFlagsFromBuild) ? (dayTwoFlagsFromBuild[ri] || []) : []
      const rowFlags: boolean[] = []
      for (let d = 0; d < dayCount; d++) {
        let dayHasTwo = !!srcFlags[d]
        const start = 6 + d * subLen
        for (let s = 0; s < subLen; s++) {
          const raw = r[start + s]
          if (raw == null || String(raw).trim() === '') {
            top.push('')
            bot.push('')
            continue
          }
          const parts = String(raw).split(/\r?\n/).map(p => String(p ?? '').trim())
          if (parts.length > 1 && parts[0] === '' && parts[1]) {
            top.push(parts[1])
            bot.push('')
          }
          else if (parts.length === 1) {
            top.push(parts[0])
            bot.push('')
          }
          else {
            dayHasTwo = true
            top.push(parts[0])
            bot.push(parts[1] ?? '')
          }
        }
        rowFlags.push(dayHasTwo)
      }
      effectiveDayTwoFlags.push(rowFlags)
      expandedRows.push(top, bot)
    }
    // Use effectiveDayTwoFlags for all merge decisions. If not available, fall back to server-provided flags.
    // effectiveDayTwoFlags is used directly for merge decisions in the template branch

    ws.spliceRows(insertAt, 0, headerRow1, headerRow2, ...expandedRows)

    // Robust pass: find exact 'Ket' subheader cells in the inserted header rows (insertAt and insertAt+1)
    try {
      const headerRows = [insertAt, insertAt + 1]
      for (const subHeaderRow of headerRows) {
        try {
          const hr = ws.getRow(subHeaderRow)
          for (let c = 1; c <= ws.columnCount; c++) {
            try {
              const v = hr.getCell(c).value
              if (v && String(v).trim().toLowerCase() === 'ket') {
                const col = ws.getColumn(c)
                col.width = 50
                col.alignment = { ...col.alignment, wrapText: true, vertical: 'middle' }
              }
            }
            catch {}
          }
        }
        catch {}
      }
    }
    catch {}

    // Merge headers: base columns vertically and day groups horizontally
    const base = 6
    for (let c = 1; c <= base; c++) ws.mergeCells(insertAt, c, insertAt + 1, c)
    for (let i = 0; i < days.length; i++) {
      const start = base + i * subCols.length + 1
      const end = start + subCols.length - 1
      ws.mergeCells(insertAt, start, insertAt, end)
    }

    // Ensure all header cells (both header rows) are centered vertically and horizontally and wrap text
    try {
      const headerCols = headerRow1.length || ws.columnCount
      for (let c = 1; c <= headerCols; c++) {
        try {
          const h1 = ws.getCell(insertAt, c)
          h1.alignment = { ...h1.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
        }
        catch {}
        try {
          const h2 = ws.getCell(insertAt + 1, c)
          h2.alignment = { ...h2.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
        }
        catch {}
      }
    }
    catch {}

    // Sanitization pass: ensure P cells do not contain non-time text (earlyReason)
    try {
      const pairCount = expandedRows.length / 2
      const subLen = subCols.length
      for (let i = 0; i < pairCount; i++) {
        const topSheetRow = insertAt + 2 + i * 2
        const botSheetRow = topSheetRow + 1
        for (let dIdx = 0; dIdx < days.length; dIdx++) {
          const localBase = 6
          const startCol = localBase + dIdx * subLen + 1
          const pCol = startCol + 1
          for (const rr of [topSheetRow, botSheetRow]) {
            try {
              const cell = ws.getRow(rr).getCell(pCol)
              const raw = (cell && cell.value) ? String(cell.value) : ''
              if (!raw) continue
              const parts = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
              // accept HH:MM or H:MM and optional AM/PM suffix
              const timeParts = parts.filter(p => /^\d{1,2}:\d{2}(?:\s?[APM]{2})?$/i.test(p))
              const final = timeParts.join('\n')
              if (final !== raw) cell.value = final
            }
            catch {}
          }
        }
      }
    }
    catch {}

    // Ensure per-day Ket columns are wide (~350px). Do this after footer insertion to avoid template overrides.
    try {
      const subLen = subCols.length
      for (let i = 0; i < days.length; i++) {
        const baseIdx = 6 + i * subLen
        try {
          const ketCol = baseIdx + 6
          const kc = ws.getColumn(ketCol)
          // ~50 chars approximates 350px in Excel column width units
          kc.width = 50
          kc.alignment = { ...kc.alignment, wrapText: true, vertical: 'middle' }
        }
        catch {}
      }
    }
    catch {}

    // Style header rows (insertAt and insertAt+1)
    for (const r of [insertAt, insertAt + 1]) {
      const row = ws.getRow(r)
      row.height = 24
      row.eachCell((cell: any) => {
        cell.font = { name: 'Arial', size: 12, bold: true, ...cell.font }
        cell.alignment = { ...cell.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.border = cell.border || {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        }
      })
    }

    // Light borders + vertical centering for data rows (if any), without disturbing template styles
    const dataCount = expandedRows.length
    const endDataRow = insertAt + 1 + dataCount
    for (let rr = insertAt + 2; rr <= endDataRow; rr++) {
      const row = ws.getRow(rr)
      // increase height to show two lines comfortably
      row.height = 36
      row.eachCell((cell: any) => {
        cell.font = { name: 'Arial', size: 12, ...cell.font }
        cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true }
        cell.border = cell.border || {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        }
      })
    }

    // Ensure summary columns (1..6) are vertically centered for all data rows (covers merged/unmerged cells)
    try {
      for (let rr = insertAt + 2; rr <= endDataRow; rr++) {
        const row = ws.getRow(rr)
        for (let c = 1; c <= 6; c++) {
          try {
            const cell = row.getCell(c)
            cell.alignment = { ...cell.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
          }
          catch {}
        }
      }
    }
    catch {}

    // Highlight M/P per slot: iterate over pairs of rows (top/bottom) and highlight only that slot's M or P when
    // the corresponding T or CP value for the same slot is non-empty.
    try {
      const subLen = 6
      const pairCount = expandedRows.length / 2
      for (let i = 0; i < pairCount; i++) {
        const topSheetRow = insertAt + 2 + i * 2
        const botSheetRow = topSheetRow + 1
        const topArr = expandedRows[i * 2] || []
        const botArr = expandedRows[i * 2 + 1] || []
        for (let dIdx = 0; dIdx < days.length; dIdx++) {
          const startIdx = 6 + dIdx * subLen
          const startCol = base + dIdx * subLen + 1
          const mCol = startCol + 0
          const pCol = startCol + 1
          // top slot
          const topT = String(topArr[startIdx + 2] || '').trim()
          const topCp = String(topArr[startIdx + 3] || '').trim()
          if (topT) {
            const cell = ws.getRow(topSheetRow).getCell(mCol)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
          }
          if (topCp) {
            const cell = ws.getRow(topSheetRow).getCell(pCol)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
          }
          // bottom slot
          const botT = String(botArr[startIdx + 2] || '').trim()
          const botCp = String(botArr[startIdx + 3] || '').trim()
          if (botT) {
            const cell = ws.getRow(botSheetRow).getCell(mCol)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
          }
          if (botCp) {
            const cell = ws.getRow(botSheetRow).getCell(pCol)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
          }
          // If the original logical row had two shifts for this date, do NOT merge any subcolumns for the day.
          const pairIndex = i
          const dayHasTwo = Array.isArray(effectiveDayTwoFlags[pairIndex]) ? !!effectiveDayTwoFlags[pairIndex][dIdx] : false
          if (!dayHasTwo) {
            // If a slot is empty on bottom, merge top+bottom for that column to present as single cell
            for (let colOffset = 0; colOffset < subLen; colOffset++) {
              const botVal = String(botArr[startIdx + colOffset] || '').trim()
              const col = startCol + colOffset
              if (!botVal) {
                try {
                  ws.mergeCells(topSheetRow, col, botSheetRow, col)
                  try {
                    const topCell = ws.getRow(topSheetRow).getCell(col)
                    topCell.alignment = { ...topCell.alignment, vertical: 'middle' }
                  }
                  catch {}
                }
                catch {
                  // ignore merge errors
                }
              }
            }
          }
        }
        // Merge summary columns (1..6) vertically for this pair
        for (let c = 1; c <= 6; c++) {
          try {
            ws.mergeCells(topSheetRow, c, botSheetRow, c)
            try {
              const topCell = ws.getRow(topSheetRow).getCell(c)
              topCell.alignment = { ...topCell.alignment, vertical: 'middle' }
            }
            catch {}
          }
          catch {
            // ignore
          }
        }
      }
    }
    catch {}

    // Set Name column width to ~350px (~50 chars)
    try {
      ws.getColumn(1).width = 50
    }
    catch {}

    // Set summary columns (2..6) to ~250px (~36 chars) and ensure vertical centering
    try {
      for (let c = 2; c <= 6; c++) {
        const col = ws.getColumn(c)
        col.width = 36
        col.alignment = { ...col.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
      }
    }
    catch {}

    // Set per-day Shift column widths to ~200px (~28 chars)
    try {
      const subLen = 6
      for (let i = 0; i < days.length; i++) {
        const shiftCol = 6 + i * subLen + 5
        const col = ws.getColumn(shiftCol)
        col.width = 28
        // Ensure wrapText and vertical centering for shift column
        col.alignment = { ...col.alignment, wrapText: true, vertical: 'middle' }
        // Also set wrapText for M,P,T,CP columns for this day
        for (let j = 0; j < 4; j++) {
          // columns start at base+1 (base=6), so add +1 to align with cell indexing used elsewhere
          const cidx = 6 + i * subLen + j + 1
          try {
            const colc = ws.getColumn(cidx)
            // ~22 characters ~= 160px
            colc.width = 22
            colc.alignment = { ...colc.alignment, wrapText: true, vertical: 'middle' }
          }
          catch {}
        }
      }
    }
    catch {}

    // Restore footer merges shifted by inserted rows to prevent duplicated visible text
    try {
      const rowsAdded = 2 + expandedRows.length
      for (const m of mergesBefore) {
        try {
          ws.mergeCells(m.sRow + rowsAdded, m.sCol, m.eRow + rowsAdded, m.eCol)
        }
        catch {}
      }
    }
    catch {}

    // Defensive un-merge pass: if the template had merges that were restored but
    // the logical data for that day indicates two shifts, unmerge the per-day
    // subcolumns (so top/bottom remain separate). This avoids forced merges from
    // the template for two-shift rows (fixes cases like FI9-FI10 being merged).
    try {
      const pairCount = expandedRows.length / 2
      for (let i = 0; i < pairCount; i++) {
        const topSheetRow = insertAt + 2 + i * 2
        const botSheetRow = topSheetRow + 1
        for (let dIdx = 0; dIdx < days.length; dIdx++) {
          const startCol = base + dIdx * subCols.length + 1
          const isTwo = Array.isArray(effectiveDayTwoFlags[i]) ? !!effectiveDayTwoFlags[i][dIdx] : false
          if (!isTwo) continue
          // for each subcolumn for the day, only unmerge top/bottom if the bottom
          // sheet cell actually contains data. This avoids undoing valid merges when
          // the bottom is empty (single-shift days).
          for (let colOffset = 0; colOffset < subCols.length; colOffset++) {
            const col = startCol + colOffset
            try {
              const botCell = ws.getRow(botSheetRow).getCell(col)
              const botVal = (botCell && botCell.value) ? String(botCell.value).trim() : ''
              if (!botVal) continue
              // unMerge using coordinates (startRow, startCol, endRow, endCol)
              ws.unMergeCells(topSheetRow, col, botSheetRow, col)
            }
            catch {}
          }
        }
        // (noop) ket width handled in a dedicated pass below
      }
    }
    catch {}

    // Defensive pass: ensure any per-day subcolumn where the top cell has content
    // and the bottom cell is empty is merged. This covers edge cases where
    // newline normalization produced a top value but for some reason the
    // earlier merge pass did not create the merge record.
    try {
      const subLen = 6
      const pairCount = expandedRows.length / 2
      for (let i = 0; i < pairCount; i++) {
        const topSheetRow = insertAt + 2 + i * 2
        const botSheetRow = topSheetRow + 1
        for (let dIdx = 0; dIdx < days.length; dIdx++) {
          const startCol = base + dIdx * subLen + 1
          // if this logical day is a two-shift day for this pair, skip defensive merges for its subcolumns
          const isTwo = Array.isArray(effectiveDayTwoFlags[i]) ? !!effectiveDayTwoFlags[i][dIdx] : false
          for (let colOffset = 0; colOffset < subLen; colOffset++) {
            const col = startCol + colOffset
            try {
              const topCell = ws.getRow(topSheetRow).getCell(col)
              const botCell = ws.getRow(botSheetRow).getCell(col)
              const botVal = (botCell && botCell.value) ? String(botCell.value).trim() : ''
              // If this is a two-shift day, do not merge subcolumns even if bottom is empty
              if (!isTwo && !botVal) {
                // check whether already part of a merge by inspecting model.merges if available
                let alreadyMerged = false
                try {
                  const addr = `${topCell.address}`
                  const merges = (ws.model && ws.model.merges) ? ws.model.merges : null
                  if (Array.isArray(merges)) {
                    for (const m of merges) {
                      if (typeof m === 'string') {
                        if (m.includes(addr)) {
                          alreadyMerged = true
                          break
                        }
                      }
                    }
                  }
                }
                catch {}
                if (!alreadyMerged) {
                  try {
                    ws.mergeCells(topSheetRow, col, botSheetRow, col)
                  }
                  catch {}
                  try {
                    topCell.alignment = { ...topCell.alignment, vertical: 'middle' }
                  }
                  catch {}
                }
              }
            }
            catch {}
          }
        }
      }
    }
    catch {}

    // Final force-merge pass: ensure that for any logical single-shift day we have top+bottom merged
    try {
      const subLen = subCols.length
      const pairCount = expandedRows.length / 2
      for (let i = 0; i < pairCount; i++) {
        const topSheetRow = insertAt + 2 + i * 2
        const botSheetRow = topSheetRow + 1
        for (let dIdx = 0; dIdx < days.length; dIdx++) {
          const startCol = base + dIdx * subLen + 1
          // Determine whether bottom cell actually contains data. Prefer real sheet content
          // over the dayTwoFlagsList when deciding to merge. If bottom is non-empty, treat
          // it as a genuine second-row value and skip merging for that subcolumn.
          for (let colOffset = 0; colOffset < subLen; colOffset++) {
            const col = startCol + colOffset
            try {
              const botCell = ws.getRow(botSheetRow).getCell(col)
              const botVal = (botCell && botCell.value) ? String(botCell.value).trim() : ''
              // If bottom has content, skip merging to preserve two-row content.
              if (botVal) continue
              // Otherwise, ensure this subcolumn is merged top+bottom.
              try {
                ws.unMergeCells(topSheetRow, col, botSheetRow, col)
              }
              catch {}
              try {
                ws.mergeCells(topSheetRow, col, botSheetRow, col)
              }
              catch {}
            }
            catch {}
          }
        }
      }
    }
    catch {}

    // Append footer from separate template, preserving merges
    try {
      const footerResp = await fetch('/attendance-template-footer.xlsx')
      if (footerResp.ok) {
        const fbuf = await footerResp.arrayBuffer()
        const fwb = new ExcelJS.Workbook()
        await fwb.xlsx.load(fbuf)
        const fws = fwb.worksheets[0]
        if (fws) {
          // baseEndRow should account for header rows (2) + expandedRows length
          const baseEndRow = insertAt + 1 + expandedRows.length
          // leave 3 empty rows then footer
          const startRow = baseEndRow + 1 + 3
          // Collect merges from footer and use to avoid duplicate visible content
          const footerMerges: Array<{ sRow: number, sCol: number, eRow: number, eCol: number }> = []
          try {
            const colToNum = (s: string) => s.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0)
            const parseKey = (key: string) => {
              const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(key)
              if (!m) return
              footerMerges.push({
                sRow: Number.parseInt(m[2]!),
                sCol: colToNum(m[1]!),
                eRow: Number.parseInt(m[4]!),
                eCol: colToNum(m[3]!),
              })
            }
            // Prefer model.merges if present
            const modelMerges: string[] | undefined = (fws as any)?.model?.merges
            if (Array.isArray(modelMerges) && modelMerges.length) {
              for (const addr of modelMerges) parseKey(addr)
            }
            else {
              const mm2 = (fws as any)._merges
              if (mm2) {
                if (typeof mm2.forEach === 'function') {
                  mm2.forEach((v: any, k: any) => {
                    const key = typeof k === 'string' ? k : (v && v.shortAddress ? v.shortAddress : null)
                    if (key) parseKey(key)
                  })
                }
                else {
                  for (const key of Object.keys(mm2)) parseKey(key)
                }
              }
            }
          }
          catch {}

          const findMerge = (r: number, c: number) => footerMerges.find(m => r >= m.sRow && r <= m.eRow && c >= m.sCol && c <= m.eCol)

          // Copy cell values and basic styles (write value only to top-left of merged range)
          fws.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
            const targetRow = ws.getRow(startRow + rowNumber - 1)
            targetRow.height = 24
            row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
              // Shift footer content to start at column B to avoid freezing into column A
              const tcell = targetRow.getCell(colNumber + 1)
              const merge = findMerge(rowNumber, colNumber)
              if (merge && !(rowNumber === merge.sRow && colNumber === merge.sCol)) {
                tcell.value = null
              }
              else {
                tcell.value = cell.value
              }
              if (cell.font) tcell.font = { ...cell.font }
              tcell.alignment = { ...cell.alignment, vertical: 'middle' }
              if (cell.border) tcell.border = { ...cell.border }
              if (cell.fill) tcell.fill = { ...cell.fill }
              if ((cell as any).numFmt) (tcell as any).numFmt = (cell as any).numFmt
            })
          })
          // Recreate merges from footer with row offset and column shift (+1)
          try {
            const rDelta = startRow - 1
            for (const m of footerMerges) {
              try {
                ws.mergeCells(m.sRow + rDelta, m.sCol + 1, m.eRow + rDelta, m.eCol + 1)
              }
              catch {}
            }
          }
          catch {}
        }
      }
    }
    catch {}

    // Merge B1..B3 to the last column, center text, and set B3 to MONTH - YEAR
    try {
      const lastCol = ws.columnCount
      for (const r of [1, 2, 3]) {
        try {
          ws.mergeCells(r, 2, r, lastCol)
        }
        catch {}
        const cell = ws.getCell(r, 2)
        cell.alignment = { ...cell.alignment, horizontal: 'center', vertical: 'middle' }
      }
      // Fill B3 with Month - Year (capitalized)
      try {
        const dt = new Date(`${month.value}-01T00:00:00`)
        const mname = dt.toLocaleString([], { month: 'long' })
        ws.getCell(3, 2).value = `${mname} - ${dt.getFullYear()}`.toUpperCase()
      }
      catch {}
    }
    catch {}

    // Reapply horizontal centering for day group headers and subheaders (fixes day labels alignment)
    try {
      const headerCols = headerRow1.length || ws.columnCount
      // Center each merged day label (top header row) by targeting its start column
      for (let i = 0; i < days.length; i++) {
        try {
          const start = base + i * subCols.length + 1
          const topCell = ws.getCell(insertAt, start)
          topCell.alignment = { ...topCell.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
        }
        catch {}
      }
      // Ensure subheaders (second header row) are centered as well
      for (let c = 1; c <= headerCols; c++) {
        try {
          const sub = ws.getCell(insertAt + 1, c)
          sub.alignment = { ...sub.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
        }
        catch {}
      }
    }
    catch {}

    // Download
    const out = await wb.xlsx.writeBuffer()
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `attendance-${month.value}.xlsx`
    a.click()
    URL.revokeObjectURL(a.href)
    return
  }
  catch {}

  // Fallback: build workbook with header + styles
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Attendance', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }],
  })
  const { headerRow1, headerRow2, subCols, days } = buildHeaderAoA()
  ws.addRow(headerRow1)
  ws.addRow(headerRow2)
  // Robust pass (fallback): find 'Ket' subheaders in header rows (1 and 2) and set their width to 50
  try {
    const headerRows = [1, 2]
    for (const hrNum of headerRows) {
      try {
        const hr = ws.getRow(hrNum)
        for (let c = 1; c <= ws.columnCount; c++) {
          try {
            const v = hr.getCell(c).value
            if (v && String(v).trim().toLowerCase() === 'ket') {
              const col = ws.getColumn(c)
              col.width = 50
              col.alignment = { ...col.alignment, wrapText: true, vertical: 'middle' }
            }
          }
          catch {}
        }
      }
      catch {}
    }
  }
  catch {}
  const dataRows = buildDataAoA()

  // Expand data rows into top/bottom physical rows (same behavior as template branch)
  const expandedRows: any[] = []
  const dayTwoFlagsList: boolean[][] = []
  for (const r of (dataRows || [])) {
    const dayTwoFlags: boolean[] = []
    const top: any[] = []
    const bot: any[] = []
    // summary columns (1..6)
    for (let c = 0; c < 6; c++) {
      top.push(r[c])
      bot.push('')
    }
    // per-day subcolumns
    const dayCount = days.length
    const subLen = subCols.length
    for (let d = 0; d < dayCount; d++) {
      const start = 6 + d * subLen
      let dayHasTwo = false
      for (let s = 0; s < subLen; s++) {
        const raw = r[start + s]
        if (raw == null || String(raw).trim() === '') {
          top.push('')
          bot.push('')
          continue
        }
        const parts = String(raw).split(/\r?\n/).map(p => String(p ?? '').trim())
        // Normalize cases where the string is '\nvalue' (leading empty top) into a single top value
        if (parts.length > 1 && parts[0] === '' && parts[1]) {
          top.push(parts[1])
          bot.push('')
        }
        else if (parts.length === 1) {
          top.push(parts[0])
          bot.push('')
        }
        else {
          if (parts.length > 1) dayHasTwo = true
          top.push(parts[0])
          bot.push(parts[1] ?? '')
        }
      }
      dayTwoFlags.push(dayHasTwo)
    }
    dayTwoFlagsList.push(dayTwoFlags)
    expandedRows.push(top, bot)
  }

  if (expandedRows.length)
    ws.addRows(expandedRows)

  // Sanitization pass for fallback: remove any non-time lines from P columns
  try {
    const pairCount = expandedRows.length / 2
    const subLen = subCols.length
    for (let i = 0; i < pairCount; i++) {
      const topSheetRow = 3 + i * 2
      const botSheetRow = topSheetRow + 1
      for (let dIdx = 0; dIdx < days.length; dIdx++) {
        const localBase = 6
        const startCol = localBase + dIdx * subLen + 1
        const pCol = startCol + 1
        for (const rr of [topSheetRow, botSheetRow]) {
          try {
            const cell = ws.getRow(rr).getCell(pCol)
            const raw = (cell && cell.value) ? String(cell.value) : ''
            if (!raw) continue
            const parts = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
            const timeParts = parts.filter(p => /^\d{1,2}:\d{2}$/.test(p))
            const final = timeParts.join('\n')
            if (final !== raw) cell.value = final
          }
          catch {}
        }
      }
    }
  }
  catch {}

  // Merge day group headers
  const base = 6
  for (let i = 0; i < days.length; i++) {
    const start = base + i * subCols.length + 1
    const end = start + subCols.length - 1
    ws.mergeCells(1, start, 1, end)
  }
  // Ensure headers are centered
  try {
    const headerCols = headerRow1.length || ws.columnCount
    for (let c = 1; c <= headerCols; c++) {
      try {
        const h1 = ws.getCell(1, c)
        h1.alignment = { ...h1.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
      }
      catch {}
      try {
        const h2 = ws.getCell(2, c)
        h2.alignment = { ...h2.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
      }
      catch {}
    }
  }
  catch {}
  // Style headers
  for (const r of [1, 2]) {
    const row = ws.getRow(r)
    row.height = 24
    row.eachCell((cell: any) => {
      cell.font = { ...cell.font, bold: true }
      cell.alignment = { ...cell.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      }
    })
  }

  // Style data rows and ensure vertical centering
  const dataCount = expandedRows.length
  const endDataRow = 2 + dataCount
  for (let rr = 3; rr <= endDataRow; rr++) {
    const row = ws.getRow(rr)
    row.height = 36
    row.eachCell((cell: any) => {
      cell.font = { name: 'Arial', size: 12, ...cell.font }
      cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true }
      cell.border = cell.border || {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      }
    })
  }

  // Ensure summary columns (1..6) are vertically centered for all data rows
  try {
    for (let rr = 3; rr <= endDataRow; rr++) {
      const row = ws.getRow(rr)
      for (let c = 1; c <= 6; c++) {
        try {
          const cell = row.getCell(c)
          cell.alignment = { ...cell.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
        }
        catch {}
      }
    }
  }
  catch {}

  // Highlight M/P per slot and merge empty bottoms (per-day) and merge summary columns per pair
  try {
    const subLen = 6
    const pairCount = expandedRows.length / 2
    for (let i = 0; i < pairCount; i++) {
      const topSheetRow = 3 + i * 2
      const botSheetRow = topSheetRow + 1
      const topArr = expandedRows[i * 2] || []
      const botArr = expandedRows[i * 2 + 1] || []
      for (let dIdx = 0; dIdx < days.length; dIdx++) {
        const startIdx = 6 + dIdx * subLen
        const startCol = base + dIdx * subLen + 1
        const mCol = startCol + 0
        const pCol = startCol + 1
        // top slot
        const topT = String(topArr[startIdx + 2] || '').trim()
        const topCp = String(topArr[startIdx + 3] || '').trim()
        if (topT && topT !== '0m') {
          const cell = ws.getRow(topSheetRow).getCell(mCol)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        }
        if (topCp && topCp !== '0m') {
          const cell = ws.getRow(topSheetRow).getCell(pCol)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        }
        // bottom slot
        const botT = String(botArr[startIdx + 2] || '').trim()
        const botCp = String(botArr[startIdx + 3] || '').trim()
        if (botT && botT !== '0m') {
          const cell = ws.getRow(botSheetRow).getCell(mCol)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        }
        if (botCp && botCp !== '0m') {
          const cell = ws.getRow(botSheetRow).getCell(pCol)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        }
        const pairIndex = i
        const dayHasTwo = Array.isArray(dayTwoFlagsList[pairIndex]) ? !!dayTwoFlagsList[pairIndex][dIdx] : false
        if (!dayHasTwo) {
          for (let colOffset = 0; colOffset < subLen; colOffset++) {
            const botVal = String(botArr[startIdx + colOffset] || '').trim()
            const col = startCol + colOffset
            if (!botVal) {
              try {
                ws.mergeCells(topSheetRow, col, botSheetRow, col)
                try {
                  const topCell = ws.getRow(topSheetRow).getCell(col)
                  topCell.alignment = { ...topCell.alignment, vertical: 'middle' }
                }
                catch {}
              }
              catch {
                // ignore
              }
            }
          }
        }
      }
      // Merge summary columns (1..6) vertically for this pair
      for (let c = 1; c <= 6; c++) {
        try {
          // Ensure both top and bottom cells are centered before merging to avoid visual misalignment
          try {
            const tRow = ws.getRow(topSheetRow)
            const bRow = ws.getRow(botSheetRow)
            const tc = tRow.getCell(c)
            const bc = bRow.getCell(c)
            tc.alignment = { ...tc.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
            bc.alignment = { ...bc.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
          }
          catch {}
          ws.mergeCells(topSheetRow, c, botSheetRow, c)
          try {
            const topCell = ws.getRow(topSheetRow).getCell(c)
            topCell.alignment = { ...topCell.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
          }
          catch {}
        }
        catch {
          // ignore
        }
      }
    }
  }
  catch {}

  // Defensive post-pass for fallback: ensure per-day subcolumns where top has content
  // and bottom is empty are merged. This ensures consistent appearance regardless
  // of earlier normalization edge cases.
  try {
    const subLen = 6
    const pairCount = expandedRows.length / 2
    for (let i = 0; i < pairCount; i++) {
      const topSheetRow = 3 + i * 2
      const botSheetRow = topSheetRow + 1
      for (let dIdx = 0; dIdx < days.length; dIdx++) {
        const startCol = base + dIdx * subLen + 1
        for (let colOffset = 0; colOffset < subLen; colOffset++) {
          const col = startCol + colOffset
          try {
            const topCell = ws.getRow(topSheetRow).getCell(col)
            const botCell = ws.getRow(botSheetRow).getCell(col)
            const botVal = (botCell && botCell.value) ? String(botCell.value).trim() : ''
            // if this logical day is a two-shift day for this pair, skip defensive merges for its subcolumns
            const isTwo = Array.isArray(dayTwoFlagsList[i]) ? !!dayTwoFlagsList[i][dIdx] : false
            if (!isTwo && !botVal) {
              let alreadyMerged = false
              try {
                const addr = `${topCell.address}`
                const merges = (ws.model && ws.model.merges) ? ws.model.merges : null
                if (Array.isArray(merges)) {
                  for (const m of merges) {
                    if (typeof m === 'string') {
                      if (m.includes(addr)) {
                        alreadyMerged = true
                        break
                      }
                    }
                  }
                }
              }
              catch {}
              if (!alreadyMerged) {
                try {
                  ws.mergeCells(topSheetRow, col, botSheetRow, col)
                }
                catch {}
                try {
                  topCell.alignment = { ...topCell.alignment, vertical: 'middle' }
                }
                catch {}
              }
            }
          }
          catch {}
        }
      }
    }
  }
  catch {}

  // Column widths
  try {
    const colCount = ws.columnCount
    // Name ~50 chars (~350px)
    ws.getColumn(1).width = 50
    // Summary columns 2..6 ~36 chars (~250px) and ensure vertical centering
    for (let c = 2; c <= 6; c++) {
      try {
        const col = ws.getColumn(c)
        col.width = 36
        col.alignment = { ...col.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
      }
      catch {}
    }
    // Day columns default to 12-10 chars
    for (let c = 7; c <= colCount; c++) ws.getColumn(c).width = 12
    // Per-day Shift column ~28 chars (~200px)
    const subLen2 = 6
    for (let i = 0; i < days.length; i++) {
      const baseIdx = 6 + i * subLen2
      // M, P, T, CP
      for (let j = 0; j < 4; j++) {
        try {
          // baseIdx is 6 + i*subLen2; cells start at 1 so shift by +1 to match getColumn indexes used elsewhere
          const cidx = baseIdx + j + 1
          const colc = ws.getColumn(cidx)
          colc.width = 22
          colc.alignment = { ...colc.alignment, wrapText: true, vertical: 'middle' }
        }
        catch {}
      }
      // Shift column
      try {
        const shiftCol = baseIdx + 4
        const sc = ws.getColumn(shiftCol)
        sc.width = 28
        sc.alignment = { ...sc.alignment, wrapText: true, vertical: 'middle' }
      }
      catch {}
      // Ket column (~350px), approximate width in characters
      try {
        const ketCol = baseIdx + 5
        const kc = ws.getColumn(ketCol)
        // ~50 chars approximates 350px in Excel column width units
        kc.width = 50
        kc.alignment = { ...kc.alignment, wrapText: true, vertical: 'middle' }
      }
      catch {}
    }
  }
  catch {}

  // Merge B1..B3 to the last column, center text, and set B3 to MONTH - YEAR
  try {
    const lastCol = ws.columnCount
    for (const r of [1, 2, 3]) {
      try {
        ws.mergeCells(r, 2, r, lastCol)
      }
      catch {}
      const cell = ws.getCell(r, 2)
      cell.alignment = { ...cell.alignment, horizontal: 'center', vertical: 'middle' }
    }
    try {
      const dt = new Date(`${month.value}-01T00:00:00`)
      const mname = dt.toLocaleString([], { month: 'long' })
      ws.getCell(3, 2).value = `${mname} - ${dt.getFullYear()}`.toUpperCase()
    }
    catch {}

    // Final force-merge pass (fallback): ensure single-shift days' subcolumns are merged top+bottom
    try {
      const subLen = 6
      const pairCount = expandedRows.length / 2
      for (let i = 0; i < pairCount; i++) {
        const topSheetRow = 3 + i * 2
        const botSheetRow = topSheetRow + 1
        for (let dIdx = 0; dIdx < days.length; dIdx++) {
          const startCol = base + dIdx * subLen + 1
          const isTwo = Array.isArray(dayTwoFlagsList[i]) ? !!dayTwoFlagsList[i][dIdx] : false
          if (isTwo) continue
          for (let colOffset = 0; colOffset < subLen; colOffset++) {
            const col = startCol + colOffset
            try {
              const botCell = ws.getRow(botSheetRow).getCell(col)
              const botVal = (botCell && botCell.value) ? String(botCell.value).trim() : ''
              if (!botVal) {
                try {
                  ws.unMergeCells(topSheetRow, col, botSheetRow, col)
                }
                catch {}
                try {
                  ws.mergeCells(topSheetRow, col, botSheetRow, col)
                }
                catch {}
              }
            }
            catch {}
          }
        }
      }
    }
    catch {}
  }
  catch {}

  // Reapply horizontal centering for day group headers and subheaders in fallback
  try {
    const headerCols = headerRow1.length || ws.columnCount
    for (let i = 0; i < days.length; i++) {
      try {
        const start = base + i * subCols.length + 1
        const topCell = ws.getCell(1, start)
        topCell.alignment = { ...topCell.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
      }
      catch {}
    }
    for (let c = 1; c <= headerCols; c++) {
      try {
        const sub = ws.getCell(2, c)
        sub.alignment = { ...sub.alignment, horizontal: 'center', vertical: 'middle', wrapText: true }
      }
      catch {}
    }
  }
  catch {}

  // No footer in fallback (generated) mode by request

  const out = await wb.xlsx.writeBuffer()
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `attendance-${month.value}.xlsx`
  a.click()
  URL.revokeObjectURL(a.href)
}

const isExporting = ref(false)

async function exportXlsx() {
  if (process.server)
    return
  try {
    if (isExporting.value)
      return
    isExporting.value = true
    await exportWithExcelJS()
    toast.add({
      title: 'Export Successful',
      description: 'The attendance data has been exported successfully.',
      color: 'success',
    })
  }
  catch (e) {
    console.error(e)
    toast.add({
      title: 'Export Failed',
      description: (e instanceof Error) ? e.message : 'An unknown error occurred during export.',
      color: 'error',
    })
  }
  finally {
    isExporting.value = false
  }
}

definePageMeta({
  title: 'Attendance',
  pageTitle: 'Attendance - Admin - Attendance App',
})
</script>

<template>
  <PageWrapper>
    <template #navLeft>
      <UTabs
        v-model="activeType"
        :content="false"
        :items="type"
        class="w-full ml-2"
        size="sm"
      />
    </template>
    <template #navRight>
      <div class="flex items-center gap-3">
        <USelect
          v-model="month"
          class="w-50"
          :items="monthOptions"
          option-attribute="label"
          value-attribute="value"
        />

        <UButton
          icon="i-heroicons-arrow-path"
          variant="soft"
          :loading="status === 'pending'"
          @click="onRefresh"
        >
          Refresh
        </UButton>
        <UButton
          icon="i-heroicons-arrow-down-tray"
          :disabled="(data?.days || []).length === 0 || status === 'pending'"
          @click="exportXlsx"
        >
          Export
        </UButton>
      </div>
    </template>
    <AttendanceGrid v-if="activeType === 'grid'" :data="data" :loading="status === 'pending'" />
    <AttendanceTable v-else :data="data" :loading="status === 'pending'" />
  </PageWrapper>
</template>
