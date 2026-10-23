-- Only the site owner's login can change anything.
--
-- Until now any signed-in account could edit every table, and Supabase
-- lets anyone create an account unless sign-ups are switched off. This
-- adds a second lock: every table (and uploaded files) can only be
-- changed by the owner's email address below. Visitors still read the
-- site as before, and the "waiting" button still counts.
--
-- If you ever log in to the admin with a different email, change it
-- below and run this again. Safe to run more than once.
-- Run it in the Supabase SQL editor.

do $$
declare
  owner_email text := 'jgprice@mac.com';
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('drop policy if exists %I on public.%I', 'Only the site owner can change', t.tablename);
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated '
        'using (lower(coalesce(auth.jwt() ->> ''email'', '''')) = %L) '
        'with check (lower(coalesce(auth.jwt() ->> ''email'', '''')) = %L)',
        'Only the site owner can change', t.tablename, lower(owner_email), lower(owner_email));
    exception when others then
      raise notice 'Skipped %: %', t.tablename, sqlerrm;
    end;
  end loop;

  -- Uploaded photos, icons, videos and X cards.
  begin
    execute format('drop policy if exists %I on storage.objects', 'Only the site owner can change files');
    execute format(
      'create policy %I on storage.objects as restrictive for all to authenticated '
      'using (lower(coalesce(auth.jwt() ->> ''email'', '''')) = %L) '
      'with check (lower(coalesce(auth.jwt() ->> ''email'', '''')) = %L)',
      'Only the site owner can change files', lower(owner_email), lower(owner_email));
  exception when others then
    raise notice 'Skipped storage: %', sqlerrm;
  end;
end $$;

-- Any table listed here has no row security at all, so the lock above
-- can't apply to it: tell Claude if anything shows up.
select tablename as "Tables without row security (should be none)"
from pg_tables
where schemaname = 'public' and not rowsecurity;
