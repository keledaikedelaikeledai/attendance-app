#!/usr/bin/env node
const { execSync } = require('node:child_process')
const crypto = require('node:crypto')
const { readFileSync } = require('node:fs')
const path = require('node:path')

function sha256File(file) {
  const data = readFileSync(file)
  return crypto.createHash('sha256').update(data).digest('hex')
}

function runSqlite(db, sql) {
  // use sqlite3 CLI, output suppressed unless error
  try {
    return execSync(`sqlite3 ${db} "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' })
  }
  catch (err) {
    throw err
  }
}

function tableExists(db, table) {
  const out = runSqlite(db, `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}' LIMIT 1;`).trim()
  return !!out
}

function indexExists(db, name) {
  const out = runSqlite(db, `SELECT name FROM sqlite_master WHERE type='index' AND name='${name}' LIMIT 1;`).trim()
  return !!out
}

function columnExists(db, table, column) {
  const out = runSqlite(db, `PRAGMA table_info('${table}');`).split(/\n/).map(l => l.trim()).filter(Boolean)
  for (const row of out) {
    const parts = row.split('|')
    if (parts[1] === column) return true
  }
  return false
}

function appliedHashes(db) {
  if (!tableExists(db, '__drizzle_migrations')) return []
  const out = runSqlite(db, `SELECT hash FROM __drizzle_migrations;`).split(/\n/).map(s => s.trim()).filter(Boolean)
  return out
}

function markApplied(db, hash) {
  if (!tableExists(db, '__drizzle_migrations')) {
    // create a simple table compatible with drizzle
    runSqlite(db, `CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric);`)
  }
  runSqlite(db, `INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('${hash}', strftime('%s','now'));`)
}

function applyStatementIfNeeded(db, stmt) {
  const s = stmt.trim()
  if (!s) return
  const sLow = s.toLowerCase()
  try {
    if (sLow.startsWith('create table')) {
      // extract table name
      const m = s.match(/create table\s+[`'"]?(\w+)[`'"]?/i)
      const t = m && m[1]
      if (t && tableExists(db, t)) {
        console.log(`skip create table ${t} (exists)`)
        return
      }
    }
    if (sLow.startsWith('alter table') && sLow.includes('add column')) {
      const m = s.match(/alter table\s+[`'"]?(\w+)[`'"]?\s+add column\s+[`'"]?(\w+)[`'"]?/i)
      if (m) {
        const table = m[1]
        const col = m[2]
        if (columnExists(db, table, col)) {
          console.log(`skip add column ${col} on ${table} (exists)`)
          return
        }
      }
    }
    if (sLow.startsWith('create index') || sLow.startsWith('create unique index')) {
      const m = s.match(/create\s+(?:unique\s+)?index\s+[`'"]?(\w+)[`'"]?/i)
      const idx = m && m[1]
      if (idx && indexExists(db, idx)) {
        console.log(`skip create index ${idx} (exists)`)
        return
      }
    }
    // run statement
    console.log('apply:', s.split('\n')[0].slice(0, 120))
    runSqlite(db, s.replace(/;\s*$/, ''))
  }
  catch (err) {
    console.error('statement failed:', err.message || err)
    // rethrow to stop, so the migration isn't marked applied incorrectly
    throw err
  }
}

function applyMigrationFile(db, file) {
  const sql = readFileSync(file, 'utf8')
  // split by statement-breakpoint tokens or semicolons
  const parts = sql.split(/--\s*statement-breakpoint\s*\n|;\s*\n/gi).map(s => s.trim()).filter(Boolean)
  for (const p of parts) {
    applyStatementIfNeeded(db, p)
  }
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.length < 2) {
    console.error('usage: ensure_migrations.js <sqlite.db> <migrations_dir>')
    process.exit(2)
  }
  const db = argv[0]
  const migrationsDir = argv[1]
  const files = require('node:fs').readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  const applied = appliedHashes(db)
  for (const f of files) {
    const file = path.join(migrationsDir, f)
    const hash = sha256File(file)
    if (applied.includes(hash)) {
      console.log(`already applied: ${f}`)
      continue
    }
    console.log(`applying: ${f}`)
    applyMigrationFile(db, file)
    markApplied(db, hash)
    console.log(`marked applied: ${f}`)
  }
  console.log('done')
}

main()
