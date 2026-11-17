-- Lets a discontinued date be a month ("2001-05") or just a year
-- ("2001"), as launch and release dates already can, for older products
-- whose exact day isn't known (Admin > product > Dates > Discontinued).
-- The column was a date, which only takes an exact day; it becomes text,
-- and the dates already saved stay as they are ("2022-05-10").
--
-- Safe to run more than once. Run it in the Supabase SQL editor.

alter table public.products
  alter column discontinued_date type text using discontinued_date::text;

notify pgrst, 'reload schema';
