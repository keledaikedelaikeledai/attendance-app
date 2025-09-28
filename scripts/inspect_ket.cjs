const Excel = require('exceljs')

const path = process.argv[2]
if (!path) { console.error('Usage: node scripts/inspect_ket.cjs /path/to/file.xlsx'); process.exit(2) }
;(async () => {
  const wb = new Excel.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  console.log('File:', path)
  console.log('Worksheet name:', ws.name)
  console.log('views:', ws.views)
  console.log('column count:', ws.columnCount)
  // Print first 20 columns widths
  for (let i = 1; i <= Math.min(ws.columnCount, 200); i++) {
    const col = ws.getColumn(i)
    console.log(`Col ${i} (${col.letter}): width=${col.width}`)
  }
  // days & ket columns: assume base=6, subLen=6
  const base = 6; const subLen = 6
  const daysApprox = Math.floor((ws.columnCount - base) / subLen)
  console.log('approx days:', daysApprox)
  for (let d = 0; d < daysApprox; d++) {
    const ketIdx = base + d * subLen + 6 // wrong? adjust below
  }
  // Print ket columns by computing letter pattern manually: ket column index = base + d*6 + 6? We'll compute actual by scanning headers
  // Find header row with subheaders (we expect second header row at row 6 after template insertion; but we'll search for 'Ket')
  const headerRowSearch = [5, 6, 1, 2]
  let found = false
  for (const r of headerRowSearch) {
    const row = ws.getRow(r)
    for (let c = 1; c <= ws.columnCount; c++) {
      const val = row.getCell(c).value
      if (val && String(val).toLowerCase().includes('ket')) {
        console.log('Found Ket header at row', r, 'col', c, 'letter', Excel.utils ? Excel.utils.columnNumberToName(c) : c)
        found = true
        break
      }
    }
    if (found) break
  }
  // List a few Ket candidate columns by checking header second row cells equal to 'Ket'
  if (!found) {
    console.log('Searching for subheaders equal to Ket in row 6 (likely)')
    const row = ws.getRow(6)
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value
      if (v && String(v).trim().toLowerCase() === 'ket') console.log('Ket at col', c)
    }
  }
})()
