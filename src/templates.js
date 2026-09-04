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

function sanitizeRichText(html) {
  if (!html) return '';
  const allowed = new Set(['p', 'b', 'strong', 'i', 'em', 'u', 'br', 'a']);
  let out = String(html);
  out = out.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<div([^>]*)>/gi, '<p>').replace(/<\/div>/gi, '</p>');
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag, attrs) => {
    const lower = tag.toLowerCase();
    const isClosing = match.charAt(1) === '/';
    if (!allowed.has(lower)) return '';
    if (lower === 'a') {
      if (isClosing) return '</a>';
      const hrefMatch = attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i);
      const href = hrefMatch ? hrefMatch[1] : '';
      const safeHref = /^https?:\/\//i.test(href) ? href.replace(/"/g, '&quot;') : '#';
      return `<a href="${safeHref}" target="_blank" rel="noopener">`;
    }
    return isClosing ? `</${lower}>` : `<${lower}>`;
  });
  return out;
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

function datePrecision(str) {
  if (!str) return null;
  if (/^\d{4}$/.test(str)) return 'year';
  if (/^\d{4}-\d{2}$/.test(str)) return 'month';
  return 'day';
}

function formatDate(str) {
  if (!str) return '';
  const precision = datePrecision(str);
  if (precision === 'year') return str;
  if (precision === 'month') {
    const [y, m] = str.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' });
  }
  return new Date(str).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
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

function categoryTimelinePoints(product, allProducts) {
  const sameCategory = (allProducts || []).filter((p) => p.category === product.category);
  const launchCandidates = sameCategory.map((p) => p.original_launch_date).filter(Boolean);

  const points = [];
  if (launchCandidates.length) {
    // Once anyone in this category has set the line's true origin, every
    // product in it shares that single launch point, plus every refresh
    // date from every model in the line, merged and deduplicated.
    const lineLaunch = launchCandidates.reduce((earliest, d) => (d < earliest ? d : earliest));
    points.push({ date: lineLaunch, label: 'Launch', type: 'launch' });
    const dateSet = new Set();
    sameCategory.forEach((p) => (p.refresh_history || []).forEach((d) => {
      if (d !== lineLaunch) dateSet.add(d);
    }));
    Array.from(dateSet).sort().forEach((d) => points.push({ date: d, label: 'Refresh', type: 'refresh' }));
  } else {
    const sortedDates = (product.refresh_history || []).slice().sort();
    sortedDates.forEach((d, i) => {
      const isLaunch = i === 0 && !!product.is_new_launch;
      points.push({ date: d, label: isLaunch ? 'Launch' : 'Refresh', type: isLaunch ? 'launch' : 'refresh' });
    });
  }
  if (product.discontinued && product.discontinued_date) {
    points.push({ date: product.discontinued_date, label: 'Discontinued', type: 'discontinued' });
  }
  return points;
}

function horizontalTimelineHtml(product, allProducts) {
  const points = categoryTimelinePoints(product, allProducts);
  if (!points.length) return '';
  const items = points.map((pt) => `<div class="timeline-point timeline-point--${pt.type}">
    <span class="timeline-point-line"></span>
    <span class="timeline-dot"></span>
    <p class="timeline-point-label">${pt.label}</p>
    <p class="timeline-point-date">${formatDate(pt.date)}</p>
  </div>`).join('\n');
  return `<div class="timeline-horizontal">${items}</div>`;
}

function appleSupportStatus(product) {
  if (!product.discontinued || !product.discontinued_date) return null;
  const years = daysBetween(product.discontinued_date, new Date().toISOString().slice(0, 10)) / 365.25;
  if (years >= 7) return 'Obsolete (Apple no longer services it)';
  if (years >= 5) return 'Vintage (limited repairs, subject to parts)';
  return 'Discontinued, not yet Vintage';
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

function categoryPill(category) {
  return `<a class="pill" href="/categories/${slugify(category)}/">${escapeHtml(category)}</a>`;
}

function badgeDaysInfo(product, statusInfo) {
  if (!statusInfo) return null;
  if (product.days_basis === 'launch') {
    const launch = launchDate(product);
    if (launch) {
      return { days: daysBetween(launch, new Date().toISOString().slice(0, 10)), suffix: 'since launch' };
    }
  }
  return { days: statusInfo.daysSince, suffix: 'since refresh' };
}

function badgeHtml(product, statusInfo) {
  if (!statusInfo) return '';
  const info = badgeDaysInfo(product, statusInfo);
  return `<span class="badge badge--${statusInfo.status}">${info.days} days ${info.suffix}</span>`;
}

function productBadge(product, statusInfo) {
  if (product.discontinued) {
    const date = product.discontinued_date ? ` ${formatDate(product.discontinued_date)}` : '';
    return `<span class="badge badge--discontinued">Discontinued${date}</span>`;
  }
  if (product.coming_soon) {
    return `<span class="badge badge--coming-soon">Coming soon</span>`;
  }
  return badgeHtml(product, statusInfo);
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
<header class="site-header-bg">
  <div class="site-header">
    <a class="site-title" href="/"><img src="/logo.png" alt="" class="site-logo"><span>Apple Refresher</span></a>
    <nav class="site-nav">
      <a href="/products/">All products</a>
      <a href="/categories/">Categories</a>
      <a href="/discontinued/">Discontinued</a>
      <a href="/gallery/">Gallery</a>
      <a href="/about/">About</a>
    </nav>
  </div>
</header>
<main>
${bodyHtml}
</main>
<footer class="site-footer-bg">
  <div class="site-footer">
    <nav class="footer-nav">
      <a href="/gallery/">Gallery</a>
      <a href="/about/">About us</a>
      <a href="/admin/">Admin</a>
    </nav>
    <p>Apple Refresher is an independent tracker and is not affiliated with Apple Inc.</p>
  </div>
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
    <div class="card-image">${categoryIcon(product.category)}</div>
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

const GALLERY_SORT_OPTIONS = [
  ['date-desc', 'Newest first'],
  ['date-asc', 'Oldest first'],
  ['name-asc', 'Name: A to Z'],
  ['name-desc', 'Name: Z to A'],
];

function dateToTimestamp(str) {
  if (!str) return '';
  const ms = new Date(str).getTime();
  return Number.isNaN(ms) ? '' : ms;
}

function galleryPhotoCardHtml(photo) {
  const displayName = photo.caption || (photo.tags && photo.tags[0]) || 'Untitled photo';
  const searchText = [photo.caption, photo.location, ...(photo.tags || [])].filter(Boolean).join(' ');
  const tagsHtml = [
    photo.location ? `<span class="pill">${escapeHtml(photo.location)}</span>` : '',
    ...(photo.tags || []).map((t) => `<span class="pill">${escapeHtml(t)}</span>`),
  ].filter(Boolean).join('\n');
  return `<article class="card" data-date="${dateToTimestamp(photo.date_taken)}" data-search="${escapeHtml(searchText.toLowerCase())}">
  <a class="card-link" href="${photo.image_url ? escapeHtml(photo.image_url) : '#'}" target="_blank" rel="noopener">
    <div class="card-image">${photo.image_url ? `<img src="${escapeHtml(photo.image_url)}" alt="${escapeHtml(displayName)}">` : ''}</div>
    <p class="card-name">${escapeHtml(displayName)}</p>
    ${photo.date_taken ? `<p class="card-meta">${formatDate(photo.date_taken)}</p>` : ''}
  </a>
  <div class="gallery-tags">${tagsHtml}</div>
</article>`;
}

function galleryPage({ photos, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const body = photos.length
    ? `
<h1>Gallery</h1>
<p class="page-intro">Photos taken along the way, in Apple Stores and elsewhere.</p>
<div class="controls-row">
  <input type="search" id="search-input" class="search-input" placeholder="Search photos…" aria-label="Search photos">
  ${sortSelect(GALLERY_SORT_OPTIONS)}
</div>
<p id="no-results" class="page-intro" style="display:none;">No photos match your search.</p>
<div class="card-grid" id="grid" data-mode="gallery">
  ${photos.map(galleryPhotoCardHtml).join('\n')}
</div>`
    : `
<h1>Gallery</h1>
<p class="page-intro">No photos yet. Add some in <a href="/admin/">/admin/</a>.</p>`;
  return shell({
    title: 'Gallery — Apple Refresher',
    description: 'Photos taken along the way, in Apple Stores and elsewhere.',
    siteUrl,
    path: '/gallery/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function emptyState(what) {
  return `<p class="page-intro">No ${what} yet. Add one in <a href="/admin/">/admin/</a>, every product needs at least one refresh date, or a Coming soon flag, to show up here.</p>`;
}

function homePage({ featured, rest, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const heroSection = featured
    ? `<section class="hero">
  <a class="hero-card" href="/products/${featured.product.slug}/">
    <div class="hero-image">${categoryIcon(featured.product.category)}</div>
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

function heroStatHtml(product, statusInfo) {
  if (product.discontinued) {
    const date = product.discontinued_date ? ` ${formatDate(product.discontinued_date)}` : '';
    return `<p class="days-hero days-hero--discontinued">Discontinued${date}</p>`;
  }
  if (product.coming_soon) {
    return `<p class="days-hero days-hero--coming-soon">Coming soon</p>`;
  }
  if (!statusInfo) return '';
  const info = badgeDaysInfo(product, statusInfo);
  return `<p class="days-hero days-hero--${statusInfo.status}"><span class="days-hero-number">${info.days}</span> days ${info.suffix}</p>`;
}

function externalLinkLabel(product) {
  const isWiki = /wikipedia\.org/i.test(product.external_link || '');
  return `${product.name}${isWiki ? ' (Wiki)' : ''}`;
}

function productPage({ product, status, history, productsBySlug, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const sortedDates = history.slice().sort();
  const launch = product.original_launch_date || sortedDates[0] || null;
  const latest = sortedDates[sortedDates.length - 1] || null;

  const allProducts = productsBySlug ? Object.values(productsBySlug) : [product];
  const timelinePoints = categoryTimelinePoints(product, allProducts);
  const timelineHtml = horizontalTimelineHtml(product, allProducts);

  const mainImage = categoryIcon(product.category);
  const videoBlock = product.video_url
    ? `<video class="product-video" src="${product.video_url}" controls></video>`
    : '';

  const successor = product.replaced_by && productsBySlug ? productsBySlug[product.replaced_by] : null;
  const replacedByHtml = successor
    ? `<a href="/products/${successor.slug}/">${escapeHtml(successor.name)}</a>`
    : product.replaced_by
    ? escapeHtml(product.replaced_by)
    : '';

  const predecessor = product.previous_model && productsBySlug ? productsBySlug[product.previous_model] : null;
  const previousModelHtml = predecessor
    ? `<a href="/products/${predecessor.slug}/">${escapeHtml(predecessor.name)}</a>`
    : product.previous_model
    ? escapeHtml(product.previous_model)
    : '';

  const daysInfo = status ? badgeDaysInfo(product, status) : null;

  const specs = [
    specRow('Category', categoryPill(product.category)),
    specRow('Status', product.discontinued ? 'Discontinued' : product.coming_soon ? 'Coming soon' : 'Current'),
    product.coming_soon
      ? specRow('Expected', product.expected_date ? formatDate(product.expected_date) : 'Not yet announced')
      : '',
    launch ? specRow('Launched', formatDate(launch)) : '',
    latest && sortedDates.length > 1 && !product.discontinued ? specRow('Last refreshed', formatDate(latest)) : '',
    sortedDates.length > 1 ? specRow('Times refreshed', String(sortedDates.length - 1)) : '',
    status && !product.discontinued ? specRow('Typical refresh cycle', `About every ${status.avgCycleDays} days`) : '',
    status && sortedDates.length > 1 && !product.discontinued && !product.coming_soon
      ? specRow('Next refresh expected around', new Date(new Date(status.lastRefresh).getTime() + status.avgCycleDays * 86400000).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }))
      : '',
    product.discontinued && product.discontinued_date ? specRow('Discontinued', formatDate(product.discontinued_date)) : '',
    launch && product.discontinued && product.discontinued_date ? specRow('Lifespan', lifespanText(launch, product.discontinued_date)) : '',
    product.discontinued ? specRow('Apple support status', appleSupportStatus(product)) : '',
    specRow('Starting price', escapeHtml(formatPrice(product.price))),
    sortedDates.length ? specRow('Update type', product.is_new_launch ? 'New launch' : 'Refresh') : '',
    daysInfo ? specRow('Days counted from', `${daysInfo.days} days (${product.days_basis === 'launch' ? 'Launch' : 'Refresh'})`) : '',
    specRow('Chip', escapeHtml(product.chip)),
    specRow('Previous model', previousModelHtml),
    specRow('Replaced by', replacedByHtml),
    product.discontinued ? specRow('Why it went', escapeHtml(product.discontinued_reason)) : '',
    product.external_link ? specRow('More information', `<a href="${product.external_link}" target="_blank" rel="noopener">${escapeHtml(externalLinkLabel(product))} &#8599;</a>`) : '',
    product.discontinued ? '' : specRow('Waiting for a refresh', `<span class="wait-count-value">${product.waiting_count || 0}</span> people`),
  ].filter(Boolean).join('\n');

  const releaseHistorySection = timelinePoints.length
    ? `<h2>Release history</h2>
  ${timelineHtml}`
    : '';

  const body = `
<article class="product-page">
  <div class="product-top">
    <div class="product-media">
      <div class="card-image product-image">${mainImage}</div>
      ${videoBlock}
    </div>
    <div class="product-info">
      <div class="product-header">
        <div>
          <h1>${escapeHtml(product.name)}</h1>
          ${heroStatHtml(product, status)}
        </div>
        <a href="/admin/?edit=${product.id}" class="admin-edit-link" style="display:none;">Edit this product</a>
      </div>

      <dl class="spec-list">
        ${specs}
      </dl>

      ${product.discontinued ? '' : `<button class="wait-btn wait-btn--large" data-product-id="${product.id}" data-slug="${product.slug}" data-count="${product.waiting_count || 0}">
        Are you looking forward to a new ${escapeHtml(product.category)}?
      </button>`}
    </div>
  </div>

  ${releaseHistorySection}

  ${product.rumor_note ? `<div class="callout"><p class="callout-label">Notes</p><div class="callout-body">${sanitizeRichText(product.rumor_note)}</div></div>` : ''}
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

function datePrecisionFieldHtml(prefix, label, hint) {
  return `<div class="admin-subfield">
  <span class="admin-subfield-label">${label}</span>
  <div class="date-precision-radios">
    <label><input type="radio" name="${prefix}_precision" value="day" checked> Full date</label>
    <label><input type="radio" name="${prefix}_precision" value="month"> Month &amp; year</label>
    <label><input type="radio" name="${prefix}_precision" value="year"> Year only</label>
  </div>
  <div class="date-precision-row">
    <input type="date" id="${prefix}_day" class="date-precision-input">
    <input type="month" id="${prefix}_month" class="date-precision-input" style="display:none;">
    <input type="number" id="${prefix}_year" class="date-precision-input" style="display:none;" placeholder="YYYY" min="1970" max="2035">
    <button type="button" class="date-precision-clear" data-prefix="${prefix}">Clear</button>
  </div>
  ${hint ? `<p class="admin-hint">${hint}</p>` : ''}
</div>`;
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
      <button type="button" class="admin-tab-btn" data-tab="gallery">Gallery</button>
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
        <h3 class="admin-form-section">Product details</h3>
        <label>Name<input type="text" id="name" required></label>
        <label>Category
          <input type="text" id="category" list="category-options" placeholder="e.g. iPhone, Vision Pro">
          <datalist id="category-options"></datalist>
        </label>
        <label>Starting price<input type="text" id="price" placeholder="£799"></label>

        <h3 class="admin-form-section">Timeline</h3>
        ${datePrecisionFieldHtml('original_launch_date', 'Original launch date (of the product line, e.g. the first iPhone)', 'Leave blank if this isn\u2019t a good example, the refresh history below will be used instead.')}

        <div class="admin-subfield">
          <span class="admin-subfield-label">Refresh history</span>
          <ul id="refresh-history-list" class="refresh-history-list"></ul>
          <div class="date-precision-radios">
            <label><input type="radio" name="new_refresh_date_precision" value="day" checked> Full date</label>
            <label><input type="radio" name="new_refresh_date_precision" value="month"> Month &amp; year</label>
            <label><input type="radio" name="new_refresh_date_precision" value="year"> Year only</label>
          </div>
          <div class="refresh-history-add">
            <input type="date" id="new_refresh_date_day" class="date-precision-input">
            <input type="month" id="new_refresh_date_month" class="date-precision-input" style="display:none;">
            <input type="number" id="new_refresh_date_year" class="date-precision-input" style="display:none;" placeholder="YYYY" min="1970" max="2035">
            <button type="button" id="add-refresh-date-btn" class="admin-btn admin-btn--small">Add date</button>
          </div>
          <p class="admin-hint">Pick a date and it's added automatically. Each one is a time this specific model was refreshed, if Original launch date above is blank, the earliest one here is treated as the launch.</p>
        </div>

        <div class="admin-subfield">
          <span class="admin-subfield-label">Badge shows</span>
          <label class="checkbox-label"><input type="radio" name="days_basis" id="days_basis_refresh" value="refresh" checked> Days since refresh</label>
          <label class="checkbox-label"><input type="radio" name="days_basis" id="days_basis_launch" value="launch"> Days since launch</label>
        </div>

        <label class="checkbox-label"><input type="checkbox" id="is_new_launch"> This is a brand new product, not a refresh of an existing line</label>

        <h3 class="admin-form-section">Video</h3>
        <div class="admin-subfield">
          <span class="admin-subfield-label">Video</span>
          <div id="video-status" class="admin-video-status">No video uploaded.</div>
          <label for="video-upload" class="admin-btn admin-btn--small admin-btn--primary">Add video</label>
          <input type="file" id="video-upload" accept="video/*" class="admin-file-input">
        </div>

        <h3 class="admin-form-section">More information</h3>
        <label>External link (e.g. a Wikipedia page)<input type="url" id="external_link" placeholder="https://en.wikipedia.org/wiki/..."></label>

        <div class="admin-subfield">
          <span class="admin-subfield-label">Notes</span>
          <div class="richtext-toolbar">
            <button type="button" data-cmd="bold"><b>B</b></button>
            <button type="button" data-cmd="italic"><i>I</i></button>
            <button type="button" data-cmd="underline"><u>U</u></button>
            <button type="button" data-cmd="insertParagraph">&para;</button>
            <button type="button" id="richtext-link-btn">&#128279;</button>
            <button type="button" data-cmd="removeFormat" class="richtext-clear">&times;</button>
            <button type="button" id="richtext-clear-all-btn" class="richtext-clear-all">Clear all formatting</button>
          </div>
          <div id="rumor_note_editor" class="richtext-editor" contenteditable="true"></div>
        </div>

        <h3 class="admin-form-section">Homepage</h3>
        <label class="checkbox-label"><input type="checkbox" id="featured"> Featured on homepage</label>

        <h3 class="admin-form-section">Coming soon</h3>
        <label class="checkbox-label"><input type="checkbox" id="coming_soon"> Coming soon</label>
        ${datePrecisionFieldHtml('expected_date', 'Expected date (if known)')}

        <h3 class="admin-form-section">Discontinued</h3>
        <label class="checkbox-label"><input type="checkbox" id="discontinued"> Discontinued</label>
        ${datePrecisionFieldHtml('discontinued_date', 'Discontinued date')}
        <label>Replaced by (pick a product, or leave blank)
          <input type="text" id="replaced_by" list="product-options" placeholder="Start typing a product name">
          <datalist id="product-options"></datalist>
        </label>
        <label>Previous model (pick a product, or leave blank)
          <input type="text" id="previous_model" list="product-options" placeholder="Start typing a product name">
        </label>
        <label>Why it went (short, e.g. "Replaced by the iPhone" or "Folded into the Pro line")<textarea id="discontinued_reason" rows="2"></textarea></label>

        <button type="submit" class="admin-btn admin-btn--primary">Save product</button>
      </form>
    </div>
  </div>

  <div id="tab-gallery" class="admin-tab-panel" style="display:none;">
    <div id="gallery-list-view">
      <button id="new-photo-btn" class="admin-btn admin-btn--primary">Add new photo</button>
      <div id="gallery-list" class="admin-list"></div>
    </div>

    <div id="gallery-form-view" style="display:none;">
      <button type="button" id="gallery-back-to-list-btn" class="admin-back-link">&larr; Back to gallery</button>
      <h3 id="gallery-form-title">Add photo</h3>
      <form id="gallery-form" class="admin-form">
        <div class="admin-subfield">
          <span class="admin-subfield-label">Photo</span>
          <div id="gallery-image-thumb" class="admin-thumbs"></div>
          <label for="gallery-image-upload" class="admin-btn admin-btn--small admin-btn--primary">Choose photo</label>
          <input type="file" id="gallery-image-upload" accept="image/*" class="admin-file-input">
        </div>

        <label>Caption (optional)<input type="text" id="gallery-caption" placeholder="e.g. iPhone 17 Pro in Cosmic Orange"></label>

        ${datePrecisionFieldHtml('gallery_date_taken', 'Date taken')}

        <label>Location<input type="text" id="gallery-location" placeholder="e.g. Cardiff"></label>

        <div class="admin-subfield">
          <span class="admin-subfield-label">Tags</span>
          <ul id="gallery-tags-list" class="refresh-history-list"></ul>
          <div class="refresh-history-add">
            <input type="text" id="new-gallery-tag" placeholder="e.g. iPhone 17, Space Grey">
            <button type="button" id="add-gallery-tag-btn" class="admin-btn admin-btn--small">Add tag</button>
          </div>
        </div>

        <button type="submit" class="admin-btn admin-btn--primary">Save photo</button>
      </form>
    </div>
  </div>

  <div id="tab-about" class="admin-tab-panel" style="display:none;">
    <form id="about-form" class="admin-form">
      <label>Heading<input type="text" id="about_heading"></label>
      <label>Body text (leave a blank line between paragraphs)<textarea id="about_body" rows="6"></textarea></label>
      <div class="admin-subfield">
        <span class="admin-subfield-label">Image</span>
        <label for="about-image-upload" class="admin-btn admin-btn--small admin-btn--primary">Choose image</label>
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
  sanitizeRichText,
  categoryTimelinePoints,
  galleryPage,
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
