-- X post drafts waiting for review in the admin (X posts tab), written
-- each morning from the site's own data and, with an Anthropic key, by
-- Claude. Private: only the site owner's login can see or change them
-- (the morning job writes with the service key). Safe to run more than once.
-- Run it in the Supabase SQL editor.

create table if not exists x_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text,                       -- On this day, Still waiting, Did you know?
  origin text not null default 'site',  -- 'site' (your data) or 'claude' (researched)
  text text not null,
  link text,
  sources jsonb not null default '[]'::jsonb,
  card jsonb,
  status text not null default 'new',   -- new, queued, scheduled, rejected
  buffer_post_id text,
  scheduled_for timestamptz,
  decided_at timestamptz
);
create index if not exists x_drafts_status_idx on x_drafts (status, created_at desc);

alter table x_drafts enable row level security;
drop policy if exists "Owner reads drafts" on x_drafts;
create policy "Owner reads drafts" on x_drafts for select to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'jgprice@mac.com');
drop policy if exists "Owner changes drafts" on x_drafts;
create policy "Owner changes drafts" on x_drafts for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'jgprice@mac.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'jgprice@mac.com');

notify pgrst, 'reload schema';
