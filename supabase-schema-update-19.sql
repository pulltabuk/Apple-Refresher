-- Run this after supabase-schema-update-18.sql. Adds two optional
-- fields to products, both safe to leave empty:
--
-- 1. generation_details: extra info for each date already in
--    refresh_history, keyed by that date, e.g.
--    { "2022-09-23": { "name": "AirPods Pro (2nd generation)", "announced": "2022-09-07" } }
--    refresh_history stays the source of truth for dates, so nothing
--    that already reads it changes. Any generation without a name gets
--    one generated automatically at build time.
--
-- 2. icon_url: an optional icon for this one product line (e.g.
--    AirPods Max inside the AirPods family). Blank means the family
--    (category) icon is used, exactly as before.

alter table products add column if not exists generation_details jsonb not null default '{}'::jsonb;
alter table products add column if not exists icon_url text;
