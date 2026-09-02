const STATUS_LABEL = { fresh: 'fresh', aging: 'aging', overdue: 'overdue' };

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

function shell({ title, description, siteUrl, path, bodyHtml, supabaseUrl, supabaseAnonKey }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${siteUrl}${path}">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="site-header">
  <a class="site-title" href="/">Apple Refresher</a>
  <nav class="site-nav">
    <a href="/products/">All products</a>
    <a href="/discontinued/">Discontinued</a>
  </nav>
</header>
<main>
${bodyHtml}
</main>
<footer class="site-footer">
  <p>Apple Refresher is an independent tracker and is not affiliated with Apple Inc.</p>
</footer>
<script>
  window.SUPABASE_URL = ${JSON.stringify(supabaseUrl || '')};
  window.SUPABASE_ANON_KEY = ${JSON.stringify(supabaseAnonKey || '')};
</script>
<script src="/app.js" defer></script>
</body>
</html>`;
}

function cardHtml(product, statusInfo) {
  return `<article class="card" data-category="${escapeHtml(product.category)}">
  <a class="card-link" href="/products/${product.slug}/">
    <div class="card-image">${product.image_url ? `<img src="${product.image_url}" alt="${escapeHtml(product.name)}">` : '<span class="card-image-placeholder"></span>'}</div>
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
  <div class="card-image">${product.image_url ? `<img src="${product.image_url}" alt="${escapeHtml(product.name)}">` : '<span class="card-image-placeholder"></span>'}</div>
  <p class="card-name">${escapeHtml(product.name)}</p>
  <span class="badge badge--discontinued">Discontinued ${date}</span>
</article>`;
}

function homePage({ featured, rest, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const featuredStatus = featured.status;
  const body = `
<section class="hero">
  <a class="hero-card" href="/products/${featured.product.slug}/">
    <div class="hero-image">${featured.product.image_url ? `<img src="${featured.product.image_url}" alt="${escapeHtml(featured.product.name)}">` : '<span class="card-image-placeholder"></span>'}</div>
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

  <div class="card-image product-image">${product.image_url ? `<img src="${product.image_url}" alt="${escapeHtml(product.name)}">` : '<span class="card-image-placeholder"></span>'}</div>

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

module.exports = { homePage, allProductsPage, discontinuedPage, productPage, cardHtml };
