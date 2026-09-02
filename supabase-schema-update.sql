-- Run this once in the Supabase SQL editor. It adds what's needed for
-- the admin panel: authenticated write access to products, and a small
-- table to hold the About page's editable text and image.

-- Products already have public read access from the base schema. RLS
-- was blocking all writes since no insert/update/delete policy existed
-- yet, these three add that back, but only for a logged-in admin.
create policy "Authenticated insert"
  on products for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated update"
  on products for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated delete"
  on products for delete
  using (auth.role() = 'authenticated');

-- About page content: a single row, id fixed to 'about'.
create table if not exists site_content (
  id text primary key default 'about',
  heading text,
  body text,
  image_url text,
  updated_at timestamptz not null default now()
);

alter table site_content enable row level security;

create policy "Public read access"
  on site_content for select
  using (true);

create policy "Authenticated write access"
  on site_content for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Lets the logged-in admin upload screenshots to the product-images
-- bucket you already created. Public read on that bucket comes from
-- marking it "Public" in Storage settings, this just adds upload rights.
create policy "Authenticated uploads to product-images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');
