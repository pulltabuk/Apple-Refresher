const CATEGORY_ICONS = {
  iPhone: `<rect x="13" y="4" width="14" height="32" rx="3"/><line x1="17" y1="31" x2="23" y2="31"/>`,
  Mac: `<rect x="8" y="9" width="24" height="16" rx="1.5"/><path d="M5 30h30l-2.5-3h-25z"/>`,
  iPad: `<rect x="7" y="8" width="26" height="24" rx="3"/><line x1="19" y1="27" x2="21" y2="27"/>`,
  'Apple Watch': `<rect x="12" y="10" width="16" height="20" rx="5"/><rect x="27.5" y="17" width="3" height="6" rx="1"/>`,
  AirPods: `<path d="M14 10c-3 0-5 2-5 5v9c0 2 1.5 3 3 3s3-1 3-3V13"/><path d="M26 10c3 0 5 2 5 5v9c0 2-1.5 3-3 3s-3-1-3-3V13"/>`,
  'Vision Pro': `<path d="M6 18c0-4 3-6 14-6s14 2 14 6-3 6-14 6S6 22 6 18z"/><circle cx="15" cy="18" r="2.5"/><circle cx="25" cy="18" r="2.5"/>`,
  'Apple TV': `<rect x="9" y="9" width="22" height="22" rx="4"/><text x="20" y="24" font-size="9" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">TV</text>`,
  AirTag: `<circle cx="20" cy="20" r="14"/><circle cx="20" cy="20" r="10.5"/>`,
  Other: `<rect x="8" y="8" width="24" height="24" rx="4"/>`,
};

function categoryIcon(category, size) {
  const key = Object.keys(CATEGORY_ICONS).find((k) => k.toLowerCase() === String(category || '').toLowerCase());
  const shape = (key && CATEGORY_ICONS[key]) || CATEGORY_ICONS.Other;
  const s = size || 40;
  return `<svg class="placeholder-icon" viewBox="0 0 40 40" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
}

function sanitizeRichText(html, siteUrl) {
  if (!html) return '';
  const allowed = new Set(['p', 'b', 'strong', 'i', 'em', 'u', 'br', 'a']);
  let siteHost = '';
  try { siteHost = siteUrl ? new URL(siteUrl).host : ''; } catch (e) { siteHost = ''; }
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
      const isHttp = /^https?:\/\//i.test(href);
      const safeHref = isHttp ? href.replace(/"/g, '&quot;') : '#';
      let isInternal = false;
      if (isHttp && siteHost) {
        try { isInternal = new URL(href).host === siteHost; } catch (e) { isInternal = false; }
      }
      return isInternal ? `<a href="${safeHref}">` : `<a href="${safeHref}" target="_blank" rel="noopener">`;
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

function normaliseGroupKey(value) {
  return (value || '').trim().toLowerCase();
}

function categoryTimelinePoints(product, allProducts) {
  const groupKey = normaliseGroupKey(product.timeline_name || product.category);
  const sameCategory = (allProducts || []).filter((p) => normaliseGroupKey(p.timeline_name || p.category) === groupKey);

  // Collect every date-owning entry across every product in the group,
  // regardless of whether anyone has set original_launch_date. That
  // field only breaks ties on which date is "the" launch when it's
  // ambiguous; it was never meant to be the only way other products'
  // own refresh dates make it onto a shared timeline.
  const dateOwners = new Map();
  sameCategory.forEach((p) => (p.refresh_history || []).forEach((d) => {
    if (!dateOwners.has(d)) dateOwners.set(d, p.name);
  }));

  const launchCandidates = sameCategory.map((p) => p.original_launch_date).filter(Boolean);
  const lineLaunch = launchCandidates.length
    ? launchCandidates.reduce((earliest, d) => (d < earliest ? d : earliest))
    : (dateOwners.size ? Array.from(dateOwners.keys()).sort()[0] : null);
  const launchOwnerFromField = sameCategory.find((p) => p.original_launch_date === lineLaunch);
  const launchOwnerName = launchOwnerFromField ? launchOwnerFromField.name : (lineLaunch ? dateOwners.get(lineLaunch) : null);

  const points = [];
  if (lineLaunch) points.push({ date: lineLaunch, label: 'Launch', type: 'launch', productName: launchOwnerName || product.name });
  Array.from(dateOwners.keys()).filter((d) => d !== lineLaunch).sort().forEach((d) => points.push({ date: d, label: 'Refresh', type: 'refresh', productName: dateOwners.get(d) }));

  sameCategory.forEach((p) => {
    if (p.discontinued && p.discontinued_date) {
      points.push({ date: p.discontinued_date, label: 'Discontinued', type: 'discontinued', productName: p.name });
    }
  });
  const typePriority = { discontinued: 0, launch: 1, refresh: 1 };
  points.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : typePriority[a.type] - typePriority[b.type]));
  return points;
}

function horizontalTimelineHtml(product, allProducts) {
  const points = categoryTimelinePoints(product, allProducts);
  if (!points.length) return '';

  // Merge adjacent same-date points into one shared position, so a
  // discontinued model and whatever replaced it sit together at a
  // single spot on the timeline rather than as two separate dots.
  const groups = [];
  let gi = 0;
  while (gi < points.length) {
    if (gi + 1 < points.length && points[gi].date === points[gi + 1].date) {
      groups.push([points[gi], points[gi + 1]]);
      gi += 2;
    } else {
      groups.push([points[gi]]);
      gi += 1;
    }
  }

  const entryHtml = (pt) => `<p class="timeline-point-name">${escapeHtml(pt.productName)}</p>
      <p class="timeline-point-label">${pt.label}</p>
      <p class="timeline-point-date">${formatDate(pt.date)}</p>`;

  const items = groups.map((group, i) => {
    const leftLine = i > 0 ? `<span class="timeline-point-line-half timeline-point-line-half--left"></span>` : '';
    const rightLine = i < groups.length - 1 ? `<span class="timeline-point-line-half timeline-point-line-half--right"></span>` : '';
    if (group.length === 2) {
      return `<div class="timeline-point timeline-point--merged">
    ${leftLine}
    ${rightLine}
    <span class="timeline-dot"></span>
    <div class="timeline-point-content timeline-point-content--above">
      ${entryHtml(group[0])}
    </div>
    <div class="timeline-point-content timeline-point-content--below">
      ${entryHtml(group[1])}
    </div>
  </div>`;
    }
    const pt = group[0];
    const side = i % 2 === 0 ? 'above' : 'below';
    return `<div class="timeline-point timeline-point--${pt.type} timeline-point--${side}">
    ${leftLine}
    ${rightLine}
    <span class="timeline-dot"></span>
    <div class="timeline-point-content">
      ${entryHtml(pt)}
    </div>
  </div>`;
  }).join('\n');
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
      <a href="/gallery/">Photo Gallery</a>
      <a href="/events/">Apple Events</a>
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
      <a href="/events/">Apple Events</a>
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
    ? `<p class="card-meta card-meta--lifespan">Lived ${lifespanText(launch, product.discontinued_date)}</p>`
    : '';
  return `<article class="card${status === 'discontinued' ? ' card--discontinued' : ''}" data-category="${escapeHtml(product.category)}" data-status="${status}" data-days="${days}" data-launch="${launchTs}" data-discontinued="${discTs}" data-lifespan="${lifespanDays}" data-decade="${decade}">
  <a class="card-link" href="/products/${product.slug}/">
        <div class="card-name-row">${categoryIcon(product.category, 36)}<p class="card-name">${escapeHtml(product.name)}</p></div>
    ${productBadge(product, statusInfo)}
    ${meta}
  </a>
  ${categoryPill(product.category)}
</article>`;
}

function filterBar(key, values, labels, counts, totalCount, showAll = true, allLabel = 'All') {
  return `<div class="filter-bar" data-filter-key="${key}">
  ${showAll ? `<button class="filter-btn active" data-filter-value="all">${allLabel}${totalCount != null ? ` <span class="filter-btn-count">(${totalCount})</span>` : ''}</button>` : ''}
  ${values.map((v, i) => `<button class="filter-btn" data-filter-value="${escapeHtml(v)}">${escapeHtml(labels ? labels[i] : v)}${counts ? ` <span class="filter-btn-count">(${counts[i]})</span>` : ''}</button>`).join('\n')}
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

const STATUS_VALUES = ['current', 'discontinued'];
const STATUS_LABELS = ['Current', 'Discontinued'];

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

function galleryPhotoImages(photo) {
  if (photo.image_urls && photo.image_urls.length) return photo.image_urls;
  return photo.image_url ? [photo.image_url] : [];
}

function galleryTagLink(value, extraClass) {
  return `<a class="pill${extraClass ? ` ${extraClass}` : ''}" href="/gallery/?search=${encodeURIComponent(value)}">${escapeHtml(value)}</a>`;
}

function galleryTagsHtml(photo, singleRow) {
  const sortedTags = (photo.tags || []).slice().sort((a, b) => a.localeCompare(b));
  const placePills = [
    photo.location ? galleryTagLink(photo.location, 'pill--location') : '',
    photo.country ? galleryTagLink(photo.country, 'pill--location') : '',
  ].filter(Boolean).join('');
  const tagPills = sortedTags.map((t) => galleryTagLink(t)).join('');
  if (singleRow) {
    const all = placePills + tagPills;
    return all ? `<div class="gallery-tags"><div class="gallery-tags-row">${all}</div></div>` : '';
  }
  const rows = [
    placePills ? `<div class="gallery-tags-row">${placePills}</div>` : '',
    tagPills ? `<div class="gallery-tags-row">${tagPills}</div>` : '',
  ].filter(Boolean).join('\n');
  return rows ? `<div class="gallery-tags">${rows}</div>` : '';
}

function galleryPhotoCardHtml(photo) {
  const displayName = photo.caption || (photo.tags && photo.tags[0]) || 'Untitled photo';
  const searchText = [photo.caption, photo.location, photo.country, ...(photo.tags || [])].filter(Boolean).join(' ');
  const images = galleryPhotoImages(photo);
  return `<article class="card" data-date="${dateToTimestamp(photo.date_taken)}" data-search="${escapeHtml(searchText.toLowerCase())}">
  <a class="card-link" href="/gallery/${photo.id}/">
    <div class="card-image">
      ${images[0] ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(displayName)}">` : ''}
      ${images.length > 1 ? `<span class="card-photo-count">${images.length} photos</span>` : ''}
    </div>
    <p class="card-name">${escapeHtml(displayName)}</p>
    ${photo.date_taken ? `<p class="card-meta">${formatDate(photo.date_taken)}</p>` : ''}
  </a>
  ${galleryTagsHtml(photo)}
</article>`;
}

function galleryPhotoPage({ photo, prevPhoto, nextPhoto, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const displayName = photo.caption || (photo.tags && photo.tags[0]) || 'Untitled photo';
  const images = galleryPhotoImages(photo);
  const imagesHtml = images.map((url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(displayName)}">`).join('\n');
  const pageUrl = `${siteUrl}/gallery/${photo.id}/`;
  const mailtoHref = `mailto:infoswiper@yahoo.com?subject=${encodeURIComponent(`Can I use this photo? — ${displayName}`)}&body=${encodeURIComponent(`Hi, I'd like to ask about using this photo:\n${pageUrl}`)}`;
  const body = `
<article class="gallery-photo-page">
  <div class="gallery-photo-header">
    <div class="page-header-row">
      <h1>${escapeHtml(displayName)}</h1>
      <a href="/admin/" class="admin-edit-link" style="display:none;">Admin</a>
    </div>
    ${photo.date_taken ? `<p class="gallery-photo-date">${formatDate(photo.date_taken)}</p>` : ''}
    ${galleryTagsHtml(photo, true)}
  </div>
  <div class="gallery-photo-images">${imagesHtml}</div>
  <div class="gallery-photo-copyright">
    <p>These photos are my own property.</p>
    <a class="intro-cta" href="${mailtoHref}">Request to use photo</a>
  </div>
  <div class="gallery-photo-nav">
    ${prevPhoto ? `<a href="/gallery/${prevPhoto.id}/" class="gallery-nav-link">&larr; Previous</a>` : '<span></span>'}
    <a href="/gallery/" class="gallery-nav-link">Full Gallery</a>
    ${nextPhoto ? `<a href="/gallery/${nextPhoto.id}/" class="gallery-nav-link">Next &rarr;</a>` : '<span></span>'}
  </div>
</article>`;
  return shell({
    title: `${escapeHtml(displayName)} — Apple Refresher Gallery`,
    description: `A photo from the Apple Refresher gallery${photo.location ? `, taken in ${photo.location}` : ''}.`,
    siteUrl,
    path: `/gallery/${photo.id}/`,
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function galleryPage({ photos, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const body = photos.length
    ? `
<div class="page-header-row">
  <h1>Gallery</h1>
  <a href="/admin/" class="admin-edit-link" style="display:none;">Admin</a>
</div>
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
<div class="page-header-row">
  <h1>Gallery</h1>
  <a href="/admin/" class="admin-edit-link" style="display:none;">Admin</a>
</div>
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
  return `<p class="page-intro">No ${what} yet. Add one in <a href="/admin/">/admin/</a> to see it here.</p>`;
}

function featuredCardHtml(product, statusInfo, productsBySlug) {
  const daysInfo = statusInfo ? badgeDaysInfo(product, statusInfo) : null;
  const countHtml = daysInfo
    ? `<div class="card-featured-count card-featured-count--${statusInfo.status}"><span class="card-featured-count-number">${daysInfo.days}</span><span class="card-featured-count-suffix">days ${daysInfo.suffix}</span></div>`
    : productBadge(product, statusInfo);
  const launch = launchDate(product);
  const predecessor = product.previous_model && productsBySlug ? productsBySlug[product.previous_model] : null;
  const nextExpected = statusInfo && !product.discontinued
    ? new Date(new Date(statusInfo.lastRefresh).getTime() + statusInfo.avgCycleDays * 86400000).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })
    : null;
  const detailRows = [
    product.price ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Launch price</span> ${escapeHtml(formatPrice(product.price))}</div>` : '',
    launch ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Launch date</span> ${formatDate(launch)}</div>` : '',
    product.discontinued && product.discontinued_date
      ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Discontinued</span> ${formatDate(product.discontinued_date)}</div>`
      : nextExpected
      ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Next refresh expected</span> ${nextExpected}</div>`
      : '',
    predecessor ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Previous model</span> ${escapeHtml(predecessor.name)}</div>` : '',
  ].filter(Boolean).join('\n');
  return `<article class="card card--featured" data-category="${escapeHtml(product.category)}">
  <a class="card-link" href="/products/${product.slug}/">
    <span class="card-featured-label">Featured</span>
    <div class="card-name-row">${categoryIcon(product.category, 42)}<p class="card-name">${escapeHtml(product.name)}</p></div>
    ${countHtml}
    ${detailRows ? `<div class="card-featured-details">${detailRows}</div>` : ''}
  </a>
  ${categoryPill(product.category)}
</article>`;
}

function galleryStripItemHtml(photo) {
  const displayName = photo.caption || (photo.tags && photo.tags[0]) || 'Untitled photo';
  const images = galleryPhotoImages(photo);
  return `<a class="gallery-strip-item" href="/gallery/${photo.id}/">${images[0] ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(displayName)}">` : ''}</a>`;
}

function eventCardHtml(event) {
  const dateText = [formatDate(event.event_date), event.event_time].filter(Boolean).join(' \u00b7 ');
  const inner = `${event.image_url ? `<img class="card-event-image" src="${escapeHtml(event.image_url)}" alt="${escapeHtml(event.heading)}">` : ''}
  <p class="card-event-title">${escapeHtml(event.heading)}</p>
  ${dateText ? `<p class="card-event-date">${escapeHtml(dateText)}</p>` : ''}
  <span class="card-featured-label card-featured-label--bottom">Apple Event</span>`;
  return event.event_url
    ? `<a class="card card--featured card--event" href="${escapeHtml(event.event_url)}" target="_blank" rel="noopener">${inner}</a>`
    : `<article class="card card--featured card--event">${inner}</article>`;
}

function eventArchiveCardHtml(event) {
  const dateText = [formatDate(event.event_date), event.event_time].filter(Boolean).join(' \u00b7 ');
  const tags = (event.announced_products || []).map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join('');
  const inner = `<div class="card-image">${event.image_url ? `<img src="${escapeHtml(event.image_url)}" alt="${escapeHtml(event.heading)}">` : ''}</div>
    <p class="card-name">${escapeHtml(event.heading)}</p>
    ${dateText ? `<p class="card-meta">${escapeHtml(dateText)}</p>` : ''}`;
  const link = event.event_url
    ? `<a class="card-link" href="${escapeHtml(event.event_url)}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="card-link">${inner}</div>`;
  return `<article class="card">
  ${link}
  ${tags ? `<div class="gallery-tags"><div class="gallery-tags-row">${tags}</div></div>` : ''}
</article>`;
}

function eventsPage({ events, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const body = `
<div class="page-header-row">
  <h1>Apple Events</h1>
  <a href="/admin/" class="admin-edit-link" style="display:none;">Admin</a>
</div>
<p class="page-intro">A running record of every Apple Event announced here, and what was revealed at each one.</p>
<p id="no-events" class="page-intro" style="display:${events.length ? 'none' : ''};">No events yet. Add one in <a href="/admin/">/admin/</a>.</p>
<div class="card-grid" id="grid" data-mode="events">
  ${events.map(eventArchiveCardHtml).join('\n')}
</div>`;
  return shell({
    title: 'Apple Events — Apple Refresher',
    description: 'A running archive of every Apple Event announced, and what was revealed at each one.',
    siteUrl,
    path: '/events/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function homePage({ heroFeatured, heroRest, overdueItems, categoryLinks, totalCount, galleryPicks, productsBySlug, activeEvent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const featuredSlotHtml = activeEvent
    ? eventCardHtml(activeEvent)
    : heroFeatured
    ? featuredCardHtml(heroFeatured.product, heroFeatured.status, productsBySlug)
    : '';
  const heroCardsHtml = heroFeatured || activeEvent
    ? `${featuredSlotHtml}${heroRest.map((r) => cardHtml(r.product, r.status)).join('\n')}`
    : emptyState('products');

  const categoryLinksHtml = categoryLinks && categoryLinks.length
    ? `<div class="filter-bar homepage-category-links">
  <a class="filter-btn active" href="/products/">All <span class="filter-btn-count">(${totalCount})</span></a>
  ${categoryLinks.map((c) => `<a class="filter-btn" href="/categories/${slugify(c.category)}/">${escapeHtml(c.category)} <span class="filter-btn-count">(${c.count})</span></a>`).join('\n')}
</div>`
    : '';

  const overdueSection = overdueItems && overdueItems.length
    ? `<section class="homepage-section">
  <h2>Waiting longest for a refresh</h2>
  <div class="card-grid" id="overdue-grid">
    ${overdueItems.map((i) => cardHtml(i.product, i.status)).join('\n')}
  </div>
</section>`
    : '';

  const gallerySection = galleryPicks && galleryPicks.length
    ? `<section class="homepage-section homepage-section--divided">
  <h2>From the gallery</h2>
  <div class="gallery-strip" id="gallery-strip">
    ${galleryPicks.map(galleryStripItemHtml).join('\n')}
  </div>
  <p class="see-all"><a href="/gallery/" class="intro-cta">Full gallery &rarr;</a></p>
</section>`
    : '';

  const body = `
<section class="intro-hero">
  <div class="intro-hero-layout">
    <div class="intro-hero-text">
      <h1 class="intro-heading">Apple product refresh tracker</h1>
      <p class="intro-subtitle">Every current Apple product, and exactly how long it's been since its last refresh, so you're never guessing.</p>
      <a class="intro-cta" href="/products/">Browse all products</a>
    </div>
    <div class="intro-hero-cards" id="hero-cards">
      ${heroCardsHtml}
    </div>
  </div>
</section>
<hr class="hero-divider">
${categoryLinksHtml}
${overdueSection}
${gallerySection}`;
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
  const categories = [...new Set(items.map((i) => i.product.category))].sort((a, b) => a.localeCompare(b));
  const categoryCounts = categories.map((c) => items.filter((i) => i.product.category === c).length);
  const statusCounts = STATUS_VALUES.map((v) => items.filter((i) => {
    const s = i.product.discontinued ? 'discontinued' : 'current';
    return s === v;
  }).length);
  const body = items.length
    ? `
<h1>All products</h1>
<p class="page-intro">Everything on the site, current and discontinued, in one searchable place.</p>
<div class="controls-row">
  <input type="search" id="search-input" class="search-input" placeholder="Search products…" aria-label="Search products">
  ${sortSelect(PRODUCT_SORT_OPTIONS)}
</div>
<div class="filters-with-everything">
  <button type="button" id="everything-btn" class="everything-btn">Everything</button>
  <div class="filter-bars-stack">
    ${filterBar('status', STATUS_VALUES, STATUS_LABELS, statusCounts, items.length)}
    ${filterBar('category', categories, null, categoryCounts, items.length, true, 'All Products')}
  </div>
</div>
<p id="no-results" class="page-intro" style="display:none;">No products match your search.</p>
<div class="card-grid" id="grid" data-mode="all">
  ${items.map((i) => cardHtml(i.product, i.status)).join('\n')}
</div>
<div id="pagination" class="pagination"></div>`
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
  const decadeCounts = decades.map((d) => items.filter((p) => p.discontinued_date && `${Math.floor(new Date(p.discontinued_date).getFullYear() / 10) * 10}s` === d).length);
  const body = items.length
    ? `
<h1>Discontinued products</h1>
<p class="page-intro">The products Apple no longer sells, when they launched, when they went, and what took their place.</p>
<div class="controls-row">
  <input type="search" id="search-input" class="search-input" placeholder="Search discontinued products…" aria-label="Search discontinued products">
  ${sortSelect(DISCONTINUED_SORT_OPTIONS)}
</div>
${filterBar('decade', decades, null, decadeCounts, items.length)}
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

function leagueRowHtml(product, statusInfo, rank) {
  const status = productStatusKey(product);
  const launch = launchDate(product);
  const days = statusInfo && status === 'current' ? statusInfo.daysSince : '';
  const launchTs = launch ? new Date(launch).getTime() : '';
  const discTs = product.discontinued && product.discontinued_date ? new Date(product.discontinued_date).getTime() : '';
  const lifespanDays = launch && product.discontinued && product.discontinued_date ? daysBetween(launch, product.discontinued_date) : '';
  const decade = product.discontinued && product.discontinued_date ? `${Math.floor(new Date(product.discontinued_date).getFullYear() / 10) * 10}s` : '';
  return `<tr class="league-row${status === 'discontinued' ? ' league-row--discontinued' : ''}" data-href="/products/${product.slug}/" data-category="${escapeHtml(product.category)}" data-status="${status}" data-days="${days}" data-launch="${launchTs}" data-discontinued="${discTs}" data-lifespan="${lifespanDays}" data-decade="${decade}">
  <td class="league-rank">${rank}</td>
  <td class="league-name"><a href="/products/${product.slug}/" class="league-name-link">${categoryIcon(product.category, 24)}<span>${escapeHtml(product.name)}</span></a></td>
  <td class="league-status">${productBadge(product, statusInfo)}</td>
  <td class="league-launch">${launch ? formatDate(launch) : '\u2014'}</td>
  <td class="league-price">${product.price ? escapeHtml(formatPrice(product.price)) : '\u2014'}</td>
</tr>`;
}

function leagueTableHtml(items, category) {
  return `<table class="league-table" id="grid" data-mode="category" data-category-name="${escapeHtml(category)}">
  <thead>
    <tr>
      <th class="league-rank">#</th>
      <th class="league-name">Product</th>
      <th class="league-status">Status</th>
      <th class="league-launch">Launched</th>
      <th class="league-price">Price</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((i, idx) => leagueRowHtml(i.product, i.status, idx + 1)).join('\n')}
  </tbody>
</table>`;
}

function categoryPage({ category, items, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const slug = slugify(category);
  const currentCount = items.filter((i) => !i.product.discontinued).length;
  const discontinuedCount = items.length - currentCount;
  const statusCounts = STATUS_VALUES.map((v) => items.filter((i) => {
    const s = i.product.discontinued ? 'discontinued' : 'current';
    return s === v;
  }).length);
  const body = `
<h1>${escapeHtml(category)}</h1>
<p class="page-intro">${currentCount} current product${currentCount === 1 ? '' : 's'}${discontinuedCount ? `, ${discontinuedCount} discontinued` : ''}. Newest first.</p>
<div class="controls-row">
  <input type="search" id="search-input" class="search-input" placeholder="Search ${escapeHtml(category)}…" aria-label="Search">
  ${sortSelect(PRODUCT_SORT_OPTIONS)}
</div>
${filterBar('status', STATUS_VALUES, STATUS_LABELS, statusCounts, items.length)}
<p id="no-results" class="page-intro" style="display:none;">No products match your search.</p>
${leagueTableHtml(items, category)}`;
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
    specRow('Status', product.discontinued ? 'Discontinued' : 'Current'),
    launch ? specRow('Launched', formatDate(launch)) : '',
    latest && sortedDates.length > 1 && !product.discontinued ? specRow('Last refreshed', formatDate(latest)) : '',
    sortedDates.length > 1 ? specRow('Times refreshed', String(sortedDates.length - 1)) : '',
    status && !product.discontinued ? specRow('Typical refresh cycle', `About every ${status.avgCycleDays} days`) : '',
    status && sortedDates.length > 1 && !product.discontinued
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
    product.apple_url_unavailable
      ? specRow('Official Apple page', 'No longer available on Apple\u2019s website')
      : product.apple_url
      ? specRow('Official Apple page', `<a href="${product.apple_url}" target="_blank" rel="noopener">apple.com &#8599;</a>`)
      : '',
    product.external_link ? specRow('More information', `<a href="${product.external_link}" target="_blank" rel="noopener">${escapeHtml(externalLinkLabel(product))} &#8599;</a>`) : '',
    product.discontinued ? '' : specRow('Waiting for a refresh', `<span class="wait-count-value">${product.waiting_count || 0}</span> people`),
  ].filter(Boolean).join('\n');

  const releaseHistorySection = timelinePoints.length
    ? `<h2>Release history</h2>
  ${timelineHtml}`
    : '';

  const body = `
<article class="product-page">
  <div class="product-top${product.video_url ? '' : ' product-top--no-media'}">
    ${product.video_url ? `<div class="product-media">
      ${videoBlock}
    </div>` : ''}
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

  ${product.rumor_note ? `<div class="callout"><p class="callout-label">Notes</p><div class="callout-body">${sanitizeRichText(product.rumor_note, siteUrl)}</div></div>` : ''}
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
  return `<div class="admin-subfield" id="${prefix}_field">
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
      <button type="button" class="admin-tab-btn" data-tab="event">Apple Event</button>
      <button type="button" class="admin-tab-btn" data-tab="about">About page</button>
    </div>
    <button id="logout-btn" class="admin-btn">Log out</button>
  </div>

  <div id="tab-products" class="admin-tab-panel">
    <div id="product-list-view">
      <button id="new-product-btn" class="admin-btn admin-btn--primary">Add new product</button>
      <input type="search" id="product-search-input" class="admin-search-input" placeholder="Search products by name…" aria-label="Search products">
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
        <div class="admin-subfield">
          <span class="admin-subfield-label">Starting price</span>
          <div class="price-currency-row">
            <label class="checkbox-label"><input type="radio" name="price_currency" value="£"> £</label>
            <label class="checkbox-label"><input type="radio" name="price_currency" value="$" checked> $</label>
            <input type="text" id="price" placeholder="799">
          </div>
        </div>

        <h3 class="admin-form-section">Release &amp; refresh dates</h3>
        <p class="admin-hint">This is the one place every product needs a date. Adding a brand new product or generation (like a 2nd-gen model)? Just add its release date here, that single date is both its "release" and its first entry, there's nothing else to fill in for it. If this exact model gets refreshed again later, add that date here too. This is also what the day-count badge is calculated from.</p>
        <div class="admin-subfield">
          <span class="admin-subfield-label">Dates</span>
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
          <p class="admin-hint">Pick a date and it's added automatically. Each one is a time this specific model was refreshed.</p>
        </div>

        <div class="admin-subfield">
          <span class="admin-subfield-label">Badge shows</span>
          <label class="checkbox-label"><input type="radio" name="days_basis" id="days_basis_refresh" value="refresh" checked> Days since refresh</label>
          <label class="checkbox-label"><input type="radio" name="days_basis" id="days_basis_launch" value="launch"> Days since launch</label>
        </div>

        <label class="checkbox-label"><input type="checkbox" id="is_new_launch"> This is a brand new product, not a refresh of an existing line</label>

        <h3 class="admin-form-section">Product line</h3>
        <p class="admin-hint">Optional: only needed if this product is part of a series with others already on the site (e.g. every iPhone model). Skip this whole section for a one-off product.</p>
        <div class="admin-subfield">
          <span class="admin-subfield-label">Timeline group</span>
          <label class="checkbox-label"><input type="radio" name="timeline_mode" id="timeline_mode_new" value="new" checked> New timeline</label>
          <label class="checkbox-label"><input type="radio" name="timeline_mode" id="timeline_mode_existing" value="existing"> Join an existing product line</label>
          <input type="text" id="timeline_name_new" placeholder="e.g. iPhone">
          <select id="timeline_name_existing" style="display:none;"></select>
        </div>
        <p class="admin-hint">Every product in a line needs this set to the same value, joining it here alone doesn't link anything else in. To connect a new model to a line that already exists, pick "Join an existing product line" and choose it from the list, that guarantees an exact match rather than retyping the name.</p>
        <label>Previous model (pick a product, or leave blank)
          <input type="text" id="previous_model" list="product-options-by-category" placeholder="Start typing a product name">
        </label>
        <p class="admin-hint">If this product replaces one already on the site, picking it here automatically marks that one Discontinued and fills in its "Replaced by" for you.</p>
        ${datePrecisionFieldHtml('original_launch_date', 'Original launch date (of the product line, e.g. the first iPhone)', 'This does not replace Refresh history above, the day-count badge is calculated from Refresh history only, so add this product\u2019s own date(s) there regardless. Only fill this in if this is the ONE product that\u2019s the true origin of a whole line, leave it blank on every other product joining that line. If another product in the same line already has this set, saving will ask before changing anything.')}

        <h3 class="admin-form-section">Video</h3>
        <div class="admin-subfield">
          <span class="admin-subfield-label">Video</span>
          <div id="video-status" class="admin-video-status">No video uploaded.</div>
          <label for="video-upload" class="admin-btn admin-btn--small admin-btn--primary">Add video</label>
          <input type="file" id="video-upload" accept="video/*" class="admin-file-input">
        </div>

        <h3 class="admin-form-section">More information</h3>
        <label>Official Apple product page<input type="url" id="apple_url" placeholder="https://www.apple.com/uk/iphone-17-pro/"></label>
        <label class="checkbox-label"><input type="checkbox" id="apple_url_unavailable"> No longer available on Apple's website</label>
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
        <p class="admin-hint">Only one product can be featured at a time, choosing this one will automatically un-feature whichever product currently holds it.</p>

        <h3 class="admin-form-section">Discontinued</h3>
        <label class="checkbox-label"><input type="checkbox" id="discontinued"> Discontinued</label>
        ${datePrecisionFieldHtml('discontinued_date', 'Discontinued date')}
        <label>Replaced by (pick a product, or leave blank)
          <input type="text" id="replaced_by" list="product-options-by-category" placeholder="Start typing a product name">
          <datalist id="product-options-by-category"></datalist>
        </label>
        <label>Why it went (only if there's more to it than "Replaced by" already says, e.g. a design flaw, price problem, or how it was received, leave blank otherwise)<textarea id="discontinued_reason" rows="2"></textarea></label>

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
          <span class="admin-subfield-label">Photos (up to 6, e.g. several angles taken at once)</span>
          <div id="gallery-image-thumbs" class="admin-thumbs"></div>
          <label for="gallery-image-upload" class="admin-btn admin-btn--small admin-btn--primary">Add photos</label>
          <input type="file" id="gallery-image-upload" accept="image/*" multiple class="admin-file-input">
        </div>

        <label>Caption (optional)<input type="text" id="gallery-caption" placeholder="e.g. iPhone 17 Pro in Cosmic Orange"></label>

        ${datePrecisionFieldHtml('gallery_date_taken', 'Date taken')}

        <label>Location<input type="text" id="gallery-location" placeholder="e.g. Cardiff"></label>

        <label>Country<input type="text" id="gallery-country" placeholder="e.g. United Kingdom"></label>

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

  <div id="tab-event" class="admin-tab-panel" style="display:none;">
    <p class="admin-hint">Whichever event has the soonest upcoming date automatically replaces the regular featured product on the homepage until that date passes, then it becomes part of this permanent archive and the site goes back to showing a featured product on its own, no need to remove anything manually.</p>
    <div id="event-list-view">
      <button id="new-event-btn" class="admin-btn admin-btn--primary">Add new event</button>
      <div id="event-list" class="admin-list"></div>
    </div>

    <div id="event-form-view" style="display:none;">
      <button type="button" id="event-back-to-list-btn" class="admin-back-link">&larr; Back to events</button>
      <h3 id="event-form-title">Add event</h3>
      <form id="event-form" class="admin-form">
        <label>Title<input type="text" id="event_heading" placeholder="e.g. Apple Event: It's Glowtime"></label>
        <div class="admin-subfield">
          <span class="admin-subfield-label">Image</span>
          <div id="event-image-thumb" class="admin-thumbs"></div>
          <label for="event-image-upload" class="admin-btn admin-btn--small admin-btn--primary">Choose image</label>
          <input type="file" id="event-image-upload" accept="image/*" class="admin-file-input">
        </div>
        <input type="hidden" id="event_image_url">
        <label>Event date<input type="date" id="event_date"></label>
        <label>Event time (optional, your own wording, e.g. "10am PT")<input type="text" id="event_time" placeholder="10am PT"></label>
        <label>Link to Apple's event page (optional)<input type="url" id="event_url" placeholder="https://www.apple.com/apple-events/"></label>
        <div class="admin-subfield">
          <span class="admin-subfield-label">Announced products (optional, add once you know what was revealed)</span>
          <ul id="event-products-list" class="refresh-history-list"></ul>
          <div class="refresh-history-add">
            <input type="text" id="new-event-product" placeholder="e.g. iPhone 17, Apple Watch Series 11">
            <button type="button" id="add-event-product-btn" class="admin-btn admin-btn--small">Add</button>
          </div>
        </div>
        <button type="submit" class="admin-btn admin-btn--primary">Save event</button>
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
  launchDate,
  galleryPage,
  galleryPhotoPage,
  galleryPhotoCardHtml,
  eventsPage,
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
