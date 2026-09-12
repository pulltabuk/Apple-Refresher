-- Run this after supabase-schema-update-17.sql. Lets you upload your
-- own icon per category from the admin product form, instead of
-- relying on the hardcoded icon shapes. Any category with a row here
-- uses your uploaded image everywhere its icon appears; categories
-- without one keep using the built-in shape as a fallback.

create table if not exists category_icons (
  category text primary key,
  icon_url text not null,
  updated_at timestamptz not null default now()
);

alter table category_icons enable row level security;

create policy "Public read access on category_icons"
  on category_icons for select
  using (true);

create policy "Authenticated insert on category_icons"
  on category_icons for insert
  to authenticated
  with check (true);

create policy "Authenticated update on category_icons"
  on category_icons for update
  to authenticated
  using (true);

create policy "Authenticated delete on category_icons"
  on category_icons for delete
  to authenticated
  using (true);
