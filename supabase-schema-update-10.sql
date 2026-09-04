-- Run this after supabase-schema-update-9.sql. Adds a field for the
-- official Apple product page URL, separate from the general "More
-- information" link, plus a flag for when Apple has taken that page
-- down (common for older discontinued products).

alter table products add column if not exists apple_url text;
alter table products add column if not exists apple_url_unavailable boolean not null default false;
