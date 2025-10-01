CREATE TABLE `shift` (
  `code` text PRIMARY KEY NOT NULL,
  `label` text NOT NULL,
  `start` text NOT NULL,
  `end` text NOT NULL,
  `active` integer NOT NULL DEFAULT 1,
  `sort_order` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `shift` (`code`,`label`,`start`,`end`,`active`,`sort_order`,`created_at`,`updated_at`) VALUES
('pagi','Pagi (07:00-15:00)','07:00','15:00',1,1,strftime('%s','now'),strftime('%s','now')),
('siang','Siang (12:00-20:00)','12:00','20:00',1,2,strftime('%s','now'),strftime('%s','now')),
('sore','Sore (15:00-23:00)','15:00','23:00',1,3,strftime('%s','now'),strftime('%s','now')),
('malam','Malam (23:00-07:00)','23:00','07:00',1,4,strftime('%s','now'),strftime('%s','now'));
