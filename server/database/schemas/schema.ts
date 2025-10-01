import { sql } from 'drizzle-orm'
import { boolean, check, doublePrecision, integer, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { user } from './auth-schema'

// Shift definitions table
export const shift = pgTable('shift', {
  code: text('code').primaryKey(), // e.g., 'pagi'
  label: text('label').notNull(), // e.g., 'Pagi (07:00-15:00)'
  start: text('start').notNull(), // 'HH:MM'
  end: text('end').notNull(), // 'HH:MM'
  active: boolean('active').$defaultFn(() => true).notNull(),
  sortOrder: integer('sort_order').$defaultFn(() => 0).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).$defaultFn(() => new Date()).notNull(),
})

// Attendance tables

export const attendanceDay = pgTable(
  'attendance_day',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Local calendar date from client in YYYY-MM-DD (e.g., 2025-09-06)
    date: text('date').notNull(),
    selectedShiftCode: text('selected_shift_code'),
    shiftType: text('shift_type').default('harian').notNull().$type<'harian' | 'bantuan'>(),
    createdAt: timestamp('created_at', { mode: 'date' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).$defaultFn(() => new Date()).notNull(),
  },
  table => ({
    uniqUserDate: uniqueIndex('attendance_day_user_date_unique').on(table.userId, table.date),
    shiftTypeCheck: check('attendance_day_shift_type_check', sql`${table.shiftType} IN ('harian','bantuan')`),
  }),
)

export const attendanceLog = pgTable('attendance_log', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Local calendar date from client in YYYY-MM-DD
  date: text('date').notNull(),
  type: varchar('type', { length: 16 }).notNull(), // 'clock-in' | 'clock-out'
  timestamp: timestamp('timestamp', { mode: 'date' }).notNull(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  accuracy: doublePrecision('accuracy'),
  shiftType: text('shift_type'),
  shiftCode: text('shift_code'),
  // Optional short reason for early clock-out (max 200 chars enforced by application)
  earlyReason: text('early_reason'),
  createdAt: timestamp('created_at', { mode: 'date' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).$defaultFn(() => new Date()).notNull(),
})
