#!/usr/bin/env node
/* eslint-disable no-console */
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

// Config via env
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const INCLUDE_WEEKENDS = process.env.INCLUDE_WEEKENDS === '1'
const ROLE_FILTER = process.env.ROLE_FILTER || 'user' // only include non-admins by default; use ALL to include all
const SHIFT_CODE = process.env.SHIFT_CODE // optional override
const START_DATE = process.env.START_DATE // YYYY-MM-DD
const END_DATE = process.env.END_DATE // YYYY-MM-DD
const DRY_RUN = process.env.DRY_RUN === '1'
const OVERWRITE = process.env.OVERWRITE === '1' // if true, delete existing attendance_day + logs for the date/user before insert
// Business timezone to anchor shift wall-times when generating UTC timestamps.
// Defaults to Asia/Jakarta to match production behavior.
const BUSINESS_TZ = process.env.BUSINESS_TZ || 'Asia/Jakarta'
// Legacy offset support (minutes); if set, we'll fall back to this. Otherwise prefer BUSINESS_TZ.
const TZ_OFFSET_MINUTES = Number.isFinite(Number(process.env.TZ_OFFSET_MINUTES)) ? Number(process.env.TZ_OFFSET_MINUTES) : null

function firstLastPrevMonth() {
  const now = new Date()
  const firstThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const lastPrevMonth = new Date(firstThisMonth.getTime() - 24 * 3600 * 1000)
  const firstPrevMonth = new Date(Date.UTC(lastPrevMonth.getUTCFullYear(), lastPrevMonth.getUTCMonth(), 1))
  return {
    start: firstPrevMonth,
    end: lastPrevMonth,
  }
}

function dateToISO(d) {
  return d.toISOString().slice(0, 10)
}

function* eachDay(start, end) {
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 3600 * 1000) {
    yield new Date(t)
  }
}

function isWeekend(d) {
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

function parseHHMM(hhmm) {
  const [h, m] = (hhmm || '').split(':').map(Number)
  return { h: Number.isFinite(h) ? h : 8, m: Number.isFinite(m) ? m : 0 }
}

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`
}

function formatTs(dateObj) {
  // format as 'YYYY-MM-DD HH:MM:SS' (no timezone designator) to avoid TZ shifts when inserting
  return `${dateObj.getUTCFullYear()}-${pad2(dateObj.getUTCMonth() + 1)}-${pad2(dateObj.getUTCDate())} ${pad2(dateObj.getUTCHours())}:${pad2(dateObj.getUTCMinutes())}:${pad2(dateObj.getUTCSeconds())}`
}

// Compute the UTC instant for a local wall time in a specific IANA timezone.
// Mirrors the logic used in server-side attendance calculations (localDateTimeToUtcIso).
function localDateTimeToUtc(dateYmd, hh, mm, tz) {
  // Create a wall-time Date (interpreted in JS environment tz) then derive the offset for target tz
  const wall = new Date(`${dateYmd}T${pad2(hh)}:${pad2(mm)}:00`)
  const tzDate = new Date(wall.toLocaleString('en-US', { timeZone: tz }))
  const offsetMs = wall.getTime() - tzDate.getTime()
  const instant = new Date(wall.getTime() + offsetMs)
  return instant
}

function buildTimestamp(dateIso, hhmm, jitterMinutes = 0, dayOffset = 0) {
  const { h, m } = parseHHMM(hhmm)
  const [y, mo, d] = dateIso.split('-').map(Number)
  // If legacy TZ offset is provided, keep behavior (offset minutes from UTC).
  // Otherwise, compute the UTC instant for the wall time in BUSINESS_TZ to match admin late/early calculations.
  let base
  if (typeof TZ_OFFSET_MINUTES === 'number') {
    base = new Date(Date.UTC(y, mo - 1, d + dayOffset, h, m, 0, 0))
    base.setUTCMinutes(base.getUTCMinutes() - TZ_OFFSET_MINUTES)
  }
  else {
    // Adjust the target date when the shift crosses midnight (dayOffset already applied above)
    const anchor = new Date(Date.UTC(y, mo - 1, d + dayOffset))
    const anchorYmd = `${anchor.getUTCFullYear()}-${pad2(anchor.getUTCMonth() + 1)}-${pad2(anchor.getUTCDate())}`
    base = localDateTimeToUtc(anchorYmd, h, m, BUSINESS_TZ)
  }
  if (jitterMinutes) {
    const delta = Math.floor((Math.random() * 2 - 1) * jitterMinutes) // +/- jitter
    base.setUTCMinutes(base.getUTCMinutes() + delta)
  }
  return formatTs(base)
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()

  // Determine date range
  let start
  let end
  if (START_DATE && END_DATE) {
    start = new Date(`${START_DATE}T00:00:00Z`)
    end = new Date(`${END_DATE}T00:00:00Z`)
  }
  else {
    const prev = firstLastPrevMonth()
    start = prev.start
    end = prev.end
  }

  const dateList = []
  for (const d of eachDay(start, end)) {
    if (!INCLUDE_WEEKENDS && isWeekend(d)) continue
    dateList.push(dateToISO(d))
  }

  // Load shifts
  let shifts = []
  try {
    const res = await client.query('SELECT code, start, "end" FROM shift WHERE active = true ORDER BY sort_order ASC, code ASC')
    shifts = res.rows
  }
  catch (e) {
    console.warn('Failed to load shifts, falling back to default times', e.message)
  }
  if (!shifts.length) {
    shifts = [{ code: 'default', start: '08:00', end: '17:00' }]
  }

  const pickShiftForDay = (dayIdx) => {
    if (SHIFT_CODE) return shifts.find(s => s.code === SHIFT_CODE) || shifts[0]
    // cycle through shifts by day index
    return shifts[dayIdx % shifts.length]
  }

  // Load users
  let userQuery = 'SELECT id, email, role, name FROM "user"'
  if (ROLE_FILTER && ROLE_FILTER.toUpperCase() !== 'ALL') {
    userQuery += ' WHERE role != $1'
  }
  userQuery += ' ORDER BY created_at ASC'

  const usersRes = ROLE_FILTER && ROLE_FILTER.toUpperCase() !== 'ALL'
    ? await client.query(userQuery, ['admin'])
    : await client.query(userQuery)

  const users = usersRes.rows
  console.info(`Users to seed: ${users.length}`)
  console.info(`Days to seed: ${dateList.length} (weekends included: ${INCLUDE_WEEKENDS})`)
  console.info(`Shifts available: ${shifts.map(s => s.code).join(', ')}`)

  if (DRY_RUN) {
    console.info('DRY_RUN=1 -> not writing to DB. Sample plan:')
    users.slice(0, 2).forEach((u, ui) => {
      console.info(`User ${u.email} (role=${u.role})`) 
      dateList.slice(0, 3).forEach((d, di) => {
        const sh = pickShiftForDay(di)
        console.info(`  ${d} shift=${sh.code} in=${sh.start} out=${sh.end}`)
      })
    })
    await client.end()
    return
  }

  let totalDaysInserted = 0
  let totalLogsInserted = 0

  for (let ui = 0; ui < users.length; ui++) {
    const u = users[ui]
    // Per-user transaction to avoid partial inserts
    await client.query('BEGIN')
    try {
      for (let di = 0; di < dateList.length; di++) {
        const dateIso = dateList[di]
        const shift = pickShiftForDay(di)

        if (OVERWRITE) {
          await client.query('DELETE FROM attendance_log WHERE user_id = $1 AND date = $2', [u.id, dateIso])
          await client.query('DELETE FROM attendance_day WHERE user_id = $1 AND date = $2', [u.id, dateIso])
        }
        else {
          const exists = await client.query('SELECT 1 FROM attendance_day WHERE user_id = $1 AND date = $2 LIMIT 1', [u.id, dateIso])
          if (exists.rowCount) continue
        }

        const dayId = randomUUID()
        await client.query(
          'INSERT INTO attendance_day (id, user_id, date, selected_shift_code, shift_type, created_at, updated_at) VALUES ($1,$2,$3,$4,$5, NOW(), NOW())',
          [dayId, u.id, dateIso, shift.code, 'harian'],
        )
        totalDaysInserted += 1

  // clock-in / out times with jitter, honoring shift windows and overnight spans
  const startStr = shift.start || '08:00'
  const endStr = shift.end || '17:00'
  const startParts = parseHHMM(startStr)
  const endParts = parseHHMM(endStr)
  const endDayOffset = (endParts.h * 60 + endParts.m) < (startParts.h * 60 + startParts.m) ? 1 : 0

  const clockInTs = buildTimestamp(dateIso, startStr, 8, 0)
  const clockOutTs = buildTimestamp(dateIso, endStr, 8, endDayOffset)

        const logInId = randomUUID()
        const logOutId = randomUUID()
        await client.query(
          'INSERT INTO attendance_log (id, user_id, date, type, timestamp, shift_type, shift_code, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), NOW())',
          [logInId, u.id, dateIso, 'clock-in', clockInTs, 'harian', shift.code],
        )
        await client.query(
          'INSERT INTO attendance_log (id, user_id, date, type, timestamp, shift_type, shift_code, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), NOW())',
          [logOutId, u.id, dateIso, 'clock-out', clockOutTs, 'harian', shift.code],
        )
        totalLogsInserted += 2
      }
      await client.query('COMMIT')
    }
    catch (err) {
      await client.query('ROLLBACK')
      console.error(`Error seeding user ${u.email}:`, err.message)
    }
  }

  console.info(`Inserted ${totalDaysInserted} attendance_day rows and ${totalLogsInserted} attendance_log rows.`)
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
