-- Run this after supabase-schema-update-20.sql. Adds a small table of
-- page redirects, so a product page that no longer exists sends people
-- (and Google) to the page that replaced it instead of showing a 404.
--
-- Admin writes a row here when you delete a product and choose a page
-- to point it at. The build turns these into a Netlify _redirects file.

create table if not exists product_redirects (
  from_slug text primary key,
  to_path text not null,
  created_at timestamptz not null default now()
);

alter table product_redirects enable row level security;

drop policy if exists "Public read redirects" on product_redirects;
create policy "Public read redirects" on product_redirects
  for select using (true);

drop policy if exists "Authenticated manage redirects" on product_redirects;
create policy "Authenticated manage redirects" on product_redirects
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
