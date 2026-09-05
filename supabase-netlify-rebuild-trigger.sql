-- Run this in Supabase's SQL Editor (not the Database Webhooks UI, which
-- is failing on this project with "schema supabase_functions does not
-- exist"). This does the exact same job directly with pg_net, which
-- you've already confirmed is enabled.

-- Replace this with your actual Netlify build hook URL (the same one
-- from your screenshot).
-- e.g. https://api.netlify.com/build_hooks/6a9b51a3776d0dcedee291fd

create or replace function public.trigger_netlify_build()
returns trigger
language plpgsql
as $$
begin
  perform net.http_post(
    url := 'PASTE_YOUR_NETLIFY_BUILD_HOOK_URL_HERE',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  return null;
end;
$$;

drop trigger if exists products_netlify_rebuild on public.products;
create trigger products_netlify_rebuild
after insert or update or delete on public.products
for each row execute function public.trigger_netlify_build();

drop trigger if exists gallery_photos_netlify_rebuild on public.gallery_photos;
create trigger gallery_photos_netlify_rebuild
after insert or update or delete on public.gallery_photos
for each row execute function public.trigger_netlify_build();
