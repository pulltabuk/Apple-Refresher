const CATEGORY_ICONS = {
  iPhone: `<rect x="13" y="4" width="14" height="32" rx="3"/><line x1="17" y1="31" x2="23" y2="31"/>`,
  Mac: `<rect x="8" y="9" width="24" height="16" rx="1.5"/><path d="M5 30h30l-2.5-3h-25z"/>`,
  iPad: `<rect x="7" y="8" width="26" height="24" rx="3"/><line x1="19" y1="27" x2="21" y2="27"/>`,
  'Apple Watch': `<rect x="12" y="10" width="16" height="20" rx="5"/><rect x="27.5" y="17" width="3" height="6" rx="1"/>`,
  AirPods: `<path d="M14 10c-3 0-5 2-5 5v9c0 2 1.5 3 3 3s3-1 3-3V13"/><path d="M26 10c3 0 5 2 5 5v9c0 2-1.5 3-3 3s-3-1-3-3V13"/>`,
  'Vision Pro': `<path d="M6 18c0-4 3-6 14-6s14 2 14 6-3 6-14 6S6 22 6 18z"/><circle cx="15" cy="18" r="2.5"/><circle cx="25" cy="18" r="2.5"/>`,
  'Apple TV': `<rect x="9" y="9" width="22" height="22" rx="4"/><text x="20" y="24" font-size="9" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">TV</text>`,
  AirTag: `<circle cx="20" cy="20" r="14"/><circle cx="20" cy="20" r="10.5"/>`,
  'Apple Pencil': `<path d="M17 6c0-1.5 1.3-2.5 3-2.5s3 1 3 2.5v22l-3 8-3-8V6z"/><line x1="20" y1="9" x2="20" y2="14"/>`,
  Other: `<rect x="8" y="8" width="24" height="24" rx="4"/>`,
};

let CUSTOM_CATEGORY_ICONS = {};
function setCustomCategoryIcons(icons) {
  CUSTOM_CATEGORY_ICONS = icons || {};
}

function categoryIcon(category, size) {
  const s = size || 40;
  const customKey = Object.keys(CUSTOM_CATEGORY_ICONS).find((k) => k.toLowerCase() === String(category || '').toLowerCase());
  if (customKey) {
    return `<img class="placeholder-icon" src="${escapeHtml(CUSTOM_CATEGORY_ICONS[customKey])}" alt="" width="${s}" height="${s}" style="object-fit:contain;">`;
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
    const src = escapeHtml(String(product.icon_url).replace(/"/g, '%22'));
    return `<img class="placeholder-icon placeholder-icon--product" src="${src}" alt="" width="${s}" height="${s}" style="object-fit:contain;">`;
  }
  return categoryIcon(product && product.category, size);
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

function eventSlug(event) {
  // SEO-friendly event URL: heading plus month and year, e.g.
  // "surprise-and-shine-september-2026". Falls back to the UUID if an
  // event somehow has no heading, so a page is always reachable.
  const heading = slugify(String(event.heading || '').replace(/['\u2019]/g, ''));
  let datePart = '';
  if (event.event_date) {
    const d = new Date(event.event_date);
    if (!isNaN(d)) {
      const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      datePart = months[d.getUTCMonth()] + '-' + d.getUTCFullYear();
    }
  }
  const slug = [heading, datePart].filter(Boolean).join('-');
  return slug || String(event.id);
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

function mostRecentActivityDate(product) {
  const dates = [product.discontinued && product.discontinued_date, ...(product.refresh_history || [])].filter(Boolean);
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
    const desc = product.discontinued
      ? `${product.name} was discontinued.`
      : `${product.name} was refreshed.`;
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
<rss version="2.0">
<channel>
  <title>Apple Sunset — Recent Refreshes &amp; Discontinuations</title>
  <link>${siteUrl}</link>
  <description>Recently refreshed and discontinued Apple products, tracked by Apple Sunset.</description>
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
    const end = next || (product.discontinued ? product.discontinued_date || null : today);
    return {
      date,
      name: storedGenerationName(product, date) || autoGenerationName(product, i, dates.length),
      hasStoredDetails: !!(storedGenerationName(product, date) || info.announced),
      announced: info.announced || null,
      end,
      isCurrent: !next && !product.discontinued,
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
  } else if (sortedEntries.length) {
    const first = sortedEntries[0];
    points.push({ date: first.date, label: 'Launch', type: 'launch', productName: first.productName, displayName: first.displayName });
    consumedKeys.add(first.date + '|' + first.productName);
  }

  sortedEntries.forEach((e) => {
    if (consumedKeys.has(e.date + '|' + e.productName)) {
      return;
    }
    points.push({ date: e.date, label: 'Refresh', type: 'refresh', productName: e.productName, displayName: e.displayName });
  });

  sameCategory.forEach((p) => {
    if (p.discontinued && p.discontinued_date) {
      points.push({ date: p.discontinued_date, label: 'Discontinued', type: 'discontinued', productName: p.name });
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
    const ordered = entries.slice().sort((a, b) => {
      const rank = (e) => (e.type === 'discontinued' ? 1 : 0);
      return rank(a) - rank(b);
    });
    // Every entry here is a release, so a "Refresh" pill only repeats what
    // the timeline already says. Launch, Discontinued and Current each
    // tell you something the date alone does not, so they stay. Tags are
    // grouped so they wrap together instead of splitting across lines.
    const lines = ordered.map((e) => {
      const tags = [
        e.type === 'refresh' ? '' : `<span class="tl-entry-type tl-entry-type--${e.type}">${e.label}</span>`,
        e.isCurrent ? '<span class="tl-entry-type tl-entry-type--current">Current</span>' : '',
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
  const body = `
<div class="not-found">
  <h1>That page has gone</h1>
  <p class="page-intro">The product may have been renamed or merged into another line. These will get you back on track.</p>
  <p class="not-found-links">
    <a class="intro-cta" href="/products/">All products</a>
    <a class="intro-cta intro-cta--ghost" href="/categories/">Browse by family</a>
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
  };
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
  if (past.length < 2) return '';

  const toDays = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const avg = Math.round(toDays(past[0], past[past.length - 1]) / (past.length - 1));
  const sinceLast = toDays(past[past.length - 1], today);
  // Half-year precision reads naturally ("every 3½ years") without
  // rounding 3.5 up to a misleading 4.
  const cadence = (d) => {
    if (d < 330) return `roughly every ${Math.max(1, Math.round(d / 30.4))} months`;
    const years = Math.round((d / 365.25) * 2) / 2;
    if (years === 1) return 'about once a year';
    const whole = Math.floor(years);
    return `roughly every ${years % 1 ? whole + '\u00bd' : whole} years`;
  };

  const parts = [`Across ${past.length} releases, Apple has updated ${escapeHtml(category)} ${cadence(avg)}.`];
  if (sinceLast > avg * 1.25) {
    parts.push(`It has now been ${plural(sinceLast, 'day', 'days')} since the last one, well past the usual gap.`);
  } else if (sinceLast > avg) {
    parts.push(`It has now been ${plural(sinceLast, 'day', 'days')}, a little beyond the usual gap.`);
  } else {
    parts.push(`The last update was ${plural(sinceLast, 'day', 'days')} ago, so the next is not due yet.`);
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

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

// The colour compares a product against its own usual cycle, not a
// fixed number of days, so 365 days can be amber for one product and
// red for another. The tooltip says which, rather than leaving people
// to guess.
function badgeExplanation(statusInfo) {
  if (!statusInfo) return '';
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


function contactPage({ siteUrl, supabaseUrl, supabaseAnonKey }) {
  // Handled by Netlify Forms: the form is detected in the built HTML at
  // deploy time, so there is no server code. The honeypot field catches
  // most bots without putting a puzzle in front of real people.
  const body = `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li class="crumb-sep" aria-hidden="true">&rsaquo;</li><li aria-current="page">Contact</li></ol></nav>

  <h1>Get in touch</h1>
  <p class="page-intro">Spotted something wrong, know a date we have missed, or want to suggest a product? Send us a note and we will read every one.</p>

  <form name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="/contact/thanks/" class="contact-form">
    <input type="hidden" name="form-name" value="contact">
    <p class="contact-hp"><label>Leave this empty <input name="bot-field"></label></p>

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
    },
  ],
})}</script>
${extraJsonLd ? `<script type="application/ld+json">${JSON.stringify(extraJsonLd)}</script>` : ''}
<link rel="stylesheet" href="/styles.css">
<link rel="alternate" type="application/rss+xml" title="Apple Sunset — Recent Refreshes &amp; Discontinuations" href="/feed.xml">
<link rel="icon" type="image/png" href="/favicon.png">
</head>
<body${bodyClass}>
<header class="site-header-bg">
  <div class="site-header">
    <a class="site-title" href="/">
      <img src="/logo.png" alt="Apple Sunset" class="site-logo-img">
    </a>
    <button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">
      <span class="nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>
      <span class="nav-toggle-text">Menu</span>
    </button>
    <nav class="site-nav" id="site-nav">
      <a href="/products/">All products</a>
      <a href="/categories/">Categories</a>
      <a href="/discontinued/">Discontinued</a>
      <a href="/gallery/">Photo Gallery</a>
      <a href="/events/">Apple Events</a>
      <form class="site-search" action="/products/" method="get">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="search" name="search" placeholder="Search products" aria-label="Search products">
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
      <a href="/gallery/">Gallery</a>
      <a href="/events/">Apple Events</a>
      <a href="/facts/">Facts</a>
      <a href="/about/">About us</a>
      <a href="/contact/">Contact</a>
      <a href="/feed.xml">RSS Feed</a>
      <a href="/admin/">Admin</a>
    </nav>
    <p>Apple Sunset is an independent tracker and is not affiliated with Apple Inc.</p>
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
        <div class="card-name-row">${productIcon(product, 36)}<p class="card-name">${escapeHtml(product.name)}</p></div>
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
  return `<div class="sort-select-wrap">
    <select id="sort-select" class="sort-select" aria-label="Sort products">
      <option value="" selected disabled>Sort by...</option>
      ${options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('\n')}
    </select>
    <button type="button" id="sort-reset-btn" class="sort-reset-btn" aria-label="Reset sort order" title="Reset to default order" style="display:none;">&times;</button>
  </div>`;
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
  const photoCountPill = images.length > 1 ? `<span class="pill pill--count">${images.length} photos</span>` : '';
  const tagsHtml = galleryTagsHtml(photo);
  const footer = (tagsHtml || photoCountPill) ? `<div class="gallery-card-footer">${tagsHtml}${photoCountPill}</div>` : '';
  return `<article class="card" data-date="${dateToTimestamp(photo.date_taken)}" data-created="${dateToTimestamp(photo.created_at)}" data-search="${escapeHtml(searchText.toLowerCase())}">
  <a class="card-link" href="/gallery/${galleryPhotoSlug(photo)}/">
    <div class="card-image">
      ${images[0] ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(displayName)}">` : ''}
    </div>
    <p class="card-name">${escapeHtml(displayName)}</p>
    ${photo.date_taken ? `<p class="card-meta">${formatDate(photo.date_taken)}</p>` : ''}
  </a>
  ${footer}
</article>`;
}

function galleryPhotoPage({ photo, prevPhoto, nextPhoto, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const displayName = photo.caption || (photo.tags && photo.tags[0]) || 'Untitled photo';
  const images = galleryPhotoImages(photo);
  const imagesHtml = images.map((url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(displayName)}">`).join('\n');
  const pageUrl = `${siteUrl}/gallery/${galleryPhotoSlug(photo)}/`;
  const mailtoHref = `mailto:infoswiper@yahoo.com?subject=${encodeURIComponent(`Can I use this photo? — ${displayName}`)}&body=${encodeURIComponent(`Hi, I'd like to ask about using this photo:\n${pageUrl}`)}`;
  const body = `
<article class="gallery-photo-page">
  <div class="gallery-photo-header">
    <div class="page-header-row">
      <h1>${escapeHtml(displayName)}</h1>
      <a href="/admin/?editPhoto=${photo.id}" class="admin-edit-link" style="display:none;">Edit</a>
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
    ${prevPhoto ? `<a href="/gallery/${galleryPhotoSlug(prevPhoto)}/" class="gallery-nav-link">&larr; Previous</a>` : '<span></span>'}
    <a href="/gallery/" class="gallery-nav-link">Full Gallery</a>
    ${nextPhoto ? `<a href="/gallery/${galleryPhotoSlug(nextPhoto)}/" class="gallery-nav-link">Next &rarr;</a>` : '<span></span>'}
  </div>
</article>`;
  return shell({
    title: `${escapeHtml(displayName)} — Apple Sunset Gallery`,
    description: `A photo from the Apple Sunset gallery${photo.location ? `, taken in ${photo.location}` : ''}.`,
    siteUrl,
    path: `/gallery/${galleryPhotoSlug(photo)}/`,
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
    ogImage: images[0],
    ogType: 'article',
  });
}

function galleryPage({ photos, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const body = photos.length
    ? `
<div class="page-header-row">
  <h1>${pageHeading(pageContent, 'Gallery')}</h1>
  <a href="/admin/" class="admin-edit-link" style="display:none;">Admin</a>
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
  <a href="/admin/" class="admin-edit-link" style="display:none;">Admin</a>
</div>
<p class="page-intro">No photos yet. Add some in <a href="/admin/">/admin/</a>.</p>`;
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
  return `<p class="page-intro">No ${what} yet. Add one in <a href="/admin/">/admin/</a> to see it here.</p>`;
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
              ? `<span class="countdown-unit"><span class="countdown-value">${away}</span><span class="countdown-unit-label">${away === 1 ? 'day' : 'days'}</span></span>`
              : '<span class="countdown-unit"><span class="countdown-value">Today</span></span>';
            return `<div class="card-featured-count card-featured-count--upcoming" data-product-countdown="${due}"><span class="product-countdown-clock" data-product-countdown-clock>${fallback}</span><span class="card-featured-count-due">Coming ${formatDate(due)}</span></div>`;
          })()
        : `<div class="card-featured-count card-featured-count--${statusInfo.status}"><span class="card-featured-count-number">${daysInfo.days}</span><span class="card-featured-count-suffix">days ${daysInfo.suffix}</span></div>`)
    : productBadge(product, statusInfo);
  const launch = launchDate(product);
  const predecessor = product.previous_model && productsBySlug ? productsBySlug[product.previous_model] : null;
  // Once the predicted date has gone by, saying "expected" is wrong: it
  // was expected, and the product is overdue.
  const expectedDate = statusInfo && !product.discontinued
    ? new Date(new Date(statusInfo.lastRefresh).getTime() + statusInfo.avgCycleDays * 86400000)
    : null;
  const expectedPassed = expectedDate ? expectedDate.getTime() < Date.now() : false;
  const nextExpected = expectedDate ? expectedDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }) : null;
  const extras = upcomingExtras(product);
  const detailRows = [
    product.price ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Launch price</span> ${escapeHtml(formatPrice(product.price))}</div>` : '',
    extras.announced ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Announced</span> ${formatDate(extras.announced)}</div>` : '',
    extras.preorder ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Pre-orders open</span> ${formatDate(extras.preorder)}</div>` : '',
    launch ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Launch date</span> ${formatDate(launch)}</div>` : '',
    product.discontinued && product.discontinued_date
      ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Discontinued</span> ${formatDate(product.discontinued_date)}</div>`
      : nextExpected
      ? `<div class="card-featured-detail"><span class="card-featured-detail-label">${expectedPassed ? 'Refresh was expected' : 'Next refresh expected'}</span> ${nextExpected}</div>`
      : '',
    predecessor ? `<div class="card-featured-detail"><span class="card-featured-detail-label">Previous model</span> ${escapeHtml(predecessor.name)}</div>` : '',
  ].filter(Boolean).join('\n');
  return `<article class="card card--featured" data-category="${escapeHtml(product.category)}">
  <a class="card-link" href="/products/${product.slug}/">
    <span class="card-featured-label">Featured</span>
    <div class="card-name-row">${productIcon(product, 42)}<p class="card-name">${escapeHtml(product.name)}</p></div>
    ${countHtml}
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
        <span class="gallery-strip-main"><img src="${escapeHtml(images[0])}" alt="${escapeHtml(displayName)}"></span>
        <span class="gallery-strip-side${images.length === 2 ? ' gallery-strip-side--one' : ''}">
          ${images.slice(1, 3).map((url) => `<span class="gallery-strip-thumb"><img src="${escapeHtml(url)}" alt=""></span>`).join('')}
          ${images.length > 3 ? `<span class="gallery-strip-more">+${images.length - 3}</span>` : ''}
        </span>
      </span>`
    : `<span class="gallery-strip-single">${images[0] ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(displayName)}">` : ''}</span>`;
  const place = [photo.location, photo.country].filter(Boolean)
    .map((t) => `<span class="pill pill--location">${escapeHtml(t)}</span>`).join('');
  const count = images.length > 1 ? `<span class="gallery-strip-count">${images.length} photos</span>` : '';
  return `<a class="gallery-strip-item" href="/gallery/${galleryPhotoSlug(photo)}/">
    <span class="gallery-strip-media">${media}${count}</span>
    <span class="gallery-strip-caption">${escapeHtml(displayName)}</span>
    ${place ? `<span class="gallery-strip-pills">${place}</span>` : ''}
  </a>`;
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

function normalizedAnnouncedProducts(event) {
  return (event.announced_products || []).map((p) => (typeof p === 'string' ? { name: p, featured: false } : p));
}

function eventArchiveCardHtml(event, productsBySlug) {
  const dateText = [formatDate(event.event_date), event.event_time].filter(Boolean).join(' \u00b7 ');
  const products = normalizedAnnouncedProducts(event);
  const featured = products.filter((p) => p.featured).sort((a, b) => a.name.localeCompare(b.name));
  const rest = products.filter((p) => !p.featured).sort((a, b) => a.name.localeCompare(b.name));
  const shown = featured.concat(rest).slice(0, 10);
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
  const inner = `<div class="card-image">${event.image_url ? `<img src="${escapeHtml(event.image_url)}" alt="${escapeHtml(event.heading)}">` : ''}</div>
    <p class="card-name">${escapeHtml(event.heading)}</p>
    ${dateText ? `<p class="card-meta">${escapeHtml(dateText)}</p>` : ''}`;
  // data-search lets the page filter match the announced products as
  // well as the event's own title and date.
  const searchText = [event.heading, dateText, ...products.map((p) => p.name)].filter(Boolean).join(' ');
  return `<article class="card" data-search="${escapeHtml(searchText.toLowerCase())}">
  <a class="card-link" href="/events/${eventSlug(event)}/">${inner}</a>
  ${tags ? `<div class="gallery-tags"><div class="gallery-tags-row">${tags}</div></div>` : ''}
</article>`;
}

function eventDetailPage({ event, productsBySlug, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const dateText = [formatDate(event.event_date), event.event_time].filter(Boolean).join(' \u00b7 ');
  const sortedProducts = normalizedAnnouncedProducts(event).map((p) => p.name).sort((a, b) => a.localeCompare(b));
  const productsList = sortedProducts.length
    ? `<ul class="event-products-list">
    ${sortedProducts.map((name) => {
      const match = Object.values(productsBySlug || {}).find((p) => p.name.toLowerCase() === name.toLowerCase());
      return `<li>${match ? `<a href="/products/${match.slug}/">${escapeHtml(name)}</a>` : escapeHtml(name)}</li>`;
    }).join('\n')}
  </ul>`
    : '';
  const body = `
<article class="event-detail-page">
  <div class="page-header-row">
    <h1>${escapeHtml(event.heading)}</h1>
    <a href="/admin/" class="admin-edit-link" style="display:none;">Admin</a>
  </div>
  ${dateText ? `<p class="page-intro">${escapeHtml(dateText)}</p>` : ''}
  ${event.image_url ? `<img class="event-detail-image" src="${escapeHtml(event.image_url)}" alt="${escapeHtml(event.heading)}">` : ''}
  ${productsList ? `<h2>What was announced</h2>${productsList}` : ''}
  ${event.event_url ? `<p><a class="intro-cta" href="${escapeHtml(event.event_url)}" target="_blank" rel="noopener">Watch on Apple's site</a></p>` : ''}
  <p><a href="/events/" class="gallery-nav-link">&larr; All Apple Events</a></p>
</article>`;
  return shell({
    title: `${event.heading} — Apple Sunset`,
    description: `${event.heading}${dateText ? `, ${dateText}` : ''}. ${sortedProducts.length ? 'Announced: ' + sortedProducts.join(', ') + '.' : ''}`,
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
  <a href="/admin/" class="admin-edit-link" style="display:none;">Admin</a>
</div>
${pageStandardLine(pageContent, `<p class="page-intro">A running record of every Apple Event announced here, and what was revealed at each one.</p>`)}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
<p id="no-events" class="page-intro" style="display:${events.length ? 'none' : ''};">No events yet. Add one in <a href="/admin/">/admin/</a>.</p>
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
  });
}

function factCardHtml(fact) {
  return `<div class="fact-card">
  <p class="fact-text">${escapeHtml(fact.text)}</p>
  <p class="fact-date">${formatDate(fact.created_at.slice(0, 10))}</p>
</div>`;
}

function factsPage({ facts, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const body = `
<div class="page-header-row">
  <h1>${pageHeading(pageContent, 'Facts')}</h1>
  <a href="/admin/" class="admin-edit-link" style="display:none;">Admin</a>
</div>
${pageStandardLine(pageContent, `<p class="page-intro">Interesting patterns spotted across every product tracked on this site.</p>`)}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
<p id="no-facts" class="page-intro" style="display:${facts.length ? 'none' : ''};">Nothing published yet.</p>
<div id="facts-list" class="facts-list" data-mode="facts">
  ${facts.map(factCardHtml).join('\n')}
</div>`;
  return shell({
    title: 'Facts — Apple Sunset',
    description: 'Interesting patterns spotted across every Apple product tracked on this site.',
    siteUrl,
    path: '/facts/',
    bodyHtml: body,
    supabaseUrl,
    supabaseAnonKey,
  });
}

function factBoxInnerHtml(fact) {
  return `<p class="fact-label">Did you know?</p>
    <p class="fact-text">${escapeHtml(fact.text)}</p>
    <a href="/facts/" class="fact-more-link">More facts &rarr;</a>`;
}

// A live countdown to whatever is next: a pinned Apple Event, or the
// nearest future release date. The days are rendered here so the page
// is correct before any script runs; the script only adds the clock.
function countdownHtml(countdown) {
  if (!countdown) return '';
  // Accepts one countdown or several, so more than one upcoming product
  // can be shown at once.
  const items = Array.isArray(countdown) ? countdown : [countdown];
  if (!items.length) return '';
  return items.map((item) => {
    const target = new Date(item.date + 'T09:00:00');
    const days = Math.max(0, Math.ceil((target.getTime() - Date.now()) / 86400000));
    return `<a class="countdown" href="${item.href}" data-countdown="${escapeHtml(item.date)}"${item.time ? ` data-countdown-time="${escapeHtml(item.time)}"` : ''}>
    <span class="countdown-label">Counting down to</span>
    <span class="countdown-name">${escapeHtml(item.label)}</span>
    <span class="countdown-clock" data-countdown-clock>
      <span class="countdown-unit"><span class="countdown-value">${days}</span><span class="countdown-unit-label">${days === 1 ? 'day' : 'days'}</span></span>
    </span>
    <span class="countdown-date">${formatDate(item.date)}${item.time ? ` &middot; ${escapeHtml(item.time)}` : ''}</span>
  </a>`;
  }).join('\n');
}

function homePage({ heroFeatured, heroRest, overdueItems, categoryLinks, totalCount, galleryPicks, productsBySlug, activeEvent, latestFact, pageContent, countdown, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const featuredSlotHtml = activeEvent
    ? eventCardHtml(activeEvent)
    : heroFeatured
    ? featuredCardHtml(heroFeatured.product, heroFeatured.status, productsBySlug)
    : '';
  const heroCardsHtml = heroFeatured || activeEvent
    ? `${featuredSlotHtml}${heroRest.map((r) => cardHtml(r.product, r.status)).join('\n')}`
    : emptyState('products');

  // Pills on desktop, a native picker on mobile: thirteen families wrap
  // into five rows on a phone, and a scrolling row would hide most of
  // them off the edge.
  const categoryLinksHtml = categoryLinks && categoryLinks.length
    ? `<div class="filter-bar homepage-category-links">
  <a class="filter-btn active" href="/products/">All <span class="filter-btn-count">(${totalCount})</span></a>
  ${categoryLinks.map((c) => `<a class="filter-btn" href="/categories/${slugify(c.category)}/">${escapeHtml(c.category)} <span class="filter-btn-count">(${c.count})</span></a>`).join('\n')}
</div>
<div class="homepage-category-select">
  <label class="sr-only" for="category-jump">Browse by family</label>
  <select id="category-jump" data-category-jump>
    <option value="/products/">All products (${totalCount})</option>
    ${categoryLinks.map((c) => `<option value="/categories/${slugify(c.category)}/">${escapeHtml(c.category)} (${c.count})</option>`).join('\n')}
  </select>
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

  const factSection = `<section class="homepage-section homepage-section--divided" id="fact-section" style="display:${latestFact ? '' : 'none'};">
  <div class="fact-box" id="fact-box">
    ${latestFact ? factBoxInnerHtml(latestFact) : ''}
  </div>
</section>`;

  const body = `
<section class="intro-hero">
  <div class="intro-hero-layout">
    <div class="intro-hero-text">
      <h1 class="intro-heading">${pageHeading(pageContent, 'Apple Sunset')}</h1>
      ${countdownHtml(countdown)}
      ${pageIntroHtml(pageContent, siteUrl, 'intro') || `<p class="intro-subtitle">Apple Sunset tracks how long it&rsquo;s been since every Apple product was last refreshed or discontinued.</p>
      <p class="intro-subtitle">See the latest refresh cycles, release timelines, and what&rsquo;s still current, all in one place.</p>`}
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
<div class="controls-row">
  <input type="search" id="search-input" class="search-input" placeholder="Search products…" aria-label="Search products">
  ${sortSelect(PRODUCT_SORT_OPTIONS)}
</div>
<div class="filter-panel">
  <div class="filter-group">
    <span class="filter-group-label">Show</span>
    ${filterBar('status', STATUS_VALUES, STATUS_LABELS, statusCounts, items.length, true, 'All')}
  </div>
  <div class="filter-group">
    <span class="filter-group-label">Family</span>
    ${filterBar('category', categories, null, categoryCounts, items.length, false)}
    <div class="family-select-wrap">
      <select class="family-select" data-family-select aria-label="Filter by family">
        <option value="">All families</option>
        ${categories.map((c, i) => `<option value="${escapeHtml(c)}">${escapeHtml(c)} (${categoryCounts[i]})</option>`).join('\n        ')}
      </select>
    </div>
  </div>
</div>
<p id="no-results" class="page-intro" style="display:none;">No products match your search.</p>
<div class="card-grid" id="grid" data-mode="all">
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
<div class="card-grid" id="grid" data-mode="discontinued">
  ${items.map((p) => cardHtml(p, null)).join('\n')}
</div>`
    : `
<h1>${pageHeading(pageContent, 'Discontinued products')}</h1>
<p class="page-intro">Nothing here yet. Tick Discontinued on a product in <a href="/admin/">/admin/</a> and give it a discontinued date, and it'll appear here.</p>`;
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

function categoriesIndexPage({ groups, pageContent, siteUrl, supabaseUrl, supabaseAnonKey }) {
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
<h1>${pageHeading(pageContent, 'Browse by category')}</h1>
${pageStandardLine(pageContent, `<p class="page-intro">Every product line on the site, current and discontinued.</p>`)}
${pageIntroHtml(pageContent, siteUrl, 'intro')}
<div class="category-grid">${tiles}</div>`;
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
  <td class="league-name"><a href="/products/${product.slug}/" class="league-name-link">${productIcon(product, 24)}<span>${escapeHtml(product.name)}</span></a></td>
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
    ? `<h2>Release history</h2>
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
  <input type="search" id="search-input" class="search-input" placeholder="Search ${escapeHtml(category)}…" aria-label="Search">
  ${sortSelect(PRODUCT_SORT_OPTIONS)}
</div>
${filterBar('status', STATUS_VALUES, STATUS_LABELS, statusCounts, items.length)}
<p id="no-results" class="page-intro" style="display:none;">No products match your search.</p>
<div id="category-timeline-section" style="display:${timelinePoints.length ? '' : 'none'};">
  ${releaseHistorySection}
</div>
${leagueTableHtml(items, category)}
${pageIntroHtml(pageContent, siteUrl, 'footer')}`;
  return shell({
    title: `${category}: release history and time since the last update | Apple Sunset`,
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
function relatedProductsHtml(product, productsBySlug, statusBySlug) {
  if (!productsBySlug) return '';
  const siblings = Object.keys(productsBySlug)
    .map((slug) => productsBySlug[slug])
    .filter((p) => p.slug !== product.slug && (p.category || '') === (product.category || ''))
    .sort((a, b) => {
      if (!!a.discontinued !== !!b.discontinued) return a.discontinued ? 1 : -1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 6);
  if (!siblings.length) return '';
  const cards = siblings.map((p) => {
    const status = statusBySlug ? statusBySlug[p.slug] : null;
    const line = p.discontinued
      ? `Discontinued${p.discontinued_date ? ' ' + formatDate(p.discontinued_date) : ''}`
      : status
      ? `${plural(status.daysSince, 'day', 'days')} since refresh`
      : '';
    return `<a class="related-card" href="/products/${p.slug}/">
      <span class="related-card-icon">${productIcon(p, 28)}</span>
      <span class="related-card-text">
        <span class="related-card-name">${escapeHtml(p.name)}</span>
        ${line ? `<span class="related-card-line">${line}</span>` : ''}
      </span>
    </a>`;
  }).join('\n');
  return `<section class="related-section">
    <h2>More in ${escapeHtml(product.category || 'this family')}</h2>
    <div class="related-grid">${cards}</div>
    <p class="see-all"><a class="intro-cta" href="/categories/${slugify(product.category || 'other')}/">All ${escapeHtml(product.category || 'products')} &rarr;</a></p>
  </section>`;
}

function keyFact(label, value) {
  return value ? `<div class="key-fact"><p class="key-fact-label">${label}</p><p class="key-fact-value">${value}</p></div>` : '';
}

function specRow(label, valueHtml) {
  return valueHtml ? `<div class="spec-row"><dt>${label}</dt><dd>${valueHtml}</dd></div>` : '';
}

function heroCycle(product, status, sortedDates, allProducts) {
  // The product's own gaps when it has enough history, otherwise the
  // family's real gaps, labelled so it is clear which is being shown.
  // Never the built-in category default, which is a guess.
  if (sortedDates.length > 1 && status) return { days: status.avgCycleDays, family: null };
  const fam = familyCadence((allProducts || []).filter((p) => (p.category || '') === (product.category || '')).map((p) => ({ product: p })));
  return fam ? { days: fam.avg, family: product.category || null } : null;
}

function heroStatHtml(product, statusInfo, cycleDays) {
  if (product.discontinued) {
    const date = product.discontinued_date ? ` ${formatDate(product.discontinued_date)}` : '';
    return `<p class="days-hero days-hero--discontinued">Discontinued${date}</p>`;
  }
  if (!statusInfo) return '';
  const info = badgeDaysInfo(product, statusInfo);
  if (info.days < 0) {
    const due = (product.refresh_history || []).slice().sort().pop();
    return `<p class="days-hero days-hero--upcoming"><span class="days-hero-label">Coming</span> <span class="days-hero-soon">${due ? formatDate(due) : 'soon'}</span></p>`;
  }
  // A bar showing how far through the family's usual gap this product is
  // gives the big number something to be measured against, and uses the
  // space the number alone leaves empty.
  let bar = '';
  if (cycleDays && cycleDays.days > 0) {
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
    const first = (product.refresh_history || []).slice().sort()[0];
    bar = `<span class="days-hero-caption">Apple has not updated this since it ${first ? `arrived on ${formatDate(first)}` : 'launched'}, so there is no refresh pattern to compare against yet.</span>`;
  }
  return `<p class="days-hero days-hero--${statusInfo.status}"><span class="days-hero-number">${info.days}</span> ${info.days === 1 ? 'day' : 'days'} ${info.suffix}${bar}</p>`;
}

function externalLinkLabel(product) {
  const isWiki = /wikipedia\.org/i.test(product.external_link || '');
  return `${product.name}${isWiki ? ' (Wiki)' : ''}`;
}

function productPage({ product, status, history, productsBySlug, statusBySlug, galleryPhotos, ogImage, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const sortedDates = history.slice().sort();
  const launch = product.original_launch_date || sortedDates[0] || null;
  const latest = sortedDates[sortedDates.length - 1] || null;

  const allProducts = productsBySlug ? Object.values(productsBySlug) : [product];
  const timelinePoints = categoryTimelinePoints(product, allProducts);
  const timelineHtml = verticalTimelineHtml(product, allProducts);
  // When the timeline above already lists exactly this product's own
  // dates, a Generations table underneath is the same data twice, unless
  // it carries announced dates the timeline doesn't show.
  const timelineCoversOnlyThisProduct = timelinePoints.every((pt) => pt.productName === product.name)
    && !productGenerations(product).some((g) => g.announced);

  const videoBlock = product.video_url
    ? `<video class="product-video" src="${product.video_url}" controls></video>`
    : '';

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
    keyFact('Latest release', latest ? formatDate(latest) : (launch ? formatDate(launch) : null)),
    keyFact('First release', launch && launch !== latest ? formatDate(launch) : null),
    keyFact('Typical cycle', status && !product.discontinued && sortedDates.length > 1 ? `About every ${plural(status.avgCycleDays, 'day', 'days')}` : null),
    (() => {
      if (!status || sortedDates.length <= 1 || product.discontinued) return '';
      const due = new Date(new Date(status.lastRefresh).getTime() + status.avgCycleDays * 86400000);
      const label = due.getTime() < Date.now() ? 'Was expected' : 'Next expected';
      return keyFact(label, due.toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }));
    })(),
    keyFact('Discontinued', product.discontinued && product.discontinued_date ? formatDate(product.discontinued_date) : null),
    keyFact('Lifespan', launch && product.discontinued && product.discontinued_date ? lifespanText(launch, product.discontinued_date) : null),
    keyFact('Starting price', product.price ? escapeHtml(formatPrice(product.price)) : null),
    keyFact('Releases so far', sortedDates.length > 1 ? String(sortedDates.length) : null),
  ].filter(Boolean).slice(0, 6).join('\n');

  const specs = [
    specRow('Category', categoryPill(product.category)),
    specRow('Status', product.discontinued ? 'Discontinued' : 'Current'),
    product.discontinued ? specRow('Apple support status', appleSupportStatus(product)) : '',
    sortedDates.length ? specRow('Release type', product.is_new_launch ? 'All-new product' : 'Refresh of an existing model') : '',
    daysInfo ? specRow('Days counted from', `${plural(daysInfo.days, 'day', 'days')} (${product.days_basis === 'launch' ? 'first release' : 'latest release'})`) : '',
    specRow('Chip', escapeHtml(product.chip)),
    specRow('Previous model', previousModelHtml),
    specRow('Replaced by', replacedByHtml),
    product.discontinued ? specRow('Why it went', escapeHtml(product.discontinued_reason)) : '',
    product.apple_url_unavailable
      ? specRow('Official Apple page', 'No longer available on Apple\u2019s website')
      : product.apple_url
      ? specRow('Official Apple page', `<a href="${product.apple_url}" target="_blank" rel="noopener">apple.com &#8599;</a>`)
      : '',
    product.specs_url ? specRow('Tech specs', `<a href="${product.specs_url}" target="_blank" rel="noopener">Apple specs &#8599;</a>`) : '',
    product.press_release_url ? specRow('Press release', `<a href="${product.press_release_url}" target="_blank" rel="noopener">Apple Newsroom &#8599;</a>`) : '',
    product.external_link ? specRow('More information', `<a href="${product.external_link}" target="_blank" rel="noopener">${escapeHtml(externalLinkLabel(product))} &#8599;</a>`) : '',
    product.discontinued ? '' : specRow('Waiting for a refresh', `<span class="wait-count-value">${product.waiting_count || 0}</span> ${(product.waiting_count || 0) === 1 ? 'person' : 'people'}`),
  ].filter(Boolean).join('\n');

  const releaseHistorySection = timelinePoints.length
    ? `<h2>Release history</h2>
  ${timelineHtml}`
    : '';

  const body = `
<article class="product-page">
  ${breadcrumbsHtml([
    { label: 'Home', href: '/' },
    { label: product.category || 'Products', href: `/categories/${slugify(product.category || 'other')}/` },
    { label: product.name },
  ])}
  <div class="product-top${product.video_url ? '' : ' product-top--no-media'}">
    ${product.video_url ? `<div class="product-media">
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
          <a href="/admin/?edit=${product.id}" class="admin-edit-link" style="display:none;">Edit this product</a>
          <button type="button" class="admin-edit-link tweet-btn" data-slug="${product.slug}" style="display:none;">Draft a post for X</button>
        </div>
      </div>

      <div class="product-facts">${heroStatHtml(product, status, heroCycle(product, status, sortedDates, allProducts))}${keyFacts}</div>

      ${product.discontinued ? '' : categoryStatsSentence(product.category || 'this family',
          allProducts.filter((p) => (p.category || '') === (product.category || '')).map((p) => ({ product: p })))}

      ${product.did_you_know ? `<aside class="did-you-know"><p class="did-you-know-label">Did you know?</p><p class="did-you-know-text">${escapeHtml(product.did_you_know)}</p></aside>` : ''}

      <dl class="spec-list spec-list--secondary">
        ${specs}
      </dl>

      ${product.discontinued ? '' : `<button class="wait-btn wait-btn--large" data-product-id="${product.id}" data-slug="${product.slug}" data-count="${product.waiting_count || 0}">
        Are you looking forward to a new ${escapeHtml(product.category)}?
      </button>`}
    </div>
  </div>

  <p class="report-line"><a class="report-link" href="/contact/?topic=Correction&amp;page=${encodeURIComponent(product.name)}&amp;url=${encodeURIComponent(`/products/${product.slug}/`)}">Something not right on this page? Tell us</a></p>

  ${product.rumor_note ? `<div class="callout"><p class="callout-label">Notes</p><div class="callout-body">${sanitizeRichText(product.rumor_note, siteUrl)}</div></div>` : ''}

  ${releaseHistorySection}

  ${timelineCoversOnlyThisProduct ? '' : generationsSectionHtml(product)}

  ${relatedProductsHtml(product, productsBySlug, statusBySlug)}

  ${relatedPhotos.length ? `<h2>From the gallery</h2>
  <div class="gallery-strip">
    ${relatedPhotos.map(galleryStripItemHtml).join('\n')}
  </div>` : ''}
</article>`;

  const description = product.discontinued
    ? `${product.name} was discontinued${product.discontinued_date ? ` in ${formatDate(product.discontinued_date)}` : ''}${launch ? `, after launching in ${formatDate(launch)}` : ''}.${successor ? ` It was replaced by the ${successor.name}.` : ''}`
    : status
    ? `${product.name} was last refreshed ${plural(status.daysSince, 'day', 'days')} ago. See every generation and the full release history.`
    : `${product.name} on Apple Sunset.`;

  return shell({
    title: product.discontinued
      ? `${product.name}: discontinued${product.discontinued_date ? ' ' + formatDate(product.discontinued_date) : ''} | Apple Sunset`
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
        {
          '@type': 'Product',
          name: product.name,
          category: product.category,
          releaseDate: launch || undefined,
          url: `${siteUrl}/products/${product.slug}/`,
          brand: { '@type': 'Brand', name: 'Apple' },
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

function aboutPage({ content, siteUrl, supabaseUrl, supabaseAnonKey }) {
  const paragraphs = (content.body || '')
    .split('\n\n')
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  const body = `
<article class="about-page">
  <h1>${escapeHtml(content.heading || 'About Apple Sunset')}</h1>
  ${content.image_url ? `<div class="about-image"><img src="${content.image_url}" alt=""></div>` : ''}
  <div class="about-body">${paragraphs}</div>
</article>`;

  return shell({
    title: 'About — Apple Sunset',
    description: 'What Apple Sunset is and why it exists.',
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
    <input type="date" id="${prefix}_day" class="date-precision-input" autocomplete="off">
    <input type="month" id="${prefix}_month" class="date-precision-input" style="display:none;">
    <input type="number" id="${prefix}_year" class="date-precision-input" style="display:none;" placeholder="YYYY" min="1970" max="2035" autocomplete="off">
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
      <button type="button" class="admin-tab-btn" data-tab="families">Families</button>
      <button type="button" class="admin-tab-btn" data-tab="gallery">Gallery</button>
      <button type="button" class="admin-tab-btn" data-tab="event">Apple Event</button>
      <button type="button" class="admin-tab-btn" data-tab="facts">Facts</button>
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
    <div id="product-list-view">
      <input type="search" id="product-search-input" class="admin-search-input" placeholder="Search every product by name…" aria-label="Search products" autocomplete="off">
      <div id="family-screen">
        <h2 class="admin-screen-title"><span class="admin-step-num">1</span> Pick a family</h2>
        <div id="family-tiles" class="family-tiles" aria-label="Families"></div>
      </div>
      <div id="products-screen" style="display:none;">
        <button type="button" id="back-to-families-btn" class="admin-back-link">&larr; All families</button>
        <h2 class="admin-screen-title"><span class="admin-step-num">2</span> Pick a product <span id="products-screen-family" class="admin-screen-family"></span></h2>
        <div id="product-list" class="line-card-grid"></div>
      </div>
      <div id="search-screen" style="display:none;">
        <div id="search-results" class="line-card-grid"></div>
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
            </div>
            <p class="admin-hint">Replaces the built-in shape for every product in this family.</p>
          </div>
          <p id="family-error" class="form-error"></p>
        </section>

        <section class="admin-step" id="step-line">
          <h3 class="admin-step-title"><span class="admin-step-num">2</span> Product</h3>
          <label>Name<input type="text" id="name" placeholder="e.g. AirPods Pro" autocomplete="off"></label>
          <p id="name-error" class="form-error"></p>
          <label class="checkbox-label checkbox-label--feature"><input type="checkbox" id="featured"> &#9733; Feature this product on the homepage</label>
          <div id="in-countdown-wrap" style="display:none;">
            <label class="checkbox-label"><input type="checkbox" id="in_countdown"> &#9201; Show in the homepage countdown</label>
            <p class="admin-hint">Only for a product whose release date is still ahead. More than one can be counted down at once, and each drops off by itself once its date passes.</p>
          </div>
          <p class="admin-hint">Only one product can be featured. Choosing this one un-features the current one.</p>
          <div class="admin-subfield">
            <span class="admin-subfield-label">Icon for this product <span class="admin-optional">Optional</span></span>
            <div class="admin-icon-row">
              <div id="product-icon-thumb" class="admin-thumbs"></div>
              <label for="product-icon-upload" class="admin-btn admin-btn--small admin-btn--primary">Upload icon</label>
              <input type="file" id="product-icon-upload" accept="image/*" class="admin-file-input">
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
            <span class="admin-subfield-label">Starting price <span class="admin-optional">Optional</span></span>
            <div class="price-currency-row">
              <div class="segmented segmented--small" role="radiogroup" aria-label="Currency">
                <label><input type="radio" name="price_currency" value="&pound;"><span>&pound;</span></label>
                <label><input type="radio" name="price_currency" value="$" checked><span>$</span></label>
              </div>
              <input type="text" id="price" placeholder="799" inputmode="decimal" autocomplete="off">
            </div>
          </div>

          <div class="admin-subfield">
            <label><span class="admin-label-row">Did you know? <span class="admin-optional">Optional, shown near the top of the product page</span></span><textarea id="did_you_know" rows="2" maxlength="320" placeholder="One short, surprising fact about this product."></textarea></label>
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
            <p class="admin-hint">&ldquo;Mark it discontinued&rdquo; sets its discontinued date to this product&rsquo;s first release date and points it here.</p>
          </div>
          <div id="discontinued-fields" class="admin-discontinued-fields" style="display:none;">
            <label><span class="admin-label-row">Replaced by <span class="admin-optional">Optional</span></span><select id="replaced_by"></select></label>
            <label><span class="admin-label-row">Why it went <span class="admin-optional">Optional</span></span><textarea id="discontinued_reason" rows="2"></textarea></label>
          </div>
        </section>

        <section class="admin-step" id="step-links">
          <h3 class="admin-step-title"><span class="admin-step-num">5</span> Links <span class="admin-optional">All optional</span></h3>
          <p class="admin-hint">Tap a Find button to open a search for this product in a new tab, then paste the address back into the box.</p>
          <label>Apple product page<input type="url" id="apple_url" placeholder="https://www.apple.com/airpods-pro/" autocomplete="off"></label>
          <div><button type="button" class="admin-btn admin-btn--small admin-btn--ghost" data-find-link="apple">Find on apple.com</button></div>
          <label class="checkbox-label"><input type="checkbox" id="apple_url_unavailable"> Apple has taken this page down</label>
          <label>Apple specs page<input type="url" id="specs_url" placeholder="https://support.apple.com/en-gb/111854" autocomplete="off"></label>
          <div><button type="button" class="admin-btn admin-btn--small admin-btn--ghost" data-find-link="specs">Find tech specs</button></div>
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
          <div id="video-status" class="admin-video-status">No video uploaded.</div>
          <div>
            <label for="video-upload" class="admin-btn admin-btn--small admin-btn--primary">Add video</label>
            <input type="file" id="video-upload" accept="video/*" class="admin-file-input">
          </div>
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
    <p class="admin-hint">Whichever event has the soonest upcoming date automatically replaces the regular featured product on the homepage until that date passes, then it becomes part of this permanent archive and the site goes back to showing a featured product on its own, no need to remove anything manually.</p>
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
        <p class="admin-hint">Only one event can be featured. Leave this unticked and the homepage shows the next event by date, as it does now.</p>
        <label>Event time (optional, your own wording, e.g. "10am PT")<input type="text" id="event_time" placeholder="10am PT" autocomplete="off"></label>
        <label>Link to Apple's event page (optional)<input type="url" id="event_url" placeholder="https://www.apple.com/apple-events/" autocomplete="off"></label>
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


  <div id="tab-facts" class="admin-tab-panel" style="display:none;">
    <p class="admin-hint">Computed from your current product data (release dates, categories, refresh cycles). Only patterns with a reasonable sample size behind them are shown, small datasets won't produce a fact until there's enough to say something real. Regenerate any time you've added more products.</p>
    <button type="button" id="generate-facts-btn" class="admin-btn admin-btn--primary">Generate facts</button>
    <div id="fact-candidates" class="admin-fact-list"></div>

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
  eventDetailPage,
  factsPage,
  setCustomCategoryIcons,
  homePage,
  allProductsPage,
  discontinuedPage,
  categoriesIndexPage,
  categoryPage,
  productPage,
  aboutPage,
  contactPage,
  contactThanksPage,
  notFoundPage,
  adminPage,
  cardHtml,
  productBadge,
  slugify,
  eventSlug,
  galleryPhotoSlug,
  rssFeedXml,
  mostRecentActivityDate,
};
