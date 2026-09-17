import { describe, expect, test } from 'bun:test'
import { validateAttendanceShiftDefinition, validateAttendanceShiftType } from '../server/utils/attendance-shift-validation'

describe('validateAttendanceShiftType', () => {
  test('accepts omitted shift type', () => {
    expect(() => validateAttendanceShiftType(undefined)).not.toThrow()
  })

  test('accepts supported shift types', () => {
    expect(() => validateAttendanceShiftType('harian')).not.toThrow()
    expect(() => validateAttendanceShiftType('bantuan')).not.toThrow()
  })

  test('rejects unsupported runtime values', () => {
    expect(() => validateAttendanceShiftType('invalid')).toThrow('Invalid shiftType')
    expect(() => validateAttendanceShiftType(null)).toThrow('Invalid shiftType')
    expect(() => validateAttendanceShiftType(123)).toThrow('Invalid shiftType')
  })
})

describe('validateAttendanceShiftDefinition', () => {
  test('rejects nonexistent selected shift', () => {
    expect(() => validateAttendanceShiftDefinition('UNKNOWN', undefined)).toThrow('Invalid shiftCode')
  })

  test('rejects inactive selected shift', () => {
    expect(() => validateAttendanceShiftDefinition('A', { active: false })).toThrow('Shift is inactive')
  })

  test('accepts active selected shift', () => {
    expect(() => validateAttendanceShiftDefinition('A', { active: true })).not.toThrow()
  })

  test('accepts omitted shift code', () => {
    expect(() => validateAttendanceShiftDefinition(undefined, undefined)).not.toThrow()
  })
})
