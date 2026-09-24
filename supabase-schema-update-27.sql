-- URGENT: locks the public key out of writing to your data.
--
-- Right now anyone who views your site's source can take the public key
-- and change or delete rows. This turns Row Level Security on for every
-- table and applies one consistent rule:
--
--   * anyone may READ   (the site needs this)
--   * only signed-in admin users may WRITE
--   * the Netlify build is unaffected: the service role key bypasses RLS
--   * the "waiting for a refresh" button still works, because it goes
--     through increment_waiting(), which runs as its owner
--
-- Safe to run more than once, and it skips any table you do not have.
-- Run it in the Supabase SQL editor.

do $$
declare
  t text;
  tables text[] := array[
    'products', 'gallery_photos', 'apple_events', 'facts',
    'category_icons', 'product_redirects', 'page_content', 'site_content'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, no such table', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Replace any earlier policies so the outcome is the same either way.
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('drop policy if exists "authenticated write" on public.%I', t);

    execute format($f$
      create policy "public read" on public.%I
        for select to anon, authenticated using (true)
    $f$, t);

    execute format($f$
      create policy "authenticated write" on public.%I
        for all to authenticated using (true) with check (true)
    $f$, t);

    raise notice 'locked down %', t;
  end loop;
end $$;

-- Check the result: every table should show rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
