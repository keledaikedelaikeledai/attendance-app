import { createError } from 'h3'

export function validateAttendanceShiftType(shiftType: unknown): asserts shiftType is 'harian' | 'bantuan' | undefined {
  if (shiftType !== undefined && shiftType !== 'harian' && shiftType !== 'bantuan') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid shiftType' })
  }
}

export function validateAttendanceShiftDefinition(shiftCode: string | undefined, shiftDef: { active: boolean } | undefined) {
  if (shiftCode && !shiftDef) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid shiftCode' })
  }
  if (shiftDef && !shiftDef.active) {
    throw createError({ statusCode: 400, statusMessage: 'Shift is inactive' })
  }
}
