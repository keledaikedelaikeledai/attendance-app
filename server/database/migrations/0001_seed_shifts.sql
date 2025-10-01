-- Seed default shifts (idempotent)
INSERT INTO "shift" ("code","label","start","end","active","sort_order","created_at","updated_at") VALUES
('pagi','Pagi (07:00-15:00)','07:00','15:00',true,1,NOW(),NOW()),
('siang','Siang (12:00-20:00)','12:00','20:00',true,2,NOW(),NOW()),
('sore','Sore (15:00-23:00)','15:00','23:00',true,3,NOW(),NOW()),
('malam','Malam (23:00-07:00)','23:00','07:00',true,4,NOW(),NOW())
ON CONFLICT("code") DO UPDATE SET
  "label"=EXCLUDED."label",
  "start"=EXCLUDED."start",
  "end"=EXCLUDED."end",
  "active"=EXCLUDED."active",
  "sort_order"=EXCLUDED."sort_order",
  "updated_at"=NOW();
