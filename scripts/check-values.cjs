#!/usr/bin/env node
// Print sample top/bottom cell values for first few rows and day groups
const fs = require('node:fs')
const ExcelJS = require('exceljs')

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    console.error('Usage: node scripts/check-values.cjs /path/to/file.xlsx')
    process.exit(2)
  }
  const file = argv[0]
  if (!fs.existsSync(file)) {
    console.error('File not found:', file)
    process.exit(2)
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]
  // Find header row with 'CP'
  let headerRow2 = null
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= row.cellCount; c++) {
      const v = row.getCell(c).value
      if (v != null && String(v).trim().toUpperCase() === 'CP') { headerRow2 = r; break }
    }
    if (headerRow2) break
  }
  if (!headerRow2) { console.error('no CP'); process.exit(1) }
  const dataStart = headerRow2 + 1
  console.info('headerRow2', headerRow2, 'dataStart', dataStart)
  // collect day groups as contiguous groups of 5 starting at first CP column found
  const hr = ws.getRow(headerRow2)
  const tokens = ['M', 'P', 'T', 'CP', 'Shift']
  const subIdxs = []
  for (let c = 1; c <= hr.cellCount; c++) {
    const v = hr.getCell(c).value
    if (v != null && tokens.includes(String(v).trim())) subIdxs.push(c)
  }
  // take first 3 day groups
  const groups = []
  for (let i = 0; i < Math.min(3, Math.floor(subIdxs.length / 5)); i++) {
    groups.push(subIdxs.slice(i * 5, i * 5 + 5))
  }
  console.info('day groups sample', groups)
  // print first 4 row pairs
  for (let r = dataStart; r < dataStart + 8 && r + 1 <= ws.rowCount; r += 2) {
    console.info('Row pair', r, r + 1, 'name:', String(ws.getRow(r).getCell(1).value || ''))
    for (let gi = 0; gi < groups.length; gi++) {
      const cols = groups[gi]
      const topVals = cols.map(c => String(ws.getRow(r).getCell(c).value || '').replace(/\n/g, '\\n'))
      const botVals = cols.map(c => String(ws.getRow(r + 1).getCell(c).value || '').replace(/\n/g, '\\n'))
      console.info(` Day ${gi + 1} cols ${cols.join(',')}`)
      console.info('  top:', topVals.join(' | '))
      console.info('  bot:', botVals.join(' | '))
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
