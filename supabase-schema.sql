-- Run this once in the Supabase SQL editor for a new project.

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null default 'Other', -- iPhone, Mac, iPad, Apple Watch, AirPods, Other
  price text,
  chip text,
  image_url text,
  refresh_history jsonb not null default '[]', -- e.g. ["2024-09-20", "2025-09-19"]
  rumor_note text,
  featured boolean not null default false,
  waiting_count integer not null default 0,
  discontinued boolean not null default false,
  discontinued_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Public read access (the build script uses the service role key and
-- bypasses this, but the anon key needs read access too if you ever
-- query Supabase directly from the browser).
alter table products enable row level security;

create policy "Public read access"
  on products for select
  using (true);

-- The waiting button calls this function instead of updating the row
-- directly, so anonymous visitors can only ever increment by one.
create or replace function increment_waiting(product_id_input uuid)
returns void as $$
begin
  update products
  set waiting_count = waiting_count + 1
  where id = product_id_input;
end;
$$ language plpgsql security definer;

grant execute on function increment_waiting(uuid) to anon;

-- Add a product's screenshot: upload it in Storage > product-images,
-- then paste the public URL into that row's image_url column.
