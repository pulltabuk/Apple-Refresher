-- Run this after supabase-schema-update-19.sql. Adds two more optional
-- link fields to products, both safe to leave empty:
--
-- 1. specs_url: Apple's tech specs page for the product.
-- 2. press_release_url: Apple's newsroom announcement. Usually only
--    available for recent products, so older ones just stay empty.
--
-- The existing apple_url (official product page) and external_link
-- (Wikipedia) fields are unchanged.

alter table products add column if not exists specs_url text;
alter table products add column if not exists press_release_url text;
