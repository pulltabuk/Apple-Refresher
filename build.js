const fs = require('fs');
const path = require('path');
const { computeStatus } = require('./src/status');
const shareImages = require('./src/share-images');
const { homePage, allProductsPage, discontinuedPage, categoriesIndexPage, categoryPage, productPage, aboutPage, notFoundPage, adminPage, galleryPage, galleryPhotoPage, eventsPage, eventDetailPage, factsPage, setCustomCategoryIcons, launchDate, slugify, eventSlug, galleryPhotoSlug, rssFeedXml, mostRecentActivityDate } = require('./src/templates');

const DEFAULT_ABOUT = {
  heading: 'About Apple Sunset',
  body: "Apple Sunset tracks how long it's been since every current Apple product was last updated, so you can tell at a glance whether now's a good time to buy or worth holding off.\n\nIt isn't trying to replace Apple's own site or the Apple news sites, there's no reviews or rumours here beyond a short note where relevant. It's simply a countdown for what's current and a searchable archive for what's been discontinued, one place to check either.\n\nIt's an independent project and isn't affiliated with Apple.",
  image_url: null,
};

// The public address of the site. Everything canonical, Open Graph,
// sitemap and RSS is built from this, so it must be the real domain and
// never the netlify.app address, or Google treats the two as rival
// copies of the same site and may rank neither.
const SITE_URL = (process.env.SITE_URL || 'https://applesunset.com').replace(/\/+$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const DIST = path.join(__dirname, 'dist');

const sitemapUrls = [];

function write(relPath, content, lastmod) {
  const fullPath = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  if (relPath.endsWith('index.html') && !relPath.startsWith('admin/')) {
    const urlPath = '/' + relPath.replace(/index\.html$/, '');
    sitemapUrls.push({ path: urlPath, lastmod: lastmod || null });
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
    return data;
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

function pickRandom(arr, n) {
  const copy = arr.slice();
  const picked = [];
  while (picked.length < n && copy.length) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  return picked;
}

async function main() {
  const products = await loadProducts();
  const aboutContent = await loadSiteContent();
  const categoryIcons = await loadCategoryIcons();
  setCustomCategoryIcons(categoryIcons);
  const events = await loadEvents();
  const facts = await loadFacts();
  const latestFact = facts[0] || null;
  const today = new Date().toISOString().slice(0, 10);
  const upcomingEvents = events.filter((e) => e.event_date >= today).sort((a, b) => (a.event_date < b.event_date ? -1 : 1));
  // A pinned event wins; otherwise the next one by date, as before.
  const activeEvent = events.find((e) => e.featured) || upcomingEvents[0] || null;

  // The hero countdown: the featured event if it is still to come,
  // otherwise the nearest future release date across every product.
  const futureReleases = products
    .flatMap((p) => (p.refresh_history || []).filter((d) => d > today).map((d) => ({ date: d, product: p })))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  // Countdowns: an upcoming pinned event, plus every product explicitly
  // opted in via "Show in the countdown" in admin. Products are only
  // included while their release date is still ahead, so nothing has to
  // be unticked afterwards.
  const countdowns = [];
  if (activeEvent && activeEvent.event_date >= today) {
    countdowns.push({ label: activeEvent.heading || 'Apple Event', date: activeEvent.event_date, time: activeEvent.event_time || null, href: '/events/' });
  }
  futureReleases
    .filter((r) => r.product.in_countdown)
    .forEach((r) => {
      countdowns.push({ label: r.product.name, date: r.date, time: null, href: `/products/${r.product.slug}/` });
    });
  countdowns.sort((a, b) => (a.date < b.date ? -1 : 1));
  const countdown = countdowns.length ? countdowns : null;
  const galleryPhotos = await loadGalleryPhotos();

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

  // The /products/ page gets its own default order: current products
  // with the longest wait for a refresh first, discontinued products
  // pushed to the very end (most recently discontinued first within
  // that group). Category pages keep allItems' own newest-launched
  // order untouched.
  const productsPageItems = allItems.slice().sort((a, b) => {
    const aDisc = !!a.product.discontinued;
    const bDisc = !!b.product.discontinued;
    if (aDisc !== bDisc) return aDisc ? 1 : -1;
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
  const explicitlyFeatured = rankable.find((i) => i.product.featured);
  let heroFeatured;
  let heroRest;
  if (explicitlyFeatured) {
    heroFeatured = explicitlyFeatured;
    heroRest = pickRandom(released.filter((i) => i !== explicitlyFeatured), 2);
  } else {
    const heroPicks = pickRandom(released, 3);
    heroFeatured = [...heroPicks].sort((a, b) => b.status.ratio - a.status.ratio)[0] || null;
    heroRest = heroPicks.filter((i) => i !== heroFeatured);
  }

  // The two-row "waiting longest" section: the true most-overdue list,
  // regardless of what's also shown in the hero above (the hero picks
  // randomly and changes on every load, so some overlap here is
  // expected, not a bug, and keeps this section's ranking honest).
  const overdueItems = rankable
    .slice()
    .sort((a, b) => b.status.ratio - a.status.ratio)
    .slice(0, 8);

  // Category quick-links, current + discontinued together.
  const categoryTally = {};
  products.forEach((p) => { categoryTally[p.category] = (categoryTally[p.category] || 0) + 1; });
  const categoryLinks = Object.keys(categoryTally).sort((a, b) => a.localeCompare(b)).map((c) => ({ category: c, count: categoryTally[c] }));

  // A handful of random gallery photos for the homepage strip.
  const galleryPicks = pickRandom(galleryPhotos, 10);

  const pageContent = await loadPageContent();
  const opts = { siteUrl: SITE_URL, supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY };

  write('index.html', homePage({
    heroFeatured,
    heroRest,
    overdueItems,
    categoryLinks,
    totalCount: products.length,
    galleryPicks,
    productsBySlug,
    activeEvent,
    latestFact,
    pageContent: pageContent.home || null,
    countdown,
    ...opts,
  }));
  write('products/index.html', allProductsPage({ items: productsPageItems, pageContent: pageContent.products || null, ...opts }));
  write('discontinued/index.html', discontinuedPage({ items: discontinued, pageContent: pageContent.discontinued || null, ...opts }));
  write('about/index.html', aboutPage({ content: aboutContent, ...opts }));
  write('gallery/index.html', galleryPage({ photos: galleryPhotos, pageContent: pageContent.gallery || null, ...opts }));
  write('events/index.html', eventsPage({ events, productsBySlug, pageContent: pageContent.events || null, ...opts }));
  write('facts/index.html', factsPage({ facts, pageContent: pageContent.facts || null, ...opts }));
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
    write(`gallery/${slug}/index.html`, galleryPhotoPage({ photo, prevPhoto, nextPhoto, ...opts }));
    // Old UUID links keep working and pass their ranking value across.
    if (slug !== String(photo.id)) {
      gallerySlugRedirects.push(`/gallery/${photo.id}/* /gallery/${slug}/ 301!`);
    }
  }
  write('admin/index.html', adminPage(opts));

  // Category index + one page per category, current and discontinued together.
  const categoryNames = [...new Set(allItems.map((i) => i.product.category))].sort((a, b) => a.localeCompare(b));
  const groups = categoryNames.map((category) => {
    const inCategory = allItems.filter((i) => i.product.category === category);
    return {
      category,
      current: inCategory.filter((i) => !i.product.discontinued).length,
      discontinued: inCategory.filter((i) => i.product.discontinued).length,
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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url><loc>${SITE_URL}${u.path}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
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

  const robotsTxt = `User-agent: *
Disallow: /admin/
Sitemap: ${SITE_URL}/sitemap.xml
`;
  fs.writeFileSync(path.join(DIST, 'robots.txt'), robotsTxt);

  console.log(`Built ${allItems.length} product pages (${discontinuedItems.length} discontinued), ${categoryNames.length} category pages, ${galleryPhotos.length} gallery photos, 1 home page.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
