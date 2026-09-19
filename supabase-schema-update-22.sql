-- Run this after supabase-schema-update-21.sql. Adds editable intro and
-- footer text for the homepage and for each family (category) page, so
-- those pages have real words on them for readers and for Google.
--
-- One row per page. The key is 'home' for the homepage, or
-- 'category:<slug>' for a family page, e.g. 'category:airpods'.
-- show_stats turns on an automatic sentence built from your own data
-- ("Apple has refreshed these every 2 years on average"), which stays
-- current by itself because the build works it out each time.

create table if not exists page_content (
  key text primary key,
  intro_html text,
  footer_html text,
  show_stats boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table page_content enable row level security;

drop policy if exists "Public read page content" on page_content;
create policy "Public read page content" on page_content
  for select using (true);

drop policy if exists "Authenticated manage page content" on page_content;
create policy "Authenticated manage page content" on page_content
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
