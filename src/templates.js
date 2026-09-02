const CATEGORY_ICONS = {
  iPhone: `<rect x="13" y="4" width="14" height="32" rx="3"/><line x1="17" y1="31" x2="23" y2="31"/>`,
  Mac: `<rect x="8" y="9" width="24" height="16" rx="1.5"/><path d="M5 30h30l-2.5-3h-25z"/>`,
  iPad: `<rect x="7" y="8" width="26" height="24" rx="3"/><line x1="19" y1="27" x2="21" y2="27"/>`,
  'Apple Watch': `<rect x="12" y="10" width="16" height="20" rx="5"/><rect x="27.5" y="17" width="3" height="6" rx="1"/>`,
  AirPods: `<path d="M14 10c-3 0-5 2-5 5v9c0 2 1.5 3 3 3s3-1 3-3V13"/><path d="M26 10c3 0 5 2 5 5v9c0 2-1.5 3-3 3s-3-1-3-3V13"/>`,
  'Vision Pro': `<path d="M6 18c0-4 3-6 14-6s14 2 14 6-3 6-14 6S6 22 6 18z"/><circle cx="15" cy="18" r="2.5"/><circle cx="25" cy="18" r="2.5"/>`,
  Other: `<rect x="8" y="8" width="24" height="24" rx="4"/>`,
};

function categoryIcon(category) {
  const shape = CATEGORY_ICONS[category] || CATEGORY_ICONS.Other;
  return `<svg class="placeholder-icon" viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' });
}

function sortedHistory(product) {
  return (product.refresh_history || []).slice().sort();
}

function launchDate(product) {
  const h = sortedHistory(product);
  return h.length ? h[0] : null;
}

function latestRefresh(product) {
  const h = sortedHistory(product);
  return h.length ? h[h.length - 1] : null;
}

function monthsBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function lifespanText(start, end) {
  const months = monthsBetween(start, end);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts = [];
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (rem || !years) parts.push(`${rem} month${rem === 1 ? '' : 's'}`);
  return parts.join(', ');
}

function daysBetween(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / 86400000);
}

function productStatusKey(product) {
  if (product.discontinued) return 'discontinued';
  if (product.coming_soon) return 'coming-soon';
  return 'current';
}

function formatPrice(price) {
  if (!price) return null;
  const trimmed = String(price).trim();
  return /^[£$€]/.test(trimmed) ? trimmed : `£${trimmed}`;
}

function primaryImage(product) {
  if (product.image_urls && product.image_urls.length) return product.image_urls[0];
  return product.image_url || null;
}

function categoryPill(category) {
  return `<a class="pill" href="/categories/${slugify(category)}/">${escapeHtml(category)}</a>`;
}

function badgeHtml(statusInfo) {
  if (!statusInfo) return '';
  const { status, daysSince } = statusInfo;
  return `<span class="badge badge--${status}">${daysSince} days since refresh</span>`;
}

function productBadge(product, statusInfo) {
  if (product.discontinued) {
    const date = product.discontinued_date ? ` ${formatDate(product.discontinued_date)}` : '';
    return `<span class="badge badge--discontinued">Discontinued${date}</span>`;
  }
  if (product.coming_soon) {
    return `<span class="badge badge--coming-soon">Coming soon</span>`;
  }
  return badgeHtml(statusInfo);
}

const DEFAULT_SCRIPTS = [
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js" defer></script>',
  '<script src="/app.js" defer></script>',
];

function shell({ title, description, siteUrl, path, bodyHtml, supabaseUrl, supabaseAnonKey, noindex, scripts }) {
  const scriptTags = (scripts || DEFAULT_SCRIPTS).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="canonical" href="${siteUrl}${path}">
<link rel="stylesheet" href="/styles.css">
<link rel="icon" type="image/png" href="/favicon.png">
</head>
<body>
<header class="site-header">
  <a class="site-title" href="/"><img src="/logo.png" alt="" class="site-logo"><span>Apple Refresher</span></a>
  <nav class="site-nav">
    <a href="/products/">All products</a>
    <a href="/categories/">Categories</a>
    <a href="/discontinued/">Discontinued</a>
    <a href="/about/">About</a>
  </nav>
</header>
<main>
${bodyHtml}
</main>
<footer class="site-footer">
  <nav class="footer-nav">
    <a href="/about/">About us</a>
    <a href="/admin/">Admin</a>
  </nav>
  <p>Apple Refresher is an independent tracker and is not affiliated with Apple Inc.</p>
</footer>
<script>
  window.SUPABASE_URL = ${JSON.stringify(supabaseUrl || '')};
  window.SUPABASE_ANON_KEY = ${JSON.stringify(supabaseAnonKey || '')};
</script>
${scriptTags}
</body>
</html>`;
}

// One card component for every grid: current, coming soon, and
// discontinued products all render through this, with data attributes
// that the client-side sort and filter controls read from.
function cardHtml(product, statusInfo) {
  const status = productStatusKey(product);
  const launch = launchDate(product);
  const days = statusInfo && status === 'current' ? statusInfo.daysSince : '';
  const launchTs = launch ? new Date(launch).getTime() : '';
  const discTs = product.discontinued && product.discontinued_date ? new Date(product.discontinued_date).getTime() : '';
  const lifespanDays = launch && product.discontinued && product.discontinued_date ? daysBetween(launch, product.discontinued_date) : '';
  const decade = product.discontinued && product.discontinued_date ? `${Math.floor(new Date(product.discontinued_date).getFullYear() / 10) * 10}s` : '';
  const meta = launch && product.discontinued && product.discontinued_date
    ? `<p class="card-meta">Lived ${lifespanText(launch, product.discontinued_date)}</p>`
    : '';
  return `<article class="card${status === 'discontinued' ? ' card--discontinued' : ''}" data-category="${escapeHtml(product.category)}" data-status="${status}" data-days="${days}" data-launch="${launchTs}" data-discontinued="${discTs}" data-lifespan="${lifespanDays}" data-decade="${decade}">
  <a class="card-link" href="/products/${product.slug}/">
    <div class="card-image">${primaryImage(product) ? `<img src="${primaryImage(product)}" alt="${escapeHtml(product.name)}">` : categoryIcon(product.category)}</div>
    <p class="card-name">${escapeHtml(product.name)}</p>
    ${productBadge(product, statusInfo)}
    ${meta}
  </a>
  ${categoryPill(product.category)}
</article>`;
}

function filterBar(key, values, labels) {
  return `<div class="filter-bar" data-filter-key="${key}">
  <button class="filter-btn active" data-filter-value="all">All</button>
  ${values.map((v, i) => `<button class="filter-btn" data-filter-value="${escapeHtml(v)}">${escapeHtml(labels ? labels[i] : v)}</button>`).join('\n')}
</div>`;
}

function sortSelect(options) {
  return `<select id="sort-select" class="sort-select" aria-label="Sort products">
    <option value="" selected disabled>Sort by...</option>
    ${options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('\n')}
  </select>`;
}

const PRODUCT_SORT_OPTIONS = [
  ['days-desc', 'Days since refresh: high to low'],
  ['days-asc', 'Days since refresh: low to high'],
  ['launch-desc', 'Launched: newest first'],
  ['launch-asc', 'Launched: oldest first'],
  ['name-asc', 'Name: A to Z'],
  ['name-desc', 'Name: Z to A'],
];

const DISCONTINUED_SORT_OPTIONS = [
  ['discontinued-desc', 'Discontinued: newest first'],
  ['discontinued-asc', 'Discontinued: oldest first'],
  ['lifespan-desc', 'Longest lived first'],
  ['lifespan-asc', 'Shortest lived first'],
  ['launch-asc', 'Launched: oldest first'],
  ['name-asc', 'Name: A to Z'],
  ['name-desc', 'Name: Z to A'],
];

const STATUS_VALUES = ['current', 'coming-soon', 'discontinued'];
const STATUS_LABELS = ['Current', 'Coming soon', 'Discontinued'];

function emptyState(what) {
  return `<p class="page-intro">No ${what} yet. Add one in <a href="/admin/">/admin/</a>, every product needs at least one refresh date, or a Coming soon flag, to show up here.</p>`;
}

function homePage({ featured, rest, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const heroSection = featured
    ? `<section class="hero">
  <a class="hero-card" href="/products/${featured.product.slug}/">
    <div class="hero-image">${primaryImage(featured.product) ? `<img src="${primaryImage(featured.product)}" alt="${escapeHtml(featured.product.name)}">` : categoryIcon(featured.product.category)}</div>
    <div class="hero-body">
      <p class="hero-eyebrow">Featured</p>
      <p class="hero-name">${escapeHtml(featured.product.name)}</p>
      ${productBadge(featured.product, featured.status)}
    </div>
  </a>
  <div class="hero-grid">
    ${rest.map((r) => cardHtml(r.product, r.status)).join('\n')}
  </div>
</section>
<p class="see-all"><a href="/products/">See all products &rarr;</a></p>`
    : emptyState('products');

  const body = `
<section class="intro-hero">
  <p class="intro-eyebrow"><span class="eyebrow-dash"></span>Apple product refresh tracker</p>
  <h1 class="intro-heading">Know when it's<br>time to buy.</h1>
  <p class="intro-subtitle">Every current Apple product, and exactly how long it's been since its last refresh, so you're never guessing.</p>
  <a class="intro-cta" href="/products/">Browse all products</a>
</section>
${heroSection}`;
  return shell({
    title: 'Apple Refresher — time since every Apple product was last refreshed',
    description: 'A quick look at how long it has been since every current Apple product was last updated, plus an archive of the ones Apple discontinued.',
    siteUrl,
    path: '/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function allProductsPage({ items, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const categories = [...new Set(items.map((i) => i.product.category))].sort();
  const body = items.length
    ? `
<h1>All products</h1>
<p class="page-intro">Everything on the site, current and discontinued, in one searchable place.</p>
<div class="controls-row">
  <input type="search" id="search-input" class="search-input" placeholder="Search products…" aria-label="Search products">
  ${sortSelect(PRODUCT_SORT_OPTIONS)}
</div>
${filterBar('status', STATUS_VALUES, STATUS_LABELS)}
${filterBar('category', categories)}
<p id="no-results" class="page-intro" style="display:none;">No products match your search.</p>
<div class="card-grid" id="grid" data-mode="all">
  ${items.map((i) => cardHtml(i.product, i.status)).join('\n')}
</div>`
    : `
<h1>All products</h1>
${emptyState('products')}`;
  return shell({
    title: 'All products — Apple Refresher',
    description: 'Every Apple product on the site, current and discontinued, searchable and sortable.',
    siteUrl,
    path: '/products/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function discontinuedPage({ items, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const decades = [...new Set(items.map((p) => p.discontinued_date ? `${Math.floor(new Date(p.discontinued_date).getFullYear() / 10) * 10}s` : '').filter(Boolean))].sort();
  const body = items.length
    ? `
<h1>Discontinued products</h1>
<p class="page-intro">The products Apple no longer sells, when they launched, when they went, and what took their place.</p>
<div class="controls-row">
  <input type="search" id="search-input" class="search-input" placeholder="Search discontinued products…" aria-label="Search discontinued products">
  ${sortSelect(DISCONTINUED_SORT_OPTIONS)}
</div>
${filterBar('decade', decades)}
<p id="no-results" class="page-intro" style="display:none;">No products match your search.</p>
<div class="card-grid" id="grid" data-mode="discontinued">
  ${items.map((p) => cardHtml(p, null)).join('\n')}
</div>`
    : `
<h1>Discontinued products</h1>
<p class="page-intro">Nothing here yet. Tick Discontinued on a product in <a href="/admin/">/admin/</a> and give it a discontinued date, and it'll appear here.</p>`;
  return shell({
    title: 'Discontinued Apple products — Apple Refresher',
    description: 'An archive of the Apple products that have been discontinued: when they launched, when they went, how long they lasted, and what replaced them.',
    siteUrl,
    path: '/discontinued/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function categoriesIndexPage({ groups, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const tiles = groups.map(({ category, current, discontinued }) => {
    const total = current + discontinued;
    return `<a class="category-tile" href="/categories/${slugify(category)}/">
  <div class="category-tile-icon">${categoryIcon(category)}</div>
  <p class="category-tile-name">${escapeHtml(category)}</p>
  <p class="category-tile-count">${total}</p>
  <p class="category-tile-caption">Product${total === 1 ? '' : 's'}</p>
</a>`;
  }).join('\n');
  const body = `
<h1>Browse by category</h1>
<p class="page-intro">Every product line on the site, current and discontinued.</p>
<div class="category-grid">${tiles}</div>`;
  return shell({
    title: 'Categories — Apple Refresher',
    description: 'Browse Apple products by category: iPhone, Mac, iPad, Apple Watch, AirPods, Vision Pro and more.',
    siteUrl,
    path: '/categories/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function categoryPage({ category, items, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const slug = slugify(category);
  const currentCount = items.filter((i) => !i.product.discontinued).length;
  const discontinuedCount = items.length - currentCount;
  const body = `
<h1>${escapeHtml(category)}</h1>
<p class="page-intro">${currentCount} current product${currentCount === 1 ? '' : 's'}${discontinuedCount ? `, ${discontinuedCount} discontinued` : ''}.</p>
<div class="controls-row">
  <input type="search" id="search-input" class="search-input" placeholder="Search ${escapeHtml(category)}…" aria-label="Search">
  ${sortSelect(PRODUCT_SORT_OPTIONS)}
</div>
${filterBar('status', STATUS_VALUES, STATUS_LABELS)}
<p id="no-results" class="page-intro" style="display:none;">No products match your search.</p>
<div class="card-grid" id="grid" data-mode="category" data-category-name="${escapeHtml(category)}">
  ${items.map((i) => cardHtml(i.product, i.status)).join('\n')}
</div>`;
  return shell({
    title: `${category} — Apple Refresher`,
    description: `Every ${category} product on Apple Refresher, current and discontinued, with time since refresh and full release history.`,
    siteUrl,
    path: `/categories/${slug}/`,
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function specRow(label, valueHtml) {
  return valueHtml ? `<div class="spec-row"><dt>${label}</dt><dd>${valueHtml}</dd></div>` : '';
}

function productPage({ product, status, history, productsBySlug, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const sortedDates = history.slice().sort();
  const launch = sortedDates[0] || null;
  const latest = sortedDates[sortedDates.length - 1] || null;
  const today = new Date().toISOString().slice(0, 10);

  const timelineItems = sortedDates
    .slice()
    .reverse()
    .map((d, i) => {
      const label = i === 0 ? product.name : `${product.name} (earlier)`;
      return `<div class="timeline-item">
        <p class="timeline-name">${escapeHtml(label)}</p>
        <p class="timeline-date">${formatDate(d)}</p>
      </div>`;
    })
    .join('\n');

  const verdict =
    !status || product.coming_soon || product.discontinued
      ? null
      : status.status === 'fresh'
      ? { text: 'Good time to buy', cls: 'fresh' }
      : status.status === 'aging'
      ? { text: 'Fine to buy, refresh due within the year', cls: 'aging' }
      : { text: 'Wait, refresh is overdue', cls: 'overdue' };

  const images = product.image_urls && product.image_urls.length ? product.image_urls : product.image_url ? [product.image_url] : [];
  const mainImage = images[0]
    ? `<img src="${images[0]}" alt="${escapeHtml(product.name)}">`
    : categoryIcon(product.category);
  const galleryRest = images.length > 1
    ? `<div class="product-gallery">${images
        .slice(1)
        .map((url) => `<div class="product-gallery-item"><img src="${url}" alt="${escapeHtml(product.name)}"></div>`)
        .join('\n')}</div>`
    : '';
  const videoBlock = product.video_url
    ? `<video class="product-video" src="${product.video_url}" controls></video>`
    : '';

  const successor = product.replaced_by && productsBySlug ? productsBySlug[product.replaced_by] : null;
  const replacedByHtml = successor
    ? `<a href="/products/${successor.slug}/">${escapeHtml(successor.name)}</a>`
    : product.replaced_by
    ? escapeHtml(product.replaced_by)
    : '';

  const specs = [
    specRow('Category', categoryPill(product.category)),
    specRow('Status', product.discontinued ? 'Discontinued' : product.coming_soon ? 'Coming soon' : 'Current'),
    product.coming_soon
      ? specRow('Expected', product.expected_date ? formatDate(product.expected_date) : 'Not yet announced')
      : '',
    launch ? specRow('Launched', formatDate(launch)) : '',
    latest && sortedDates.length > 1 && !product.discontinued ? specRow('Last refreshed', formatDate(latest)) : '',
    sortedDates.length > 1 ? specRow('Times refreshed', String(sortedDates.length - 1)) : '',
    product.discontinued && product.discontinued_date ? specRow('Discontinued', formatDate(product.discontinued_date)) : '',
    launch && product.discontinued && product.discontinued_date ? specRow('Lifespan', lifespanText(launch, product.discontinued_date)) : '',
    launch && !product.discontinued && !product.coming_soon ? specRow('On sale for', `${daysBetween(launch, today)} days`) : '',
    specRow('Starting price', escapeHtml(formatPrice(product.price))),
    specRow('Chip', escapeHtml(product.chip)),
    specRow('Replaced by', replacedByHtml),
    product.discontinued ? specRow('Why it went', escapeHtml(product.discontinued_reason)) : '',
    product.external_link ? specRow('More information', `<a href="${product.external_link}" target="_blank" rel="noopener">${escapeHtml(product.external_link.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))} &#8599;</a>`) : '',
  ].filter(Boolean).join('\n');

  const releaseHistorySection = sortedDates.length
    ? `<h2>Release history</h2>
  <div class="timeline">${timelineItems}</div>`
    : '';

  const body = `
<article class="product-page">
  <div class="product-top">
    <div class="product-media">
      <div class="card-image product-image">${mainImage}</div>
      ${galleryRest}
      ${videoBlock}
    </div>
    <div class="product-info">
      <div class="product-header">
        <div>
          ${categoryPill(product.category)}
          <h1>${escapeHtml(product.name)}</h1>
        </div>
        <div class="product-header-right">
          ${productBadge(product, status)}
          <a href="/admin/?edit=${product.id}" class="admin-edit-link" style="display:none;">Edit this product</a>
        </div>
      </div>

      <dl class="spec-list">
        ${specs}
      </dl>

      ${verdict ? `<div class="verdict-row">
        <span>Verdict</span>
        <span class="badge badge--${verdict.cls}">${verdict.text}</span>
      </div>` : ''}

      ${product.discontinued ? '' : `<button class="wait-btn wait-btn--large" data-product-id="${product.id}" data-slug="${product.slug}" data-count="${product.waiting_count || 0}">
        Waiting for a refresh?
      </button>`}
    </div>
  </div>

  ${releaseHistorySection}

  ${product.rumor_note ? `<div class="callout"><p class="callout-label">Notes</p><p>${escapeHtml(product.rumor_note)}</p></div>` : ''}
</article>`;

  const description = product.discontinued
    ? `${product.name} was discontinued${product.discontinued_date ? ` in ${formatDate(product.discontinued_date)}` : ''}${launch ? `, after launching in ${formatDate(launch)}` : ''}.${successor ? ` It was replaced by the ${successor.name}.` : ''}`
    : status
    ? `${product.name} was last refreshed ${status.daysSince} days ago. See the full release history and whether now is a good time to buy.`
    : `${product.name} on Apple Refresher.`;

  return shell({
    title: `${product.name} — Apple Refresher`,
    description,
    siteUrl,
    path: `/products/${product.slug}/`,
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function aboutPage({ content, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const paragraphs = (content.body || '')
    .split('\n\n')
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  const body = `
<article class="about-page">
  <h1>${escapeHtml(content.heading || 'About Apple Refresher')}</h1>
  ${content.image_url ? `<div class="about-image"><img src="${content.image_url}" alt=""></div>` : ''}
  <div class="about-body">${paragraphs}</div>
</article>`;

  return shell({
    title: 'About — Apple Refresher',
    description: 'What Apple Refresher is and why it exists.',
    siteUrl,
    path: '/about/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function adminPage({ siteUrl, supabaseUrl, supabaseAnonKey }) {
  const body = `
<h1>Admin</h1>

<section id="login-section">
  <form id="login-form" class="admin-form">
    <label>Email<input type="email" id="email" required></label>
    <label>Password<input type="password" id="password" required></label>
    <button type="submit" class="admin-btn">Log in</button>
    <p id="login-error" class="form-error"></p>
  </form>
</section>

<section id="dashboard" style="display:none;">
  <div class="admin-topbar">
    <div class="admin-tabs">
      <button type="button" class="admin-tab-btn active" data-tab="products">Products</button>
      <button type="button" class="admin-tab-btn" data-tab="about">About page</button>
    </div>
    <button id="logout-btn" class="admin-btn">Log out</button>
  </div>

  <div id="tab-products" class="admin-tab-panel">
    <div id="product-list-view">
      <button id="new-product-btn" class="admin-btn admin-btn--primary">Add new product</button>
      <div id="product-list" class="admin-list"></div>
    </div>

    <div id="product-form-view" style="display:none;">
      <button type="button" id="back-to-list-btn" class="admin-back-link">&larr; Back to products</button>
      <h3 id="form-title">Add product</h3>
      <form id="product-form" class="admin-form">
        <label>Name<input type="text" id="name" required></label>
        <label>Category
          <input type="text" id="category" list="category-options" placeholder="e.g. iPhone, Vision Pro">
          <datalist id="category-options"></datalist>
        </label>
        <label>Starting price<input type="text" id="price" placeholder="£799"></label>
        <label>Chip<input type="text" id="chip"></label>
        <label>External link (e.g. a Wikipedia page)<input type="url" id="external_link" placeholder="https://en.wikipedia.org/wiki/..."></label>

        <div class="admin-subfield">
          <span class="admin-subfield-label">Refresh history (the first date is treated as the launch date)</span>
          <ul id="refresh-history-list" class="refresh-history-list"></ul>
          <div class="refresh-history-add">
            <input type="date" id="new-refresh-date">
            <button type="button" id="add-refresh-date-btn" class="admin-btn admin-btn--small">Add date</button>
          </div>
        </div>

        <label>Notes<textarea id="rumor_note" rows="3"></textarea></label>

        <div class="admin-subfield">
          <span class="admin-subfield-label">Photos (up to 6)</span>
          <div id="image-thumbs" class="admin-thumbs"></div>
          <label for="image-upload" class="admin-btn admin-btn--small">Add photos</label>
          <input type="file" id="image-upload" accept="image/*" multiple class="admin-file-input">
        </div>

        <div class="admin-subfield">
          <span class="admin-subfield-label">Video</span>
          <div id="video-status" class="admin-video-status">No video uploaded.</div>
          <label for="video-upload" class="admin-btn admin-btn--small">Add video</label>
          <input type="file" id="video-upload" accept="video/*" class="admin-file-input">
        </div>

        <label class="checkbox-label"><input type="checkbox" id="featured"> Featured on homepage</label>
        <label class="checkbox-label"><input type="checkbox" id="coming_soon"> Coming soon</label>
        <label>Expected date (if known)<input type="date" id="expected_date"></label>

        <label class="checkbox-label"><input type="checkbox" id="discontinued"> Discontinued</label>
        <label>Discontinued date<input type="date" id="discontinued_date"></label>
        <label>Replaced by (pick a product, or leave blank)
          <input type="text" id="replaced_by" list="product-options" placeholder="Start typing a product name">
          <datalist id="product-options"></datalist>
        </label>
        <label>Why it went (short, e.g. "Replaced by the iPhone" or "Folded into the Pro line")<textarea id="discontinued_reason" rows="2"></textarea></label>

        <button type="submit" class="admin-btn admin-btn--primary">Save product</button>
      </form>
    </div>
  </div>

  <div id="tab-about" class="admin-tab-panel" style="display:none;">
    <form id="about-form" class="admin-form">
      <label>Heading<input type="text" id="about_heading"></label>
      <label>Body text (leave a blank line between paragraphs)<textarea id="about_body" rows="6"></textarea></label>
      <div class="admin-subfield">
        <span class="admin-subfield-label">Image</span>
        <label for="about-image-upload" class="admin-btn admin-btn--small">Choose image</label>
        <input type="file" id="about-image-upload" accept="image/*" class="admin-file-input">
      </div>
      <input type="hidden" id="about_image_url">
      <button type="submit" class="admin-btn">Save about page</button>
    </form>
  </div>
</section>`;

  return shell({
    title: 'Admin — Apple Refresher',
    description: 'Manage products and site content.',
    siteUrl,
    path: '/admin/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
    noindex: true,
    scripts: [
      '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>',
      '<script src="/admin.js" defer></script>',
    ],
  });
}

module.exports = {
  homePage,
  allProductsPage,
  discontinuedPage,
  categoriesIndexPage,
  categoryPage,
  productPage,
  aboutPage,
  adminPage,
  cardHtml,
  productBadge,
  slugify,
};
