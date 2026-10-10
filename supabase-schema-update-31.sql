-- A line or two summing up an Apple Event, shown on its page and used as
-- its search-engine description. Safe to run more than once.
-- Run it in the Supabase SQL editor.
alter table apple_events add column if not exists summary text;
