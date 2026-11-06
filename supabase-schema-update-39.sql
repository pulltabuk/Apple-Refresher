-- Creates the page_content table if it is missing: the editable heading,
-- standard line, intro and extra text for the homepage and other pages
-- (Admin > Page text). It brings together supabase-schema-update-22.sql
-- and -23.sql, for a database that never had them ("Could not find the
-- table 'public.page_content' in the schema cache"), with the access
-- rules every table here uses and the grants Supabase now requires for
-- a new table (see SUPABASE-NOTES.md).
--
-- Safe to run more than once, and on a database that already has the
-- table. Run it in the Supabase SQL editor.

create table if not exists public.page_content (
  key text primary key,
  intro_html text,
  footer_html text,
  show_stats boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.page_content add column if not exists heading text;
alter table public.page_content add column if not exists subheading text;
alter table public.page_content add column if not exists hide_default_line boolean not null default false;

-- Anyone may read (the site shows it); only signed-in admin users may write.
alter table public.page_content enable row level security;
drop policy if exists "Public read page content" on public.page_content;
drop policy if exists "Authenticated manage page content" on public.page_content;
drop policy if exists "public read" on public.page_content;
drop policy if exists "authenticated write" on public.page_content;
create policy "public read" on public.page_content
  for select to anon, authenticated using (true);
create policy "authenticated write" on public.page_content
  for all to authenticated using (true) with check (true);

-- The browser reads with the anon key; the admin writes signed in; the
-- Netlify build reads with the service role key.
grant select on public.page_content to anon;
grant select, insert, update, delete on public.page_content to authenticated;
grant select, insert, update, delete on public.page_content to service_role;

-- So the site sees the table straight away.
notify pgrst, 'reload schema';
