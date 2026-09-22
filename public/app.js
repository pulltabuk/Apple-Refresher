(function () {
  // --- Shared helpers: a JS port of src/status.js and the card/badge/spec
  // markup from src/templates.js, used to render live data client-side.
  // Keep these in sync with those files if the logic there changes.

  var CATEGORY_DEFAULT_CYCLE_DAYS = {
    iPhone: 365, Mac: 500, iPad: 450, 'Apple Watch': 365, AirPods: 730, Other: 400,
  };

  function computeStatusJS(product) {
    var history = (product.refresh_history || [])
      .map(function (d) { return new Date(d); })
      .sort(function (a, b) { return a - b; });
    var lastRefresh = history[history.length - 1];
    if (!lastRefresh) return null;
    var daysSince = Math.floor((new Date() - lastRefresh) / 86400000);
    var avgCycleDays;
    if (history.length >= 2) {
      var totalGapMs = 0;
      for (var i = 1; i < history.length; i++) totalGapMs += history[i] - history[i - 1];
      avgCycleDays = Math.round(totalGapMs / (history.length - 1) / 86400000);
    } else {
      avgCycleDays = CATEGORY_DEFAULT_CYCLE_DAYS[product.category] || CATEGORY_DEFAULT_CYCLE_DAYS.Other;
    }
    var ratio = daysSince / avgCycleDays;
    var status = ratio < 0.5 ? 'fresh' : ratio < 1.0 ? 'aging' : 'overdue';
    return { daysSince: daysSince, avgCycleDays: avgCycleDays, ratio: ratio, status: status, lastRefresh: lastRefresh };
  }

  function escapeHtmlJS(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function readableSlugFallbackJS(value) {
    return escapeHtmlJS(String(value || '').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }));
  }

  function slugifyJS(str) {
    return String(str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  }

  // Must stay in step with eventSlug() in src/templates.js, or a card
  // rendered client-side will link to a page the build never wrote.
  // Must stay in step with galleryPhotoSlug() in src/templates.js.
  function galleryPhotoSlugJS(photo) {
    var base = photo.caption || (photo.tags && photo.tags[0]) || '';
    var slug = slugifyJS(String(base).replace(/['\u2019]/g, ''));
    if (slug.length > 70) slug = slug.slice(0, 70).replace(/-[^-]*$/, '');
    if (photo.date_taken && !/\d{4}/.test(slug)) {
      var d = new Date(photo.date_taken);
      if (!isNaN(d)) {
        var months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        slug = [slug, months[d.getUTCMonth()] + '-' + d.getUTCFullYear()].filter(Boolean).join('-');
      }
    }
    return slug || String(photo.id);
  }

  function eventSlugJS(event) {
    var heading = slugifyJS(String(event.heading || '').replace(/['\u2019]/g, ''));
    var datePart = '';
    if (event.event_date) {
      var d = new Date(event.event_date);
      if (!isNaN(d)) {
        var months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        datePart = months[d.getUTCMonth()] + '-' + d.getUTCFullYear();
      }
    }
    var slug = [heading, datePart].filter(Boolean).join('-');
    return slug || String(event.id);
  }

  function datePrecisionJS(str) {
    if (!str) return null;
    if (/^\d{4}$/.test(str)) return 'year';
    if (/^\d{4}-\d{2}$/.test(str)) return 'month';
    return 'day';
  }

  function formatDateJS(str) {
    if (!str) return '';
    var precision = datePrecisionJS(str);
    if (precision === 'year') return str;
    if (precision === 'month') {
      var parts = str.split('-');
      return new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' });
    }
    return new Date(str).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function sortedHistoryJS(product) {
    return (product.refresh_history || []).slice().sort();
  }

  function launchDateJS(product) {
    var h = sortedHistoryJS(product);
    return h.length ? h[0] : null;
  }

  function monthsBetweenJS(a, b) {
    var start = new Date(a), end = new Date(b);
    var months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (end.getDate() < start.getDate()) months -= 1;
    return Math.max(0, months);
  }

  function normaliseGroupKeyJS(value) {
    return (value || '').trim().toLowerCase();
  }

  // --- Generations: mirrors the helpers in src/templates.js so the live
  // refresh of a product page shows exactly what the build produced.

  function ordinalJS(n) {
    var suffixes = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  }

  function generationDetailsJS(product) {
    var d = product && product.generation_details;
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  }

  function autoGenerationNameJS(product, index, total) {
    if (total <= 1) return product.name;
    return product.name + ' (' + ordinalJS(index + 1) + ' generation)';
  }

  function storedGenerationNameJS(product, date) {
    var info = generationDetailsJS(product)[date];
    return info && info.name && String(info.name).trim() ? String(info.name).trim() : null;
  }

  function productGenerationsJS(product) {
    var details = generationDetailsJS(product);
    var seen = {};
    var dates = (product.refresh_history || []).filter(function (d) {
      if (seen[d]) return false;
      seen[d] = true;
      return true;
    }).sort();
    var today = new Date().toISOString().slice(0, 10);
    return dates.map(function (date, i) {
      var info = details[date] || {};
      var next = dates[i + 1] || null;
      var end = next || (product.discontinued ? product.discontinued_date || null : today);
      var stored = storedGenerationNameJS(product, date);
      return {
        date: date,
        name: stored || autoGenerationNameJS(product, i, dates.length),
        hasStoredDetails: !!(stored || info.announced),
        announced: info.announced || null,
        end: end,
        isCurrent: !next && !product.discontinued,
      };
    });
  }

  function generationsSectionHtmlJS(product) {
    var gens = productGenerationsJS(product);
    if (!gens.length) return '';
    if (gens.length < 2 && !gens.some(function (g) { return g.hasStoredDetails; })) return '';
    var showAnnounced = gens.some(function (g) { return g.announced; });
    var rows = gens.slice().reverse().map(function (g) {
      var onMarket = g.end ? lifespanTextJS(g.date, g.end) + (g.isCurrent ? ' so far' : '') : '\u2013';
      return '<tr class="generation-row' + (g.isCurrent ? ' generation-row--current' : '') + '">' +
        '<td class="generation-name">' + escapeHtmlJS(g.name) + (g.isCurrent ? ' <span class="generation-current-pill">Current</span>' : '') + '</td>' +
        (showAnnounced ? '<td>' + (g.announced ? formatDateJS(g.announced) : '\u2013') + '</td>' : '') +
        '<td>' + formatDateJS(g.date) + '</td>' +
        '<td>' + onMarket + '</td>' +
        '</tr>';
    }).join('');
    return '<h2>Generations</h2><div class="generations-table-wrap"><table class="generations-table">' +
      '<thead><tr><th>Generation</th>' + (showAnnounced ? '<th>Announced</th>' : '') + '<th>Released</th><th>Time on market</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function categoryTimelinePointsJS(product, allProducts) {
    var groupKey = normaliseGroupKeyJS(product.timeline_name || product.category);
    var sameCategory = (allProducts || []).filter(function (p) { return normaliseGroupKeyJS(p.timeline_name || p.category) === groupKey; });

    var singleLine = sameCategory.length === 1;
    var pointNameJS = function (p, d) {
      if (!singleLine) return storedGenerationNameJS(p, d);
      var gen = productGenerationsJS(p).filter(function (g) { return g.date === d; })[0];
      return gen ? gen.name : storedGenerationNameJS(p, d);
    };
    var seenKeys = {};
    var dateEntries = [];
    sameCategory.forEach(function (p) {
      (p.refresh_history || []).forEach(function (d) {
        var key = d + '|' + p.name;
        if (seenKeys[key]) return;
        seenKeys[key] = true;
        dateEntries.push({ date: d, productName: p.name, displayName: pointNameJS(p, d) });
      });
    });
    var sortedEntries = dateEntries.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    var launchCandidates = sameCategory.map(function (p) { return p.original_launch_date; }).filter(Boolean);
    var lineLaunch = launchCandidates.length
      ? launchCandidates.reduce(function (earliest, d) { return d < earliest ? d : earliest; })
      : (sortedEntries.length ? sortedEntries[0].date : null);
    var launchOwnerFromField = sameCategory.filter(function (p) { return p.original_launch_date === lineLaunch; })[0];
    var launchEntry = sortedEntries.filter(function (e) { return e.date === lineLaunch; })[0];
    var launchOwnerName = launchOwnerFromField ? launchOwnerFromField.name : (launchEntry ? launchEntry.productName : null);

    var points = [];
    var launchOwner = sameCategory.filter(function (p) { return p.name === (launchOwnerName || product.name); })[0];
    if (lineLaunch) points.push({ date: lineLaunch, label: 'Launch', type: 'launch', productName: launchOwnerName || product.name, displayName: launchOwner ? pointNameJS(launchOwner, lineLaunch) : null });
    var launchConsumed = false;
    sortedEntries.forEach(function (e) {
      if (!launchConsumed && e.date === lineLaunch && e.productName === (launchOwnerName || product.name)) {
        launchConsumed = true;
        return;
      }
      points.push({ date: e.date, label: 'Refresh', type: 'refresh', productName: e.productName, displayName: e.displayName });
    });

    sameCategory.forEach(function (p) {
      if (p.discontinued && p.discontinued_date) {
        points.push({ date: p.discontinued_date, label: 'Discontinued', type: 'discontinued', productName: p.name });
      }
    });
    // Must stay in step with categoryTimelinePoints() in src/templates.js.
    var todayStr = new Date().toISOString().slice(0, 10);
    sameCategory.forEach(function (p) {
      if (p.discontinued) return;
      var mine = points.filter(function (pt) {
        return pt.productName === p.name && pt.type !== 'discontinued' && pt.date <= todayStr;
      }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var newest = mine[mine.length - 1];
      if (newest) newest.isCurrent = true;
    });

    var typePriority = { discontinued: 0, launch: 1, refresh: 1 };
    points.sort(function (a, b) { return a.date !== b.date ? (a.date < b.date ? -1 : 1) : typePriority[a.type] - typePriority[b.type]; });
    return points;
  }

  var TIMELINE_ICONS_JS = {
    launch: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 2.5 14 13H2z" fill="currentColor"/></svg>',
    refresh: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="currentColor"/></svg>',
    discontinued: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>'
  };

  function pluralJS(count, one, many) {
    return count + ' ' + (count === 1 ? one : many);
  }

  function timelineGapTextJS(earlier, later) {
    var days = daysBetweenJS(earlier, later);
    if (days < 45) return '';
    var years = Math.round(days / 365.25);
    if (years >= 1 && Math.abs(days - years * 365.25) <= 45) {
      return 'about ' + years + ' year' + (years === 1 ? '' : 's') + ' later';
    }
    var months = monthsBetweenJS(earlier, later);
    if (months < 12) return months + ' month' + (months === 1 ? '' : 's') + ' later';
    return lifespanTextJS(earlier, later) + ' later';
  }

  // Mirrors verticalTimelineHtml in src/templates.js.
  function verticalTimelineHtmlJS(product, allProducts) {
    var points = categoryTimelinePointsJS(product, allProducts);
    if (!points.length) return '';
    var byDate = {};
    var dates = [];
    points.forEach(function (pt) {
      if (!byDate[pt.date]) { byDate[pt.date] = []; dates.push(pt.date); }
      byDate[pt.date].push(pt);
    });
    dates.sort().reverse();
    var today = new Date().toISOString().slice(0, 10);
    var newestRelease = dates.filter(function (d) {
      return byDate[d].some(function (pt) { return pt.type !== 'discontinued'; });
    })[0];
    var sinceDays = newestRelease ? daysBetweenJS(newestRelease, today) : null;
    var nowNode = !product.discontinued && sinceDays !== null && sinceDays >= 0
      ? '<li class="tl-now"><span class="tl-marker tl-marker--now" aria-hidden="true">&#9679;</span>' +
        '<div class="tl-body"><p class="tl-now-text">Today &middot; ' + pluralJS(sinceDays, 'day', 'days') + ' since the last release</p></div></li>'
      : '';
    var lastYear = null;
    var rows = dates.map(function (date, i) {
      var entries = byDate[date];
      var type = entries.some(function (e) { return e.type !== 'discontinued'; })
        ? (entries.some(function (e) { return e.type === 'launch'; }) ? 'launch' : 'refresh')
        : 'discontinued';
      var year = String(date).slice(0, 4);
      var yearRow = year !== lastYear ? '<li class="tl-year"><span>' + year + '</span></li>' : '';
      lastYear = year;
      var nextDate = dates[i + 1];
      var gap = nextDate ? timelineGapTextJS(nextDate, date) : '';
      var gapRow = gap ? '<li class="tl-gap"><span class="tl-gap-text">&#8593; ' + gap + '</span></li>' : '';
      var ordered = entries.slice().sort(function (a, b) {
        var rank = function (e) { return e.type === 'discontinued' ? 1 : 0; };
        return rank(a) - rank(b);
      });
      var lines = ordered.map(function (e) {
        return '<p class="tl-entry"><span class="tl-entry-name">' + escapeHtmlJS(e.displayName || e.productName) + '</span>' +
          (function () {
            var tags = (e.type === 'refresh' ? '' : '<span class="tl-entry-type tl-entry-type--' + e.type + '">' + e.label + '</span>') +
              (e.isCurrent ? '<span class="tl-entry-type tl-entry-type--current">Current</span>' : '');
            return tags ? '<span class="tl-entry-tags">' + tags + '</span>' : '';
          })() + '</p>';
      }).join('');
      return yearRow + '<li class="tl-item tl-item--' + type + '">' +
        '<span class="tl-marker tl-marker--' + type + '">' + (TIMELINE_ICONS_JS[type] || TIMELINE_ICONS_JS.refresh) + '</span>' +
        '<div class="tl-body"><p class="tl-date">' + formatDateJS(date) +
          (date > new Date().toISOString().slice(0, 10) ? ' <span class="tl-upcoming">Upcoming</span>' : '') +
        '</p>' + lines + '</div></li>' + gapRow;
    }).join('');
    return '<ol class="tl">' + nowNode + rows + '</ol>';
  }

  function horizontalTimelineHtmlJS(product, allProducts) {
    var points = categoryTimelinePointsJS(product, allProducts);
    if (!points.length) return '';

    var groups = [];
    var gi = 0;
    while (gi < points.length) {
      var gj = gi + 1;
      while (gj < points.length && points[gj].date === points[gi].date) gj++;
      groups.push(points.slice(gi, gj));
      gi = gj;
    }

    var entryHtmlJS = function (pt) {
      return '<div class="timeline-point-entry">' +
        '<p class="timeline-point-name">' + escapeHtmlJS(pt.displayName || pt.productName) + '</p>' +
        '<p class="timeline-point-label">' + pt.label + '</p>' +
        '<p class="timeline-point-date">' + formatDateJS(pt.date) + '</p>' +
      '</div>';
    };

    var POINTS_PER_ROW = 4;
    var rows = [];
    for (var ri = 0; ri < groups.length; ri += POINTS_PER_ROW) {
      rows.push(groups.slice(ri, ri + POINTS_PER_ROW));
    }

    var rowsHtml = rows.map(function (row, rowIndex) {
      var maxStack = 1;
      row.forEach(function (group) {
        if (group.length >= 2) {
          var aboveCount2 = group.filter(function (e) { return e.type !== 'discontinued'; }).length;
          var belowCount2 = group.filter(function (e) { return e.type === 'discontinued'; }).length;
          maxStack = Math.max(maxStack, aboveCount2, belowCount2);
        }
      });
      var rowPadding = 100 + (maxStack - 1) * 60;

      var items = row.map(function (group, i) {
        var leftLine = i > 0 ? '<span class="timeline-point-line-half timeline-point-line-half--left"></span>' : '';
        var rightLine = i < row.length - 1 ? '<span class="timeline-point-line-half timeline-point-line-half--right"></span>' : '';
        if (group.length >= 2) {
          var aboveEntries = group.filter(function (e) { return e.type !== 'discontinued'; });
          var belowEntries = group.filter(function (e) { return e.type === 'discontinued'; });
          return '<div class="timeline-point timeline-point--merged">' +
            leftLine + rightLine +
            '<span class="timeline-dot"></span>' +
            '<div class="timeline-point-content timeline-point-content--above">' + aboveEntries.map(entryHtmlJS).join('') + '</div>' +
            '<div class="timeline-point-content timeline-point-content--below">' + belowEntries.map(entryHtmlJS).join('') + '</div>' +
          '</div>';
        }
        var pt = group[0];
        var side = pt.type === 'discontinued' ? 'below' : 'above';
        return '<div class="timeline-point timeline-point--' + pt.type + ' timeline-point--' + side + '">' +
          leftLine + rightLine +
          '<span class="timeline-dot"></span>' +
          '<div class="timeline-point-content">' + entryHtmlJS(pt) + '</div>' +
        '</div>';
      }).join('');
      var continues = rowIndex < rows.length - 1 ? ' timeline-horizontal--continues' : '';
      return '<div class="timeline-horizontal' + continues + '" style="padding-top:' + rowPadding + 'px;padding-bottom:' + rowPadding + 'px;">' + items + '</div>';
    }).join('');
    return rows.length > 1 ? '<div class="timeline-rows">' + rowsHtml + '</div>' : rowsHtml;
  }

  function appleSupportStatusJS(product) {
    if (!product.discontinued || !product.discontinued_date) return null;
    var years = daysBetweenJS(product.discontinued_date, new Date().toISOString().slice(0, 10)) / 365.25;
    if (years >= 7) return 'Obsolete (Apple no longer services it)';
    if (years >= 5) return 'Vintage (limited repairs, subject to parts)';
    return 'Discontinued, not yet Vintage';
  }

  function lifespanTextJS(start, end) {
    var days = Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000));
    if (days < 31) return days + ' day' + (days === 1 ? '' : 's');
    var months = monthsBetweenJS(start, end);
    var years = Math.floor(months / 12), rem = months % 12, parts = [];
    if (years) parts.push(years + ' year' + (years === 1 ? '' : 's'));
    if (rem || !years) parts.push(rem + ' month' + (rem === 1 ? '' : 's'));
    return parts.join(', ');
  }

  function daysBetweenJS(a, b) {
    return Math.floor((new Date(b) - new Date(a)) / 86400000);
  }

  function formatPriceJS(price) {
    if (!price) return null;
    var trimmed = String(price).trim();
    return /^[£$€]/.test(trimmed) ? trimmed : '£' + trimmed;
  }

  function statusKeyJS(product) {
    if (product.discontinued) return 'discontinued';
    return 'current';
  }

  var CATEGORY_ICON_SHAPES = {
    iPhone: '<rect x="13" y="4" width="14" height="32" rx="3"/><line x1="17" y1="31" x2="23" y2="31"/>',
    Mac: '<rect x="8" y="9" width="24" height="16" rx="1.5"/><path d="M5 30h30l-2.5-3h-25z"/>',
    iPad: '<rect x="7" y="8" width="26" height="24" rx="3"/><line x1="19" y1="27" x2="21" y2="27"/>',
    'Apple Watch': '<rect x="12" y="10" width="16" height="20" rx="5"/><rect x="27.5" y="17" width="3" height="6" rx="1"/>',
    AirPods: '<path d="M14 10c-3 0-5 2-5 5v9c0 2 1.5 3 3 3s3-1 3-3V13"/><path d="M26 10c3 0 5 2 5 5v9c0 2-1.5 3-3 3s-3-1-3-3V13"/>',
    'Vision Pro': '<path d="M6 18c0-4 3-6 14-6s14 2 14 6-3 6-14 6S6 22 6 18z"/><circle cx="15" cy="18" r="2.5"/><circle cx="25" cy="18" r="2.5"/>',
    'Apple TV': '<rect x="9" y="9" width="22" height="22" rx="4"/><text x="20" y="24" font-size="9" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">TV</text>',
    AirTag: '<circle cx="20" cy="20" r="14"/><circle cx="20" cy="20" r="10.5"/>',
    'Apple Pencil': '<path d="M17 6c0-1.5 1.3-2.5 3-2.5s3 1 3 2.5v22l-3 8-3-8V6z"/><line x1="20" y1="9" x2="20" y2="14"/>',
    Other: '<rect x="8" y="8" width="24" height="24" rx="4"/>',
  };

  var CUSTOM_CATEGORY_ICONS = {};

  function refreshCustomIconsInDomJS() {
    document.querySelectorAll('[data-category]').forEach(function (el) {
      var category = el.getAttribute('data-category');
      var iconEl = el.querySelector('.placeholder-icon');
      if (!iconEl || iconEl.tagName === 'IMG') return;
      var customKey = Object.keys(CUSTOM_CATEGORY_ICONS).find(function (k) { return k.toLowerCase() === String(category || '').toLowerCase(); });
      if (!customKey) return;
      var size = iconEl.getAttribute('width') || 40;
      var newIcon = document.createElement('img');
      newIcon.className = 'placeholder-icon';
      newIcon.src = CUSTOM_CATEGORY_ICONS[customKey];
      newIcon.alt = '';
      newIcon.width = size;
      newIcon.height = size;
      newIcon.style.objectFit = 'contain';
      iconEl.replaceWith(newIcon);
    });
  }

  function fetchCustomCategoryIconsJS() {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
    fetch(window.SUPABASE_URL + '/rest/v1/category_icons?select=*', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    })
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        if (!Array.isArray(rows)) return;
        rows.forEach(function (row) { CUSTOM_CATEGORY_ICONS[row.category] = row.icon_url; });
        refreshCustomIconsInDomJS();
      })
      .catch(function () {});
  }
  fetchCustomCategoryIconsJS();

  // Every word must appear somewhere, in any order, so "Watch 12" finds
  // "Apple Watch Series 12". Used by the header dropdown and the filters.
  function matchesSearchJS(haystack, query) {
    var words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    var text = String(haystack || '').toLowerCase();
    return words.every(function (word) { return text.indexOf(word) !== -1; });
  }

  // --- Site-wide header search dropdown ---

  var siteSearchForm = document.querySelector('.site-search');
  if (siteSearchForm) {
    var siteSearchInput = siteSearchForm.querySelector('input');
    var searchProductsCache = null;
    var searchProductsPromise = null;
    var activeDropdown = null;
    var activeDropdownIndex = -1;

    function fetchSearchProducts() {
      if (searchProductsPromise) return searchProductsPromise;
      // Products and events in one request each, so the dropdown can
      // answer "AirPods" with the family, the products, and the event
      // where they were announced.
      var headers = { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY };
      searchProductsPromise = window.SUPABASE_URL && window.SUPABASE_ANON_KEY
        ? Promise.all([
            fetch(window.SUPABASE_URL + '/rest/v1/products?select=id,name,slug,category,icon_url,discontinued', { headers })
              .then(function (res) { return res.json(); }).catch(function () { return []; }),
            fetch(window.SUPABASE_URL + '/rest/v1/apple_events?select=id,heading,event_date,announced_products', { headers })
              .then(function (res) { return res.json(); }).catch(function () { return []; }),
          ]).then(function (both) {
            searchProductsCache = {
              products: Array.isArray(both[0]) ? both[0] : [],
              events: Array.isArray(both[1]) ? both[1] : [],
            };
            return searchProductsCache;
          })
        : Promise.resolve({ products: [], events: [] });
      return searchProductsPromise;
    }

    function closeSearchDropdown() {
      if (activeDropdown) {
        activeDropdown.remove();
        activeDropdown = null;
      }
      activeDropdownIndex = -1;
    }

    function renderSearchDropdown(matches, query) {
      closeSearchDropdown();
      var dropdown = document.createElement('div');
      dropdown.className = 'site-search-dropdown';
      if (!matches.length) {
        var empty = document.createElement('div');
        empty.className = 'site-search-dropdown-empty';
        empty.textContent = query ? 'No products match "' + query + '"' : 'Start typing a product name';
        dropdown.appendChild(empty);
      } else {
        var lastKind = null;
        matches.slice(0, 10).forEach(function (m) {
          if (m.kind !== lastKind) {
            var head = document.createElement('p');
            head.className = 'site-search-dropdown-head';
            head.textContent = m.kind === 'product' ? 'Products' : m.kind === 'category' ? 'Families' : 'Apple Events';
            dropdown.appendChild(head);
            lastKind = m.kind;
          }
          var link = document.createElement('a');
          link.href = m.href;
          link.innerHTML = m.iconHtml + '<span>' + escapeHtmlJS(m.label) + '</span>' +
            (m.note ? '<span class="site-search-note">' + escapeHtmlJS(m.note) + '</span>' : '');
          dropdown.appendChild(link);
        });
      }
      siteSearchForm.appendChild(dropdown);
      activeDropdown = dropdown;
    }

    siteSearchInput.addEventListener('input', function () {
      var query = siteSearchInput.value.trim().toLowerCase();
      if (!query) {
        closeSearchDropdown();
        return;
      }
      fetchSearchProducts().then(function (data) {
        var products = data.products || [];
        var events = data.events || [];
        var matches = [];

        // Families first: one row that covers every product in it.
        var families = {};
        products.forEach(function (p) {
          var name = (p.category || '').trim();
          if (name) families[name.toLowerCase()] = name;
        });
        Object.keys(families).sort().forEach(function (key) {
          var name = families[key];
          if (!matchesSearchJS(name, query)) return;
          var count = products.filter(function (p) { return (p.category || '').toLowerCase() === key; }).length;
          matches.push({ kind: 'category', label: name, href: '/categories/' + slugifyJS(name) + '/',
            iconHtml: categoryIconJS(name, 22), note: count + (count === 1 ? ' product' : ' products') });
        });

        products.filter(function (p) { return matchesSearchJS(p.name + ' ' + (p.category || ''), query); })
          .forEach(function (p) {
            matches.push({ kind: 'product', label: p.name, href: '/products/' + p.slug + '/',
              iconHtml: productIconJS(p, 22), note: p.discontinued ? 'Discontinued' : '' });
          });

        // An event matches on its title or on anything announced there.
        events.forEach(function (ev) {
          var announced = (ev.announced_products || []).map(function (a) { return typeof a === 'string' ? a : a.name; });
          if (!matchesSearchJS((ev.heading || '') + ' ' + announced.join(' '), query)) return;
          matches.push({ kind: 'event', label: ev.heading || 'Apple Event', href: '/events/' + eventSlugJS(ev) + '/',
            iconHtml: '<span class="site-search-event-dot" aria-hidden="true"></span>',
            note: ev.event_date ? formatDateJS(ev.event_date) : '' });
        });

        renderSearchDropdown(matches, query);
      });
    });

    siteSearchInput.addEventListener('focus', function () {
      if (siteSearchInput.value.trim()) siteSearchInput.dispatchEvent(new Event('input'));
    });

    siteSearchInput.addEventListener('keydown', function (e) {
      if (!activeDropdown) return;
      var links = activeDropdown.querySelectorAll('a');
      if (!links.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeDropdownIndex = Math.min(activeDropdownIndex + 1, links.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeDropdownIndex = Math.max(activeDropdownIndex - 1, 0);
      } else if (e.key === 'Enter' && activeDropdownIndex >= 0) {
        e.preventDefault();
        window.location.href = links[activeDropdownIndex].getAttribute('href');
        return;
      } else if (e.key === 'Escape') {
        closeSearchDropdown();
        return;
      } else {
        return;
      }
      links.forEach(function (l, i) { l.classList.toggle('is-active', i === activeDropdownIndex); });
    });

    document.addEventListener('click', function (e) {
      if (!siteSearchForm.contains(e.target)) closeSearchDropdown();
    });
  }

  function categoryIconJS(category, size) {
    var s = size || 40;
    var customKey = Object.keys(CUSTOM_CATEGORY_ICONS).find(function (k) { return k.toLowerCase() === String(category || '').toLowerCase(); });
    if (customKey) {
      return '<img class="placeholder-icon" src="' + escapeHtmlJS(CUSTOM_CATEGORY_ICONS[customKey]) + '" alt="" width="' + s + '" height="' + s + '" style="object-fit:contain;">';
    }
    var key = Object.keys(CATEGORY_ICON_SHAPES).find(function (k) { return k.toLowerCase() === String(category || '').toLowerCase(); });
    var shape = (key && CATEGORY_ICON_SHAPES[key]) || CATEGORY_ICON_SHAPES.Other;
    return '<svg class="placeholder-icon" viewBox="0 0 40 40" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + shape + '</svg>';
  }

  // Mirrors productIcon in src/templates.js: a product line's own icon,
  // falling back to its family (category) icon.
  function productIconJS(product, size) {
    if (product && product.icon_url) {
      var s = size || 40;
      return '<img class="placeholder-icon placeholder-icon--product" src="' + escapeHtmlJS(String(product.icon_url).replace(/"/g, '%22')) + '" alt="" width="' + s + '" height="' + s + '" style="object-fit:contain;">';
    }
    return categoryIconJS(product && product.category, size);
  }

  function pillJS(category) {
    return '<a class="pill" href="/categories/' + slugifyJS(category) + '/">' + escapeHtmlJS(category) + '</a>';
  }

  function badgeDaysInfoJS(product, statusInfo) {
    if (!statusInfo) return null;
    if (product.days_basis === 'launch') {
      var launch = launchDateJS(product);
      if (launch) {
        return { days: daysBetweenJS(launch, new Date().toISOString().slice(0, 10)), suffix: 'since launch' };
      }
    }
    return { days: statusInfo.daysSince, suffix: 'since refresh' };
  }

  function badgeExplanationJS(statusInfo) {
    if (!statusInfo) return '';
    var cycle = pluralJS(statusInfo.avgCycleDays, 'day', 'days');
    if (statusInfo.status === 'overdue') return 'Overdue: this one is usually updated every ' + cycle;
    if (statusInfo.status === 'aging') return 'Getting on: this one is usually updated every ' + cycle;
    return 'Recently updated: this one is usually updated every ' + cycle;
  }

  function badgeHtmlJS(product, statusInfo) {
    if (product.discontinued) {
      var date = product.discontinued_date ? ' ' + formatDateJS(product.discontinued_date) : '';
      return '<span class="badge badge--discontinued">Discontinued' + date + '</span>';
    }
    if (!statusInfo) return '';
    var info = badgeDaysInfoJS(product, statusInfo);
    if (info.days < 0) {
      var upcoming = (product.refresh_history || []).slice().sort().pop();
      return '<span class="badge badge--upcoming">Coming ' + (upcoming ? formatDateJS(upcoming) : 'soon') + '</span>';
    }
    return '<span class="badge badge--' + statusInfo.status + '" title="' + escapeHtmlJS(badgeExplanationJS(statusInfo)) + '">' + pluralJS(info.days, 'day', 'days') + ' ' + info.suffix + '</span>';
  }

  function cardHtmlJS(product, statusInfo) {
    var status = statusKeyJS(product);
    var launch = launchDateJS(product);
    var days = statusInfo && status === 'current' ? statusInfo.daysSince : '';
    var launchTs = launch ? new Date(launch).getTime() : '';
    var discTs = product.discontinued && product.discontinued_date ? new Date(product.discontinued_date).getTime() : '';
    var lifespanDays = launch && product.discontinued && product.discontinued_date ? daysBetweenJS(launch, product.discontinued_date) : '';
    var decade = product.discontinued && product.discontinued_date ? Math.floor(new Date(product.discontinued_date).getFullYear() / 10) * 10 + 's' : '';
    var meta = launch && product.discontinued && product.discontinued_date
      ? '<p class="card-meta card-meta--lifespan">Lived ' + lifespanTextJS(launch, product.discontinued_date) + '</p>'
      : '';
    return (
      '<article class="card' + (status === 'discontinued' ? ' card--discontinued' : '') + '" data-category="' + escapeHtmlJS(product.category) + '" data-status="' + status + '" data-days="' + days + '" data-launch="' + launchTs + '" data-discontinued="' + discTs + '" data-lifespan="' + lifespanDays + '" data-decade="' + decade + '">' +
        '<a class="card-link" href="/products/' + product.slug + '/">' +
          '<div class="card-name-row">' + productIconJS(product, 36) + '<p class="card-name">' + escapeHtmlJS(product.name) + '</p></div>' +
          badgeHtmlJS(product, statusInfo) +
          meta +
        '</a>' +
        pillJS(product.category) +
      '</article>'
    );
  }

  function leagueRowHtmlJS(product, statusInfo, rank) {
    var status = statusKeyJS(product);
    var launch = launchDateJS(product);
    var days = statusInfo && status === 'current' ? statusInfo.daysSince : '';
    var launchTs = launch ? new Date(launch).getTime() : '';
    var discTs = product.discontinued && product.discontinued_date ? new Date(product.discontinued_date).getTime() : '';
    var lifespanDays = launch && product.discontinued && product.discontinued_date ? daysBetweenJS(launch, product.discontinued_date) : '';
    var decade = product.discontinued && product.discontinued_date ? Math.floor(new Date(product.discontinued_date).getFullYear() / 10) * 10 + 's' : '';
    return (
      '<tr class="league-row' + (status === 'discontinued' ? ' league-row--discontinued' : '') + '" data-href="/products/' + product.slug + '/" data-category="' + escapeHtmlJS(product.category) + '" data-status="' + status + '" data-days="' + days + '" data-launch="' + launchTs + '" data-discontinued="' + discTs + '" data-lifespan="' + lifespanDays + '" data-decade="' + decade + '">' +
        '<td class="league-rank">' + rank + '</td>' +
        '<td class="league-name"><a href="/products/' + product.slug + '/" class="league-name-link">' + productIconJS(product, 24) + '<span>' + escapeHtmlJS(product.name) + '</span></a></td>' +
        '<td class="league-status">' + badgeHtmlJS(product, statusInfo) + '</td>' +
        '<td class="league-launch">' + (launch ? formatDateJS(launch) : '\u2014') + '</td>' +
        '<td class="league-price">' + (product.price ? escapeHtmlJS(formatPriceJS(product.price)) : '\u2014') + '</td>' +
      '</tr>'
    );
  }

  function keyFactJS(label, value) {
    return value ? '<div class="key-fact"><p class="key-fact-label">' + label + '</p><p class="key-fact-value">' + value + '</p></div>' : '';
  }

  function specRowJS(label, valueHtml) {
    return valueHtml ? '<div class="spec-row"><dt>' + label + '</dt><dd>' + valueHtml + '</dd></div>' : '';
  }

  function sanitizeRichTextJS(html) {
    if (!html) return '';
    var allowed = { p: 1, b: 1, strong: 1, i: 1, em: 1, u: 1, br: 1, a: 1 };
    var siteHost = window.location.host;
    var out = String(html);
    out = out.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
    out = out.replace(/<div([^>]*)>/gi, '<p>').replace(/<\/div>/gi, '</p>');
    out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, function (match, tag, attrs) {
      var lower = tag.toLowerCase();
      var isClosing = match.charAt(1) === '/';
      if (!allowed[lower]) return '';
      if (lower === 'a') {
        if (isClosing) return '</a>';
        var hrefMatch = attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i);
        var href = hrefMatch ? hrefMatch[1] : '';
        var isHttp = /^https?:\/\//i.test(href);
        var safeHref = isHttp ? href.replace(/"/g, '&quot;') : '#';
        var isInternal = false;
        if (isHttp) {
          try { isInternal = new URL(href).host === siteHost; } catch (e) { isInternal = false; }
        }
        return isInternal ? '<a href="' + safeHref + '">' : '<a href="' + safeHref + '" target="_blank" rel="noopener">';
      }
      return isClosing ? '</' + lower + '>' : '<' + lower + '>';
    });
    return out;
  }

  function externalLinkLabelJS(product) {
    var isWiki = /wikipedia\.org/i.test(product.external_link || '');
    return product.name + (isWiki ? ' (Wiki)' : '');
  }

  function heroStatHtmlJS(product, statusInfo) {
    if (product.discontinued) {
      var date = product.discontinued_date ? ' ' + formatDateJS(product.discontinued_date) : '';
      return '<p class="days-hero days-hero--discontinued">Discontinued' + date + '</p>';
    }
    if (!statusInfo) return '';
    var info = badgeDaysInfoJS(product, statusInfo);
    if (info.days < 0) {
      var due = (product.refresh_history || []).slice().sort().pop();
      return '<p class="days-hero days-hero--upcoming"><span class="days-hero-label">Coming</span> <span class="days-hero-soon">' + (due ? formatDateJS(due) : 'soon') + '</span></p>';
    }
    return '<p class="days-hero days-hero--' + statusInfo.status + '"><span class="days-hero-number">' + info.days + '</span> ' + (info.days === 1 ? 'day' : 'days') + ' ' + info.suffix + '</p>';
  }

  // Must stay in step with relatedProductsHtml() in src/templates.js.
  // Without this the live refresh wiped the family section off the page.
  function relatedProductsHtmlJS(product, productsBySlug) {
    if (!productsBySlug) return '';
    var siblings = Object.keys(productsBySlug)
      .map(function (k) { return productsBySlug[k]; })
      .filter(function (p) { return p.slug !== product.slug && (p.category || '') === (product.category || ''); })
      .sort(function (a, b) {
        if (!!a.discontinued !== !!b.discontinued) return a.discontinued ? 1 : -1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6);
    if (!siblings.length) return '';
    var cards = siblings.map(function (p) {
      var st = p.discontinued ? null : computeStatusJS(p);
      var line = p.discontinued
        ? 'Discontinued' + (p.discontinued_date ? ' ' + formatDateJS(p.discontinued_date) : '')
        : st ? pluralJS(st.daysSince, 'day', 'days') + ' since refresh' : '';
      return '<a class="related-card" href="/products/' + p.slug + '/">' +
        '<span class="related-card-icon">' + productIconJS(p, 28) + '</span>' +
        '<span class="related-card-text"><span class="related-card-name">' + escapeHtmlJS(p.name) + '</span>' +
        (line ? '<span class="related-card-line">' + line + '</span>' : '') + '</span></a>';
    }).join('');
    var cat = product.category || 'this family';
    return '<section class="related-section"><h2>More in ' + escapeHtmlJS(cat) + '</h2>' +
      '<div class="related-grid">' + cards + '</div>' +
      '<p class="see-all"><a class="intro-cta" href="/categories/' + slugifyJS(product.category || 'other') + '/">All ' +
      escapeHtmlJS(product.category || 'products') + ' &rarr;</a></p></section>';
  }

  function productBodyHtmlJS(product, status, productsBySlug, galleryPhotos) {
    var sortedDates = sortedHistoryJS(product);
    var launch = product.original_launch_date || sortedDates[0] || null;
    var latest = sortedDates[sortedDates.length - 1] || null;

    var productNameLower = product.name.trim().toLowerCase();
    var relatedPhotos = (galleryPhotos || []).filter(function (photo) {
      return (photo.tags || []).some(function (tag) { return tag.trim().toLowerCase() === productNameLower; });
    });

    var videoBlock = product.video_url ? '<video class="product-video" src="' + product.video_url + '" controls></video>' : '';

    var successor = product.replaced_by && productsBySlug ? productsBySlug[product.replaced_by] : null;
    var replacedByHtml = successor
      ? '<a href="/products/' + successor.slug + '/">' + escapeHtmlJS(successor.name) + '</a>'
      : product.replaced_by ? readableSlugFallbackJS(product.replaced_by) : '';

    var predecessor = product.previous_model && productsBySlug ? productsBySlug[product.previous_model] : null;
    var previousModelHtml = predecessor
      ? '<a href="/products/' + predecessor.slug + '/">' + escapeHtmlJS(predecessor.name) + '</a>'
      : product.previous_model ? readableSlugFallbackJS(product.previous_model) : '';

    var daysInfo = status ? badgeDaysInfoJS(product, status) : null;

    // Mirrors the key facts grid plus secondary list in src/templates.js.
    var keyFacts = [
      keyFactJS('Latest release', latest ? formatDateJS(latest) : (launch ? formatDateJS(launch) : null)),
      keyFactJS('First release', launch && launch !== latest ? formatDateJS(launch) : null),
      keyFactJS('Typical cycle', status && !product.discontinued && sortedDates.length > 1 ? 'About every ' + pluralJS(status.avgCycleDays, 'day', 'days') : null),
      (function () {
        if (!status || sortedDates.length <= 1 || product.discontinued) return '';
        var due = new Date(new Date(status.lastRefresh).getTime() + status.avgCycleDays * 86400000);
        return keyFactJS(due.getTime() < Date.now() ? 'Was expected' : 'Next expected', due.toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }));
      })(),
      keyFactJS('Discontinued', product.discontinued && product.discontinued_date ? formatDateJS(product.discontinued_date) : null),
      keyFactJS('Lifespan', launch && product.discontinued && product.discontinued_date ? lifespanTextJS(launch, product.discontinued_date) : null),
      keyFactJS('Starting price', product.price ? escapeHtmlJS(formatPriceJS(product.price)) : null),
      keyFactJS('Releases so far', sortedDates.length > 1 ? String(sortedDates.length) : null)
    ].filter(Boolean).slice(0, 6).join('');

    var specs = [
      specRowJS('Category', pillJS(product.category)),
      specRowJS('Status', product.discontinued ? 'Discontinued' : 'Current'),
      product.discontinued ? specRowJS('Apple support status', appleSupportStatusJS(product)) : '',
      sortedDates.length ? specRowJS('Release type', product.is_new_launch ? 'All-new product' : 'Refresh of an existing model') : '',
      daysInfo ? specRowJS('Days counted from', pluralJS(daysInfo.days, 'day', 'days') + ' (' + (product.days_basis === 'launch' ? 'first release' : 'latest release') + ')') : '',
      specRowJS('Chip', escapeHtmlJS(product.chip)),
      specRowJS('Previous model', previousModelHtml),
      specRowJS('Replaced by', replacedByHtml),
      product.discontinued ? specRowJS('Why it went', escapeHtmlJS(product.discontinued_reason)) : '',
      product.apple_url_unavailable
        ? specRowJS('Official Apple page', 'No longer available on Apple\u2019s website')
        : product.apple_url
        ? specRowJS('Official Apple page', '<a href="' + product.apple_url + '" target="_blank" rel="noopener">apple.com &#8599;</a>')
        : '',
      product.specs_url ? specRowJS('Tech specs', '<a href="' + product.specs_url + '" target="_blank" rel="noopener">Apple specs &#8599;</a>') : '',
      product.press_release_url ? specRowJS('Press release', '<a href="' + product.press_release_url + '" target="_blank" rel="noopener">Apple Newsroom &#8599;</a>') : '',
      product.external_link ? specRowJS('More information', '<a href="' + product.external_link + '" target="_blank" rel="noopener">' + escapeHtmlJS(externalLinkLabelJS(product)) + ' &#8599;</a>') : '',
      product.discontinued ? '' : specRowJS('Waiting for a refresh', '<span class="wait-count-value">' + (product.waiting_count || 0) + '</span> ' + ((product.waiting_count || 0) === 1 ? 'person' : 'people')),
    ].filter(Boolean).join('');

    var allProducts = productsBySlug ? Object.keys(productsBySlug).map(function (k) { return productsBySlug[k]; }) : [product];
    var timelinePoints = categoryTimelinePointsJS(product, allProducts);
    var releaseHistorySection = timelinePoints.length ? '<h2>Release history</h2>' + verticalTimelineHtmlJS(product, allProducts) : '';

    return (
      '<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>' +
        '<li><a href="/">Home</a></li><li class="crumb-sep" aria-hidden="true">&rsaquo;</li>' +
        '<li><a href="/categories/' + slugifyJS(product.category || 'other') + '/">' + escapeHtmlJS(product.category || 'Products') + '</a></li>' +
        '<li class="crumb-sep" aria-hidden="true">&rsaquo;</li><li aria-current="page">' + escapeHtmlJS(product.name) + '</li>' +
      '</ol></nav>' +
      '<div class="product-top' + (product.video_url ? '' : ' product-top--no-media') + '">' +
        (product.video_url ? '<div class="product-media">' + videoBlock + '</div>' : '') +
        '<div class="product-info">' +
          '<div class="product-header">' +
            '<div>' +
              '<div class="product-title-row" data-category="' + escapeHtmlJS(product.category || '') + '">' +
                '<span class="product-title-icon">' + productIconJS(product, 40) + '</span>' +
                '<h1>' + escapeHtmlJS(product.name) + '</h1>' +
              '</div>' +
            '</div>' +
            '<div class="admin-tools">' +
              '<a href="/admin/?edit=' + product.id + '" class="admin-edit-link" style="display:none;">Edit this product</a>' +
              '<button type="button" class="admin-edit-link tweet-btn" data-slug="' + product.slug + '" style="display:none;">Draft a post for X</button>' +
            '</div>' +
          '</div>' +
          '<div class="product-facts">' + heroStatHtmlJS(product, status) + keyFacts + '</div>' +
          (product.discontinued ? '' : familyCadenceJS(product.category || 'this family',
            allProducts.filter(function (p) { return (p.category || '') === (product.category || ''); }))) +
          (product.did_you_know ? '<aside class="did-you-know"><p class="did-you-know-label">Did you know?</p><p class="did-you-know-text">' + escapeHtmlJS(product.did_you_know) + '</p></aside>' : '') +
          '<dl class="spec-list spec-list--secondary">' + specs + '</dl>' +
          (product.discontinued ? '' : '<button class="wait-btn wait-btn--large" data-product-id="' + product.id + '" data-slug="' + product.slug + '" data-count="' + (product.waiting_count || 0) + '">Are you looking forward to a new ' + escapeHtmlJS(product.category) + '?</button>') +
        '</div>' +
      '</div>' +
      '<p class="report-line"><a class="report-link" href="/contact/?topic=Correction&page=' +
        encodeURIComponent(product.name) + '&url=' + encodeURIComponent('/products/' + product.slug + '/') +
        '">Something not right on this page? Tell us</a></p>' +
      (product.rumor_note ? '<div class="callout"><p class="callout-label">Notes</p><div class="callout-body">' + sanitizeRichTextJS(product.rumor_note) + '</div></div>' : '') +
      releaseHistorySection +
      (timelinePoints.every(function (pt) { return pt.productName === product.name; })
        && !productGenerationsJS(product).some(function (g) { return g.announced; })
        ? '' : generationsSectionHtmlJS(product)) +
      relatedProductsHtmlJS(product, productsBySlug) +
      (relatedPhotos.length ? '<h2>From the gallery</h2><div class="gallery-strip">' + relatedPhotos.map(galleryStripItemHtmlJS).join('') + '</div>' : '')
    );
  }

  // Must stay in step with categoryStatsSentence() in src/templates.js.
  function familyCadenceJS(category, familyProducts) {
    var seen = {}, dates = [];
    familyProducts.forEach(function (p) {
      (p.refresh_history || []).forEach(function (d) { if (!seen[d]) { seen[d] = 1; dates.push(d); } });
    });
    dates.sort();
    var today = new Date().toISOString().slice(0, 10);
    var past = dates.filter(function (d) { return d <= today; });
    if (past.length < 2) return '';
    var toDays = function (a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); };
    var avg = Math.round(toDays(past[0], past[past.length - 1]) / (past.length - 1));
    var sinceLast = toDays(past[past.length - 1], today);
    var cadence = function (d) {
      if (d < 330) return 'roughly every ' + Math.max(1, Math.round(d / 30.4)) + ' months';
      var years = Math.round((d / 365.25) * 2) / 2;
      if (years === 1) return 'about once a year';
      var whole = Math.floor(years);
      return 'roughly every ' + (years % 1 ? whole + '\u00bd' : whole) + ' years';
    };
    var plural = function (n) { return n + (n === 1 ? ' day' : ' days'); };
    var text = 'Across ' + past.length + ' releases, Apple has updated ' + escapeHtmlJS(category) + ' ' + cadence(avg) + '. ';
    if (sinceLast > avg * 1.25) text += 'It has now been ' + plural(sinceLast) + ' since the last one, well past the usual gap.';
    else if (sinceLast > avg) text += 'It has now been ' + plural(sinceLast) + ', a little beyond the usual gap.';
    else text += 'The last update was ' + plural(sinceLast) + ' ago, so the next is not due yet.';
    return '<p class="page-stats">' + text + '</p>';
  }

  function fetchAllProductsJS() {
    return fetch(window.SUPABASE_URL + '/rest/v1/products?select=*', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    }).then(function (res) { return res.json(); });
  }

  // --- Waiting button: works whether rendered at build time or injected live.

  function votedKey(slug) { return 'waited_' + slug; }
  function votedCountKey(slug) { return 'waited_count_' + slug; }

  function wireWaitButtons(buttons) {
    buttons.forEach(function (btn) {
      var slug = btn.getAttribute('data-slug');
      var baseCount = parseInt(btn.getAttribute('data-count'), 10) || 0;
      var container = btn.closest('.product-info');
      var countEl = container ? container.querySelector('.wait-count-value') : null;

      function showVoted(count) {
        if (countEl) countEl.textContent = count;
        btn.style.display = 'none';
      }

      if (localStorage.getItem(votedKey(slug))) {
        var storedCount = parseInt(localStorage.getItem(votedCountKey(slug)), 10);
        showVoted(isNaN(storedCount) ? baseCount : storedCount);
      }

      btn.addEventListener('click', function () {
        if (localStorage.getItem(votedKey(slug))) return;
        var newCount = baseCount + 1;
        showVoted(newCount);
        localStorage.setItem(votedKey(slug), '1');
        localStorage.setItem(votedCountKey(slug), String(newCount));
        var productId = btn.getAttribute('data-product-id');
        if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
          fetch(window.SUPABASE_URL + '/rest/v1/rpc/increment_waiting', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: window.SUPABASE_ANON_KEY,
              Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ product_id_input: productId }),
          }).catch(function () {});
        }
      });
    });
  }

  // --- Filters. Each .filter-bar carries data-filter-key (category,
  // status, decade); cards carry a matching data-* attribute. Any number
  // of bars combine, and search runs on top.

  var searchInput = document.getElementById('search-input');
  var noResults = document.getElementById('no-results');
  var activeFilters = {};

  if (searchInput) {
    var searchFromUrl = new URLSearchParams(window.location.search).get('search');
    if (searchFromUrl) searchInput.value = searchFromUrl;
  }

  function renumberLeagueRanks() {
    var table = document.querySelector('#grid.league-table');
    if (!table) return;
    var rank = 0;
    table.querySelectorAll('.league-row').forEach(function (row) {
      if (row.style.display === 'none') return;
      rank++;
      var rankCell = row.querySelector('.league-rank');
      if (rankCell) rankCell.textContent = rank;
    });
  }

  var currentPage = 1;
  var PAGE_SIZE = 30;

  function isPaginatedGrid() {
    var grid = document.getElementById('grid');
    return !!(grid && grid.getAttribute('data-mode') === 'all' && document.getElementById('pagination'));
  }

  function applyFilters() {
    var query = (searchInput ? searchInput.value : '').trim().toLowerCase();
    var visibleCount = 0;
    var paginated = isPaginatedGrid();
    document.querySelectorAll('#grid .card, #grid .league-row').forEach(function (card) {
      var show = true;
      if (query) {
        // A search term searches everything, regardless of which
        // category/status filter happens to be selected right now.
        var searchAttr = card.getAttribute('data-search');
        var haystack;
        if (searchAttr !== null) {
          haystack = searchAttr.toLowerCase();
        } else {
          var nameEl = card.querySelector('.card-name, .league-name-link span');
          haystack = nameEl ? nameEl.textContent.toLowerCase() : '';
        }
        if (!matchesSearchJS(haystack, query)) show = false;
      } else {
        Object.keys(activeFilters).forEach(function (key) {
          var want = activeFilters[key];
          if (want !== 'all' && card.getAttribute('data-' + key) !== want) show = false;
        });
      }
      if (paginated) {
        card.setAttribute('data-matches-filter', show ? 'true' : 'false');
      } else {
        card.style.display = show ? '' : 'none';
      }
      if (show) visibleCount++;
    });
    if (noResults) noResults.style.display = visibleCount === 0 ? '' : 'none';
    if (paginated) {
      currentPage = 1;
      applyPagination();
    } else {
      renumberLeagueRanks();
    }
  }

  function updateStatusDivider() {
    var grid = document.getElementById('grid');
    if (!grid || grid.getAttribute('data-mode') !== 'all') return;
    grid.querySelectorAll('.products-status-divider').forEach(function (d) { d.remove(); });

    var visibleCards = Array.prototype.slice.call(grid.querySelectorAll('.card')).filter(function (c) { return c.style.display !== 'none'; });
    var firstDiscontinuedIndex = visibleCards.findIndex(function (c) { return c.getAttribute('data-status') === 'discontinued'; });
    if (firstDiscontinuedIndex <= 0) return;
    var isGrouped = visibleCards.slice(0, firstDiscontinuedIndex).every(function (c) { return c.getAttribute('data-status') === 'current'; })
      && visibleCards.slice(firstDiscontinuedIndex).every(function (c) { return c.getAttribute('data-status') === 'discontinued'; });
    if (!isGrouped) return;

    var makeDivider = function (label, kind) {
      var d = document.createElement('div');
      d.className = 'products-status-divider products-status-divider--' + kind;
      d.innerHTML = '<span class="products-status-divider-label">' + label + '</span>';
      return d;
    };
    // Both groups are labelled, so "Discontinued" no longer looks like the
    // only heading on the page.
    grid.insertBefore(makeDivider('Current', 'current'), visibleCards[0]);
    grid.insertBefore(makeDivider('Discontinued', 'discontinued'), visibleCards[firstDiscontinuedIndex]);
  }

  function applyPagination() {
    if (!isPaginatedGrid()) return;
    var grid = document.getElementById('grid');
    var paginationEl = document.getElementById('pagination');
    var matching = Array.prototype.slice.call(grid.querySelectorAll('.card[data-matches-filter="true"]'));
    var nonMatching = Array.prototype.slice.call(grid.querySelectorAll('.card[data-matches-filter="false"]'));
    nonMatching.forEach(function (card) { card.style.display = 'none'; });

    var totalPages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    matching.forEach(function (card, i) {
      var page = Math.floor(i / PAGE_SIZE) + 1;
      card.style.display = page === currentPage ? '' : 'none';
    });

    updateStatusDivider();

    if (totalPages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }

    var html = '';
    html += '<button type="button" class="page-btn page-btn--arrow" data-page="prev"' + (currentPage === 1 ? ' disabled' : '') + '>\u2190 Previous</button>';
    var start = Math.max(1, currentPage - 2);
    var end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);
    if (start > 1) {
      html += '<button type="button" class="page-btn" data-page="1">1</button>';
      if (start > 2) html += '<span class="page-ellipsis">\u2026</span>';
    }
    for (var p = start; p <= end; p++) {
      html += '<button type="button" class="page-btn' + (p === currentPage ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
    }
    if (end < totalPages) {
      if (end < totalPages - 1) html += '<span class="page-ellipsis">\u2026</span>';
      html += '<button type="button" class="page-btn" data-page="' + totalPages + '">' + totalPages + '</button>';
    }
    html += '<button type="button" class="page-btn page-btn--arrow" data-page="next"' + (currentPage === totalPages ? ' disabled' : '') + '>Next \u2192</button>';
    paginationEl.innerHTML = html;
    paginationEl.querySelectorAll('.page-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = btn.getAttribute('data-page');
        if (val === 'prev') currentPage--;
        else if (val === 'next') currentPage++;
        else currentPage = parseInt(val, 10);
        applyPagination();
        var gridEl = document.getElementById('grid');
        if (gridEl) window.scrollTo({ top: Math.max(0, gridEl.getBoundingClientRect().top + window.scrollY - 100), behavior: 'smooth' });
      });
    });
  }

  // Whole league-table rows are clickable (not just the product name),
  // delegated on the document so it keeps working after live-refresh
  // replaces the rows. A direct click on a real link inside the row
  // (the product name) is left to navigate normally.
  document.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    var row = e.target.closest('.league-row[data-href]');
    if (row) window.location.href = row.getAttribute('data-href');
  });

  function updateStatusBarCounts() {
    var statusBar = document.querySelector('.filter-bar[data-filter-key="status"]');
    if (!statusBar) return;
    var category = activeFilters.category;
    var cards = Array.prototype.slice.call(document.querySelectorAll('#grid .card, #grid .league-row'));
    var scoped = (!category || category === 'all') ? cards : cards.filter(function (c) { return c.getAttribute('data-category') === category; });
    var totalCount = scoped.length;
    var currentCount = scoped.filter(function (c) { return c.getAttribute('data-status') === 'current'; }).length;
    var discontinuedCount = scoped.filter(function (c) { return c.getAttribute('data-status') === 'discontinued'; }).length;

    statusBar.querySelectorAll('.filter-btn').forEach(function (btn) {
      var value = btn.getAttribute('data-filter-value');
      var countEl = btn.querySelector('.filter-btn-count');
      if (!countEl) return;
      var count = value === 'all' ? totalCount : (value === 'current' ? currentCount : discontinuedCount);
      countEl.textContent = '(' + count + ')';
    });
  }

  function updateStatusBarVisibility() {
    var wrapper = document.getElementById('status-bar-wrapper');
    var statusBar = document.querySelector('.filter-bar[data-filter-key="status"]');
    if (!wrapper || !statusBar) return;
    var categoryIsAll = !activeFilters.category || activeFilters.category === 'all';
    wrapper.style.display = categoryIsAll ? 'none' : '';
    if (categoryIsAll && activeFilters.status !== 'all') {
      activeFilters.status = 'all';
      statusBar.querySelectorAll('.filter-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-filter-value') === 'all');
      });
    }
    updateStatusBarCounts();
  }

  function wireFilterBars() {
    document.querySelectorAll('.filter-bar[data-filter-key]').forEach(function (bar) {
      var key = bar.getAttribute('data-filter-key');
      if (!(key in activeFilters)) activeFilters[key] = 'all';
      bar.querySelectorAll('.filter-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var value = btn.getAttribute('data-filter-value');
          // Tapping the family you're already in takes you back to all
          // of them, since that row has no "All" button of its own.
          if (btn.classList.contains('active')) {
            if (key !== 'category' || value === 'all') return;
            btn.classList.remove('active');
            activeFilters[key] = 'all';
          } else {
            bar.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            activeFilters[key] = value;
          }
          // "All" is the reset for the whole row, not just its own group.
          if (key === 'status' && value === 'all') {
            activeFilters.category = 'all';
            var categoryBar = document.querySelector('.filter-bar[data-filter-key="category"]');
            if (categoryBar) categoryBar.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
          }
          if (searchInput) searchInput.value = '';
          updateStatusBarVisibility();
          applyFilters();
        });
      });
    });
    updateStatusBarVisibility();
  }

  wireFilterBars();

  // The mobile family picker drives the same buttons the desktop chips
  // use, so there is one source of truth for what is filtered.
  (function familySelect() {
    var select = document.querySelector('[data-family-select]');
    var bar = document.querySelector('.filter-bar[data-filter-key="category"]');
    if (!select || !bar) return;
    select.addEventListener('change', function () {
      var active = bar.querySelector('.filter-btn.active');
      if (!select.value) {
        if (active) active.click();
        return;
      }
      var target = Array.prototype.find.call(bar.querySelectorAll('.filter-btn'), function (b) {
        return b.getAttribute('data-filter-value') === select.value;
      });
      if (target && !target.classList.contains('active')) target.click();
    });
    // Keep the picker in step when a chip or the status "All" resets it.
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('.filter-btn')) return;
      setTimeout(function () {
        var active = bar.querySelector('.filter-btn.active');
        select.value = active ? active.getAttribute('data-filter-value') : '';
      }, 0);
    });
  })();
  var everythingBtn = document.getElementById('everything-btn');
  if (everythingBtn) {
    everythingBtn.addEventListener('click', function () {
      document.querySelectorAll('.filter-bar[data-filter-key]').forEach(function (bar) {
        var key = bar.getAttribute('data-filter-key');
        activeFilters[key] = 'all';
        bar.querySelectorAll('.filter-btn').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-filter-value') === 'all');
        });
      });
      if (searchInput) searchInput.value = '';
      updateStatusBarVisibility();
      applyFilters();
    });
  }
  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (searchFromUrl || isPaginatedGrid()) applyFilters();

  // --- Sort. Option values are "<attr>-<dir>": name sorts on the card's
  // name, anything else on a data-<attr> number. Cards missing that
  // number sort to the end whichever direction you pick.

  var sortSelect = document.getElementById('sort-select');
  var sortResetBtn = document.getElementById('sort-reset-btn');
  var originalGridOrder = null;

  function captureOriginalOrderIfNeeded() {
    if (originalGridOrder) return;
    var grid = document.getElementById('grid');
    if (!grid) return;
    var items = grid.querySelectorAll('.card, .league-row');
    if (items.length) originalGridOrder = Array.prototype.slice.call(items);
  }

  function applySort() {
    var grid = document.getElementById('grid');
    if (!grid || !sortSelect || !sortSelect.value) return;
    var parts = sortSelect.value.split('-');
    var dir = parts.pop();
    var attr = parts.join('-');
    var items = Array.prototype.slice.call(grid.querySelectorAll('.card, .league-row'));
    if (!items.length) return;
    var parent = items[0].parentElement;

    items.sort(function (a, b) {
      if (attr === 'name') {
        var nameA = (a.querySelector('.card-name, .league-name-link span') || {}).textContent || '';
        var nameB = (b.querySelector('.card-name, .league-name-link span') || {}).textContent || '';
        var cmp = nameA.localeCompare(nameB);
        return dir === 'asc' ? cmp : -cmp;
      }
      var rawA = a.getAttribute('data-' + attr);
      var rawB = b.getAttribute('data-' + attr);
      var hasA = rawA !== null && rawA !== '';
      var hasB = rawB !== null && rawB !== '';
      if (!hasA && !hasB) return 0;
      if (!hasA) return 1;
      if (!hasB) return -1;
      var diff = parseFloat(rawA) - parseFloat(rawB);
      return dir === 'desc' ? -diff : diff;
    });

    items.forEach(function (item) { parent.appendChild(item); });
    if (isPaginatedGrid()) {
      currentPage = 1;
      applyPagination();
    } else {
      renumberLeagueRanks();
    }
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      captureOriginalOrderIfNeeded();
      applySort();
      if (sortResetBtn) sortResetBtn.style.display = '';
    });
  }
  applySort();

  if (sortResetBtn) {
    sortResetBtn.addEventListener('click', function () {
      if (!originalGridOrder || !originalGridOrder.length) return;
      var parent = originalGridOrder[0].parentElement;
      if (!parent) return;
      originalGridOrder.forEach(function (item) {
        if (item.parentElement) parent.appendChild(item);
      });
      sortSelect.value = '';
      sortResetBtn.style.display = 'none';
      if (isPaginatedGrid()) {
        currentPage = 1;
        applyPagination();
      } else {
        renumberLeagueRanks();
      }
    });
  }

  // --- Reveal "Edit this product" to the logged-in admin only.

  function revealAdminEditLinks(links) {
    if (!links.length || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) return;
    var authClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    authClient.auth.getSession().then(function (result) {
      if (result.data && result.data.session) {
        links.forEach(function (el) { el.style.display = ''; });
      }
    });
  }

  // --- Draft a post for X, admin only ---
  //
  // Builds several ready-to-post angles from what is already on the page,
  // then shows them in a pop-up styled like a real post so it is easy to
  // judge how each will look before posting.

  function readProductFacts(root) {
    var text = function (sel) { var el = root.querySelector(sel); return el ? el.textContent.trim() : ''; };
    var facts = {};
    root.querySelectorAll('.key-fact').forEach(function (f) {
      var label = (f.querySelector('.key-fact-label') || {}).textContent || '';
      var value = (f.querySelector('.key-fact-value') || {}).textContent || '';
      facts[label.trim().toLowerCase()] = value.trim();
    });
    var hero = root.querySelector('.days-hero');
    var status = 'current';
    if (hero) {
      if (hero.className.indexOf('overdue') > -1) status = 'overdue';
      else if (hero.className.indexOf('aging') > -1) status = 'aging';
      else if (hero.className.indexOf('fresh') > -1) status = 'fresh';
      else if (hero.className.indexOf('upcoming') > -1) status = 'upcoming';
    }
    if (facts['discontinued']) status = 'discontinued';
    var crumbs = root.querySelectorAll('.breadcrumbs a, nav[aria-label="Breadcrumb"] a');
    var category = crumbs.length > 1 ? crumbs[1].textContent.trim() : '';
    var days = text('.days-hero-number').replace(/[^0-9]/g, '');
    return {
      name: text('h1'),
      days: days ? Number(days) : null,
      status: status,
      facts: facts,
      category: category,
      fact: text('.did-you-know-text'),
    };
  }

  function hashtag(word) {
    var clean = String(word || '').replace(/[^A-Za-z0-9]/g, '');
    return clean ? '#' + clean : '';
  }

  // Up to three angles per product, chosen to suit its situation.
  function postAngles(d) {
    var n = d.days !== null ? d.days.toLocaleString('en-US') : null;
    var tags = ['#Apple', hashtag(d.category)].filter(function (t, i, a) { return t && a.indexOf(t) === i; }).join(' ');
    var cycle = d.facts['typical cycle'] ? d.facts['typical cycle'].toLowerCase() : '';
    var latest = d.facts['latest release'] || '';
    var angles = [];

    if (d.status === 'discontinued') {
      angles.push(d.name + ' was discontinued on ' + d.facts['discontinued'] + (d.facts['lifespan'] ? ', after ' + d.facts['lifespan'] + ' on sale.' : '.') + '\n\nHere\u2019s its full story, from launch to retirement.');
      if (d.fact) angles.push('Did you know? ' + d.fact + '\n\nThe full history of the ' + d.name + ' is here.');
      angles.push('Remember the ' + d.name + '?\n\nIt left Apple\u2019s line-up on ' + d.facts['discontinued'] + '. Here\u2019s what replaced it.');
    } else if (d.status === 'upcoming') {
      angles.push('The ' + d.name + ' is almost here. \u23F3\n\nEverything we know so far, including the release date and price.');
      if (d.fact) angles.push('Did you know? ' + d.fact + '\n\nThe ' + d.name + ' arrives soon.');
      angles.push('Counting down to the ' + d.name + '. \uD83D\uDC40\n\nRelease date, price and what\u2019s new, all in one place.');
    } else if (d.status === 'fresh') {
      angles.push('Fresh from Apple: the ' + d.name + (n ? ', updated just ' + n + (d.days === 1 ? ' day' : ' days') + ' ago.' : '.') + '\n\nHere\u2019s what changed.');
      if (d.fact) angles.push('Did you know? ' + d.fact + '\n\nMore on the ' + d.name + ' here.');
      angles.push('Thinking about a new ' + (d.category || d.name) + '?\n\nThe ' + d.name + ' is Apple\u2019s newest, so now is a good time to buy.');
    } else {
      var late = d.status === 'overdue';
      angles.push(n + ' days.\n\nThat\u2019s how long the ' + d.name + ' has gone without an update' + (late ? ', and it\u2019s now past its usual refresh window.' : '.') + '\n\nIs a new one on the way? \uD83D\uDC40');
      angles.push('When did Apple last update the ' + d.name + '?\n\n' + (latest ? latest + '. ' : '') + 'That\u2019s ' + n + ' days ago, and counting.' + (late ? '\n\nIt\u2019s overdue.' : ''));
      if (d.fact) angles.push('Did you know? ' + d.fact + '\n\n' + d.name + ': ' + n + ' days since its last update.');
      else if (cycle) angles.push('Apple usually refreshes the ' + d.name + ' ' + cycle.replace(/^about /, 'about ') + '.\n\nIt\u2019s now been ' + n + ' days. ' + (late ? 'Time for a new one?' : 'Worth waiting?'));
    }
    return angles.map(function (body) { return { body: body, tags: tags }; });
  }

  // X counts any link as 23 characters, plus a line break before it.
  function assemblePost(angle, url) {
    var room = 280 - 24;
    var body = angle.body;
    var withTags = angle.tags ? body + '\n\n' + angle.tags : body;
    if (withTags.length <= room) body = withTags;
    else if (body.length > room) body = body.slice(0, room - 1).trim() + '\u2026';
    return body + '\n' + url;
  }

  function postLength(text) {
    var lines = text.split('\n');
    var last = lines[lines.length - 1];
    var isUrl = /^https?:\/\//.test(last);
    return isUrl ? text.length - last.length + 23 : text.length;
  }

  function openPostComposer() {
    var root = document.querySelector('.product-page') || document;
    var data = readProductFacts(root);
    var angles = postAngles(data);
    var url = window.location.origin + window.location.pathname;
    var index = 0;

    var existing = document.querySelector('.post-composer');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'post-composer';
    overlay.innerHTML =
      '<div class="post-composer-card" role="dialog" aria-modal="true" aria-labelledby="post-composer-title">' +
        '<div class="post-composer-head">' +
          '<h2 id="post-composer-title">Draft a post for X</h2>' +
          '<button type="button" class="post-composer-close" aria-label="Close">\u00D7</button>' +
        '</div>' +
        '<div class="post-composer-angles" role="tablist"></div>' +
        '<div class="post-preview">' +
          '<div class="post-preview-avatar"><img src="/logo.png" alt=""></div>' +
          '<div class="post-preview-main">' +
            '<p class="post-preview-who"><strong>Apple Sunset</strong> <span>@applesunset</span></p>' +
            '<textarea class="post-preview-text" rows="7" aria-label="Post text"></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="post-composer-meter"><div class="post-composer-meter-bar"></div></div>' +
        '<p class="post-composer-count"></p>' +
        '<div class="post-composer-actions">' +
          '<button type="button" class="intro-cta intro-cta--ghost post-copy">Copy text</button>' +
          '<a class="intro-cta post-open" target="_blank" rel="noopener">Post on X</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var area = overlay.querySelector('.post-preview-text');
    var tabs = overlay.querySelector('.post-composer-angles');
    var bar = overlay.querySelector('.post-composer-meter-bar');
    var count = overlay.querySelector('.post-composer-count');
    var openBtn = overlay.querySelector('.post-open');
    var copyBtn = overlay.querySelector('.post-copy');

    // Grow the box to fit the whole post, so nothing has to be scrolled
    // to read it before posting.
    var fit = function () {
      area.style.height = 'auto';
      area.style.height = area.scrollHeight + 'px';
    };

    var refresh = function () {
      fit();
      var len = postLength(area.value);
      var pct = Math.min(100, Math.round((len / 280) * 100));
      bar.style.width = pct + '%';
      bar.classList.toggle('is-near', len > 250 && len <= 280);
      bar.classList.toggle('is-over', len > 280);
      count.textContent = len + ' / 280' + (len > 280 ? ' \u2013 too long for X' : '');
      count.classList.toggle('is-over', len > 280);
      openBtn.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(area.value);
      copyBtn.textContent = 'Copy text';
    };

    var show = function (i) {
      index = i;
      area.value = assemblePost(angles[i], url);
      tabs.querySelectorAll('button').forEach(function (b, j) {
        b.classList.toggle('is-active', j === i);
        b.setAttribute('aria-selected', j === i ? 'true' : 'false');
      });
      refresh();
    };

    var labels = ['Headline', 'Question', 'Did you know', 'Angle 4'];
    angles.forEach(function (a, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.textContent = labels[i] || 'Angle ' + (i + 1);
      b.addEventListener('click', function () { show(i); });
      tabs.appendChild(b);
    });
    if (angles.length < 2) tabs.style.display = 'none';

    area.addEventListener('input', refresh);
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(area.value).then(function () { copyBtn.textContent = 'Copied \u2713'; });
    });

    var close = function () {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    overlay.querySelector('.post-composer-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    show(0);
    // Focusing on a phone throws the keyboard up over half the preview,
    // so only do it where there is a mouse and room to spare.
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) area.focus();
    // Fonts can settle a moment after opening; re-measure once they have.
    setTimeout(fit, 60);
  }

  function wireTweetButtons(buttons) {
    buttons.forEach(function (btn) {
      if (btn.dataset.wired) return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', openPostComposer);
    });
  }

  revealAdminEditLinks(document.querySelectorAll('.admin-edit-link'));
  wireTweetButtons(document.querySelectorAll('.tweet-btn'));
  wireWaitButtons(document.querySelectorAll('.wait-btn'));

  // --- Live refresh: homepage hero (3 random cards, one featured) and
  // the random gallery strip. Re-randomised on every page load.

  function pickRandomJS(arr, n) {
    var copy = arr.slice();
    var picked = [];
    while (picked.length < n && copy.length) {
      var idx = Math.floor(Math.random() * copy.length);
      picked.push(copy.splice(idx, 1)[0]);
    }
    return picked;
  }

  function featuredCardHtmlJS(product, statusInfo, allProducts) {
    var daysInfo = statusInfo ? badgeDaysInfoJS(product, statusInfo) : null;
    var countHtml = daysInfo
      ? (daysInfo.days < 0
          ? (function () {
              var due = (product.refresh_history || []).slice().sort().pop();
              return '<div class="card-featured-count card-featured-count--upcoming" data-product-countdown="' + due + '">' +
                '<span class="product-countdown-clock" data-product-countdown-clock></span>' +
                '<span class="card-featured-count-due">Coming ' + formatDateJS(due) + '</span></div>';
            })()
          : '<div class="card-featured-count card-featured-count--' + statusInfo.status + '"><span class="card-featured-count-number">' + daysInfo.days + '</span><span class="card-featured-count-suffix">days ' + daysInfo.suffix + '</span></div>')
      : badgeHtmlJS(product, statusInfo);
    var launch = launchDateJS(product);
    var predecessor = product.previous_model && allProducts ? allProducts.filter(function (p) { return p.slug === product.previous_model; })[0] : null;
    var expectedDate = statusInfo && !product.discontinued
      ? new Date(new Date(statusInfo.lastRefresh).getTime() + statusInfo.avgCycleDays * 86400000)
      : null;
    var expectedPassed = expectedDate ? expectedDate.getTime() < Date.now() : false;
    var nextExpected = expectedDate ? expectedDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }) : null;
    var detailRows = [];
    if (product.price) detailRows.push('<div class="card-featured-detail"><span class="card-featured-detail-label">Launch price</span> ' + escapeHtmlJS(formatPriceJS(product.price)) + '</div>');
    if (launch) detailRows.push('<div class="card-featured-detail"><span class="card-featured-detail-label">Launch date</span> ' + formatDateJS(launch) + '</div>');
    if (product.discontinued && product.discontinued_date) {
      detailRows.push('<div class="card-featured-detail"><span class="card-featured-detail-label">Discontinued</span> ' + formatDateJS(product.discontinued_date) + '</div>');
    } else if (nextExpected) {
      detailRows.push('<div class="card-featured-detail"><span class="card-featured-detail-label">' + (expectedPassed ? 'Refresh was expected' : 'Next refresh expected') + '</span> ' + nextExpected + '</div>');
    }
    if (predecessor) detailRows.push('<div class="card-featured-detail"><span class="card-featured-detail-label">Previous model</span> ' + escapeHtmlJS(predecessor.name) + '</div>');
    return '<article class="card card--featured" data-category="' + escapeHtmlJS(product.category) + '">' +
      '<a class="card-link" href="/products/' + product.slug + '/">' +
        '<span class="card-featured-label">Featured</span>' +
        '<div class="card-name-row">' + productIconJS(product, 42) + '<p class="card-name">' + escapeHtmlJS(product.name) + '</p></div>' +
        countHtml +
        (detailRows.length ? '<div class="card-featured-details">' + detailRows.join('') + '</div>' : '') +
      '</a>' +
      pillJS(product.category) +
    '</article>';
  }

  function eventCardHtmlJS(event) {
    var dateText = [formatDateJS(event.event_date), event.event_time].filter(Boolean).join(' \u00b7 ');
    var inner = (event.image_url ? '<img class="card-event-image" src="' + escapeHtmlJS(event.image_url) + '" alt="' + escapeHtmlJS(event.heading) + '">' : '') +
      '<p class="card-event-title">' + escapeHtmlJS(event.heading) + '</p>' +
      (dateText ? '<p class="card-event-date">' + escapeHtmlJS(dateText) + '</p>' : '') +
      '<span class="card-featured-label card-featured-label--bottom">Apple Event</span>';
    return event.event_url
      ? '<a class="card card--featured card--event" href="' + escapeHtmlJS(event.event_url) + '" target="_blank" rel="noopener">' + inner + '</a>'
      : '<article class="card card--featured card--event">' + inner + '</article>';
  }

  function fetchActiveEventJS() {
    return fetch(window.SUPABASE_URL + '/rest/v1/apple_events?select=*&order=event_date.asc', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    })
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        if (!Array.isArray(rows)) return null;
        var today = new Date().toISOString().slice(0, 10);
        var upcoming = rows.filter(function (e) { return e.event_date >= today; });
        return upcoming[0] || null;
      })
      .catch(function () { return null; });
  }

  var heroCardsSection = document.getElementById('hero-cards');
  if (heroCardsSection && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    Promise.all([fetchAllProductsJS(), fetchActiveEventJS()]).then(function (results) {
      var products = results[0];
      var activeEvent = results[1];
      var active = products.filter(function (p) { return !p.discontinued; });
      var withStatus = active
        .map(function (p) { return { product: p, status: computeStatusJS(p) }; })
        .filter(function (i) { return i.status; });
      if (!withStatus.length && !activeEvent) return;

      var explicitlyFeatured = activeEvent ? null : withStatus.filter(function (i) { return i.product.featured; })[0];
      // Must match build.js: an unreleased product stays out of the hero
      // unless it has been deliberately featured.
      var todayStr = new Date().toISOString().slice(0, 10);
      var releasedOnly = withStatus.filter(function (i) {
        var dates = i.product.refresh_history || [];
        return !dates.length || !dates.every(function (d) { return d > todayStr; });
      });
      var heroFeatured, heroRest;
      if (activeEvent) {
        heroFeatured = null;
        heroRest = pickRandomJS(releasedOnly, 2);
      } else if (explicitlyFeatured) {
        heroFeatured = explicitlyFeatured;
        heroRest = pickRandomJS(releasedOnly.filter(function (i) { return i !== explicitlyFeatured; }), 2);
      } else {
        var heroPicks = pickRandomJS(releasedOnly, 3);
        heroFeatured = heroPicks.slice().sort(function (a, b) { return b.status.ratio - a.status.ratio; })[0];
        heroRest = heroPicks.filter(function (i) { return i !== heroFeatured; });
      }

      var featuredSlotHtml = activeEvent ? eventCardHtmlJS(activeEvent) : (heroFeatured ? featuredCardHtmlJS(heroFeatured.product, heroFeatured.status, products) : '');
      heroCardsSection.innerHTML =
        featuredSlotHtml +
        heroRest.map(function (r) { return cardHtmlJS(r.product, r.status); }).join('');
    }).catch(function () {});
  }

  var factBoxSection = document.getElementById('fact-box');
  var factSectionWrapper = document.getElementById('fact-section');
  if (factBoxSection && factSectionWrapper && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    fetch(window.SUPABASE_URL + '/rest/v1/facts?select=*&order=created_at.desc&limit=1', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    })
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        var latest = Array.isArray(rows) ? rows[0] : null;
        if (!latest) {
          factSectionWrapper.style.display = 'none';
          return;
        }
        factSectionWrapper.style.display = '';
        factBoxSection.innerHTML =
          '<p class="fact-label">Did you know?</p>' +
          '<p class="fact-text">' + escapeHtmlJS(latest.text) + '</p>' +
          '<a href="/facts/" class="fact-more-link">More facts &rarr;</a>';
      })
      .catch(function () {});
  }

  var galleryStripSection = document.getElementById('gallery-strip');
  if (galleryStripSection && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    fetch(window.SUPABASE_URL + '/rest/v1/gallery_photos?select=*', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    })
      .then(function (res) { return res.json(); })
      .then(function (photos) {
        if (!Array.isArray(photos) || !photos.length) return;
        var picks = pickRandomJS(photos, 10);
        galleryStripSection.innerHTML = picks.map(galleryStripItemHtmlJS).join('');
      })
      .catch(function () {});
  }

  // --- Live refresh: any card grid (/products/, /discontinued/, a
  // category page). The grid's data-mode says which products belong.

  var gridSection = document.getElementById('grid');
  if (gridSection && gridSection.getAttribute('data-mode') !== 'gallery' && gridSection.getAttribute('data-mode') !== 'events' && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    fetchAllProductsJS().then(function (products) {
      var mode = gridSection.getAttribute('data-mode') || 'all';
      var categoryName = gridSection.getAttribute('data-category-name');

      var items = products
        .map(function (p) { return { product: p, status: p.discontinued ? null : computeStatusJS(p) }; });

      if (mode === 'discontinued') {
        items = items.filter(function (i) { return i.product.discontinued; })
          .sort(function (a, b) { return new Date(b.product.discontinued_date || 0) - new Date(a.product.discontinued_date || 0); });
      } else if (mode === 'category') {
        items = items.filter(function (i) { return i.product.category === categoryName; })
          .sort(function (a, b) {
            var dateA = launchDateJS(a.product);
            var dateB = launchDateJS(b.product);
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            var diff = new Date(dateB) - new Date(dateA);
            if (diff !== 0) return diff;
            return a.product.name.localeCompare(b.product.name);
          });
      } else {
        items = items.sort(function (a, b) {
          var aDisc = !!a.product.discontinued;
          var bDisc = !!b.product.discontinued;
          if (aDisc !== bDisc) return aDisc ? 1 : -1;
          if (!aDisc) {
            var daysA = a.status ? a.status.daysSince : -Infinity;
            var daysB = b.status ? b.status.daysSince : -Infinity;
            if (daysA !== daysB) return daysB - daysA;
            return a.product.name.localeCompare(b.product.name);
          }
          var discA = a.product.discontinued_date ? new Date(a.product.discontinued_date).getTime() : 0;
          var discB = b.product.discontinued_date ? new Date(b.product.discontinued_date).getTime() : 0;
          if (discA !== discB) return discB - discA;
          return a.product.name.localeCompare(b.product.name);
        });
      }

      if (mode === 'category') {
        var tbodyEl = gridSection.querySelector('tbody') || gridSection;
        tbodyEl.innerHTML = items.map(function (i, idx) { return leagueRowHtmlJS(i.product, i.status, idx + 1); }).join('');

        var timelineSection = document.getElementById('category-timeline-section');
        if (timelineSection) {
          // Family page: every line together, whatever each product page shows.
          var categoryProducts = items.map(function (i) { return Object.assign({}, i.product, { timeline_name: null }); });
          var seedProduct = categoryProducts[0];
          var points = seedProduct ? categoryTimelinePointsJS(seedProduct, categoryProducts) : [];
          if (points.length) {
            timelineSection.style.display = '';
            timelineSection.innerHTML = '<h2>Release history</h2>' + verticalTimelineHtmlJS(seedProduct, categoryProducts);
          } else {
            timelineSection.style.display = 'none';
            timelineSection.innerHTML = '';
          }
        }
      } else {
        gridSection.innerHTML = items.map(function (i) { return cardHtmlJS(i.product, i.status); }).join('');
      }

      // Rebuild any filter bar whose values come from the data.
      var categoryBar = document.querySelector('.filter-bar[data-filter-key="category"]');
      if (categoryBar) {
        var categories = [];
        items.forEach(function (i) { if (categories.indexOf(i.product.category) === -1) categories.push(i.product.category); });
        categories.sort(function (a, b) { return a.localeCompare(b); });
        categoryBar.innerHTML = '<button class="filter-btn active" data-filter-value="all">All Products <span class="filter-btn-count">(' + items.length + ')</span></button>' +
          categories.map(function (c) {
            var count = items.filter(function (i) { return i.product.category === c; }).length;
            return '<button class="filter-btn" data-filter-value="' + escapeHtmlJS(c) + '">' + escapeHtmlJS(c) + ' <span class="filter-btn-count">(' + count + ')</span></button>';
          }).join('');
      }
      var decadeBar = document.querySelector('.filter-bar[data-filter-key="decade"]');
      if (decadeBar) {
        var decades = [];
        items.forEach(function (i) {
          if (i.product.discontinued_date) {
            var d = Math.floor(new Date(i.product.discontinued_date).getFullYear() / 10) * 10 + 's';
            if (decades.indexOf(d) === -1) decades.push(d);
          }
        });
        decades.sort();
        decadeBar.innerHTML = '<button class="filter-btn active" data-filter-value="all">All <span class="filter-btn-count">(' + items.length + ')</span></button>' +
          decades.map(function (d) {
            var count = items.filter(function (i) { return i.product.discontinued_date && (Math.floor(new Date(i.product.discontinued_date).getFullYear() / 10) * 10 + 's') === d; }).length;
            return '<button class="filter-btn" data-filter-value="' + d + '">' + d + ' <span class="filter-btn-count">(' + count + ')</span></button>';
          }).join('');
      }
      activeFilters = {};
      wireFilterBars();
      applySort();
      applyFilters();
    }).catch(function () {});
  }

  // --- Live refresh: the gallery grid, a completely separate data
  // source (gallery_photos, not products).

  function dateToTimestampJS(str) {
    if (!str) return '';
    var ms = new Date(str).getTime();
    return isNaN(ms) ? '' : ms;
  }

  function galleryPhotoImagesJS(photo) {
    if (photo.image_urls && photo.image_urls.length) return photo.image_urls;
    return photo.image_url ? [photo.image_url] : [];
  }

  function galleryStripItemHtmlJS(photo) {
    var displayName = photo.caption || (photo.tags && photo.tags[0]) || 'Untitled photo';
    var images = galleryPhotoImagesJS(photo);
    return '<a class="gallery-strip-item" href="/gallery/' + galleryPhotoSlugJS(photo) + '/">' + (images[0] ? '<img src="' + escapeHtmlJS(images[0]) + '" alt="' + escapeHtmlJS(displayName) + '">' : '') + '</a>';
  }

  function galleryTagLinkJS(value, extraClass) {
    return '<a class="pill' + (extraClass ? ' ' + extraClass : '') + '" href="/gallery/?search=' + encodeURIComponent(value) + '">' + escapeHtmlJS(value) + '</a>';
  }

  function galleryTagsHtmlJS(photo, singleRow) {
    var sortedTags = (photo.tags || []).slice().sort(function (a, b) { return a.localeCompare(b); });
    var placePills = [];
    if (photo.location) placePills.push(galleryTagLinkJS(photo.location, 'pill--location'));
    if (photo.country) placePills.push(galleryTagLinkJS(photo.country, 'pill--location'));
    var placeHtml = placePills.join('');
    var tagPills = sortedTags.map(function (t) { return galleryTagLinkJS(t); }).join('');
    if (singleRow) {
      var all = placeHtml + tagPills;
      return all ? '<div class="gallery-tags"><div class="gallery-tags-row">' + all + '</div></div>' : '';
    }
    var rows = [];
    if (placeHtml) rows.push('<div class="gallery-tags-row">' + placeHtml + '</div>');
    if (tagPills) rows.push('<div class="gallery-tags-row">' + tagPills + '</div>');
    return rows.length ? '<div class="gallery-tags">' + rows.join('') + '</div>' : '';
  }

  function galleryPhotoCardHtmlJS(photo) {
    var displayName = photo.caption || (photo.tags && photo.tags[0]) || 'Untitled photo';
    var searchText = [photo.caption, photo.location, photo.country].concat(photo.tags || []).filter(Boolean).join(' ').toLowerCase();
    var images = galleryPhotoImagesJS(photo);
    var photoCountPill = images.length > 1 ? '<span class="pill pill--count">' + images.length + ' photos</span>' : '';
    var tagsHtml = galleryTagsHtmlJS(photo);
    var footer = (tagsHtml || photoCountPill) ? '<div class="gallery-card-footer">' + tagsHtml + photoCountPill + '</div>' : '';
    return '<article class="card" data-date="' + dateToTimestampJS(photo.date_taken) + '" data-created="' + dateToTimestampJS(photo.created_at) + '" data-search="' + escapeHtmlJS(searchText) + '">' +
      '<a class="card-link" href="/gallery/' + galleryPhotoSlugJS(photo) + '/">' +
        '<div class="card-image">' +
          (images[0] ? '<img src="' + escapeHtmlJS(images[0]) + '" alt="' + escapeHtmlJS(displayName) + '">' : '') +
        '</div>' +
        '<p class="card-name">' + escapeHtmlJS(displayName) + '</p>' +
        (photo.date_taken ? '<p class="card-meta">' + formatDateJS(photo.date_taken) + '</p>' : '') +
      '</a>' +
      footer +
    '</article>';
  }

  function eventArchiveCardHtmlJS(event) {
    var dateText = [formatDateJS(event.event_date), event.event_time].filter(Boolean).join(' \u00b7 ');
    var products = (event.announced_products || []).map(function (p) { return typeof p === 'string' ? { name: p, featured: false } : p; });
    var featured = products.filter(function (p) { return p.featured; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var rest = products.filter(function (p) { return !p.featured; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var shown = featured.concat(rest).slice(0, 10);
    var remaining = products.length - shown.length;
    var tags = shown.map(function (p) { return '<span class="pill">' + escapeHtmlJS(p.name) + '</span>'; }).join('') + (remaining > 0 ? '<span class="pill pill--muted">+' + remaining + ' more</span>' : '');
    var inner = '<div class="card-image">' + (event.image_url ? '<img src="' + escapeHtmlJS(event.image_url) + '" alt="' + escapeHtmlJS(event.heading) + '">' : '') + '</div>' +
      '<p class="card-name">' + escapeHtmlJS(event.heading) + '</p>' +
      (dateText ? '<p class="card-meta">' + escapeHtmlJS(dateText) + '</p>' : '');
    return '<article class="card"><a class="card-link" href="/events/' + eventSlugJS(event) + '/">' + inner + '</a>' + (tags ? '<div class="gallery-tags"><div class="gallery-tags-row">' + tags + '</div></div>' : '') + '</article>';
  }

  if (gridSection && gridSection.getAttribute('data-mode') === 'events' && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    fetch(window.SUPABASE_URL + '/rest/v1/apple_events?select=*&order=event_date.desc', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    })
      .then(function (res) { return res.json(); })
      .then(function (events) {
        if (!Array.isArray(events)) return;
        gridSection.innerHTML = events.map(eventArchiveCardHtmlJS).join('');
        var noEvents = document.getElementById('no-events');
        if (noEvents) noEvents.style.display = events.length ? 'none' : '';
      })
      .catch(function () {});
  }

  var factsListSection = document.getElementById('facts-list');
  if (factsListSection && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    fetch(window.SUPABASE_URL + '/rest/v1/facts?select=*&order=created_at.desc', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    })
      .then(function (res) { return res.json(); })
      .then(function (facts) {
        if (!Array.isArray(facts)) return;
        factsListSection.innerHTML = facts.map(function (fact) {
          return '<div class="fact-card"><p class="fact-text">' + escapeHtmlJS(fact.text) + '</p><p class="fact-date">' + formatDateJS(fact.created_at.slice(0, 10)) + '</p></div>';
        }).join('');
        var noFacts = document.getElementById('no-facts');
        if (noFacts) noFacts.style.display = facts.length ? 'none' : '';
      })
      .catch(function () {});
  }

  if (gridSection && gridSection.getAttribute('data-mode') === 'gallery' && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    fetch(window.SUPABASE_URL + '/rest/v1/gallery_photos?select=*&order=created_at.desc', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    })
      .then(function (res) { return res.json(); })
      .then(function (photos) {
        if (!Array.isArray(photos)) return;
        gridSection.innerHTML = photos.map(galleryPhotoCardHtmlJS).join('');
        applySort();
        applyFilters();
      })
      .catch(function () {});
  }

  // --- Gallery photo lightbox: click an image to enlarge it, Escape or
  // clicking the overlay background closes it, left/right arrows (on
  // screen or keyboard) step through every image in the album. Uses
  // event delegation so it keeps working even if live-refresh replaces
  // the images below.

  var galleryPhotoPageForLightbox = document.querySelector('.gallery-photo-page');
  if (galleryPhotoPageForLightbox) {
    var activeLightbox = null;
    var lightboxImages = [];
    var lightboxIndex = 0;

    function closeLightbox() {
      if (!activeLightbox) return;
      activeLightbox.remove();
      activeLightbox = null;
      document.removeEventListener('keydown', onLightboxKeydown);
    }

    function showLightboxImage(index) {
      if (!activeLightbox || index < 0 || index >= lightboxImages.length) return;
      lightboxIndex = index;
      var img = activeLightbox.querySelector('img');
      img.src = lightboxImages[lightboxIndex].src;
      img.alt = lightboxImages[lightboxIndex].alt;
      var prevBtn = activeLightbox.querySelector('.gallery-lightbox-prev');
      var nextBtn = activeLightbox.querySelector('.gallery-lightbox-next');
      prevBtn.style.visibility = lightboxIndex > 0 ? 'visible' : 'hidden';
      nextBtn.style.visibility = lightboxIndex < lightboxImages.length - 1 ? 'visible' : 'hidden';
    }

    function onLightboxKeydown(e) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') showLightboxImage(lightboxIndex - 1);
      else if (e.key === 'ArrowRight') showLightboxImage(lightboxIndex + 1);
    }

    function openLightbox(clickedImg) {
      closeLightbox();
      lightboxImages = Array.prototype.slice.call(galleryPhotoPageForLightbox.querySelectorAll('.gallery-photo-images img')).map(function (el) {
        return { src: el.src, alt: el.alt };
      });
      var startIndex = Array.prototype.indexOf.call(galleryPhotoPageForLightbox.querySelectorAll('.gallery-photo-images img'), clickedImg);

      var overlay = document.createElement('div');
      overlay.className = 'gallery-lightbox';
      var img = document.createElement('img');
      var prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'gallery-lightbox-arrow gallery-lightbox-prev';
      prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 6 9 12 15 18"></polyline></svg>';
      prevBtn.setAttribute('aria-label', 'Previous photo');
      var nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'gallery-lightbox-arrow gallery-lightbox-next';
      nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>';
      nextBtn.setAttribute('aria-label', 'Next photo');
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'gallery-lightbox-close';
      closeBtn.textContent = '\u00d7';
      closeBtn.setAttribute('aria-label', 'Close');

      overlay.appendChild(prevBtn);
      overlay.appendChild(img);
      overlay.appendChild(nextBtn);
      overlay.appendChild(closeBtn);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeLightbox();
      });
      closeBtn.addEventListener('click', closeLightbox);
      prevBtn.addEventListener('click', function () { showLightboxImage(lightboxIndex - 1); });
      nextBtn.addEventListener('click', function () { showLightboxImage(lightboxIndex + 1); });
      document.body.appendChild(overlay);
      activeLightbox = overlay;
      showLightboxImage(startIndex >= 0 ? startIndex : 0);
      document.addEventListener('keydown', onLightboxKeydown);
    }

    galleryPhotoPageForLightbox.addEventListener('click', function (e) {
      var img = e.target.closest('.gallery-photo-images img');
      if (!img) return;
      openLightbox(img);
    });
  }

  // --- Live refresh: a single gallery photo page, matched by its URL id.

  var galleryPhotoPageEl = document.querySelector('.gallery-photo-page');
  if (galleryPhotoPageEl && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    var galleryPathParts = window.location.pathname.split('/').filter(Boolean);
    var idFromUrl = galleryPathParts[galleryPathParts.length - 1];
    fetch(window.SUPABASE_URL + '/rest/v1/gallery_photos?select=*&order=created_at.desc', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    })
      .then(function (res) { return res.json(); })
      .then(function (photos) {
        if (!Array.isArray(photos)) return;
        var index = photos.findIndex(function (p) { return galleryPhotoSlugJS(p) === idFromUrl; });
        if (index === -1) index = photos.findIndex(function (p) { return p.id === idFromUrl; });
        var photo = photos[index];
        if (!photo) return;
        var prevPhoto = index > 0 ? photos[index - 1] : null;
        var nextPhoto = index < photos.length - 1 ? photos[index + 1] : null;
        var displayName = photo.caption || (photo.tags && photo.tags[0]) || 'Untitled photo';
        var images = galleryPhotoImagesJS(photo);
        var imagesHtml = images.map(function (url) { return '<img src="' + escapeHtmlJS(url) + '" alt="' + escapeHtmlJS(displayName) + '">'; }).join('');
        var mailtoHref = 'mailto:infoswiper@yahoo.com?subject=' + encodeURIComponent('Can I use this photo? \u2014 ' + displayName) + '&body=' + encodeURIComponent('Hi, I\'d like to ask about using this photo:\n' + window.location.href);
        galleryPhotoPageEl.innerHTML =
          '<div class="gallery-photo-header">' +
            '<div class="page-header-row">' +
              '<h1>' + escapeHtmlJS(displayName) + '</h1>' +
              '<a href="/admin/?editPhoto=' + photo.id + '" class="admin-edit-link" style="display:none;">Edit</a>' +
            '</div>' +
            (photo.date_taken ? '<p class="gallery-photo-date">' + formatDateJS(photo.date_taken) + '</p>' : '') +
            galleryTagsHtmlJS(photo, true) +
          '</div>' +
          '<div class="gallery-photo-images">' + imagesHtml + '</div>' +
          '<div class="gallery-photo-copyright">' +
            '<p>These photos are my own property.</p>' +
            '<a class="intro-cta" href="' + mailtoHref + '">Request to use photo</a>' +
          '</div>' +
          '<div class="gallery-photo-nav">' +
            (prevPhoto ? '<a href="/gallery/' + galleryPhotoSlugJS(prevPhoto) + '/" class="gallery-nav-link">&larr; Previous</a>' : '<span></span>') +
            '<a href="/gallery/" class="gallery-nav-link">Full Gallery</a>' +
            (nextPhoto ? '<a href="/gallery/' + galleryPhotoSlugJS(nextPhoto) + '/" class="gallery-nav-link">Next &rarr;</a>' : '<span></span>') +
          '</div>';
        document.title = displayName + ' \u2014 Apple Sunset Gallery';
        revealAdminEditLinks(galleryPhotoPageEl.querySelectorAll('.admin-edit-link'));
      })
      .catch(function () {});
  }

  // --- Live refresh: a single product page, matched by its URL slug.
  // Fetches everything so "Replaced by" can link to the successor.

  var productPageEl = document.querySelector('.product-page');
  if (productPageEl && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    var pathParts = window.location.pathname.split('/').filter(Boolean);
    var slugFromUrl = pathParts[pathParts.length - 1];
    Promise.all([
      fetchAllProductsJS(),
      fetch(window.SUPABASE_URL + '/rest/v1/gallery_photos?select=*', {
        headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
      }).then(function (res) { return res.json(); }).catch(function () { return []; }),
    ])
      .then(function (results) {
        var products = results[0];
        var galleryPhotos = Array.isArray(results[1]) ? results[1] : [];
        var bySlug = {};
        products.forEach(function (p) { bySlug[p.slug] = p; });
        var product = bySlug[slugFromUrl];
        if (!product) return;
        var status = product.discontinued ? null : computeStatusJS(product);
        productPageEl.innerHTML = productBodyHtmlJS(product, status, bySlug, galleryPhotos);
        wireWaitButtons(productPageEl.querySelectorAll('.wait-btn'));
        revealAdminEditLinks(productPageEl.querySelectorAll('.admin-edit-link'));
        // The re-render replaces the button, so its click handler must be
        // attached again or it shows but does nothing.
        wireTweetButtons(productPageEl.querySelectorAll('.tweet-btn'));
        document.title = product.name + ' \u2014 Apple Sunset';
      })
      .catch(function () {});
  }

  // --- About page: fetch the latest content on load.

  var aboutSection = document.querySelector('.about-page');
  if (aboutSection && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    fetch(window.SUPABASE_URL + '/rest/v1/site_content?id=eq.about&select=*', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    })
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        var data = rows && rows[0];
        if (!data) return;
        var heading = aboutSection.querySelector('h1');
        if (heading && data.heading) heading.textContent = data.heading;
        var bodyEl = aboutSection.querySelector('.about-body');
        if (bodyEl && data.body) {
          bodyEl.innerHTML = '';
          data.body.split('\n\n').filter(Boolean).forEach(function (para) {
            var p = document.createElement('p');
            p.textContent = para;
            bodyEl.appendChild(p);
          });
        }
        if (data.image_url) {
          var imageWrap = aboutSection.querySelector('.about-image');
          if (imageWrap) {
            var img = imageWrap.querySelector('img');
            if (img) img.src = data.image_url;
          } else {
            imageWrap = document.createElement('div');
            imageWrap.className = 'about-image';
            var newImg = document.createElement('img');
            newImg.src = data.image_url;
            newImg.alt = '';
            imageWrap.appendChild(newImg);
            aboutSection.insertBefore(imageWrap, bodyEl);
          }
        }
      })
      .catch(function () {});
  }

  // --- Two small enhancements, both skipped when they can't help ---

  // Start fetching a product page as soon as the pointer lands on its
  // link, so the click feels instant. Each URL is only ever queued once,
  // and it is skipped on slow or metered connections.
  (function prefetchOnHover() {
    var conn = navigator.connection;
    if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return;
    var done = {};
    document.addEventListener('pointerover', function (e) {
      var link = e.target.closest && e.target.closest('a[href^="/products/"], a[href^="/categories/"]');
      if (!link || done[link.href] || link.origin !== window.location.origin) return;
      done[link.href] = true;
      var hint = document.createElement('link');
      hint.rel = 'prefetch';
      hint.href = link.href;
      document.head.appendChild(hint);
    }, { passive: true });
  })();

  // Count the headline number up on arrival. Purely decorative: the real
  // number is already in the HTML, so it is correct before this runs and
  // if this never runs at all.
  (function countUpHeroNumber() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var el = document.querySelector('.days-hero-number');
    if (!el) return;
    var target = parseInt(el.textContent.replace(/[^0-9]/g, ''), 10);
    if (!target || target < 10) return;
    var duration = 650;
    var start = null;
    function step(now) {
      if (start === null) start = now;
      var progress = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(target * eased));
      if (progress < 1) window.requestAnimationFrame(step);
      else el.textContent = String(target);
    }
    window.requestAnimationFrame(step);
  })();


  // The menu button on narrow screens. The nav works without this: the
  // markup is a plain list of links, and the button is only shown by
  // CSS on small viewports.
  (function navToggle() {
    var btn = document.getElementById('nav-toggle');
    var nav = document.getElementById('site-nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // Tapping a link closes it, and so does Escape.
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
      }
    });
  })();


  // Countdown clock. The server already rendered the number of days, so
  // this only upgrades it to days, hours and minutes and keeps it ticking.
  // The mobile family picker navigates on choose.
  (function categoryJump() {
    var el = document.querySelector('[data-category-jump]');
    if (!el) return;
    el.addEventListener('change', function () {
      if (el.value) window.location.href = el.value;
    });
  })();

  // Works out the exact moment to count down to. An event's time is typed
  // as free text such as "10am PT", so read the hour and time zone from it
  // and convert to a real instant; every visitor then sees the countdown
  // in their own local time. Products, and anything without a readable
  // time, land at 8am local, when stores open on a launch day.
  var ZONES = {
    PT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
    MT: 'America/Denver', MST: 'America/Denver', MDT: 'America/Denver',
    CT: 'America/Chicago', CST: 'America/Chicago', CDT: 'America/Chicago',
    ET: 'America/New_York', EST: 'America/New_York', EDT: 'America/New_York',
    UK: 'Europe/London', BST: 'Europe/London', GMT: 'UTC', UTC: 'UTC',
    CET: 'Europe/Paris', CEST: 'Europe/Paris'
  };
  function zoneOffsetMs(zone, utcMs) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(utcMs));
    var v = {};
    parts.forEach(function (p) { v[p.type] = p.value; });
    var asUtc = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour % 24, +v.minute, +v.second);
    return asUtc - utcMs;
  }
  function countdownTarget(dateStr, timeText) {
    if (!dateStr) return NaN;
    var bits = dateStr.split('-').map(Number);
    var m = timeText && String(timeText).replace(/\./g, '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*([A-Za-z]{2,4})?/i);
    if (m) {
      var hour = +m[1], min = +(m[2] || 0), ampm = (m[3] || '').toLowerCase();
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      var zone = m[4] ? ZONES[m[4].toUpperCase()] : null;
      if (hour <= 23 && min <= 59) {
        if (!zone) return new Date(bits[0], bits[1] - 1, bits[2], hour, min).getTime();
        try {
          var guess = Date.UTC(bits[0], bits[1] - 1, bits[2], hour, min);
          var first = guess - zoneOffsetMs(zone, guess);
          // Re-check once in case the date sits on a clock change.
          return guess - zoneOffsetMs(zone, first);
        } catch (e) { /* unknown zone: fall through */ }
      }
    }
    return new Date(bits[0], bits[1] - 1, bits[2], 8, 0).getTime();
  }

  // Carries the page details across from a "Something not right" link.
  (function contactPrefill() {
    var form = document.querySelector('.contact-form');
    if (!form) return;
    var params = new URLSearchParams(window.location.search);
    var topic = params.get('topic');
    var page = params.get('page');
    var url = params.get('url');
    var topicEl = document.getElementById('contact-topic');
    if (topic && topicEl) {
      Array.prototype.forEach.call(topicEl.options, function (o) {
        if (o.value.toLowerCase() === topic.toLowerCase()) topicEl.value = o.value;
      });
    }
    if (page) {
      var wrap = document.getElementById('contact-about-page');
      var nameEl = document.getElementById('contact-page');
      var urlEl = document.getElementById('contact-page-url');
      if (wrap && nameEl) {
        wrap.hidden = false;
        nameEl.value = page;
        if (urlEl) urlEl.value = url ? window.location.origin + url : '';
      }
      var msg = document.getElementById('contact-message');
      if (msg) msg.focus();
    }
  })();

  (function countdown() {
    function unit(value, label, isSeconds) {
      return '<span class="countdown-unit' + (isSeconds ? ' countdown-unit--secs' : '') + '">' +
        '<span class="countdown-value">' + value + '</span>' +
        '<span class="countdown-unit-label">' + label + '</span></span>';
    }
    function render(el) {
      var clock = el.querySelector('[data-countdown-clock]');
      if (!clock) return;
      var target = countdownTarget(el.getAttribute('data-countdown'), el.getAttribute('data-countdown-time'));
      if (!target || isNaN(target)) return;
      var left = target - Date.now();
      if (left <= 0) {
        clock.innerHTML = '<span class="countdown-unit"><span class="countdown-value">Today</span></span>';
        return;
      }
      var secs = Math.floor(left / 1000);
      var days = Math.floor(secs / 86400);
      var hours = Math.floor((secs % 86400) / 3600);
      var mins = Math.floor((secs % 3600) / 60);
      clock.innerHTML = unit(days, days === 1 ? 'day' : 'days') +
        unit(hours, 'hours') + unit(mins, 'mins') + unit(secs % 60, 'secs', true);
    }
    function tickAll() {
      var els = document.querySelectorAll('[data-countdown]');
      for (var i = 0; i < els.length; i++) render(els[i]);
    }
    tickAll();
    setInterval(tickAll, 1000);
  })();

  // Live countdown on a featured product that has not been released yet.
  // Re-scanned after any client-side re-render, and ticks every second.
  (function productCountdown() {
    function unit(value, label) {
      return '<span class="countdown-unit"><span class="countdown-value">' + value +
        '</span><span class="countdown-unit-label">' + label + '</span></span>';
    }
    function render(el) {
      var clock = el.querySelector('[data-product-countdown-clock]');
      if (!clock) return;
      var dateStr = el.getAttribute('data-product-countdown');
      if (!dateStr) return;
      // Releases are treated as landing at 8am local time, which is when
      // Apple stores typically open on a launch day.
      var target = new Date(dateStr + 'T08:00:00').getTime();
      var left = target - Date.now();
      if (isNaN(target)) return;
      if (left <= 0) {
        clock.innerHTML = '<span class="countdown-unit"><span class="countdown-value">Out now</span></span>';
        return;
      }
      var secs = Math.floor(left / 1000);
      var days = Math.floor(secs / 86400);
      var hours = Math.floor((secs % 86400) / 3600);
      var mins = Math.floor((secs % 3600) / 60);
      clock.innerHTML = unit(days, days === 1 ? 'day' : 'days') +
        unit(hours, 'hr') + unit(mins, 'min') + unit(secs % 60, 'sec');
    }
    function tickAll() {
      var els = document.querySelectorAll('[data-product-countdown]');
      for (var i = 0; i < els.length; i++) render(els[i]);
    }
    tickAll();
    setInterval(tickAll, 1000);
  })();

})();
