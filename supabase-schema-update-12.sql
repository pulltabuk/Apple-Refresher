-- Run this after supabase-schema-update-11.sql. When multi-photo
-- support was added, new gallery entries switched to saving into
-- image_urls (plural) instead of image_url (singular), but the old
-- image_url column was still marked as required, so every new save
-- was rejected. This makes it optional, since image_urls now does
-- the real work; existing rows with a value in image_url are
-- untouched.

alter table gallery_photos alter column image_url drop not null;
