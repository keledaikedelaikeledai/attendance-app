#!/usr/bin/env node
const fs = require('node:fs')
const ExcelJS = require('exceljs')

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length < 3) {
    console.error('Usage: node scripts/inspect-cell.cjs /path/to/file.xlsx row col [row col ...]')
    process.exit(2)
  }
  const file = argv[0]
  if (!fs.existsSync(file)) { console.error('File not found', file); process.exit(2) }
  const coords = []
  for (let i = 1; i < argv.length; i += 2) coords.push({ r: Number(argv[i]), c: Number(argv[i + 1]) })

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]
  const merges = (ws.model && ws.model.merges) ? ws.model.merges : []
  // fallback to _merges keys
  if ((!merges || merges.length === 0) && ws._merges) {
    if (typeof ws._merges.forEach === 'function') {
      ws._merges.forEach((v, k) => { if (typeof k === 'string') merges.push(k) })
    }
    else {
      merges.push(...Object.keys(ws._merges))
    }
  }

  function colToA(n) {
    let s = ''
    let v = n
    while (v > 0) {
      const rem = (v - 1) % 26
      s = String.fromCharCode(65 + rem) + s
      v = Math.floor((v - 1) / 26)
    }
    return s
  }

  function findMergeFor(r, c) {
    for (const addr of merges) {
      const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(addr)
      if (!m) continue
      const sCol = m[1]; const sRow = Number(m[2]); const eCol = m[3]; const eRow = Number(m[4])
      const colNum = (sCol.split('')).reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0)
      const eColNum = (eCol.split('')).reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0)
      if (c >= colNum && c <= eColNum && r >= sRow && r <= eRow) return addr
    }
    return null
  }

  for (const coord of coords) {
    const { r, c } = coord
    const cell = ws.getRow(r).getCell(c)
    const addr = `${colToA(c)}${r}`
    console.log('---', addr)
    console.log(' value:', cell.value)
    console.log(' alignment:', cell.alignment)
    console.log(' mergeRange:', findMergeFor(r, c))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
