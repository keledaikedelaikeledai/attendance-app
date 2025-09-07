-- Seed default shifts (idempotent)
INSERT INTO `shift` (`code`,`label`,`start`,`end`,`active`,`sort_order`,`created_at`,`updated_at`) VALUES
('pagi','Pagi (07:00-15:00)','07:00','15:00',1,1,strftime('%s','now'),strftime('%s','now')),
('siang','Siang (12:00-20:00)','12:00','20:00',1,2,strftime('%s','now'),strftime('%s','now')),
('sore','Sore (15:00-23:00)','15:00','23:00',1,3,strftime('%s','now'),strftime('%s','now')),
('malam','Malam (23:00-07:00)','23:00','07:00',1,4,strftime('%s','now'),strftime('%s','now'))
ON CONFLICT(`code`) DO UPDATE SET
  `label`=excluded.`label`,
  `start`=excluded.`start`,
  `end`=excluded.`end`,
  `active`=excluded.`active`,
  `sort_order`=excluded.`sort_order`,
  `updated_at`=strftime('%s','now');
