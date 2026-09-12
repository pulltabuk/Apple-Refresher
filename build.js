const fs = require('fs');
const path = require('path');
const { computeStatus } = require('./src/status');
const { homePage, allProductsPage, discontinuedPage, categoriesIndexPage, categoryPage, productPage, aboutPage, adminPage, galleryPage, galleryPhotoPage, eventsPage, eventDetailPage, factsPage, setCustomCategoryIcons, launchDate, slugify } = require('./src/templates');

const DEFAULT_ABOUT = {
  heading: 'About Apple Sunset',
  body: "Apple Sunset tracks how long it's been since every current Apple product was last updated, so you can tell at a glance whether now's a good time to buy or worth holding off.\n\nIt isn't trying to replace Apple's own site or the Apple news sites, there's no reviews or rumours here beyond a short note where relevant. It's simply a countdown for what's current and a searchable archive for what's been discontinued, one place to check either.\n\nIt's an independent project and isn't affiliated with Apple.",
  image_url: null,
};

const SITE_URL = process.env.SITE_URL || 'https://example.netlify.app';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const DIST = path.join(__dirname, 'dist');

function write(relPath, content) {
  const fullPath = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
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
  const activeEvent = upcomingEvents[0] || null;
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

  // Homepage hero: 3 random current products, one marked featured (an
  // explicit "Featured on homepage" flag wins if it's among the three,
  // otherwise the most overdue of the three). Client-side JS re-randomises
  // on every page load; this build-time pick is just the pre-JS fallback.
  const rankable = withStatus.filter((i) => i.status);
  const heroPicks = pickRandom(rankable, 3);
  let heroFeatured = heroPicks.find((i) => i.product.featured)
    || [...heroPicks].sort((a, b) => b.status.ratio - a.status.ratio)[0]
    || null;
  const heroRest = heroPicks.filter((i) => i !== heroFeatured);

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
  const galleryPicks = pickRandom(galleryPhotos, 12);

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
    ...opts,
  }));
  write('products/index.html', allProductsPage({ items: productsPageItems, ...opts }));
  write('discontinued/index.html', discontinuedPage({ items: discontinued, ...opts }));
  write('about/index.html', aboutPage({ content: aboutContent, ...opts }));
  write('gallery/index.html', galleryPage({ photos: galleryPhotos, ...opts }));
  write('events/index.html', eventsPage({ events, ...opts }));
  write('facts/index.html', factsPage({ facts, ...opts }));
  for (const event of events) {
    write(`events/${event.id}/index.html`, eventDetailPage({ event, productsBySlug, ...opts }));
  }
  for (let i = 0; i < galleryPhotos.length; i++) {
    const photo = galleryPhotos[i];
    const prevPhoto = i > 0 ? galleryPhotos[i - 1] : null;
    const nextPhoto = i < galleryPhotos.length - 1 ? galleryPhotos[i + 1] : null;
    write(`gallery/${photo.id}/index.html`, galleryPhotoPage({ photo, prevPhoto, nextPhoto, ...opts }));
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
  write('categories/index.html', categoriesIndexPage({ groups, ...opts }));
  for (const category of categoryNames) {
    const items = allItems.filter((i) => i.product.category === category);
    write(`categories/${slugify(category)}/index.html`, categoryPage({ category, items, ...opts }));
  }

  for (const item of allItems) {
    write(
      `products/${item.product.slug}/index.html`,
      productPage({
        product: item.product,
        status: item.status,
        history: item.product.refresh_history || [],
        productsBySlug,
        ...opts,
      })
    );
  }

  copyStatic();
  console.log(`Built ${allItems.length} product pages (${discontinuedItems.length} discontinued), ${categoryNames.length} category pages, ${galleryPhotos.length} gallery photos, 1 home page.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
