-- Run this after supabase-schema-update-13.sql. Splits gallery photo
-- location into two fields: Location (e.g. "Cardiff") and Country
-- (e.g. "United Kingdom"), shown together as the top pill row, location
-- first, then country.

alter table gallery_photos add column if not exists country text;
