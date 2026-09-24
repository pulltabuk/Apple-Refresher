# Supabase notes

## New tables need explicit grants (from 30 October 2026)

Supabase no longer grants Data API access automatically to new tables in
the `public` schema. Existing tables keep the access they already have,
so nothing on this site needed changing. Adding a **column** to an
existing table is also unaffected, since columns inherit the table's
permissions.

If a future schema update creates a **new table**, include these grants
in the same file, or the table will be invisible to the site and calls
will fail with "permission denied":

```sql
create table if not exists public.your_table (
  id uuid primary key default gen_random_uuid()
  -- ...
);

-- the browser reads with the anon key
grant select on public.your_table to anon;

-- signed-in admin users
grant select, insert, update, delete on public.your_table to authenticated;

-- the Netlify build reads with the service role key
grant select, insert, update, delete on public.your_table to service_role;
```

Tighten these if a table should not be publicly readable: drop the `anon`
grant and the browser will not be able to read it, while the build and
the admin panel still can.

## Tables this site uses

products, gallery_photos, apple_events, facts, category_icons,
product_redirects, page_content, site_content.

All were created before the change and keep their existing access.
