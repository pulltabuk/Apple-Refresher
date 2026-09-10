-- Run this after supabase-schema-update-16.sql. A simple archive of
-- approved "interesting facts" computed from your product data, shown
-- on the homepage and at /facts/. You generate candidates in admin,
-- review them, and publish whichever ones you like, they're kept
-- permanently (like Apple Events), newest first.

create table if not exists facts (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  created_at timestamptz not null default now()
);

alter table facts enable row level security;

create policy "Public read access on facts"
  on facts for select
  using (true);

create policy "Authenticated insert on facts"
  on facts for insert
  to authenticated
  with check (true);

create policy "Authenticated delete on facts"
  on facts for delete
  to authenticated
  using (true);
