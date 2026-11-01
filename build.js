const fs = require('fs');
const path = require('path');
const { computeStatus } = require('./src/status');
const shareImages = require('./src/share-images');
const { productGroup, appleName, earningsPage, nextEarnings, earningsQuarter, homePage, allProductsPage, discontinuedPage, comingSoonPage, categoriesIndexPage, categoryPage, productPage, aboutPage, aboutCounts, contactPage, contactThanksPage, notFoundPage, adminPage, uploadPage, galleryPage, galleryPhotoPage, galleryPhotoImages, siteStats, photoLicencePage, factRelatedLink, eventsPage, eventDetailPage, factsPage, factPage, setCustomCategoryIcons, launchDate, slugify, eventSlug, galleryPhotoSlug, rssFeedXml, mostRecentActivityDate, setServedPhotos, setLinkProducts, missingProductLinks, setEventTints } = require('./src/templates');
const { eventColours } = require('./src/event-colours');
const photoMirror = require('./src/photo-mirror');

const DEFAULT_ABOUT = {
  heading: 'About Apple Sunset',
  body: "Apple Sunset tracks how long it's been since every current Apple product was last updated, so you can tell at a glance whether now's a good time to buy or worth holding off.\n\nIt isn't trying to replace Apple's own site or the Apple news sites, there's no reviews or rumours here beyond a short note where relevant. It's simply a countdown for what's current and a searchable archive for what's been discontinued, one place to check either.\n\nIt's an independent project and isn't affiliated with Apple.",
  image_url: null,
};

// The public address of the site. Everything canonical, Open Graph,
// sitemap and RSS is built from this, so it must be the real domain and
// never the netlify.app address, or Google treats the two as rival
// copies of the same site and may rank neither.
// The public domain every canonical tag, share link and sitemap entry
// points at. A netlify.app address is never the right answer here, since
// that host only exists to redirect to the real one, so it is ignored
// even if the SITE_URL variable still holds it.
const CANONICAL_DOMAIN = 'https://applesunset.com';
const SITE_URL = (() => {
  const fromEnv = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (!fromEnv) return CANONICAL_DOMAIN;
  if (/\.netlify\.app$/i.test(fromEnv.replace(/^https?:\/\//, ''))) {
    console.warn(`SITE_URL is set to ${fromEnv}, which only redirects. Using ${CANONICAL_DOMAIN} instead.`);
    return CANONICAL_DOMAIN;
  }
  return fromEnv;
})();
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const DIST = path.join(__dirname, 'dist');

const sitemapUrls = [];

// When an album was last added or changed (YYYY-MM-DD), so the sitemap
// tells Google which albums are new.
function galleryLastmod(photo) {
  const stamp = photo.updated_at || photo.created_at;
  return stamp ? String(stamp).slice(0, 10) : null;
}

function xmlEscape(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function write(relPath, content, lastmod, images) {
  const fullPath = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  // Pages marked noindex must stay out of the sitemap: submitting one
  // tells Google to index a page that also tells it not to, which it
  // reports as an error.
  const isNoIndex = /<meta name="robots" content="[^"]*noindex/.test(content);
  if (relPath.endsWith('index.html') && !relPath.startsWith('admin/') && !isNoIndex) {
    const urlPath = '/' + relPath.replace(/index\.html$/, '');
    sitemapUrls.push({ path: urlPath, lastmod: lastmod || null, images: images || [] });
  }
}

function copyStatic() {
  const publicDir = path.join(__dirname, 'public');
  for (const file of fs.readdirSync(publicDir)) {
    fs.copyFileSync(path.join(publicDir, file), path.join(DIST, file));
  }
}

async function loadProducts() {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('products').select('*');
    if (error) throw error;
    if (!data || data.length === 0) {
      console.log('Connected to Supabase but no products yet — building with sample data instead.');
      return require('./src/data.sample').products;
    }
    console.log(`Loaded ${data.length} products from Supabase.`);
    // Apple's spelling for names and categories ("Mac Mini" -> "Mac mini").
    return data.map((p) => ({ ...p, name: appleName(p.name), category: appleName(p.category) }));
  }
  console.log('No Supabase credentials set — building with sample data.');
  return require('./src/data.sample').products;
}

// Redirects for deleted product pages. The table is optional: if it
// hasn't been created yet, the build carries on without redirects.
async function loadRedirects() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from('product_redirects').select('*');
  if (error) {
    console.log('No redirects table yet, skipping redirects.');
    return [];
  }
  return data || [];
}

// Editable intro and footer text for the homepage and family pages.
// Optional: without the table the pages build exactly as before.
async function loadPageContent() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return {};
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from('page_content').select('*');
  if (error) {
    console.log('No page_content table yet, building without page intros.');
    return {};
  }
  const byKey = {};
  (data || []).forEach((row) => { byKey[row.key] = row; });
  return byKey;
}

async function loadSiteContent() {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('site_content').select('*').eq('id', 'about').maybeSingle();
    if (error) {
      console.log('Could not load About page content, using the default.');
      return DEFAULT_ABOUT;
    }
    return data || DEFAULT_ABOUT;
  }
  return DEFAULT_ABOUT;
}

// The order of the homepage's featured products (up to 3), kept as a
// list of product ids in the site_content row 'featured'. Slot 1 is the
// big tile.
async function loadFeaturedOrder() {
  if (!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)) return [];
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase.from('site_content').select('body').eq('id', 'featured').maybeSingle();
    const ids = JSON.parse((data && data.body) || '[]');
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch (err) {
    return [];
  }
}

// The homepage fact already shown today: { date, key }, or null.
async function loadDailyFactLock() {
  if (!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)) return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase.from('site_content').select('body').eq('id', 'daily_fact').maybeSingle();
    const lock = JSON.parse((data && data.body) || 'null');
    return lock && lock.date && lock.key ? lock : null;
  } catch (err) {
    return null;
  }
}

async function saveDailyFactLock(lock) {
  if (!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)) return;
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from('site_content').upsert({ id: 'daily_fact', body: JSON.stringify(lock) });
    if (error) console.log('Could not save today\'s homepage fact: ' + error.message);
  } catch (err) {
    console.log('Could not save today\'s homepage fact.');
  }
}

// Every day's homepage fact, oldest first: [{ date, key }], kept in the
// site_content row 'daily_fact_history'. The Facts page dates each fact
// by the day it was on the homepage.
async function loadDailyFactHistory() {
  if (!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)) return [];
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase.from('site_content').select('body').eq('id', 'daily_fact_history').maybeSingle();
    const list = JSON.parse((data && data.body) || '[]');
    return Array.isArray(list) ? list.filter((h) => h && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.key) : [];
  } catch (err) {
    return [];
  }
}

async function saveDailyFactHistory(history) {
  if (!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)) return;
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from('site_content').upsert({ id: 'daily_fact_history', body: JSON.stringify(history) });
    if (error) console.log('Could not save the homepage fact diary: ' + error.message);
  } catch (err) {
    console.log('Could not save the homepage fact diary.');
  }
}

// Apple's quarterly results. Optional: without the table (see
// supabase-schema-update-29.sql) the site builds without an earnings page.
async function loadEarnings() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from('earnings').select('*').order('report_date', { ascending: false });
  if (error) {
    console.log('No earnings table yet (run supabase-schema-update-29.sql); the earnings page will be empty.');
    return [];
  }
  return data || [];
}

async function loadEvents() {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('apple_events').select('*').order('event_date', { ascending: false });
    if (error) {
      console.log('Could not load Apple Events (the table may not exist yet), building without any.');
      return [];
    }
    return data || [];
  }
  return [];
}

// Same fingerprint as factKey() in public/facts-kit.js; keep them in step.
function factKey(text) {
  const str = String(text || '').trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

async function urlExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch (err) {
    return false;
  }
}

async function loadFacts() {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('facts').select('*').order('created_at', { ascending: false });
    if (error) {
      console.log('Could not load Facts (the table may not exist yet), building without any.');
      return [];
    }
    return data || [];
  }
  return [];
}

async function loadCategoryIcons() {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('category_icons').select('*');
    if (error) {
      console.log('Could not load custom category icons (the table may not exist yet), using built-in shapes.');
      return {};
    }
    const map = {};
    (data || []).forEach((row) => { map[row.category] = row.icon_url; });
    return map;
  }
  return {};
}

async function loadGalleryPhotos() {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('gallery_photos').select('*').order('created_at', { ascending: false });
    if (error) {
      console.log('Could not load gallery photos (the table may not exist yet), building an empty gallery.');
      return [];
    }
    return data || [];
  }
  return [];
}

// Featured products in their chosen order: the saved slot order first,
// then any other product still marked featured, at most three. Must stay
// in step with orderedFeaturedJS() in public/app.js.
function orderedFeatured(items, orderIds) {
  const featured = items.filter((i) => i.product.featured);
  const byId = new Map(featured.map((i) => [String(i.product.id), i]));
  const ordered = orderIds.map((id) => byId.get(String(id))).filter(Boolean);
  const rest = featured.filter((i) => !ordered.includes(i)).sort((a, b) => a.product.name.localeCompare(b.product.name));
  return ordered.concat(rest).slice(0, 3);
}

function pickRandom(arr, n) {
  const copy = arr.slice();
  const picked = [];
  while (picked.length < n && copy.length) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  return picked;
}

// A product whose models were discontinued one by one (the 32GB on one
// date, the 64GB on another) with no date for the whole product is
// discontinued on the last of them. Must match modelsDiscontinuedJS() in
// public/app.js and the admin's Discontinued row.
function withModelsDiscontinued(p) {
  if (!p || p.discontinued_date) return p;
  const details = p.generation_details && typeof p.generation_details === 'object' && !Array.isArray(p.generation_details) ? p.generation_details : {};
  let last = null;
  Object.keys(details).forEach((d) => {
    ((details[d] && details[d].updates) || []).forEach((u) => {
      if (u && u.kind === 'dropped' && /^\d{4}-\d{2}-\d{2}$/.test(u.date || '') && (!last || u.date > last)) last = u.date;
    });
  });
  const today = new Date().toISOString().slice(0, 10);
  return last && last <= today ? { ...p, discontinued: true, discontinued_date: last } : p;
}

async function main() {
  const products = (await loadProducts()).map(withModelsDiscontinued);
  // Links typed into notes and descriptions are checked against these.
  setLinkProducts(products);
  const aboutContent = await loadSiteContent();
  const categoryIcons = await loadCategoryIcons();
  setCustomCategoryIcons(categoryIcons);
  const events = await loadEvents();
  // Each event tile takes the main colour of its artwork.
  setEventTints(await eventColours(events));
  const facts = await loadFacts();
  const latestFact = facts[0] || null;
  const today = new Date().toISOString().slice(0, 10);
  // The hero's Apple Event (public/facts-kit.js, shared with the live
  // refresh): counting down, live, then "just announced" until two days
  // after it starts. A pinned event wins over the others in that window.
  const FactsKit = require('./public/facts-kit.js');
  const activeEvent = FactsKit.pickHeroEvent(events, Date.now());

  // The hero countdown: the featured event if it is still to come,
  // otherwise the nearest future release date across every product.
  // Release day counts: the tile turns into "Out today" when the moment
  // comes, and the next day's build drops it.
  const futureReleases = products
    .flatMap((p) => (p.refresh_history || []).filter((d) => d >= today).map((d) => ({ date: d, product: p })))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  // Countdowns: an upcoming pinned event, plus every product explicitly
  // opted in via "Show in the countdown" in admin. Products are only
  // included while their release date is still ahead, so nothing has to
  // be unticked afterwards.
  // The hero event counts down in its own tile, so it isn't repeated
  // here; another event still to come (rare) gets a countdown here.
  const countdowns = [];
  const nextOtherEvent = events
    .filter((e) => e !== activeEvent && FactsKit.eventPhase(e, Date.now()) === 'upcoming')
    .sort((a, b) => FactsKit.eventStartMs(a) - FactsKit.eventStartMs(b))[0];
  if (nextOtherEvent) {
    countdowns.push({ label: nextOtherEvent.heading || 'Apple Event', date: nextOtherEvent.event_date, time: nextOtherEvent.event_time || null, href: `/events/${eventSlug(nextOtherEvent)}/` });
  }
  // A release with pre-orders still to open counts down to them first
  // (at the pre-order time set in the admin, else 1pm UK, when Apple's
  // usually open), then, from the next build after they open, to the
  // release itself.
  futureReleases
    .filter((r) => r.product.in_countdown)
    .forEach((r) => {
      const details = r.product.generation_details && typeof r.product.generation_details === 'object' ? r.product.generation_details : {};
      const preorder = details[r.date] && details[r.date].preorder;
      const preorderTime = r.product.preorder_time || '1pm UK';
      const preorderAt = preorder && /^\d{4}-\d{2}-\d{2}$/.test(preorder) ? FactsKit.eventStartMs({ event_date: preorder, event_time: preorderTime }) : NaN;
      if (preorderAt > Date.now()) {
        countdowns.push({ label: r.product.name, date: preorder, time: preorderTime, href: `/products/${r.product.slug}/`, datePrefix: 'Pre-orders', kicker: 'Counting down to pre-orders', kind: 'preorder', product: r.product, releaseDate: r.date, releaseTime: r.product.release_time || null });
      } else {
        countdowns.push({ label: r.product.name, date: r.date, time: r.product.release_time || null, href: `/products/${r.product.slug}/`, datePrefix: 'Coming', product: r.product });
      }
    });
  // Soonest first: by day, then by the moment on that day.
  const momentOf = (c) => (c.time ? FactsKit.eventStartMs({ event_date: c.date, event_time: c.time }) : Date.parse(c.date + 'T07:00:00Z'));
  countdowns.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (momentOf(a) || 0) - (momentOf(b) || 0)));
  // The next quarterly results: always the compact line, never the big
  // clock. With no countdown, the hero's text and that line sit centred.
  const earnings = await loadEarnings();
  const upcomingEarnings = nextEarnings(earnings || [], today);
  const earningsNext = upcomingEarnings;
  const countdown = countdowns.length ? countdowns : null;
  const galleryPhotos = await loadGalleryPhotos();
  // Gallery photos served from this site's own CDN (src/photo-mirror.js).
  setServedPhotos(await photoMirror.mirror(galleryPhotos, DIST));

  const productsBySlug = {};
  products.forEach((p) => { productsBySlug[p.slug] = p; });

  const active = products.filter((p) => !p.discontinued);
  const discontinued = products
    .filter((p) => p.discontinued)
    .sort((a, b) => new Date(b.discontinued_date || 0) - new Date(a.discontinued_date || 0));

  // Every current product gets a page and shows up in listings, even
  // before it has a refresh date to compute a badge from, so nothing
  // added in the admin silently disappears while it's still being
  // filled in. Anything actually ranked by "days since refresh" (the
  // homepage's overdue section, the hero pick) uses `rankable` below,
  // which does filter to real status only.
  const withStatus = active.map((product) => ({ product, status: computeStatus(product) }));

  const discontinuedItems = discontinued.map((product) => ({ product, status: null }));

  // Everything with a page: current items plus discontinued ones.
  const allItems = withStatus.concat(discontinuedItems).sort((a, b) => {
    const dateA = launchDate(a.product);
    const dateB = launchDate(b.product);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    const diff = new Date(dateB).getTime() - new Date(dateA).getTime();
    if (diff !== 0) return diff;
    return a.product.name.localeCompare(b.product.name);
  });

  // The /products/ page gets its own default order: coming soon first
  // (soonest first), then products on sale with the longest wait for a
  // refresh first, then discontinued products at the very end (most
  // recently discontinued first). Category pages keep allItems' own
  // newest-launched order untouched. Keep in step with app.js.
  const GROUP_RANK = { coming: 0, current: 1, discontinued: 2 };
  const dueOf = (p) => (p.refresh_history || []).slice().sort().pop() || '';
  const productsPageItems = allItems.slice().sort((a, b) => {
    const ga = productGroup(a.product, a.status);
    const gb = productGroup(b.product, b.status);
    if (ga !== gb) return GROUP_RANK[ga] - GROUP_RANK[gb];
    const aDisc = ga === 'discontinued';
    if (ga === 'coming') {
      const da = dueOf(a.product);
      const db = dueOf(b.product);
      if (da !== db) return da < db ? -1 : 1;
      return a.product.name.localeCompare(b.product.name);
    }
    if (!aDisc) {
      const daysA = a.status ? a.status.daysSince : -Infinity;
      const daysB = b.status ? b.status.daysSince : -Infinity;
      if (daysA !== daysB) return daysB - daysA;
      return a.product.name.localeCompare(b.product.name);
    }
    const discA = a.product.discontinued_date ? new Date(a.product.discontinued_date).getTime() : 0;
    const discB = b.product.discontinued_date ? new Date(b.product.discontinued_date).getTime() : 0;
    if (discA !== discB) return discB - discA;
    return a.product.name.localeCompare(b.product.name);
  });

  // Homepage hero: 3 current products, one marked featured. An
  // explicit "Featured on homepage" flag always wins when set on any
  // product (checked across all candidates, not just a random subset),
  // otherwise the most overdue of 3 random picks is used. Client-side
  // JS re-randomises the two non-featured slots on every page load;
  // this build-time pick is just the pre-JS fallback.
  const rankable = withStatus.filter((i) => i.status);
  // A product still to be released has no refresh to count, so it only
  // belongs in the hero if it has been deliberately featured. Otherwise
  // it has the countdown panel to itself.
  const released = rankable.filter((i) => !(i.product.refresh_history || []).every((d) => d > today));
  // Up to three featured products, in the order chosen in admin. They
  // fill the hero tiles in that order (slot 1 is the big tile, unless an
  // Apple Event has it); any tile left over is a random pick.
  const featuredOrder = await loadFeaturedOrder();
  // Discontinued products can be featured too (their tile shows how long
  // they were on sale).
  const featuredItems = orderedFeatured(rankable.concat(discontinuedItems), featuredOrder);
  let heroFeatured;
  let heroRest;
  if (activeEvent) {
    heroFeatured = null;
    heroRest = featuredItems.slice(0, 2);
  } else if (featuredItems.length) {
    heroFeatured = featuredItems[0];
    heroRest = featuredItems.slice(1, 3);
  } else {
    const heroPicks = pickRandom(released, 3);
    heroFeatured = [...heroPicks].sort((a, b) => b.status.ratio - a.status.ratio)[0] || null;
    heroRest = heroPicks.filter((i) => i !== heroFeatured);
  }
  if (heroFeatured || activeEvent) {
    heroRest = heroRest.concat(pickRandom(released.filter((i) => i !== heroFeatured && !heroRest.includes(i)), 2 - heroRest.length));
  }

  // The homepage "waiting longest" top five: most days since the last
  // refresh first, the same order as Products sorted by days, high to low.
  const overdueItems = rankable
    .slice()
    .sort((a, b) => b.status.daysSince - a.status.daysSince)
    .slice(0, 5);

  // Category quick-links, current + discontinued together.
  const categoryTally = {};
  products.forEach((p) => { categoryTally[p.category] = (categoryTally[p.category] || 0) + 1; });
  const categoryLinks = Object.keys(categoryTally).sort((a, b) => a.localeCompare(b)).map((c) => ({ category: c, count: categoryTally[c] }));

  // A handful of random gallery photos for the homepage strip.
  const galleryPicks = pickRandom(galleryPhotos, 10);

  const pageContent = await loadPageContent();
  const opts = { siteUrl: SITE_URL, supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY };

  // The homepage "Did you know?": one fact a day from every product's own
  // fact, the site-wide statistics and the published facts, chosen from the date so everyone
  // sees the same one until the next build (daily at 00:05 UTC). The
  // products in the big tile are left out, so one product doesn't
  // appear twice on screen. FACT_DATE (YYYY-MM-DD) overrides the date
  // for testing.
  const heroSlugs = activeEvent ? [] : (featuredItems.length ? featuredItems.slice(0, 3) : (heroFeatured ? [heroFeatured] : [])).map((i) => i.product.slug);
  // Today's pick is saved (site_content row 'daily_fact'), so a rebuild
  // later the same day, after publishing a change, keeps the same fact.
  const factDate = process.env.FACT_DATE || today;
  const lockedFact = process.env.FACT_DATE ? null : await loadDailyFactLock();
  const dailyFact = FactsKit.pickDailyFact(FactsKit.dailyFactPool(products, facts), factDate, heroSlugs, lockedFact);
  if (dailyFact && !process.env.FACT_DATE && !(lockedFact && lockedFact.date === factDate && lockedFact.key === dailyFact.key)) {
    await saveDailyFactLock({ date: factDate, key: dailyFact.key });
  }
  // The diary: one entry per day, the first fact recorded for it. The
  // last saved day's fact starts it off on the first run.
  const factHistory = process.env.FACT_DATE ? [] : await loadDailyFactHistory();
  const diaryBefore = JSON.stringify(factHistory);
  const noteDay = (date, key) => { if (date && key && !factHistory.some((h) => h.date === date)) factHistory.push({ date, key }); };
  if (lockedFact && lockedFact.date < factDate) noteDay(lockedFact.date, lockedFact.key);
  if (dailyFact) noteDay(factDate, dailyFact.key);
  factHistory.sort((a, b) => a.date.localeCompare(b.date));
  if (!process.env.FACT_DATE && JSON.stringify(factHistory) !== diaryBefore) await saveDailyFactHistory(factHistory);

  write('index.html', homePage({
    heroFeatured,
    heroRotation: activeEvent ? null : featuredItems.slice(0, 3),
    heroRest,
    overdueItems,
    categoryLinks,
    totalCount: products.length,
    stats: siteStats(products),
    galleryPicks,
    productsBySlug,
    activeEvent,
    dailyFact,
    pageContent: pageContent.home || null,
    countdown,
    earningsNext,
    ...opts,
  }));
  write('products/index.html', allProductsPage({ items: productsPageItems, pageContent: pageContent.products || null, ...opts }));
  write('discontinued/index.html', discontinuedPage({ items: discontinued, pageContent: pageContent.discontinued || null, ...opts }));
  write('coming-soon/index.html', comingSoonPage({ products, pageContent: pageContent['coming-soon'] || null, ...opts }));
  write('about/index.html', aboutPage({ content: aboutContent, counts: aboutCounts({ products, events, photos: galleryPhotos }), ...opts }));
  write('contact/index.html', contactPage(opts));
  write('contact/thanks/index.html', contactThanksPage(opts));
  write('photo-licence/index.html', photoLicencePage(opts));
  write('gallery/index.html', galleryPage({ photos: galleryPhotos, pageContent: pageContent.gallery || null, ...opts }), galleryPhotos.map(galleryLastmod).filter(Boolean).sort().pop() || null);
  write('events/index.html', eventsPage({ events, productsBySlug, pageContent: pageContent.events || null, ...opts }));
  write('facts/index.html', factsPage({ facts, products, todayKey: dailyFact ? dailyFact.key : '', history: factHistory, pageContent: pageContent.facts || null, ...opts }));
  write('earnings/index.html', earningsPage({ earnings, pageContent: pageContent.earnings || null, ...opts }));

  // One page per fact, whose link preview is the fact's card (made and
  // saved by the app / admin when the fact is published). If a card isn't
  // there yet the page falls back to the standard preview image.
  for (const fact of facts) {
    const cardUrl = SUPABASE_URL
      ? `${SUPABASE_URL}/storage/v1/object/public/product-images/fact-cards/${fact.id}-${factKey(fact.text)}.png`
      : null;
    const cardExists = cardUrl ? await urlExists(cardUrl) : false;
    write(`facts/${fact.id}/index.html`, factPage({ fact, products, cardUrl: cardExists ? cardUrl : null, related: factRelatedLink(fact.text, products, galleryPhotos), ...opts }));
  }
  const eventSlugRedirects = [];
  const usedEventSlugs = new Set();
  for (const event of events) {
    let slug = eventSlug(event);
    // Two events sharing a heading and month would otherwise overwrite
    // each other's page, so later ones get a numeric suffix.
    if (usedEventSlugs.has(slug)) {
      let n = 2;
      while (usedEventSlugs.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
    usedEventSlugs.add(slug);
    write(`events/${slug}/index.html`, eventDetailPage({ event, productsBySlug, ...opts }));
    // Old UUID links (shared, bookmarked or already indexed) keep working.
    if (slug !== String(event.id)) {
      eventSlugRedirects.push(`/events/${event.id}/* /events/${slug}/ 301!`);
    }
  }
  const gallerySlugRedirects = [];
  const usedPhotoSlugs = new Set();
  for (let i = 0; i < galleryPhotos.length; i++) {
    const photo = galleryPhotos[i];
    const prevPhoto = i > 0 ? galleryPhotos[i - 1] : null;
    const nextPhoto = i < galleryPhotos.length - 1 ? galleryPhotos[i + 1] : null;
    let slug = galleryPhotoSlug(photo);
    // Two photos sharing a caption and month would otherwise overwrite
    // each other's page, so later ones get a numeric suffix.
    if (usedPhotoSlugs.has(slug)) {
      let n = 2;
      while (usedPhotoSlugs.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
    usedPhotoSlugs.add(slug);
    write(`gallery/${slug}/index.html`, galleryPhotoPage({ photo, prevPhoto, nextPhoto, ...opts }), galleryLastmod(photo), galleryPhotoImages(photo));
    // Old UUID links keep working and pass their ranking value across.
    if (slug !== String(photo.id)) {
      gallerySlugRedirects.push(`/gallery/${photo.id}/* /gallery/${slug}/ 301!`);
    }
  }
  write('admin/index.html', adminPage(opts));
  write('upload/index.html', uploadPage(opts));

  // Category index + one page per category, current and discontinued together.
  const categoryNames = [...new Set(allItems.map((i) => i.product.category))].sort((a, b) => a.localeCompare(b));
  const groups = categoryNames.map((category) => {
    const inCategory = allItems.filter((i) => i.product.category === category);
    return {
      category,
      current: inCategory.filter((i) => !i.product.discontinued).length,
      discontinued: inCategory.filter((i) => i.product.discontinued).length,
      items: inCategory,
    };
  });
  write('categories/index.html', categoriesIndexPage({ groups, pageContent: pageContent.categories || null, ...opts }));
  for (const category of categoryNames) {
    const items = allItems.filter((i) => i.product.category === category);
    write(`categories/${slugify(category)}/index.html`, categoryPage({
      category,
      items,
      pageContent: pageContent['category:' + slugify(category)] || null,
      ...opts,
    }));
  }

  // A share image per product, drawn at build time. If image rendering
  // isn't available the site falls back to the logo, exactly as before.
  const statusBySlug = {};
  allItems.forEach((i) => { statusBySlug[i.product.slug] = i.status; });
  const shareImagePaths = await shareImages.generate(allItems, DIST);

  for (const item of allItems) {
    const shareImage = shareImagePaths[item.product.slug];
    write(
      `products/${item.product.slug}/index.html`,
      productPage({
        product: item.product,
        status: item.status,
        history: item.product.refresh_history || [],
        productsBySlug,
        statusBySlug,
        galleryPhotos,
        ogImage: shareImage ? `${SITE_URL}${shareImage}` : null,
        ...opts,
      }),
      mostRecentActivityDate(item.product)
    );
  }

  write('404.html', notFoundPage(opts));

  copyStatic();

  const rssXml = rssFeedXml({ allItems, siteUrl: SITE_URL });
  fs.writeFileSync(path.join(DIST, 'feed.xml'), rssXml);

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${sitemapUrls.map((u) => `  <url><loc>${SITE_URL}${u.path}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${u.images.map((img) => `<image:image><image:loc>${xmlEscape(img)}</image:loc></image:image>`).join('')}</url>`).join('\n')}
</urlset>
`;
  write('sitemap.xml', sitemapXml);

  const redirects = await loadRedirects();
  const livePaths = new Set(sitemapUrls.map((u) => u.path));
  // Never redirect a page that exists again, e.g. if a slug is reused.
  // Send the netlify.app address to the real domain, so there is only
  // ever one indexable copy of every page.
  const canonicalHost = SITE_URL.replace(/^https?:\/\//, '');
  const hostRedirect = [`https://appl-e-refresher.netlify.app/* ${SITE_URL}/:splat 301!`];
  const redirectLines = redirects
    .filter((r) => r.from_slug && r.to_path && !livePaths.has('/products/' + r.from_slug + '/'))
    .map((r) => `/products/${r.from_slug}/* ${r.to_path} 301!`);
  const allRedirectLines = hostRedirect.concat(redirectLines, eventSlugRedirects, gallerySlugRedirects);
  fs.writeFileSync(path.join(DIST, '_redirects'), allRedirectLines.join('\n') + '\n');
  console.log(`Wrote ${allRedirectLines.length} redirect${allRedirectLines.length === 1 ? '' : 's'} (canonical host: ${canonicalHost}).`);

  // Browser security headers on every page: no guessing file types, no
  // framing this site inside someone else's page (clickjacking the admin),
  // only the site's address (not the full page) sent to other sites, and
  // no location or microphone access. YouTube embeds still work: they are
  // frames inside this site, not this site inside a frame. A _headers file
  // rather than netlify.toml, as Netlify reports these per deploy.
  fs.writeFileSync(path.join(DIST, '_headers'), [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: SAMEORIGIN',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: geolocation=(), microphone=()',
    // Gallery photo copies never change under the same name, so browsers
    // can keep them for a year.
    '/photos/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n'));

  const robotsTxt = `User-agent: *
Disallow: /admin/
Disallow: /upload/
Sitemap: ${SITE_URL}/sitemap.xml
`;
  fs.writeFileSync(path.join(DIST, 'robots.txt'), robotsTxt);

  if (missingProductLinks.size) {
    console.warn(`Links to product pages that don't exist (fix them in the admin): ${Array.from(missingProductLinks).join(', ')}`);
  }
  console.log(`Built ${allItems.length} product pages (${discontinuedItems.length} discontinued), ${categoryNames.length} category pages, ${galleryPhotos.length} gallery photos, 1 home page.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
