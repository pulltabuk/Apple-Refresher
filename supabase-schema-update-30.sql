-- Lets a published fact be put on the homepage "Did you know?" on a day
-- you choose (today, or a date ahead), instead of waiting its turn in
-- the daily rotation. Safe to run more than once.
-- Run it in the Supabase SQL editor.
alter table facts add column if not exists homepage_date date;
