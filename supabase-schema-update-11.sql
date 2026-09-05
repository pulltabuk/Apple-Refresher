-- Run this after supabase-schema-update-10.sql. Adds support for up to
-- 6 photos per gallery entry (e.g. several angles of the same product
-- taken in one visit), while keeping existing single-photo entries
-- working exactly as before.

alter table gallery_photos add column if not exists image_urls jsonb not null default '[]'::jsonb;

-- Migrate any existing single-photo entries into the new array field.
update gallery_photos
set image_urls = jsonb_build_array(image_url)
where image_url is not null and jsonb_array_length(image_urls) = 0;
