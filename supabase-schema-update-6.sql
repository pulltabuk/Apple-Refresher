-- Run this after supabase-schema-update-5.sql. Adds "previous model"
-- (mirrors replaced_by, but pointing backward, so current products can
-- link to what they succeeded), and days_basis, which lets a product's
-- badge show days since launch instead of days since refresh.

alter table products add column if not exists previous_model text;
alter table products add column if not exists days_basis text not null default 'refresh';

-- previous_model and replaced_by both hold a product's slug (e.g.
-- 'iphone-16-pro'), same pattern as before. days_basis is either
-- 'refresh' (default) or 'launch'.
