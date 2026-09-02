# Apple Refresher

Static site, generated at build time from a Supabase table, deployed on Netlify.
No JavaScript rendering on the way in, so it's crawlable from day one.

## 1. Supabase

1. Create a new project (or use an existing one).
2. Open the SQL editor and run `supabase-schema.sql`.
3. Add your first few products in Table Editor > products. Minimum fields:
   `slug`, `name`, `category`, `refresh_history` (a JSON array of past
   refresh dates, oldest first, e.g. `["2024-09-20", "2025-09-19"]`).
4. For a product screenshot: Storage > create a bucket called
   `product-images` (public) > upload the image > copy its public URL into
   that product's `image_url` column.
5. Settings > API: copy the Project URL, the `service_role` key, and the
   `anon` key, you'll need all three in step 3 below.

## 2. Local preview

```
npm install
node build.js
```

Runs with sample data if no `.env` is set, open `dist/index.html` in a
browser to check it looks right before connecting real data.

## 3. Netlify

1. Push this folder to a GitHub repo, connect it in Netlify as a new site.
2. Site settings > Environment variables, add `SITE_URL`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (see `.env.example`).
   Build command and publish directory are already set in `netlify.toml`.
3. Deploy. The site now builds from your real Supabase data.

## 4. Rebuild when you edit a product

The site only updates when Netlify rebuilds it, so wire up a rebuild
whenever a product changes:

1. Netlify: Site settings > Build & deploy > Build hooks, create one, copy
   the URL.
2. Supabase: Database > Webhooks, create one on the `products` table for
   Insert and Update, set it to call that build hook URL.

Now editing a row in Supabase's table editor triggers a fresh build
automatically, no separate admin panel needed.

## Notes

- Status (fresh / aging / overdue) is computed automatically from each
  product's own `refresh_history`, once it has two or more entries. Until
  then it falls back to a per-category typical cycle length, see
  `src/status.js` to adjust either.
- The "waiting for this" button writes straight to Supabase via a
  Postgres function, so it never needs a backend of its own. One vote per
  browser, tracked in localStorage.
- Discontinued products: set `discontinued = true` and a
  `discontinued_date`, they'll drop out of the main pages and appear on
  `/discontinued/` automatically.
