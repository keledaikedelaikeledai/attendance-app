import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { attendanceLog } from './schema'

describe('attendanceLog database constraints', () => {
  test('declares constraints for type, date format, and optional shift type', () => {
    const checks = getTableConfig(attendanceLog).checks
    const names = checks.map(check => check.name)

    expect(names).toContain('attendance_log_type_check')
    expect(names).toContain('attendance_log_date_format_check')
    expect(names).toContain('attendance_log_shift_type_check')
  })
})
