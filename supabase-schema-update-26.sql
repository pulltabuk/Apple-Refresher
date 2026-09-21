-- A short, engaging fact shown near the top of a product page.
-- Run this in the Supabase SQL editor.

alter table products
  add column if not exists did_you_know text;
