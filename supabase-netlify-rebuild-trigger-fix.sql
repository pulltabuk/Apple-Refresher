-- Run this in Supabase's SQL Editor. This replaces the function from
-- before with the same one, but with your actual Netlify build hook
-- URL in place of the placeholder text that caused the "Bad scheme"
-- error. The trigger itself doesn't need to be recreated, it already
-- points at this function by name.

create or replace function public.trigger_netlify_build()
returns trigger
language plpgsql
as $$
begin
  perform net.http_post(
    url := 'https://api.netlify.com/build_hooks/6a9b51a3776d0dcedee291fd',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  return null;
end;
$$;
