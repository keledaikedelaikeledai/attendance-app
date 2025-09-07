<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { createColumnHelper } from '@tanstack/vue-table'
import { h, onMounted } from 'vue'

const month = ref<string>(new Date().toISOString().slice(0, 7)) // YYYY-MM

const { data, refresh, status, pending } = await useFetch('/api/admin/attendance', {
  query: { month },
  credentials: 'include',
})

const attendances = computed(() => data.value?.rows || [])

function computeShiftStart(ciIso?: string, def?: { start: string, end: string }) {
  if (!ciIso || !def)
    return null
  const d = new Date(ciIso)
  const [shStr, smStr] = (def.start || '').split(':')
  const [ehStr, emStr] = (def.end || '').split(':')
  const sh = Number(shStr)
  const sm = Number(smStr)
  const eh = Number(ehStr)
  const em = Number(emStr)
  if ([sh, sm, eh, em].some(n => Number.isNaN(n)))
    return null
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

function humanizeMinutes(ms: number) {
  if (!ms)
    return '0m'
  const total = Math.ceil(ms / 60000)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

function shiftTypeLabel(t?: 'harian' | 'bantuan') {
  if (!t)
    return '-'
  return t === 'bantuan' ? 'Shift Bantuan' : 'Shift Harian'
}

function dayLateMs(cell: any) {
  if (!cell?.clockIn)
    return 0
  if (typeof cell?.lateMs === 'number')
    return cell.lateMs
  const start = computeShiftStart(cell.clockIn, cell.shift)
  if (!start)
    return 0
  const diff = new Date(cell.clockIn).getTime() - start.getTime()
  return Math.max(0, diff)
}

function dayEarlyMs(cell: any) {
  if (!cell?.clockOut || !cell?.shift)
    return 0
  const start = computeShiftStart(cell.clockIn || cell.clockOut, cell.shift)
  if (!start)
    return 0
  const [ehStr, emStr] = (cell.shift.end || '').split(':')
  const eh = Number(ehStr)
  const em = Number(emStr)
  if (Number.isNaN(eh) || Number.isNaN(em))
    return 0
  const [shStr, smStr] = (cell.shift.start || '').split(':')
  const sh = Number(shStr)
  const sm = Number(smStr)
  const crosses = (sh * 60 + sm) > (eh * 60 + em)
  const end = new Date(start)
  if (crosses)
    end.setDate(end.getDate() + 1)
  end.setHours(eh, em, 0, 0)
  const co = new Date(cell.clockOut)
  const diff = end.getTime() - co.getTime()
  return Math.max(0, diff)
}

const columnHelper = createColumnHelper<typeof attendances.value[0]>()

const columns = computed(() => {
  if (!data.value)
    return []

  function summarizeRow(row: any) {
    const cells: any[] = Object.values(row?.byDate || {})
    const workingDays = cells.filter(c => c?.clockIn).length
    const harian = cells.filter(c => c?.clockIn && c?.shiftType === 'harian').length
    const bantuan = cells.filter(c => c?.clockIn && c?.shiftType === 'bantuan').length
    const lateMs = cells.reduce((acc, c) => {
      if (!c?.clockIn)
        return acc
      if (typeof c?.lateMs === 'number')
        return acc + c.lateMs
      const start = computeShiftStart(c.clockIn, c.shift)
      if (!start)
        return acc
      const diff = new Date(c.clockIn).getTime() - start.getTime()
      return acc + Math.max(0, diff)
    }, 0)
    const earlyMs = cells.reduce((acc, c) => {
      if (!c?.clockOut || !c?.shift)
        return acc
      const start = computeShiftStart(c.clockIn || c.clockOut, c.shift)
      if (!start)
        return acc
      const [shStr, smStr] = (c.shift.start || '').split(':')
      const [ehStr, emStr] = (c.shift.end || '').split(':')
      const sh = Number(shStr)
      const sm = Number(smStr)
      const eh = Number(ehStr)
      const em = Number(emStr)
      if ([sh, sm, eh, em].some(n => Number.isNaN(n)))
        return acc
      const startMin = sh * 60 + sm
      const endMin = eh * 60 + em
      const crosses = startMin > endMin
      const end = new Date(start)
      if (crosses)
        end.setDate(end.getDate() + 1)
      end.setHours(eh, em, 0, 0)
      const co = new Date(c.clockOut)
      const diff = end.getTime() - co.getTime()
      return acc + Math.max(0, diff)
    }, 0)
    return { workingDays, harian, bantuan, lateMs, earlyMs }
  }

  const baseCols = [
    columnHelper.accessor('name', {
      header: 'Nama',
      cell: info => info.getValue() || info.row.original.username || info.row.original.email || 'N/A',
      size: 200,
    }),
    columnHelper.display({
      id: 'working-days',
      header: () => h('div', { class: 'text-center w-[120px]' }, 'Hari Kerja'),
      cell: (info) => {
        const s = summarizeRow(info.row.original)
        return h('div', { class: 'text-center w-[120px]' }, String(s.workingDays))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
    columnHelper.display({
      id: 'shift-harian',
      header: () => h('div', { class: 'text-center w-[120px]' }, 'Shift Harian'),
      cell: (info) => {
        const s = summarizeRow(info.row.original)
        return h('div', { class: 'text-center w-[120px]' }, String(s.harian))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
    columnHelper.display({
      id: 'shift-bantuan',
      header: () => h('div', { class: 'text-center w-[120px]' }, 'Shift Bantuan'),
      cell: (info) => {
        const s = summarizeRow(info.row.original)
        return h('div', { class: 'text-center w-[120px]' }, String(s.bantuan))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
    columnHelper.display({
      id: 'late-hours',
      header: () => h('div', { class: 'text-center w-[120px]' }, 'Keterlambatan'),
      cell: (info) => {
        const s = summarizeRow(info.row.original)
        return h('div', { class: 'text-center w-[120px]' }, humanizeMinutes(s.lateMs))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
    columnHelper.display({
      id: 'early-hours',
      header: () => h('div', { class: 'text-center w-[120px]' }, 'Cepat Pulang'),
      cell: (info) => {
        const s = summarizeRow(info.row.original)
        return h('div', { class: 'text-center w-[120px]' }, humanizeMinutes(s.earlyMs))
      },
      size: 120,
    }) as unknown as TableColumn<typeof attendances.value[0]>,
  ]

  const dayCols = data.value.days.map(day =>
    columnHelper.group({
      id: `day-${day}`,
      header: () => h('div', { class: 'text-center' }, day.slice(-2)),
      columns: [
        columnHelper.accessor((row: any) => row?.byDate?.[day]?.clockIn as string | undefined, {
          id: `in-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'M'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            const isLate = dayLateMs(cell) > 0
            const cls = `text-center w-[120px] ${isLate ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded' : ''}`
            return h('div', { class: cls }, formatTime(cell?.clockIn))
          },
          size: 120,
        }),
        columnHelper.accessor((row: any) => row?.byDate?.[day]?.clockOut as string | undefined, {
          id: `out-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'P'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            const isEarly = dayEarlyMs(cell) > 0
            const cls = `text-center w-[120px] ${isEarly ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded' : ''}`
            return h('div', { class: cls }, formatTime(cell?.clockOut))
          },
          size: 120,
        }),
        columnHelper.display({
          id: `late-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'T'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            return h('div', { class: 'text-center w-[120px]' }, humanizeMinutes(dayLateMs(cell)))
          },
          size: 120,
        }) as unknown as TableColumn<typeof attendances.value[0]>,
        columnHelper.display({
          id: `early-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'CP'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            return h('div', { class: 'text-center w-[120px]' }, humanizeMinutes(dayEarlyMs(cell)))
          },
          size: 120,
        }) as unknown as TableColumn<typeof attendances.value[0]>,
        columnHelper.display({
          id: `shift-${day}`,
          header: () => h('div', { class: 'text-center w-[120px]' }, 'Shift'),
          cell: (info) => {
            const cell = (info.row.original as any)?.byDate?.[day]
            return h('div', { class: 'text-center w-[120px]' }, shiftTypeLabel(cell?.shiftType))
          },
          size: 120,
        }) as unknown as TableColumn<typeof attendances.value[0]>,
      ],
    }) as unknown as TableColumn<typeof attendances.value[0]>,
  )
  return [...baseCols, ...dayCols] as TableColumn<typeof attendances.value[0]>[]
})

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

function toDateLabel(iso?: string) {
  if (!iso)
    return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function buildDataAoA() {
  const days = data.value?.days || []
  const rows: any[][] = []
  for (const r of attendances.value as any[]) {
    const byDate = (r?.byDate) || {}
    const cells: any[] = Object.values(byDate)
    const workingDays = cells.filter(c => c?.clockIn).length
    const harian = cells.filter(c => c?.clockIn && c?.shiftType === 'harian').length
    const bantuan = cells.filter(c => c?.clockIn && c?.shiftType === 'bantuan').length
    const totalLate = cells.reduce((acc, c) => acc + (dayLateMs(c) || 0), 0)
    const totalEarly = cells.reduce((acc, c) => acc + (dayEarlyMs(c) || 0), 0)

    const row: any[] = [
      r.name || r.username || r.email || 'N/A',
      workingDays,
      harian,
      bantuan,
      humanizeMinutes(totalLate),
      humanizeMinutes(totalEarly),
    ]
    for (const day of days) {
      const c = byDate[day] || {}
      row.push(
        toDateLabel(c.clockIn),
        toDateLabel(c.clockOut),
        humanizeMinutes(dayLateMs(c)),
        humanizeMinutes(dayEarlyMs(c)),
        c?.shiftType === 'bantuan' ? 'Shift Bantuan' : (c?.shiftType ? 'Shift Harian' : '-'),
      )
    }
    rows.push(row)
  }
  return rows
}

// SheetJS path removed in favor of ExcelJS for style fidelity

// ExcelJS-based exporter for better style fidelity
async function getExcelJS() {
  if (process.server)
    throw new Error('ExcelJS is client-only')
  const mod: any = await import('exceljs')
  return mod?.default ?? mod
}

function buildHeaderAoA() {
  const subCols = ['M', 'P', 'T', 'CP', 'Shift']
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

    const rows = buildDataAoA()
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

    ws.spliceRows(insertAt, 0, headerRow1, headerRow2, ...(rows || []))

    // Merge headers: base columns vertically and day groups horizontally
    const base = 6
    for (let c = 1; c <= base; c++) ws.mergeCells(insertAt, c, insertAt + 1, c)
    for (let i = 0; i < days.length; i++) {
      const start = base + i * subCols.length + 1
      const end = start + subCols.length - 1
      ws.mergeCells(insertAt, start, insertAt, end)
    }

    // Style header rows (insertAt and insertAt+1)
    for (const r of [insertAt, insertAt + 1]) {
      const row = ws.getRow(r)
      row.height = 24
      row.eachCell((cell: any) => {
        cell.font = { name: 'Arial', size: 12, bold: true, ...cell.font }
        cell.alignment = { ...cell.alignment, horizontal: 'center', vertical: 'middle' }
        cell.border = cell.border || {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        }
      })
    }

    // Light borders + vertical centering for data rows (if any), without disturbing template styles
    const dataCount = rows.length
    const endDataRow = insertAt + 1 + dataCount
    for (let r = insertAt + 2; r <= endDataRow; r++) {
      const row = ws.getRow(r)
      row.height = 24
      row.eachCell((cell: any) => {
        cell.font = { name: 'Arial', size: 12, ...cell.font }
        cell.alignment = { ...cell.alignment, vertical: 'middle' }
        cell.border = cell.border || {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        }
      })
    }

    // Highlight M if T != '0m' and P if CP != '0m' for each date
    try {
      const base = 6
      const subLen = 5
      for (let i = 0; i < rows.length; i++) {
        const sheetRow = insertAt + 2 + i
        const rowArr = rows[i]
        for (let dIdx = 0; dIdx < days.length; dIdx++) {
          const startIdx = 6 + dIdx * subLen
          const tVal = rowArr[startIdx + 2]
          const cpVal = rowArr[startIdx + 3]
          const startCol = base + dIdx * subLen + 1
          const mCol = startCol + 0
          const pCol = startCol + 1
          if (tVal && String(tVal).trim() !== '0m') {
            const cell = ws.getRow(sheetRow).getCell(mCol)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
          }
          if (cpVal && String(cpVal).trim() !== '0m') {
            const cell = ws.getRow(sheetRow).getCell(pCol)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
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

    // Set summary columns (2..6) to ~250px (~36 chars)
    try {
      for (let c = 2; c <= 6; c++) ws.getColumn(c).width = 36
    }
    catch {}

    // Set per-day Shift column widths to ~200px (~28 chars)
    try {
      const subLen = 5
      for (let i = 0; i < days.length; i++) {
        const shiftCol = 6 + i * subLen + 5
        ws.getColumn(shiftCol).width = 28
      }
    }
    catch {}

    // Restore footer merges shifted by inserted rows to prevent duplicated visible text
    try {
      const rowsAdded = 2 + rows.length
      for (const m of mergesBefore) {
        try {
          ws.mergeCells(m.sRow + rowsAdded, m.sCol, m.eRow + rowsAdded, m.eCol)
        }
        catch {}
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
          const baseEndRow = (insertAt + 1 + rows.length)
          const startRow = baseEndRow + 1 + 3 // 3 empty rows then footer
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
              const tcell = targetRow.getCell(colNumber)
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
          // Recreate merges from footer with row offset
          try {
            const rDelta = startRow - 1
            for (const m of footerMerges) {
              try {
                ws.mergeCells(m.sRow + rDelta, m.sCol, m.eRow + rDelta, m.eCol)
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
  const dataRows = buildDataAoA()
  if (dataRows.length)
    ws.addRows(dataRows)

  // Merge day group headers
  const base = 6
  for (let i = 0; i < days.length; i++) {
    const start = base + i * subCols.length + 1
    const end = start + subCols.length - 1
    ws.mergeCells(1, start, 1, end)
  }
  // Style headers
  for (const r of [1, 2]) {
    const row = ws.getRow(r)
    row.height = 24
    row.eachCell((cell: any) => {
      cell.font = { ...cell.font, bold: true }
      cell.alignment = { ...cell.alignment, horizontal: 'center', vertical: 'middle' }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      }
    })
  }
  // Borders for all data cells
  for (let r = 3; r < 3 + dataRows.length; r++) {
    const row = ws.getRow(r)
    row.height = 24
    row.eachCell((cell: any) => {
      cell.alignment = { ...cell.alignment, vertical: 'middle' }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      }
    })
  }

  // Highlight M if T != '0m' and P if CP != '0m' for each date (fallback)
  try {
    const base = 6
    const subLen = 5
    for (let i = 0; i < dataRows.length; i++) {
      const sheetRow = 3 + i
      const rowArr = dataRows[i]
      for (let dIdx = 0; dIdx < days.length; dIdx++) {
        const startIdx = 6 + dIdx * subLen
        const tVal = rowArr[startIdx + 2]
        const cpVal = rowArr[startIdx + 3]
        const startCol = base + dIdx * subLen + 1
        const mCol = startCol + 0
        const pCol = startCol + 1
        if (tVal && String(tVal).trim() !== '0m') {
          const cell = ws.getRow(sheetRow).getCell(mCol)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        }
        if (cpVal && String(cpVal).trim() !== '0m') {
          const cell = ws.getRow(sheetRow).getCell(pCol)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
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
    // Summary columns 2..6 ~36 chars (~250px)
    for (let c = 2; c <= 6; c++) ws.getColumn(c).width = 36
    // Day columns default to 12-10 chars
    for (let c = 7; c <= colCount; c++) ws.getColumn(c).width = 12
    // Per-day Shift column ~28 chars (~200px)
    const subLen = 5
    for (let i = 0; i < days.length; i++) {
      const shiftCol = 6 + i * subLen + 5
      ws.getColumn(shiftCol).width = 28
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

// Legacy SheetJS builder removed

async function exportXlsx() {
  if (process.server)
    return
  await exportWithExcelJS()
}

function formatTime(iso?: string) {
  if (!iso)
    return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

definePageMeta({
  title: 'Attendance',
  pageTitle: 'Attendance - Admin - Attendance App',
})

onMounted(() => {})
</script>

<template>
  <PageWrapper>
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
          variant="outline"
          @click="exportXlsx"
        >
          Export XLSX
        </UButton>
      </div>
    </template>
    <div v-if="!pending">
      <u-table
        :data="attendances"
        :columns="columns"
        :ui="{
          th: 'border-b border-r border-gray-200 dark:border-gray-800 last:border-r-0',
          td: 'border-r border-gray-200 dark:border-gray-800 last:border-r-0',
        }"
      />
    </div>
  </PageWrapper>
</template>
