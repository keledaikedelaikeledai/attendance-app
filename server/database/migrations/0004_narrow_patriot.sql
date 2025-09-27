CREATE TABLE `shift` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`active` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
DROP INDEX "session_token_unique";--> statement-breakpoint
DROP INDEX "user_email_unique";--> statement-breakpoint
DROP INDEX "user_username_unique";--> statement-breakpoint
DROP INDEX "attendance_day_user_date_unique";--> statement-breakpoint
ALTER TABLE `account` ALTER COLUMN "created_at" TO "created_at" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer));--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_day_user_date_unique` ON `attendance_day` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `session` ALTER COLUMN "created_at" TO "created_at" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer));--> statement-breakpoint
ALTER TABLE `session` ADD `impersonated_by` text;--> statement-breakpoint
ALTER TABLE `user` ALTER COLUMN "email_verified" TO "email_verified" integer NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `user` ALTER COLUMN "created_at" TO "created_at" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer));--> statement-breakpoint
ALTER TABLE `user` ALTER COLUMN "updated_at" TO "updated_at" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer));--> statement-breakpoint
ALTER TABLE `user` ADD `role` text;--> statement-breakpoint
ALTER TABLE `user` ADD `banned` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `user` ADD `ban_reason` text;--> statement-breakpoint
ALTER TABLE `user` ADD `ban_expires` integer;--> statement-breakpoint
ALTER TABLE `verification` ALTER COLUMN "created_at" TO "created_at" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer));--> statement-breakpoint
ALTER TABLE `verification` ALTER COLUMN "updated_at" TO "updated_at" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer));--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attendance_day` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`selected_shift_code` text,
	`shift_type` text DEFAULT 'harian' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attendance_day_shift_type_check" CHECK("__new_attendance_day"."shift_type" IN ('harian','bantuan'))
);
--> statement-breakpoint
INSERT INTO `__new_attendance_day`("id", "user_id", "date", "selected_shift_code", "shift_type", "created_at", "updated_at") SELECT "id", "user_id", "date", "selected_shift_code", "shift_type", "created_at", "updated_at" FROM `attendance_day`;--> statement-breakpoint
DROP TABLE `attendance_day`;--> statement-breakpoint
ALTER TABLE `__new_attendance_day` RENAME TO `attendance_day`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `attendance_log` ADD `shift_type` text;