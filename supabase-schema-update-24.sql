-- Run this after supabase-schema-update-23.sql. Lets an Apple Event be
-- pinned to the homepage rather than the site always choosing the next
-- one by date. Only one event should be featured at a time; admin
-- clears the others when you tick this.

alter table apple_events add column if not exists featured boolean not null default false;
