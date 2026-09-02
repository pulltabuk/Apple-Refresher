-- Optional starter data. Run this once in the Supabase SQL editor after
-- the four schema-update files, if you want a running start instead of
-- typing every product in by hand.
--
-- Prices are in GBP. Several are a like-for-like swap of Apple's US
-- price (e.g. $799 -> £799), which is how Apple often prices the UK
-- market, but a few (MacBook Pro, Mac mini, Mac Studio, iPad Pro, iPad
-- Air, Vision Pro) are estimates where I couldn't confirm an exact UK
-- figure. Worth a quick check against apple.com/uk and correcting via
-- /admin/ where it's off, most are just the storage tier's opening
-- price at launch, not necessarily today's price.
--
-- Photos and video aren't included here, add those afterwards through
-- the admin panel for whichever products you care about most.

insert into products (slug, name, category, price, chip, external_link, refresh_history, rumor_note, coming_soon, expected_date) values

-- iPhone
('iphone-17', 'iPhone 17', 'iPhone', '£799', 'A19',
 'https://en.wikipedia.org/wiki/IPhone_17', '["2025-09-19"]', null, false, null),
('iphone-17-pro', 'iPhone 17 Pro', 'iPhone', '£1,099', 'A19 Pro',
 'https://en.wikipedia.org/wiki/IPhone_17', '["2025-09-19"]', null, false, null),
('iphone-17-pro-max', 'iPhone 17 Pro Max', 'iPhone', '£1,199', 'A19 Pro',
 'https://en.wikipedia.org/wiki/IPhone_17', '["2025-09-19"]', null, false, null),
('iphone-air', 'iPhone Air', 'iPhone', '£999', 'A19 Pro',
 'https://en.wikipedia.org/wiki/IPhone_Air', '["2025-09-19"]', 'Apple''s thinnest iPhone, replaces the Plus model this generation.', false, null),
('iphone-17e', 'iPhone 17e', 'iPhone', '£599', 'A19',
 'https://en.wikipedia.org/wiki/IPhone_17e', '["2026-03-11"]', 'Budget model, added to the lineup after the main September launch.', false, null),

-- Mac
('macbook-air-m5', 'MacBook Air (M5)', 'Mac', '£1,099', 'M5',
 'https://en.wikipedia.org/wiki/MacBook_Air', '["2025-03-12", "2026-03-11"]', '13-inch starting price, 15-inch starts higher.', false, null),
('macbook-pro-14-m5', 'MacBook Pro 14-inch (M5)', 'Mac', '£1,599', 'M5',
 'https://en.wikipedia.org/wiki/MacBook_Pro', '["2025-10-22"]', 'Entry-level 14-inch model, price is an estimate, check apple.com/uk.', false, null),
('mac-mini-m6', 'Mac mini (M6)', 'Mac', '£899', 'M6',
 'https://en.wikipedia.org/wiki/Mac_Mini', '["2024-11-08", "2026-08-25"]', 'Also available with M5 Pro at a higher price.', false, null),
('mac-studio-m5-max', 'Mac Studio (M5 Max)', 'Mac', '£2,499', 'M5 Max',
 'https://en.wikipedia.org/wiki/Mac_Studio', '["2026-08-25"]', 'M5 Ultra model also available, starting considerably higher.', false, null),

-- iPad
('ipad-pro-m5', 'iPad Pro (M5)', 'iPad', '£999', 'M5',
 'https://en.wikipedia.org/wiki/IPad_Pro', '["2025-10-22"]', '11-inch starting price, 13-inch starts higher.', false, null),
('ipad-air-m3', 'iPad Air (M3)', 'iPad', '£599', 'M3',
 'https://en.wikipedia.org/wiki/IPad_Air', '["2026-03-12"]', null, false, null),

-- Apple Watch
('apple-watch-series-11', 'Apple Watch Series 11', 'Apple Watch', '£399', 'S11',
 'https://en.wikipedia.org/wiki/Apple_Watch_Series_11', '["2025-09-19"]', '42mm starting price, 46mm starts a little higher.', false, null),
('apple-watch-ultra-3', 'Apple Watch Ultra 3', 'Apple Watch', '£799', 'S11',
 'https://en.wikipedia.org/wiki/Apple_Watch_Ultra_3', '["2025-09-19"]', null, false, null),

-- AirPods
('airpods-pro-3', 'AirPods Pro 3', 'AirPods', '£249', 'H2',
 'https://en.wikipedia.org/wiki/AirPods_Pro', '["2025-09-19"]', null, false, null),
('airpods-4', 'AirPods 4', 'AirPods', '£129', 'H2',
 'https://en.wikipedia.org/wiki/AirPods_(4th_generation)', '["2024-09-20"]', 'With ANC model costs more.', false, null),

-- Vision Pro
('vision-pro-m5', 'Apple Vision Pro (M5)', 'Vision Pro', '£3,499', 'M5',
 'https://en.wikipedia.org/wiki/Apple_Vision_Pro', '["2025-10-22"]', 'Price is an estimate, check apple.com/uk.', false, null),

-- Coming soon: confirmed for Apple's "Surprise and shine" event, 9 September 2026
('iphone-18-pro', 'iPhone 18 Pro', 'iPhone', null, 'A20 Pro',
 'https://en.wikipedia.org/wiki/IPhone_18', '[]', 'Announced at Apple''s September 9 event. Retail availability typically follows one to two weeks after announcement, based on past years.', true, '2026-09-09'),
('iphone-18-pro-max', 'iPhone 18 Pro Max', 'iPhone', null, 'A20 Pro',
 'https://en.wikipedia.org/wiki/IPhone_18', '[]', 'Announced at Apple''s September 9 event. Retail availability typically follows one to two weeks after announcement, based on past years.', true, '2026-09-09'),
('iphone-fold', 'iPhone Ultra (foldable)', 'iPhone', null, 'A20 Pro',
 'https://en.wikipedia.org/wiki/IPhone_Fold', '[]', 'Apple''s first foldable iPhone, announced at the September 9 event. Name unconfirmed until Apple''s keynote.', true, '2026-09-09');
