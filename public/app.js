(function () {
  // --- Shared helpers: a JS port of src/status.js and the card/badge
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

  function formatDateJS(d) {
    return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' });
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

  function badgeHtmlJS(product, statusInfo) {
    if (product.coming_soon) return '<span class="badge badge--coming-soon">Coming soon</span>';
    if (!statusInfo) return '';
    return '<span class="badge badge--' + statusInfo.status + '">' + statusInfo.daysSince + ' days since refresh</span>';
  }

  function cardHtmlJS(product, statusInfo) {
    var img = primaryImageJS(product);
    var imageBlock = img
      ? '<img src="' + img + '" alt="' + escapeHtmlJS(product.name) + '">'
      : categoryIconJS(product.category);
    var days = statusInfo && !product.coming_soon ? statusInfo.daysSince : '';
    return (
      '<article class="card" data-category="' + escapeHtmlJS(product.category) + '" data-days="' + days + '">' +
        '<a class="card-link" href="/products/' + product.slug + '/">' +
          '<div class="card-image">' + imageBlock + '</div>' +
          '<span class="pill">' + escapeHtmlJS(product.category) + '</span>' +
          '<p class="card-name">' + escapeHtmlJS(product.name) + '</p>' +
          badgeHtmlJS(product, statusInfo) +
        '</a>' +
        '<button class="wait-btn" data-product-id="' + product.id + '" data-slug="' + product.slug + '" data-count="' + (product.waiting_count || 0) + '">' +
          'Waiting for a refresh?' +
        '</button>' +
      '</article>'
    );
  }

  function productBodyHtmlJS(product, status) {
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

    var firstStat = '';
    if (product.coming_soon) {
      firstStat = '<div class="stat"><p class="stat-label">Expected</p><p class="stat-value">' +
        (product.expected_date ? formatDateJS(product.expected_date) : 'Not yet announced') + '</p></div>';
    } else if (status) {
      firstStat = '<div class="stat"><p class="stat-label">Last refreshed</p><p class="stat-value">' + formatDateJS(status.lastRefresh) + '</p></div>';
    }

    var history = product.refresh_history || [];
    var timelineItems = history.slice().reverse().map(function (d, i) {
      var label = i === 0 ? product.name : product.name + ' (earlier)';
      return '<div class="timeline-item"><p class="timeline-name">' + escapeHtmlJS(label) + '</p><p class="timeline-date">' + formatDateJS(d) + '</p></div>';
    }).join('');
    var releaseHistorySection = history.length ? '<h2>Release history</h2><div class="timeline">' + timelineItems + '</div>' : '';

    var externalLinkBlock = product.external_link
      ? '<p class="external-link"><a href="' + product.external_link + '" target="_blank" rel="noopener">More information &#8599;</a></p>'
      : '';

    var verdict = null;
    if (status && !product.coming_soon) {
      if (status.status === 'fresh') verdict = { text: 'Good time to buy', cls: 'fresh' };
      else if (status.status === 'aging') verdict = { text: 'Fine to buy, refresh due within the year', cls: 'aging' };
      else verdict = { text: 'Wait, refresh is overdue', cls: 'overdue' };
    }

    return (
      '<div class="product-header">' +
        '<div>' +
          '<span class="pill">' + escapeHtmlJS(product.category) + '</span>' +
          '<h1>' + escapeHtmlJS(product.name) + '</h1>' +
        '</div>' +
        '<div class="product-header-right">' +
          badgeHtmlJS(product, status) +
          '<a href="/admin/?edit=' + product.id + '" class="admin-edit-link" style="display:none;">Edit this product</a>' +
        '</div>' +
      '</div>' +
      '<div class="card-image product-image">' + mainImage + '</div>' +
      galleryRest +
      videoBlock +
      '<div class="stat-row">' +
        firstStat +
        (product.price ? '<div class="stat"><p class="stat-label">Starting price</p><p class="stat-value">' + escapeHtmlJS(product.price) + '</p></div>' : '') +
        (product.chip ? '<div class="stat"><p class="stat-label">Chip</p><p class="stat-value">' + escapeHtmlJS(product.chip) + '</p></div>' : '') +
      '</div>' +
      releaseHistorySection +
      (product.rumor_note ? '<div class="callout"><p class="callout-label">Notes</p><p>' + escapeHtmlJS(product.rumor_note) + '</p></div>' : '') +
      externalLinkBlock +
      (verdict ? '<div class="verdict-row"><span>Verdict</span><span class="badge badge--' + verdict.cls + '">' + verdict.text + '</span></div>' : '') +
      '<button class="wait-btn wait-btn--large" data-product-id="' + product.id + '" data-slug="' + product.slug + '" data-count="' + (product.waiting_count || 0) + '">' +
        'Waiting for a refresh?' +
      '</button>'
    );
  }

  function fetchAllProductsJS() {
    return fetch(window.SUPABASE_URL + '/rest/v1/products?select=*', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    }).then(function (res) { return res.json(); });
  }

  // --- Waiting button: works the same whether the button was rendered
  // at build time or injected live, call this on any new batch of them.

  function votedKey(slug) { return 'waited_' + slug; }
  function votedCountKey(slug) { return 'waited_count_' + slug; }

  function wireWaitButtons(buttons) {
    buttons.forEach(function (btn) {
      var slug = btn.getAttribute('data-slug');
      var baseCount = parseInt(btn.getAttribute('data-count'), 10) || 0;

      function showVoted(count) {
        btn.textContent = count + ' people are waiting for a refresh';
        btn.classList.add('voted');
        btn.disabled = true;
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
          }).catch(function () {
            // Fails quietly — the count still updated locally.
          });
        }
      });
    });
  }

  // --- Category filter + search (all-products page). Rebindable since
  // the filter buttons themselves get regenerated on a live refresh.

  var searchInput = document.getElementById('search-input');
  var noResults = document.getElementById('no-results');
  var currentCategory = 'all';

  function applyFilters() {
    var query = (searchInput ? searchInput.value : '').trim().toLowerCase();
    var visibleCount = 0;
    document.querySelectorAll('.card[data-category]').forEach(function (card) {
      var matchesCategory = currentCategory === 'all' || card.getAttribute('data-category') === currentCategory;
      var nameEl = card.querySelector('.card-name');
      var name = nameEl ? nameEl.textContent.toLowerCase() : '';
      var matchesSearch = query === '' || name.indexOf(query) !== -1;
      var show = matchesCategory && matchesSearch;
      card.style.display = show ? '' : 'none';
      if (show) visibleCount++;
    });
    if (noResults) noResults.style.display = visibleCount === 0 ? '' : 'none';
  }

  function wireFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentCategory = btn.getAttribute('data-filter');
        applyFilters();
      });
    });
  }

  wireFilterButtons();
  if (searchInput) searchInput.addEventListener('input', applyFilters);

  // --- Sort (all-products page). Coming soon / no-status cards have no
  // day count, they always sort to the end regardless of direction.

  var sortSelect = document.getElementById('sort-select');

  function applySort() {
    var grid = document.getElementById('grid');
    if (!grid || !sortSelect) return;
    var sortValue = sortSelect.value;
    if (!sortValue) return; // "Sort by..." placeholder still showing, nothing chosen yet
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));

    cards.sort(function (a, b) {
      if (sortValue === 'name-asc' || sortValue === 'name-desc') {
        var nameA = (a.querySelector('.card-name') || {}).textContent || '';
        var nameB = (b.querySelector('.card-name') || {}).textContent || '';
        var cmp = nameA.localeCompare(nameB);
        return sortValue === 'name-asc' ? cmp : -cmp;
      }
      var rawA = a.getAttribute('data-days');
      var rawB = b.getAttribute('data-days');
      var hasA = rawA !== null && rawA !== '';
      var hasB = rawB !== null && rawB !== '';
      if (!hasA && !hasB) return 0;
      if (!hasA) return 1;
      if (!hasB) return -1;
      var diff = parseInt(rawA, 10) - parseInt(rawB, 10);
      return sortValue === 'days-desc' ? -diff : diff;
    });

    cards.forEach(function (card) { grid.appendChild(card); });
  }

  if (sortSelect) sortSelect.addEventListener('change', applySort);
  applySort();

  // --- Reveal the "Edit this product" link, but only to the logged-in
  // admin. Callable again after a live refresh injects new ones.

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

  // --- Live refresh: homepage hero + grid. Patches the section that's
  // already there from the last build, doesn't create it from nothing,
  // so a homepage that built with zero products still needs one rebuild
  // to get its first hero section, after that this takes over.

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
            '<span class="pill">' + escapeHtmlJS(featured.product.category) + '</span>' +
            '<p class="hero-name">' + escapeHtmlJS(featured.product.name) + '</p>' +
            badgeHtmlJS(featured.product, featured.status) +
          '</div>' +
        '</a>' +
        '<div class="hero-grid">' + rest.map(function (r) { return cardHtmlJS(r.product, r.status); }).join('') + '</div>';

      wireWaitButtons(heroSection.querySelectorAll('.wait-btn'));
    }).catch(function () {
      // Fails quietly — the homepage still shows what was there at the last build.
    });
  }

  // --- Live refresh: the /products/ grid + its category filters.

  var gridSection = document.getElementById('grid');
  if (gridSection && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    fetchAllProductsJS().then(function (products) {
      var active = products.filter(function (p) { return !p.discontinued; });
      var withStatus = active
        .map(function (p) { return { product: p, status: computeStatusJS(p) }; })
        .filter(function (i) { return i.status || i.product.coming_soon; });

      gridSection.innerHTML = withStatus.map(function (i) { return cardHtmlJS(i.product, i.status); }).join('');
      wireWaitButtons(gridSection.querySelectorAll('.wait-btn'));

      var filterBar = document.querySelector('.filter-bar');
      if (filterBar) {
        var categories = [];
        withStatus.forEach(function (i) {
          if (categories.indexOf(i.product.category) === -1) categories.push(i.product.category);
        });
        filterBar.innerHTML = '<button class="filter-btn active" data-filter="all">All</button>' +
          categories.map(function (c) {
            return '<button class="filter-btn" data-filter="' + escapeHtmlJS(c) + '">' + escapeHtmlJS(c) + '</button>';
          }).join('');
        wireFilterButtons();
      }
      currentCategory = 'all';
      applySort();
      applyFilters();
    }).catch(function () {
      // Fails quietly — the grid still shows what was there at the last build.
    });
  }

  // --- Live refresh: a single product page, matched by its URL slug.

  var productPageEl = document.querySelector('.product-page');
  if (productPageEl && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    var pathParts = window.location.pathname.split('/').filter(Boolean);
    var slugFromUrl = pathParts[pathParts.length - 1];
    fetch(window.SUPABASE_URL + '/rest/v1/products?slug=eq.' + encodeURIComponent(slugFromUrl) + '&select=*', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
    })
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        var product = rows && rows[0];
        if (!product) return;
        var status = computeStatusJS(product);
        productPageEl.innerHTML = productBodyHtmlJS(product, status);
        wireWaitButtons(productPageEl.querySelectorAll('.wait-btn'));
        revealAdminEditLinks(productPageEl.querySelectorAll('.admin-edit-link'));
        document.title = product.name + ' \u2014 Apple Refresher';
      })
      .catch(function () {
        // Fails quietly — the page still shows what was there at the last build.
      });
  }

  // --- About page: fetch the latest content on load so admin edits show
  // up immediately, without waiting for the site to rebuild.

  var aboutSection = document.querySelector('.about-page');
  if (aboutSection && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    fetch(window.SUPABASE_URL + '/rest/v1/site_content?id=eq.about&select=*', {
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY,
      },
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
      .catch(function () {
        // Fails quietly — the page still shows the content from the
        // last build, which is a perfectly good fallback.
      });
  }
})();
