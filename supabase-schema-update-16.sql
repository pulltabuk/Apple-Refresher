-- Run this after supabase-schema-update-15.sql. Replaces the
-- single-record "current event" approach with a real table, so past
-- Apple Events are kept as a permanent archive rather than being
-- overwritten each time. The homepage automatically shows whichever
-- event has the nearest upcoming date; once that date passes, it
-- just becomes another entry in the archive.

create table if not exists apple_events (
  id uuid primary key default gen_random_uuid(),
  heading text not null,
  image_url text not null,
  event_date date not null,
  event_time text,
  event_url text,
  announced_products jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table apple_events enable row level security;

create policy "Public read access on apple_events"
  on apple_events for select
  using (true);

create policy "Authenticated insert on apple_events"
  on apple_events for insert
  to authenticated
  with check (true);

create policy "Authenticated update on apple_events"
  on apple_events for update
  to authenticated
  using (true);

create policy "Authenticated delete on apple_events"
  on apple_events for delete
  to authenticated
  using (true);
