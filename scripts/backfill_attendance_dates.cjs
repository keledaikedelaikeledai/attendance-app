#!/usr/bin/env node
/* eslint-disable no-console */

const { Client } = require('pg')
const { randomUUID } = require('node:crypto')

function pad2(n) {
  return String(n).padStart(2, '0')
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

function toLocalParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const get = (type) => parts.find(p => p.type === type)?.value
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const hour = Number(get('hour'))
  const minute = Number(get('minute'))
  const second = Number(get('second'))
  const ymd = `${year}-${pad2(month)}-${pad2(day)}`
  return { year, month, day, hour, minute, second, ymd }
}

function expectedDateForRow(row, shiftMap, businessTz) {
  const local = toLocalParts(new Date(row.timestamp), businessTz)
  let expected = local.ymd

  const shiftDef = row.shift_code ? shiftMap.get(row.shift_code) : null
  if (shiftDef && shiftDef.crossesMidnight) {
    const nowMin = local.hour * 60 + local.minute
    if (nowMin <= shiftDef.endMin) {
      expected = addDaysYmd(local.ymd, -1)
    }
  }

  return { expected, local }
}

async function run() {
  const apply = process.argv.includes('--apply')
  const limitArg = process.argv.find(x => x.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null
  const businessTz = process.env.BUSINESS_TZ || 'Asia/Jakarta'

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    const shiftsRes = await client.query('select code, start, "end" from shift')
    const shiftMap = new Map()
    for (const s of shiftsRes.rows) {
      const [sh, sm] = String(s.start || '').split(':').map(Number)
      const [eh, em] = String(s.end || '').split(':').map(Number)
      if ([sh, sm, eh, em].some(Number.isNaN)) continue
      const startMin = sh * 60 + sm
      const endMin = eh * 60 + em
      shiftMap.set(s.code, {
        crossesMidnight: startMin > endMin,
        endMin,
      })
    }

    const logsRes = await client.query(`
      select id, user_id, date, type, "timestamp", shift_code, shift_type
      from attendance_log
      order by "timestamp" asc
    `)

    const mismatches = []
    for (const row of logsRes.rows) {
      const { expected, local } = expectedDateForRow(row, shiftMap, businessTz)
      if (row.date !== expected) {
        mismatches.push({
          id: row.id,
          userId: row.user_id,
          oldDate: row.date,
          expectedDate: expected,
          type: row.type,
          shiftCode: row.shift_code,
          shiftType: row.shift_type,
          timestamp: row.timestamp,
          localYmd: local.ymd,
          localHm: `${pad2(local.hour)}:${pad2(local.minute)}`,
        })
      }
    }

    const rows = typeof limit === 'number' && Number.isFinite(limit)
      ? mismatches.slice(0, Math.max(0, limit))
      : mismatches

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      businessTz,
      totalLogs: logsRes.rowCount,
      mismatchCount: mismatches.length,
      selectedForRun: rows.length,
      sample: rows.slice(0, 20),
    }, null, 2))

    if (!apply || rows.length === 0) {
      return
    }

    await client.query('begin')

    for (const row of rows) {
      await client.query('update attendance_log set date = $1, updated_at = now() where id = $2', [row.expectedDate, row.id])

      const dayRes = await client.query('select id from attendance_day where user_id = $1 and date = $2 limit 1', [row.userId, row.expectedDate])
      if (dayRes.rowCount === 0) {
        await client.query(
            'insert into attendance_day (id, user_id, date, selected_shift_code, shift_type, created_at, updated_at) values ($1, $2, $3, $4, $5, now(), now())',
            [randomUUID(), row.userId, row.expectedDate, row.shiftCode || null, row.shiftType || 'harian'],
        )
      }
    }

    await client.query('commit')
    console.log(JSON.stringify({ updated: rows.length }, null, 2))
  }
  catch (err) {
    try {
      await client.query('rollback')
    }
    catch {}
    throw err
  }
  finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
