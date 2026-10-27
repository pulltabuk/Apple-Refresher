-- A product's pre-order time with its time zone ("1pm UK", "5am PT"),
-- for when pre-orders for its upcoming release open. With a pre-order
-- date set for that release, the homepage counts down to pre-orders
-- first, then to the release. Empty means 1pm UK. Safe to run more than
-- once. Run it in the Supabase SQL editor (after
-- supabase-schema-update-37.sql).

alter table products add column if not exists preorder_time text;
notify pgrst, 'reload schema';
