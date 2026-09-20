-- Lets a product with a future release date be shown in the homepage
-- countdown, without having to make it the featured product.
-- Run this in the Supabase SQL editor.

alter table products
  add column if not exists in_countdown boolean not null default false;
