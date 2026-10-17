-- Run this after supabase-schema-update-31.sql. Adds a flag for when
-- Apple no longer has a tech specs page for a product (common for very
-- old products), so the page says so instead of linking nowhere.
-- Safe to run more than once.

alter table products add column if not exists specs_url_unavailable boolean not null default false;
