const STATUS_LABEL = { fresh: 'fresh', aging: 'aging', overdue: 'overdue' };

const LOGO_SVG = `<svg width="26" height="26" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <rect width="48" height="48" rx="12" fill="#5F5E5A"/>
  <circle cx="24" cy="24" r="13" stroke="#ffffff" stroke-width="2"/>
  <path d="M24 24V16" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
  <path d="M24 24H30" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const CATEGORY_ICONS = {
  iPhone: `<rect x="13" y="4" width="14" height="32" rx="3"/><line x1="17" y1="31" x2="23" y2="31"/>`,
  Mac: `<rect x="8" y="9" width="24" height="16" rx="1.5"/><path d="M5 30h30l-2.5-3h-25z"/>`,
  iPad: `<rect x="7" y="8" width="26" height="24" rx="3"/><line x1="19" y1="27" x2="21" y2="27"/>`,
  'Apple Watch': `<rect x="12" y="10" width="16" height="20" rx="5"/><rect x="27.5" y="17" width="3" height="6" rx="1"/>`,
  AirPods: `<path d="M14 10c-3 0-5 2-5 5v9c0 2 1.5 3 3 3s3-1 3-3V13"/><path d="M26 10c3 0 5 2 5 5v9c0 2-1.5 3-3 3s-3-1-3-3V13"/>`,
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

function badgeHtml(statusInfo) {
  if (!statusInfo) return '';
  const { status, daysSince } = statusInfo;
  return `<span class="badge badge--${status}">${daysSince}d &middot; ${STATUS_LABEL[status]}</span>`;
}

function shell({ title, description, siteUrl, path, bodyHtml, supabaseUrl, supabaseAnonKey, noindex, scripts }) {
  const scriptTags = (scripts || ['<script src="/app.js" defer></script>']).join('\n');
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
<link rel="icon" href="/logo.svg">
</head>
<body>
<header class="site-header">
  <a class="site-title" href="/">${LOGO_SVG}<span>Apple Refresher</span></a>
  <nav class="site-nav">
    <a href="/products/">All products</a>
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

function cardHtml(product, statusInfo) {
  return `<article class="card" data-category="${escapeHtml(product.category)}">
  <a class="card-link" href="/products/${product.slug}/">
    <div class="card-image">${product.image_url ? `<img src="${product.image_url}" alt="${escapeHtml(product.name)}">` : categoryIcon(product.category)}</div>
    <p class="card-name">${escapeHtml(product.name)}</p>
    ${badgeHtml(statusInfo)}
  </a>
  <button class="wait-btn" data-product-id="${product.id}" data-slug="${product.slug}">
    <span class="wait-count">${product.waiting_count || 0}</span> waiting for this
  </button>
</article>`;
}

function discontinuedCardHtml(product) {
  const date = product.discontinued_date
    ? new Date(product.discontinued_date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })
    : '';
  return `<article class="card card--discontinued">
  <div class="card-image">${product.image_url ? `<img src="${product.image_url}" alt="${escapeHtml(product.name)}">` : categoryIcon(product.category)}</div>
  <p class="card-name">${escapeHtml(product.name)}</p>
  <span class="badge badge--discontinued">Discontinued ${date}</span>
</article>`;
}

function homePage({ featured, rest, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const featuredStatus = featured.status;
  const body = `
<section class="hero">
  <a class="hero-card" href="/products/${featured.product.slug}/">
    <div class="hero-image">${featured.product.image_url ? `<img src="${featured.product.image_url}" alt="${escapeHtml(featured.product.name)}">` : categoryIcon(featured.product.category)}</div>
    <div class="hero-body">
      <p class="hero-eyebrow">Featured</p>
      <p class="hero-name">${escapeHtml(featured.product.name)}</p>
      ${badgeHtml(featuredStatus)}
    </div>
  </a>
  <div class="hero-grid">
    ${rest.map((r) => cardHtml(r.product, r.status)).join('\n')}
  </div>
</section>
<p class="see-all"><a href="/products/">See all products &rarr;</a></p>`;
  return shell({
    title: 'Apple Refresher — time since every Apple product was last refreshed',
    description: 'A quick look at how long it has been since every current Apple product was last updated.',
    siteUrl,
    path: '/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function allProductsPage({ items, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const categories = [...new Set(items.map((i) => i.product.category))];
  const body = `
<h1>All products</h1>
<div class="filter-bar">
  <button class="filter-btn active" data-filter="all">All</button>
  ${categories.map((c) => `<button class="filter-btn" data-filter="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('\n')}
</div>
<div class="card-grid" id="grid">
  ${items.map((i) => cardHtml(i.product, i.status)).join('\n')}
</div>`;
  return shell({
    title: 'All products — Apple Refresher',
    description: 'Every current Apple product and how long it has been since its last refresh.',
    siteUrl,
    path: '/products/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function discontinuedPage({ items, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const body = `
<h1>Discontinued products</h1>
<p class="page-intro">Products Apple no longer sells, newest first.</p>
<div class="card-grid">
  ${items.map((p) => discontinuedCardHtml(p)).join('\n')}
</div>`;
  return shell({
    title: 'Discontinued Apple products — Apple Refresher',
    description: 'Apple products that have been discontinued, listed by date.',
    siteUrl,
    path: '/discontinued/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function productPage({ product, status, history, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const timelineItems = history
    .slice()
    .reverse()
    .map((d, i) => {
      const label = i === 0 ? product.name : `${product.name} (earlier)`;
      return `<div class="timeline-item">
        <p class="timeline-name">${escapeHtml(label)}</p>
        <p class="timeline-date">${new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })}</p>
      </div>`;
    })
    .join('\n');

  const verdict =
    status.status === 'fresh'
      ? { text: 'Good time to buy', cls: 'fresh' }
      : status.status === 'aging'
      ? { text: 'Fine to buy, refresh due within the year', cls: 'aging' }
      : { text: 'Wait, refresh is overdue', cls: 'overdue' };

  const body = `
<article class="product-page">
  <div class="product-header">
    <div>
      <p class="hero-eyebrow">${escapeHtml(product.category)}</p>
      <h1>${escapeHtml(product.name)}</h1>
    </div>
    ${badgeHtml(status)}
  </div>

  <div class="card-image product-image">${product.image_url ? `<img src="${product.image_url}" alt="${escapeHtml(product.name)}">` : categoryIcon(product.category)}</div>

  <div class="stat-row">
    <div class="stat"><p class="stat-label">Last refreshed</p><p class="stat-value">${new Date(status.lastRefresh).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })}</p></div>
    ${product.price ? `<div class="stat"><p class="stat-label">Price</p><p class="stat-value">${escapeHtml(product.price)}</p></div>` : ''}
    ${product.chip ? `<div class="stat"><p class="stat-label">Chip</p><p class="stat-value">${escapeHtml(product.chip)}</p></div>` : ''}
  </div>

  <h2>Release history</h2>
  <div class="timeline">${timelineItems}</div>

  ${product.rumor_note ? `<div class="callout"><p class="callout-label">Likely next refresh</p><p>${escapeHtml(product.rumor_note)}</p></div>` : ''}

  <div class="verdict-row">
    <span>Verdict</span>
    <span class="badge badge--${verdict.cls}">${verdict.text}</span>
  </div>

  <button class="wait-btn wait-btn--large" data-product-id="${product.id}" data-slug="${product.slug}">
    <span class="wait-count">${product.waiting_count || 0}</span> waiting for this
  </button>
</article>`;

  return shell({
    title: `${product.name} — Apple Refresher`,
    description: `${product.name} was last refreshed ${status.daysSince} days ago. See the full release history and whether now is a good time to buy.`,
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
  <button id="logout-btn" class="admin-btn">Log out</button>

  <h2>Products</h2>
  <button id="new-product-btn" class="admin-btn">Add new product</button>
  <div id="product-list" class="admin-list"></div>

  <h3 id="form-title">Add product</h3>
  <form id="product-form" class="admin-form">
    <label>Slug (used in the URL, e.g. iphone-17-pro)<input type="text" id="slug" required></label>
    <label>Name<input type="text" id="name" required></label>
    <label>Category
      <select id="category">
        <option>iPhone</option>
        <option>Mac</option>
        <option>iPad</option>
        <option>Apple Watch</option>
        <option>AirPods</option>
        <option>Other</option>
      </select>
    </label>
    <label>Price<input type="text" id="price" placeholder="£799"></label>
    <label>Chip<input type="text" id="chip"></label>
    <label>Refresh history (comma separated, oldest first, YYYY-MM-DD)<input type="text" id="refresh_history" placeholder="2024-09-20, 2025-09-19"></label>
    <label>What's next note<textarea id="rumor_note" rows="3"></textarea></label>
    <label>Screenshot<input type="file" id="image-upload" accept="image/*"></label>
    <input type="hidden" id="image_url">
    <label class="checkbox-label"><input type="checkbox" id="featured"> Featured on homepage</label>
    <label class="checkbox-label"><input type="checkbox" id="discontinued"> Discontinued</label>
    <label>Discontinued date<input type="date" id="discontinued_date"></label>
    <button type="submit" class="admin-btn">Save product</button>
  </form>

  <h2>About page</h2>
  <form id="about-form" class="admin-form">
    <label>Heading<input type="text" id="about_heading"></label>
    <label>Body text (leave a blank line between paragraphs)<textarea id="about_body" rows="6"></textarea></label>
    <label>Image<input type="file" id="about-image-upload" accept="image/*"></label>
    <input type="hidden" id="about_image_url">
    <button type="submit" class="admin-btn">Save about page</button>
  </form>
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

module.exports = { homePage, allProductsPage, discontinuedPage, productPage, aboutPage, adminPage, cardHtml };
