#!/usr/bin/env node
// Inspect per-day subcolumn merges in an exported attendance XLSX.
// Usage: node scripts/check-merges.cjs /path/to/attendance.xlsx

const fs = require('node:fs')

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    console.error('Usage: node scripts/check-merges.cjs /path/to/file.xlsx')
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

  // Find headerRow2 by searching first 20 rows for 'CP'
  let headerRow2 = null
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= row.cellCount; c++) {
      const v = row.getCell(c).value
      if (v != null && String(v).trim().toUpperCase() === 'CP') {
        headerRow2 = r
        break
      }
    }
    if (headerRow2) break
  }

  if (!headerRow2) {
    console.error('Could not find CP header in first 20 rows. Provide a different file or adjust script.')
    process.exit(2)
  }

  const headerRow1 = headerRow2 - 1
  const dataStart = headerRow2 + 1

  console.info(`Found CP header at row ${headerRow2}. Assuming headerRow1=${headerRow1}, data starts at ${dataStart}`)

  // Collect indices of subheaders in headerRow2 that are known tokens
  const tokens = ['M', 'P', 'T', 'CP', 'Shift']
  const subIdxs = []
  const hr = ws.getRow(headerRow2)
  for (let c = 1; c <= hr.cellCount; c++) {
    const v = hr.getCell(c).value
    if (v != null && tokens.includes(String(v).trim())) subIdxs.push(c)
  }
  if (subIdxs.length === 0) {
    console.error('No M/P/T/CP/Shift subheaders found on headerRow2')
    process.exit(1)
  }

  // Group into contiguous day groups of 5
  const groups = []
  let current = []
  for (let i = 0; i < subIdxs.length; i++) {
    if (current.length === 0) {
      current.push(subIdxs[i])
    }
    else {
      const prev = current[current.length - 1]
      if (subIdxs[i] === prev + 1) {
        current.push(subIdxs[i])
      }
      else {
        groups.push(current)
        current = [subIdxs[i]]
      }
    }
  }
  if (current.length) groups.push(current)

  // Normalize groups into dayGroups of length 5 by slicing large contiguous runs
  const dayGroups = []
  for (const g of groups) {
    for (let i = 0; i < g.length; i += 5) {
      const slice = g.slice(i, i + 5)
      if (slice.length === 5) dayGroups.push(slice)
    }
  }
  if (dayGroups.length === 0) {
    console.error('No day groups (5 columns) could be assembled; found groups:', groups)
    process.exit(1)
  }

  console.info(`Found ${dayGroups.length} day groups starting at columns: ${dayGroups.map(g => g[0]).join(', ')}`)

  // Print vertical merge addresses that lie within the data region for quick debugging
  try {
    console.info('Total merge addresses available from model/_merges:', mergeRanges.length)
    console.info('First 200 merge ranges (addresses):', mergeRanges.slice(0, 200))
    const verticalMerges = mergeRanges.filter(addr => /:[A-Z]+\d+$/.test(addr))
    console.info('Vertical merges (first 200):', verticalMerges.slice(0, 200))
    const dataMerges = verticalMerges.filter((addr) => {
      const m = /([A-Z]+)(\d+):([A-Z]+)(\d+)/.exec(addr)
      if (!m) return false
      const r1 = Number.parseInt(m[2], 10)
      const r2 = Number.parseInt(m[4], 10)
      return (r1 >= dataStart && r1 <= ws.rowCount) || (r2 >= dataStart && r2 <= ws.rowCount)
    })
    console.info('Vertical merges in data region (first 200):', dataMerges.slice(0, 200))
  }
  catch (e) {
    // ignore diagnostics
  }

  // Helper to check whether a cell is part of a merge that spans 2 rows
  const modelMerges = (ws.model && ws.model.merges) || []
  const mergeRanges = modelMerges.slice()
  if ((!mergeRanges || mergeRanges.length === 0) && (ws._merges && typeof ws._merges.forEach === 'function')) {
    ws._merges.forEach((v, k) => {
      if (typeof k === 'string') mergeRanges.push(k)
    })
  }

  function isMergedAcrossTwoRows(col, topRow) {
    const A = (c) => {
      let s = ''
      let n = c
      while (n > 0) {
        const rem = (n - 1) % 26
        s = String.fromCharCode(65 + rem) + s
        n = Math.floor((n - 1) / 26)
      }
      return s
    }
    const addr1 = `${A(col)}${topRow}:${A(col)}${topRow + 1}`
    return mergeRanges.includes(addr1)
  }

  // Walk row pairs until we hit blank name column for several rows
  const results = []
  let r = dataStart
  const maxR = ws.rowCount
  while (r + 1 <= maxR) {
    const name = ws.getRow(r).getCell(1).value
    if ((name === null || name === undefined || String(name).trim() === '') && r > dataStart + 2) break
    const topRow = r
    const botRow = r + 1
    const dayInfo = []
    for (let gi = 0; gi < dayGroups.length; gi++) {
      const cols = dayGroups[gi]
      const merged = {}
      for (let k = 0; k < cols.length; k++) {
        const col = cols[k]
        merged[tokens[k]] = isMergedAcrossTwoRows(col, topRow)
      }
      dayInfo.push(merged)
    }
    results.push({ topRow, botRow, name: String(ws.getRow(topRow).getCell(1).value || '').slice(0, 40), days: dayInfo })
    r += 2
  }

  // Print summary
  for (const res of results) {
    console.info(`Row pair ${res.topRow}/${res.botRow} name='${res.name}':`)
    res.days.forEach((d, idx) => {
      console.info(`  Day ${idx + 1}: M=${d.M ? 'MERGED' : 'ok'}, P=${d.P ? 'MERGED' : 'ok'}, T=${d.T ? 'MERGED' : 'ok'}, CP=${d.CP ? 'MERGED' : 'ok'}, Shift=${d.Shift ? 'MERGED' : 'ok'}`)
    })
  }

  console.info('\nTotal merge ranges found in sheet model:', mergeRanges.length)

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
