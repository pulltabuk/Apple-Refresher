-- Adds an "As of" date to each product's "Did you know?" fact, so readers
-- know when the fact was written. Safe to run more than once.
-- Run it in the Supabase SQL editor.
alter table products add column if not exists did_you_know_date date;
