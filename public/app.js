(function () {
  // Category filter (all-products page only)
  var filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var filter = btn.getAttribute('data-filter');
      document.querySelectorAll('.card[data-category]').forEach(function (card) {
        var show = filter === 'all' || card.getAttribute('data-category') === filter;
        card.style.display = show ? '' : 'none';
      });
    });
  });

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
