import { sql } from 'drizzle-orm'
import { check, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from './auth-schema'

// Shift definitions table
export const shift = sqliteTable('shift', {
  code: text('code').primaryKey(), // e.g., 'pagi'
  label: text('label').notNull(), // e.g., 'Pagi (07:00-15:00)'
  start: text('start').notNull(), // 'HH:MM'
  end: text('end').notNull(), // 'HH:MM'
  active: integer('active', { mode: 'boolean' }).$defaultFn(() => true).notNull(),
  sortOrder: integer('sort_order').$defaultFn(() => 0).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
})

// Attendance tables

export const attendanceDay = sqliteTable(
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
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  },
  table => ({
    uniqUserDate: uniqueIndex('attendance_day_user_date_unique').on(table.userId, table.date),
    shiftTypeCheck: check('attendance_day_shift_type_check', sql`${table.shiftType} IN ('harian','bantuan')`),
  }),
)

export const attendanceLog = sqliteTable('attendance_log', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Local calendar date from client in YYYY-MM-DD
  date: text('date').notNull(),
  type: text('type', { length: 16 }).notNull(), // 'clock-in' | 'clock-out'
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  lat: real('lat'),
  lng: real('lng'),
  accuracy: real('accuracy'),
  shiftCode: text('shift_code'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
})
