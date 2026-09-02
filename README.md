# Apple Refresher

Static site, generated at build time from a Supabase table, deployed on Netlify.
No JavaScript rendering on the way in, so it's crawlable from day one.

## 1. Supabase

1. Create a new project (or use an existing one).
2. Open the SQL editor and run `supabase-schema.sql`, then
   `supabase-schema-update.sql`. The second one adds the About page's
   content table and lets a logged-in admin edit products.
3. Storage > create a bucket called `product-images`, mark it Public.
4. Settings > API: copy the Project URL, the `service_role` key, and the
   `anon` key, you'll need all three below.
5. Authentication > Users > Add user: create yourself a login (email +
   password). This is what you'll use to sign into `/admin/` on the live
   site, it's the only account that can add, edit, or delete products
   and the About page.

You can still add products directly in Table Editor if you'd rather, the
admin panel is just a friendlier way to do the same thing.

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

## 5. Using the admin panel

Once the site's live, go to `your-site.netlify.app/admin/` and log in with
the email and password you created in Supabase. From there you can add,
edit, and delete products (with screenshot upload), and edit the About
page's heading, text, and image. Changes save straight to Supabase, they
go live on the site's next rebuild, so set up the webhook in step 4 above
if you haven't already.

The admin link sits in the site's footer. It's marked `noindex` so search
engines won't list it, but it isn't hidden, anyone who finds the URL
still needs your login to change anything.

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
