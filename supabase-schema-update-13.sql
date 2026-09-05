-- Run this after supabase-schema-update-12.sql. Adds an explicit field
-- for grouping products into a shared timeline (e.g. every iPhone,
-- regardless of exact category spelling), instead of relying on the
-- Category field matching exactly across every related product, which
-- is fragile (a typo, a trailing space, "iPhone" vs "iPhones" all
-- silently break the shared timeline).
--
-- Leave it blank and a product still falls back to matching by
-- Category, exactly as before, so nothing breaks for existing data.

alter table products add column if not exists timeline_name text;
