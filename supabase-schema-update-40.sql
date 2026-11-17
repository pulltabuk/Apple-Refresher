-- Lets a product's discontinued date be just a month ("2001-01") or a
-- year ("2001") as well as an exact day, the same as its launch and
-- release dates (Admin > a product > step 3 > Discontinued > "Month
-- only" or "Year only"). The column only took a full calendar date; this
-- makes it text, and every date already saved stays exactly as it is.
--
-- Safe to run more than once. Run it in the Supabase SQL editor (after
-- supabase-schema-update-39.sql).

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'discontinued_date' and data_type = 'date'
  ) then
    alter table public.products
      alter column discontinued_date type text
      using to_char(discontinued_date, 'YYYY-MM-DD');
  end if;
end $$;

notify pgrst, 'reload schema';
