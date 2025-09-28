const fs = require('node:fs')
const XLSX = require('xlsx')

function colToIndex(letter) {
  let col = 0
  for (let i = 0; i < letter.length; i++) col = col * 26 + (letter.charCodeAt(i) - 64)
  return col
}

function indexToCol(idx) {
  let s = ''
  while (idx > 0) {
    const rem = (idx - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    idx = Math.floor((idx - 1) / 26)
  }
  return s
}

function inMerge(merges, r1, c1, r2, c2) {
  for (const m of merges || []) {
    const sr = m.s.r + 1; const sc = m.s.c + 1; const er = m.e.r + 1; const ec = m.e.c + 1
    if (sr === r1 && sc === c1 && er === r2 && ec === c2) return true
  }
  return false
}

const file = process.argv[2]
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node scripts/check_merge_details.cjs /path/to/file.xlsx')
  process.exit(2)
}

const wb = XLSX.readFile(file)
const ws = wb.Sheets[wb.SheetNames[0]]
const merges = ws['!merges'] || []

// find header start row: look for 'Nama' in column A
let headerRow = 1
for (let r = 1; r <= 20; r++) {
  const a = ws[`A${r}`]
  if (a && String(a.v || a.w || '').toLowerCase().includes('nama')) { headerRow = r; break }
}
const dataStart = headerRow + 2

// find top user rows by scanning column A
const users = []
for (let r = dataStart; r <= dataStart + 200; r += 2) {
  const cell = ws[`A${r}`]
  if (!cell) break
  const name = String(cell.w || cell.v || '').trim()
  if (!name) break
  users.push({ rowTop: r, name })
}

// find number of days by header merges count: count merged ranges on headerRow for day groups
// fallback: compute columns until empty header subcol
let firstDayCol = 7
let col = firstDayCol
const subLen = 6
let days = 0
while (col < 500) {
  const h = ws[indexToCol(col) + headerRow]
  if (!h) break
  days++
  col += subLen
}

console.log('File:', file)
console.log('HeaderRow:', headerRow, 'DataStart:', dataStart, 'Users:', users.length, 'Days approx:', days)
for (const u of users) {
  console.log('\nUser:', u.name, 'topRow', u.rowTop)
  const top = u.rowTop
  const bot = top + 1
  for (let d = 0; d < days; d++) {
    const startCol = firstDayCol + d * subLen
    const cols = []
    for (let s = 0; s < subLen; s++) cols.push(startCol + s)
    const colNames = cols.map(indexToCol)
    const mergedFlags = cols.map((c) => {
      // check if merged from top to bottom
      return inMerge(merges, top, c, bot, c)
    })
    const values = cols.map((c) => {
      const a = ws[indexToCol(c) + String(top)]
      const b = ws[indexToCol(c) + String(bot)]
      return { top: a ? (a.w || a.v) : '', bot: b ? (b.w || b.v) : '' }
    })
    console.log(` Day ${String(d + 1).padStart(2, '0')}: cols=${colNames.join(',')} merged=${mergedFlags.map(m => m ? 'Y' : 'N').join(' ')} valuesTopBot=${values.map(v => `'${String(v.top)}'/'${String(v.bot)}'`).join(' | ')}`)
  }
}

process.exit(0)
