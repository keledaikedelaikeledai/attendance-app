#!/usr/bin/env node
/* eslint-disable no-console */

const { Client } = require('pg')
const { randomUUID } = require('node:crypto')

// How long past a cross-midnight shift's end a log may still belong to the
// previous day's session. Late-but-plausible clock-outs only.
const GRACE_MINUTES = Number(process.env.GRACE_MINUTES || 120)

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

// Business-date rules mirror the live endpoints: a clock-in's date is
// resolved shift-aware from its own instant; a clock-out closes into its
// clock-in's business date (clock-out.post.ts sets date = openClockIn.date).
// Per-row fallback only applies to orphan clock-outs.

function expectedDateForRow(row, shiftMap, businessTz) {
  const local = toLocalParts(new Date(row.timestamp), businessTz)
  let expected = local.ymd

  const shiftDef = row.shift_code ? shiftMap.get(row.shift_code) : null
  if (shiftDef && shiftDef.crossesMidnight) {
    const nowMin = local.hour * 60 + local.minute
    // Late clock-ins are legitimate for the early-morning tail: a malam
    // shift 19:00-07:00 gets a 03:29 clock-in whose business date is the
    // day the shift started. GRACE_MINUTES keeps late clock-OUTS in the
    // same tail (07:10 out still belongs to the 19:00 session) - the
    // hard endMin boundary turned every late clock-out into a ~24h
    // "early"/"late" in the admin report.
    const nowGrace = shiftDef.endMin + GRACE_MINUTES
    if (nowMin <= nowGrace) {
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
      order by user_id asc, "timestamp" asc
    `)

    // Walk each user's logs the way the app does: clock-ins open sessions
    // (shift-aware business date of their own instant), clock-outs inherit
    // the open session's date; a second clock-in re-opens, an orphan
    // clock-out falls back to the per-row rule.
    const mismatches = []
    const affected = new Map() // userId -> Set of oldDates touched
    let currentUser = null
    let openSession = null
    for (const row of logsRes.rows) {
      if (row.user_id !== currentUser) {
        currentUser = row.user_id
        openSession = null
      }
      if (row.type === 'clock-in') {
        openSession = { expected: expectedDateForRow(row, shiftMap, businessTz).expected }
        row.__expected = openSession.expected
      }
      else if (row.type === 'clock-out') {
        row.__expected = openSession ? openSession.expected : expectedDateForRow(row, shiftMap, businessTz).expected
        openSession = null
      }
      else {
        row.__expected = row.date
      }
      if (row.date !== row.__expected) {
        const local = toLocalParts(new Date(row.timestamp), businessTz)
        if (!affected.has(row.user_id))
          affected.set(row.user_id, new Set())
        affected.get(row.user_id).add(row.date)
        mismatches.push({
          id: row.id,
          userId: row.user_id,
          oldDate: row.date,
          expectedDate: row.__expected,
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

    console.log('starting transaction...'); await client.query('begin')
    console.log('updating logs...')

    // Set-based: one UPDATE over all re-dated logs, one INSERT for missing
    // day rows, then drop orphaned day rows. Row-by-row round-trips took
    // minutes on a WAN database.
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200)
      const values = chunk.map(r => `('${r.id.replace(/'/g, `''`)}', '${r.expectedDate}')`).join(', ')
      await client.query(`
        update attendance_log l
        set date = v.expected, updated_at = now()
        from (values ${values}) as v(id, expected)
        where l.id = v.id
      `)
    }

    console.log('logs updated; inserting day rows...')
    // Missing day rows for the target dates.
    const dayPairs = new Map()
    for (const row of rows) {
      const key = `${row.userId}::${row.expectedDate}`
      if (!dayPairs.has(key))
        dayPairs.set(key, { id: randomUUID(), userId: row.userId, date: row.expectedDate, shiftCode: row.shiftCode || null, shiftType: row.shiftType || 'harian' })
    }
    if (dayPairs.size) {
      const values = [...dayPairs.values()].map(d =>
        `('${d.id}', '${d.userId.replace(/'/g, `''`)}', '${d.date}', ${d.shiftCode ? `'${d.shiftCode.replace(/'/g, `''`)}'` : 'NULL'}, '${d.shiftType}', now(), now())`,
      ).join(', ')
      await client.query(`
        insert into attendance_day (id, user_id, date, selected_shift_code, shift_type, created_at, updated_at)
        select id, user_id, date, selected_shift_code::text, shift_type, created_at, updated_at
        from (values ${values}) as v(id, user_id, date, selected_shift_code, shift_type, created_at, updated_at)
        on conflict (user_id, date) do nothing
      `)
    }

    // A day row whose logs all moved elsewhere becomes an empty ghost day
    // in the report - drop it once no log references it anymore.
    console.log('day rows done; cleaning orphans...')
    let removedEmptyDays = 0
    for (const [userId, oldDates] of affected) {
      for (const oldDate of oldDates) {
        const remaining = await client.query('select 1 from attendance_log where user_id = $1 and date = $2 limit 1', [userId, oldDate])
        if (remaining.rowCount === 0) {
          await client.query('delete from attendance_day where user_id = $1 and date = $2', [userId, oldDate])
          removedEmptyDays += 1
        }
      }
    }

    await client.query('commit')
    console.log(JSON.stringify({ updated: rows.length, removedEmptyDays }, null, 2))
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
