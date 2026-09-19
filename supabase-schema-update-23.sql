-- Run this after supabase-schema-update-22.sql. Lets the heading and the
-- standard line beneath it be edited too, not just the intro paragraph,
-- and extends page_content to the rest of the site's pages.
--
-- Keys now in use: home, products, discontinued, categories, gallery,
-- events, facts, and category:<slug> for each family page.

alter table page_content add column if not exists heading text;
alter table page_content add column if not exists subheading text;
alter table page_content add column if not exists hide_default_line boolean not null default false;
