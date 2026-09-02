-- Run this after supabase-schema-update-3.sql. Resets a product's
-- waiting_count back to 0 the moment a new refresh date is added to
-- its history, since that's exactly when the "wait" is over. Works as
-- a database trigger, so it applies no matter how the row gets
-- updated, admin panel, Supabase table editor, or anything else.

create or replace function reset_waiting_on_refresh()
returns trigger as $$
begin
  if new.refresh_history is distinct from old.refresh_history
     and jsonb_array_length(new.refresh_history) > jsonb_array_length(old.refresh_history) then
    new.waiting_count := 0;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reset_waiting_on_refresh on products;
create trigger trg_reset_waiting_on_refresh
before update on products
for each row execute function reset_waiting_on_refresh();
