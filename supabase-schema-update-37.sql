-- A product's release time with its time zone ("8am UK", "9am ET"), for
-- the countdowns to its upcoming release (homepage, Coming soon page and
-- the product's own page). Empty means 8am on the day, when Apple Stores
-- open. Safe to run more than once. Run it in the Supabase SQL editor.

alter table products add column if not exists release_time text;
notify pgrst, 'reload schema';
