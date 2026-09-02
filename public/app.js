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

  function slugifyJS(str) {
    return String(str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
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

  function lifespanTextJS(start, end) {
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
    if (product.coming_soon) return 'coming-soon';
    return 'current';
  }

  var CATEGORY_ICON_SHAPES = {
    iPhone: '<rect x="13" y="4" width="14" height="32" rx="3"/><line x1="17" y1="31" x2="23" y2="31"/>',
    Mac: '<rect x="8" y="9" width="24" height="16" rx="1.5"/><path d="M5 30h30l-2.5-3h-25z"/>',
    iPad: '<rect x="7" y="8" width="26" height="24" rx="3"/><line x1="19" y1="27" x2="21" y2="27"/>',
    'Apple Watch': '<rect x="12" y="10" width="16" height="20" rx="5"/><rect x="27.5" y="17" width="3" height="6" rx="1"/>',
    AirPods: '<path d="M14 10c-3 0-5 2-5 5v9c0 2 1.5 3 3 3s3-1 3-3V13"/><path d="M26 10c3 0 5 2 5 5v9c0 2-1.5 3-3 3s-3-1-3-3V13"/>',
    'Vision Pro': '<path d="M6 18c0-4 3-6 14-6s14 2 14 6-3 6-14 6S6 22 6 18z"/><circle cx="15" cy="18" r="2.5"/><circle cx="25" cy="18" r="2.5"/>',
    Other: '<rect x="8" y="8" width="24" height="24" rx="4"/>',
  };

  function categoryIconJS(category) {
    var shape = CATEGORY_ICON_SHAPES[category] || CATEGORY_ICON_SHAPES.Other;
    return '<svg class="placeholder-icon" viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + shape + '</svg>';
  }

  function primaryImageJS(product) {
    if (product.image_urls && product.image_urls.length) return product.image_urls[0];
    return product.image_url || null;
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

  function badgeHtmlJS(product, statusInfo) {
    if (product.discontinued) {
      var date = product.discontinued_date ? ' ' + formatDateJS(product.discontinued_date) : '';
      return '<span class="badge badge--discontinued">Discontinued' + date + '</span>';
    }
    if (product.coming_soon) return '<span class="badge badge--coming-soon">Coming soon</span>';
    if (!statusInfo) return '';
    var info = badgeDaysInfoJS(product, statusInfo);
    return '<span class="badge badge--' + statusInfo.status + '">' + info.days + ' days ' + info.suffix + '</span>';
  }

  function cardHtmlJS(product, statusInfo) {
    var status = statusKeyJS(product);
    var launch = launchDateJS(product);
    var img = primaryImageJS(product);
    var imageBlock = img
      ? '<img src="' + img + '" alt="' + escapeHtmlJS(product.name) + '">'
      : categoryIconJS(product.category);
    var days = statusInfo && status === 'current' ? statusInfo.daysSince : '';
    var launchTs = launch ? new Date(launch).getTime() : '';
    var discTs = product.discontinued && product.discontinued_date ? new Date(product.discontinued_date).getTime() : '';
    var lifespanDays = launch && product.discontinued && product.discontinued_date ? daysBetweenJS(launch, product.discontinued_date) : '';
    var decade = product.discontinued && product.discontinued_date ? Math.floor(new Date(product.discontinued_date).getFullYear() / 10) * 10 + 's' : '';
    var meta = launch && product.discontinued && product.discontinued_date
      ? '<p class="card-meta">Lived ' + lifespanTextJS(launch, product.discontinued_date) + '</p>'
      : '';
    return (
      '<article class="card' + (status === 'discontinued' ? ' card--discontinued' : '') + '" data-category="' + escapeHtmlJS(product.category) + '" data-status="' + status + '" data-days="' + days + '" data-launch="' + launchTs + '" data-discontinued="' + discTs + '" data-lifespan="' + lifespanDays + '" data-decade="' + decade + '">' +
        '<a class="card-link" href="/products/' + product.slug + '/">' +
          '<div class="card-image">' + imageBlock + '</div>' +
          '<p class="card-name">' + escapeHtmlJS(product.name) + '</p>' +
          badgeHtmlJS(product, statusInfo) +
          meta +
        '</a>' +
        pillJS(product.category) +
      '</article>'
    );
  }

  function specRowJS(label, valueHtml) {
    return valueHtml ? '<div class="spec-row"><dt>' + label + '</dt><dd>' + valueHtml + '</dd></div>' : '';
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
    if (product.coming_soon) return '<p class="days-hero days-hero--coming-soon">Coming soon</p>';
    if (!statusInfo) return '';
    var info = badgeDaysInfoJS(product, statusInfo);
    return '<p class="days-hero days-hero--' + statusInfo.status + '"><span class="days-hero-number">' + info.days + '</span> days ' + info.suffix + '</p>';
  }

  function productBodyHtmlJS(product, status, productsBySlug) {
    var sortedDates = sortedHistoryJS(product);
    var launch = sortedDates[0] || null;
    var latest = sortedDates[sortedDates.length - 1] || null;

    var images = product.image_urls && product.image_urls.length ? product.image_urls : product.image_url ? [product.image_url] : [];
    var mainImage = images[0]
      ? '<img src="' + images[0] + '" alt="' + escapeHtmlJS(product.name) + '">'
      : categoryIconJS(product.category);
    var galleryRest = images.length > 1
      ? '<div class="product-gallery">' + images.slice(1).map(function (url) {
          return '<div class="product-gallery-item"><img src="' + url + '" alt="' + escapeHtmlJS(product.name) + '"></div>';
        }).join('') + '</div>'
      : '';
    var videoBlock = product.video_url ? '<video class="product-video" src="' + product.video_url + '" controls></video>' : '';

    var successor = product.replaced_by && productsBySlug ? productsBySlug[product.replaced_by] : null;
    var replacedByHtml = successor
      ? '<a href="/products/' + successor.slug + '/">' + escapeHtmlJS(successor.name) + '</a>'
      : product.replaced_by ? escapeHtmlJS(product.replaced_by) : '';

    var predecessor = product.previous_model && productsBySlug ? productsBySlug[product.previous_model] : null;
    var previousModelHtml = predecessor
      ? '<a href="/products/' + predecessor.slug + '/">' + escapeHtmlJS(predecessor.name) + '</a>'
      : product.previous_model ? escapeHtmlJS(product.previous_model) : '';

    var daysInfo = status ? badgeDaysInfoJS(product, status) : null;

    var specs = [
      specRowJS('Category', pillJS(product.category)),
      specRowJS('Status', product.discontinued ? 'Discontinued' : product.coming_soon ? 'Coming soon' : 'Current'),
      product.coming_soon ? specRowJS('Expected', product.expected_date ? formatDateJS(product.expected_date) : 'Not yet announced') : '',
      launch ? specRowJS('Launched', formatDateJS(launch)) : '',
      latest && sortedDates.length > 1 && !product.discontinued ? specRowJS('Last refreshed', formatDateJS(latest)) : '',
      sortedDates.length > 1 ? specRowJS('Times refreshed', String(sortedDates.length - 1)) : '',
      product.discontinued && product.discontinued_date ? specRowJS('Discontinued', formatDateJS(product.discontinued_date)) : '',
      launch && product.discontinued && product.discontinued_date ? specRowJS('Lifespan', lifespanTextJS(launch, product.discontinued_date)) : '',
      specRowJS('Starting price', escapeHtmlJS(formatPriceJS(product.price))),
      daysInfo ? specRowJS('Days counted from', (product.days_basis === 'launch' ? 'Launch' : 'Refresh') + ': ' + daysInfo.days + ' days') : '',
      specRowJS('Chip', escapeHtmlJS(product.chip)),
      specRowJS('Previous model', previousModelHtml),
      specRowJS('Replaced by', replacedByHtml),
      product.discontinued ? specRowJS('Why it went', escapeHtmlJS(product.discontinued_reason)) : '',
      product.external_link ? specRowJS('More information', '<a href="' + product.external_link + '" target="_blank" rel="noopener">' + escapeHtmlJS(externalLinkLabelJS(product)) + ' &#8599;</a>') : '',
      product.discontinued ? '' : specRowJS('Waiting for a refresh', '<span class="wait-count-value">' + (product.waiting_count || 0) + '</span> people'),
    ].filter(Boolean).join('');

    var timelineItems = sortedDates.slice().reverse().map(function (d, i) {
      var label = i === 0 ? product.name : product.name + ' (earlier)';
      return '<div class="timeline-item"><p class="timeline-name">' + escapeHtmlJS(label) + '</p><p class="timeline-date">' + formatDateJS(d) + '</p></div>';
    }).join('');
    var releaseHistorySection = sortedDates.length ? '<h2>Release history</h2><div class="timeline">' + timelineItems + '</div>' : '';

    return (
      '<div class="product-top">' +
        '<div class="product-media">' +
          '<div class="card-image product-image">' + mainImage + '</div>' +
          galleryRest +
          videoBlock +
        '</div>' +
        '<div class="product-info">' +
          '<div class="product-header">' +
            '<div>' + pillJS(product.category) + '<h1>' + escapeHtmlJS(product.name) + '</h1>' + heroStatHtmlJS(product, status) + '</div>' +
            '<a href="/admin/?edit=' + product.id + '" class="admin-edit-link" style="display:none;">Edit this product</a>' +
          '</div>' +
          '<dl class="spec-list">' + specs + '</dl>' +
          (product.discontinued ? '' : '<button class="wait-btn wait-btn--large" data-product-id="' + product.id + '" data-slug="' + product.slug + '" data-count="' + (product.waiting_count || 0) + '">Are you looking forward to a new ' + escapeHtmlJS(product.category) + '?</button>') +
        '</div>' +
      '</div>' +
      releaseHistorySection +
      (product.rumor_note ? '<div class="callout"><p class="callout-label">Notes</p><p>' + escapeHtmlJS(product.rumor_note) + '</p></div>' : '')
    );
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

  function applyFilters() {
    var query = (searchInput ? searchInput.value : '').trim().toLowerCase();
    var visibleCount = 0;
    document.querySelectorAll('#grid .card').forEach(function (card) {
      var show = true;
      Object.keys(activeFilters).forEach(function (key) {
        var want = activeFilters[key];
        if (want !== 'all' && card.getAttribute('data-' + key) !== want) show = false;
      });
      if (show && query) {
        var nameEl = card.querySelector('.card-name');
        var name = nameEl ? nameEl.textContent.toLowerCase() : '';
        if (name.indexOf(query) === -1) show = false;
      }
      card.style.display = show ? '' : 'none';
      if (show) visibleCount++;
    });
    if (noResults) noResults.style.display = visibleCount === 0 ? '' : 'none';
  }

  function wireFilterBars() {
    document.querySelectorAll('.filter-bar[data-filter-key]').forEach(function (bar) {
      var key = bar.getAttribute('data-filter-key');
      if (!(key in activeFilters)) activeFilters[key] = 'all';
      bar.querySelectorAll('.filter-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          bar.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          activeFilters[key] = btn.getAttribute('data-filter-value');
          applyFilters();
        });
      });
    });
  }

  wireFilterBars();
  if (searchInput) searchInput.addEventListener('input', applyFilters);

  // --- Sort. Option values are "<attr>-<dir>": name sorts on the card's
  // name, anything else on a data-<attr> number. Cards missing that
  // number sort to the end whichever direction you pick.

  var sortSelect = document.getElementById('sort-select');

  function applySort() {
    var grid = document.getElementById('grid');
    if (!grid || !sortSelect || !sortSelect.value) return;
    var parts = sortSelect.value.split('-');
    var dir = parts.pop();
    var attr = parts.join('-');
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));

    cards.sort(function (a, b) {
      if (attr === 'name') {
        var nameA = (a.querySelector('.card-name') || {}).textContent || '';
        var nameB = (b.querySelector('.card-name') || {}).textContent || '';
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

    cards.forEach(function (card) { grid.appendChild(card); });
  }

  if (sortSelect) sortSelect.addEventListener('change', applySort);
  applySort();

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

  revealAdminEditLinks(document.querySelectorAll('.admin-edit-link'));
  wireWaitButtons(document.querySelectorAll('.wait-btn'));

  // --- Live refresh: homepage hero + grid.

  var heroSection = document.querySelector('.hero');
  if (heroSection && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    fetchAllProductsJS().then(function (products) {
      var active = products.filter(function (p) { return !p.discontinued; });
      var withStatus = active
        .map(function (p) { return { product: p, status: computeStatusJS(p) }; })
        .filter(function (i) { return i.status || i.product.coming_soon; });
      if (!withStatus.length) return;

      var rankable = withStatus.filter(function (i) { return i.status; });
      var featured = withStatus.filter(function (i) { return i.product.featured; })[0];
      if (!featured) {
        featured = rankable.slice().sort(function (a, b) { return b.status.ratio - a.status.ratio; })[0] || withStatus[0];
      }
      var rest = rankable
        .filter(function (i) { return i.product.id !== featured.product.id; })
        .sort(function (a, b) { return b.status.ratio - a.status.ratio; })
        .slice(0, 4);

      var heroImg = primaryImageJS(featured.product);
      var heroImageBlock = heroImg
        ? '<img src="' + heroImg + '" alt="' + escapeHtmlJS(featured.product.name) + '">'
        : categoryIconJS(featured.product.category);

      heroSection.innerHTML =
        '<a class="hero-card" href="/products/' + featured.product.slug + '/">' +
          '<div class="hero-image">' + heroImageBlock + '</div>' +
          '<div class="hero-body">' +
            '<p class="hero-eyebrow">Featured</p>' +
            '<p class="hero-name">' + escapeHtmlJS(featured.product.name) + '</p>' +
            badgeHtmlJS(featured.product, featured.status) +
          '</div>' +
        '</a>' +
        '<div class="hero-grid">' + rest.map(function (r) { return cardHtmlJS(r.product, r.status); }).join('') + '</div>';
    }).catch(function () {});
  }

  // --- Live refresh: any card grid (/products/, /discontinued/, a
  // category page). The grid's data-mode says which products belong.

  var gridSection = document.getElementById('grid');
  if (gridSection && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    fetchAllProductsJS().then(function (products) {
      var mode = gridSection.getAttribute('data-mode') || 'all';
      var categoryName = gridSection.getAttribute('data-category-name');

      var items = products
        .map(function (p) { return { product: p, status: p.discontinued ? null : computeStatusJS(p) }; })
        .filter(function (i) { return i.product.discontinued || i.status || i.product.coming_soon; });

      if (mode === 'discontinued') {
        items = items.filter(function (i) { return i.product.discontinued; })
          .sort(function (a, b) { return new Date(b.product.discontinued_date || 0) - new Date(a.product.discontinued_date || 0); });
      } else if (mode === 'category') {
        items = items.filter(function (i) { return i.product.category === categoryName; });
      }

      gridSection.innerHTML = items.map(function (i) { return cardHtmlJS(i.product, i.status); }).join('');

      // Rebuild any filter bar whose values come from the data.
      var categoryBar = document.querySelector('.filter-bar[data-filter-key="category"]');
      if (categoryBar) {
        var categories = [];
        items.forEach(function (i) { if (categories.indexOf(i.product.category) === -1) categories.push(i.product.category); });
        categories.sort();
        categoryBar.innerHTML = '<button class="filter-btn active" data-filter-value="all">All</button>' +
          categories.map(function (c) { return '<button class="filter-btn" data-filter-value="' + escapeHtmlJS(c) + '">' + escapeHtmlJS(c) + '</button>'; }).join('');
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
        decadeBar.innerHTML = '<button class="filter-btn active" data-filter-value="all">All</button>' +
          decades.map(function (d) { return '<button class="filter-btn" data-filter-value="' + d + '">' + d + '</button>'; }).join('');
      }
      activeFilters = {};
      wireFilterBars();
      applySort();
      applyFilters();
    }).catch(function () {});
  }

  // --- Live refresh: a single product page, matched by its URL slug.
  // Fetches everything so "Replaced by" can link to the successor.

  var productPageEl = document.querySelector('.product-page');
  if (productPageEl && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    var pathParts = window.location.pathname.split('/').filter(Boolean);
    var slugFromUrl = pathParts[pathParts.length - 1];
    fetchAllProductsJS()
      .then(function (products) {
        var bySlug = {};
        products.forEach(function (p) { bySlug[p.slug] = p; });
        var product = bySlug[slugFromUrl];
        if (!product) return;
        var status = product.discontinued ? null : computeStatusJS(product);
        productPageEl.innerHTML = productBodyHtmlJS(product, status, bySlug);
        wireWaitButtons(productPageEl.querySelectorAll('.wait-btn'));
        revealAdminEditLinks(productPageEl.querySelectorAll('.admin-edit-link'));
        document.title = product.name + ' \u2014 Apple Refresher';
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
})();
