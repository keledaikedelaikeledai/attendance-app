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

async function ensureDayRow(client, userId, date, shiftType) {
  const q = await client.query('select id from attendance_day where user_id=$1 and date=$2 limit 1', [userId, date])
  if (q.rowCount > 0) return
  await client.query(
    'insert into attendance_day (id, user_id, date, selected_shift_code, shift_type, created_at, updated_at) values ($1,$2,$3,$4,$5,now(),now())',
    [randomUUID(), userId, date, null, shiftType || 'harian'],
  )
}

async function run() {
  const apply = process.argv.includes('--apply')
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    const logs = await client.query(`
      select id, user_id, date, type, "timestamp", shift_type, shift_code
      from attendance_log
      order by user_id asc, date asc, "timestamp" asc
    `)

    const groups = new Map()
    for (const row of logs.rows) {
      const st = row.shift_type || 'unknown'
      const key = `${row.user_id}::${row.date}::${st}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(row)
    }

    const anomalies = []
    for (const [key, rows] of groups.entries()) {
      const [userId, date, shiftType] = key.split('::')
      const ins = rows.filter(r => r.type === 'clock-in').sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      const outs = rows.filter(r => r.type === 'clock-out').sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      if (!ins.length || !outs.length) continue
      const earliestIn = ins[0]
      const latestOut = outs[outs.length - 1]
      const inMs = new Date(earliestIn.timestamp).getTime()
      const outMs = new Date(latestOut.timestamp).getTime()
      if (Number.isFinite(inMs) && Number.isFinite(outMs) && outMs < inMs) {
        const targetDate = addDaysYmd(date, -1)
        for (const out of outs) {
          anomalies.push({
            id: out.id,
            userId,
            shiftType,
            oldDate: date,
            newDate: targetDate,
            timestamp: out.timestamp,
          })
        }
      }
    }

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      anomalyCount: anomalies.length,
      sample: anomalies.slice(0, 20),
    }, null, 2))

    if (!apply || anomalies.length === 0) return

    await client.query('begin')
    for (const a of anomalies) {
      await client.query('update attendance_log set date=$1, updated_at=now() where id=$2', [a.newDate, a.id])
      await ensureDayRow(client, a.userId, a.newDate, a.shiftType)
    }
    await client.query('commit')

    console.log(JSON.stringify({ updated: anomalies.length }, null, 2))
  }
  catch (err) {
    try { await client.query('rollback') } catch {}
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
