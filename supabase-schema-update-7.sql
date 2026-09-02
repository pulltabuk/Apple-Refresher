-- Run this after supabase-schema-update-6.sql. Adds a checkbox that
-- marks whether a product's most recent history entry was a genuine
-- new launch (a brand new product line) rather than a refresh of an
-- existing one. Defaults to false, so everything is treated as a
-- refresh unless you say otherwise, which is right for almost
-- everything you'll add.

alter table products add column if not exists is_new_launch boolean not null default false;
