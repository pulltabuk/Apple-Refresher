-- Run this after supabase-schema-update-14.sql. Adds fields for an
-- "Apple Event" announcement that can temporarily take over the
-- homepage's featured slot (image, title, date, time), reusing the
-- existing site_content table with id = 'event'. Once event_date has
-- passed, the site automatically falls back to the regular featured
-- product, no manual cleanup needed.

alter table site_content add column if not exists event_date date;
alter table site_content add column if not exists event_time text;
