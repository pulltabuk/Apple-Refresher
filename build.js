const fs = require('fs');
const path = require('path');
const { computeStatus } = require('./src/status');
const { homePage, allProductsPage, discontinuedPage, categoriesIndexPage, categoryPage, productPage, aboutPage, adminPage, galleryPage, galleryPhotoPage, slugify } = require('./src/templates');

const DEFAULT_ABOUT = {
  heading: 'About Apple Refresher',
  body: "Apple Refresher tracks how long it's been since every current Apple product was last updated, so you can tell at a glance whether now's a good time to buy or worth holding off.\n\nIt isn't trying to replace Apple's own site or the Apple news sites, there's no reviews or rumours here beyond a short note where relevant. It's simply a countdown for what's current and a searchable archive for what's been discontinued, one place to check either.\n\nIt's an independent project and isn't affiliated with Apple.",
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

async function main() {
  const products = await loadProducts();
  const aboutContent = await loadSiteContent();
  const galleryPhotos = await loadGalleryPhotos();

  const productsBySlug = {};
  products.forEach((p) => { productsBySlug[p.slug] = p; });

  const active = products.filter((p) => !p.discontinued);
  const discontinued = products
    .filter((p) => p.discontinued)
    .sort((a, b) => new Date(b.discontinued_date || 0) - new Date(a.discontinued_date || 0));

  // Current products (with refresh data or a Coming soon flag) drive the
  // homepage. Discontinued products get their own pages and grids too.
  const withStatus = active
    .map((product) => ({ product, status: computeStatus(product) }))
    .filter((i) => i.status || i.product.coming_soon);

  const discontinuedItems = discontinued.map((product) => ({ product, status: null }));

  // Everything with a page: current items plus discontinued ones.
  const allItems = withStatus.concat(discontinuedItems);

  // Featured: an explicitly flagged product, or the most overdue one
  // among products with real refresh data (Coming soon items have no
  // ratio to rank by, so they only become featured if flagged directly).
  const rankable = withStatus.filter((i) => i.status);
  let featured = withStatus.find((i) => i.product.featured);
  if (!featured) {
    featured = [...rankable].sort((a, b) => b.status.ratio - a.status.ratio)[0] || withStatus[0] || null;
  }
  const rest = featured
    ? rankable
        .filter((i) => i.product.id !== featured.product.id)
        .sort((a, b) => b.status.ratio - a.status.ratio)
        .slice(0, 4)
    : [];

  const opts = { siteUrl: SITE_URL, supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY };

  write('index.html', homePage({ featured, rest, ...opts }));
  write('products/index.html', allProductsPage({ items: allItems, ...opts }));
  write('discontinued/index.html', discontinuedPage({ items: discontinued, ...opts }));
  write('about/index.html', aboutPage({ content: aboutContent, ...opts }));
  write('gallery/index.html', galleryPage({ photos: galleryPhotos, ...opts }));
  for (let i = 0; i < galleryPhotos.length; i++) {
    const photo = galleryPhotos[i];
    const prevPhoto = i > 0 ? galleryPhotos[i - 1] : null;
    const nextPhoto = i < galleryPhotos.length - 1 ? galleryPhotos[i + 1] : null;
    write(`gallery/${photo.id}/index.html`, galleryPhotoPage({ photo, prevPhoto, nextPhoto, ...opts }));
  }
  write('admin/index.html', adminPage(opts));

  // Category index + one page per category, current and discontinued together.
  const categoryNames = [...new Set(allItems.map((i) => i.product.category))].sort();
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
