-- Run this after supabase-schema-update-2.sql. Adds Coming soon status,
-- an optional expected date, and an external link field (e.g. Wikipedia).
-- Category no longer has a fixed list, so nothing to change there, it's
-- just free text on the products table already.

alter table products add column if not exists coming_soon boolean not null default false;
alter table products add column if not exists expected_date date;
alter table products add column if not exists external_link text;
