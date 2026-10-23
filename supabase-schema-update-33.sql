-- Run this after supabase-schema-update-32.sql. Marks a discontinued
-- product as the last of its family (Apple ended the line with it), so
-- the family's page says the line has ended instead of counting down to
-- a next model. Safe to run more than once.

alter table products add column if not exists last_in_line boolean not null default false;
