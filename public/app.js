(function () {
  // Search + category filter (all-products page only)
  var filterBtns = document.querySelectorAll('.filter-btn');
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

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentCategory = btn.getAttribute('data-filter');
      applyFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  // Reveal the "Edit this product" link, but only to the logged-in
  // admin — every other visitor never sees it.
  var editLinks = document.querySelectorAll('.admin-edit-link');
  if (editLinks.length && window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase) {
    var authClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    authClient.auth.getSession().then(function (result) {
      if (result.data && result.data.session) {
        editLinks.forEach(function (el) { el.style.display = ''; });
      }
    });
  }

  function votedKey(slug) { return 'waited_' + slug; }
  function votedCountKey(slug) { return 'waited_count_' + slug; }

  document.querySelectorAll('.wait-btn').forEach(function (btn) {
    var slug = btn.getAttribute('data-slug');
    var baseCount = parseInt(btn.getAttribute('data-count'), 10) || 0;

    function showVoted(count) {
      btn.textContent = count + ' people are waiting for this';
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
          // Fails quietly — the count still updated locally, and the
          // real total is correct again next time the site rebuilds.
        });
      }
    });
  });
  // About page: fetch the latest content on load so admin edits show up
  // immediately, without waiting for the site to rebuild. Products stay
  // build-time only on purpose, that's what keeps them crawlable.
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
