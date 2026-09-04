-- Run this after supabase-schema-update-8.sql. Adds a table for the
-- personal photo gallery: your own Apple Store photos, with a date,
-- a location, and free-form tags, kept separate from the product
-- catalogue itself.

create table if not exists gallery_photos (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  caption text,
  date_taken text,
  location text,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table gallery_photos enable row level security;

create policy "Public read access on gallery_photos"
  on gallery_photos for select
  using (true);

create policy "Authenticated insert on gallery_photos"
  on gallery_photos for insert
  to authenticated
  with check (true);

create policy "Authenticated update on gallery_photos"
  on gallery_photos for update
  to authenticated
  using (true);

create policy "Authenticated delete on gallery_photos"
  on gallery_photos for delete
  to authenticated
  using (true);

-- Uploaded photos reuse the existing "product-images" storage bucket,
-- no new bucket needed.
