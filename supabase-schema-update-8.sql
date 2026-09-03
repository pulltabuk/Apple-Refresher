-- Run this after supabase-schema-update-7.sql. Adds a single "original
-- launch date" field, for the true origin of a product line (e.g. the
-- original iPhone), separate from this specific model's own refresh
-- history. Optional: leave blank and the timeline falls back to the
-- existing behaviour.

alter table products add column if not exists original_launch_date text;
