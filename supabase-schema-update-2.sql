-- Run this after supabase-schema-update.sql. Adds support for multiple
-- product photos (up to 6, enforced in the admin panel) and one
-- optional video, replacing the old single image_url field.

alter table products add column if not exists image_urls jsonb not null default '[]';
alter table products add column if not exists video_url text;

-- The old image_url column is no longer written to. Safe to leave in
-- place, or run this once every product has been re-saved through the
-- admin panel:
-- alter table products drop column if exists image_url;
