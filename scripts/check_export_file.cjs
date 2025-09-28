const fs = require('node:fs')
const XLSX = require('xlsx')

function colLetterToIndex(letter) {
  let col = 0
  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + (letter.charCodeAt(i) - 64)
  }
  return col
}

function addrToRC(addr) {
  const m = /^([A-Z]+)(\d+)$/.exec(addr)
  if (!m) throw new Error(`bad addr ${addr}`)
  return { r: Number.parseInt(m[2], 10), c: colLetterToIndex(m[1]) }
}

function inMerge(merges, addr) {
  const rc = addrToRC(addr)
  for (const m of merges || []) {
    const s = m.s || m.start
    const e = m.e || m.end
    // sheetjs uses 0-based indexes for r and c
    const sr = s.r + 1; const sc = s.c + 1; const er = e.r + 1; const ec = e.c + 1
    if (rc.r >= sr && rc.r <= er && rc.c >= sc && rc.c <= ec) return { s: { r: sr, c: sc }, e: { r: er, c: ec } }
  }
  return null
}

const argv = process.argv.slice(2)
if (argv.length < 1) {
  console.error('Usage: node scripts/check_export_file.cjs /path/to/file.xlsx')
  process.exit(2)
}
const file = argv[0]
if (!fs.existsSync(file)) {
  console.error('File not found:', file)
  process.exit(2)
}

const wb = XLSX.readFile(file, { cellDates: true })
const wsName = wb.SheetNames[0]
const ws = wb.Sheets[wsName]

const checkAddrs = ['FH7', 'FH8', 'FH9', 'FH10', 'FI9', 'FI10', 'EI9', 'EI10', 'EM11', 'EM12']
console.log('Sheet:', wsName)
console.log('File:', file)
console.log('--- Requested cells ---')
for (const a of checkAddrs) {
  const cell = ws[a]
  const val = cell ? (cell.w || cell.v) : ''
  const merge = inMerge(ws['!merges'], a)
  console.log(`${a}: value='${String(val)}' merged=${merge ? `${merge.s.r}-${merge.e.r} r, ${merge.s.c}-${merge.e.c} c` : 'no'}`)
}

// Count user rows via column A contents: find first header row (search for 'Nama')
let headerRow = null
for (let r = 1; r <= 30; r++) {
  const c = `A${r}`
  const v = ws[c] ? String(ws[c].w || ws[c].v).trim() : ''
  if (v && /Nama/i.test(v)) { headerRow = r; break }
}
if (!headerRow) headerRow = 1
// Data typically starts after two header rows; find first data row with non-empty col A
const dataStart = headerRow + 2
let names = []
for (let r = dataStart; r < dataStart + 200; r += 2) {
  const top = ws[`A${r}`]
  if (!top) break
  const name = String(top.w || top.v || '').trim()
  if (!name) break
  names.push({ rowTop: r, name })
}
console.log('Found user rows (top rows):', names.length)
for (const n of names) console.log(' -', n.rowTop, n.name)

// Print merges including target columns nearby
console.log('\n--- Merges (first 50) ---')
const merges = ws['!merges'] || []
for (let i = 0; i < Math.min(merges.length, 200); i++) {
  const m = merges[i]
  const sr = m.s.r + 1; const sc = m.s.c + 1; const er = m.e.r + 1; const ec = m.e.c + 1
  // convert sc/ec back to col letters
  function colIndexToLetter(idx) {
    let s = ''
    while (idx > 0) {
      const rem = (idx - 1) % 26
      s = String.fromCharCode(65 + rem) + s
      idx = Math.floor((idx - 1) / 26)
    }
    return s
  }
  console.log(`merge ${i}: ${colIndexToLetter(sc)}${sr}:${colIndexToLetter(ec)}${er}`)
}

process.exit(0)
