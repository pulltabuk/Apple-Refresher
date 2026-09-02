-- Run this after supabase-schema-update-4.sql. Adds the two fields the
-- discontinued archive uses: which product took its place, and a short
-- line on why it went. Launch date and lifespan need nothing new, they
-- come from refresh_history and discontinued_date.

alter table products add column if not exists replaced_by text;
alter table products add column if not exists discontinued_reason text;

-- replaced_by holds the slug of the successor product (e.g. 'macbook-air'),
-- which the admin panel fills in for you when you pick from the list.
