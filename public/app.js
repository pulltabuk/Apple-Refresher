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

  // Waiting button
  var supabase = null;
  if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabaseClient) {
    supabase = window.supabaseClient;
  }

  function votedKey(slug) { return 'waited_' + slug; }

  document.querySelectorAll('.wait-btn').forEach(function (btn) {
    var slug = btn.getAttribute('data-slug');
    if (localStorage.getItem(votedKey(slug))) {
      btn.classList.add('voted');
      btn.disabled = true;
    }

    btn.addEventListener('click', function () {
      if (localStorage.getItem(votedKey(slug))) return;

      var countEl = btn.querySelector('.wait-count');
      var newCount = parseInt(countEl.textContent, 10) + 1;
      countEl.textContent = newCount;
      btn.classList.add('voted');
      btn.disabled = true;
      localStorage.setItem(votedKey(slug), '1');

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
})();
