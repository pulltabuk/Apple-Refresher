// The line icons for each product family. Shared with the X post cards
// (public/facts-kit.js), which draw the same icon.
const CATEGORY_ICONS = require('../public/facts-kit.js').CATEGORY_ICONS;

let CUSTOM_CATEGORY_ICONS = {};

// A file in public/ with a short content hash in its URL, so browsers
// and the phone app's service worker can never keep serving an old copy
// after a change.
const assetHashes = {};
const FactsKit = require('../public/facts-kit.js');

function assetUrl(file) {
  if (!assetHashes[file]) {
    try {
      const nodeFs = require('fs');
      const nodePath = require('path');
      const body = nodeFs.readFileSync(nodePath.join(__dirname, '..', 'public', file));
      assetHashes[file] = require('crypto').createHash('md5').update(body).digest('hex').slice(0, 10);
    } catch (err) {
      assetHashes[file] = 'dev';
    }
  }
  return `/${file}?v=${assetHashes[file]}`;
}

// Apple's own spelling for product and category names, whatever was
// typed: "Airpods Pro" -> "AirPods Pro", "Mac Mini" -> "Mac mini". Only
// the casing changes, so slugs and links stay the same. Must match
// appleNameJS() in public/app.js.
const appleName = require('../public/facts-kit.js').appleName;

function setCustomCategoryIcons(icons) {
  CUSTOM_CATEGORY_ICONS = icons || {};
}

function categoryIcon(category, size) {
  const s = size || 40;
  const customKey = Object.keys(CUSTOM_CATEGORY_ICONS).find((k) => k.toLowerCase() === String(category || '').toLowerCase());
  if (customKey) {
    return cdnImgHtml(CUSTOM_CATEGORY_ICONS[customKey], iconPixels(s), ` class="placeholder-icon" alt="" width="${s}" height="${s}" style="object-fit:contain;"`);
  }
  const key = Object.keys(CATEGORY_ICONS).find((k) => k.toLowerCase() === String(category || '').toLowerCase());
  const shape = (key && CATEGORY_ICONS[key]) || CATEGORY_ICONS.Other;
  return `<svg class="placeholder-icon" viewBox="0 0 40 40" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
}

// A product line can have its own icon (e.g. AirPods Max inside the
// AirPods family). Blank falls back to the family (category) icon.
function productIcon(product, size) {
  if (product && product.icon_url) {
    const s = size || 40;
    return cdnImgHtml(String(product.icon_url).replace(/"/g, '%22'), iconPixels(s), ` class="placeholder-icon placeholder-icon--product" alt="" width="${s}" height="${s}" style="object-fit:contain;"`);
  }
  return categoryIcon(product && product.category, size);
}

// A product name or address reduced to its words, so Apple's wording and
// the site's match: "AirPods (2nd generation)", "airpods-2nd-generation"
// and "AirPods 2" all give "airpods 2", and a first generation drops its
// number ("AirPods (1st generation)" gives "airpods", like "AirPods").
// Keep in step with productKeyJS() in app.js.
function productKey(text) {
  return String(text || '').toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\b(\d+)(?:st|nd|rd|th)[\s-]+gen(?:eration)?\b/g, ' $1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ 1$/, '');
}

// Every product, for repairing links in written text (set by build.js).
let linkProducts = [];
const missingProductLinks = new Set();
function setLinkProducts(products) {
  linkProducts = products || [];
}

// A link in written text (notes, "Did you know?", page copy) to a product
// page that doesn't exist, such as /products/airpods-1st-generation/
// typed from Apple's name for a product the site calls AirPods: sent to
// the right page when its address or its words name exactly one product.
// Anything else is left alone and listed at the end of the build. Keep in
// step with fixProductLinksJS() in app.js.
function fixProductLinks(html, siteHost) {
  if (!linkProducts.length) return html;
  const known = new Set(linkProducts.map((p) => p.slug));
  const byKey = {};
  linkProducts.forEach((p) => {
    [productKey(p.name), productKey(p.slug)].forEach((k) => {
      if (!k) return;
      byKey[k] = byKey[k] || new Set();
      byKey[k].add(p.slug);
    });
  });
  const only = (k) => (byKey[k] && byKey[k].size === 1 ? Array.from(byKey[k])[0] : null);
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs, inner) => {
    const m = attrs.match(/href\s*=\s*(["'])([^"']*)\1/i);
    if (!m) return whole;
    let url;
    try { url = new URL(m[2]); } catch (e) { return whole; }
    if (!siteHost || url.host.replace(/^www\./, '') !== siteHost.replace(/^www\./, '')) return whole;
    const slug = (url.pathname.match(/^\/products\/([^/]+)\/?$/) || [])[1];
    if (!slug || known.has(slug)) return whole;
    const target = only(productKey(slug)) || only(productKey(inner));
    if (!target) {
      missingProductLinks.add(url.pathname);
      return whole;
    }
    url.pathname = '/products/' + target + '/';
    return '<a' + attrs.replace(m[0], 'href="' + url.href + '"') + '>' + inner + '</a>';
  });
}

function sanitizeRichText(html, siteUrl) {
  if (!html) return '';
  const allowed = new Set(['p', 'b', 'strong', 'i', 'em', 'u', 'br', 'a']);
  let siteHost = '';
  try { siteHost = siteUrl ? new URL(siteUrl).host : ''; } catch (e) { siteHost = ''; }
  let out = fixProductLinks(String(html), siteHost);
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

// Quotes too: the result often goes inside an attribute (alt, title,
// content, href), where a name like MacBook Pro 14" would otherwise end
// it early. Must match escapeHtmlJS() in public/app.js.
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function galleryPhotoSlug(photo) {
  // SEO-friendly gallery URL built from the caption, so the address says
  // what the photo actually shows. Falls back to the UUID if there is
  // nothing to build from, and appends month and year unless the caption
  // already carries a year.
  const base = photo.caption || (photo.tags && photo.tags[0]) || '';
  let slug = slugify(String(base).replace(/['\u2019]/g, ''));
  if (slug.length > 70) {
    slug = slug.slice(0, 70).replace(/-[^-]*$/, '');
  }
  if (photo.date_taken && !/\d{4}/.test(slug)) {
    const d = new Date(photo.date_taken);
    if (!isNaN(d)) {
      const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      slug = [slug, months[d.getUTCMonth()] + '-' + d.getUTCFullYear()].filter(Boolean).join('-');
    }
  }
  return slug || String(photo.id);
}

// SEO-friendly event URL: heading plus month and year, e.g.
// "surprise-and-shine-september-2026" (shared with facts-kit.js).
function eventSlug(event) {
  return FactsKit.eventSlug(event);
}

function readableSlugFallback(value) {
  // A reference whose product no longer exists under that slug. Showing
  // the raw slug looks broken, so present it as words instead.
  return escapeHtml(String(value || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

// The latest thing that has actually happened to a product (a coming
// release doesn't count): the feed's date and the sitemap's lastmod.
function mostRecentActivityDate(product) {
  const today = new Date().toISOString().slice(0, 10);
  const dates = [product.discontinued && product.discontinued_date, ...(product.refresh_history || [])]
    .filter((d) => d && String(d).slice(0, 10) <= today);
  if (!dates.length) return null;
  return dates.sort().reverse()[0];
}

function rssFeedXml({ allItems, siteUrl }) {
  const escapeXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const withDates = allItems
    .map((i) => ({ product: i.product, date: mostRecentActivityDate(i.product) }))
    .filter((i) => i.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 40);
  const items = withDates.map(({ product, date }) => {
    const link = `${siteUrl}/products/${product.slug}/`;
    // Say what happened on that date: discontinued, first released, or a
    // later release.
    const first = (product.refresh_history || []).slice().sort()[0];
    const desc = product.discontinued && product.discontinued_date === date
      ? `${product.name} was discontinued on ${formatDate(date)}.`
      : date === (product.original_launch_date || first)
      ? `${product.name} was released on ${formatDate(date)}.`
      : `A new ${product.name} was released on ${formatDate(date)}.`;
    let pubDate;
    try {
      pubDate = new Date(date).toUTCString();
    } catch (e) {
      pubDate = new Date().toUTCString();
    }
    return `  <item>
    <title>${escapeXml(product.name)}</title>
    <link>${link}</link>
    <guid>${link}#${date}</guid>
    <pubDate>${pubDate}</pubDate>
    <description>${escapeXml(desc)}</description>
  </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Apple Sunset — Recent Refreshes &amp; Discontinuations</title>
  <link>${siteUrl}</link>
  <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Recently refreshed and discontinued Apple products, tracked by Apple Sunset.</description>
  <language>en-gb</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
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

// Dates in the history that are actual releases: leaves out a
// discontinued date and any announcement or pre-order date that has
// ended up in the list, so they never count as extra releases. Must
// stay in step with releaseDatesJS() in public/app.js.
function releaseDates(product) {
  const notReleases = new Set();
  if (product.discontinued && product.discontinued_date) notReleases.add(product.discontinued_date);
  Object.values(generationDetails(product)).forEach((info) => {
    if (info && info.announced) notReleases.add(info.announced);
    if (info && info.preorder) notReleases.add(info.preorder);
  });
  const releases = sortedHistory(product).filter((d) => !notReleases.has(d));
  return releases.length ? releases : sortedHistory(product);
}

function launchDate(product) {
  const h = sortedHistory(product);
  return h.length ? h[0] : null;
}

function latestRefresh(product) {
  const h = sortedHistory(product);
  return h.length ? h[h.length - 1] : null;
}

function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

function generationDetails(product) {
  const d = product && product.generation_details;
  return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
}

// Used for any generation without a name typed in admin. A line with a
// single generation just uses the product name; once there are more,
// each gets its place in the sequence, so the names stay right as new
// generations are added without anything needing to be re-entered.
function autoGenerationName(product, index, total) {
  if (total <= 1) return product.name;
  return `${product.name} (${ordinal(index + 1)} generation)`;
}

function storedGenerationName(product, date) {
  const info = generationDetails(product)[date];
  return info && info.name && String(info.name).trim() ? String(info.name).trim() : null;
}

function productGenerations(product) {
  const details = generationDetails(product);
  const dates = [...new Set(product.refresh_history || [])].sort();
  const today = new Date().toISOString().slice(0, 10);
  return dates.map((date, i) => {
    const info = details[date] || {};
    const next = dates[i + 1] || null;
    // A release marked "still on sale" stays current alongside a newer one
    // (e.g. the 14-inch M5 MacBook Pro next to the M5 Pro and M5 Max).
    const stillOnSale = !product.discontinued && !!info.still_on_sale;
    const end = stillOnSale ? today : next || (product.discontinued ? product.discontinued_date || null : today);
    return {
      date,
      name: storedGenerationName(product, date) || autoGenerationName(product, i, dates.length),
      hasStoredDetails: !!(storedGenerationName(product, date) || info.announced),
      announced: info.announced || null,
      end,
      isCurrent: (!next || stillOnSale) && !product.discontinued,
    };
  });
}

function generationsSectionHtml(product) {
  const gens = productGenerations(product);
  if (!gens.length) return '';
  if (gens.length < 2 && !gens.some((g) => g.hasStoredDetails)) return '';
  const showAnnounced = gens.some((g) => g.announced);
  const rows = gens.slice().reverse().map((g) => {
    const onMarket = g.end ? `${lifespanText(g.date, g.end)}${g.isCurrent ? ' so far' : ''}` : '\u2013';
    return `<tr class="generation-row${g.isCurrent ? ' generation-row--current' : ''}">
    <td class="generation-name">${escapeHtml(g.name)}${g.isCurrent ? ' <span class="generation-current-pill">Current</span>' : ''}</td>
    ${showAnnounced ? `<td data-label="Announced">${g.announced ? formatDate(g.announced) : '\u2013'}</td>` : ''}
    <td data-label="Released">${formatDate(g.date)}</td>
    <td data-label="Time on market">${onMarket}</td>
  </tr>`;
  }).join('\n');
  return `<h2>Generations</h2>
  <div class="generations-table-wrap">
  <table class="generations-table">
    <thead><tr><th>Generation</th>${showAnnounced ? '<th>Announced</th>' : ''}<th>Released</th><th>Time on market</th></tr></thead>
    <tbody>
  ${rows}
    </tbody>
  </table>
  </div>`;
}

// To the nearest month: 21 Sep 2018 to 20 Sep 2019 is 12 months, not 11.
// Keep in step with monthsBetweenJS() in public/app.js.
function monthsBetween(a, b) {
  const days = (new Date(b) - new Date(a)) / 86400000;
  return Math.max(0, Math.round(days / 30.4375));
}

function normaliseGroupKey(value) {
  return (value || '').trim().toLowerCase();
}

// "Apple Watch release history": named after the family (or line) the
// timeline shows. A catch-all "Other" family keeps the plain heading.
function releaseHistoryHeading(name) {
  const n = String(name || '').trim();
  return !n || n.toLowerCase() === 'other' ? 'Release history' : `${escapeHtml(n)} release history`;
}

// The product a family ended with: marked "last of the line" in the
// admin, while nothing else in its family is on sale. Shown as a black
// "End of the line" pill on its timeline entry, product page and family
// list. Must match isEndOfLineJS() in public/app.js.
function isEndOfLine(product, allProducts) {
  if (!product || !product.last_in_line || !product.discontinued) return false;
  const family = (product.category || '').trim().toLowerCase();
  return !(allProducts || []).some((p) => (p.category || '').trim().toLowerCase() === family && !p.discontinued);
}

function categoryTimelinePoints(product, allProducts) {
  const groupKey = normaliseGroupKey(product.timeline_name || product.category);
  const sameCategory = (allProducts || []).filter((p) => normaliseGroupKey(p.timeline_name || p.category) === groupKey);

  // Collect every date a product in the group was refreshed. Keyed by
  // (date, product) so two different products sharing the exact same
  // date (e.g. a base model and its Pro sibling launching together)
  // both keep their own point here — the "merge" step in
  // horizontalTimelineHtml is what visually pairs same-date points,
  // this step must never drop one first just because a date repeats.
  // On a timeline holding one product line only, every point can safely
  // use its generation name (typed or automatic). With several lines
  // together, only typed names are used, so each point stays clearly
  // tied to its own product.
  const singleLine = sameCategory.length === 1;
  const pointName = (p, d) => {
    if (!singleLine) return storedGenerationName(p, d);
    const gen = productGenerations(p).find((g) => g.date === d);
    return gen ? gen.name : storedGenerationName(p, d);
  };
  const seenKeys = new Set();
  const dateEntries = [];
  sameCategory.forEach((p) => (p.refresh_history || []).forEach((d) => {
    const key = d + '|' + p.name;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    dateEntries.push({ date: d, productName: p.name, displayName: pointName(p, d) });
  }));
  const sortedEntries = dateEntries.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Each product with its own original_launch_date is a genuine origin
  // point (e.g. the first iPhone in 2007, and separately iPhone Air
  // debuting a new line within the same timeline) and gets its own
  // Launch label, rather than only the single earliest one winning.
  // A group with no explicit launch dates at all still falls back to
  // its earliest entry, as before.
  const explicitLaunches = sameCategory.filter((p) => p.original_launch_date);
  const points = [];
  const consumedKeys = new Set();

  if (explicitLaunches.length) {
    explicitLaunches.forEach((p) => {
      points.push({ date: p.original_launch_date, label: 'Launch', type: 'launch', productName: p.name, displayName: pointName(p, p.original_launch_date) });
      consumedKeys.add(p.original_launch_date + '|' + p.name);
    });
  }
  // No fallback here on purpose: without a recorded launch date the
  // earliest entry we hold may not be the start of the line at all,
  // so it is shown as an ordinary release rather than a launch.

  sortedEntries.forEach((e) => {
    if (consumedKeys.has(e.date + '|' + e.productName)) {
      return;
    }
    points.push({ date: e.date, label: 'Refresh', type: 'refresh', productName: e.productName, displayName: e.displayName });
  });

  sameCategory.forEach((p) => {
    if (p.discontinued && p.discontinued_date) {
      points.push({ date: p.discontinued_date, label: 'Discontinued', type: 'discontinued', productName: p.name, endOfLine: isEndOfLine(p, allProducts) });
    }
  });
  // Mark the newest released entry of each product still on sale, so the
  // timeline shows at a glance which model is the current one.
  const todayStr = new Date().toISOString().slice(0, 10);
  sameCategory.forEach((p) => {
    if (p.discontinued) return;
    const mine = points
      .filter((pt) => pt.productName === p.name && pt.type !== 'discontinued' && pt.date <= todayStr)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const newest = mine[mine.length - 1];
    if (newest) newest.isCurrent = true;
    // Older releases marked "still on sale" are current too.
    const details = generationDetails(p);
    mine.forEach((pt) => { if (details[pt.date] && details[pt.date].still_on_sale) pt.isCurrent = true; });
  });

  const typePriority = { discontinued: 0, launch: 1, refresh: 1 };
  points.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : typePriority[a.type] - typePriority[b.type]));
  return points;
}

// A vertical timeline, newest first. It replaces the horizontal rail,
// which ran out of room once a family had more than a handful of dates.
// Same-day entries share one node (four iPhones launching together are
// one row, not four), years act as headings, and the gap between dates
// is labelled, which is the whole point of the site. It is plain HTML
// and CSS: no scripts, no images, nothing to load.
const TIMELINE_ICONS = {
  launch: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 2.5 14 13H2z" fill="currentColor"/></svg>',
  refresh: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="currentColor"/></svg>',
  discontinued: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>',
};

function timelineGapText(earlier, later) {
  const days = daysBetween(earlier, later);
  if (days < 45) return '';
  // A yearly cycle often lands a few days short of the anniversary, so
  // round to the nearest year rather than reporting "11 months later".
  const years = Math.round(days / 365.25);
  if (years >= 1 && Math.abs(days - years * 365.25) <= 45) {
    return `about ${years} year${years === 1 ? '' : 's'} later`;
  }
  const months = monthsBetween(earlier, later);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} later`;
  return `${lifespanText(earlier, later)} later`;
}

function verticalTimelineHtml(product, allProducts) {
  const points = categoryTimelinePoints(product, allProducts);
  if (!points.length) return '';

  const byDate = new Map();
  points.forEach((pt) => {
    if (!byDate.has(pt.date)) byDate.set(pt.date, []);
    byDate.get(pt.date).push(pt);
  });
  const dates = [...byDate.keys()].sort().reverse();

  const today = new Date().toISOString().slice(0, 10);
  const newestRelease = dates.find((d) => byDate.get(d).some((pt) => pt.type !== 'discontinued'));
  const sinceDays = newestRelease ? daysBetween(newestRelease, today) : null;
  const nowNode = !product.discontinued && sinceDays !== null && sinceDays >= 0
    ? `<li class="tl-now">
      <span class="tl-marker tl-marker--now" aria-hidden="true">&#9679;</span>
      <div class="tl-body"><p class="tl-now-text">Today &middot; ${plural(sinceDays, 'day', 'days')} since the last release</p></div>
    </li>`
    : '';

  let lastYear = null;
  const rows = dates.map((date, i) => {
    const entries = byDate.get(date);
    const type = entries.some((e) => e.type !== 'discontinued')
      ? (entries.some((e) => e.type === 'launch') ? 'launch' : 'refresh')
      : 'discontinued';
    const year = String(date).slice(0, 4);
    const yearRow = year !== lastYear ? `<li class="tl-year"><span>${year}</span></li>` : '';
    lastYear = year;

    const nextDate = dates[i + 1];
    const gap = nextDate ? timelineGapText(nextDate, date) : '';
    const gapRow = gap ? `<li class="tl-gap"><span class="tl-gap-text">&#8593; ${gap}</span></li>` : '';

    // A product being replaced on the same day as its successor reads
    // better with the new thing first.
    // Same day: releases before discontinuations, then A to Z (numbers
    // in order, so iPhone 13, iPhone 13 mini, iPhone 13 Pro, iPhone 13 Pro Max).
    // Must match verticalTimelineHtmlJS() in public/app.js.
    const ordered = entries.slice().sort((a, b) => {
      const rank = (e) => (e.type === 'discontinued' ? 1 : 0);
      return rank(a) - rank(b) || String(a.displayName || a.productName).localeCompare(String(b.displayName || b.productName), 'en', { numeric: true, sensitivity: 'base' });
    });
    // Every entry here is a release, so a "Refresh" pill only repeats what
    // the timeline already says. Launch, Discontinued and Current each
    // tell you something the date alone does not, so they stay. Tags are
    // grouped so they wrap together instead of splitting across lines.
    const lines = ordered.map((e) => {
      const tags = [
        // Every entry carries a label, so the column reads consistently.
        // "Released" rather than "Refresh": it says what happened that day.
        `<span class="tl-entry-type tl-entry-type--${e.type}">${e.type === 'refresh' ? 'Released' : e.label}</span>`,
        e.isCurrent ? '<span class="tl-entry-type tl-entry-type--current">Current</span>' : '',
        e.endOfLine ? '<span class="tl-entry-type tl-entry-type--end">End of the line</span>' : '',
      ].filter(Boolean).join('');
      return `<p class="tl-entry">
        <span class="tl-entry-name">${escapeHtml(e.displayName || e.productName)}</span>
        ${tags ? `<span class="tl-entry-tags">${tags}</span>` : ''}
      </p>`;
    }).join('');

    return `${yearRow}
    <li class="tl-item tl-item--${type}">
      <span class="tl-marker tl-marker--${type}">${TIMELINE_ICONS[type] || TIMELINE_ICONS.refresh}</span>
      <div class="tl-body">
        <p class="tl-date">${formatDate(date)}${date > new Date().toISOString().slice(0, 10) ? ' <span class="tl-upcoming">Upcoming</span>' : ''}</p>
        ${lines}
      </div>
    </li>${gapRow}`;
  }).join('\n');

  return `<ol class="tl">
    ${nowNode}
    ${rows}
  </ol>`;
}

function horizontalTimelineHtml(product, allProducts) {
  const points = categoryTimelinePoints(product, allProducts);
  if (!points.length) return '';

  // Merge ALL consecutive same-date points into one shared position,
  // regardless of how many share that date, so e.g. a base model, its
  // Pro sibling, and Pro Max all launching together sit at one spot
  // on the timeline rather than some of them being left stranded as
  // separate dots (a pairs-only merge would only catch the first two).
  const groups = [];
  let gi = 0;
  while (gi < points.length) {
    let gj = gi + 1;
    while (gj < points.length && points[gj].date === points[gi].date) gj++;
    groups.push(points.slice(gi, gj));
    gi = gj;
  }

  const entryHtml = (pt) => `<div class="timeline-point-entry">
      <p class="timeline-point-name">${escapeHtml(pt.displayName || pt.productName)}</p>
      <p class="timeline-point-label">${pt.label}</p>
      <p class="timeline-point-date">${formatDate(pt.date)}</p>
    </div>`;

  // A single row gets cramped fast as a line grows year over year, so
  // once there are more than this many points, wrap onto additional
  // rows instead, each with full breathing room. A short connector
  // between rows shows the line carries on rather than restarting.
  const POINTS_PER_ROW = 4;
  const rows = [];
  for (let i = 0; i < groups.length; i += POINTS_PER_ROW) {
    rows.push(groups.slice(i, i + POINTS_PER_ROW));
  }

  const rowsHtml = rows.map((row, rowIndex) => {
    // Padding scales with the tallest stack of entries in this row
    // (a single point needs far less room than 2-3 products merged
    // into one shared position), so a simple timeline doesn't carry
    // the same large gap a busy one needs.
    let maxStack = 1;
    row.forEach((group) => {
      if (group.length >= 2) {
        const aboveCount = group.filter((e) => e.type !== 'discontinued').length;
        const belowCount = group.filter((e) => e.type === 'discontinued').length;
        maxStack = Math.max(maxStack, aboveCount, belowCount);
      }
    });
    const rowPadding = 100 + (maxStack - 1) * 60;

    const items = row.map((group, i) => {
      const leftLine = i > 0 ? `<span class="timeline-point-line-half timeline-point-line-half--left"></span>` : '';
      const rightLine = i < row.length - 1 ? `<span class="timeline-point-line-half timeline-point-line-half--right"></span>` : '';
      if (group.length >= 2) {
        const aboveEntries = group.filter((e) => e.type !== 'discontinued');
        const belowEntries = group.filter((e) => e.type === 'discontinued');
        return `<div class="timeline-point timeline-point--merged">
    ${leftLine}
    ${rightLine}
    <span class="timeline-dot"></span>
    <div class="timeline-point-content timeline-point-content--above">
      ${aboveEntries.map(entryHtml).join('\n')}
    </div>
    <div class="timeline-point-content timeline-point-content--below">
      ${belowEntries.map(entryHtml).join('\n')}
    </div>
  </div>`;
      }
      const pt = group[0];
      const side = pt.type === 'discontinued' ? 'below' : 'above';
      return `<div class="timeline-point timeline-point--${pt.type} timeline-point--${side}">
    ${leftLine}
    ${rightLine}
    <span class="timeline-dot"></span>
    <div class="timeline-point-content">
      ${entryHtml(pt)}
    </div>
  </div>`;
    }).join('\n');
    const continues = rowIndex < rows.length - 1 ? ' timeline-horizontal--continues' : '';
    return `<div class="timeline-horizontal${continues}" style="padding-top:${rowPadding}px;padding-bottom:${rowPadding}px;">${items}</div>`;
  }).join('\n');

  return rows.length > 1 ? `<div class="timeline-rows">${rowsHtml}</div>` : rowsHtml;
}

function appleSupportStatus(product) {
  if (!product.discontinued || !product.discontinued_date) return null;
  const years = daysBetween(product.discontinued_date, new Date().toISOString().slice(0, 10)) / 365.25;
  if (years >= 7) return 'Obsolete (Apple no longer services it)';
  if (years >= 5) return 'Vintage (limited repairs, subject to parts)';
  return 'Discontinued, not yet Vintage';
}

function lifespanText(start, end) {
  const days = Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000));
  if (days < 31) return `${days} day${days === 1 ? '' : 's'}`;
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

// The heading, the line under it and the intro are all editable in
// admin. Anything left blank falls back to the built-in wording, so a
// page is never left without a heading.
function pageHeading(pageContent, fallback) {
  const custom = pageContent && pageContent.heading && pageContent.heading.trim();
  return escapeHtml(custom || fallback);
}

function pageStandardLine(pageContent, fallbackHtml) {
  if (pageContent && pageContent.subheading && pageContent.subheading.trim()) {
    return `<p class="page-intro">${escapeHtml(pageContent.subheading.trim())}</p>`;
  }
  if (pageContent && pageContent.hide_default_line) return '';
  return fallbackHtml;
}

// Editable page text, written in admin. Passed through the same
// sanitiser as product notes, so only safe formatting survives.
function notFoundPage({ siteUrl, supabaseUrl, supabaseAnonKey }) {
  // An X card link (/c/<key>/<page>) is served by the card function; if
  // that ever misses, send the reader straight on to <page> anyway.
  const body = `
<script>(function(){var a=location.pathname.split('/');if(a[1]==='c'&&/^[0-9a-z]{1,16}$/i.test(a[2]||'')){var p='/'+a.slice(3).join('/');if(!/^[A-Za-z0-9._~/-]*$/.test(p)||p.indexOf('//')===0)p='/';location.replace(p);}})();</script>
<div class="not-found">
  <h1>That page has gone</h1>
  <p class="page-intro">The product may have been renamed or merged into another line. These will get you back on track.</p>
  <p class="not-found-links">
    <a class="intro-cta" href="/products/">All products</a>
    <a class="intro-cta intro-cta--ghost" href="/categories/">Browse by category</a>
    <a class="intro-cta intro-cta--ghost" href="/">Home</a>
  </p>
</div>`;
  return shell({
    title: 'Page not found | Apple Sunset',
    description: 'That page could not be found on Apple Sunset.',
    siteUrl,
    path: '/404.html',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
    noindex: true,
  });
}

function pageIntroHtml(pageContent, siteUrl, position) {
  const raw = pageContent && (position === 'footer' ? pageContent.footer_html : pageContent.intro_html);
  const clean = sanitizeRichText(raw, siteUrl);
  return clean ? `<div class="page-copy page-copy--${position}">${clean}</div>` : '';
}

// A sentence built from the family's own data. It costs nothing to
// maintain because every build works it out again from the dates.
function familyCadence(items) {
  // Real gaps between releases across a whole family. One product often
  // has a single date, which tells us nothing about cadence.
  const dates = Array.from(new Set(items.flatMap((i) => (i.product || i).refresh_history || []))).sort();
  const today = new Date().toISOString().slice(0, 10);
  const past = dates.filter((d) => d <= today);
  if (past.length < 2) return null;
  const toDays = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  return {
    releases: past.length,
    avg: Math.round(toDays(past[0], past[past.length - 1]) / (past.length - 1)),
    sinceLast: toDays(past[past.length - 1], today),
    lastDate: past[past.length - 1],
  };
}

// "roughly every 10 months", "about once a year", "roughly every 3½
// years": a family's average gap in words. Half-year precision reads
// naturally without rounding 3.5 up to a misleading 4.
// Must match roughCadenceJS() in public/app.js.
function roughCadence(d) {
  if (d < 330) { const m = Math.max(1, Math.round(d / 30.4)); return m === 1 ? 'about once a month' : `roughly every ${m} months`; }
  const years = Math.round((d / 365.25) * 2) / 2;
  if (years === 1) return 'about once a year';
  const whole = Math.floor(years);
  return `roughly every ${years % 1 ? whole + '½' : whole} years`;
}

// The product a family ended with: the one marked "last of the line" in
// the admin, while nothing else in the family is on sale. Without the
// mark, a family with nothing on sale is just "none on sale now".
function familyEnding(items) {
  const products = items.map((i) => i.product || i);
  if (!products.length || products.some((p) => !p.discontinued)) return null;
  const byDate = (a, b) => String(a.discontinued_date || '').localeCompare(String(b.discontinued_date || ''));
  const marked = products.filter((p) => p.last_in_line).sort(byDate).pop();
  const last = marked || products.slice().sort(byDate).pop();
  // Unmarked, every product that went on that last day is named.
  const names = marked ? [marked.name] : products
    .filter((p) => (p.discontinued_date || null) === (last.discontinued_date || null))
    .map((p) => p.name).sort((a, b) => a.localeCompare(b));
  return { product: last, names, date: last.discontinued_date || null, ended: !!marked };
}

// "about 20½ years", "about 8 months": a length of time read naturally.
function spanText(days) {
  if (days < 330) { const m = Math.max(1, Math.round(days / 30.4)); return m === 1 ? 'about a month' : `about ${m} months`; }
  const years = Math.round((days / 365.25) * 2) / 2;
  if (years === 1) return 'about a year';
  const whole = Math.floor(years);
  return `about ${years % 1 ? whole + '½' : whole} years`;
}

function categoryStatsSentence(category, items) {
  // Measured across the whole family, since that is where the real
  // history lives: one product usually has a single release date, and a
  // single date has no gap to measure. Earlier this fell back to a
  // built-in default and presented it as fact, which could claim yearly
  // updates on a line that had waited years.
  const dates = Array.from(new Set(
    items.flatMap((i) => i.product.refresh_history || [])
  )).sort();
  const today = new Date().toISOString().slice(0, 10);
  const past = dates.filter((d) => d <= today);
  const toDays = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const avg = past.length >= 2 ? Math.round(toDays(past[0], past[past.length - 1]) / (past.length - 1)) : null;
  const cadence = roughCadence;
  const cat = escapeHtml(category);

  // Nothing in the family on sale: no "next is due" talk. Marked as the
  // last of the line in the admin, it says the line has ended.
  const ending = familyEnding(items);
  if (ending) {
    const name = escapeHtml(ending.product.name);
    const parts = [];
    if (ending.ended) {
      parts.push(ending.date
        ? `Apple ended the ${cat} line on ${formatDate(ending.date)}, when it discontinued the ${name}, the last one.`
        : `Apple has ended the ${cat} line. The ${name} was the last one.`);
    } else if (ending.date) {
      const many = ending.names.length > 1;
      const who = ending.names.length > 2 ? `the ${ending.names[0]} and others` : `the ${ending.names.join(' and the ')}`;
      parts.push(`No ${cat} is on sale now. The last ${many ? 'ones' : 'one'}, ${escapeHtml(who)}, ${many ? 'were' : 'was'} discontinued on ${formatDate(ending.date)}.`);
    } else {
      parts.push(`No ${cat} is on sale now.`);
    }
    if (past.length) {
      const end = ending.date && ending.date >= past[past.length - 1] ? ending.date : past[past.length - 1];
      const ran = ending.ended ? 'The line ran' : 'The family ran';
      const span = past[0] < end ? `${ran} for ${spanText(toDays(past[0], end))}, from ${formatDate(past[0])}` : `${ran} from ${formatDate(past[0])}`;
      parts.push(avg != null
        ? `${span}, and across the ${past.length} release dates recorded here Apple updated it ${cadence(avg)}.`
        : `${span}.`);
    }
    return `<p class="page-stats">${parts.join(' ')}</p>`;
  }

  if (past.length < 2) return '';
  const sinceLast = toDays(past[past.length - 1], today);
  const parts = [`Across the ${past.length} release dates recorded here (several products often launch on the same day), Apple has updated ${cat} ${cadence(avg)}.`];
  // Name the release this counts from, so the number reads as the
  // family's, not one product's.
  const lastDate = past[past.length - 1];
  const lastNames = items.filter((i) => (i.product.refresh_history || []).indexOf(lastDate) !== -1).map((i) => i.product.name).sort((a, b) => a.localeCompare(b));
  const who = lastNames.length > 2 ? `the ${lastNames[0]} and others` : lastNames.length ? `the ${lastNames.join(' and the ')}` : '';
  const latest = `The latest ${cat} release${who ? `, ${escapeHtml(who)},` : ''} was ${plural(sinceLast, 'day', 'days')} ago`;
  if (sinceLast > avg * 1.25) {
    parts.push(`${latest}, well past the usual gap.`);
  } else if (sinceLast > avg) {
    parts.push(`${latest}, a little beyond the usual gap.`);
  } else {
    parts.push(`${latest}, so the next is not due yet.`);
  }
  return `<p class="page-stats">${parts.join(' ')}</p>`;
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

// One row of the homepage's "Waiting longest" top five.
function overdueRowHtml(product, statusInfo) {
  return `<li><a class="overdue-row overdue-row--${statusInfo.status}" href="/products/${product.slug}/">
    <span class="overdue-row-icon">${productIcon(product, 36)}</span>
    <span class="overdue-row-main"><span class="overdue-row-name">${escapeHtml(product.name)}</span></span>
    <span class="overdue-row-days"><strong>${statusInfo.daysSince}</strong> ${statusInfo.daysSince === 1 ? 'day' : 'days'}</span>
  </a></li>`;
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

// The colour compares a product against its own usual cycle, not a
// fixed number of days, so 365 days can be amber for one product and
// red for another. The tooltip says which, rather than leaving people
// to guess.
function badgeExplanation(statusInfo) {
  if (!statusInfo) return '';
  if (!statusInfo.hasCycle) return 'Only one release recorded so far';
  const cycle = `${plural(statusInfo.avgCycleDays, 'day', 'days')}`;
  if (statusInfo.status === 'overdue') return `Overdue: this one is usually updated every ${cycle}`;
  if (statusInfo.status === 'aging') return `Getting on: this one is usually updated every ${cycle}`;
  return `Recently updated: this one is usually updated every ${cycle}`;
}

function badgeHtml(product, statusInfo) {
  if (!statusInfo) return '';
  const info = badgeDaysInfo(product, statusInfo);
  if (info.days < 0) {
    const due = (product.refresh_history || []).slice().sort().pop();
    return `<span class="badge badge--upcoming">Coming ${due ? formatDate(due) : 'soon'}</span>`;
  }
  return `<span class="badge badge--${statusInfo.status}" title="${escapeHtml(badgeExplanation(statusInfo))}">${plural(info.days, 'day', 'days')} ${info.suffix}</span>`;
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


// When this copy of the site was built, in every page's head: tells a
// fresh page from a cached one.
const BUILT_AT = new Date().toISOString();

// Where people can reach Apple Sunset: the contact page, the footer and
// the site's structured data.
const CONTACT_EMAIL = 'infoswiper@yahoo.com';

function contactPage({ siteUrl, supabaseUrl, supabaseAnonKey }) {
  // Handled by Netlify Forms: the form is detected in the built HTML at
  // deploy time, so there is no server code. The honeypot field catches
  // most bots without putting a puzzle in front of real people.
  const body = `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li class="crumb-sep" aria-hidden="true">&rsaquo;</li><li aria-current="page">Contact</li></ol></nav>

  <h1>Get in touch</h1>
  <p class="page-intro">Spotted something wrong, know a date we have missed, or want to suggest a product? Send us a note and we will read every one.</p>
  <p class="contact-email-line">Prefer email? Write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

  <form name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="/contact/thanks/" class="contact-form">
    <input type="hidden" name="form-name" value="contact">
    <p class="contact-hp" aria-hidden="true"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>

    <div class="contact-field">
      <label for="contact-name">Your name</label>
      <input id="contact-name" name="name" type="text" autocomplete="name" required>
    </div>

    <div class="contact-field">
      <label for="contact-email">Email address</label>
      <input id="contact-email" name="email" type="email" autocomplete="email" required>
      <p class="contact-help">Only used to reply to you. Never shared or added to a list.</p>
    </div>

    <div class="contact-field">
      <label for="contact-topic">What is this about?</label>
      <select id="contact-topic" name="topic">
        <option value="Correction">A correction to a page</option>
        <option value="Missing product">A product or date that is missing</option>
        <option value="General question">A general question</option>
        <option value="Feedback">Feedback about the site</option>
        <option value="Something else">Something else</option>
      </select>
    </div>

    <div class="contact-field" id="contact-about-page" hidden>
      <label for="contact-page">Page you are writing about</label>
      <input id="contact-page" name="page" type="text" readonly>
      <input type="hidden" id="contact-page-url" name="page_url">
      <p class="contact-help">Filled in automatically from the page you came from.</p>
    </div>

    <div class="contact-field">
      <label for="contact-message">Your message</label>
      <textarea id="contact-message" name="message" rows="7" required placeholder="The more detail the better. If it is a correction, a link to a source really helps."></textarea>
    </div>

    <button type="submit" class="intro-cta contact-submit">Send message</button>
  </form>`;

  return shell({
    title: 'Contact us — Apple Sunset',
    description: 'Get in touch with Apple Sunset to report a correction, suggest a product or ask a question.',
    siteUrl,
    path: '/contact/',
    bodyHtml: `<div class="page-narrow">${body}</div>`,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function contactThanksPage({ siteUrl, supabaseUrl, supabaseAnonKey }) {
  const body = `<h1>Thanks, that has been sent</h1>
  <p class="page-intro">We read everything that comes in. If your note needs a reply, we will get back to you by email.</p>
  <p><a class="intro-cta" href="/products/">Back to all products</a></p>`;
  return shell({
    title: 'Thanks — Apple Sunset',
    description: 'Your message has been sent.',
    siteUrl,
    path: '/contact/thanks/',
    bodyHtml: `<div class="page-narrow">${body}</div>`,
    supabaseUrl,
    supabaseAnonKey,
    noindex: true,
  });
}

// How the gallery photos may be used. Every photo's structured data
// points here as its licence, which Google Images asks for.
function photoLicencePage({ siteUrl, supabaseUrl, supabaseAnonKey }) {
  const mailto = `mailto:infoswiper@yahoo.com?subject=${encodeURIComponent('Can I use a photo from Apple Sunset?')}`;
  const body = `<h1>Photo licence</h1>
  <p class="page-intro">Every photo in the <a href="/gallery/">Apple Sunset gallery</a> was taken by Apple Sunset and is protected by copyright. All rights are reserved.</p>
  <h2>Using a photo</h2>
  <p>You are welcome to link to any photo page. To use a photo anywhere else, such as on a website, in an article or on social media, please ask first. Most requests are happily agreed, usually with a credit to Apple Sunset and a link back.</p>
  <p><a class="intro-cta" href="${mailto}">Request to use a photo</a></p>
  <p>Please include a link to the photo and say where and how you would like to use it. You can also get in touch through the <a href="/contact/">contact page</a>.</p>`;
  return shell({
    title: 'Photo licence — Apple Sunset',
    description: 'How the photos in the Apple Sunset gallery may be used, and how to ask permission.',
    siteUrl,
    path: '/photo-licence/',
    bodyHtml: `<div class="page-narrow">${body}</div>`,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function shell({ title, description, siteUrl, path, bodyHtml, supabaseUrl, supabaseAnonKey, noindex, scripts, ogImage, ogType, extraJsonLd }) {
  const bodyClass = path === '/admin/' ? ' class="is-admin"' : '';
  const scriptTags = (scripts || DEFAULT_SCRIPTS).join('\n');
  const fullUrl = `${siteUrl}${path}`;
  const imageUrl = ogImage || `${siteUrl}/logo.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow">'}
<link rel="canonical" href="${fullUrl}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${fullUrl}">
<meta property="og:type" content="${ogType || 'website'}">
<meta property="og:site_name" content="Apple Sunset">
<meta property="og:image" content="${imageUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${imageUrl}">
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: 'Apple Sunset',
      url: siteUrl,
      description: "Tracks how long it's been since every Apple product was last refreshed or discontinued.",
    },
    {
      '@type': 'Organization',
      name: 'Apple Sunset',
      url: siteUrl,
      logo: `${siteUrl}/logo.png`,
      email: CONTACT_EMAIL,
    },
  ],
})}</script>
${extraJsonLd ? `<script type="application/ld+json">${JSON.stringify(extraJsonLd).replace(/</g, "\\u003c")}</script>` : ''}
<link rel="stylesheet" href="/styles.css">
<link rel="alternate" type="application/rss+xml" title="Apple Sunset — Recent Refreshes &amp; Discontinuations" href="/feed.xml">
<link rel="icon" type="image/png" href="/favicon.png">
<meta name="generated" content="${BUILT_AT}">
</head>
<body${bodyClass}>
<header class="site-header-bg">
  <div class="site-header">
    <a class="site-title" href="/">
      <img src="/logo.png" alt="Apple Sunset" class="site-logo-img" width="300" height="300">
    </a>
    <button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">
      <span class="nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>
      <span class="nav-toggle-text">Menu</span>
    </button>
    <nav class="site-nav" id="site-nav">
      <div class="site-nav-links">
        <a href="/products/">All products</a>
        <a href="/coming-soon/">Coming soon</a>
        <a href="/categories/">Categories</a>
        <a href="/discontinued/">Discontinued</a>
        <a href="/gallery/">Photo Gallery</a>
        <a href="/events/">Apple Events</a>
        <a href="/facts/">Facts</a>
      </div>
      <form class="site-search" action="/products/" method="get">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="search" name="search" placeholder="Search the site" aria-label="Search the site" autocomplete="off">
      </form>
    </nav>
  </div>
</header>
<main>
${bodyHtml}
</main>
<footer class="site-footer-bg">
  <div class="site-footer">
    <nav class="footer-nav">
      <a href="/about/">About us</a>
      <a href="/admin/">Admin</a>
      <a href="/events/">Apple Events</a>
      <a href="/contact/">Contact</a>
      <a href="/earnings/">Earnings</a>
      <a href="/facts/">Facts</a>
      <a href="/gallery/">Gallery</a>
      <a href="/feed.xml">RSS Feed</a>
    </nav>
    <p>Apple Sunset is an independent tracker and is not affiliated with Apple Inc.</p>
    <p class="footer-email">Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
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
  return `<article class="card${status === 'discontinued' ? ' card--discontinued' : ''}" data-category="${escapeHtml(product.category)}" data-status="${status}" data-days="${days}" data-wait="${days !== '' ? statusInfo.ratio.toFixed(3) : ''}" data-launch="${launchTs}" data-discontinued="${discTs}" data-lifespan="${lifespanDays}" data-decade="${decade}">
  ${productRowInner(product, statusInfo)}
</article>`;
}

// A product as a row in the All products and Discontinued lists: icon,
// name, family and dates, how far through its usual wait it is, and the
// one number that matters on the right. Keep in step with
// productRowInnerJS() in public/app.js.
const ROW_STATUS_LABELS = { fresh: 'Recently updated', aging: 'Getting on', overdue: 'Overdue' };
function productRowInner(product, statusInfo) {
  const launch = launchDate(product);
  const releases = (product.refresh_history || []).slice().sort();
  const lastDone = releases.filter((d) => d <= new Date().toISOString().slice(0, 10)).pop();
  const meta = [escapeHtml(product.category || '')];
  let figure = '';
  let status = '';
  let bar = '';
  if (product.discontinued) {
    if (launch && product.discontinued_date) meta.push(`Lived ${lifespanText(launch, product.discontinued_date)}`);
    if (launch) meta.push(`Released ${formatDate(launch)}`);
    const year = product.discontinued_date ? String(product.discontinued_date).slice(0, 4) : '';
    // The year, big, on the Discontinued page; in lists that mix in
    // current products (More in, All products), the plain date instead,
    // so it never reads like a current product's day count (styles.css).
    figure = year
      ? `<span class="prow-num">${year}</span> <span class="prow-unit">discontinued ${escapeHtml(formatDate(product.discontinued_date).replace(/ \d{4}$/, ''))}</span><span class="prow-ended">${escapeHtml(formatDate(product.discontinued_date))}</span>`
      : '<span class="prow-unit">Discontinued</span>';
    status = '<span class="prow-status prow-status--discontinued">Discontinued</span>';
  } else if (statusInfo) {
    const info = badgeDaysInfo(product, statusInfo);
    if (info.days < 0) {
      const due = releases[releases.length - 1];
      meta.push(lastDone ? `Last released ${formatDate(lastDone)}` : 'New product');
      figure = `<span class="prow-unit">Coming</span> <span class="prow-num prow-num--date">${due ? escapeHtml(formatDate(due)) : 'soon'}</span>`;
      status = '<span class="prow-status prow-status--upcoming">Coming soon</span>';
    } else {
      meta.push(statusInfo.hasCycle ? `Last released ${formatDate(lastDone || launch)}` : `Only release ${formatDate(lastDone || launch)}`);
      figure = `<span class="prow-num">${info.days.toLocaleString('en-GB')}</span> <span class="prow-unit">${info.days === 1 ? 'day' : 'days'} ${info.suffix}</span>`;
      if (statusInfo.hasCycle) {
        status = `<span class="prow-status prow-status--${statusInfo.status}">${ROW_STATUS_LABELS[statusInfo.status] || ''}</span>`;
        bar = `<span class="prow-bar prow-bar--${statusInfo.status}" title="${escapeHtml(badgeExplanation(statusInfo))}"><span style="width:${Math.min(100, Math.round(statusInfo.ratio * 100))}%"></span></span>`;
      }
    }
  } else {
    meta.push('No release date yet');
  }
  return `<a class="card-link prow" href="/products/${product.slug}/">
    <span class="prow-icon">${productIcon(product, 32)}</span>
    <span class="prow-main">
      <span class="card-name">${escapeHtml(product.name)}</span>
      <span class="prow-meta">${meta.filter(Boolean).join(' &middot; ')}</span>
      ${bar}
    </span>
    ${status}
    <span class="prow-figure">${figure}</span>
  </a>`;
}

function filterBar(key, values, labels, counts, totalCount, showAll = true, allLabel = 'All') {
  return `<div class="filter-bar" data-filter-key="${key}">
  ${showAll ? `<button class="filter-btn active" data-filter-value="all">${allLabel}${totalCount != null ? ` <span class="filter-btn-count">(${totalCount})</span>` : ''}</button>` : ''}
  ${values.map((v, i) => `<button class="filter-btn" data-filter-value="${escapeHtml(v)}">${escapeHtml(labels ? labels[i] : v)}${counts ? ` <span class="filter-btn-count">(${counts[i]})</span>` : ''}</button>`).join('\n')}
</div>`;
}

function sortSelect(options) {
  return `<div class="sort-select-wrap">
    <select id="sort-select" class="sort-select" aria-label="Sort products">
      <option value="" selected disabled>Sort by...</option>
      ${options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('\n')}
    </select>
    <button type="button" id="sort-reset-btn" class="sort-reset-btn" aria-label="Reset sort order" title="Reset to default order" style="display:none;">&times;</button>
  </div>`;
}

const PRODUCT_SORT_OPTIONS = [
  ['wait-desc', 'Most overdue first'],
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
  ['created-desc', 'Recently added'],
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
  // Album tiles: subject tags first, places underneath.
  const rows = [
    tagPills ? `<div class="gallery-tags-row">${tagPills}</div>` : '',
    placePills ? `<div class="gallery-tags-row">${placePills}</div>` : '',
  ].filter(Boolean).join('\n');
  return rows ? `<div class="gallery-tags">${rows}</div>` : '';
}

// The first album tiles are on screen straight away: load them now
// rather than lazily, the very first one ahead of everything else.
function tileLoading(index, first) {
  if (index === 0 && first) return ' fetchpriority="high"';
  return index < 3 ? '' : ' loading="lazy"';
}

function galleryPhotoCardHtml(photo, index) {
  const i = typeof index === 'number' ? index : 99;
  const displayName = photo.caption || (photo.tags && photo.tags[0]) || 'Untitled photo';
  const searchText = [photo.caption, photo.story, photo.location, photo.country, ...(photo.tags || [])].filter(Boolean).join(' ');
  const images = galleryPhotoImages(photo);
  const tagsHtml = galleryTagsHtml(photo);
  const footer = tagsHtml ? `<div class="gallery-card-footer">${tagsHtml}</div>` : '';
  return `<article class="card" data-date="${dateToTimestamp(photo.date_taken)}" data-created="${dateToTimestamp(photo.created_at)}" data-search="${escapeHtml(searchText.toLowerCase())}">
  <a class="card-link" href="/gallery/${galleryPhotoSlug(photo)}/">
    <div class="card-image">
      ${images.length > 1
        ? `<span class="gallery-strip-mosaic${images.length === 2 ? ' gallery-strip-mosaic--two' : ''}">
            <span class="gallery-strip-main">${photoImgHtml(images[0], ` alt="${escapeHtml(displayName)}"${tileLoading(i, true)}`)}</span>
            <span class="gallery-strip-side${images.length === 2 ? ' gallery-strip-side--one' : ''}">
              ${images.slice(1, 3).map((url) => `<span class="gallery-strip-thumb">${photoImgHtml(url, ` alt=""${tileLoading(i)}`)}</span>`).join('')}
              ${images.length > 3 ? `<span class="gallery-strip-more">+${images.length - 3}</span>` : ''}
            </span>
          </span>`
        : images[0] ? photoImgHtml(images[0], ` alt="${escapeHtml(displayName)}"${tileLoading(i, true)}`) : ''}
      ${images.length > 1 ? `<span class="gallery-strip-count">${images.length} photos</span>` : ''}
    </div>
    <p class="card-name">${escapeHtml(displayName)}</p>
    ${photo.date_taken ? `<p class="card-meta">${formatDate(photo.date_taken)}</p>` : ''}
    ${photo.story ? `<p class="card-story">${escapeHtml(storyPreview(photo.story))}</p>` : ''}
  </a>
  ${footer}
</article>`;
}

// Netlify's Image CDN answered every request with 400 (October 2026), so
// each image cost a failed request before the original loaded. Off until
// that's fixed; gallery photos use their own smaller copies instead
// (photoImgHtml). Same switch in app.js and public/facts-kit.js.
const IMAGE_CDN = false;

// Gallery photos the build copied onto this site (src/photo-mirror.js).
let servedPhotos = new Set();
function setServedPhotos(set) {
  servedPhotos = set || new Set();
}

// A gallery photo at a given width: this site's copy when the build made
// one, else the smaller copy in Supabase (see sizedPhotoUrl in
// public/facts-kit.js). Keep in step with photoSrcJS() in app.js.
function photoSrc(url, width) {
  return servedPhotos.has(url) ? FactsKit.localPhotoPath(url, width) : FactsKit.sizedPhotoUrl(url, width);
}

// A gallery photo's <img>: its 800px copy, or the photo itself if that
// copy is missing. Keep in step with photoImgHtmlJS() in app.js.
function photoImgHtml(url, attrs) {
  const small = photoSrc(url, 800);
  if (small === url) return `<img src="${escapeHtml(url)}"${attrs || ''}>`;
  return `<img src="${escapeHtml(small)}" data-full="${escapeHtml(url)}" onerror="this.onerror=null;this.src=this.dataset.full"${attrs || ''}>`;
}

// Netlify Image CDN version of a remote photo at a given width. Only
// Supabase storage is allowed as a source (see netlify.toml); anything
// else is used as-is.
function cdnImage(url, width) {
  if (!IMAGE_CDN || !/^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//.test(url)) return url;
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${width}&q=80`;
}

// An <img> served by Netlify's Image CDN at the size it is shown, so
// Supabase sends each photo once instead of on every visit. If the CDN
// can't serve it, the original loads instead. square crops it to fit a
// square tile. Keep in step with cdnImgHtmlJS() in app.js.
function cdnImgHtml(url, width, attrs, square) {
  const cdn = cdnImage(url, width);
  if (cdn === url) return `<img src="${escapeHtml(url)}"${attrs || ''}>`;
  const src = square ? `${cdn}&h=${width}&fit=cover` : cdn;
  return `<img src="${escapeHtml(src)}" data-full="${escapeHtml(url)}" onerror="this.onerror=null;this.src=this.dataset.full"${attrs || ''}>`;
}

// Icons are drawn at 22 to 40px; one size of file covers them all on
// any screen, and keeps the number of copies the CDN fetches down.
function iconPixels(size) {
  return size <= 40 ? 120 : 240;
}

// A carousel photo: its 800px or 1600px copy via srcset, whichever suits
// the screen, with the photo itself in data-full for the full-screen
// viewer and as the fallback if a copy is missing. Keep in step with
// galleryCarouselImgHtmlJS() in app.js.
function galleryCarouselImgHtml(url, alt, index) {
  const small = photoSrc(url, 800);
  const load = index === 0 ? ' fetchpriority="high"' : ' loading="lazy"';
  if (small === url) return `<img src="${escapeHtml(url)}" data-full="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${load} decoding="async">`;
  const medium = photoSrc(url, 1600);
  return `<img src="${escapeHtml(medium)}" srcset="${escapeHtml(small)} 800w, ${escapeHtml(medium)} 1600w" sizes="(max-width: 700px) 100vw, 640px" data-full="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${load} decoding="async" onerror="this.onerror=null;this.removeAttribute('srcset');this.src=this.dataset.full">`;
}

// Where a photo was taken, e.g. "London, UK" (either part may be missing).
function galleryPlace(photo) {
  return [photo.location, photo.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
}

// Per-photo description for search engines and screen readers, e.g.
// "iPod Hi-Fi — photo 2 of 5, London, UK". Must stay in step with
// galleryImageAltJS() in public/app.js.
function galleryImageAlt(displayName, photo, index, total) {
  const place = galleryPlace(photo);
  return `${displayName}${total > 1 ? ` — photo ${index + 1} of ${total}` : ''}${place ? `, ${place}` : ''}`;
}

// The start of an album's story for its gallery tile: whole sentences
// only, as many as fit in about 160 characters and always the first, so
// a tile never stops mid-sentence. A full stop after an abbreviation
// ("Apple St. David's", "7 a.m.") or an initial isn't a sentence end.
// Keep in step with storyPreviewJS() in app.js.
const STORY_MAX = 160;
function storyPreview(story) {
  const text = String(story || '').replace(/\s+/g, ' ').trim();
  if (text.length <= STORY_MAX) return text;
  const ends = /[.!?]+["'\u2019\u201d)]*(?= |$)/g;
  let shown = '';
  let start = 0;
  let m;
  while ((m = ends.exec(text))) {
    const end = m.index + m[0].length;
    const lastWord = text.slice(start, m.index).split(' ').pop();
    const atEnd = end >= text.length;
    if (!atEnd && (/^(?:St|Mr|Mrs|Ms|Dr|Jr|Sr|No|vs|approx|Mt|Rd|[A-Z]|[a-z]\.[a-z]|e\.g|i\.e)$/i.test(lastWord) || !/^ ["'\u2018\u201c(]?(?:[A-Z0-9]|i[A-Z])/.test(text.slice(end)))) continue;
    const sentence = text.slice(start, end);
    if (shown && (shown + sentence).length > STORY_MAX) break;
    shown += sentence;
    start = end;
  }
  return shown ? shown.trim() : text;
}

// A search-result summary built from the album's own details, led by its
// story (its first sentence or two) when it has one.
function galleryPhotoDescription(displayName, photo, count) {
  const place = galleryPlace(photo);
  if (photo.story) {
    const story = storyPreview(photo.story).replace(/([^.!?"'\u2019\u201d)])$/, '$1.');
    return `${story} ${count > 1 ? `${count} photos` : 'A photo'}${place ? ` taken in ${place}` : ''}${photo.date_taken ? `, ${formatDate(photo.date_taken)}` : ''}, from the Apple Sunset gallery.`;
  }
  const tags = (photo.tags || []).filter((t) => t !== displayName).slice(0, 5);
  let text = `${count > 1 ? `${count} photos` : 'A photo'} of ${displayName}`;
  if (place) text += ` taken in ${place}`;
  if (photo.date_taken) text += `${place ? ',' : ''} ${formatDate(photo.date_taken)}`;
  text += ' — from the Apple Sunset gallery.';
  if (tags.length) text += ` Tags: ${tags.join(', ')}.`;
  return text;
}

function galleryPhotoPage({ photo, prevPhoto, nextPhoto, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const displayName = photo.caption || (photo.tags && photo.tags[0]) || 'Untitled photo';
  const images = galleryPhotoImages(photo);
  const imagesHtml = images.map((url, i) => galleryCarouselImgHtml(url, galleryImageAlt(displayName, photo, i, images.length), i)).join('\n');
  const place = galleryPlace(photo);
  const description = galleryPhotoDescription(displayName, photo, images.length);
  const pageUrl = `${siteUrl}/gallery/${galleryPhotoSlug(photo)}/`;
  const mailtoHref = `mailto:infoswiper@yahoo.com?subject=${encodeURIComponent(`Can I use this photo? — ${displayName}`)}&body=${encodeURIComponent(`Hi, I'd like to ask about using this photo:\n${pageUrl}`)}`;
  const body = `
<article class="gallery-photo-page">
  <div class="gallery-photo-header">
    <div class="page-header-row">
      <h1>${escapeHtml(displayName)}</h1>
      <a class="admin-edit-link" data-admin-href="/admin/?editPhoto=${photo.id}" data-admin-label="Edit" style="display:none;"></a>
    </div>
    ${photo.date_taken ? `<p class="gallery-photo-date">${formatDate(photo.date_taken)}</p>` : ''}
    ${photo.story ? `<p class="gallery-photo-story">${escapeHtml(photo.story)}</p>` : ''}
    ${galleryTagsHtml(photo, true)}
  </div>
  <div class="gallery-photo-images">${imagesHtml}</div>
  <div class="gallery-photo-copyright">
    <p>These photos are my own property. <a href="/photo-licence/">Photo licence</a></p>
    <a class="intro-cta" href="${mailtoHref}">Request to use photo</a>
  </div>
  <div class="gallery-photo-nav">
    ${prevPhoto ? `<a href="/gallery/${galleryPhotoSlug(prevPhoto)}/" class="gallery-nav-link">&larr; Previous</a>` : '<span></span>'}
    <a href="/gallery/" class="gallery-nav-link">Full Gallery</a>
    ${nextPhoto ? `<a href="/gallery/${galleryPhotoSlug(nextPhoto)}/" class="gallery-nav-link">Next &rarr;</a>` : '<span></span>'}
  </div>
</article>`;
  return shell({
    title: `${displayName} — Apple Sunset Gallery`,
    description,
    siteUrl,
    path: `/gallery/${galleryPhotoSlug(photo)}/`,
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
    // Shared links show this site's 1600px copy: quicker, and well under
    // the size limits social sites set, which a camera original can pass.
    ogImage: images[0] && servedPhotos.has(images[0]) ? siteUrl + FactsKit.localPhotoPath(images[0], 1600) : images[0],
    ogType: 'article',
    extraJsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'ImageGallery',
          name: displayName,
          description,
          url: pageUrl,
          keywords: (photo.tags || []).join(', ') || undefined,
          image: images.map((url, i) => ({
            '@type': 'ImageObject',
            contentUrl: url,
            name: galleryImageAlt(displayName, photo, i, images.length),
            dateCreated: photo.date_taken || undefined,
            contentLocation: place ? { '@type': 'Place', name: place } : undefined,
            creator: { '@type': 'Organization', name: 'Apple Sunset' },
            creditText: 'Apple Sunset',
            copyrightNotice: 'Apple Sunset',
            license: `${siteUrl}/photo-licence/`,
            acquireLicensePage: `${siteUrl}/photo-licence/`,
          })),
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Gallery', item: `${siteUrl}/gallery/` },
            { '@type': 'ListItem', position: 2, name: displayName, item: pageUrl },
          ],
        },
      ],
    },
    scripts: DEFAULT_SCRIPTS.concat(`<script src="${assetUrl('gallery-viewer.js')}" defer></script>`),
  });
}

function galleryPage({ photos, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const body = photos.length
    ? `
<div class="page-header-row">
  <h1>${pageHeading(pageContent, 'Gallery')}</h1>
  <a class="admin-edit-link" data-admin-href="/admin/" data-admin-label="Admin" style="display:none;"></a>
</div>
${pageStandardLine(pageContent, `<p class="page-intro">Photos taken along the way, in Apple Stores and elsewhere.</p>`)}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
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
  <h1>${pageHeading(pageContent, 'Gallery')}</h1>
  <a class="admin-edit-link" data-admin-href="/admin/" data-admin-label="Admin" style="display:none;"></a>
</div>
<p class="page-intro">No photos yet.</p>`;
  return shell({
    title: 'Gallery — Apple Sunset',
    description: 'Photos taken along the way, in Apple Stores and elsewhere.',
    siteUrl,
    path: '/gallery/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function emptyState(what) {
  return `<p class="page-intro">No ${what} yet.</p>`;
}

function upcomingExtras(product) {
  // Announcement and pre-order dates live alongside each release in
  // generation_details, so pull them off the newest release.
  const newest = (product.refresh_history || []).slice().sort().pop();
  if (!newest) return {};
  const info = generationDetails(product)[newest] || {};
  return { release: newest, announced: info.announced || null, preorder: info.preorder || null };
}

function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00Z');
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target.getTime() - todayUtc) / 86400000);
}

function featuredCardHtml(product, statusInfo, productsBySlug) {
  const daysInfo = statusInfo ? badgeDaysInfo(product, statusInfo) : null;
  const countHtml = daysInfo
    ? (daysInfo.days < 0
        ? (function () {
            const due = (product.refresh_history || []).slice().sort().pop();
            // The clock is filled in and kept ticking by app.js. The
            // server-rendered day count is the fallback if scripts are off.
            const away = due ? daysUntil(due) : null;
            const fallback = away !== null && away > 0
              ? `<span class="countdown-unit countdown-unit--wide"><span class="countdown-value">${away}</span> <span class="countdown-unit-label">${away === 1 ? 'day' : 'days'}</span></span>`
              : '<span class="countdown-unit countdown-unit--wide"><span class="countdown-value">Today</span></span>';
            return `<div class="card-featured-count card-featured-count--upcoming" data-product-countdown="${due}"><span class="card-featured-count-due">Coming ${formatDate(due)}</span><span class="product-countdown-clock" data-product-countdown-clock>${fallback}</span></div>`;
          })()
        : `<div class="card-featured-count card-featured-count--${statusInfo.status}"><span class="card-featured-count-number">${daysInfo.days}</span> <span class="card-featured-count-suffix">days ${daysInfo.suffix}</span></div>`)
    : productBadge(product, statusInfo);
  const launch = launchDate(product);
  const predecessor = product.previous_model && productsBySlug ? productsBySlug[product.previous_model] : null;
  // Once the predicted date has gone by, saying "expected" is wrong: it
  // was expected, and the product is overdue.
  const expectedDate = statusInfo && statusInfo.hasCycle && !product.discontinued
    ? new Date(new Date(statusInfo.lastRefresh).getTime() + statusInfo.avgCycleDays * 86400000)
    : null;
  const expectedPassed = expectedDate ? expectedDate.getTime() < Date.now() : false;
  const nextExpected = expectedDate ? expectedDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }) : null;
  const extras = upcomingExtras(product);
  // Still to come: the countdown says when, so the line's first launch
  // and a "next refresh" worked out from a future date only confuse.
  const isUpcoming = !!(daysInfo && daysInfo.days < 0);
  // How far through its usual refresh cycle the product is, as a bar.
  // Keep in step with featuredCycleHtmlJS() in public/app.js.
  // One release: no cycle to show, so say that instead of drawing a bar.
  const firstRelease = (product.refresh_history || []).slice().sort()[0];
  const singleHtml = `<div class="card-featured-cycle card-featured-cycle--single">
      <div class="card-featured-cycle-head"><span>Releases so far</span><strong>1</strong></div>
      <p class="card-featured-cycle-note">The first and only release${firstRelease ? `, ${formatDate(firstRelease)}` : ''}. No refresh cycle to go on yet.</p>
    </div>`;
  const cycleHtml = statusInfo && daysInfo && daysInfo.days >= 0 && !product.discontinued && !statusInfo.hasCycle
    ? singleHtml
    : statusInfo && daysInfo && daysInfo.days >= 0 && !product.discontinued
    ? `<div class="card-featured-cycle card-featured-cycle--${statusInfo.status}">
      <div class="card-featured-cycle-head"><span>Average refresh cycle</span><strong>${plural(statusInfo.avgCycleDays, 'day', 'days')}</strong></div>
      <div class="card-featured-cycle-bar"><span style="width:${Math.min(100, Math.round(statusInfo.ratio * 100))}%"></span></div>
      <p class="card-featured-cycle-note">${statusInfo.ratio >= 1 ? `${statusInfo.ratio.toFixed(1)}&times; the usual wait` : `${Math.round(statusInfo.ratio * 100)}% of the usual wait`}</p>
    </div>`
    : '';
  const detailRows = [
    product.price ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Launch price from</span> ${escapeHtml(formatPrice(product.price))}</div>` : '',
    extras.announced ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Announced</span> ${formatDate(extras.announced)}</div>` : '',
    extras.preorder ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Pre-orders open</span> ${formatDate(extras.preorder)}</div>` : '',
    launch && !isUpcoming ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Launch date</span> ${formatDate(launch)}</div>` : '',
    product.discontinued && product.discontinued_date
      ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Discontinued</span> ${formatDate(product.discontinued_date)}</div>`
      : nextExpected && !isUpcoming
      ? `<div class="card-featured-detail"><span class="card-featured-detail-label">${expectedPassed ? 'Refresh was expected' : 'Next refresh expected'}</span> ${nextExpected}</div>`
      : '',
    predecessor ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Previous model</span> ${escapeHtml(predecessor.name)}</div>` : '',
  ].filter(Boolean).join('\n');
  return `<article class="card card--featured" data-category="${escapeHtml(product.category)}">
  <a class="card-link" href="/products/${product.slug}/">
    <span class="card-featured-label">Featured</span>
    <div class="card-name-row">${productIcon(product, 42)}<p class="card-name">${escapeHtml(product.name)}</p></div>
    ${countHtml}
    ${cycleHtml}
    ${detailRows ? `<div class="card-featured-details">${detailRows}</div>` : ''}
  </a>
  ${categoryPill(product.category)}
</article>`;
}

function galleryStripItemHtml(photo) {
  const displayName = photo.caption || (photo.tags && photo.tags[0]) || 'Untitled photo';
  const images = galleryPhotoImages(photo);
  // An album shows one large photo with two smaller ones beside it, so
  // it reads as a set at a glance rather than a single picture.
  const media = images.length > 1
    ? `<span class="gallery-strip-mosaic${images.length === 2 ? ' gallery-strip-mosaic--two' : ''}">
        <span class="gallery-strip-main">${photoImgHtml(images[0], ` alt="${escapeHtml(displayName)}" loading="lazy"`)}</span>
        <span class="gallery-strip-side${images.length === 2 ? ' gallery-strip-side--one' : ''}">
          ${images.slice(1, 3).map((url) => `<span class="gallery-strip-thumb">${photoImgHtml(url, ' alt="" loading="lazy"')}</span>`).join('')}
          ${images.length > 3 ? `<span class="gallery-strip-more">+${images.length - 3}</span>` : ''}
        </span>
      </span>`
    : `<span class="gallery-strip-single">${images[0] ? photoImgHtml(images[0], ` alt="${escapeHtml(displayName)}" loading="lazy"`) : ''}</span>`;
  // Subject tags (e.g. iPod), in orange like the gallery tiles.
  const tags = (photo.tags || []).slice().sort((a, b) => a.localeCompare(b)).slice(0, 3)
    .map((t) => `<span class="pill pill--tag">${escapeHtml(t)}</span>`).join('');
  const count = images.length > 1 ? `<span class="gallery-strip-count">${images.length} photos</span>` : '';
  return `<a class="gallery-strip-item" href="/gallery/${galleryPhotoSlug(photo)}/">
    <span class="gallery-strip-media">${media}${count}</span>
    <span class="gallery-strip-caption">${escapeHtml(displayName)}</span>
    ${tags ? `<span class="gallery-strip-pills">${tags}</span>` : ''}
  </a>`;
}

// The Apple Event in the hero: counting down, live, then what was
// announced. Built by public/facts-kit.js, which the live refresh in
// app.js also uses, so the two always match.
function eventHeroTileHtml(event, productsBySlug) {
  return FactsKit.eventHeroHtml(event, {
    href: `/events/${eventSlug(event)}/`,
    // The artwork's colour, as on the Events page (src/event-colours.js).
    tint: (event.image_url && eventTints[event.image_url]) || '',
    products: Object.values(productsBySlug || {}).map((p) => ({ name: p.name, slug: p.slug })),
  });
}

function normalizedAnnouncedProducts(event) {
  return (event.announced_products || []).map((p) => (typeof p === 'string' ? { name: p, featured: false } : p));
}

// The main colour of each event's artwork (src/event-colours.js), keyed by
// image address, for the tile's frame and glow. Set by build.js.
let eventTints = {};
function setEventTints(map) {
  eventTints = map || {};
}

function eventArchiveCardHtml(event, productsBySlug) {
  const dateText = [formatDate(event.event_date), event.event_time].filter(Boolean).join(' \u00b7 ');
  const products = normalizedAnnouncedProducts(event);
  const featured = products.filter((p) => p.featured).sort((a, b) => a.name.localeCompare(b.name));
  const rest = products.filter((p) => !p.featured).sort((a, b) => a.name.localeCompare(b.name));
  // The headline products make the cut first when there are many, and
  // the pills read A to Z. Must match eventArchiveCardHtmlJS() in app.js.
  const shown = featured.concat(rest).slice(0, 10)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }));
  const remaining = products.length - shown.length;
  // A pill for a product we track links straight to it, which also
  // means the event page is no longer a dead end.
  const productByName = {};
  Object.values(productsBySlug || {}).forEach((p) => { productByName[p.name.toLowerCase()] = p; });
  const tags = shown.map((p) => {
    const match = productByName[p.name.toLowerCase()];
    return match
      ? `<a class="pill pill--link" href="/products/${match.slug}/">${escapeHtml(p.name)}</a>`
      : `<span class="pill">${escapeHtml(p.name)}</span>`;
  }).join('') + (remaining > 0 ? `<span class="pill pill--muted">+${remaining} more</span>` : '');
  // The event's name, big and bold, with its date and time under it,
  // above the artwork. Must match eventArchiveCardHtmlJS() in app.js.
  const inner = `<div class="event-card-head">
      <p class="card-name event-card-title">${escapeHtml(event.heading)}</p>
      ${dateText ? `<p class="card-meta event-card-date">${escapeHtml(dateText)}</p>` : ''}
    </div>
    <div class="card-image">${event.image_url ? cdnImgHtml(event.image_url, 800, ' alt="" loading="lazy"') : ''}</div>`;
  // data-search lets the page filter match the announced products as
  // well as the event's own title and date.
  const searchText = [event.heading, dateText, ...products.map((p) => p.name)].filter(Boolean).join(' ');
  const tint = event.image_url && /^#[0-9a-f]{6}$/i.test(eventTints[event.image_url] || '') ? eventTints[event.image_url] : '';
  // Still to come: a clock at the foot of the tile.
  return `<article class="card card--event-archive${tint ? ' card--tinted' : ''}"${tint ? ` style="--tint: ${tint}"` : ''} data-search="${escapeHtml(searchText.toLowerCase())}">
  <a class="card-link" href="/events/${eventSlug(event)}/">${inner}</a>
  ${tags ? `<div class="gallery-tags"><div class="gallery-tags-row">${tags}</div></div>` : ''}
  ${FactsKit.eventCardCountdownHtml(event, `/events/${eventSlug(event)}/`)}
</article>`;
}

// An event's summary: formatted in the admin or the phone app (bold,
// italic, links), or plain text from before the editors had a toolbar,
// whose line breaks become paragraphs.
function eventSummaryHtml(summary, siteUrl) {
  const raw = String(summary || '').trim();
  if (!raw) return '';
  if (/<[a-z][^>]*>/i.test(raw)) {
    // Words typed before the first paragraph break come without a <p>;
    // wrap them so every paragraph is spaced the same.
    return sanitizeRichText(raw, siteUrl).split(/(<p>[\s\S]*?<\/p>)/)
      .map((part) => (/^<p>/.test(part) ? part : part.replace(/^(\s|<br>)+|(\s|<br>)+$/g, '') ? `<p>${part.replace(/^(\s|<br>)+|(\s|<br>)+$/g, '')}</p>` : ''))
      .filter((part) => part && part.replace(/<\/?p>|<br>|&nbsp;|\s/g, '')).join('');
  }
  return raw.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

// The summary as plain words, for the page's description.
function eventSummaryText(summary) {
  return String(summary || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(p|div)\b[^>]*>|<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

// The event's day and time as pills under the heading: the date on a
// solid violet pill, the time (Apple's and the UK's) on a soft one.
function eventDatePillsHtml(event) {
  const day = new Date(String(event.event_date || '').slice(0, 10) + 'T12:00:00Z');
  if (isNaN(day)) return '';
  const longDate = day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(',', '');
  const uk = FactsKit.eventUkTime(event);
  const time = [event.event_time, uk].filter(Boolean).join(' \u00b7 ');
  const calendar = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  const clock = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  return `<p class="event-date-pills"><span class="event-date-pill">${calendar}<time datetime="${escapeHtml(String(event.event_date).slice(0, 10))}">${escapeHtml(longDate)}</time></span>${time ? `<span class="event-date-pill event-date-pill--time">${clock}<span>${escapeHtml(time)}</span></span>` : ''}</p>`;
}

function eventDetailPage({ event, productsBySlug, siteUrl, supabaseUrl, supabaseAnonKey }) {
  // Written in the admin or the phone app; also the page's description.
  const summaryHtml = eventSummaryHtml(event.summary, siteUrl);
  const summary = eventSummaryText(event.summary);
  const dateText = [formatDate(event.event_date), event.event_time].filter(Boolean).join(' \u00b7 ');
  // A product on the site is shown under its own name ("AirPods 5", even
  // if typed "Airpods 5"), and the whole row links to its page.
  const announced = normalizedAnnouncedProducts(event).map((p) => {
    const match = Object.values(productsBySlug || {}).find((x) => x.name.toLowerCase() === String(p.name).trim().toLowerCase());
    return { name: match ? match.name : appleName(String(p.name).trim()), slug: match ? match.slug : null };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const sortedProducts = announced.map((p) => p.name);
  const productsList = announced.length
    ? `<ul class="event-products-list">
    ${announced.map((p) => (p.slug
      ? `<li><a class="event-product-link" href="/products/${p.slug}/">${escapeHtml(p.name)}<span class="event-product-go" aria-hidden="true">&rarr;</span></a></li>`
      : `<li><span class="event-product-plain">${escapeHtml(p.name)}</span></li>`)).join('\n')}
  </ul>`
    : '';
  // The date and time pills and the clock take the event's own colour,
  // from its artwork (as its tile does on the Events page and homepage);
  // burnt orange, the site's colour, when the artwork has none.
  const tint = event.image_url && /^#[0-9a-f]{6}$/i.test(eventTints[event.image_url] || '') ? eventTints[event.image_url] : '';
  const body = `
<article class="event-detail-page${tint ? '' : ' event-detail-page--orange'}"${tint ? ` style="${FactsKit.eventTintStyle(tint)}"` : ''}>
  <div class="page-header-row">
    <h1>${escapeHtml(event.heading)}</h1>
    <a class="admin-edit-link" data-admin-href="/admin/" data-admin-label="Admin" style="display:none;"></a>
  </div>
  ${eventDatePillsHtml(event)}
  ${FactsKit.eventCountdownHtml(event)}
  ${event.image_url ? cdnImgHtml(event.image_url, 1280, ' class="event-detail-image" alt=""') : ''}
  ${summaryHtml ? `<div class="page-copy event-summary">${summaryHtml}</div>` : ''}
  ${productsList ? `<h2>What was announced</h2>${productsList}` : ''}
  ${event.event_url ? `<p><a class="intro-cta" href="${escapeHtml(event.event_url)}" target="_blank" rel="noopener">Watch on Apple's site</a></p>` : ''}
  <p><a href="/events/" class="gallery-nav-link">&larr; All Apple Events</a></p>
</article>`;
  return shell({
    title: `${event.heading} — Apple Sunset`,
    description: `${event.heading}${dateText ? `, ${dateText}` : ''}. ${summary ? summary : sortedProducts.length ? 'Announced: ' + sortedProducts.join(', ') + '.' : 'The date, time and what Apple announced, tracked by Apple Sunset.'}`,
    siteUrl,
    path: `/events/${eventSlug(event)}/`,
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function eventsPage({ events, productsBySlug, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const body = `
<div class="page-header-row">
  <h1>${pageHeading(pageContent, 'Apple Events')}</h1>
  <a class="admin-edit-link" data-admin-href="/admin/" data-admin-label="Admin" style="display:none;"></a>
</div>
${pageStandardLine(pageContent, `<p class="page-intro">A running record of every Apple Event announced here, and what was revealed at each one.</p>`)}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
${events.length ? '' : '<p id="no-events" class="page-intro">No events yet.</p>'}
<div class="card-grid" id="grid" data-mode="events">
  ${events.map((event) => eventArchiveCardHtml(event, productsBySlug)).join('\n')}
</div>`;
  return shell({
    title: 'Apple Events — Apple Sunset',
    description: 'A running archive of every Apple Event announced, and what was revealed at each one.',
    siteUrl,
    path: '/events/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
    // facts-kit.js: the live refresh redraws the upcoming event's clock.
    scripts: [`<script src="${assetUrl('facts-kit.js')}" defer></script>`].concat(DEFAULT_SCRIPTS),
  });
}

// Statistics worked out from every product, then each product's own
// "Did you know?". Built by the same code (public/facts-kit.js) that
// the page's live refresh uses.
function factsPage({ facts, products, todayKey, history, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const inner = FactsKit.factsPageHtml(facts, products, { todayKey, history });
  const body = `
<div class="page-header-row">
  <h1>${pageHeading(pageContent, 'Facts')}</h1>
  <a class="admin-edit-link" data-admin-href="/admin/" data-admin-label="Admin" style="display:none;"></a>
</div>
${pageStandardLine(pageContent, `<p class="page-intro">Every &ldquo;Did you know?&rdquo; from the Apple Sunset homepage, newest first.</p>`)}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
${inner ? '' : '<p id="no-facts" class="page-intro">Nothing here yet.</p>'}
<div class="controls-row facts-controls">
  <input type="search" id="facts-search" class="search-input" placeholder="Search facts…" aria-label="Search facts">
</div>
<p id="facts-no-results" class="page-intro" hidden>No facts match your search.</p>
<div id="facts-list" class="facts-list" data-mode="facts" data-today-key="${escapeHtml(todayKey || '')}" data-history="${escapeHtml(JSON.stringify(history || []))}">${inner}</div>`;
  return shell({
    title: 'Facts — Apple Sunset',
    description: 'Every "Did you know?" fact from the Apple Sunset homepage, newest first.',
    siteUrl,
    path: '/facts/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
    scripts: [`<script src="${assetUrl('facts-kit.js')}" defer></script>`].concat(DEFAULT_SCRIPTS),
  });
}

// One fact's own page. Its main job is the link preview: tweets link
// here, and X shows the fact's card (og:image) under the tweet.
function factPage({ fact: savedFact, products, cardUrl, related, siteUrl, supabaseUrl, supabaseAnonKey }) {
  // A statistic shows its current numbers (FactsKit.liveFacts).
  const fact = (FactsKit.liveFacts([savedFact], products)[0]) || savedFact;
  const path = `/facts/${fact.id}/`;
  const body = `
<article class="fact-page">
  <p class="fact-label">Did you know?</p>
  <h1 class="fact-page-text">${escapeHtml(fact.text)}</h1>
  ${cardUrl ? cdnImgHtml(cardUrl, 1200, ' class="fact-page-card" alt="" width="1200" height="675"') : ''}
  ${factRelatedLinkHtml(related)}
  <a href="/facts/" class="fact-more-link">More facts &rarr;</a>
</article>`;
  return shell({
    title: `Did you know? ${fact.text.length > 44 ? fact.text.slice(0, 42).trim() + '…' : fact.text} — Apple Sunset`,
    description: fact.text,
    siteUrl,
    path,
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
    ogImage: cardUrl || undefined,
    ogType: 'article',
    noindex: true,
  });
}

// Where a fact can send a curious reader: the product it names (longest
// name wins, so "AirPods Pro" beats "AirPods"), otherwise a gallery
// album whose title it names. Null when it names neither.
function factRelatedLink(text, products, galleryPhotos) {
  // Spacing and punctuation don't matter: "Hi-Fi", "Hi Fi" and "HiFi"
  // all match.
  const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const factWords = ' ' + words(text) + ' ';
  const factJoined = factWords.replace(/ /g, '');
  const names = (str) => {
    const n = words(str);
    if (n.length < 3) return false;
    if (factWords.includes(' ' + n + ' ')) return true;
    const joined = n.replace(/ /g, '');
    return joined.length >= 6 && factJoined.includes(joined);
  };
  const product = (products || []).filter((p) => p.slug && names(p.name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (product) return { href: `/products/${product.slug}/`, label: `More on the ${product.name}` };
  // An album matches on its title or on one of its tags.
  const albums = (galleryPhotos || []).map((g) => {
    const hit = [g.caption].concat(g.tags || []).filter((t) => t && names(t)).sort((a, b) => b.length - a.length)[0];
    return hit ? { album: g, hit } : null;
  }).filter(Boolean).sort((a, b) => b.hit.length - a.hit.length);
  if (albums.length) {
    const { album, hit } = albums[0];
    return { href: `/gallery/${galleryPhotoSlug(album)}/`, label: `See the ${album.caption || hit} photos` };
  }
  return null;
}

function factRelatedLinkHtml(related) {
  return related ? `<a href="${escapeHtml(related.href)}" class="fact-more-link fact-related-link">${escapeHtml(related.label)} &rarr;</a>` : '';
}

function factBoxInnerHtml(fact, related) {
  return `<p class="fact-label">Did you know?</p>
    <p class="fact-text" data-fact-id="${escapeHtml(String(fact.id || ''))}">${escapeHtml(fact.text)}</p>
    ${factRelatedLinkHtml(related)}
    <a href="/facts/" class="fact-more-link">More facts &rarr;</a>`;
}

// A live countdown to whatever is next: a pinned Apple Event, or the
// nearest future release date. The days are rendered here so the page
// is correct before any script runs; the script only adds the clock.
// Products launching at the same moment share one clock: their names
// are listed together on one tile instead of two identical countdowns.
function groupCountdowns(countdown) {
  const items = !countdown ? [] : Array.isArray(countdown) ? countdown : [countdown];
  const out = [];
  const byMoment = {};
  items.forEach((item) => {
    const key = item.product ? `${item.date}|${item.time || ''}` : null;
    if (key && byMoment[key]) {
      byMoment[key].group.push(item);
      return;
    }
    const entry = item.product ? { ...item, group: [item] } : item;
    if (key) byMoment[key] = entry;
    out.push(entry);
  });
  return out;
}

// opts.stack: one box. The first (the soonest) has the clock; everything
// after it is a line under it in the same box, its name and date only.
// When the first has launched, the next day's build drops it and the
// next moves up and takes the clock.
// opts.max: how many show in the box, the first included; the rest wait
// behind "+2 more coming" at its foot, which opens them in place.
function countdownHtml(countdown, opts) {
  if (!countdown) return '';
  // Accepts one countdown or several, so more than one upcoming product
  // can be shown at once.
  const items = Array.isArray(countdown) ? countdown : [countdown];
  if (!items.length) return '';
  if (!(opts && opts.stack) || items.length < 2) return items.map((item) => oneCountdownHtml(item)).join('\n');
  const [first, ...rest] = items;
  // A line per product: two launching on the same day are two lines.
  const lines = rest.flatMap((item) => (item.group && item.group.length > 1 ? item.group : [item]));
  const room = Math.max(0, (opts.max || items.length) - 1);
  const shown = lines.slice(0, room);
  const hidden = lines.slice(room);
  const list = `<div class="countdown-next-list">
    ${shown.map(countdownLineHtml).join('\n    ')}
    ${hidden.length ? `<details class="countdown-more">
      <summary><span class="countdown-more-closed">+${hidden.length} more coming</span><span class="countdown-more-open">Show fewer</span></summary>
      ${hidden.map(countdownLineHtml).join('\n      ')}
      <a class="countdown-more-all" href="/coming-soon/">Everything coming soon &rarr;</a>
    </details>` : ''}
  </div>`;
  return oneCountdownHtml(first, list);
}

// One of the later launches in the box: icon, name and date (this year's
// without the year) with how far off it is ("in 10 days", kept current
// in the browser by app.js), linking to its page.
function countdownLineHtml(item) {
  const year = String(new Date().getUTCFullYear());
  const date = formatDate(item.date).replace(new RegExp(' ' + year + '$'), '');
  const away = FactsKit.daysUntilText(item.date);
  return `<a class="countdown-next" href="${item.href}">${item.product ? `<span class="countdown-next-icon">${productIcon(item.product, 22)}</span>` : ''}<span class="countdown-next-name">${escapeHtml(item.label)}</span><span class="countdown-next-when"><span class="countdown-next-date">${escapeHtml(date)}</span>${away ? `<span class="countdown-next-in" data-days-until="${escapeHtml(item.date)}">${escapeHtml(away)}</span>` : ''}</span></a>`;
}

// tail: the later launches' lines, inside the same box (opts.stack). The
// box then holds several links, so it isn't one itself: its name is.
function oneCountdownHtml(item, tail) {
  // Whole days to go, as the ticking clock shows them: to the time
  // given (e.g. "1:30pm PT"), else 8am UK on the day.
  const target = item.time ? FactsKit.eventStartMs({ event_date: item.date, event_time: item.time }) : Date.parse(item.date + 'T07:00:00Z');
  const days = Math.max(0, Math.floor((target - Date.now()) / 86400000));
  const over = target <= Date.now();
  // What the tile says once its moment arrives (app.js switches to it,
  // e.g. in a tab left open overnight; the next build drops the tile).
  const isEvent = /^\/events\//.test(item.href);
  const done = item.product
    ? { kicker: 'Out today', text: '🎉 Available now', date: `Released ${formatDate(item.date)}` }
    : isEvent
    ? { kicker: 'Happening now', text: 'Live now', date: '' }
    : { kicker: 'Results day', text: 'Results are out', date: '' };
  // Several products at the same moment: one tile, each name its own
  // link (so the tile itself isn't one).
  const members = item.group && item.group.length > 1 ? item.group : null;
  const linkedNames = !!(members || tail);
  const tag = linkedNames ? 'div' : 'a';
  // A product counts down with its icon, as on the featured tile.
  const nameHtml = (m, linked) => (m.product
    ? `<${linked ? `a href="${m.href}"` : 'span'} class="countdown-name-row"><span class="countdown-icon">${productIcon(m.product, 32)}</span><span class="countdown-name">${escapeHtml(m.label)}</span></${linked ? 'a' : 'span'}>`
    : linked ? `<a class="countdown-name" href="${m.href}">${escapeHtml(m.label)}</a>` : `<span class="countdown-name">${escapeHtml(m.label)}</span>`);
  const namesHtml = (members || [item]).map((m) => nameHtml(m, linkedNames)).join('');
  const clockHtml = `<span class="countdown-clock" data-countdown-clock>
    ${over
      ? `<span class="countdown-done-badge">${escapeHtml(done.text)}</span>`
      : `<span class="countdown-unit"><span class="countdown-value">${days}</span> <span class="countdown-unit-label">${days === 1 ? 'day' : 'days'}</span></span>`}
  </span>`;
  const dateHtml = `<span class="countdown-date">${over && done.date ? escapeHtml(done.date) : `${item.datePrefix ? `${item.datePrefix} ` : ''}${formatDate(item.date)}${item.time ? ` &middot; ${escapeHtml(item.time)}` : ''}`}</span>`;
  // Built after the moment (a rebuild on release day): already finished.
  return `<${tag} class="countdown${isEvent ? ' countdown--event' : ''}${item.product ? ' countdown--product' : ''}${linkedNames ? ' countdown--group' : ''}${tail ? ' countdown--stack' : ''}${over ? ' countdown--done' : ''}"${linkedNames ? '' : ` href="${item.href}"`} data-countdown="${escapeHtml(item.date)}"${item.time ? ` data-countdown-time="${escapeHtml(item.time)}"` : ''} data-done-kicker="${escapeHtml(done.kicker)}" data-done-text="${escapeHtml(done.text)}"${done.date ? ` data-done-date="${escapeHtml(done.date)}"` : ''}>
  <span class="countdown-label">${escapeHtml(over ? done.kicker : (item.kicker || 'Counting down to'))}</span>
  ${namesHtml}
  ${clockHtml}
  ${dateHtml}
  ${tail || ''}
  </${tag}>`;
}

// The homepage's at-a-glance counts. Must stay in step with
// siteStatsJS() / siteStatsHtmlJS() in public/app.js, which refresh them
// from live data a moment after the page loads.
// --- Apple's quarterly results (the earnings table) ---

function earningsQuarter(e) {
  return `Q${e.fiscal_quarter} FY${e.fiscal_year}`;
}

// The next results still to come (today counts), or null.
function nextEarnings(earnings, today) {
  const day = today || new Date().toISOString().slice(0, 10);
  return (earnings || []).filter((e) => e.report_date && e.report_date >= day)
    .sort((a, b) => (a.report_date < b.report_date ? -1 : 1))[0] || null;
}

// The homepage line under the countdown: the next results, days to go.
// where: 'stacked' for the copy placed after the hero tiles for stacked
// layouts; 'words' for the copy under the hero's words, shown on laptops
// when something else counts down beside them.
function earningsLineHtml(e, where) {
  if (!e) return '';
  const today = new Date().toISOString().slice(0, 10);
  // UK calendar days, kept current in the browser by app.js.
  const when = FactsKit.daysUntilText(e.report_date);
  // A results chart (rising bars) beside the words.
  const icon = '<span class="earnings-next-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.5h17"/><rect x="5" y="13" width="3.2" height="5" rx="1"/><rect x="10.4" y="9" width="3.2" height="9" rx="1"/><rect x="15.8" y="4.5" width="3.2" height="13.5" rx="1"/></svg></span>';
  // With a time, the box can also hold a clock counting down to the
  // results, plus their time in the UK and when the call starts. They show
  // only when the box has room for them (beside the hero tiles with
  // nothing else counting down: see .earnings-next--clock in styles.css).
  // The clock ticks with the site's others (app.js, data-countdown-at) and
  // hides itself once the results are out.
  const at = e.report_time ? FactsKit.eventStartMs({ event_date: e.report_date, event_time: e.report_time }) : NaN;
  const hasClock = !isNaN(at) && at > Date.now();
  const uk = e.report_time ? FactsKit.eventUkTime({ event_date: e.report_date, event_time: e.report_time }) : '';
  const extra = [uk, e.call_time ? `call at ${escapeHtml(e.call_time)}` : ''].filter(Boolean).join(' &middot; ');
  const clock = hasClock
    ? `<span class="earnings-next-clock" data-countdown-at="${at}" data-countdown-box role="timer" aria-label="Time until Apple's results">${FactsKit.eventClockUnits(at - Date.now())}</span>`
    : '';
  return `<a class="earnings-next${where ? ` earnings-next--${where}` : ''}${hasClock ? ' earnings-next--clock' : ''}" href="/earnings/"><span class="earnings-next-head">${icon}<span class="earnings-next-body"><span class="earnings-next-label">Next earnings<span class="earnings-next-in"> &middot; <span data-days-until="${escapeHtml(e.report_date)}">${when}</span></span></span><span class="earnings-next-text"><span class="earnings-next-title">Apple ${earningsQuarter(e)} results</span><span class="earnings-next-sep">, </span><span class="earnings-next-when">${formatDate(e.report_date).replace(' ' + today.slice(0, 4), '')}${e.report_time ? ` at ${escapeHtml(e.report_time)}` : ''}&nbsp;<span aria-hidden="true">&rarr;</span></span></span>${hasClock && extra ? `<span class="earnings-next-extra">${extra}</span>` : ''}</span></span>${clock}</a>`;
}

function earningsPage({ earnings, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const today = new Date().toISOString().slice(0, 10);
  const next = nextEarnings(earnings, today);
  const past = (earnings || []).filter((e) => e !== next && e.report_date < today)
    .sort((a, b) => (a.report_date < b.report_date ? 1 : -1));
  const years = [...new Set(past.map((e) => e.fiscal_year))];
  const nextHtml = next
    ? `<section class="earnings-next-box">
  ${countdownHtml({ label: `Apple ${earningsQuarter(next)} results`, date: next.report_date, time: next.report_time || null, href: '#archive', kicker: 'Next results' })}
  <p class="earnings-next-note">${next.quarter_end ? `Covers the quarter that ended ${formatDate(next.quarter_end)}. ` : ''}${next.call_time ? `Apple discusses the results on a call at ${escapeHtml(next.call_time)}, streamed at <a href="https://investor.apple.com/" rel="noopener" target="_blank">investor.apple.com</a>.` : ''}</p>
</section>`
    : '';
  const row = (e) => `<tr>
      <th scope="row">${earningsQuarter(e)}</th>
      <td>${formatDate(e.report_date)}</td>
      <td>${e.quarter_end ? formatDate(e.quarter_end) : ''}</td>
      <td>${e.headline ? escapeHtml(e.headline) : ''}</td>
      <td>${e.press_release_url ? `<a href="${escapeHtml(e.press_release_url)}" rel="noopener" target="_blank">Press release <span aria-hidden="true">&#8599;</span></a>` : ''}</td>
    </tr>`;
  const archive = years.map((y) => `<h2 class="earnings-year">Fiscal ${y}</h2>
<div class="earnings-table-wrap"><table class="earnings-table">
  <thead><tr><th scope="col">Quarter</th><th scope="col">Results</th><th scope="col">Quarter ended</th><th scope="col">Headline</th><th scope="col"><span class="sr-only">Link</span></th></tr></thead>
  <tbody>${past.filter((e) => e.fiscal_year === y).map(row).join('')}</tbody>
</table></div>`).join('\n');
  const body = `
<div class="page-header-row">
  <h1>${pageHeading(pageContent, 'Apple earnings')}</h1>
  <a class="admin-edit-link" data-admin-href="/admin/" data-admin-label="Admin" style="display:none;"></a>
</div>
${pageStandardLine(pageContent, `<p class="page-intro">When Apple next reports its quarterly results, and every past quarter with a link to Apple&rsquo;s own press release.</p>`)}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
${nextHtml}
<div id="archive">${archive || '<p class="page-intro">No past results yet.</p>'}</div>
<p class="earnings-footnote">Apple&rsquo;s fiscal year ends in late September, so Q1 is the October to December holiday quarter. Figures are as Apple reported them.</p>`;
  return shell({
    title: 'Apple earnings dates and results archive | Apple Sunset',
    description: next
      ? `Apple reports ${earningsQuarter(next)} results on ${formatDate(next.report_date)}. Every past quarter's results date, headline figure and press release.`
      : 'Every Apple quarterly results date, headline figure and press release, newest first.',
    siteUrl,
    path: '/earnings/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function siteStats(products) {
  const list = products || [];
  const today = new Date().toISOString().slice(0, 10);
  const onSale = list.filter((p) => !p.discontinued);
  let latest = null;
  onSale.forEach((p) => {
    (p.refresh_history || []).forEach((d) => {
      if (d <= today && d !== p.discontinued_date && (!latest || d > latest.date)) latest = { date: d, name: p.name, slug: p.slug };
    });
  });
  // Everything on sale that came out that same day: the tile names the
  // first (A to Z) and counts the rest ("iPhone 18 Pro +1").
  if (latest) {
    const sameDay = onSale.filter((p) => (p.refresh_history || []).indexOf(latest.date) !== -1)
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    if (sameDay.length) latest = { date: latest.date, name: sameDay[0].name, slug: sameDay[0].slug, others: sameDay.slice(1).map((p) => p.name) };
  }
  return {
    total: list.length,
    onSale: onSale.length,
    discontinued: list.length - onSale.length,
    latest,
    latestDays: latest ? Math.round((new Date(today) - new Date(latest.date)) / 86400000) : null,
  };
}

// The at-a-glance tile for Apple's newest release: "New today" on the
// day, otherwise "35 days since Apple's last release", with the product
// (and how many others came out with it) and the date.
// Must match latestReleaseStatHtmlJS() in public/app.js.
function latestReleaseStatHtml(latest, days) {
  const others = latest.others || [];
  const more = others.length ? `<span class="site-stat-more" title="${escapeHtml('Also: ' + others.join(', '))}">+${others.length}</span>` : '';
  const num = days === 0
    ? '<span class="site-stat-num site-stat-num--word">New today</span>'
    : `<span class="site-stat-num">${days}<small> ${days === 1 ? 'day' : 'days'}</small></span>`;
  const label = days === 0 ? 'Apple\u2019s latest release' : 'since Apple\u2019s last release';
  return `<a class="site-stat site-stat--latest" href="/products/${escapeHtml(latest.slug)}/">${num} <span class="site-stat-label">${label}</span><span class="site-stat-sub"><span class="site-stat-sub-name">${escapeHtml(latest.name)}</span>${more}</span><span class="site-stat-date">Released ${formatDate(latest.date)}</span></a>`;
}

function siteStatsHtml(s) {
  if (!s || !s.total) return '';
  const stat = (href, num, label, extra) => `<a class="site-stat" href="${href}"><span class="site-stat-num">${num}</span> <span class="site-stat-label">${label}</span>${extra || ''}</a>`;
  return `<div class="site-stats" id="site-stats">
    <div class="site-stats-head"><h2 class="site-stats-title">Apple Sunset at a glance</h2><span class="site-stats-live"><span class="site-stats-dot" aria-hidden="true"></span>Live</span></div>
    <div class="site-stats-row">
      ${stat('/products/', s.total, 'products tracked')}
      ${stat('/products/?show=current', s.onSale, 'products on sale now')}
      ${stat('/discontinued/', s.discontinued, 'products discontinued')}
      ${s.latest ? latestReleaseStatHtml(s.latest, s.latestDays) : ''}
    </div>
  </div>`;
}

function homePage({ heroFeatured, heroRotation, heroRest, overdueItems, categoryLinks, totalCount, galleryPicks, productsBySlug, activeEvent, dailyFact, pageContent, countdown, earningsNext, stats, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const featuredSlotHtml = activeEvent
    ? eventHeroTileHtml(activeEvent, productsBySlug)
    : heroRotation && heroRotation.length > 1
    // Every featured product is built in; the script after the hero shows
    // one at random on each visit, so the tile rotates without a swap.
    ? heroRotation.map((i, n) => featuredCardHtml(i.product, i.status, productsBySlug)
        .replace('<article ', `<article data-hero-slug="${escapeHtml(i.product.slug)}"${n ? ' hidden' : ''} `)).join('\n')
    : heroFeatured
    ? featuredCardHtml(heroFeatured.product, heroFeatured.status, productsBySlug)
    : '';
  // The big tile: an Apple Event or a featured product. The Live counts
  // run in a strip under the hero (below).
  const heroCardsHtml = heroFeatured || activeEvent ? featuredSlotHtml : emptyState('products');
  // What's coming up: product countdowns and the next earnings. Beside
  // the words when something counts down (three columns), else under them.
  // One box: the soonest has the clock, the next two a line each under
  // it, and any more open from "+2 more coming" at its foot.
  const countdowns = groupCountdowns(countdown);
  const sideHtml = `${countdownHtml(countdowns, { stack: true, max: 3 })}${earningsLineHtml(earningsNext)}`;

  // Pills on desktop, a native picker on mobile: thirteen families wrap
  // into five rows on a phone, and a scrolling row would hide most of
  // them off the edge.
  const categoryLinksHtml = categoryLinks && categoryLinks.length
    ? `<div class="filter-bar homepage-category-links">
  ${categoryLinks.map((c) => `<a class="filter-btn" href="/categories/${slugify(c.category)}/">${escapeHtml(c.category)} <span class="filter-btn-count">(${c.count})</span></a>`).join('\n')}
</div>
<details class="homepage-category-select">
  <summary>Browse by category</summary>
  <nav class="homepage-category-menu" aria-label="Browse by category">
    ${categoryLinks.map((c) => `<a href="/categories/${slugify(c.category)}/">${escapeHtml(c.category)} <span>${c.count}</span></a>`).join('\n')}
  </nav>
</details>`
    : '';

  const overdueSection = overdueItems && overdueItems.length
    ? `<section class="homepage-section">
  <h2>Products waiting longest for a refresh</h2>
  <ol class="overdue-list" id="overdue-list">
    ${overdueItems.map((i) => overdueRowHtml(i.product, i.status)).join('\n')}
  </ol>
  <p class="overdue-more"><a class="intro-cta" href="/products/">Browse all products</a></p>
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

  // The day's fact, picked by the build (FactsKit.pickDailyFact). app.js
  // re-renders it with the same FactsKit.dailyFactBoxHtml.
  const factSection = `<section class="homepage-section homepage-section--divided" id="fact-section" style="display:${dailyFact ? '' : 'none'};">
  <div class="fact-box" id="fact-box">
    ${FactsKit.dailyFactBoxHtml(dailyFact, (html) => sanitizeRichText(html, siteUrl))}
  </div>
</section>`;

  const body = `
<section class="intro-hero">
  <div class="intro-hero-layout">
    <div class="intro-hero-text intro-hero-words">
      <h1 class="intro-heading">${pageHeading(pageContent, 'Apple Sunset')}</h1>
      ${pageIntroHtml(pageContent, siteUrl, 'intro') || `<p class="intro-subtitle">Apple Sunset tracks how long it&rsquo;s been since every Apple product was last refreshed or discontinued.</p>
      <p class="intro-subtitle">See the latest refresh cycles, release timelines, and what&rsquo;s still current, all in one place.</p>`}
      ${countdowns.length && earningsNext ? earningsLineHtml(earningsNext, 'words') : ''}
    </div>
    ${sideHtml.trim() ? `<div class="intro-hero-text intro-hero-side${countdowns.length ? ' intro-hero-side--countdown' : ' intro-hero-text--calm'}">
      ${sideHtml}
    </div>` : ''}
    <div class="intro-hero-cards" id="hero-cards">
      ${heroCardsHtml}
    </div>
    ${earningsNext ? earningsLineHtml(earningsNext, 'stacked') : ''}
    <script>(function(){var c=document.querySelectorAll('#hero-cards [data-hero-slug]');if(c.length<2)return;var k=Math.floor(Math.random()*c.length);for(var i=0;i<c.length;i++)c[i].hidden=i!==k;window.__heroPick=c[k].getAttribute('data-hero-slug');})();</script>
  </div>
  ${siteStatsHtml(stats)}
</section>
${overdueSection}
${categoryLinksHtml}
${factSection}
${gallerySection}
${pageIntroHtml(pageContent, siteUrl, 'footer')}`;
  return shell({
    title: 'How long since Apple last updated each product | Apple Sunset',
    description: `Days since the last refresh for ${totalCount} Apple products, with release histories, typical refresh cycles and an archive of everything Apple has discontinued.`,
    siteUrl,
    path: '/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
    // facts-kit.js re-renders the day's fact and drafts its X post.
    scripts: [`<script src="${assetUrl('facts-kit.js')}" defer></script>`].concat(DEFAULT_SCRIPTS),
  });
}

function allProductsPage({ items, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const categories = [...new Set(items.map((i) => i.product.category))].sort((a, b) => a.localeCompare(b));
  const categoryCounts = categories.map((c) => items.filter((i) => i.product.category === c).length);
  const statusCounts = STATUS_VALUES.map((v) => items.filter((i) => {
    const s = i.product.discontinued ? 'discontinued' : 'current';
    return s === v;
  }).length);
  const body = items.length
    ? `
<h1>${pageHeading(pageContent, 'All products')}</h1>
${pageStandardLine(pageContent, `<p class="page-intro">Everything on the site, current and discontinued, in one searchable place.</p>`)}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
<div class="filter-panel">
  <div class="filter-group">
    <span class="filter-group-label">Show</span>
    ${filterBar('status', STATUS_VALUES, STATUS_LABELS, statusCounts, items.length, true, 'All')}
  </div>
  <div class="filter-group">
    <span class="filter-group-label">Category</span>
    ${filterBar('category', categories, null, categoryCounts, items.length, false)}
    <div class="family-select-wrap">
      <select class="family-select" data-family-select aria-label="Filter by category">
        <option value="">All categories</option>
        ${categories.map((c, i) => `<option value="${escapeHtml(c)}">${escapeHtml(c)} (${categoryCounts[i]})</option>`).join('\n        ')}
      </select>
    </div>
  </div>
</div>
<div class="controls-row controls-row--below-filters">
  <input type="search" id="search-input" class="search-input" placeholder="Search products…" aria-label="Search products">
  ${sortSelect(PRODUCT_SORT_OPTIONS)}
</div>
<h2 id="sort-heading" class="sort-heading">Longest wait first, discontinued last</h2>
<p id="no-results" class="page-intro" style="display:none;">No products match your search.</p>
<div class="card-grid product-list" id="grid" data-mode="all">
  ${items.map((i) => cardHtml(i.product, i.status)).join('\n')}
</div>
<div id="pagination" class="pagination"></div>`
    : `
<h1>${pageHeading(pageContent, 'All products')}</h1>
${emptyState('products')}`;
  return shell({
    title: 'All products — Apple Sunset',
    description: 'Every Apple product on the site, current and discontinued, searchable and sortable.',
    siteUrl,
    path: '/products/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function discontinuedPage({ items, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const decades = [...new Set(items.map((p) => p.discontinued_date ? `${Math.floor(new Date(p.discontinued_date).getFullYear() / 10) * 10}s` : '').filter(Boolean))].sort();
  const decadeCounts = decades.map((d) => items.filter((p) => p.discontinued_date && `${Math.floor(new Date(p.discontinued_date).getFullYear() / 10) * 10}s` === d).length);
  const body = items.length
    ? `
<h1>${pageHeading(pageContent, 'Discontinued products')}</h1>
${pageStandardLine(pageContent, `<p class="page-intro">The products Apple no longer sells, when they launched, when they went, and what took their place.</p>`)}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
<div class="controls-row">
  <input type="search" id="search-input" class="search-input" placeholder="Search discontinued products…" aria-label="Search discontinued products">
  ${sortSelect(DISCONTINUED_SORT_OPTIONS)}
</div>
${filterBar('decade', decades, null, decadeCounts, items.length)}
<p id="no-results" class="page-intro" style="display:none;">No products match your search.</p>
<div class="card-grid product-list" id="grid" data-mode="discontinued">
  ${items.map((p) => cardHtml(p, null)).join('\n')}
</div>
<div id="pagination" class="pagination"></div>`
    : `
<h1>${pageHeading(pageContent, 'Discontinued products')}</h1>
<p class="page-intro">No discontinued products yet.</p>`;
  return shell({
    title: 'Discontinued Apple products — Apple Sunset',
    description: 'An archive of the Apple products that have been discontinued: when they launched, when they went, how long they lasted, and what replaced them.',
    siteUrl,
    path: '/discontinued/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

// --- Coming soon: every product with a release date still to come ---

// { date, products } for each launch day still ahead (today included, so
// a launch-day visit sees it arrive), soonest first. Products sharing a
// day share an entry. A product's coming date is its newest release
// when that is still ahead, as its own page and badge show it.
function comingSoonGroups(products, today) {
  const day = today || new Date().toISOString().slice(0, 10);
  const byDate = {};
  (products || []).forEach((p) => {
    if (p.discontinued) return;
    const due = (p.refresh_history || []).slice().sort().pop();
    if (!due || due < day) return;
    (byDate[due] = byDate[due] || []).push(p);
  });
  return Object.keys(byDate).sort().map((date) => ({
    date,
    products: byDate[date].sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

// The day in full ("Friday 30 October 2026"); a month or year alone
// (an expected date) as the site writes it elsewhere.
function comingDateText(date) {
  if (datePrecision(date) !== 'day') return formatDate(date);
  const d = new Date(date + 'T12:00:00Z');
  const part = (o) => d.toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, o));
  return `${part({ weekday: 'long' })} ${part({ day: 'numeric' })} ${part({ month: 'long' })} ${part({ year: 'numeric' })}`;
}

// The clock: ticks in app.js (data-countdown, to 8am UK on the day, as
// the homepage countdown does); whole days until then.
function comingClockHtml(date) {
  const target = Date.parse(date + 'T07:00:00Z');
  const days = Math.max(0, Math.floor((target - Date.now()) / 86400000));
  return target <= Date.now()
    ? '<span class="countdown-done-badge">🎉 Available now</span>'
    : `<span class="countdown-unit"><span class="countdown-value">${days}</span> <span class="countdown-unit-label">${days === 1 ? 'day' : 'days'}</span></span>`;
}

// How far off a launch day is ("in 10 days", "tomorrow"), kept current in
// the browser by app.js. Only for an exact day.
function comingAwayHtml(date) {
  if (datePrecision(date) !== 'day') return '';
  const away = FactsKit.daysUntilText(date);
  return away ? `<span class="coming-away"> &middot; <span data-days-until="${escapeHtml(date)}">${escapeHtml(away)}</span></span>` : '';
}

// What the clock turns into on the day (app.js, data-done-*).
function comingDoneAttrs(date) {
  return `data-done-kicker="Launch day" data-done-text="🎉 Available now" data-done-date="Released ${escapeHtml(formatDate(date))}"`;
}

function comingSoonPage({ products, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const groups = comingSoonGroups(products);
  const exact = (g) => datePrecision(g.date) === 'day';
  const [next, ...later] = groups;
  let body;
  if (!next) {
    body = `
<h1>${pageHeading(pageContent, 'Coming soon')}</h1>
${pageStandardLine(pageContent, '<p class="page-intro">Nothing has a release date yet. When Apple announces a product and when it reaches shops, it shows here with a countdown.</p>')}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
<p><a class="intro-cta" href="/events/">See Apple Events</a></p>`;
  } else {
    // The next to launch: first and biggest, counting down to the second.
    const single = next.products.length === 1 ? next.products[0] : null;
    const extras = single ? upcomingExtras(single) : {};
    const facts = single ? [
      extras.announced ? `Announced ${formatDate(extras.announced)}` : '',
      extras.preorder ? `Pre-orders ${formatDate(extras.preorder)}` : '',
      single.price ? `From ${escapeHtml(formatPrice(single.price))}` : '',
    ].filter(Boolean) : [];
    const nameHtml = (p, linked) => `<${linked ? `a href="/products/${p.slug}/"` : 'span'} class="coming-next-product"><span class="coming-next-icon">${productIcon(p, 56)}</span><span class="coming-next-text"><span class="coming-next-name">${escapeHtml(p.name)}</span><span class="coming-next-family">${escapeHtml(p.category || '')}</span></span></${linked ? 'a' : 'span'}>`;
    const tag = single ? 'a' : 'div';
    const nextHtml = `<section class="coming-next-wrap" aria-label="Next to launch">
  <${tag} class="coming-next${exact(next) ? '' : ' coming-next--expected'}"${single ? ` href="/products/${single.slug}/"` : ''}${exact(next) ? ` data-countdown="${escapeHtml(next.date)}" ${comingDoneAttrs(next.date)}` : ''}>
    <span class="coming-next-main">
      <span class="coming-next-kicker countdown-label">Next to launch</span>
      <span class="coming-next-names">${next.products.map((p) => nameHtml(p, !single)).join('')}</span>
      <span class="coming-next-date countdown-date">${exact(next) ? 'Coming ' : 'Expected '}${escapeHtml(comingDateText(next.date))}${comingAwayHtml(next.date)}</span>
      ${facts.length ? `<span class="coming-next-facts">${facts.map((f) => `<span>${f}</span>`).join(' &middot; ')}</span>` : ''}
      ${single ? '<span class="coming-next-cta">See the product &rarr;</span>' : ''}
    </span>
    ${exact(next) ? `<span class="coming-clock" data-countdown-clock role="timer">${comingClockHtml(next.date)}</span>` : ''}
  </${tag}>
</section>`;
    // Then everything after it, soonest first: one card each.
    const cards = later.flatMap((g) => g.products.map((p) => `<a class="coming-card" href="/products/${p.slug}/"${exact(g) ? ` data-countdown="${escapeHtml(g.date)}" ${comingDoneAttrs(g.date)}` : ''}>
    <span class="coming-card-head"><span class="coming-card-icon">${productIcon(p, 34)}</span><span class="coming-card-text"><span class="coming-card-name">${escapeHtml(p.name)}</span><span class="coming-card-family">${escapeHtml(p.category || '')}</span></span></span>
    ${exact(g) ? `<span class="coming-clock coming-clock--small" data-countdown-clock role="timer">${comingClockHtml(g.date)}</span>` : ''}
    <span class="coming-card-date countdown-date">${exact(g) ? 'Coming ' : 'Expected '}${escapeHtml(formatDate(g.date))}${comingAwayHtml(g.date)}</span>
  </a>`));
    body = `
<h1>${pageHeading(pageContent, 'Coming soon')}</h1>
${pageStandardLine(pageContent, '<p class="page-intro">Every Apple product with a release date still to come, soonest first, counting down to the day it reaches shops.</p>')}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
${nextHtml}
${cards.length ? `<h2 class="coming-later-title">Also on the way</h2>
<div class="coming-grid">
  ${cards.join('\n  ')}
</div>` : ''}
${pageIntroHtml(pageContent, siteUrl, 'footer')}`;
  }
  const names = groups.flatMap((g) => g.products.map((p) => p.name));
  return shell({
    title: 'Coming soon: Apple products with a release date | Apple Sunset',
    description: names.length
      ? `Countdowns to Apple's next releases: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ' and more' : ''}.`
      : 'Countdowns to Apple products with a release date still to come.',
    siteUrl,
    path: '/coming-soon/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
    // facts-kit.js: keeps the "in 10 days" notes current (app.js).
    scripts: [`<script src="${assetUrl('facts-kit.js')}" defer></script>`].concat(DEFAULT_SCRIPTS),
  });
}

// One row per family on the categories page. Where a product row asks
// "how long has it been?", this asks "what's next for the family?": the
// latest release, a New tag for 30 days after one, and when the next is
// due, from the same family-wide average gap the category page quotes.
// Keep in step with categoryRowHtmlJS() in app.js, which redraws the list
// live so a product saved in the admin shows up straight away.
function categoryRowHtml({ category, items }) {
  const today = new Date().toISOString().slice(0, 10);
  const products = items.map((i) => i.product);
  const current = products.filter((p) => !p.discontinued);
  const total = products.length;
  const gone = total - current.length;
  const past = Array.from(new Set(products.flatMap((p) => p.refresh_history || []))).filter((d) => d <= today).sort();
  const lastDate = past[past.length - 1] || null;
  const cad = familyCadence(items);
  const sinceLast = lastDate ? Math.round((new Date(today) - new Date(lastDate)) / 86400000) : null;
  const isNew = sinceLast != null && sinceLast <= 30;

  let latest = 'No releases recorded yet';
  if (lastDate) {
    const names = products.filter((p) => (p.refresh_history || []).indexOf(lastDate) !== -1).map((p) => p.name).sort((a, b) => a.localeCompare(b));
    const who = names.length > 2 ? `${names[0]} and ${names.length - 1} others` : names.join(' and ');
    const ago = `<span class="crow-nowrap">${sinceLast === 0 ? 'today' : `${sinceLast.toLocaleString('en-GB')} ${sinceLast === 1 ? 'day' : 'days'} ago`}</span>`;
    latest = current.length
      ? `Latest: <strong>${escapeHtml(who)}</strong> &middot; ${ago}`
      : `Last release: <strong>${escapeHtml(who)}</strong> &middot; <span class="crow-nowrap">${formatDate(lastDate)}</span>`;
  }
  const count = gone === 0 ? plural(total, 'product', 'products')
    : gone === total ? (total === 1 ? '1 product, discontinued' : `${total} products, all discontinued`)
    : `${plural(total, 'product', 'products')} &middot; ${gone} discontinued`;

  const monthYear = (ms) => new Date(ms).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', timeZone: 'UTC' });
  const upcoming = current.flatMap((p) => p.refresh_history || []).filter((d) => d > today).sort()[0];
  let next;
  if (!current.length) {
    const year = products.map((p) => p.discontinued_date).filter(Boolean).sort().pop();
    const ended = products.some((p) => p.last_in_line);
    next = year ? { kind: 'gone', value: year.slice(0, 4), caption: ended ? 'line ended' : 'line discontinued' } : { kind: 'gone', value: ended ? 'Ended' : 'Discontinued', caption: 'whole line' };
  } else if (upcoming) {
    next = { kind: 'coming', value: formatDate(upcoming), caption: 'next release' };
  } else if (!cad) {
    next = past.length === 1 ? { kind: 'early', value: 'Only one release', caption: 'so far' } : { kind: 'early', value: 'Too early', caption: 'to tell' };
  } else {
    const due = new Date(lastDate).getTime() + cad.avg * 86400000;
    const why = `Based on ${cad.releases} release dates, about every ${plural(cad.avg, 'day', 'days')}`;
    if (due > new Date(today).getTime()) next = { kind: 'next', value: monthYear(due), caption: 'next expected', why };
    else if (sinceLast <= cad.avg * 1.25) next = { kind: 'due', value: 'Due now', caption: `expected ${monthYear(due)}`, why };
    else next = { kind: 'overdue', value: 'Overdue', caption: `was expected ${monthYear(due)}`, why };
  }
  // Sort keys for the search and sort controls above the list.
  const nextAt = next.kind === 'coming' ? new Date(upcoming).getTime()
    : next.kind === 'next' || next.kind === 'due' || next.kind === 'overdue' ? new Date(lastDate).getTime() + cad.avg * 86400000 : '';
  const sortData = `data-name="${escapeHtml(category)}" data-search="${escapeHtml([category].concat(products.map((p) => p.name)).join(' '))}" data-line="${current.length ? 'current' : 'gone'}" data-next="${nextAt}" data-latest="${lastDate ? new Date(lastDate).getTime() : ''}" data-count="${total}"`;
  return `<a class="crow" href="/categories/${slugify(category)}/" data-category="${escapeHtml(category)}" ${sortData}>
  <span class="crow-icon">${categoryIcon(category, 28)}</span>
  <span class="crow-main">
    <span class="crow-name">${escapeHtml(category)}${isNew ? ' <span class="crow-new">New</span>' : ''}</span>
    <span class="crow-latest">${latest}</span>
    <span class="crow-count">${count}</span>
  </span>
  <span class="crow-next crow-next--${next.kind}"${next.why ? ` title="${escapeHtml(next.why)}"` : ''}><span class="crow-next-value">${escapeHtml(next.value)}</span><span class="crow-next-caption">${escapeHtml(next.caption)}</span></span>
</a>`;
}

function categoriesIndexPage({ groups, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const rows = groups.map(categoryRowHtml).join('\n');
  const body = `
<h1>${pageHeading(pageContent, 'Browse by category')}</h1>
${pageStandardLine(pageContent, `<p class="page-intro">Every product line on the site, current and discontinued.</p>`)}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
<div class="controls-row category-controls">
  <input type="search" id="category-search" class="search-input" placeholder="Search categories or products…" aria-label="Search categories or products">
  <select id="category-sort" class="sort-select" aria-label="Sort categories">
    <option value="name">A to Z</option>
    <option value="next">Next release soonest</option>
    <option value="latest">Most recently updated</option>
    <option value="wait">Longest since a release</option>
    <option value="count">Most products</option>
  </select>
</div>
<p id="category-no-results" class="page-intro category-no-results" hidden>No categories or products match your search.</p>
<div class="category-list" id="category-list">${rows}</div>
<p class="category-list-note">&ldquo;Next expected&rdquo; is the latest release plus the family&rsquo;s average gap between releases.</p>`;
  return shell({
    title: 'Categories — Apple Sunset',
    description: 'Browse Apple products by category: iPhone, Mac, iPad, Apple Watch, AirPods, Vision Pro and more.',
    siteUrl,
    path: '/categories/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function leagueRowHtml(product, statusInfo, rank, endOfLine) {
  const status = productStatusKey(product);
  const launch = launchDate(product);
  const days = statusInfo && status === 'current' ? statusInfo.daysSince : '';
  const launchTs = launch ? new Date(launch).getTime() : '';
  const discTs = product.discontinued && product.discontinued_date ? new Date(product.discontinued_date).getTime() : '';
  const lifespanDays = launch && product.discontinued && product.discontinued_date ? daysBetween(launch, product.discontinued_date) : '';
  const decade = product.discontinued && product.discontinued_date ? `${Math.floor(new Date(product.discontinued_date).getFullYear() / 10) * 10}s` : '';
  return `<tr class="league-row${status === 'discontinued' ? ' league-row--discontinued' : ''}" data-href="/products/${product.slug}/" data-category="${escapeHtml(product.category)}" data-status="${status}" data-days="${days}" data-wait="${days !== '' ? statusInfo.ratio.toFixed(3) : ''}" data-launch="${launchTs}" data-discontinued="${discTs}" data-lifespan="${lifespanDays}" data-decade="${decade}">
  <td class="league-rank">${rank}</td>
  <td class="league-name"><a href="/products/${product.slug}/" class="league-name-link">${productIcon(product, 24)}<span>${escapeHtml(product.name)}</span></a></td>
  <td class="league-status">${productBadge(product, statusInfo)}${endOfLine ? ' <span class="badge badge--end">End of the line</span>' : ''}</td>
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
    ${items.map((i, idx) => leagueRowHtml(i.product, i.status, idx + 1, isEndOfLine(i.product, items.map((x) => x.product)))).join('\n')}
  </tbody>
</table>`;
}

function categoryPage({ category, items, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const slug = slugify(category);
  const currentCount = items.filter((i) => !i.product.discontinued).length;
  const discontinuedCount = items.length - currentCount;
  const statusCounts = STATUS_VALUES.map((v) => items.filter((i) => {
    const s = i.product.discontinued ? 'discontinued' : 'current';
    return s === v;
  }).length);
  // The family page is the combined overview, so every line in it shares
  // one timeline here, whatever each product's own page is set to show.
  const allProductsInCategory = items.map((i) => ({ ...i.product, timeline_name: null }));
  const seedProduct = allProductsInCategory[0];
  const timelinePoints = seedProduct ? categoryTimelinePoints(seedProduct, allProductsInCategory) : [];
  const releaseHistorySection = timelinePoints.length
    ? `<h2>${releaseHistoryHeading(category)}</h2>
  ${verticalTimelineHtml(seedProduct, allProductsInCategory)}`
    : '';
  const body = `
${breadcrumbsHtml([
  { label: 'Home', href: '/' },
  { label: 'Categories', href: '/categories/' },
  { label: category },
])}
<div class="category-page-heading" data-category="${escapeHtml(category)}">${categoryIcon(category, 36)}<h1>${pageHeading(pageContent, category)}</h1></div>
${pageStandardLine(pageContent, `<p class="page-intro">${currentCount} current product${currentCount === 1 ? '' : 's'}${discontinuedCount ? `, ${discontinuedCount} discontinued` : ''}. Newest first.</p>`)}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
${!pageContent || pageContent.show_stats !== false ? categoryStatsSentence(category, items) : ''}
<div class="controls-row">
  <input type="search" id="search-input" class="search-input" placeholder="Search ${escapeHtml(category)} or any product…" aria-label="Search">
  ${sortSelect(PRODUCT_SORT_OPTIONS)}
</div>
<div class="filter-row">
  ${filterBar('status', STATUS_VALUES, STATUS_LABELS, statusCounts, items.length)}
  ${timelinePoints.length ? jumpPillHtml('#category-timeline-section') : ''}
</div>
<p id="no-results" class="page-intro" style="display:none;">No products match your search.</p>
${leagueTableHtml(items, category)}
<section id="other-families" data-category-name="${escapeHtml(category)}" style="display:none;">
  <h2 class="sort-heading">In other families</h2>
  <div id="other-families-grid" class="card-grid product-list"></div>
</section>
<!-- The products come straight under the filters that change them, so
     tapping Current or Discontinued shows the result; the long timeline
     follows, a tap away on "Release history". -->
<div id="category-timeline-section" class="category-timeline-section" style="display:${timelinePoints.length ? '' : 'none'};">
  ${releaseHistorySection}
</div>
${pageIntroHtml(pageContent, siteUrl, 'footer')}`;
  return shell({
    title: `${category} release history and update tracker | Apple Sunset`,
    description: `How long since each ${category} product was last updated, with release dates, typical refresh cycles and every discontinued model.`,
    siteUrl,
    path: `/categories/${slug}/`,
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

// The structured data already described these; this puts them on the
// page, where they help people as well as search results.
function breadcrumbsHtml(trail) {
  const parts = trail.map((step, i) => {
    const last = i === trail.length - 1;
    return last
      ? `<li aria-current="page">${escapeHtml(step.label)}</li>`
      : `<li><a href="${step.href}">${escapeHtml(step.label)}</a></li>`;
  }).join('<li class="crumb-sep" aria-hidden="true">&rsaquo;</li>');
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${parts}</ol></nav>`;
}

// Other products in the same family, so a page is never a dead end for
// a reader or for a crawler.
function relatedProductsHtml(product, productsBySlug, statusBySlug, jumpToHistory) {
  if (!productsBySlug) return '';
  const siblings = Object.keys(productsBySlug)
    .map((slug) => productsBySlug[slug])
    .filter((p) => p.slug !== product.slug && (p.category || '') === (product.category || ''))
    // Newest first, by when each was first released.
    .sort((a, b) => {
      const da = launchDate(a);
      const db = launchDate(b);
      if (da !== db) return !da ? 1 : !db ? -1 : da < db ? 1 : -1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 6);
  if (!siblings.length) return '';
  const rows = siblings.map((p) => cardHtml(p, statusBySlug ? statusBySlug[p.slug] : null)).join('\n');
  return `<section class="related-section">
    <div class="related-head"><h2>More in ${escapeHtml(product.category || 'this category')}</h2>${jumpToHistory ? jumpPillHtml('#release-history') : ''}</div>
    <div class="card-grid product-list related-list">${rows}</div>
    <p class="see-all"><a class="intro-cta" href="/categories/${slugify(product.category || 'other')}/">All ${escapeHtml(product.category || 'products')} &rarr;</a></p>
  </section>`;
}

// "Release history" pill: a jump down the page to the timeline, used on
// family pages (beside the filters) and product pages (beside "More in").
function jumpPillHtml(href) {
  return `<a class="jump-pill" href="${href}">Release history <span aria-hidden="true">&darr;</span></a>`;
}

function keyFact(label, value) {
  return value ? `<div class="key-fact"><p class="key-fact-label">${label}</p><p class="key-fact-value">${value}</p></div>` : '';
}

function specRow(label, valueHtml) {
  return valueHtml ? `<div class="spec-row"><dt>${label}</dt><dd>${valueHtml}</dd></div>` : '';
}

// apple.com/uk/x/ and apple.com/x/ are the same page, as are
// support.apple.com/en-gb/123 and /en-us/123.
function normaliseAppleLink(url) {
  if (!url) return '';
  const parts = String(url).trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '')
    .split(/[?#]/)[0].replace(/\/+$/, '').split('/');
  if (parts.length > 1 && /^[a-z]{2}(-[a-z]{2})?$/.test(parts[1]) && parts[1] !== 'kb' && parts[1] !== 'tv') parts.splice(1, 1);
  return parts.join('/');
}

// When Apple replaces a product it usually reuses the address
// (apple.com/homepod-mini/ moved on to the second generation), so the
// old product's link would open the new one. Returns the current
// product now using this link, if there is one.
function linkTakenOverBy(product, field, productsBySlug) {
  const own = normaliseAppleLink(product[field]);
  if (!own || !product.discontinued || !productsBySlug) return null;
  return Object.values(productsBySlug).find((p) => p.slug !== product.slug && !p.discontinued && normaliseAppleLink(p[field]) === own) || null;
}

function appleLinkRow(label, product, field, linkText, goneText, productsBySlug) {
  if (product[field + '_unavailable']) return specRow(label, goneText);
  const newer = linkTakenOverBy(product, field, productsBySlug);
  if (newer) return specRow(label, `Apple\u2019s page now shows the <a href="/products/${newer.slug}/">${escapeHtml(newer.name)}</a>`);
  return product[field] ? specRow(label, `<a href="${product[field]}" target="_blank" rel="noopener">${linkText} &#8599;</a>`) : '';
}

function heroCycle(product, status, sortedDates, allProducts) {
  // The product's own gaps when it has enough history, otherwise the
  // family's real gaps, labelled so it is clear which is being shown.
  // Never the built-in category default, which is a guess.
  // Must match heroCycleJS() in public/app.js.
  if (sortedDates.length > 1 && status) return { days: status.avgCycleDays, family: null };
  const fam = familyCadence((allProducts || []).filter((p) => (p.category || '') === (product.category || '')).map((p) => ({ product: p })));
  if (!fam) return null;
  // One release: the product has no gaps of its own, so the family's are
  // quoted, in numbers, beside its latest release. Not as a bar: one
  // model ageing past the family's gap is not a missed update when the
  // family itself has moved on (the iPhone 16 after the iPhone 17).
  if (sortedDates.length <= 1) {
    const latestNames = (allProducts || [])
      .filter((p) => (p.category || '') === (product.category || '') && (p.refresh_history || []).indexOf(fam.lastDate) !== -1)
      .map((p) => p.name).sort((a, b) => a.localeCompare(b));
    return { days: fam.avg, family: product.category || null, single: true, lastDate: fam.lastDate, sinceLast: fam.sinceLast, latestNames };
  }
  return { days: fam.avg, family: product.category || null };
}

function heroStatHtml(product, statusInfo, cycleDays) {
  if (product.discontinued) {
    const date = product.discontinued_date ? ` ${formatDate(product.discontinued_date)}` : '';
    return `<p class="days-hero days-hero--discontinued">Discontinued${date}</p>`;
  }
  if (!statusInfo) return '';
  const info = badgeDaysInfo(product, statusInfo);
  if (info.days < 0) {
    // Coming soon: the date, and a live countdown to it (filled in and
    // kept ticking by app.js; the day count is the fallback without it).
    // Keep in step with heroStatHtmlJS() in public/app.js.
    const due = (product.refresh_history || []).slice().sort().pop();
    const away = due ? daysUntil(due) : null;
    const fallback = away !== null && away > 0
      ? `<span class="countdown-unit countdown-unit--wide"><span class="countdown-value">${away}</span> <span class="countdown-unit-label">${away === 1 ? 'day' : 'days'}</span></span>`
      : '';
    return `<p class="days-hero days-hero--upcoming"${due ? ` data-product-countdown="${due}"` : ''}><span class="days-hero-label">Coming soon</span> <span class="days-hero-soon">${due ? formatDate(due) : 'soon'}</span>${due ? `<span class="product-countdown-clock days-hero-clock" data-product-countdown-clock>${fallback}</span>` : ''}</p>`;
  }
  // A bar showing how far through the family's usual gap this product is
  // gives the big number something to be measured against, and uses the
  // space the number alone leaves empty.
  let bar = '';
  const first = (product.refresh_history || []).slice().sort()[0];
  const when = first ? formatDate(first) : null;
  // One release: its age, then the family's cycle in numbers, the same
  // figures the family paragraph further down gives.
  if (cycleDays && cycleDays.single && cycleDays.days > 0) {
    const fam = escapeHtml(cycleDays.family || 'this family');
    const latestIsThis = first && first === cycleDays.lastDate;
    // The newest in the family, by name, so the reader can see the line
    // has moved on (the only place this is said on a product page).
    const names = cycleDays.latestNames || [];
    const who = names.length > 2 ? `the ${names[0]} and others` : names.length ? `the ${names.join(' and the ')}` : '';
    const ago = cycleDays.sinceLast === 0 ? 'today' : `${plural(cycleDays.sinceLast, 'day', 'days')} ago`;
    const text = `${when ? `Released ${when}` : 'Released'}${latestIsThis ? `, the latest ${fam} release` : ', its only release recorded here'}. ` +
      `Across the family, Apple updates ${fam} about every ${plural(cycleDays.days, 'day', 'days')} (${roughCadence(cycleDays.days)}).` +
      (latestIsThis ? '' : ` The latest${who ? `, ${escapeHtml(who)},` : ''} came out ${ago}.`);
    bar = `<span class="days-hero-caption">${text}</span>`;
  } else if (cycleDays && cycleDays.days > 0) {
    const gap = cycleDays.days;
    const pct = Math.max(2, Math.min(100, Math.round((info.days / gap) * 100)));
    const over = info.days > gap;
    const whose = cycleDays.family ? `the ${escapeHtml(cycleDays.family)} line's usual` : 'its usual';
    const caption = over
      ? `${plural(info.days - gap, 'day', 'days')} past ${whose} ${plural(gap, 'day', 'days')} between updates`
      : `about ${plural(gap - info.days, 'day', 'days')} until ${whose} ${plural(gap, 'day', 'days')} between updates`;
    bar = `<span class="days-hero-track" role="img" aria-label="${escapeHtml(caption)}"><span class="days-hero-fill${over ? ' is-over' : ''}" style="width:${pct}%"></span></span>
      <span class="days-hero-caption">${caption}</span>`;
  }
  // Nothing to measure against: say so plainly rather than leave the box
  // half empty or invent a cycle.
  if (!bar) {
    // With only one release recorded there is no cycle to measure. How
    // that reads depends on age: a week-old product is simply new, while
    // one sitting untouched for years is a genuine wait. Neither claims
    // Apple has skipped an update, since earlier releases may just not be
    // recorded here yet.
    const text = info.days < 365
      ? `Released ${when || 'recently'}. This is the only release recorded here, so there is nothing yet to measure a refresh cycle against.`
      : `${when ? `Released ${when}, and no` : 'No'} update has been recorded since, so there is nothing yet to measure a refresh cycle against.`;
    bar = `<span class="days-hero-caption">${text}</span>`;
  }
  // One release has never been refreshed: its days count from release.
  const suffix = info.suffix === 'since refresh' && (product.refresh_history || []).length <= 1 ? 'since release' : info.suffix;
  return `<p class="days-hero days-hero--${statusInfo.status}"><span class="days-hero-number">${info.days}</span> ${info.days === 1 ? 'day' : 'days'} ${suffix}${bar}</p>`;
}

// A Wikipedia link is named after the article it opens: Wikipedia often
// covers several models in one ("iPhone 7" for the iPhone 7 Plus too).
// Keep in step with externalLinkLabelJS() in public/app.js.
function wikiArticleTitle(url) {
  const m = String(url || '').match(/wikipedia\.org\/wiki\/([^#?]+)/i);
  if (!m) return null;
  let title;
  try { title = decodeURIComponent(m[1]); } catch (err) { title = m[1]; }
  return title.replace(/_/g, ' ').replace(/^I(Phone|Pad|Pod|Mac|Book|OS|Cloud|Tunes|Watch|Sight)/, 'i$1').trim() || null;
}

function externalLinkLabel(product) {
  const isWiki = /wikipedia\.org/i.test(product.external_link || '');
  if (!isWiki) return product.name;
  return `${wikiArticleTitle(product.external_link) || product.name} on Wikipedia`;
}

function productPage({ product, status, history, productsBySlug, statusBySlug, galleryPhotos, ogImage, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const sortedDates = history.slice().sort();
  const launch = product.original_launch_date || sortedDates[0] || null;
  const latest = sortedDates[sortedDates.length - 1] || null;

  const allProducts = productsBySlug ? Object.values(productsBySlug) : [product];
  const cycle = heroCycle(product, status, sortedDates, allProducts);
  const timelinePoints = categoryTimelinePoints(product, allProducts);
  const timelineHtml = verticalTimelineHtml(product, allProducts);
  // When the timeline above already lists exactly this product's own
  // dates, a Generations table underneath is the same data twice, unless
  // it carries announced dates the timeline doesn't show.
  // The table used to be the only place an announced date appeared, so it
  // was shown for single-generation products too. Announced and pre-order
  // now have their own tiles, so with one generation the table only
  // repeats what is already above it and in the timeline.
  const timelineCoversOnlyThisProduct = productGenerations(product).length < 2;

  // An uploaded file or a YouTube/Vimeo link plays beside the details;
  // any other video link is a row in the details (see FactsKit.videoInfo).
  const video = FactsKit.videoInfo(product.video_url);
  const videoBlock = !video || video.kind === 'link'
    ? ''
    : video.kind === 'file'
    ? `<video class="product-video" src="${escapeHtml(video.src)}" controls></video>`
    : `<div class="product-video product-video--embed${video.vertical ? ' product-video--vertical' : ''}"><iframe src="${escapeHtml(video.src)}" title="${escapeHtml(product.name)} video on ${video.host}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;

  const successor = product.replaced_by && productsBySlug ? productsBySlug[product.replaced_by] : null;
  const replacedByHtml = successor
    ? `<a href="/products/${successor.slug}/">${escapeHtml(successor.name)}</a>`
    : product.replaced_by
    ? readableSlugFallback(product.replaced_by)
    : '';

  const predecessor = product.previous_model && productsBySlug ? productsBySlug[product.previous_model] : null;
  const previousModelHtml = predecessor
    ? `<a href="/products/${predecessor.slug}/">${escapeHtml(predecessor.name)}</a>`
    : product.previous_model
    ? readableSlugFallback(product.previous_model)
    : '';

  const daysInfo = status ? badgeDaysInfo(product, status) : null;

  // Related gallery photos: an exact (case-insensitive) match between one
  // of a photo's tags and this product's name. This only surfaces
  // something when you've actually tagged a photo with the product name,
  // so it stays a bonus rather than a guess, and the section below is
  // fully hidden when nothing matches.
  const productNameLower = product.name.trim().toLowerCase();
  const relatedPhotos = (galleryPhotos || []).filter((photo) =>
    (photo.tags || []).some((tag) => tag.trim().toLowerCase() === productNameLower)
  );

  // The six facts people come for, as a card grid, then everything else
  // in a smaller list underneath. Nothing is hidden, but the page no
  // longer gives "Days counted from" the same weight as the price.
  const keyFacts = [
    (() => {
      const releases = releaseDates(product);
      const newest = releases[releases.length - 1] || latest;
      return keyFact(releases.length > 1 ? 'Latest release' : 'Released', newest ? formatDate(newest) : (launch ? formatDate(launch) : null));
    })(),
    // Announcement and pre-order dates are already recorded against the
    // newest release, so show them rather than leave the grid half empty.
    (() => {
      const info = latest ? (generationDetails(product)[latest] || {}) : {};
      return [
        info.announced ? keyFact('Announced', formatDate(info.announced)) : '',
        info.preorder ? keyFact('Pre-orders opened', formatDate(info.preorder)) : '',
      ].join('');
    })(),
    keyFact('Launch price from', product.price ? escapeHtml(formatPrice(product.price)) : null),
    keyFact('First release', product.original_launch_date && product.original_launch_date !== latest ? formatDate(product.original_launch_date) : null),
    keyFact('Typical cycle', status && !product.discontinued && sortedDates.length > 1 ? `About every ${plural(status.avgCycleDays, 'day', 'days')}`
      // One release: the family's cycle, said to be the family's.
      : !product.discontinued && cycle && cycle.single ? `About every ${plural(cycle.days, 'day', 'days')}<span class="key-fact-note">across ${escapeHtml(cycle.family || 'the family')}</span>` : null),
    (() => {
      if (!status || sortedDates.length <= 1 || product.discontinued) return '';
      const due = new Date(new Date(status.lastRefresh).getTime() + status.avgCycleDays * 86400000);
      const label = due.getTime() < Date.now() ? 'Was expected' : 'Next expected';
      return keyFact(label, due.toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }));
    })(),
    keyFact('Discontinued', product.discontinued && product.discontinued_date ? formatDate(product.discontinued_date) : null),
    keyFact('Lifespan', launch && product.discontinued && product.discontinued_date ? lifespanText(launch, product.discontinued_date) : null),
    keyFact('Releases recorded', sortedDates.length > 1 ? String(sortedDates.length) : null),
  ].filter(Boolean).slice(0, isEndOfLine(product, allProducts) ? 5 : 6)
    // The last of its line always gets a tile, in the grid's last place.
    .concat(isEndOfLine(product, allProducts) ? [`<div class="key-fact key-fact--end"><p class="key-fact-label">End of the line</p><p class="key-fact-value">The last ${escapeHtml(product.category || 'of its line')}</p></div>`] : [])
    .join('\n');

  const specs = [
    specRow('Category', categoryPill(product.category)),
    specRow('Status', product.discontinued ? 'Discontinued' : 'Current'),
    product.discontinued ? specRow('Apple support status', appleSupportStatus(product)) : '',
    sortedDates.length ? specRow('Release type', product.is_new_launch ? 'All-new product' : 'Refresh of an existing model') : '',
    daysInfo && daysInfo.days >= 0 ? specRow('Days counted from', `${plural(daysInfo.days, 'day', 'days')} (${product.days_basis === 'launch' ? 'first release' : 'latest release'})`) : '',
    specRow('Chip', escapeHtml(product.chip)),
    specRow('Previous model', previousModelHtml),
    specRow('Replaced by', replacedByHtml),
    product.discontinued ? specRow('Why it went', escapeHtml(product.discontinued_reason)) : '',
    appleLinkRow('Official Apple page', product, 'apple_url', 'apple.com', 'No longer available on Apple\u2019s website', productsBySlug),
    appleLinkRow('Tech specs', product, 'specs_url', 'Apple specs', 'No longer available from Apple', productsBySlug),
    video && video.kind === 'link' ? specRow('Video', `<a href="${escapeHtml(video.src)}" target="_blank" rel="noopener">Watch on ${escapeHtml(video.host)} &#8599;</a>`) : '',
    product.press_release_url ? specRow('Press release', `<a href="${product.press_release_url}" target="_blank" rel="noopener">Apple Newsroom &#8599;</a>`) : '',
    product.external_link ? specRow('More information', `<a href="${product.external_link}" target="_blank" rel="noopener">${escapeHtml(externalLinkLabel(product))} &#8599;</a>`) : '',
    product.discontinued ? '' : specRow('Waiting for a refresh', `<span class="wait-count-value">${product.waiting_count || 0}</span> ${(product.waiting_count || 0) === 1 ? 'person' : 'people'}`),
  ].filter(Boolean).join('\n');

  // Named after what the timeline shows: the family, or the product's own
  // line when it is set to show that alone.
  const releaseHistorySection = timelinePoints.length
    ? `<h2>${releaseHistoryHeading(product.timeline_name || product.category)}</h2>
  ${timelineHtml}`
    : '';

  const body = `
<article class="product-page">
  ${breadcrumbsHtml([
    { label: 'Home', href: '/' },
    { label: product.category || 'Products', href: `/categories/${slugify(product.category || 'other')}/` },
    { label: product.name },
  ])}
  <div class="product-top${videoBlock ? ' product-top--video' : ' product-top--no-media'}">
    ${videoBlock ? `<div class="product-media">
      ${videoBlock}
    </div>` : ''}
    <div class="product-info">
      <div class="product-header">
        <div>
          <div class="product-title-row" data-category="${escapeHtml(product.category || '')}">
            <span class="product-title-icon">${productIcon(product, 40)}</span>
            <h1>${escapeHtml(product.name)}</h1>
          </div>
        </div>
        <div class="admin-tools">
          <a class="admin-edit-link" data-admin-href="/admin/?edit=${product.slug}" data-admin-label="Edit this product" style="display:none;"></a>
          <button type="button" class="admin-edit-link tweet-btn" data-slug="${product.slug}" style="display:none;" data-admin-label="Draft a post for X"></button>
        </div>
      </div>

      <div class="product-facts">${heroStatHtml(product, status, cycle)}
        <div class="key-facts-row" data-facts="${(keyFacts.match(/key-fact-label/g) || []).length}">${keyFacts}</div>
      </div>


      ${product.did_you_know ? `<aside class="did-you-know"><p class="did-you-know-label">Did you know?</p><div class="did-you-know-text">${sanitizeRichText(product.did_you_know, siteUrl)}</div>${product.did_you_know_date ? `<p class="did-you-know-date">As of ${formatDate(String(product.did_you_know_date).slice(0, 7))}</p>` : ''}</aside>` : ''}

      <dl class="spec-list spec-list--secondary">
        ${specs}
      </dl>

      ${product.discontinued ? '' : `<button class="wait-btn wait-btn--large" data-product-id="${product.id}" data-slug="${product.slug}" data-count="${product.waiting_count || 0}">
        Are you looking forward to a new ${escapeHtml(product.category)}?
      </button>`}
    </div>
  </div>

  ${product.rumor_note ? `<div class="callout"><p class="callout-label">Notes</p><div class="callout-body">${sanitizeRichText(product.rumor_note, siteUrl)}</div></div>` : ''}

  ${relatedProductsHtml(product, productsBySlug, statusBySlug, !!releaseHistorySection)}

  ${releaseHistorySection ? `<div id="release-history" class="category-timeline-section">${releaseHistorySection}</div>` : ''}

  ${timelineCoversOnlyThisProduct ? '' : generationsSectionHtml(product)}

  ${relatedPhotos.length ? `<h2>From the gallery</h2>
  <div class="gallery-strip">
    ${relatedPhotos.map(galleryStripItemHtml).join('\n')}
  </div>` : ''}

  <p class="report-line"><a class="report-link" href="/contact/?topic=Correction&amp;page=${encodeURIComponent(product.name)}&amp;url=${encodeURIComponent(`/products/${product.slug}/`)}">Something not right on this page? Tell us</a></p>
</article>`;

  const comingOn = status && status.daysSince < 0 ? (product.refresh_history || []).slice().sort().pop() : null;
  const description = product.discontinued
    ? `${product.name} was discontinued${product.discontinued_date ? ` in ${formatDate(product.discontinued_date)}` : ''}${launch ? `, after launching in ${formatDate(launch)}` : ''}.${successor ? ` It was replaced by the ${successor.name}.` : ''}`
    : comingOn
    ? `${product.name} is coming ${formatDate(comingOn)}. See every generation and the full release history.`
    : status
    ? `${product.name} was last refreshed ${plural(status.daysSince, 'day', 'days')} ago. See every generation and the full release history.`
    : `${product.name} on Apple Sunset.`;

  return shell({
    title: product.discontinued
      ? `${product.name}: discontinued${product.discontinued_date ? ' ' + formatDate(product.discontinued_date) : ''} | Apple Sunset`
      : comingOn
      ? `${product.name}: coming ${formatDate(comingOn)} | Apple Sunset`
      : status
      ? `${product.name}: ${plural(daysInfo ? daysInfo.days : status.daysSince, 'day', 'days')} since the last update | Apple Sunset`
      : `${product.name} | Apple Sunset`,
    description,
    ogImage,
    siteUrl,
    path: `/products/${product.slug}/`,
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
    extraJsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        // A WebPage about the product, not a Product item: Google treats
        // Product as something for sale and flags it in Search Console
        // without a price offer or reviews, which a tracker doesn't have.
        {
          '@type': 'WebPage',
          name: `${product.name} release history`,
          url: `${siteUrl}/products/${product.slug}/`,
          about: { '@type': 'Thing', name: product.name, description: `${product.name} by Apple, ${product.category} line` },
          dateModified: [product.discontinued && product.discontinued_date, ...(product.refresh_history || [])].filter((d) => d && d <= new Date().toISOString().slice(0, 10)).sort().pop() || undefined,
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'All products', item: `${siteUrl}/products/` },
            { '@type': 'ListItem', position: 2, name: product.category, item: `${siteUrl}/categories/${slugify(product.category)}/` },
            { '@type': 'ListItem', position: 3, name: product.name, item: `${siteUrl}/products/${product.slug}/` },
          ],
        },
      ],
    },
  });
}

// The About page's own numbers, worked out at each build (the site
// rebuilds daily). Deliberately not the homepage's "at a glance" counts,
// so the page says something the homepage doesn't.
function aboutCounts({ products, events, photos }) {
  const today = new Date().toISOString().slice(0, 10);
  const list = products || [];
  const past = list.flatMap((p) => releaseDates(p).filter((d) => d <= today));
  return {
    families: new Set(list.map((p) => p.category).filter(Boolean)).size,
    releases: past.length,
    since: past.length ? past.slice().sort()[0].slice(0, 4) : '',
    discontinued: list.filter((p) => p.discontinued).length,
    events: (events || []).length,
    photos: (photos || []).length,
    asOf: formatDate(today),
  };
}

function aboutGuideHtml(c) {
  const stat = (href, num, label, sub) => `<a class="about-stat" href="${href}"><span class="about-stat-num">${num}</span><span class="about-stat-label">${label}</span>${sub ? `<span class="about-stat-sub">${sub}</span>` : ''}</a>`;
  const stats = [
    c.families ? stat('/categories/', c.families, c.families === 1 ? 'product family' : 'product families') : '',
    c.releases ? stat('/products/', c.releases, c.releases === 1 ? 'release recorded' : 'releases recorded', c.since ? `going back to ${c.since}` : '') : '',
    c.discontinued ? stat('/discontinued/', c.discontinued, c.discontinued === 1 ? 'discontinued product archived' : 'discontinued products archived') : '',
    c.events ? stat('/events/', c.events, c.events === 1 ? 'Apple Event' : 'Apple Events', 'and what each announced') : '',
    c.photos ? stat('/gallery/', c.photos, c.photos === 1 ? 'gallery photo' : 'gallery photos') : '',
  ].filter(Boolean).join('\n    ');
  return `<section class="about-section">
  <h2>What&rsquo;s on Apple Sunset</h2>
  ${stats ? `<div class="about-stats">
    ${stats}
  </div>
  <p class="about-asof">Counts as of ${escapeHtml(c.asOf)}, updated every day.</p>` : ''}
</section>
<section class="about-section">
  <h2>How to read the numbers</h2>
  <dl class="about-guide">
    <dt>Days since refresh</dt>
    <dd>How long it has been since Apple last released a new version of a product, counted from its most recent release date.</dd>
    <dt>The usual wait</dt>
    <dd>The average gap between a product&rsquo;s past releases, shown once it has at least two. &ldquo;1.2&times; the usual wait&rdquo; means this wait is already 20% longer than its average.</dd>
    <dt>The colours</dt>
    <dd>Each product is measured against its own usual wait, not a fixed number of days: <span class="badge badge--fresh">green</span> for under half of it, <span class="badge badge--aging">amber</span> from half to the full wait, and <span class="badge badge--overdue">red</span> once it has gone past it. A product with only one release so far is measured against a typical gap for its family.</dd>
    <dt>Release history</dt>
    <dd>Every recorded release of a product and its family, on a timeline on each product and family page.</dd>
    <dt>Discontinued</dt>
    <dd>Products Apple no longer sells stay on the site in a searchable archive, with their full release history.</dd>
  </dl>
  <p class="about-contact">Spotted something wrong or missing? <a href="/contact/">Get in touch</a>.</p>
</section>`;
}

function aboutPage({ content, counts, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const paragraphs = (content.body || '')
    .split('\n\n')
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');
  const c = counts || {};

  const body = `
<article class="about-page">
  <h1>${escapeHtml(content.heading || 'About Apple Sunset')}</h1>
  ${content.image_url ? `<div class="about-image">${cdnImgHtml(content.image_url, 1200, ' alt=""')}</div>` : ''}
  <div class="about-body">${paragraphs}</div>
  ${aboutGuideHtml(c)}
</article>`;

  return shell({
    title: 'About — Apple Sunset',
    description: c.families && c.releases
      ? `About Apple Sunset: ${c.families} Apple product families and ${c.releases} releases${c.since ? ` since ${c.since}` : ''}, and how to read its numbers: days since refresh, the usual wait and the colours.`
      : 'About Apple Sunset, and how to read its numbers: days since refresh, the usual wait and the colours.',
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
    <input type="text" id="${prefix}_text" class="date-precision-text" placeholder="e.g. 15 Oct 2024 or 15/10/2024" autocomplete="off" spellcheck="false" aria-describedby="${prefix}_echo">
    <span class="date-precision-picker" id="${prefix}_picker">
      <input type="date" id="${prefix}_day" class="date-precision-input" autocomplete="off" tabindex="-1" aria-hidden="true">
      <button type="button" class="date-precision-calendar" data-prefix="${prefix}" aria-label="Choose ${label.toLowerCase()} from a calendar" title="Choose from a calendar"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2"/><line x1="3" y1="8.5" x2="17" y2="8.5"/><line x1="7" y1="2.5" x2="7" y2="6"/><line x1="13" y1="2.5" x2="13" y2="6"/></svg></button>
    </span>
    <input type="month" id="${prefix}_month" class="date-precision-input" style="display:none;">
    <input type="number" id="${prefix}_year" class="date-precision-input" style="display:none;" placeholder="YYYY" min="1970" max="2035" autocomplete="off">
    <button type="button" class="date-precision-clear" data-prefix="${prefix}">Clear</button>
  </div>
  <p class="date-precision-echo" id="${prefix}_echo" aria-live="polite"></p>
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
      <button type="button" class="admin-tab-btn" data-tab="families">Families</button>
      <button type="button" class="admin-tab-btn" data-tab="gallery">Gallery</button>
      <button type="button" class="admin-tab-btn" data-tab="event">Apple Event</button>
      <button type="button" class="admin-tab-btn" data-tab="earnings">Earnings</button>
      <button type="button" class="admin-tab-btn" data-tab="facts">Facts</button>
      <button type="button" class="admin-tab-btn" data-tab="x">X posts</button>
      <button type="button" class="admin-tab-btn" data-tab="pagetext">Page text</button>
      <button type="button" class="admin-tab-btn" data-tab="about">About page</button>
    </div>
    <div class="admin-topbar-actions">
      <button type="button" id="publish-btn" class="admin-btn admin-btn--primary">Publish changes</button>
      <button id="logout-btn" class="admin-btn">Log out</button>
    </div>
  </div>
  <p id="publish-status" class="admin-hint admin-publish-status"></p>

  <div id="tab-products" class="admin-tab-panel">
    <div class="admin-search-bar">
      <button type="button" id="admin-home-btn" class="admin-btn admin-btn--ghost admin-search-bar-btn" title="Back to the start: every family" aria-label="Admin home">&#8962;<span class="admin-search-bar-btn-text"> Home</span></button>
      <input type="search" id="product-search-input" class="admin-search-input" placeholder="Search every product by name…" aria-label="Search products" autocomplete="off">
      <button type="button" id="admin-new-btn" class="admin-btn admin-btn--primary admin-search-bar-btn" title="Add a new product (in the family you are in)" aria-label="New product">+<span class="admin-search-bar-btn-text"> New product</span></button>
    </div>
    <div id="search-screen" style="display:none;">
      <div id="search-results" class="line-card-grid"></div>
    </div>
    <div id="product-list-view">
      <div id="retire-check" class="retire-check" hidden></div>
      <div id="homepage-strip" class="homepage-strip" hidden></div>
      <div id="family-screen">
        <h2 class="admin-screen-title"><span class="admin-step-num">1</span> Pick a family</h2>
        <div id="family-tiles" class="family-tiles" aria-label="Families"></div>
      </div>
      <div id="products-screen" style="display:none;">
        <button type="button" id="back-to-families-btn" class="admin-back-link">&larr; All families</button>
        <h2 class="admin-screen-title"><span class="admin-step-num">2</span> Pick a product <span id="products-screen-family" class="admin-screen-family"></span></h2>
        <div class="admin-sort-row" role="group" aria-label="Sort products">
          <span class="admin-sort-label">Sort</span>
          <button type="button" class="admin-sort-btn" data-product-sort="newest">Newest</button>
          <button type="button" class="admin-sort-btn" data-product-sort="oldest">Oldest</button>
          <button type="button" class="admin-sort-btn" data-product-sort="added">Recently added</button>
          <button type="button" class="admin-sort-btn" data-product-sort="name">A&ndash;Z</button>
        </div>
        <p id="line-ended-note" class="admin-line-ended" hidden></p>
        <div id="product-list" class="line-card-grid"></div>
      </div>
      <button type="button" id="new-product-btn" hidden></button>
    </div>

    <div id="product-form-view" style="display:none;">
      <button type="button" id="back-to-list-btn" class="admin-back-link">&larr; Back to products</button>
      <h2 id="form-title" class="admin-form-title">New product line</h2>
      <form id="product-form" class="admin-form admin-form--steps" novalidate autocomplete="off">

        <section class="admin-step" id="step-family">
          <h3 class="admin-step-title"><span class="admin-step-num">1</span> Family</h3>
          <div id="family-picker" class="family-picker" role="radiogroup" aria-label="Family"></div>
          <div id="new-family-wrap" class="admin-subfield" style="display:none;">
            <label>New family name<input type="text" id="category" placeholder="e.g. Vision Pro" autocomplete="off"></label>
          </div>
          <div class="admin-subfield">
            <span class="admin-subfield-label">Family icon <span class="admin-optional">Optional</span></span>
            <div class="admin-icon-row">
              <div id="category-icon-thumb" class="admin-thumbs"></div>
              <label for="category-icon-upload" class="admin-btn admin-btn--small admin-btn--primary">Upload family icon</label>
              <input type="file" id="category-icon-upload" accept="image/*" class="admin-file-input">
              <button type="button" class="admin-btn admin-btn--small admin-btn--ghost" data-icon-library="category">Choose from library</button>
              <button type="button" id="category-icon-removebg" class="admin-btn admin-btn--small admin-btn--ghost" style="display:none">Remove background</button>
            </div>
            <p class="admin-hint">Replaces the built-in shape for every product in this family.</p>
          </div>
          <p id="family-error" class="form-error"></p>
        </section>

        <section class="admin-step" id="step-line">
          <h3 class="admin-step-title"><span class="admin-step-num">2</span> Product</h3>
          <label>Name<input type="text" id="name" placeholder="e.g. AirPods Pro" autocomplete="off"></label>
          <p id="name-error" class="form-error"></p>
          <label class="admin-feature-slot">&#9733; Feature on the homepage
            <select id="featured_slot">
              <option value="0">Not featured</option>
              <option value="1">Slot 1 (big tile)</option>
              <option value="2">Slot 2</option>
              <option value="3">Slot 3</option>
            </select>
          </label>
          <div id="in-countdown-wrap" class="admin-countdown-option" style="display:none;">
            <label class="checkbox-label"><input type="checkbox" id="in_countdown"> &#9201; Show in the homepage countdown</label>
            <p class="admin-hint">Only for a product whose release date is still ahead. More than one can be counted down at once, and each drops off by itself once its date passes.</p>
          </div>
          <p class="admin-hint">The featured products take turns in the big homepage tile, a different one on each visit. A featured Apple Event takes the big tile.</p>
          <div class="admin-subfield">
            <span class="admin-subfield-label">Icon for this product <span class="admin-optional">Optional</span></span>
            <div class="admin-icon-row">
              <div id="product-icon-thumb" class="admin-thumbs"></div>
              <label for="product-icon-upload" class="admin-btn admin-btn--small admin-btn--primary">Upload icon</label>
              <input type="file" id="product-icon-upload" accept="image/*" class="admin-file-input">
              <button type="button" class="admin-btn admin-btn--small admin-btn--ghost" data-icon-library="product">Choose from library</button>
              <button type="button" id="product-icon-removebg" class="admin-btn admin-btn--small admin-btn--ghost" style="display:none">Remove background</button>
              <label class="checkbox-label icon-autobg"><input type="checkbox" id="icon-auto-removebg"> Remove the background automatically when I upload an icon</label>
            </div>
            <p class="admin-hint">Leave blank to use the family icon.</p>
          </div>
          <div class="admin-subfield">
            <span class="admin-subfield-label">Release history on this product&rsquo;s page</span>
            <div class="choice-cards" role="radiogroup" aria-label="Release history shown">
              <label class="choice-card">
                <input type="radio" name="timeline_mode" value="own" checked>
                <span class="choice-card-body">
                  <span class="choice-card-title">This product only</span>
                  <span class="choice-card-note" id="timeline-own-example">Shows the dates below and nothing else.</span>
                </span>
              </label>
              <label class="choice-card">
                <input type="radio" name="timeline_mode" value="family">
                <span class="choice-card-body">
                  <span class="choice-card-title">Everything in this family</span>
                  <span class="choice-card-note" id="timeline-family-example">Shows the dates below plus the other products in this family.</span>
                </span>
              </label>
            </div>
            <p class="admin-hint" id="timeline-group-note" style="display:none;"></p>
          </div>

          <div class="admin-subfield">
            <span class="admin-subfield-label">Launch price <span class="admin-optional">Optional, the price this version launched at</span></span>
            <div class="price-currency-row">
              <div class="segmented segmented--small" role="radiogroup" aria-label="Currency">
                <label><input type="radio" name="price_currency" value="&pound;"><span>&pound;</span></label>
                <label><input type="radio" name="price_currency" value="$" checked><span>$</span></label>
              </div>
              <input type="text" id="price" placeholder="799" inputmode="decimal" autocomplete="off">
            </div>
          </div>

          <div class="admin-subfield">
            <span class="admin-subfield-label">Did you know? <span class="admin-optional">Optional, shown near the top of the product page</span></span>
            <div class="richtext-toolbar">
              <button type="button" data-editor="did_you_know_editor" data-cmd="bold"><b>B</b></button>
              <button type="button" data-editor="did_you_know_editor" data-cmd="italic"><i>I</i></button>
              <button type="button" data-editor="did_you_know_editor" data-cmd="underline"><u>U</u></button>
              <button type="button" data-editor="did_you_know_editor" data-cmd="insertParagraph">&para;</button>
              <button type="button" data-link-for="did_you_know_editor">&#128279;</button>
              <button type="button" data-editor="did_you_know_editor" data-cmd="removeFormat" class="richtext-clear">&times;</button>
              <button type="button" id="did-you-know-clear-all-btn" class="richtext-clear-all">Clear all formatting</button>
            </div>
            <div id="did_you_know_editor" class="richtext-editor richtext-editor--short" contenteditable="true" data-placeholder="One short, surprising fact about this product."></div>
            <div class="fact-meta-row">
              <p class="admin-hint" id="did-you-know-count"></p>
              <label class="fact-asof" title="Shown under the fact as &ldquo;As of&rdquo; month and year. Set to today whenever the fact changes.">As of <input type="date" id="did_you_know_date" aria-label="As of date for this fact"></label>
            </div>
            <p class="admin-hint" id="did-you-know-date-note" hidden>The &ldquo;As of&rdquo; date isn&rsquo;t switched on yet, so it won&rsquo;t be saved. Run <code>supabase-schema-update-28.sql</code> in the Supabase SQL editor, then reload this page.</p>
            <details class="fact-helper">
              <summary>Help me write one</summary>
              <button type="button" id="fact-suggest-btn" class="admin-btn admin-btn--small admin-btn--ghost">Suggest 3 from its dates</button>
              <div id="fact-suggestions" class="fact-suggestions"></div>
              <div class="fact-research">
                <input type="text" id="fact-seed" placeholder="Or an idea for Claude, e.g. its battery or the name" autocomplete="off" aria-label="Idea for a fact">
                <button type="button" id="fact-research-btn" class="admin-btn admin-btn--small">Research with Claude</button>
              </div>
              <p class="admin-hint" id="fact-helper-note">Claude finds 3 checked facts (free in the Claude app); paste the one you like into the box above.</p>
            </details>
          </div>

          <div class="admin-subfield">
            <span class="admin-subfield-label">Notes <span class="admin-optional">Optional, shown on the product page</span></span>
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
            <details class="fact-helper">
              <summary>Help me write them</summary>
              <div class="fact-research">
                <input type="text" id="notes-seed" placeholder="Optional focus, e.g. what changed from the last model" autocomplete="off" aria-label="What the notes should focus on">
                <button type="button" id="notes-research-btn" class="admin-btn admin-btn--small">Research notes with Claude</button>
              </div>
              <p class="admin-hint" id="notes-helper-note">Claude drafts short notes with every point checked against two sources, and lists them so you can check too. Paste into the box above, edit, then save.</p>
            </details>
          </div>
        </section>

        <section class="admin-step" id="step-generations">
          <h3 class="admin-step-title"><span class="admin-step-num">3</span> Dates</h3>
          <p class="admin-hint">Every release or refresh, plus the day it was discontinued if it has been. The earliest one is marked as its first release automatically.</p>
          <ul id="refresh-history-list" class="generation-list"></ul>
          <div class="generation-add" id="generation-add-panel">
            <p class="generation-add-title">Add a date</p>
            <div class="segmented segmented--type" role="radiogroup" aria-label="Type of date">
              <label><input type="radio" name="entry_type" value="launch"><span>Launch</span></label>
              <label><input type="radio" name="entry_type" value="release" checked><span>Release</span></label>
              <label><input type="radio" name="entry_type" value="announced"><span>Announced</span></label>
              <label><input type="radio" name="entry_type" value="preorder"><span>Pre-order</span></label>
              <label><input type="radio" name="entry_type" value="discontinued"><span>Discontinued</span></label>
            </div>
            <div class="generation-add-row">
              ${datePrecisionFieldHtml('new_refresh_date', 'Date')}
              <button type="button" id="add-as-refresh-btn" class="admin-btn admin-btn--primary">+ Add</button>
            </div>
            <div class="admin-subfield" id="generation-name-field">
              <label><span class="admin-label-row">Name of this version <span class="admin-optional">Optional, leave blank to use the suggestion</span></span><input type="text" id="new_generation_name" autocomplete="off"></label>
            </div>
            <div class="admin-subfield" id="announced-target-field" style="display:none;">
              <label><span id="announced-target-label">Which release was this the announcement for?</span><select id="announced_target"></select></label>
            </div>
            <p class="admin-hint" id="announced-pending-note" style="display:none;">No release date yet, so this announcement will be held and attached to the first release you add.</p>
            <p id="generation-add-error" class="form-error"></p>
          </div>
          <div class="admin-subfield" id="days-basis-wrap">
            <span class="admin-subfield-label">The big number on this product counts days since</span>
            <div class="segmented segmented--small" role="radiogroup" aria-label="Badge basis">
              <label><input type="radio" name="days_basis" id="days_basis_refresh" value="refresh" checked><span>Latest date</span></label>
              <label><input type="radio" name="days_basis" id="days_basis_launch" value="launch"><span>First launch</span></label>
            </div>
          </div>
        </section>

        <section class="admin-step" id="step-status">
          <h3 class="admin-step-title"><span class="admin-step-num">4</span> Replacement <span class="admin-optional">Optional</span></h3>
          <p class="admin-status-readout" id="status-readout"></p>
          <input type="checkbox" id="discontinued" hidden>
          <p id="discontinued-error" class="form-error"></p>
          <label><span class="admin-label-row">This product replaces <span class="admin-optional">Optional</span></span><select id="previous_model"></select></label>
          <div id="previous-model-choice" class="admin-subfield" style="display:none;">
            <span class="admin-subfield-label">Is that older product still on sale?</span>
            <div class="segmented segmented--small" role="radiogroup" aria-label="Older product status">
              <label><input type="radio" name="previous_model_action" value="keep" checked><span>Still on sale, leave it</span></label>
              <label><input type="radio" name="previous_model_action" value="discontinue"><span>Mark it discontinued</span></label>
            </div>
            <p class="admin-hint">&ldquo;Mark it discontinued&rdquo; sets its discontinued date to the day this product was announced (its release date if no announced date is recorded in step 3) and points it here. A discontinued date already on it is never changed.</p>
          </div>
          <label><span class="admin-label-row">Replaced by <span class="admin-optional">Optional</span></span><select id="replaced_by"></select></label>
          <p class="admin-hint">Setting this also tells the newer product that this one came before it, so there is no need to go and edit that one too. A product can be replaced while still on sale, so this is here whatever its status.</p>
          <div id="replaced-by-choice" class="admin-subfield" style="display:none;">
            <span class="admin-subfield-label">Is this product still on sale?</span>
            <div class="segmented segmented--small" role="radiogroup" aria-label="This product's status">
              <label><input type="radio" name="replaced_by_action" value="keep" checked><span>Still on sale, leave it</span></label>
              <label><input type="radio" name="replaced_by_action" value="discontinue"><span>Retire it</span></label>
            </div>
            <p class="admin-hint" id="replaced-by-choice-hint"></p>
          </div>
          <div id="discontinued-fields" class="admin-discontinued-fields" style="display:none;">
            <label><span class="admin-label-row">Why it went <span class="admin-optional">Optional</span></span><textarea id="discontinued_reason" rows="2"></textarea></label>
            <label class="checkbox-label"><input type="checkbox" id="last_in_line"> <span id="last-in-line-text">The last of its family: Apple ended the line with this one</span></label>
            <p class="admin-hint">The family&rsquo;s page then says the line has ended, rather than counting down to a next model. Only one product per family can be the last, so ticking this unticks any other.</p>
          </div>
        </section>

        <section class="admin-step" id="step-links">
          <h3 class="admin-step-title"><span class="admin-step-num">5</span> Links <span class="admin-optional">All optional</span></h3>
          <p class="admin-hint">Tap a Find button to open a search for this product in a new tab, then paste the address back into the box. Searches are set to Apple's US site. Wikipedia can still fill itself in automatically.</p>
          <label>Apple product page<input type="url" id="apple_url" placeholder="https://www.apple.com/airpods-pro/" autocomplete="off"></label>
          <div><button type="button" class="admin-btn admin-btn--small admin-btn--ghost" data-find-link="apple">Find on apple.com</button></div>
          <label class="checkbox-label"><input type="checkbox" id="apple_url_unavailable"> Apple has taken this page down</label>
          <label>Apple specs page<input type="url" id="specs_url" placeholder="https://support.apple.com/en-us/111854" autocomplete="off"></label>
          <div><button type="button" class="admin-btn admin-btn--small admin-btn--ghost" data-find-link="specs">Find tech specs</button></div>
          <label class="checkbox-label"><input type="checkbox" id="specs_url_unavailable"> Apple no longer has a specs page for this</label>
          <p class="admin-hint">To remove a link, empty its box. On a discontinued product, a link that a current product also uses (Apple reused the address for the newer model) is swapped automatically for a link to that newer model.</p>
          <label>Wikipedia page<input type="url" id="external_link" placeholder="https://en.wikipedia.org/wiki/AirPods" autocomplete="off"></label>
          <div>
            <button type="button" class="admin-btn admin-btn--small admin-btn--ghost" data-find-link="wikipedia">Find on Wikipedia</button>
            <button type="button" class="admin-btn admin-btn--small admin-btn--primary" id="wikipedia-auto-btn">Fill automatically</button>
          </div>
          <p class="admin-hint" id="wikipedia-auto-status"></p>
          <label>Press release<input type="url" id="press_release_url" placeholder="https://www.apple.com/newsroom/..." autocomplete="off"></label>
          <div><button type="button" class="admin-btn admin-btn--small admin-btn--ghost" data-find-link="newsroom">Find in Apple Newsroom</button></div>
          <p class="admin-hint">Press releases usually only exist for recent products. Leave it blank otherwise.</p>
        </section>

        <section class="admin-step" id="step-extras">
          <h3 class="admin-step-title"><span class="admin-step-num">6</span> Video <span class="admin-optional">Optional</span></h3>
          <div id="video-status" class="admin-video-status">No video yet.</div>
          <div>
            <label for="video-upload" class="admin-btn admin-btn--small admin-btn--primary">Upload a video</label>
            <input type="file" id="video-upload" accept="video/*" class="admin-file-input">
          </div>
          <label>Or link to a video<input type="url" id="video_link" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off"></label>
          <p class="admin-hint">YouTube and Vimeo play right on the product page. A link anywhere else shows as &ldquo;Watch on &hellip;&rdquo; in the details.</p>
          <p id="video-error" class="form-error"></p>
          <label class="checkbox-label"><input type="checkbox" id="is_new_launch"> This is a brand new product, not a refresh of an existing line</label>
        </section>

        <div class="admin-save-bar">
          <button type="submit" id="save-product-btn" class="admin-btn admin-btn--primary">Save product</button>
          <button type="button" id="cancel-product-btn" class="admin-btn admin-btn--ghost">Cancel</button>
          <button type="button" id="delete-product-btn" class="admin-btn admin-btn--danger" style="display:none;">Delete</button>
        </div>
      </form>
    </div>
  </div>

  <div id="tab-families" class="admin-tab-panel" style="display:none;">
    <h2>Product families</h2>
    <p class="admin-hint">Every family on the site, with the icon used on cards and category pages. Families come from the products you have added, so a family appears here once at least one product uses it.</p>
    <div id="family-admin-list" class="family-admin-list">Loading families...</div>
  </div>

  <div id="tab-gallery" class="admin-tab-panel" style="display:none;">
    <div id="gallery-list-view">
      <button id="new-photo-btn" class="admin-btn admin-btn--primary">Add new photo</button>
      <div id="gallery-speed" class="gallery-speed" hidden>
        <p id="gallery-speed-text"></p>
        <button type="button" id="gallery-speed-btn" class="admin-btn">Make quick-loading copies</button>
      </div>
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

        <label>Caption (optional)<input type="text" id="gallery-caption" placeholder="e.g. iPhone 17 Pro in Cosmic Orange" autocomplete="off"></label>
        <label>Story (optional)<textarea id="gallery-story" rows="3" maxlength="300" placeholder="e.g. Taken at a very busy Apple Store in Cardiff the day after the iPhone Duo launch."></textarea></label>
        <p class="admin-hint">A few lines of context, shown in full on the album&rsquo;s page and in Google results. Gallery tiles show its first sentence or two, never cut off mid-sentence. Up to 300 characters.</p>

        ${datePrecisionFieldHtml('gallery_date_taken', 'Date taken')}

        <label>Location
          <input type="text" id="gallery-location" list="gallery-location-options" placeholder="e.g. Cardiff" autocomplete="off">
          <datalist id="gallery-location-options"></datalist>
        </label>

        <label>Country
          <input type="text" id="gallery-country" list="gallery-country-options" placeholder="e.g. United Kingdom" autocomplete="off">
          <datalist id="gallery-country-options"></datalist>
        </label>

        <div class="admin-subfield">
          <span class="admin-subfield-label">Tags</span>
          <ul id="gallery-tags-list" class="refresh-history-list"></ul>
          <div class="refresh-history-add">
            <input type="text" id="new-gallery-tag" placeholder="e.g. iPhone 17, Space Grey" autocomplete="off">
            <button type="button" id="add-gallery-tag-btn" class="admin-btn admin-btn--small">Add tag</button>
          </div>
        </div>

        <button type="submit" class="admin-btn admin-btn--primary">Save photo</button>
      </form>
    </div>
  </div>

  <div id="tab-event" class="admin-tab-panel" style="display:none;">
    <p class="admin-hint">The next event takes the big tile on the homepage on its own: it counts down to the start, shows <strong>Live now</strong> with a Watch live button while it&rsquo;s on, then <strong>Just announced</strong> with the products you add here, linking to the event&rsquo;s page, for 48 hours after it starts. Then the featured products come back. Nothing to remove by hand. Saving here updates the site in about a minute.</p>
    <p class="admin-hint" id="event-status" aria-live="polite"></p>
    <div id="event-list-view">
      <button id="new-event-btn" class="admin-btn admin-btn--primary">Add new event</button>
      <div id="event-list" class="admin-list"></div>
    </div>

    <div id="event-form-view" style="display:none;">
      <button type="button" id="event-back-to-list-btn" class="admin-back-link">&larr; Back to events</button>
      <h3 id="event-form-title">Add event</h3>
      <form id="event-form" class="admin-form">
        <label>Title<input type="text" id="event_heading" placeholder="e.g. Apple Event: It's Glowtime" autocomplete="off"></label>
        <div class="admin-subfield">
          <span class="admin-subfield-label">Image</span>
          <div id="event-image-thumb" class="admin-thumbs"></div>
          <label for="event-image-upload" class="admin-btn admin-btn--small admin-btn--primary">Choose image</label>
          <input type="file" id="event-image-upload" accept="image/*" class="admin-file-input">
        </div>
        <input type="hidden" id="event_image_url">
        <label>Event date<input type="date" id="event_date" autocomplete="off"></label>
        <label class="checkbox-label"><input type="checkbox" id="event_featured"> &#9733; Feature this event on the homepage</label>
        <p class="admin-hint">Only needed if two events overlap: a featured one goes first. Either way an event leaves the homepage 48 hours after it starts.</p>
        <label>Event time, with its time zone, e.g. "10am PT" (the countdown and the UK time are worked out from it; with no time, 10am PT is assumed)<input type="text" id="event_time" placeholder="10am PT" autocomplete="off"></label>
        <label>Link to Apple's event page (optional)<input type="url" id="event_url" placeholder="https://www.apple.com/apple-events/" autocomplete="off"></label>
        <p class="admin-hint">Add it when there's a live stream: the homepage then shows <strong>Watch live</strong> while it's on. Leave it empty when there's nothing to watch (news by press release).</p>
        <div class="admin-subfield">
          <span class="admin-subfield-label">Summary <span class="admin-optional">Optional, a line or two on what happened, shown on the event page and in Google results</span></span>
          <div class="richtext-toolbar">
            <button type="button" data-editor="event_summary_editor" data-cmd="bold" aria-label="Bold"><b>B</b></button>
            <button type="button" data-editor="event_summary_editor" data-cmd="italic" aria-label="Italic"><i>I</i></button>
            <button type="button" data-editor="event_summary_editor" data-cmd="underline" aria-label="Underline"><u>U</u></button>
            <button type="button" data-editor="event_summary_editor" data-cmd="insertParagraph" aria-label="New paragraph">&para;</button>
            <button type="button" data-link-for="event_summary_editor" aria-label="Add a link">&#128279;</button>
            <button type="button" data-editor="event_summary_editor" data-cmd="removeFormat" class="richtext-clear" aria-label="Remove formatting from the selection">&times;</button>
            <button type="button" id="event-summary-clear-all-btn" class="richtext-clear-all">Clear all formatting</button>
          </div>
          <div id="event_summary_editor" class="richtext-editor richtext-editor--short" contenteditable="true" data-placeholder="e.g. Apple unveiled iPhone 18 Pro with a new camera system, alongside Apple Watch Series 12."></div>
          <p class="admin-hint" id="event-summary-count"></p>
        </div>
        <div class="admin-subfield">
          <span class="admin-subfield-label">Announced products (optional, add once you know what was revealed)</span>
          <ul id="event-products-list" class="refresh-history-list"></ul>
          <div class="refresh-history-add">
            <input type="text" id="new-event-product" placeholder="e.g. iPhone 17, Apple Watch Series 11" autocomplete="off">
            <button type="button" id="add-event-product-btn" class="admin-btn admin-btn--small">Add</button>
          </div>
        </div>
        <button type="submit" class="admin-btn admin-btn--primary">Save event</button>
      </form>
    </div>
  </div>


  <div id="tab-earnings" class="admin-tab-panel" style="display:none;">
    <p class="admin-hint">Apple&rsquo;s quarterly results. The next date shows on the homepage under the countdown (or as the countdown when nothing else is coming up) and at the top of the <a href="/earnings/" target="_blank" rel="noopener">Earnings page</a>. After the call, add Apple&rsquo;s press release link and a one-line headline. Saving publishes the site.</p>
    <div id="earnings-list-view">
      <button type="button" id="new-earnings-btn" class="admin-btn admin-btn--primary">Add a quarter</button>
      <div id="earnings-list" class="admin-list"></div>
    </div>
    <div id="earnings-form-view" style="display:none;">
      <button type="button" id="earnings-back-btn" class="admin-back-link">&larr; Back to earnings</button>
      <h3 id="earnings-form-title">Add a quarter</h3>
      <form id="earnings-form" class="admin-form">
        <div class="earnings-form-row">
          <label>Fiscal year<input type="number" id="earn_year" min="2000" max="2100" required></label>
          <label>Quarter<select id="earn_quarter" required><option value="1">Q1 (Oct&ndash;Dec)</option><option value="2">Q2 (Jan&ndash;Mar)</option><option value="3">Q3 (Apr&ndash;Jun)</option><option value="4">Q4 (Jul&ndash;Sep)</option></select></label>
        </div>
        <div class="earnings-form-row">
          <label>Results date<input type="date" id="earn_date" required></label>
          <label>Results time<input type="text" id="earn_time" value="1:30pm PT" autocomplete="off"></label>
          <label>Call time<input type="text" id="earn_call" value="2pm PT" autocomplete="off"></label>
        </div>
        <label>Quarter ended (optional)<input type="date" id="earn_qend"></label>
        <label>Apple&rsquo;s press release link (after the call)<input type="url" id="earn_url" placeholder="https://www.apple.com/newsroom/2026/11/apple-reports-fourth-quarter-results/" autocomplete="off"></label>
        <label>Headline (optional, one line)<input type="text" id="earn_headline" placeholder="e.g. Revenue $112.4bn, up 10%" autocomplete="off"></label>
        <p id="earnings-error" class="form-error"></p>
        <button type="submit" class="admin-btn admin-btn--primary">Save and publish</button>
        <span id="earnings-status" class="admin-hint"></span>
      </form>
    </div>
  </div>

  <div id="tab-x" class="admin-tab-panel" style="display:none;">
    <p class="admin-hint">Posts for the Apple Sunset X account only. Nothing here is saved or shown on the website.</p>

    <section class="x-drafts" id="x-drafts" aria-labelledby="x-drafts-title">
      <div class="x-drafts-head">
        <h3 class="admin-form-section" id="x-drafts-title">Drafts to review</h3>
        <button type="button" id="x-drafts-make" class="admin-btn admin-btn--small">Make drafts now</button>
      </div>
      <p class="admin-hint" id="x-drafts-status">Each morning: posts from your data, and researched ones from Claude, ready to send to Buffer or reject.</p>
      <div id="x-drafts-list" class="x-drafts-list"></div>
    </section>

    <h3 class="admin-form-section">1. Pick an idea, or write one with Claude</h3>
    <div class="x-source-row">
      <button type="button" id="x-ideas-btn" class="admin-btn admin-btn--primary">Ideas from my data</button>
      <span class="admin-hint">On this day, coming soon, longest waits, product facts and site statistics. Tap one to use it.</span>
    </div>
    <div id="x-ideas" class="fact-suggestions"></div>
    <div class="fact-research">
      <input type="text" id="x-topic" placeholder="Or an idea for Claude, e.g. the first iPod, or Apple's oldest product still on sale" autocomplete="off" aria-label="Idea for Claude">
      <button type="button" id="x-claude-btn" class="admin-btn">Write with Claude</button>
    </div>
    <p class="admin-hint" id="x-claude-note">Claude writes 5 posts, each checked against two sources (free in the Claude app). Copy the one you like into the box below.</p>
    <div class="fact-research x-article-row">
      <input type="url" id="x-article" placeholder="Or paste an article link to share, e.g. from MacRumors" autocomplete="off" aria-label="Article link to share">
      <button type="button" id="x-article-btn" class="admin-btn">Share article</button>
    </div>
    <p class="admin-hint" id="x-article-note">Writes the post for you: the headline, credit to the site&rsquo;s X account, and a link straight to the article.</p>
    <p class="admin-hint x-bookmarklet-row">Quicker on a computer: drag <a id="x-bookmarklet" class="x-bookmarklet" href="#">&#8599; Tweet this</a> to your bookmarks bar. Click it on any article and this page opens with the post written.</p>

    <h3 class="admin-form-section">2. Your post</h3>
    <textarea id="x-text" class="x-text" rows="4" placeholder="Write or paste your post here"></textarea>
    <div class="x-options">
      <label class="checkbox-label"><input type="checkbox" id="x-tags" checked> Add hashtags</label>
      <label class="checkbox-label"><input type="checkbox" id="x-link-on"> Add a link</label>
      <input type="text" id="x-link" placeholder="https://applesunset.com/" autocomplete="off" aria-label="Link">
    </div>
    <div class="x-options">
      <label class="checkbox-label"><input type="checkbox" id="x-card-on" checked> Make a card image</label>
      <input type="text" id="x-card-label" value="Did you know?" autocomplete="off" aria-label="Card heading" title="The small line at the top of the card, picked from your post (On this day, Launch day, Did you know?) until you type your own">
    </div>
    <div class="x-card-fields" id="x-card-fields">
      <label for="x-card-title">Card title <span class="admin-hint">optional, above the headline, e.g. iPhone 16</span></label>
      <input type="text" id="x-card-title" autocomplete="off" maxlength="40">
      <label for="x-card-emoji">Card icon <span class="admin-hint">what is this post about? Tap one. The Apple Sunset logo always sits small in the corner.</span></label>
      <select id="x-card-icon" hidden><option value="auto">Automatic</option></select>
      <div class="icon-picker" id="x-card-icon-picker"></div>
      <p class="admin-hint icon-picker-auto" id="x-card-icon-auto"></p>
      <input type="text" id="x-card-emoji" autocomplete="off" maxlength="16" placeholder="Or type or paste any other emoji" aria-label="Any other emoji for the card">
      <label for="x-card-headline">Card headline <span class="admin-hint">the large text: a figure like 1,433 days or 2014, or a short headline (it wraps onto two lines). Leave empty for none.</span></label>
      <input type="text" id="x-card-headline" autocomplete="off" maxlength="60">
      <label for="x-card-line">Card line <span class="admin-hint">the smaller text below it. Press Return for a new line, e.g. to make a list; each line starts on its own.</span></label>
      <textarea id="x-card-line" rows="4"></textarea>
      <label for="x-card-source">Card source <span class="admin-hint">small text at the bottom, e.g. Source: 9to5Mac. Filled in for you when you share an article.</span></label>
      <input type="text" id="x-card-source" autocomplete="off" maxlength="60">
      <p id="x-card-note" class="admin-hint x-card-note" hidden></p>
    </div>
    <div class="x-preview-head">
      <p class="admin-hint">How it will look on X (you can edit it here):</p>
      <button type="button" id="x-preview-reset" class="admin-btn admin-btn--small" hidden>Reset</button>
    </div>
    <textarea id="x-preview" class="x-preview" rows="6" placeholder="Your post will appear here." aria-label="The post as it will look on X"></textarea>
    <div class="x-emoji-row" id="x-emoji-row"><span class="admin-hint">Add an emoji where the cursor is:</span><button type="button" class="x-emoji" data-emoji="🍎" aria-label="Add 🍎">🍎</button><button type="button" class="x-emoji" data-emoji="📱" aria-label="Add 📱">📱</button><button type="button" class="x-emoji" data-emoji="💻" aria-label="Add 💻">💻</button><button type="button" class="x-emoji" data-emoji="⌚" aria-label="Add ⌚">⌚</button><button type="button" class="x-emoji" data-emoji="🎧" aria-label="Add 🎧">🎧</button><button type="button" class="x-emoji" data-emoji="📅" aria-label="Add 📅">📅</button><button type="button" class="x-emoji" data-emoji="⏳" aria-label="Add ⏳">⏳</button><button type="button" class="x-emoji" data-emoji="🎉" aria-label="Add 🎉">🎉</button><button type="button" class="x-emoji" data-emoji="🔥" aria-label="Add 🔥">🔥</button><button type="button" class="x-emoji" data-emoji="👀" aria-label="Add 👀">👀</button><button type="button" class="x-emoji" data-emoji="🤔" aria-label="Add 🤔">🤔</button><button type="button" class="x-emoji" data-emoji="💯" aria-label="Add 💯">💯</button><button type="button" class="x-emoji" data-emoji="🚀" aria-label="Add 🚀">🚀</button><button type="button" class="x-emoji" data-emoji="✨" aria-label="Add ✨">✨</button><button type="button" class="x-emoji" data-emoji="👇" aria-label="Add 👇">👇</button><span class="admin-hint">(on a Mac, Ctrl + Cmd + Space has them all)</span></div>
    <p id="x-preview-note" class="admin-hint" hidden>Edited by hand, so the boxes above no longer change it. Reset rebuilds it from them.</p>
    <p id="x-count" class="admin-hint"></p>
    <p id="x-link-note" class="admin-hint" hidden></p>
    <img id="x-card" class="x-card" alt="" hidden>
    <div class="x-actions">
      <button type="button" id="x-post-btn" class="admin-btn admin-btn--primary">Post to X</button>
      <button type="button" id="x-buffer-queue-btn" class="admin-btn">Add to Buffer queue</button>
      <button type="button" id="x-buffer-schedule-btn" class="admin-btn">Schedule in Buffer&hellip;</button>
      <button type="button" id="x-copy-btn" class="admin-btn">Copy text</button>
      <button type="button" id="x-card-btn" class="admin-btn" hidden>Download card</button>
      <button type="button" id="x-clear-btn" class="admin-btn">Clear</button>
    </div>
    <div id="x-buffer-when" class="x-buffer-when" hidden>
      <input type="datetime-local" id="x-buffer-at" aria-label="When to post">
      <button type="button" id="x-buffer-at-btn" class="admin-btn admin-btn--primary">Schedule</button>
    </div>
    <p id="x-buffer-note" class="admin-hint" hidden></p>
    <p id="x-over" class="x-over" hidden><span id="x-over-text"></span> <button type="button" id="x-over-tags" class="admin-btn admin-btn--small">Remove the hashtags</button></p>
    <div id="x-after" class="x-after" hidden>
      <p><strong>Your post is open in X.</strong> Once it&rsquo;s posted, what next?</p>
      <div class="x-actions">
        <button type="button" id="x-another-btn" class="admin-btn admin-btn--primary">Write another</button>
        <button type="button" id="x-edit-btn" class="admin-btn">Keep editing this one</button>
        <button type="button" id="x-back-btn" class="admin-btn">Done: back to admin</button>
      </div>
    </div>
    <p class="admin-hint" id="x-note">With a card, it shows under your post on X as the link&rsquo;s preview picture.</p>
    <div class="x-done-row">
      <button type="button" id="x-done-btn" class="admin-btn admin-btn--primary">Done: clear and back to admin</button>
    </div>
  </div>

  <div id="tab-facts" class="admin-tab-panel" style="display:none;">
    <h3 class="admin-form-section">On the homepage</h3>
    <p class="admin-hint">The homepage &ldquo;Did you know?&rdquo; changes every morning, taking turns through every product&rsquo;s own fact, the statistics below and your published facts (skipping the products in the big featured tile). Here&rsquo;s today&rsquo;s and the next few, if nothing changes. Post to X opens it in the X posts tab, ready to send.</p>
    <div id="fact-rotation" class="admin-fact-list">Loading&hellip;</div>

    <h3 class="admin-form-section">Make a fact</h3>
    <p class="admin-hint"><strong>Publish</strong> adds a fact to the Facts page and the homepage rotation. <strong>Post to X only</strong> sends it to the X posts tab without saving it anywhere on the site.</p>
    <p class="admin-hint">Computed from your current product data (release dates, categories, refresh cycles). Only patterns with a reasonable sample size behind them are shown, small datasets won't produce a fact until there's enough to say something real. Regenerate any time you've added more products.</p>
    <button type="button" id="generate-facts-btn" class="admin-btn admin-btn--primary">Generate facts</button>
    <div id="fact-candidates" class="admin-fact-list"></div>

    <h3 class="admin-form-section">Research a fact with Claude</h3>
    <p class="admin-hint">Say what it should be about. Claude opens in a new tab with a request to find little-known facts, check each against two reliable sources, and skip any you've already published. Copy the one you like into the box below.</p>
    <div class="admin-fact-row">
      <input type="text" id="fact-topic" class="admin-fact-textarea" placeholder="e.g. the original iPod" aria-label="What the fact should be about" autocomplete="off">
      <button type="button" id="ask-claude-btn" class="admin-btn admin-btn--small admin-btn--primary">Ask Claude</button>
    </div>
    <p class="admin-hint" id="ask-claude-note"></p>

    <h3 class="admin-form-section">Add your own fact</h3>
    <div class="admin-fact-row">
      <textarea id="own-fact" class="admin-fact-textarea" rows="2" placeholder="Paste or type a fact" aria-label="Your fact"></textarea>
      <button type="button" id="own-fact-btn" class="admin-btn admin-btn--small admin-btn--primary">Publish</button>
      <button type="button" id="own-fact-x-btn" class="admin-btn admin-btn--small">Post to X only</button>
    </div>
    <div class="fact-when-row">
      <label>On the homepage
        <select id="own-fact-when">
          <option value="rotation">Take its turn in the daily rotation</option>
          <option value="today">Show it today</option>
          <option value="date">Show it on a date&hellip;</option>
        </select>
      </label>
      <input type="date" id="own-fact-date" hidden aria-label="Day to show it on the homepage">
    </div>
    <p class="admin-hint" id="own-fact-note"></p>

    <h3 class="admin-form-section">Published facts</h3>
    <div id="published-facts" class="admin-fact-list"></div>
  </div>

  <div id="tab-pagetext" class="admin-tab-panel" style="display:none;">
    <h2 class="admin-screen-title">Page text</h2>
    <p class="admin-hint">Words on the homepage and family pages. This is what Google reads, so a few plain sentences about what the page covers is worth more than anything else you can add.</p>
    <form id="pagetext-form" class="admin-form admin-form--steps">
      <section class="admin-step">
        <h3 class="admin-step-title">Which page?</h3>
        <label>Page<select id="pagetext_target"></select></label>
        <p class="admin-hint" id="pagetext-preview-link"></p>
      </section>

      <section class="admin-step">
        <h3 class="admin-step-title">Heading and first line</h3>
        <label><span class="admin-label-row">Heading <span class="admin-optional">Leave blank to keep the standard one</span></span><input type="text" id="pagetext_heading" autocomplete="off"></label>
        <label><span class="admin-label-row">Line under the heading <span class="admin-optional">Leave blank to keep the standard one</span></span><input type="text" id="pagetext_subheading" autocomplete="off"></label>
        <label class="checkbox-label"><input type="checkbox" id="pagetext_hide_default_line"> Hide that line completely</label>
      </section>

      <section class="admin-step">
        <h3 class="admin-step-title">Intro <span class="admin-optional">Shown under the heading, above the products</span></h3>
        <div class="richtext-toolbar">
          <button type="button" data-cmd="bold" data-editor="pagetext_intro"><b>B</b></button>
          <button type="button" data-cmd="italic" data-editor="pagetext_intro"><i>I</i></button>
          <button type="button" data-cmd="insertParagraph" data-editor="pagetext_intro">&para;</button>
          <button type="button" data-link-for="pagetext_intro">&#128279;</button>
        </div>
        <div id="pagetext_intro" class="richtext-editor" contenteditable="true"></div>
        <p class="admin-hint">Two or three sentences is plenty. Say what the page covers in the words someone would search for.</p>
      </section>

      <section class="admin-step" id="pagetext-stats-step">
        <h3 class="admin-step-title">Automatic stats line</h3>
        <label class="checkbox-label"><input type="checkbox" id="pagetext_show_stats" checked> Add a sentence built from this family&rsquo;s own dates</label>
        <p class="admin-hint">For example: &ldquo;Apple refreshes iPhone about every year on average. The most recently updated is iPhone 17 Pro, 365 days ago.&rdquo; It rewrites itself on every build, so it never goes stale.</p>
      </section>

      <section class="admin-step">
        <h3 class="admin-step-title">Extra text <span class="admin-optional">Shown at the bottom, below the products</span></h3>
        <div class="richtext-toolbar">
          <button type="button" data-cmd="bold" data-editor="pagetext_footer"><b>B</b></button>
          <button type="button" data-cmd="italic" data-editor="pagetext_footer"><i>I</i></button>
          <button type="button" data-cmd="insertParagraph" data-editor="pagetext_footer">&para;</button>
          <button type="button" data-link-for="pagetext_footer">&#128279;</button>
        </div>
        <div id="pagetext_footer" class="richtext-editor" contenteditable="true"></div>
        <p class="admin-hint">Room for the longer explanation: how Apple has handled this family over the years, what to expect next. Keeps the products at the top where people want them.</p>
      </section>

      <div class="admin-save-bar">
        <button type="submit" class="admin-btn admin-btn--primary">Save page text</button>
        <span id="pagetext-status" class="admin-hint"></span>
      </div>
    </form>
  </div>

  <div id="tab-about" class="admin-tab-panel" style="display:none;">
    <form id="about-form" class="admin-form">
      <label>Heading<input type="text" id="about_heading" autocomplete="off"></label>
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
    title: 'Admin — Apple Sunset',
    description: 'Manage products and site content.',
    siteUrl,
    path: '/admin/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
    noindex: true,
    scripts: [
      '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>',
      `<script src="${assetUrl('facts-kit.js')}" defer></script>`,
      `<script src="${assetUrl('admin.js')}" defer></script>`,
    ],
  });
}

// Phone upload page: a standalone, Home Screen-friendly page for adding a
// gallery photo set on the go. It signs in with the same Supabase account
// as the admin panel, so the database's "signed-in users only" write rule
// is what keeps it secure.
function uploadPage({ siteUrl, supabaseUrl, supabaseAnonKey }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Upload — Apple Sunset</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#c2540c">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Upload">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="/upload.webmanifest">
<link rel="apple-touch-icon" href="/logo.png">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
${supabaseUrl ? `<link rel="preconnect" href="${escapeHtml(supabaseUrl)}" crossorigin>` : ''}
<link rel="stylesheet" href="${assetUrl('upload.css')}">
</head>
<body>
<main class="up">
  <header class="up-header">
    <button type="button" id="up-home-btn" class="up-home-btn" aria-label="Back to the menu" hidden>&lsaquo; Menu</button>
    <img src="/logo.png" alt="" class="up-logo" width="32" height="32">
    <h1 id="up-heading">Add to gallery</h1>
  </header>

  <section id="up-loading" class="up-card"><p class="up-muted">Loading…</p></section>

  <section id="up-login" class="up-card" hidden>
    <p class="up-muted">Sign in with your admin account. Save the password to iCloud Keychain when asked, and Face ID fills it in next time.</p>
    <form id="up-login-form" class="up-form">
      <label>Email<input type="email" id="up-email" autocomplete="username" inputmode="email" autocapitalize="off" required></label>
      <label>Password<input type="password" id="up-password" autocomplete="current-password" required></label>
      <button type="submit" class="gallery-action gallery-action--primary">Sign in</button>
      <p id="up-login-error" class="up-error" role="alert"></p>
    </form>
  </section>

  <section id="up-home" hidden>
    <p class="up-muted up-home-intro">What would you like to do?</p>
    <div class="up-home-grid">
      <button type="button" class="up-home-tile" id="up-go-add">
        <span class="up-home-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></span>
        <span class="up-home-title">Add photos</span>
        <span class="up-home-desc">Upload a new album</span>
      </button>
      <button type="button" class="up-home-tile" id="up-go-edit">
        <span class="up-home-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14 20l1-3.5 4.5-4.5 2.5 2.5-4.5 4.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></span>
        <span class="up-home-title">Edit albums</span>
        <span class="up-home-desc">Change or delete a set</span>
      </button>
      <button type="button" class="up-home-tile" id="up-go-facts">
        <span class="up-home-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg></span>
        <span class="up-home-title">Did you know?</span>
        <span class="up-home-desc">Create and post facts</span>
      </button>
      <button type="button" class="up-home-tile" id="up-go-products">
        <span class="up-home-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><rect x="4" y="3.5" width="16" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 8.5h8M8 12h8M8 15.5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
        <span class="up-home-title">Product facts &amp; notes</span>
        <span class="up-home-desc">Write or research them</span>
      </button>
      <button type="button" class="up-home-tile" id="up-go-events">
        <span class="up-home-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 12.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="currentColor"/></svg></span>
        <span class="up-home-title">Apple Events</span>
        <span class="up-home-desc">Add or edit an event</span>
      </button>
      <button type="button" class="up-home-tile" id="up-go-x">
        <span class="up-home-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 4l16 16M20 4L4 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
        <span class="up-home-title">X posts</span>
        <span class="up-home-desc">Posts for X only</span>
      </button>
      <a class="up-home-tile" id="up-go-site" href="/">
        <span class="up-home-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>
        <span class="up-home-title">View the site</span>
        <span class="up-home-desc">Open Apple Sunset</span>
      </a>
    </div>
  </section>

  <section id="up-x" hidden>
    <button type="button" id="up-x-back" class="up-back-link" hidden>&lsaquo; Back to Did you know?</button>
    <p class="up-muted up-home-intro">Posts for the Apple Sunset X account only. Nothing here goes on the website.</p>
    <div class="up-card">
      <button type="button" id="up-x-ideas" class="gallery-action gallery-action--primary gallery-action--block">Ideas from my data</button>
      <div id="up-x-idea-list" class="up-fact-list"></div>
      <textarea id="up-x-topic" class="up-fact-edit up-fact-edit--short" placeholder="Or an idea for Claude, e.g. the first iPod" aria-label="Idea for Claude"></textarea>
      <button type="button" id="up-x-claude" class="gallery-action gallery-action--block">Write with Claude</button>
      <p class="up-hint" id="up-x-claude-note"></p>
    </div>
    <div class="up-card">
      <h2>Your post</h2>
      <textarea id="up-x-text" class="up-fact-edit" placeholder="Write or paste your post here" aria-label="Your post"></textarea>
      <label class="up-check"><input type="checkbox" id="up-x-tags" checked> Add hashtags</label>
      <label class="up-check"><input type="checkbox" id="up-x-link-on"> Add a link</label>
      <input type="url" id="up-x-link" class="up-search" placeholder="https://applesunset.com/" autocomplete="off" aria-label="Link">
      <label class="up-check"><input type="checkbox" id="up-x-card-on" checked> Add a card image</label>
      <img id="up-x-card" class="up-fact-preview up-x-card-img" alt="The card image" hidden>
      <p class="up-hint up-hint--error" id="up-x-card-note" hidden></p>
      <details class="up-x-card-edit" id="up-x-card-edit">
        <summary class="gallery-action gallery-action--block">Edit the card</summary>
        <div class="up-x-card-fields" id="up-x-card-fields">
          <span class="up-label">Card heading <span class="up-hint">the small line at the top, picked from your post (e.g. On this day, Launch day, Did you know?) until you type your own</span></span>
          <input type="text" id="up-x-card-label" class="up-search" value="Did you know?" autocomplete="off" aria-label="Card heading">
          <span class="up-label">Card title <span class="up-hint">optional, above the headline, e.g. iPhone 16</span></span>
          <input type="text" id="up-x-card-title" class="up-search" autocomplete="off" maxlength="40" aria-label="Card title">
          <span class="up-label">Card icon <span class="up-hint">what is this post about? Tap one. The Apple Sunset logo always sits small in the corner.</span></span>
          <select id="up-x-card-icon" hidden><option value="auto">Automatic</option></select>
          <div class="icon-picker" id="up-x-card-icon-picker"></div>
          <p class="up-hint icon-picker-auto" id="up-x-card-icon-auto"></p>
          <input type="text" id="up-x-card-emoji" class="up-search" autocomplete="off" maxlength="16" placeholder="Or type or paste any other emoji" aria-label="Any other emoji for the card">
          <span class="up-label">Card headline <span class="up-hint">the large text, e.g. 1,433 days. Leave empty for none.</span></span>
          <input type="text" id="up-x-card-headline" class="up-search" autocomplete="off" maxlength="60" aria-label="Card headline">
          <span class="up-label">Card line <span class="up-hint">the smaller text below it</span></span>
          <textarea id="up-x-card-line" class="up-fact-edit up-fact-edit--short" aria-label="Card line"></textarea>
        </div>
      </details>
      <div class="up-x-preview-head">
        <p class="up-hint">How it will look on X (you can edit it here):</p>
        <button type="button" id="up-x-preview-reset" class="gallery-action" hidden>Reset</button>
      </div>
      <textarea id="up-x-preview" class="up-fact-edit up-x-preview" placeholder="Your post will appear here." aria-label="The post as it will look on X"></textarea>
      <div class="up-x-emoji-row" id="up-x-emoji-row"><button type="button" class="up-x-emoji" data-emoji="🍎" aria-label="Add 🍎">🍎</button><button type="button" class="up-x-emoji" data-emoji="📱" aria-label="Add 📱">📱</button><button type="button" class="up-x-emoji" data-emoji="💻" aria-label="Add 💻">💻</button><button type="button" class="up-x-emoji" data-emoji="⌚" aria-label="Add ⌚">⌚</button><button type="button" class="up-x-emoji" data-emoji="🎧" aria-label="Add 🎧">🎧</button><button type="button" class="up-x-emoji" data-emoji="📅" aria-label="Add 📅">📅</button><button type="button" class="up-x-emoji" data-emoji="⏳" aria-label="Add ⏳">⏳</button><button type="button" class="up-x-emoji" data-emoji="🎉" aria-label="Add 🎉">🎉</button><button type="button" class="up-x-emoji" data-emoji="🔥" aria-label="Add 🔥">🔥</button><button type="button" class="up-x-emoji" data-emoji="👀" aria-label="Add 👀">👀</button><button type="button" class="up-x-emoji" data-emoji="🤔" aria-label="Add 🤔">🤔</button><button type="button" class="up-x-emoji" data-emoji="💯" aria-label="Add 💯">💯</button><button type="button" class="up-x-emoji" data-emoji="🚀" aria-label="Add 🚀">🚀</button><button type="button" class="up-x-emoji" data-emoji="✨" aria-label="Add ✨">✨</button><button type="button" class="up-x-emoji" data-emoji="👇" aria-label="Add 👇">👇</button></div>
      <p class="up-hint" id="up-x-preview-note" hidden>Edited by hand, so the boxes above no longer change it. Reset rebuilds it from them.</p>
      <p class="up-fact-count" id="up-x-count"></p>
      <p class="up-hint" id="up-x-link-note" hidden></p>
      <div class="up-fact-actions">
        <button type="button" id="up-x-share" class="gallery-action gallery-action--primary gallery-action--wide">Share to X with card</button>
        <button type="button" id="up-x-post" class="gallery-action">Post text only</button>
        <button type="button" id="up-x-copy" class="gallery-action">Copy text</button>
      </div>
      <p id="up-x-over" class="up-x-over" hidden><span id="up-x-over-text"></span> <button type="button" id="up-x-over-tags" class="gallery-action">Remove the hashtags</button></p>
      <p class="up-hint" id="up-x-note">Share to X with card opens the share sheet: pick X and the card and text go in together. If the text doesn’t appear in X, it’s been copied, so just paste it.</p>
      <button type="button" id="up-x-done" class="gallery-action gallery-action--block">Done: clear and go back</button>
    </div>
  </section>

  <section id="up-products" hidden>
    <div class="up-card">
      <input type="search" id="up-product-search" class="up-search" placeholder="Search products" autocomplete="off" aria-label="Search products">
      <p class="up-hint" id="up-product-count"></p>
    </div>
    <div id="up-product-list" class="up-library-list"></div>
  </section>

  <section id="up-product" hidden>
    <div class="up-editing">
      <button type="button" id="up-product-back" class="up-link">&larr; All products</button>
      <h2 id="up-product-name"></h2>
      <p class="up-muted" id="up-product-meta"></p>
    </div>
    <div class="up-card">
      <h2>Did you know?</h2>
      <textarea id="up-pf-fact" class="up-fact-edit" placeholder="One short, surprising fact about this product" aria-label="Did you know? fact"></textarea>
      <p class="up-fact-count" id="up-pf-fact-count"></p>
      <label class="up-label" id="up-pf-date-wrap">Fact date (shown as &ldquo;As of&rdquo;)<input type="date" id="up-pf-date" class="up-search"></label>
      <button type="button" id="up-pf-suggest" class="gallery-action gallery-action--block">Suggest 3 from its dates</button>
      <div id="up-pf-suggestions" class="up-fact-list"></div>
      <textarea id="up-pf-fact-idea" class="up-fact-edit up-fact-edit--short" placeholder="Idea to research, e.g. its colours" aria-label="Idea for a fact"></textarea>
      <button type="button" id="up-pf-fact-claude" class="gallery-action gallery-action--block">Research a fact with Claude</button>
      <p class="up-hint" id="up-pf-fact-note"></p>
    </div>
    <div class="up-card">
      <h2>Notes</h2>
      <textarea id="up-pf-notes" class="up-fact-edit up-fact-edit--tall" placeholder="Short notes shown on the product page" aria-label="Notes"></textarea>
      <p class="up-hint" id="up-pf-notes-format"></p>
      <textarea id="up-pf-notes-idea" class="up-fact-edit up-fact-edit--short" placeholder="Optional focus, e.g. what changed from the last model" aria-label="What the notes should focus on"></textarea>
      <button type="button" id="up-pf-notes-claude" class="gallery-action gallery-action--block">Research notes with Claude</button>
      <p class="up-hint" id="up-pf-notes-note"></p>
    </div>
    <div class="up-card">
      <button type="button" id="up-pf-save" class="gallery-action gallery-action--primary gallery-action--block">Save and publish</button>
      <p class="up-status" id="up-pf-status" aria-live="polite"></p>
    </div>
  </section>

  <section id="up-events" hidden>
    <div class="up-card">
      <button type="button" id="up-ev-new" class="gallery-action gallery-action--primary gallery-action--block">Add an event</button>
      <p class="up-hint" id="up-ev-count"></p>
      <p class="up-status" id="up-ev-list-status" aria-live="polite"></p>
    </div>
    <div id="up-ev-list" class="up-library-list"></div>
  </section>

  <section id="up-event" hidden>
    <div class="up-editing">
      <button type="button" id="up-ev-back" class="up-link">&larr; All events</button>
      <h2 id="up-ev-form-title">Add an event</h2>
    </div>
    <form id="up-ev-form" class="up-form" novalidate>
      <div class="up-card">
        <div class="up-ev-art" id="up-ev-art" hidden><img id="up-ev-art-img" alt=""></div>
        <label for="up-ev-file" class="gallery-action gallery-action--primary gallery-action--block" id="up-ev-file-label">Choose the event artwork</label>
        <input type="file" id="up-ev-file" accept="image/*" class="up-file-input">
        <p class="up-hint" id="up-ev-art-note">Apple&rsquo;s invite artwork. It shows on the homepage, the event page and its X card.</p>
      </div>

      <div class="up-card">
        <label>Title<input type="text" id="up-ev-heading" placeholder="e.g. Apple Event: It&rsquo;s Glowtime" autocomplete="off" enterkeyhint="next"></label>
        <label>Date<input type="date" id="up-ev-date"></label>
        <label>Time, with its time zone<input type="text" id="up-ev-time" placeholder="e.g. 10am PT" autocomplete="off" spellcheck="false" enterkeyhint="next"></label>
        <p class="up-hint" id="up-ev-time-echo" aria-live="polite"></p>
        <label>Apple&rsquo;s event page (optional)<input type="url" id="up-ev-url" placeholder="https://www.apple.com/apple-events/" autocomplete="off" spellcheck="false" enterkeyhint="done"></label>
        <p class="up-hint">Only when there&rsquo;s a live stream: the homepage then shows Watch live. Leave empty if there&rsquo;s nothing to watch.</p>
        <span class="up-label">Summary (optional)</span>
        <div class="up-rt-toolbar" role="toolbar" aria-label="Summary formatting">
          <button type="button" data-cmd="bold" aria-label="Bold"><b>B</b></button>
          <button type="button" data-cmd="italic" aria-label="Italic"><i>I</i></button>
          <button type="button" data-cmd="underline" aria-label="Underline"><u>U</u></button>
          <button type="button" data-cmd="link" aria-label="Add a link">Link</button>
          <button type="button" data-cmd="clear" class="up-rt-clear" aria-label="Clear all formatting">Clear</button>
        </div>
        <div id="up-ev-summary" class="up-rt-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Summary" data-placeholder="A line or two on what Apple announced"></div>
        <p class="up-hint" id="up-ev-summary-count">Shown on the event page and in Google results. Select words, then tap B to make them bold.</p>
      </div>

      <div class="up-card">
        <span class="up-label">Announced products (optional)</span>
        <div id="up-ev-products" class="up-ev-products"></div>
        <div class="up-add-tag">
          <input type="text" id="up-ev-new-product" list="up-ev-product-options" placeholder="e.g. iPhone 18 Pro" autocomplete="off" enterkeyhint="done" aria-label="Announced product">
          <button type="button" id="up-ev-add-product" class="gallery-action">Add</button>
        </div>
        <datalist id="up-ev-product-options"></datalist>
        <p class="up-hint">Add them once Apple reveals them. Tap the star to show a product on the event&rsquo;s card.</p>
      </div>

      <div class="up-card">
        <label class="up-check"><input type="checkbox" id="up-ev-featured"> Put this event first on the homepage</label>
        <p class="up-hint">Only matters if two events overlap. Every event leaves the homepage 48 hours after it starts.</p>
        <button type="submit" class="gallery-action gallery-action--primary gallery-action--block" id="up-ev-save">Save and publish</button>
        <p class="up-status" id="up-ev-status" aria-live="polite"></p>
      </div>

      <div class="up-card" id="up-ev-more" hidden>
        <button type="button" id="up-ev-x" class="gallery-action gallery-action--block">Post to X</button>
        <button type="button" id="up-ev-delete" class="gallery-action gallery-action--danger gallery-action--block">Delete this event</button>
      </div>
    </form>
  </section>

  <nav class="up-tabs" id="up-tabs" role="tablist" hidden>
    <button type="button" role="tab" class="up-tab up-tab--on" id="up-tab-new" aria-selected="true">Add</button>
    <button type="button" role="tab" class="up-tab" id="up-tab-edit" aria-selected="false">Edit</button>
    <button type="button" role="tab" class="up-tab" id="up-tab-facts" aria-selected="false">Did you know?</button>
  </nav>

  <section id="up-facts" hidden>
    <p class="up-muted up-home-intro">Three parts: <strong>1</strong> what the homepage shows each day, <strong>2</strong> making a new fact, <strong>3</strong> your published facts. Every <strong>Post to X</strong> opens X posts with the card ready.</p>

    <h2 class="up-section-title"><span class="up-step">1</span>On the homepage</h2>
    <p class="up-muted up-step-intro">It changes every morning, taking turns through product facts, statistics and your published facts. Today&rsquo;s and the next six days:</p>
    <div id="up-fact-rotation" class="up-fact-list"><p class="up-muted">Loading&hellip;</p></div>

    <h2 class="up-section-title"><span class="up-step">2</span>Make a fact</h2>
    <div class="up-card">
      <span class="up-label">When you publish one, on the homepage</span>
      <select id="up-fact-when" class="up-select">
        <option value="rotation">Take its turn in the daily rotation</option>
        <option value="today">Show it today</option>
        <option value="date">Show it on a date&hellip;</option>
      </select>
      <input type="date" id="up-fact-date" class="up-select" hidden aria-label="Day to show it on the homepage">
    </div>
    <div class="up-card">
      <span class="up-label">From your product data</span>
      <button type="button" id="up-generate-facts" class="gallery-action gallery-action--primary gallery-action--block">Generate facts</button>
      <p class="up-status" id="up-facts-status" aria-live="polite"></p>
    </div>
    <div id="up-fact-choices" class="up-fact-list"></div>

    <div class="up-card">
      <span class="up-label">Research a fact with Claude</span>
      <p class="up-muted">Say what it should be about. Claude checks each fact against two reliable sources and skips ones you&rsquo;ve published. Copy the one you like into the box below.</p>
      <textarea id="up-fact-topic" class="up-fact-edit up-fact-edit--short" placeholder="e.g. the original iPod" aria-label="What the fact should be about"></textarea>
      <button type="button" id="up-ask-claude" class="gallery-action gallery-action--primary gallery-action--block">Ask Claude</button>
      <p class="up-hint" id="up-ask-claude-note"></p>
    </div>

    <div class="up-card">
      <span class="up-label">Write your own</span>
      <textarea id="up-own-fact" class="up-fact-edit" placeholder="Paste or type a fact" aria-label="Your fact"></textarea>
      <p class="up-fact-count" id="up-own-fact-count"></p>
      <div class="up-fact-actions">
        <button type="button" id="up-own-fact-use" class="gallery-action gallery-action--primary">Publish</button>
        <button type="button" id="up-own-fact-x" class="gallery-action">Post to X only</button>
      </div>
      <p class="up-hint"><strong>Publish</strong> puts it on the site (homepage as chosen above, and the Facts page). <strong>Post to X only</strong> doesn&rsquo;t save it anywhere.</p>
    </div>

    <h2 class="up-section-title"><span class="up-step">3</span>Published facts</h2>
    <div id="up-fact-published" class="up-fact-list"></div>
  </section>

  <section id="up-library" hidden>
    <div class="up-card">
      <input type="search" id="up-search" class="up-search" placeholder="Search title, tag or place" autocomplete="off" aria-label="Search photo sets">
      <p class="up-hint" id="up-library-count"></p>
    </div>
    <div id="up-library-list" class="up-library-list"></div>
  </section>

  <section id="up-main" hidden>
    <div class="up-editing" id="up-editing" hidden>
      <button type="button" id="up-cancel-edit" class="up-link">&larr; Back to all sets</button>
      <h2 id="up-editing-title">Editing</h2>
    </div>
    <form id="up-form" class="up-form">
      <div class="up-card">
        <div class="up-photos" id="up-photos"></div>
        <label for="up-file" class="gallery-action gallery-action--primary gallery-action--block" id="up-file-label">Choose photos</label>
        <input type="file" id="up-file" accept="image/*" multiple class="up-file-input">
        <p class="up-hint">Up to 12 in one set. The first photo is the main one. Location data is removed from the files before upload.</p>
      </div>

      <div class="up-card">
        <label>Title<input type="text" id="up-title" placeholder="e.g. iPhone 17 Pro in Cosmic Orange" autocomplete="off" enterkeyhint="next"></label>
        <label>Story <span class="up-optional">optional</span><textarea id="up-story" rows="3" maxlength="300" placeholder="e.g. Taken at a very busy Apple Store in Cardiff the day after the iPhone Duo launch."></textarea></label>
        <label>Date taken
          <input type="text" id="up-date" placeholder="e.g. 15 Oct 2024, or Oct 2024" autocomplete="off" spellcheck="false" enterkeyhint="next">
        </label>
        <p class="up-hint" id="up-date-echo" aria-live="polite"></p>
        <label>Location<input type="text" id="up-location" list="up-location-options" placeholder="e.g. Cardiff" autocomplete="off" enterkeyhint="next"></label>
        <datalist id="up-location-options"></datalist>
        <label>Country<input type="text" id="up-country" list="up-country-options" placeholder="e.g. United Kingdom" autocomplete="off" enterkeyhint="done"></label>
        <datalist id="up-country-options"></datalist>
      </div>

      <div class="up-card">
        <span class="up-label">Tags</span>
        <div class="up-pills" id="up-selected-tags"></div>
        <div class="up-add-tag">
          <input type="text" id="up-new-tag" list="up-tag-options" placeholder="Add a tag" autocomplete="off" enterkeyhint="done" aria-label="New tag">
          <button type="button" id="up-add-tag-btn" class="gallery-action">Add</button>
        </div>
        <datalist id="up-tag-options"></datalist>
        <p class="up-hint">Tap to add. A tag that matches a product name also shows the photo on that product's page.</p>
        <div class="up-pills up-pills--suggest" id="up-suggested-tags"></div>
        <button type="button" id="up-more-tags" class="up-link" hidden>Show all tags</button>
      </div>

      <div class="up-card">
        <label class="up-check"><input type="checkbox" id="up-publish" checked> Publish to the site straight away</label>
        <button type="submit" class="gallery-action gallery-action--primary gallery-action--block" id="up-submit">Upload</button>
        <p id="up-status" class="up-status" aria-live="polite"></p>
      </div>

      <div class="up-card" id="up-remove-card" hidden>
        <button type="button" id="up-remove-set" class="gallery-action gallery-action--danger gallery-action--block">Delete this photo set</button>
        <p class="up-hint">Removes it from the gallery. This can't be undone.</p>
      </div>
    </form>
  </section>

  <section id="up-done" class="up-card" hidden>
    <h2 id="up-done-title">Uploaded</h2>
    <p id="up-done-text" class="up-muted"></p>
    <button type="button" id="up-again" class="gallery-action gallery-action--primary gallery-action--block">Upload another</button>
    <button type="button" id="up-edit-saved" class="gallery-action gallery-action--block">Edit this set</button>
    <button type="button" id="up-to-library" class="gallery-action gallery-action--block">All my photo sets</button>
    <a href="/gallery/" class="gallery-action gallery-action--block">View gallery on the site</a>
  </section>

  <footer class="up-footer" id="up-footer" hidden>
    <span id="up-user"></span>
    <button type="button" id="up-logout" class="up-link">Sign out</button>
  </footer>
  <p class="up-version">Version ${assetUrl('upload.js').split('v=')[1].slice(0, 6)}</p>
</main>
<script>
  window.SUPABASE_URL = ${JSON.stringify(supabaseUrl || '')};
  window.SUPABASE_ANON_KEY = ${JSON.stringify(supabaseAnonKey || '')};
</script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.113.0/dist/umd/supabase.js" defer></script>
<script src="${assetUrl('facts-kit.js')}" defer></script>
<script src="${assetUrl('upload.js')}" defer></script>
<script>
  // Keeps the page's files on the phone so it opens instantly from the
  // Home Screen; updates are fetched in the background.
  if ('serviceWorker' in navigator) {
    // When a new version of the app takes over just after opening, reload
    // once so it shows straight away (never later, so it can't interrupt
    // an upload in progress).
    var openedAt = Date.now();
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController && Date.now() - openedAt < 8000 && !sessionStorage.getItem('upload-sw-reloaded')) {
        sessionStorage.setItem('upload-sw-reloaded', '1');
        location.reload();
      }
    });
    navigator.serviceWorker.register('/upload-sw.js', { scope: '/upload/', updateViaCache: 'none' }).catch(function () {});
  }
</script>
</body>
</html>
`;
}

module.exports = {
  aboutCounts,
  earningsPage,
  nextEarnings,
  earningsQuarter,
  appleName,
  sanitizeRichText,
  categoryTimelinePoints,
  launchDate,
  galleryPage,
  galleryPhotoPage,
  galleryPhotoImages,
  siteStats,
  photoLicencePage,
  factRelatedLink,
  galleryPhotoCardHtml,
  setServedPhotos,
  setEventTints,
  setLinkProducts,
  missingProductLinks,
  eventsPage,
  eventDetailPage,
  factsPage,
  factPage,
  setCustomCategoryIcons,
  homePage,
  allProductsPage,
  discontinuedPage,
  comingSoonPage,
  categoriesIndexPage,
  categoryPage,
  productPage,
  aboutPage,
  contactPage,
  contactThanksPage,
  notFoundPage,
  adminPage,
  uploadPage,
  cardHtml,
  productBadge,
  slugify,
  eventSlug,
  galleryPhotoSlug,
  rssFeedXml,
  mostRecentActivityDate,
};
