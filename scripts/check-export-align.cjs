#!/usr/bin/env node
// Small helper to inspect an exported attendance XLSX and verify vertical alignment
// for per-day subcolumns (M, P, T, CP, Shift).
// Usage: node scripts/check-export-align.js /path/to/attendance-YYYY-MM.xlsx

const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    console.error('Usage: node scripts/check-export-align.js /path/to/file.xlsx')
    process.exit(2)
  }
  const file = argv[0]
  if (!fs.existsSync(file)) {
    console.error('File not found:', file)
    process.exit(2)
  }

  let ExcelJS
  try {
    ExcelJS = require('exceljs')
  }
  catch (e) {
    console.error('exceljs is required. Install with: npm install --no-save exceljs')
    process.exit(2)
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]
  if (!ws) {
    console.error('No worksheet found')
    process.exit(2)
  }

  // Search the first 10 rows for header cells that equal 'CP' (subheader row)
  const cpPositions = [] // {row, col}
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= row.cellCount; c++) {
      const cell = row.getCell(c)
      const val = cell.value
      if (val != null && String(val).trim().toUpperCase() === 'CP') {
        cpPositions.push({ row: r, col: c })
      }
    }
  }

  if (cpPositions.length === 0) {
    console.error('No CP header cells found in the first 10 rows. Are you passing the right file?')
    process.exit(1)
  }

  console.log(`Found ${cpPositions.length} CP columns at:`, cpPositions.map(p => `${p.row}:${p.col}`).join(', '))

  const problems = []

  function checkCellAlignment(cell, expected = 'middle') {
    if (!cell) return false
    const a = cell.alignment
    if (!a) return false
    return String(a.vertical || '').toLowerCase() === String(expected).toLowerCase()
  }

  // For every CP position, also check nearby M,P,T (col-3..col-1), CP (col), Shift (col+1)
  for (const pos of cpPositions) {
    const headerRow = pos.row
    const dataStartRow = headerRow + 1
    // scan until we find an empty name column or reach sheet end; assume Name column is col 1
    const lastRow = ws.rowCount
    console.log(`Checking columns around CP at col ${pos.col} starting data row ${dataStartRow}..${lastRow}`)
    for (let r = dataStartRow; r <= lastRow; r++) {
      const name = ws.getRow(r).getCell(1).value
      // treat empty name as end of data region (skip trailing footer)
      if ((name === null || name === undefined || String(name).trim() === '') && r > dataStartRow + 2) break
      const checkCols = [pos.col - 3, pos.col - 2, pos.col - 1, pos.col, pos.col + 1]
      for (const c of checkCols) {
        if (c < 1) continue
        const cell = ws.getRow(r).getCell(c)
        // if the cell is empty, skip
        const val = cell.value
        if (val === null || val === undefined || String(val).trim() === '') continue
        const ok = checkCellAlignment(cell, 'middle')
        if (!ok) {
          problems.push({ row: r, col: c, value: val, alignment: cell.alignment })
        }
      }
    }
  }

  if (problems.length === 0) {
    console.log('OK: All checked M/P/T/CP/Shift cells have vertical alignment set to middle (or were empty).')
    process.exit(0)
  }

  console.log('\nFound alignment issues in the following cells:')
  for (const p of problems) {
    console.log(`  row ${p.row}, col ${p.col} -> value='${String(p.value).slice(0, 40)}' alignment=${JSON.stringify(p.alignment)}`)
  }
  process.exit(3)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
