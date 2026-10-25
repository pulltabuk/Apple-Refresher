-- A line or two of context for a gallery album ("Taken at a very busy
-- Apple Store in Cardiff the day after the iPhone Duo launch"), shown
-- under its title and used as its search description. Safe to run more
-- than once. Run it in the Supabase SQL editor.

alter table gallery_photos add column if not exists story text;
notify pgrst, 'reload schema';
