const fs = require('fs');
const path = require('path');
const { computeStatus } = require('./src/status');
const { homePage, allProductsPage, discontinuedPage, productPage, aboutPage, adminPage } = require('./src/templates');

const DEFAULT_ABOUT = {
  heading: 'About Apple Refresher',
  body: "Apple Refresher tracks how long it's been since every current Apple product was last updated, so you can tell at a glance whether now's a good time to buy or worth holding off.\n\nIt's an independent project and isn't affiliated with Apple.",
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

async function main() {
  const products = await loadProducts();
  const aboutContent = await loadSiteContent();

  const active = products.filter((p) => !p.discontinued);
  const discontinued = products
    .filter((p) => p.discontinued)
    .sort((a, b) => new Date(b.discontinued_date || 0) - new Date(a.discontinued_date || 0));

  const withStatus = active
    .map((product) => ({ product, status: computeStatus(product) }))
    .filter((i) => i.status || i.product.coming_soon);

  // Featured: an explicitly flagged product, or the most overdue one
  // among products with real refresh data (Coming soon items have no
  // ratio to rank by, so they only become featured if flagged directly).
  const rankable = withStatus.filter((i) => i.status);
  let featured = withStatus.find((i) => i.product.featured);
  if (!featured) {
    featured = [...rankable].sort((a, b) => b.status.ratio - a.status.ratio)[0] || withStatus[0];
  }
  const rest = rankable
    .filter((i) => i.product.id !== featured.product.id)
    .sort((a, b) => b.status.ratio - a.status.ratio)
    .slice(0, 4);

  const opts = { siteUrl: SITE_URL, supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY };

  write('index.html', homePage({ featured, rest, ...opts }));
  write('products/index.html', allProductsPage({ items: withStatus, ...opts }));
  write('discontinued/index.html', discontinuedPage({ items: discontinued, ...opts }));
  write('about/index.html', aboutPage({ content: aboutContent, ...opts }));
  write('admin/index.html', adminPage(opts));

  for (const item of withStatus) {
    write(
      `products/${item.product.slug}/index.html`,
      productPage({
        product: item.product,
        status: item.status,
        history: item.product.refresh_history || [],
        ...opts,
      })
    );
  }

  copyStatic();
  console.log(`Built ${withStatus.length} product pages, 1 home page, 1 discontinued page.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
