(function () {
  const client = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  const loginSection = document.getElementById('login-section');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');
  const productListEl = document.getElementById('product-list');
  const productForm = document.getElementById('product-form');
  const aboutForm = document.getElementById('about-form');
  const refreshHistoryListEl = document.getElementById('refresh-history-list');
  const videoStatusEl = document.getElementById('video-status');

  let editingId = null;
  // An announcement added before any release date exists. It attaches
  // itself to the first release added, so dates can be entered in any order.
  let pendingAnnouncedDate = null;
  let pendingPreorderDate = null;
  let editingSlug = null;
  let cachedProducts = [];
  let currentRefreshHistory = [];
  let currentOriginalLaunchDate = null;
  let currentGenerationDetails = {};
  let currentDiscontinuedDate = null;
  let currentIconUrl = null;
  let currentVideoUrl = null;

  function slugify(name) {
    return (name || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '');
  }

  // --- Date precision picker: shared by Original launch date, Expected
  // date, Discontinued date, and the "add a refresh date" row. Each one
  // is a set of three radios (day/month/year) named "<prefix>_precision"
  // plus three inputs "<prefix>_day" (date), "<prefix>_month" (month),
  // "<prefix>_year" (number), only one of which shows at a time.

  function formatAdminDate(value) {
    if (!value) return '';
    if (/^\d{4}$/.test(value)) return value;
    if (/^\d{4}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-');
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    }
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function updateDatePrecisionVisibility(prefix) {
    const checked = document.querySelector('input[name="' + prefix + '_precision"]:checked');
    const val = checked ? checked.value : 'day';
    const dayInput = document.getElementById(prefix + '_day');
    const monthInput = document.getElementById(prefix + '_month');
    const yearInput = document.getElementById(prefix + '_year');
    if (!dayInput || !monthInput || !yearInput) return;
    dayInput.style.display = val === 'day' ? '' : 'none';
    monthInput.style.display = val === 'month' ? '' : 'none';
    yearInput.style.display = val === 'year' ? '' : 'none';
  }

  function wireDatePrecisionField(prefix) {
    document.querySelectorAll('input[name="' + prefix + '_precision"]').forEach((radio) => {
      radio.addEventListener('change', () => updateDatePrecisionVisibility(prefix));
    });
    updateDatePrecisionVisibility(prefix);
  }

  function getDatePrecisionValue(prefix) {
    const checked = document.querySelector('input[name="' + prefix + '_precision"]:checked');
    const val = checked ? checked.value : 'day';
    if (val === 'day') return document.getElementById(prefix + '_day').value || null;
    if (val === 'month') return document.getElementById(prefix + '_month').value || null;
    const year = document.getElementById(prefix + '_year').value.trim();
    return year || null;
  }

  function setDatePrecisionValue(prefix, value) {
    const dayInput = document.getElementById(prefix + '_day');
    const monthInput = document.getElementById(prefix + '_month');
    const yearInput = document.getElementById(prefix + '_year');
    dayInput.value = '';
    monthInput.value = '';
    yearInput.value = '';
    let precision = 'day';
    if (value) {
      if (/^\d{4}$/.test(value)) {
        precision = 'year';
        yearInput.value = value;
      } else if (/^\d{4}-\d{2}$/.test(value)) {
        precision = 'month';
        monthInput.value = value;
      } else {
        precision = 'day';
        dayInput.value = value;
      }
    }
    const radio = document.querySelector('input[name="' + prefix + '_precision"][value="' + precision + '"]');
    if (radio) radio.checked = true;
    updateDatePrecisionVisibility(prefix);
  }

  const DATE_FIELD_PREFIXES = ['new_refresh_date', 'gallery_date_taken'];

  DATE_FIELD_PREFIXES.forEach(wireDatePrecisionField);

  document.querySelectorAll('.date-precision-clear').forEach((btn) => {
    btn.addEventListener('click', () => {
      setDatePrecisionValue(btn.getAttribute('data-prefix'), null);
    });
  });

  // --- Tabs ---

  let galleryLoaded = false;
  let eventLoaded = false;
  let factsLoaded = false;
  // --- Icon library ---
  //
  // Every icon already uploaded, gathered from the products and families
  // using them, so the same artwork can be reused without uploading it
  // again. Each icon appears once however many products share it.

  function iconLibrary() {
    const byUrl = new Map();
    const add = (url, label) => {
      if (!url) return;
      if (byUrl.has(url)) {
        const entry = byUrl.get(url);
        if (entry.users.length < 3 && !entry.users.includes(label)) entry.users.push(label);
        return;
      }
      byUrl.set(url, { url, users: [label] });
    };
    cachedProducts.forEach((p) => add(p.icon_url, p.name));
    Object.keys(cachedCategoryIcons).forEach((key) => {
      const family = (cachedProducts.find((p) => (p.category || '').toLowerCase() === key) || {}).category || key;
      add(cachedCategoryIcons[key], family + ' (family)');
    });
    return [...byUrl.values()].sort((a, b) => a.users[0].localeCompare(b.users[0]));
  }

  function openIconLibrary(onPick) {
    const icons = iconLibrary();
    const existing = document.querySelector('.icon-library');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'icon-library';
    overlay.innerHTML =
      '<div class="icon-library-card" role="dialog" aria-modal="true" aria-label="Choose an icon">' +
        '<div class="icon-library-head"><h2>Choose an icon</h2>' +
        '<button type="button" class="icon-library-close" aria-label="Close">\u00D7</button></div>' +
        (icons.length
          ? '<div class="icon-library-grid"></div>'
          : '<p class="admin-hint">No icons uploaded yet. Upload one and it will appear here for reuse.</p>') +
      '</div>';
    document.body.appendChild(overlay);

    const grid = overlay.querySelector('.icon-library-grid');
    if (grid) {
      icons.forEach((icon) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-library-item';
        btn.title = 'Used by ' + icon.users.join(', ');
        const img = document.createElement('img');
        img.src = icon.url;
        img.alt = '';
        const cap = document.createElement('span');
        cap.textContent = icon.users[0];
        btn.appendChild(img);
        btn.appendChild(cap);
        btn.addEventListener('click', () => { close(); onPick(icon.url); });
        grid.appendChild(btn);
      });
    }

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    overlay.querySelector('.icon-library-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
  }

  document.querySelectorAll('[data-icon-library]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const which = btn.getAttribute('data-icon-library');
      if (which === 'product') {
        openIconLibrary((url) => { currentIconUrl = url; renderProductIconPreview(); });
        return;
      }
      const family = canonicalFamily(document.getElementById('category').value);
      if (!family) { window.alert('Pick a family first.'); return; }
      openIconLibrary(async (url) => {
        const { error } = await client.from('category_icons')
          .upsert({ category: family, icon_url: url, updated_at: new Date().toISOString() });
        if (error) { window.alert('Could not set the family icon: ' + error.message); return; }
        cachedCategoryIcons[family.toLowerCase()] = url;
        updateCategoryIconPreview();
        renderFamilyPicker();
        if (typeof renderFamilyAdminList === 'function') renderFamilyAdminList();
      });
    });
  });

  // --- Publish: asks Netlify to rebuild, so admin changes go live.
  // Pages are generated from Supabase at build time, so saving here
  // alone does not update the public site.

  const publishBtn = document.getElementById('publish-btn');
  if (publishBtn) {
    publishBtn.addEventListener('click', async () => {
      const statusEl = document.getElementById('publish-status');
      const setStatus = (text, kind) => {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = 'admin-hint admin-publish-status' + (kind ? ' is-' + kind : '');
      };
      if (!window.confirm('Publish all saved changes to the live site?\n\nThe rebuild usually takes under a minute.')) return;
      publishBtn.disabled = true;
      publishBtn.textContent = 'Publishing…';
      setStatus('Asking Netlify to rebuild the site…');
      try {
        const { data } = await client.auth.getSession();
        const token = data && data.session ? data.session.access_token : null;
        if (!token) throw new Error('You are not signed in.');
        const res = await fetch('/.netlify/functions/publish', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || ('Request failed (' + res.status + ').'));
        setStatus('Rebuild started. Your changes should be live in about a minute, then refresh the page to see them.', 'ok');
      } catch (err) {
        setStatus('Could not publish: ' + err.message, 'error');
      }
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publish changes';
    });
  }

  document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      document.getElementById('tab-products').style.display = tab === 'products' ? 'block' : 'none';
      document.getElementById('tab-families').style.display = tab === 'families' ? 'block' : 'none';
      document.getElementById('tab-gallery').style.display = tab === 'gallery' ? 'block' : 'none';
      document.getElementById('tab-event').style.display = tab === 'event' ? 'block' : 'none';
      document.getElementById('tab-facts').style.display = tab === 'facts' ? 'block' : 'none';
      document.getElementById('tab-pagetext').style.display = tab === 'pagetext' ? 'block' : 'none';
      document.getElementById('tab-about').style.display = tab === 'about' ? 'block' : 'none';
      if (tab === 'families') renderFamilyAdminList();
      if (tab === 'gallery' && !galleryLoaded) {
        galleryLoaded = true;
        loadGalleryPhotos();
      }
      if (tab === 'event' && !eventLoaded) {
        eventLoaded = true;
        loadEvents();
      }
      if (tab === 'facts' && !factsLoaded) {
        factsLoaded = true;
        loadPublishedFacts();
      }
    });
  });

  const productListView = document.getElementById('product-list-view');
  const productFormView = document.getElementById('product-form-view');

  function showProductList() {
    productListView.style.display = 'block';
    productFormView.style.display = 'none';
  }

  function showProductForm() {
    productListView.style.display = 'none';
    productFormView.style.display = 'block';
    window.scrollTo(0, 0);
  }

  async function showDashboard() {
    loginSection.style.display = 'none';
    dashboard.style.display = 'block';
    await loadProducts();
    loadAbout();
    loadCategoryIcons();
    loadPageContent();
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    const editPhotoId = params.get('editPhoto');
    if (editId) {
      editProduct(editId);
    } else if (params.get('new')) {
      startNewProduct();
    } else if (editPhotoId) {
      document.querySelector('.admin-tab-btn[data-tab="gallery"]').click();
      galleryLoaded = true;
      await loadGalleryPhotos();
      editGalleryPhoto(editPhotoId);
    } else {
      showProductList();
    }
  }

  function showLogin() {
    loginSection.style.display = 'block';
    dashboard.style.display = 'none';
  }

  async function checkSession() {
    const { data } = await client.auth.getSession();
    if (data.session) showDashboard();
    else showLogin();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      loginError.textContent = 'Login failed: ' + error.message;
      return;
    }
    showDashboard();
  });

  logoutBtn.addEventListener('click', async () => {
    await client.auth.signOut();
    showLogin();
  });

  // --- Products ---
  //
  // The products tab works in three visual steps: pick a family (the
  // category), pick a product line (a product row), then add a
  // generation (a date in refresh_history, with an optional name and
  // announced date kept in generation_details, keyed by that date).

  const DEFAULT_CATEGORIES = ['iPhone', 'Mac', 'iPad', 'Apple Watch', 'AirPods', 'Vision Pro', 'Apple TV', 'AirTag', 'Apple Pencil', 'Other'];

  // Same built-in shapes as the public site, so admin tiles match it.
  const CATEGORY_ICON_SHAPES = {
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
    All: '<rect x="7" y="7" width="11" height="11" rx="2"/><rect x="22" y="7" width="11" height="11" rx="2"/><rect x="7" y="22" width="11" height="11" rx="2"/><rect x="22" y="22" width="11" height="11" rx="2"/>',
  };

  let cachedCategoryIcons = {};
  let selectedFamily = null; // null = All, on the list view

  function escapeAttr(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function iconHtml(category, iconUrl, size) {
    const s = size || 32;
    const custom = iconUrl || cachedCategoryIcons[String(category || '').toLowerCase()];
    if (custom) return '<img class="admin-icon" src="' + escapeAttr(custom) + '" alt="" width="' + s + '" height="' + s + '">';
    const key = Object.keys(CATEGORY_ICON_SHAPES).find((k) => k.toLowerCase() === String(category || '').toLowerCase());
    const shape = (key && CATEGORY_ICON_SHAPES[key]) || CATEGORY_ICON_SHAPES.Other;
    return '<svg class="admin-icon" viewBox="0 0 40 40" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + shape + '</svg>';
  }

  function ordinal(n) {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  }

  // Matches autoGenerationName in src/templates.js, so the suggestion
  // shown here is exactly what the public site shows for a blank name.
  function autoGenerationName(productName, index, total) {
    const name = productName || 'This product';
    if (total <= 1) return name;
    return name + ' (' + ordinal(index + 1) + ' generation)';
  }

  function allFamilyNames() {
    const names = new Map();
    DEFAULT_CATEGORIES.forEach((c) => names.set(c.toLowerCase(), c));
    cachedProducts.forEach((p) => { if (p.category && !names.has(p.category.trim().toLowerCase())) names.set(p.category.trim().toLowerCase(), p.category.trim()); });
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }

  function canonicalFamily(typed) {
    const t = (typed || '').trim();
    if (!t) return '';
    return allFamilyNames().find((n) => n.toLowerCase() === t.toLowerCase()) || t;
  }

  // --- Step 1: family picker (tiles). #category stays the one source
  // of truth; tiles just set it, "+ New family" reveals it for typing.

  function renderFamilyPicker() {
    const picker = document.getElementById('family-picker');
    const categoryEl = document.getElementById('category');
    const current = categoryEl.value.trim().toLowerCase();
    const newWrap = document.getElementById('new-family-wrap');
    const families = allFamilyNames();
    const isExisting = families.some((f) => f.toLowerCase() === current);
    picker.innerHTML = '';
    families.forEach((family) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'family-tile family-tile--small' + (family.toLowerCase() === current ? ' is-selected' : '');
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', family.toLowerCase() === current ? 'true' : 'false');
      btn.innerHTML = iconHtml(family, null, 28) + '<span>' + escapeAttr(family) + '</span>';
      btn.addEventListener('click', () => {
        categoryEl.value = family;
        newWrap.style.display = 'none';
        document.getElementById('family-error').textContent = '';
        onFamilyChanged();
      });
      picker.appendChild(btn);
    });
    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    const newSelected = newWrap.style.display !== 'none' || (current && !isExisting);
    newBtn.className = 'family-tile family-tile--small family-tile--new' + (newSelected ? ' is-selected' : '');
    newBtn.innerHTML = '<span class="family-tile-plus">+</span><span>New family</span>';
    newBtn.addEventListener('click', () => {
      if (isExisting) categoryEl.value = '';
      newWrap.style.display = '';
      categoryEl.focus();
      onFamilyChanged();
    });
    picker.appendChild(newBtn);
    if (current && !isExisting) newWrap.style.display = '';
  }

  function onFamilyChanged() {
    renderFamilyPicker();
    updateTimelineExamples();
    updateProductOptionsByCategory();
    updateCategoryIconPreview();
    renderProductIconPreview();
  }

  document.getElementById('category').addEventListener('input', () => {
    updateProductOptionsByCategory();
    updateCategoryIconPreview();
    renderProductIconPreview();
  });

  // --- "Replaced by" / "Previous model" dropdowns: products in the same
  // family, saved as the product's slug. A saved value that no longer
  // matches a product is kept as its own option so nothing is lost.

  function fillProductSelect(selectEl, keepValue) {
    const currentCategory = (document.getElementById('category').value || '').trim().toLowerCase();
    const value = keepValue !== undefined ? keepValue : selectEl.value;
    selectEl.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'None';
    selectEl.appendChild(none);
    const options = cachedProducts
      .filter((p) => (p.category || '').trim().toLowerCase() === currentCategory && p.id !== editingId)
      .sort((a, b) => a.name.localeCompare(b.name));
    options.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.slug;
      opt.textContent = p.name + (p.discontinued ? ' (discontinued)' : '');
      selectEl.appendChild(opt);
    });
    if (value && !options.some((p) => p.slug === value)) {
      const other = cachedProducts.find((p) => p.slug === value);
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = other ? other.name + ' (' + other.category + ')' : value;
      selectEl.appendChild(opt);
    }
    selectEl.value = value || '';
  }

  function updateProductOptionsByCategory() {
    fillProductSelect(document.getElementById('replaced_by'));
    fillProductSelect(document.getElementById('previous_model'));
    updatePreviousModelChoice();
  }

  // A new product doesn't always end the old one: both can be on sale
  // together, so discontinuing the older one is an explicit choice.
  function updatePreviousModelChoice() {
    const picked = document.getElementById('previous_model').value;
    const wrap = document.getElementById('previous-model-choice');
    const prev = cachedProducts.find((p) => p.slug === picked);
    wrap.style.display = picked && prev && !prev.discontinued ? '' : 'none';
    if (!picked) document.querySelector('input[name="previous_model_action"][value="keep"]').checked = true;
  }

  document.getElementById('previous_model').addEventListener('change', updatePreviousModelChoice);

  // --- Timeline group dropdown: "Same as family" (blank), any group
  // already in use, or "+ New group" to type one. Typed names still
  // snap to an existing group's exact casing, so a near-match can never
  // silently start a second, disconnected timeline.

  function timelineMode() {
    const checked = document.querySelector('input[name="timeline_mode"]:checked');
    return checked ? checked.value : 'family';
  }

  function setTimelineMode(mode) {
    document.querySelector('input[name="timeline_mode"][value="' + (mode === 'own' ? 'own' : 'family') + '"]').checked = true;
  }

  // The two options are spelled out with this product's and family's real
  // names, so there's nothing to work out.
  function updateTimelineExamples() {
    const name = document.getElementById('name').value.trim();
    const family = canonicalFamily(document.getElementById('category').value) || 'this family';
    const siblings = cachedProducts.filter((p) =>
      (p.category || '').trim().toLowerCase() === family.toLowerCase() && p.id !== editingId);
    const names = siblings.slice(0, 3).map((p) => p.name);
    const extra = siblings.length > 3 ? ' and ' + (siblings.length - 3) + ' more' : '';
    document.getElementById('timeline-own-example').textContent = name
      ? 'Just the dates you list below for ' + name + '.'
      : 'Just the dates you list below.';
    document.getElementById('timeline-family-example').textContent = names.length
      ? 'Its dates mixed in with ' + names.join(', ') + extra + '.'
      : 'Nothing else is in ' + family + ' yet, so this looks the same for now.';
  }

  document.querySelectorAll('input[name="timeline_mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked && sharedGroupName) {
        sharedGroupName = null;
        const note = document.getElementById('timeline-group-note');
        note.style.display = 'none';
        note.textContent = '';
      }
    });
  });



  // The two buttons decide: everything in the family (no group) or this
  // product on its own (a group of one, named after the product). A group
  // shared with another family is rare and is kept as it was found.
  function getTimelineName() {
    if (sharedGroupName) return sharedGroupName;
    return timelineMode() === 'own' ? (document.getElementById('name').value.trim() || null) : null;
  }

  let sharedGroupName = null;

  function setTimelineName(value) {
    const ownName = document.getElementById('name').value.trim().toLowerCase();
    const note = document.getElementById('timeline-group-note');
    sharedGroupName = null;
    note.style.display = 'none';
    note.textContent = '';
    if (!value) {
      setTimelineMode('family');
      return;
    }
    if (ownName && value.trim().toLowerCase() === ownName) {
      setTimelineMode('own');
      return;
    }
    // An existing shared group: shown plainly, with a way to drop it.
    sharedGroupName = value;
    setTimelineMode('family');
    note.style.display = '';
    note.textContent = 'This product shares a timeline with the group "' + value + '". ';
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'admin-linkish';
    stop.textContent = 'Stop sharing';
    stop.addEventListener('click', () => {
      sharedGroupName = null;
      note.style.display = 'none';
      setTimelineMode('own');
    });
    note.appendChild(stop);
  }

  // --- Icons: one per family (category_icons table), and optionally
  // one per product line (products.icon_url).

  async function loadCategoryIcons() {
    const { data, error } = await client.from('category_icons').select('*');
    if (error) return;
    cachedCategoryIcons = {};
    data.forEach((row) => { cachedCategoryIcons[row.category.toLowerCase()] = row.icon_url; });
    updateCategoryIconPreview();
    renderProductList();
    if (productFormView.style.display !== 'none') renderFamilyPicker();
  }

  function updateCategoryIconPreview() {
    const thumbEl = document.getElementById('category-icon-thumb');
    if (!thumbEl) return;
    const currentCategory = (document.getElementById('category').value || '').trim().toLowerCase();
    const url = cachedCategoryIcons[currentCategory];
    thumbEl.innerHTML = '';
    const bgBtn = document.getElementById('category-icon-removebg');
    if (bgBtn) bgBtn.style.display = url ? '' : 'none';
    if (!url) {
      thumbEl.textContent = currentCategory ? 'No custom icon for this family yet, the built-in shape is used.' : 'Pick a family above first.';
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'admin-thumb';
    const img = document.createElement('img');
    img.src = url;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '\u00d7';
    removeBtn.setAttribute('aria-label', 'Remove family icon');
    removeBtn.addEventListener('click', async () => {
      if (!window.confirm('Remove this icon and go back to the built-in shape for this family?')) return;
      const { error } = await client.from('category_icons').delete().ilike('category', document.getElementById('category').value.trim());
      if (error) {
        window.alert('Failed to remove: ' + error.message);
        return;
      }
      delete cachedCategoryIcons[currentCategory];
      updateCategoryIconPreview();
      renderFamilyPicker();
      renderProductIconPreview();
    });
    wrap.appendChild(img);
    wrap.appendChild(removeBtn);
    thumbEl.appendChild(wrap);
  }

  // --- Families tab: every family in one place, with its icon.

  function renderFamilyAdminList() {
    const wrap = document.getElementById('family-admin-list');
    if (!wrap) return;
    const families = allFamilyNames();
    wrap.innerHTML = '';
    if (!families.length) {
      wrap.textContent = 'No families yet. Add a product first and its family will appear here.';
      return;
    }
    families.forEach((family) => {
      const key = family.toLowerCase();
      const url = cachedCategoryIcons[key];
      const count = cachedProducts.filter((p) => (p.category || '').trim().toLowerCase() === key).length;

      const row = document.createElement('div');
      row.className = 'family-admin-row';

      const thumb = document.createElement('div');
      thumb.className = 'family-admin-thumb';
      thumb.innerHTML = url ? '' : iconHtml(family, null, 32);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = family + ' icon';
        thumb.appendChild(img);
      }

      const meta = document.createElement('div');
      meta.className = 'family-admin-meta';
      const nameEl = document.createElement('strong');
      nameEl.textContent = family;
      const countEl = document.createElement('span');
      countEl.className = 'admin-hint';
      countEl.textContent = count + (count === 1 ? ' product' : ' products') + (url ? '' : ' - using the built-in shape');
      meta.appendChild(nameEl);
      meta.appendChild(countEl);

      const actions = document.createElement('div');
      actions.className = 'family-admin-actions';

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.className = 'admin-file-input';
      fileInput.id = 'family-icon-upload-' + key.replace(/[^a-z0-9]+/g, '-');

      const uploadLabel = document.createElement('label');
      uploadLabel.className = 'admin-btn admin-btn--small admin-btn--primary';
      uploadLabel.setAttribute('for', fileInput.id);
      uploadLabel.textContent = url ? 'Replace icon' : 'Upload icon';

      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const toUpload = autoRemoveBgOn() ? await fileWithoutBackground(file) : file;
          const newUrl = await uploadFile(toUpload);
          await saveFamilyIcon(family, newUrl);
        } catch (err) {
          window.alert('Upload failed: ' + err.message);
        }
        e.target.value = '';
      });

      actions.appendChild(uploadLabel);
      actions.appendChild(fileInput);

      if (url) {
        const bgBtn = document.createElement('button');
        bgBtn.type = 'button';
        bgBtn.className = 'admin-btn admin-btn--small admin-btn--ghost';
        bgBtn.textContent = 'Remove background';
        bgBtn.addEventListener('click', async () => {
          bgBtn.disabled = true;
          const label = bgBtn.textContent;
          bgBtn.textContent = 'Removing...';
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = () => reject(new Error('could not load the current icon'));
              img.src = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
            });
            const result = stripIconBackground(img, 24);
            if (!result.changed) { window.alert(backgroundResultMessage(result.reason)); throw new Error('__handled__'); }
            const blob = await new Promise((resolve) => result.canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('could not process the image');
            const newUrl = await uploadFile(new File([blob], 'family-icon-nobg.png', { type: 'image/png' }));
            await saveFamilyIcon(family, newUrl);
          } catch (err) {
            window.alert('Could not remove the background: ' + err.message);
            bgBtn.disabled = false;
            bgBtn.textContent = label;
          }
        });
        actions.appendChild(bgBtn);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'admin-btn admin-btn--small admin-btn--ghost';
        delBtn.textContent = 'Remove icon';
        delBtn.addEventListener('click', async () => {
          if (!window.confirm('Remove this icon and go back to the built-in shape for ' + family + '?')) return;
          const { error } = await client.from('category_icons').delete().ilike('category', family);
          if (error) {
            window.alert('Failed to remove: ' + error.message);
            return;
          }
          delete cachedCategoryIcons[key];
          refreshAfterFamilyIconChange();
        });
        actions.appendChild(delBtn);
      }

      row.appendChild(thumb);
      row.appendChild(meta);
      row.appendChild(actions);
      wrap.appendChild(row);
    });
  }

  async function saveFamilyIcon(family, url) {
    const { error } = await client.from('category_icons').upsert({ category: canonicalFamily(family), icon_url: url, updated_at: new Date().toISOString() });
    if (error) {
      window.alert('Failed to save the icon: ' + error.message);
      return;
    }
    cachedCategoryIcons[family.toLowerCase()] = url;
    refreshAfterFamilyIconChange();
  }

  function refreshAfterFamilyIconChange() {
    renderFamilyAdminList();
    updateCategoryIconPreview();
    renderFamilyPicker();
    renderProductIconPreview();
    renderProductList();
  }

  // Strip the background from the family icon already in place.
  document.getElementById('category-icon-removebg').addEventListener('click', async () => {
    const btn = document.getElementById('category-icon-removebg');
    const currentCategory = canonicalFamily(document.getElementById('category').value);
    const url = cachedCategoryIcons[(currentCategory || '').toLowerCase()];
    if (!currentCategory || !url) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Removing...';
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('could not load the current icon'));
        img.src = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
      });
      const result = stripIconBackground(img, 24);
      if (!result.changed) { window.alert(backgroundResultMessage(result.reason)); throw new Error('__handled__'); }
      const blob = await new Promise((resolve) => result.canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('could not process the image');
      const newUrl = await uploadFile(new File([blob], 'family-icon-nobg.png', { type: 'image/png' }));
      const { error } = await client.from('category_icons').upsert({ category: currentCategory, icon_url: newUrl, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      cachedCategoryIcons[currentCategory.toLowerCase()] = newUrl;
      updateCategoryIconPreview();
      renderFamilyPicker();
      if (typeof renderFamilyAdminList === 'function') renderFamilyAdminList();
    } catch (err) {
      if (err.message !== '__handled__') window.alert('Could not remove the background: ' + err.message);
    }
    btn.disabled = false;
    btn.textContent = label;
  });

  document.getElementById('category-icon-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const currentCategory = canonicalFamily(document.getElementById('category').value);
    if (!currentCategory) {
      window.alert('Pick a family first.');
      e.target.value = '';
      return;
    }
    try {
      const toUpload = autoRemoveBgOn() ? await fileWithoutBackground(file) : file;
      const url = await uploadFile(toUpload);
      const { error } = await client.from('category_icons').upsert({ category: currentCategory, icon_url: url, updated_at: new Date().toISOString() });
      if (error) {
        window.alert('Failed to save the icon: ' + error.message);
        return;
      }
      cachedCategoryIcons[currentCategory.toLowerCase()] = url;
      updateCategoryIconPreview();
      renderFamilyPicker();
      renderProductIconPreview();
    } catch (err) {
      window.alert('Upload failed: ' + err.message);
    }
    e.target.value = '';
  });

  function renderProductIconPreview() {
    const thumbEl = document.getElementById('product-icon-thumb');
    if (!thumbEl) return;
    thumbEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'admin-thumb admin-thumb--icon' + (currentIconUrl ? '' : ' admin-thumb--fallback');
    wrap.innerHTML = iconHtml(document.getElementById('category').value, currentIconUrl, 40);
    if (currentIconUrl) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '\u00d7';
      removeBtn.setAttribute('aria-label', 'Remove product icon');
      removeBtn.addEventListener('click', () => {
        currentIconUrl = null;
        renderProductIconPreview();
      });
      wrap.appendChild(removeBtn);
    }
    thumbEl.appendChild(wrap);
    const bgBtn = document.getElementById('product-icon-removebg');
    if (bgBtn) bgBtn.style.display = currentIconUrl ? '' : 'none';
  }

  // Remembered between visits, so the choice sticks until changed.
  const AUTO_BG_KEY = 'apple-sunset-auto-removebg';
  function autoRemoveBgOn() {
    const box = document.getElementById('icon-auto-removebg');
    return !!(box && box.checked);
  }
  (function initAutoBg() {
    const box = document.getElementById('icon-auto-removebg');
    if (!box) return;
    try { box.checked = window.localStorage.getItem(AUTO_BG_KEY) === '1'; } catch (e) { /* storage blocked */ }
    box.addEventListener('change', () => {
      try { window.localStorage.setItem(AUTO_BG_KEY, box.checked ? '1' : '0'); } catch (e) { /* storage blocked */ }
    });
  })();

  // Runs the uploaded file through the same background removal used by
  // the button, before it is stored.
  async function fileWithoutBackground(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('could not read the file'));
      r.readAsDataURL(file);
    });
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('could not open the image'));
      img.src = dataUrl;
    });
    const result = stripIconBackground(img, 24);
    // Nothing to strip: upload the original untouched rather than fail.
    if (!result.changed) return file;
    const blob = await new Promise((resolve) => result.canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('could not process the image');
    return new File([blob], (file.name || 'icon').replace(/\.[^.]+$/, '') + '-nobg.png', { type: 'image/png' });
  }

  document.getElementById('product-icon-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const toUpload = autoRemoveBgOn() ? await fileWithoutBackground(file) : file;
      currentIconUrl = await uploadFile(toUpload);
      renderProductIconPreview();
    } catch (err) {
      window.alert('Upload failed: ' + err.message);
    }
    e.target.value = '';
  });

  // Makes a flat backdrop transparent by sampling the four corners and
  // clearing every pixel close to that colour. Works well for the pale
  // grey/white boxes product icons often arrive with; it is deliberately
  // conservative so it won't eat the icon itself.
  // Makes a flat backdrop transparent by sampling the four corners and
  // clearing pixels close to that colour. Three safeguards, learned the
  // hard way: an already-transparent corner is not a colour to match (or
  // dark line art on a transparent background gets erased entirely);
  // pixels that are already transparent are left alone; and if the result
  // would wipe out most of the image, nothing is changed at all.
  // Explains why an icon was left alone, rather than silently doing nothing.
  function backgroundResultMessage(reason) {
    if (reason === 'transparent') return 'This icon already has a transparent background, so there was nothing to remove.';
    if (reason === 'all') return 'The background could not be told apart from the icon itself, so it has been left unchanged. This usually means the icon is already transparent, or the artwork reaches the edges.';
    if (reason === 'none') return 'No background colour was found around the edges, so the icon has been left unchanged.';
    return '';
  }

  function stripIconBackground(img, tolerance) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    const w = canvas.width, h = canvas.height;

    const cornerAt = (x, y) => {
      const i = (y * w + x) * 4;
      return { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] };
    };
    // Only corners that are actually opaque describe a background.
    const corners = [cornerAt(0, 0), cornerAt(w - 1, 0), cornerAt(0, h - 1), cornerAt(w - 1, h - 1)]
      .filter((c) => c.a > 200);
    if (!corners.length) return { canvas, changed: false, reason: 'transparent' };

    const bg = ['r', 'g', 'b'].map((k) => Math.round(corners.reduce((sum, c) => sum + c[k], 0) / corners.length));

    let opaque = 0;
    let wouldClear = 0;
    const hits = [];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      opaque++;
      if (Math.abs(d[i] - bg[0]) <= tolerance &&
          Math.abs(d[i + 1] - bg[1]) <= tolerance &&
          Math.abs(d[i + 2] - bg[2]) <= tolerance) {
        wouldClear++;
        hits.push(i);
      }
    }
    // Nothing recognisable left means the sample was the artwork, not a
    // backdrop, so leave the image exactly as it was.
    if (opaque && wouldClear / opaque > 0.9) return { canvas, changed: false, reason: 'all' };

    hits.forEach((i) => { d[i + 3] = 0; });
    ctx.putImageData(imageData, 0, 0);
    return { canvas, changed: wouldClear > 0, reason: wouldClear ? 'ok' : 'none' };
  }


  document.getElementById('product-icon-removebg').addEventListener('click', async () => {
    if (!currentIconUrl) return;
    const btn = document.getElementById('product-icon-removebg');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Removing...';
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('could not load the current icon'));
        img.src = currentIconUrl + (currentIconUrl.includes('?') ? '&' : '?') + 'cb=' + Date.now();
      });
      const result = stripIconBackground(img, 24);
      if (!result.changed) { window.alert(backgroundResultMessage(result.reason)); throw new Error('__handled__'); }
      const blob = await new Promise((resolve) => result.canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('could not process the image');
      currentIconUrl = await uploadFile(new File([blob], 'icon-nobg.png', { type: 'image/png' }));
      renderProductIconPreview();
    } catch (err) {
      if (err.message !== '__handled__') window.alert('Could not remove the background: ' + err.message);
    }
    btn.disabled = false;
    btn.textContent = originalLabel;
  });

  function updateCategoryOptions() {
    updateProductOptionsByCategory();
    updateCategoryIconPreview();
  }

  async function loadProducts() {
    const { data, error } = await client.from('products').select('*').order('name');
    if (error) {
      productListEl.innerHTML = '';
      productListEl.textContent = 'Could not load products: ' + error.message;
      return;
    }
    cachedProducts = data;
    updateCategoryOptions();
    renderProductList();
  }

  // --- List view: family tiles, then product line cards.

  function productLastDate(p) {
    const h = (p.refresh_history || []).slice().sort();
    return h.length ? h[h.length - 1] : null;
  }

  function daysSinceText(dateStr) {
    if (!dateStr) return '';
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    return days >= 0 ? days + ' days since last generation' : 'Coming ' + formatAdminDate(dateStr);
  }

  function renderFamilyTiles() {
    const tilesEl = document.getElementById('family-tiles');
    if (!tilesEl) return;
    const counts = {};
    cachedProducts.forEach((p) => {
      const key = (p.category || 'Other').trim();
      const canonical = Object.keys(counts).find((k) => k.toLowerCase() === key.toLowerCase()) || key;
      counts[canonical] = (counts[canonical] || 0) + 1;
    });
    const families = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    if (selectedFamily && !families.some((f) => f.toLowerCase() === selectedFamily.toLowerCase())) selectedFamily = null;
    tilesEl.innerHTML = '';
    const makeTile = (label, count, familyValue) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const active = (familyValue === null && selectedFamily === null) || (familyValue && selectedFamily && familyValue.toLowerCase() === selectedFamily.toLowerCase());
      btn.className = 'family-tile' + (active ? ' is-selected' : '');
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.innerHTML = iconHtml(familyValue === null ? 'All' : familyValue, null, 32) + '<span class="family-tile-name">' + escapeAttr(label) + '</span><span class="family-tile-count">' + count + '</span>';
      btn.addEventListener('click', () => {
        selectedFamily = familyValue;
        if (productSearchInputEl) productSearchInputEl.value = '';
        renderProductList();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      tilesEl.appendChild(btn);
    };
    families.forEach((f) => makeTile(f, counts[f], f));
    const newFamily = document.createElement('button');
    newFamily.type = 'button';
    newFamily.className = 'family-tile family-tile--new';
    newFamily.innerHTML = '<span class="family-tile-plus">+</span><span class="family-tile-name">New family</span>';
    newFamily.title = 'Start a product in a family that does not exist yet';
    newFamily.addEventListener('click', () => startNewProduct({ newFamily: true }));
    tilesEl.appendChild(newFamily);
  }

  function showFamilyScreen() {
    document.getElementById('family-screen').style.display = '';
    document.getElementById('products-screen').style.display = 'none';
    document.getElementById('search-screen').style.display = 'none';
  }

  function productCard(p, showFamilyName) {
    const card = document.createElement('div');
    card.className = 'line-card' + (p.discontinued ? ' line-card--discontinued' : '') + (p.featured ? ' line-card--featured' : '');
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'line-card-main';
    const dates = (p.refresh_history || []).length;
    const last = productLastDate(p);
    const meta = p.discontinued
      ? 'Discontinued' + (p.discontinued_date ? ' ' + formatAdminDate(p.discontinued_date) : ', date missing')
      : daysSinceText(last) || 'No dates yet';
    main.innerHTML =
      '<span class="line-card-icon">' + iconHtml(p.category, p.icon_url, 36) + '</span>' +
      '<span class="line-card-text">' +
        '<span class="line-card-name">' + escapeAttr(p.name) + (p.featured ? ' <span class="line-card-star" title="Featured on homepage">\u2605</span>' : '') + '</span>' +
        (showFamilyName ? '<span class="line-card-meta">' + escapeAttr(p.category || 'Other') + '</span>' : '') +
        '<span class="line-card-meta">' + dates + ' date' + (dates === 1 ? '' : 's') + '</span>' +
        '<span class="line-card-status' + (p.discontinued ? ' line-card-status--discontinued' : (!last ? ' line-card-status--empty' : '')) + '">' + escapeAttr(meta) + '</span>' +
      '</span>';
    main.addEventListener('click', () => editProduct(p.id));

    const actions = document.createElement('div');
    actions.className = 'line-card-actions';
    const addDateBtn = document.createElement('button');
    addDateBtn.type = 'button';
    addDateBtn.className = 'admin-btn admin-btn--small admin-btn--primary';
    addDateBtn.textContent = '+ Date';
    addDateBtn.addEventListener('click', () => editProduct(p.id, { focusGeneration: true }));
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'admin-btn admin-btn--small admin-btn--ghost';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => editProduct(p.id));
    actions.appendChild(addDateBtn);
    actions.appendChild(editBtn);
    if (!p.featured && !p.discontinued) {
      const featureBtn = document.createElement('button');
      featureBtn.type = 'button';
      featureBtn.className = 'admin-btn admin-btn--small admin-btn--ghost';
      featureBtn.textContent = '\u2606 Feature';
      featureBtn.title = 'Make this the featured product on the homepage';
      featureBtn.addEventListener('click', () => makeFeatured(p));
      actions.appendChild(featureBtn);
    }
    card.appendChild(main);
    card.appendChild(actions);
    return card;
  }

  function renderProductList() {
    renderFamilyTiles();
    const query = productSearchInputEl ? productSearchInputEl.value.trim().toLowerCase() : '';

    // Searching jumps straight to matching products, from either screen.
    if (query) {
      document.getElementById('family-screen').style.display = 'none';
      document.getElementById('products-screen').style.display = 'none';
      const searchScreen = document.getElementById('search-screen');
      const results = document.getElementById('search-results');
      searchScreen.style.display = '';
      results.innerHTML = '';
      // "Watch 12" should find "Apple Watch Series 12": each word has to
      // appear somewhere in the name or family, in any order, rather than
      // the whole phrase appearing as typed.
      const words = query.split(/\s+/).filter(Boolean);
      const matches = cachedProducts
        .filter((p) => {
          const haystack = ((p.name || '') + ' ' + (p.category || '')).toLowerCase();
          return words.every((word) => haystack.includes(word));
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!matches.length) {
        results.textContent = 'No products match your search.';
        return;
      }
      matches.forEach((p) => results.appendChild(productCard(p, true)));
      return;
    }
    document.getElementById('search-screen').style.display = 'none';

    if (!selectedFamily) {
      showFamilyScreen();
      return;
    }

    // A family is open, so show its products on their own screen.
    document.getElementById('family-screen').style.display = 'none';
    document.getElementById('products-screen').style.display = '';
    const familyLabel = document.getElementById('products-screen-family');
    familyLabel.innerHTML = iconHtml(selectedFamily, null, 22) + '<span>' + escapeAttr(selectedFamily) + '</span>';
    productListEl.innerHTML = '';
    const inFamily = cachedProducts
      .filter((p) => (p.category || '').trim().toLowerCase() === selectedFamily.toLowerCase())
      .sort((a, b) => {
        if (!!a.discontinued !== !!b.discontinued) return a.discontinued ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
    inFamily.forEach((p) => productListEl.appendChild(productCard(p, false)));

    const newCard = document.createElement('button');
    newCard.type = 'button';
    newCard.className = 'line-card line-card--new';
    newCard.innerHTML = '<span class="family-tile-plus">+</span><span>Add a product to ' + escapeAttr(selectedFamily) + '</span>';
    newCard.addEventListener('click', () => startNewProduct({ category: selectedFamily }));
    productListEl.appendChild(newCard);
  }

  const productSearchInputEl = document.getElementById('product-search-input');
  if (productSearchInputEl) productSearchInputEl.addEventListener('input', renderProductList);

  // --- Step 3: generations.

  function generationSuggestion() {
    const name = document.getElementById('name').value.trim();
    return autoGenerationName(name, currentRefreshHistory.length, currentRefreshHistory.length + 1);
  }

  function updateGenerationSuggestion() {
    const input = document.getElementById('new_generation_name');
    if (input) input.placeholder = generationSuggestion();
  }

  function detailFor(date) {
    if (!currentGenerationDetails[date]) currentGenerationDetails[date] = {};
    return currentGenerationDetails[date];
  }

  // One list of dated events: Launch, Release and Discontinued. Each row
  // is a single line; the name and announced date only appear on Edit.
  const expandedGenerations = new Set();

  function entryTypeFor(date) {
    if (currentDiscontinuedDate === date) return 'discontinued';
    if (currentOriginalLaunchDate === date) return 'launch';
    return 'release';
  }

  const ENTRY_LABELS = { launch: 'Launch', release: 'Release', discontinued: 'Discontinued' };

  function allEntryDates() {
    const dates = currentRefreshHistory.slice();
    if (currentDiscontinuedDate && dates.indexOf(currentDiscontinuedDate) === -1) dates.push(currentDiscontinuedDate);
    return dates.sort();
  }

  // The countdown option only makes sense while a release date is still
  // in the future, so it stays hidden otherwise.
  function updateCountdownOption() {
    const wrap = document.getElementById('in-countdown-wrap');
    if (!wrap) return;
    const today = new Date().toISOString().slice(0, 10);
    const hasFuture = currentRefreshHistory.some((d) => d > today);
    wrap.style.display = hasFuture ? '' : 'none';
    if (!hasFuture) {
      const box = document.getElementById('in_countdown');
      if (box) box.checked = false;
    }
  }

  function renderRefreshHistory() {
    refreshHistoryListEl.innerHTML = '';
    updateCountdownOption();
    const productName = document.getElementById('name').value.trim();
    const releaseDates = currentRefreshHistory.slice().sort();
    const dates = allEntryDates();
    // An announcement waiting for its release date to be added.
    if (pendingAnnouncedDate) {
      const pend = document.createElement('li');
      pend.className = 'generation-row generation-row--pending';
      const label = document.createElement('span');
      label.innerHTML = '<strong>Announced ' + formatAdminDate(pendingAnnouncedDate) + '</strong> ';
      const hint = document.createElement('span');
      hint.className = 'admin-hint';
      hint.textContent = 'Waiting for a release date. It will attach to the first one you add.';
      const drop = document.createElement('button');
      drop.type = 'button';
      drop.className = 'link-btn';
      drop.textContent = 'Remove';
      drop.addEventListener('click', () => { pendingAnnouncedDate = null; renderRefreshHistory(); });
      pend.appendChild(label);
      pend.appendChild(hint);
      pend.appendChild(drop);
      refreshHistoryListEl.appendChild(pend);
    }
    if (!dates.length && !pendingAnnouncedDate) {
      const empty = document.createElement('li');
      empty.className = 'generation-empty';
      empty.textContent = 'No dates yet. Add the launch date below.';
      refreshHistoryListEl.appendChild(empty);
    }
    dates.slice().reverse().forEach((date) => {
      const type = entryTypeFor(date);
      const index = releaseDates.indexOf(date);
      const info = currentGenerationDetails[date] || {};
      const autoName = index === -1 ? '' : autoGenerationName(productName, index, releaseDates.length);
      const li = document.createElement('li');
      li.className = 'generation-item generation-item--' + type;

      const top = document.createElement('div');
      top.className = 'generation-item-top';

      const tag = document.createElement('span');
      tag.className = 'entry-tag entry-tag--' + type;
      tag.textContent = ENTRY_LABELS[type];
      top.appendChild(tag);
      if (type === 'release' && releaseDates.length > 1 && index === 0) {
        const firstTag = document.createElement('span');
        firstTag.className = 'generation-tag';
        firstTag.textContent = 'First release';
        top.appendChild(firstTag);
      }

      const released = document.createElement('span');
      released.className = 'generation-date';
      released.textContent = formatAdminDate(date);
      top.appendChild(released);

      if (type !== 'discontinued') {
        const nameText = document.createElement('span');
        nameText.className = 'generation-name-text' + ((info.name || '').trim() ? '' : ' generation-name-text--auto');
        nameText.textContent = (info.name || '').trim() || autoName;
        top.appendChild(nameText);
      }

      const isOpen = expandedGenerations.has(date);
      const actions = document.createElement('span');
      actions.className = 'generation-item-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'generation-edit';
      editBtn.textContent = isOpen ? 'Done' : 'Edit';
      editBtn.addEventListener('click', () => {
        if (isOpen) expandedGenerations.delete(date);
        else expandedGenerations.add(date);
        renderRefreshHistory();
      });
      actions.appendChild(editBtn);
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'generation-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        if (!window.confirm('Remove the ' + ENTRY_LABELS[type].toLowerCase() + ' date ' + formatAdminDate(date) + '?')) return;
        if (type === 'discontinued') {
          currentDiscontinuedDate = null;
        } else {
          currentRefreshHistory = currentRefreshHistory.filter((d) => d !== date);
          delete currentGenerationDetails[date];
          expandedGenerations.delete(date);
          currentOriginalLaunchDate = currentRefreshHistory.slice().sort()[0] || null;
        }
        renderRefreshHistory();
        updateStatusReadout();
      });
      // One click to say whether this date is the start of the line, so it
      // does not have to be found inside Edit.
      if (type === 'launch' || type === 'release') {
        const launchToggle = document.createElement('button');
        launchToggle.type = 'button';
        launchToggle.className = 'generation-edit';
        launchToggle.textContent = currentOriginalLaunchDate === date ? 'Not the first release' : 'Mark as first release';
        launchToggle.title = currentOriginalLaunchDate === date
          ? 'Treat this as an ordinary release, for when earlier models exist that are not listed yet'
          : 'Mark this as the first ever release of this line';
        launchToggle.addEventListener('click', () => {
          currentOriginalLaunchDate = currentOriginalLaunchDate === date ? null : date;
          renderRefreshHistory();
          updateStatusReadout();
        });
        actions.insertBefore(launchToggle, actions.firstChild);
      }
      actions.appendChild(removeBtn);
      top.appendChild(actions);
      li.appendChild(top);

      // Announcement and pre-order sit under their release, each with a
      // pill so the list reads the same way at a glance.
      if (type !== 'discontinued') {
        [
          { field: 'announced', label: 'Announced' },
          { field: 'preorder', label: 'Pre-order' },
        ].forEach(({ field, label }) => {
          if (!info[field]) return;
          const row = document.createElement('p');
          row.className = 'generation-announced';
          const pill = document.createElement('span');
          pill.className = 'entry-pill entry-pill--' + field;
          pill.textContent = label;
          row.appendChild(pill);
          const when = document.createElement('span');
          when.textContent = ' ' + formatAdminDate(info[field]) + ' ';
          row.appendChild(when);
          const clear = document.createElement('button');
          clear.type = 'button';
          clear.className = 'generation-edit';
          clear.textContent = 'Remove';
          clear.addEventListener('click', () => {
            detailFor(date)[field] = null;
            renderRefreshHistory();
          });
          row.appendChild(clear);
          li.appendChild(row);
        });
      }

      if (isOpen) {
        const fields = document.createElement('div');
        fields.className = 'generation-item-fields';

        // Editing the date moves the entry, carrying its name and
        // announced date with it. Nothing has to be removed and retyped.
        const dateLabel = document.createElement('label');
        dateLabel.textContent = type === 'discontinued' ? 'Discontinued date' : 'Release date';
        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.value = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
        dateInput.addEventListener('change', () => {
          const next = dateInput.value;
          if (!next || next === date) return;
          if (type === 'discontinued') {
            currentDiscontinuedDate = next;
          } else {
            if (currentRefreshHistory.indexOf(next) !== -1) {
              window.alert('There is already a date on ' + formatAdminDate(next) + '.');
              renderRefreshHistory();
              return;
            }
            currentRefreshHistory = currentRefreshHistory.map((d) => (d === date ? next : d)).sort();
            if (currentGenerationDetails[date]) {
              currentGenerationDetails[next] = currentGenerationDetails[date];
              delete currentGenerationDetails[date];
            }
            if (currentOriginalLaunchDate === date) currentOriginalLaunchDate = next;
          }
          expandedGenerations.delete(date);
          expandedGenerations.add(next);
          renderRefreshHistory();
          updateStatusReadout();
        });
        dateLabel.appendChild(dateInput);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const note = document.createElement('span');
          note.className = 'admin-hint';
          note.textContent = 'Stored as ' + formatAdminDate(date) + '. Picking a full date here replaces it.';
          dateLabel.appendChild(note);
        }
        fields.appendChild(dateLabel);

        if (type !== 'discontinued') {
          const nameLabel = document.createElement('label');
          nameLabel.textContent = 'Name';
          const nameInput = document.createElement('input');
          nameInput.type = 'text';
          nameInput.value = info.name || '';
          nameInput.placeholder = autoName;
          nameInput.addEventListener('input', () => { detailFor(date).name = nameInput.value; });
          nameLabel.appendChild(nameInput);
          fields.appendChild(nameLabel);

          const annLabel = document.createElement('label');
          annLabel.textContent = 'Announced';
          const annInput = document.createElement('input');
          annInput.type = 'date';
          annInput.value = /^\d{4}-\d{2}-\d{2}$/.test(info.announced || '') ? info.announced : '';
          annInput.addEventListener('change', () => { detailFor(date).announced = annInput.value || null; });
          annLabel.appendChild(annInput);
          if (info.announced && !/^\d{4}-\d{2}-\d{2}$/.test(info.announced)) {
            const note = document.createElement('span');
            note.className = 'admin-hint';
            note.textContent = 'Currently ' + formatAdminDate(info.announced) + '.';
            annLabel.appendChild(note);
          }
          fields.appendChild(annLabel);

          const makeLaunch = document.createElement('label');
          makeLaunch.className = 'checkbox-label';
          const launchBox = document.createElement('input');
          launchBox.type = 'checkbox';
          launchBox.checked = currentOriginalLaunchDate === date;
          launchBox.addEventListener('change', () => {
            currentOriginalLaunchDate = launchBox.checked ? date : null;
            renderRefreshHistory();
          });
          makeLaunch.appendChild(launchBox);
          makeLaunch.appendChild(document.createTextNode(' This was the first ever launch of this product'));
          fields.appendChild(makeLaunch);
        }
        li.appendChild(fields);
      }
      refreshHistoryListEl.appendChild(li);
    });
    updateGenerationSuggestion();
    document.getElementById('days-basis-wrap').style.display = releaseDates.length > 1 ? '' : 'none';
    // Nothing to launch twice, and nothing to discontinue twice.
    setEntryTypeAvailability(releaseDates.length, !!currentDiscontinuedDate);
  }

  // A product can only be discontinued once, so that option greys out
  // once a discontinued date exists. Release is always available.
  // A product launches once and is discontinued once, so those two grey
  // out when they are already recorded. Announced needs a release to
  // attach to, so it greys out until there is one.
  function setEntryTypeAvailability(releaseCount, hasDiscontinued) {
    const release = document.querySelector('input[name="entry_type"][value="release"]');
    const launch = document.querySelector('input[name="entry_type"][value="launch"]');
    const announced = document.querySelector('input[name="entry_type"][value="announced"]');
    const discontinued = document.querySelector('input[name="entry_type"][value="discontinued"]');
    const setState = (input, off, why) => {
      input.disabled = off;
      const label = input.closest('label');
      label.classList.toggle('segmented-option--off', off);
      label.title = off ? why : '';
      if (off && input.checked) release.checked = true;
    };
    setState(launch, !!currentOriginalLaunchDate, 'This product already has a launch date');
    setState(announced, false, '');
    setState(discontinued, hasDiscontinued, 'This product already has a discontinued date');
    if (!currentOriginalLaunchDate && releaseCount === 0) launch.checked = true;
    updateAddPanelForType();
  }

  // The add panel only shows the fields the chosen type needs.
  function updateAddPanelForType() {
    const type = selectedEntryType();
    document.getElementById('generation-name-field').style.display = type === 'launch' || type === 'release' ? '' : 'none';
    const targetField = document.getElementById('announced-target-field');
    const isAttached = type === 'announced' || type === 'preorder';
    targetField.style.display = isAttached ? '' : 'none';
    const targetLabel = document.getElementById('announced-target-label');
    if (targetLabel) targetLabel.textContent = type === 'preorder'
      ? 'Which release do these pre-orders belong to?'
      : 'Which release was this the announcement for?';
    if (!isAttached) return;
    const select = document.getElementById('announced_target');
    const noReleasesYet = currentRefreshHistory.length === 0;
    targetField.style.display = noReleasesYet ? 'none' : '';
    const note = document.getElementById('announced-pending-note');
    if (note) {
      note.style.display = noReleasesYet ? '' : 'none';
      note.textContent = 'No release date yet, so this will be held and attached to the first release you add.';
    }
    if (noReleasesYet) return;
    const keep = select.value;
    select.innerHTML = '';
    currentRefreshHistory.slice().sort().reverse().forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d;
      const info = currentGenerationDetails[d] || {};
      opt.textContent = formatAdminDate(d) + ((info.name || '').trim() ? ' \u2013 ' + info.name.trim() : '') + (info.announced ? ' (already has one)' : '');
      select.appendChild(opt);
    });
    if (keep && Array.from(select.options).some((o) => o.value === keep)) select.value = keep;
  }

  document.querySelectorAll('input[name="entry_type"]').forEach((radio) => {
    radio.addEventListener('change', updateAddPanelForType);
  });

  function selectedEntryType() {
    const checked = document.querySelector('input[name="entry_type"]:checked');
    return checked ? checked.value : 'release';
  }

  // Status is simply read off the dates, so there is no separate switch
  // to keep in step with them.
  function updateStatusReadout() {
    const readout = document.getElementById('status-readout');
    const isDiscontinued = !!currentDiscontinuedDate;
    document.getElementById('discontinued').checked = isDiscontinued;
    document.getElementById('discontinued-fields').style.display = isDiscontinued ? '' : 'none';
    readout.className = 'admin-status-readout admin-status-readout--' + (isDiscontinued ? 'discontinued' : 'current');
    readout.textContent = isDiscontinued
      ? 'Discontinued ' + formatAdminDate(currentDiscontinuedDate) + '. Add or remove that date in step 3 to change this.'
      : 'Current. Add a Discontinued date in step 3 if it has been retired.';
  }

  const richTextEditor = document.getElementById('rumor_note_editor');
  if (document.queryCommandSupported && document.queryCommandSupported('defaultParagraphSeparator')) {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  }

  // :not([data-editor]) matters: buttons that name their own editor are
  // handled further down. Without it they were caught here too and this
  // handler focused the Notes editor, losing the other field's selection.
  document.querySelectorAll('.richtext-toolbar [data-cmd]:not([data-editor])').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      richTextEditor.focus();
      document.execCommand(btn.getAttribute('data-cmd'));
    });
  });

  document.getElementById('richtext-link-btn').addEventListener('click', () => {
    const url = window.prompt('Link URL (include https://)');
    if (!url) return;
    richTextEditor.focus();
    document.execCommand('createLink', false, url);
  });

  function extractParagraphs(root) {
    const paragraphs = [];
    let current = '';
    const flush = () => {
      const trimmed = current.trim();
      if (trimmed) paragraphs.push(trimmed);
      current = '';
    };
    root.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        current += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'P' || node.tagName === 'DIV') {
          flush();
          const text = (node.textContent || '').trim();
          if (text) paragraphs.push(text);
        } else if (node.tagName === 'BR') {
          flush();
        } else {
          current += node.textContent || '';
        }
      }
    });
    flush();
    return paragraphs;
  }

  document.getElementById('richtext-clear-all-btn').addEventListener('click', () => {
    if (!richTextEditor.textContent.trim()) return;
    if (!window.confirm('Remove all formatting from the notes? This keeps the text but clears bold, italic, and links.')) return;
    const escapeText = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const paragraphs = extractParagraphs(richTextEditor);
    richTextEditor.innerHTML = paragraphs.map((para) => '<p>' + escapeText(para) + '</p>').join('');
  });

  document.getElementById('did-you-know-clear-all-btn').addEventListener('click', () => {
    const editor = document.getElementById('did_you_know_editor');
    if (!editor.textContent.trim()) return;
    if (!window.confirm('Remove all formatting from this fact? This keeps the text but clears bold, italic, and links.')) return;
    const escapeText = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    editor.innerHTML = extractParagraphs(editor).map((para) => '<p>' + escapeText(para) + '</p>').join('');
    updateDidYouKnowCount();
  });

  function resetGenerationPanel() {
    setDatePrecisionValue('new_refresh_date', null);
    document.getElementById('new_generation_name').value = '';
    document.getElementById('generation-add-error').textContent = '';
  }

  function addGenerationFromPanel() {
    const errorEl = document.getElementById('generation-add-error');
    errorEl.textContent = '';
    const value = getDatePrecisionValue('new_refresh_date');
    if (!value) {
      errorEl.textContent = 'Pick a date first.';
      return;
    }
    const type = selectedEntryType();
    if (type === 'discontinued') {
      currentDiscontinuedDate = value;
      resetGenerationPanel();
      renderRefreshHistory();
      updateStatusReadout();
      return;
    }
    if (type === 'announced' || type === 'preorder') {
      const field = type === 'preorder' ? 'preorder' : 'announced';
      if (currentRefreshHistory.length === 0) {
        if (field === 'preorder') pendingPreorderDate = value; else pendingAnnouncedDate = value;
        resetGenerationPanel();
        renderRefreshHistory();
        return;
      }
      const target = document.getElementById('announced_target').value;
      if (!target) {
        errorEl.textContent = 'Pick which release this belongs to.';
        return;
      }
      detailFor(target)[field] = value;
      resetGenerationPanel();
      renderRefreshHistory();
      return;
    }
    if (currentRefreshHistory.indexOf(value) !== -1) {
      errorEl.textContent = 'There is already a date on ' + formatAdminDate(value) + '.';
      return;
    }
    const name = document.getElementById('new_generation_name').value.trim();
    currentRefreshHistory.push(value);
    currentRefreshHistory.sort();
    if (name) {
      detailFor(value).name = name;
    }
    // Launch is explicit now. A product's very first date is still
    // treated as its launch, since there is nothing earlier it could be.
    // Only a date added as a Launch becomes the first release. Adding a
    // Release stays a release, so a product whose earlier models are not
    // logged yet is not wrongly presented as the start of the line.
    if (type === 'launch') {
      currentOriginalLaunchDate = value;
    }
    if (pendingAnnouncedDate) {
      detailFor(value).announced = pendingAnnouncedDate;
      pendingAnnouncedDate = null;
    pendingPreorderDate = null;
    }
    if (pendingPreorderDate) {
      detailFor(value).preorder = pendingPreorderDate;
      pendingPreorderDate = null;
    }
    resetGenerationPanel();
    renderRefreshHistory();
    updateStatusReadout();
  }

  document.getElementById('add-as-refresh-btn').addEventListener('click', addGenerationFromPanel);

  // Suggested names and the timeline wording follow the name as it's typed.
  document.getElementById('name').addEventListener('input', () => {
    document.getElementById('name-error').textContent = '';
    renderRefreshHistory();
    updateTimelineExamples();
  });

  function renderVideoStatus() {
    videoStatusEl.innerHTML = '';
    if (!currentVideoUrl) {
      videoStatusEl.textContent = 'No video uploaded.';
      return;
    }
    const span = document.createElement('span');
    span.textContent = 'Video attached. ';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      currentVideoUrl = null;
      renderVideoStatus();
    });
    videoStatusEl.appendChild(span);
    videoStatusEl.appendChild(removeBtn);
  }

  function clearFormErrors() {
    ['family-error', 'name-error', 'discontinued-error', 'generation-add-error'].forEach((id) => {
      document.getElementById(id).textContent = '';
    });
  }

  function editProduct(id, options) {
    const p = cachedProducts.find((x) => x.id === id);
    if (!p) return;
    editingId = id;
    editingSlug = p.slug;
    pendingAnnouncedDate = null;
    pendingPreorderDate = null;
    clearFormErrors();
    const advancedSection = document.querySelector('.admin-advanced');
    if (advancedSection) advancedSection.open = false;
    if (window.history && window.history.pushState) {
      window.history.pushState({}, '', '/admin/?edit=' + id);
    }
    document.getElementById('form-title').textContent = 'Edit ' + (p.name || 'product');
    document.getElementById('name').value = p.name || '';
    document.getElementById('category').value = canonicalFamily(p.category || '');
    document.getElementById('new-family-wrap').style.display = 'none';
    (function () {
      const raw = (p.price || '').trim();
      const symbolMatch = raw.match(/^[£$€]/);
      const symbol = symbolMatch ? symbolMatch[0] : '£';
      const radio = document.querySelector('input[name="price_currency"][value="' + symbol + '"]') || document.querySelector('input[name="price_currency"][value="£"]');
      radio.checked = true;
      document.getElementById('price').value = symbolMatch ? raw.slice(1) : raw;
    })();
    document.getElementById('external_link').value = p.external_link || '';
    document.getElementById('apple_url').value = p.apple_url || '';
    document.getElementById('specs_url').value = p.specs_url || '';
    document.getElementById('press_release_url').value = p.press_release_url || '';
    document.getElementById('apple_url_unavailable').checked = !!p.apple_url_unavailable;
    document.getElementById('rumor_note_editor').innerHTML = p.rumor_note || '';
    document.getElementById('featured').checked = !!p.featured;
    document.getElementById('in_countdown').checked = !!p.in_countdown;
    document.getElementById('did_you_know_editor').innerHTML = p.did_you_know || '';
    updateDidYouKnowCount();
    document.getElementById(p.days_basis === 'launch' ? 'days_basis_launch' : 'days_basis_refresh').checked = true;
    document.getElementById('is_new_launch').checked = !!p.is_new_launch;
    currentRefreshHistory = (p.refresh_history || []).slice().sort();
    const details = p.generation_details && typeof p.generation_details === 'object' && !Array.isArray(p.generation_details) ? p.generation_details : {};
    currentGenerationDetails = JSON.parse(JSON.stringify(details));
    currentOriginalLaunchDate = p.original_launch_date || null;
    currentIconUrl = p.icon_url || null;
    currentVideoUrl = p.video_url || null;
    onFamilyChanged();
    setTimelineName(p.timeline_name || null);
    fillProductSelect(document.getElementById('replaced_by'), p.replaced_by || '');
    fillProductSelect(document.getElementById('previous_model'), p.previous_model || '');
    document.querySelector('input[name="previous_model_action"][value="keep"]').checked = true;
    updatePreviousModelChoice();
    document.getElementById('discontinued_reason').value = p.discontinued_reason || '';
    currentDiscontinuedDate = p.discontinued ? (p.discontinued_date || null) : null;
    expandedGenerations.clear();
    resetGenerationPanel();
    renderRefreshHistory();
    updateStatusReadout();
    renderVideoStatus();
    document.getElementById('delete-product-btn').style.display = '';
    showProductForm();
    if (options && options.focusGeneration) {
      const panel = document.getElementById('generation-add-panel');
      panel.scrollIntoView({ block: 'center' });
      panel.classList.add('generation-add--highlight');
      setTimeout(() => panel.classList.remove('generation-add--highlight'), 1600);
      const dayInput = document.getElementById('new_refresh_date_day');
      if (dayInput) dayInput.focus({ preventScroll: true });
    }
  }

  function startNewProduct(options) {
    editingId = null;
    editingSlug = null;
    pendingAnnouncedDate = null;
    pendingPreorderDate = null;
    clearFormErrors();
    const advancedSectionNew = document.querySelector('.admin-advanced');
    if (advancedSectionNew) advancedSectionNew.open = false;
    if (window.history && window.history.pushState) {
      window.history.pushState({}, '', '/admin/?new=1');
    }
    productForm.reset();
    const wantsNewFamily = !!(options && options.newFamily);
    const preset = wantsNewFamily ? '' : (options && options.category ? canonicalFamily(options.category) : (selectedFamily || ''));
    document.getElementById('category').value = preset;
    document.getElementById('new-family-wrap').style.display = wantsNewFamily ? '' : 'none';
    document.getElementById('rumor_note_editor').innerHTML = '';
    document.getElementById('did_you_know_editor').innerHTML = '';
    updateDidYouKnowCount();
    currentOriginalLaunchDate = null;
    currentRefreshHistory = [];
    currentGenerationDetails = {};
    currentIconUrl = null;
    currentVideoUrl = null;
    onFamilyChanged();
    setTimelineName(null);
    setTimelineMode('own');
    fillProductSelect(document.getElementById('replaced_by'), '');
    fillProductSelect(document.getElementById('previous_model'), '');
    document.querySelector('input[name="previous_model_action"][value="keep"]').checked = true;
    updatePreviousModelChoice();
    currentDiscontinuedDate = null;
    expandedGenerations.clear();
    resetGenerationPanel();
    renderRefreshHistory();
    updateStatusReadout();
    renderVideoStatus();
    document.getElementById('delete-product-btn').style.display = 'none';
    document.getElementById('form-title').textContent = preset ? 'New product in ' + preset : 'New product';
    showProductForm();
    if (wantsNewFamily) document.getElementById('category').focus();
  }

  document.getElementById('new-product-btn').addEventListener('click', () => startNewProduct());

  function backToList() {
    if (window.history && window.history.pushState) {
      window.history.pushState({}, '', '/admin/');
    }
    showProductList();
  }

  document.getElementById('back-to-list-btn').addEventListener('click', backToList);
  document.getElementById('back-to-families-btn').addEventListener('click', () => {
    selectedFamily = null;
    if (productSearchInputEl) productSearchInputEl.value = '';
    renderProductList();
  });
  document.getElementById('cancel-product-btn').addEventListener('click', backToList);
  document.getElementById('delete-product-btn').addEventListener('click', async () => {
    if (!editingId) return;
    const deleted = await deleteProduct(editingId);
    if (deleted) backToList();
  });

  async function makeFeatured(product) {
    const previouslyFeatured = cachedProducts.find((p) => p.featured && p.id !== product.id);
    if (previouslyFeatured) {
      const clearResult = await client.from('products').update({ featured: false }).eq('id', previouslyFeatured.id);
      if (clearResult.error) {
        window.alert('Failed to un-feature "' + previouslyFeatured.name + '": ' + clearResult.error.message);
        return;
      }
    }
    const result = await client.from('products').update({ featured: true }).eq('id', product.id);
    if (result.error) {
      window.alert('Failed to feature "' + product.name + '": ' + result.error.message);
      return;
    }
    loadProducts();
  }

  // Deleting a product leaves its page address dead, so admin offers to
  // point it at whatever replaced it. The build turns these into 301s.
  async function askForRedirect(product) {
    const others = cachedProducts
      .filter((p) => p.id !== product.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    const sameFamily = others.filter((p) => (p.category || '').toLowerCase() === (product.category || '').toLowerCase());
    const choices = (sameFamily.length ? sameFamily : others).slice(0, 20);
    const menu = choices.map((p, i) => (i + 1) + '. ' + p.name).join('\n');
    const answer = window.prompt(
      'Where should "' + product.name + '" send its old visitors and Google results?\n\n' +
      'Type a number, or leave blank to send them to the ' + (product.category || 'products') + ' page.\n\n' + menu,
      ''
    );
    if (answer === null) return null;
    const picked = choices[parseInt(answer, 10) - 1];
    if (picked) return '/products/' + picked.slug + '/';
    return '/categories/' + slugify(product.category || 'other') + '/';
  }

  async function deleteProduct(id) {
    const product = cachedProducts.find((p) => p.id === id);
    if (!window.confirm('Delete this product? This cannot be undone.')) return false;
    let redirectTo = null;
    if (product && window.confirm('Send its old page address somewhere, so existing links and Google results don\u2019t hit a "page not found"?')) {
      redirectTo = await askForRedirect(product);
    }
    const { error } = await client.from('products').delete().eq('id', id);
    if (error) {
      window.alert('Delete failed: ' + error.message);
      return false;
    }
    if (product && redirectTo) {
      const redirectResult = await client.from('product_redirects').upsert({ from_slug: product.slug, to_path: redirectTo });
      if (redirectResult.error) {
        window.alert('The product was deleted, but the redirect could not be saved: ' + redirectResult.error.message + '\n\nRun supabase-schema-update-21.sql if you have not yet.');
      }
    }
    await loadProducts();
    return true;
  }

  // "Replaces" is a deliberate, one-to-one relationship, unlike Timeline group
  // (which can validly hold multiple simultaneously-current siblings,
  // e.g. iPhone 17 and iPhone 17 Pro). So automatic discontinuation is
  // driven off Previous model specifically, never off Timeline group.
  // Only one product should be Featured at a time, so marking a new one
  // un-features whichever other product currently holds it.
  async function enforceFeaturedExclusivity(payload) {
    if (!payload.featured) return;
    const previouslyFeatured = cachedProducts.find((p) => p.featured && p.id !== editingId);
    if (!previouslyFeatured) return;
    const result = await client.from('products').update({ featured: false }).eq('id', previouslyFeatured.id);
    if (result.error) {
      console.error('Failed to un-feature the previous product:', result.error);
    }
  }

  // Keeps the two halves of a relationship in step. Setting "previous
  // model" on a new product fills in that older product's "replaced by",
  // and setting "replaced by" on an older product fills in the newer
  // one's "previous model". Only fills a blank: an existing answer is
  // never overwritten, since that would be guessing at your intent.
  async function mirrorRelationships(payload) {
    const notes = [];
    const pairs = [
      { mine: payload.previous_model, theirField: 'replaced_by' },
      { mine: payload.replaced_by, theirField: 'previous_model' },
    ];
    for (const { mine, theirField } of pairs) {
      if (!mine) continue;
      const other = cachedProducts.find((p) => p.slug === mine);
      if (!other || other.slug === payload.slug) continue;
      if (other[theirField]) continue;
      const res = await client.from('products').update({ [theirField]: payload.slug }).eq('id', other.id);
      if (res.error) {
        console.error('Could not link ' + other.name + ':', res.error);
      } else {
        other[theirField] = payload.slug;
        notes.push(other.name);
      }
    }
    return notes;
  }

  async function autoDiscontinuePreviousModel(payload, shouldDiscontinue) {
    if (!payload.previous_model || !shouldDiscontinue) return;
    const prev = cachedProducts.find((p) => p.slug === payload.previous_model);
    if (!prev || prev.discontinued) return;
    const newLaunchDate = payload.original_launch_date || (payload.refresh_history && payload.refresh_history[0]) || null;
    const result = await client.from('products').update({
      discontinued: true,
      replaced_by: payload.slug,
      discontinued_date: newLaunchDate,
    }).eq('id', prev.id);
    if (result.error) {
      console.error('Failed to auto-discontinue the previous model:', result.error);
    }
  }

  // Keeps only details for dates that are still generations, and only
  // entries that actually hold something, so blank names keep using
  // the automatic suggestion on the site.
  function cleanGenerationDetails(history) {
    const out = {};
    history.forEach((date) => {
      const info = currentGenerationDetails[date];
      if (!info) return;
      const name = (info.name || '').trim();
      const announced = info.announced || null;
      const preorder = info.preorder || null;
      // preorder was missing here, so every pre-order date typed in was
      // thrown away on save without a word.
      if (name || announced || preorder) out[date] = { name: name || null, announced, preorder };
    });
    return out;
  }

  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors();
    const saveBtn = document.getElementById('save-product-btn');
    try {
      const name = document.getElementById('name').value.trim();
      const category = canonicalFamily(document.getElementById('category').value);
      const isDiscontinued = !!currentDiscontinuedDate;
      const discontinuedDate = currentDiscontinuedDate;

      let firstError = null;
      if (!category) {
        document.getElementById('family-error').textContent = 'Pick a family.';
        firstError = firstError || document.getElementById('step-family');
      }
      if (!name) {
        document.getElementById('name-error').textContent = 'Give this product line a name.';
        firstError = firstError || document.getElementById('step-line');
      }
      const pendingGenerationDate = getDatePrecisionValue('new_refresh_date');
      if (pendingGenerationDate && currentRefreshHistory.indexOf(pendingGenerationDate) === -1 && pendingGenerationDate !== currentDiscontinuedDate) {
        document.getElementById('generation-add-error').textContent = 'You picked a date but haven\u2019t added it yet. Tap "+ Add", or clear the date.';
        firstError = firstError || document.getElementById('step-generations');
      }
      if (firstError) {
        firstError.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      // New products take their slug from the name. When editing, the
      // slug is deliberately kept so live URLs don't break, but if the
      // name no longer matches we offer to fix it and leave a redirect
      // behind so old links and Google results still work.
      let slug = editingId ? editingSlug : slugify(name);
      let oldSlugToRedirect = null;
      if (editingId && slugify(name) !== editingSlug) {
        const suggested = slugify(name);
        const clash = cachedProducts.find((p) => p.slug === suggested && p.id !== editingId);
        if (clash) {
          window.alert('Cannot update the web address to /products/' + suggested + '/ because "' + clash.name + '" already uses it. Rename or remove that product first.');
        } else if (window.confirm('This product\u2019s web address is currently:\n\n/products/' + editingSlug + '/\n\nUpdate it to match the name?\n\n/products/' + suggested + '/\n\nThe old address will redirect to the new one, so existing links keep working.')) {
          slug = suggested;
          oldSlugToRedirect = editingSlug;
        }
      }
      if (!editingId) {
        const clash = cachedProducts.find((p) => p.slug === slug);
        if (clash) {
          window.alert('A product called "' + clash.name + '" already uses the web address /products/' + slug + '/. Give this product a different name, or edit the existing one instead.');
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save product';
          return;
        }
      }
      const originalLaunchDate = currentOriginalLaunchDate;
      const refreshHistoryWithLaunch = (originalLaunchDate && !currentRefreshHistory.includes(originalLaunchDate)
        ? [...currentRefreshHistory, originalLaunchDate]
        : currentRefreshHistory.slice()).sort();

      const payload = {
        slug,
        name,
        category,
        timeline_name: getTimelineName(),
        price: (function () {
          const raw = document.getElementById('price').value.trim();
          if (!raw) return null;
          const symbol = document.querySelector('input[name="price_currency"]:checked').value;
          return symbol + raw;
        })(),
        external_link: document.getElementById('external_link').value.trim() || null,
        specs_url: document.getElementById('specs_url').value.trim() || null,
        press_release_url: document.getElementById('press_release_url').value.trim() || null,
        apple_url: document.getElementById('apple_url').value.trim() || null,
        apple_url_unavailable: document.getElementById('apple_url_unavailable').checked,
        refresh_history: refreshHistoryWithLaunch,
        generation_details: cleanGenerationDetails(refreshHistoryWithLaunch),
        icon_url: currentIconUrl,
        original_launch_date: originalLaunchDate,
        rumor_note: (function () {
          const html = document.getElementById('rumor_note_editor').innerHTML.trim();
          return html && html !== '<br>' ? html : null;
        })(),
        featured: document.getElementById('featured').checked,
        in_countdown: document.getElementById('in_countdown').checked,
        did_you_know: (() => { const h = document.getElementById('did_you_know_editor').innerHTML.trim(); return h && h !== '<br>' ? h : null; })(),
        days_basis: document.querySelector('input[name="days_basis"]:checked').value,
        is_new_launch: document.getElementById('is_new_launch').checked,
        previous_model: document.getElementById('previous_model').value || null,
        discontinued: isDiscontinued,
        discontinued_date: isDiscontinued ? discontinuedDate : null,
        replaced_by: isDiscontinued ? (document.getElementById('replaced_by').value || null) : null,
        discontinued_reason: isDiscontinued ? (document.getElementById('discontinued_reason').value.trim() || null) : null,
        video_url: currentVideoUrl,
      };

      const result = editingId
        ? await client.from('products').update(payload).eq('id', editingId)
        : await client.from('products').insert(payload);

      if (result.error) {
        console.error('Save failed:', result.error);
        const missingColumns = /generation_details|icon_url|specs_url|press_release_url|in_countdown|did_you_know/.test(result.error.message || '');
        window.alert(missingColumns
          ? 'Save failed because the database hasn\u2019t been updated yet. Run the latest supabase-schema-update SQL file in the Supabase SQL editor, then save again.'
          : 'Save failed: ' + result.error.message);
        return;
      }
      if (oldSlugToRedirect) {
        const redirectResult = await client.from('product_redirects').upsert({ from_slug: oldSlugToRedirect, to_path: '/products/' + slug + '/' });
        if (redirectResult.error) {
          window.alert('The product was saved with its new web address, but the redirect from the old one could not be stored: ' + redirectResult.error.message);
        }
        // Other products may point at the old slug as their successor or
        // predecessor. Left alone those references break and show the raw
        // slug on the page, so repoint them at the new one.
        const repointed = await Promise.all([
          client.from('products').update({ replaced_by: slug }).eq('replaced_by', oldSlugToRedirect),
          client.from('products').update({ previous_model: slug }).eq('previous_model', oldSlugToRedirect),
        ]);
        const repointError = repointed.find((r) => r.error);
        if (repointError) {
          window.alert('The new web address was saved, but links from other products to this one could not be updated: ' + repointError.error.message);
        }
      }
      await autoDiscontinuePreviousModel(payload, document.querySelector('input[name="previous_model_action"]:checked').value === 'discontinue');
      const linked = await mirrorRelationships({ ...payload, slug });
      if (linked.length) {
        window.alert('Also updated ' + linked.join(' and ') + ' so the two link to each other. Publish when you are ready for that to show on the site.');
      }
      await enforceFeaturedExclusivity(payload);
      selectedFamily = category;
      editingId = null;
      editingSlug = null;
      await loadProducts();
      backToList();
    } catch (err) {
      console.error('Unexpected error while saving:', err);
      window.alert('Something went wrong saving this product: ' + err.message + '. Check the browser console for the full error.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save product';
    }
  });

  // --- Gallery ---

  let cachedGalleryPhotos = [];
  let editingGalleryId = null;
  let currentGalleryTags = [];
  let currentGalleryImageUrls = [];

  const galleryListView = document.getElementById('gallery-list-view');
  const galleryFormView = document.getElementById('gallery-form-view');
  const galleryListEl = document.getElementById('gallery-list');
  const galleryForm = document.getElementById('gallery-form');
  const galleryTagsListEl = document.getElementById('gallery-tags-list');
  const galleryImageThumbsEl = document.getElementById('gallery-image-thumbs');
  const MAX_GALLERY_IMAGES = 12;

  function showGalleryList() {
    galleryListView.style.display = 'block';
    galleryFormView.style.display = 'none';
  }

  function showGalleryForm() {
    galleryListView.style.display = 'none';
    galleryFormView.style.display = 'block';
    window.scrollTo(0, 0);
  }

  function updateGalleryLocationCountryOptions() {
    const locationOptions = document.getElementById('gallery-location-options');
    const countryOptions = document.getElementById('gallery-country-options');
    if (!locationOptions || !countryOptions) return;
    const locations = Array.from(new Set(cachedGalleryPhotos.map((p) => p.location).filter(Boolean))).sort();
    const countries = Array.from(new Set(cachedGalleryPhotos.map((p) => p.country).filter(Boolean))).sort();
    locationOptions.innerHTML = locations.map((v) => `<option value="${v.replace(/"/g, '&quot;')}">`).join('');
    countryOptions.innerHTML = countries.map((v) => `<option value="${v.replace(/"/g, '&quot;')}">`).join('');
  }

  async function loadGalleryPhotos() {
    const { data, error } = await client.from('gallery_photos').select('*').order('created_at', { ascending: false });
    galleryListEl.innerHTML = '';
    if (error) {
      galleryListEl.textContent = 'Could not load gallery photos: ' + error.message + ' (has supabase-schema-update-9.sql been run?)';
      return;
    }
    cachedGalleryPhotos = data;
    updateGalleryLocationCountryOptions();
    if (!data.length) {
      galleryListEl.textContent = 'No photos yet, add your first one below.';
      return;
    }
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th></th><th>Caption</th><th>Date taken</th><th>Location</th><th></th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    data.forEach((photo) => {
      const tr = document.createElement('tr');

      const photoTd = document.createElement('td');
      photoTd.className = 'admin-table-photo';
      const thumbUrl = (photo.image_urls && photo.image_urls[0]) || photo.image_url;
      if (thumbUrl) {
        const img = document.createElement('img');
        img.src = thumbUrl;
        img.alt = '';
        photoTd.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'admin-table-photo-placeholder';
        photoTd.appendChild(placeholder);
      }

      const captionTd = document.createElement('td');
      captionTd.textContent = photo.caption || '\u2014';

      const dateTd = document.createElement('td');
      dateTd.textContent = photo.date_taken || '\u2014';

      const locationTd = document.createElement('td');
      locationTd.textContent = photo.location || '\u2014';

      const actionsTd = document.createElement('td');
      actionsTd.className = 'admin-row-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => editGalleryPhoto(photo.id));
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => deleteGalleryPhoto(photo.id));
      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(deleteBtn);

      tr.appendChild(photoTd);
      tr.appendChild(captionTd);
      tr.appendChild(dateTd);
      tr.appendChild(locationTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    galleryListEl.appendChild(table);
  }

  function renderGalleryTags() {
    galleryTagsListEl.innerHTML = '';
    currentGalleryTags.forEach((tag, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = tag;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        currentGalleryTags.splice(i, 1);
        renderGalleryTags();
      });
      li.appendChild(span);
      li.appendChild(removeBtn);
      galleryTagsListEl.appendChild(li);
    });
  }

  let draggedGalleryIndex = null;

  function renderGalleryImageThumbs() {
    galleryImageThumbsEl.innerHTML = '';
    currentGalleryImageUrls.forEach((url, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'admin-thumb admin-thumb--reorderable' + (i === 0 ? ' admin-thumb--main' : '');
      wrap.draggable = true;
      wrap.setAttribute('aria-label', i === 0 ? 'Main photo, drag to reorder' : 'Drag to reorder');

      wrap.addEventListener('dragstart', () => {
        draggedGalleryIndex = i;
        wrap.classList.add('admin-thumb--dragging');
      });
      wrap.addEventListener('dragend', () => {
        wrap.classList.remove('admin-thumb--dragging');
        draggedGalleryIndex = null;
      });
      wrap.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      wrap.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedGalleryIndex === null || draggedGalleryIndex === i) return;
        const [moved] = currentGalleryImageUrls.splice(draggedGalleryIndex, 1);
        currentGalleryImageUrls.splice(i, 0, moved);
        renderGalleryImageThumbs();
      });

      const img = document.createElement('img');
      img.src = url;
      wrap.appendChild(img);

      if (i === 0) {
        const mainLabel = document.createElement('span');
        mainLabel.className = 'admin-thumb-main-label';
        mainLabel.textContent = 'Main';
        wrap.appendChild(mainLabel);
      } else {
        const mainBtn = document.createElement('button');
        mainBtn.type = 'button';
        mainBtn.className = 'admin-thumb-main-btn';
        mainBtn.textContent = '\u2605';
        mainBtn.setAttribute('aria-label', 'Set as main photo');
        mainBtn.title = 'Set as main photo';
        mainBtn.addEventListener('click', () => {
          const [moved] = currentGalleryImageUrls.splice(i, 1);
          currentGalleryImageUrls.unshift(moved);
          renderGalleryImageThumbs();
        });
        wrap.appendChild(mainBtn);
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'admin-thumb-remove-btn';
      removeBtn.textContent = '\u00d7';
      removeBtn.setAttribute('aria-label', 'Remove photo');
      removeBtn.addEventListener('click', () => {
        currentGalleryImageUrls.splice(i, 1);
        renderGalleryImageThumbs();
      });
      wrap.appendChild(removeBtn);
      galleryImageThumbsEl.appendChild(wrap);
    });
  }

  document.getElementById('add-gallery-tag-btn').addEventListener('click', () => {
    const input = document.getElementById('new-gallery-tag');
    const value = input.value.trim();
    if (!value) return;
    if (currentGalleryTags.indexOf(value) === -1) currentGalleryTags.push(value);
    input.value = '';
    renderGalleryTags();
  });

  document.getElementById('gallery-image-upload').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_GALLERY_IMAGES - currentGalleryImageUrls.length;
    if (remaining <= 0) {
      window.alert('You already have ' + MAX_GALLERY_IMAGES + ' photos, remove one first.');
      e.target.value = '';
      return;
    }
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      window.alert('Only ' + remaining + ' more photo(s) can be added (' + MAX_GALLERY_IMAGES + ' max), the rest were skipped.');
    }
    for (const file of toUpload) {
      try {
        const url = await uploadFile(file);
        currentGalleryImageUrls.push(url);
        renderGalleryImageThumbs();
      } catch (err) {
        window.alert('Upload failed: ' + err.message);
      }
    }
    e.target.value = '';
  });

  function editGalleryPhoto(id) {
    const photo = cachedGalleryPhotos.find((p) => p.id === id);
    if (!photo) return;
    editingGalleryId = id;
    document.getElementById('gallery-form-title').textContent = 'Edit photo';
    document.getElementById('gallery-caption').value = photo.caption || '';
    document.getElementById('gallery-location').value = photo.location || '';
    document.getElementById('gallery-country').value = photo.country || '';
    setDatePrecisionValue('gallery_date_taken', photo.date_taken || null);
    currentGalleryTags = (photo.tags || []).slice();
    currentGalleryImageUrls = (photo.image_urls && photo.image_urls.length ? photo.image_urls : photo.image_url ? [photo.image_url] : []).slice();
    renderGalleryTags();
    renderGalleryImageThumbs();
    showGalleryForm();
  }

  function startNewGalleryPhoto() {
    editingGalleryId = null;
    galleryForm.reset();
    setDatePrecisionValue('gallery_date_taken', null);
    currentGalleryTags = [];
    currentGalleryImageUrls = [];
    renderGalleryTags();
    renderGalleryImageThumbs();
    document.getElementById('gallery-form-title').textContent = 'Add photo';
    showGalleryForm();
  }

  document.getElementById('new-photo-btn').addEventListener('click', startNewGalleryPhoto);

  document.getElementById('gallery-back-to-list-btn').addEventListener('click', showGalleryList);

  async function deleteGalleryPhoto(id) {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    const { error } = await client.from('gallery_photos').delete().eq('id', id);
    if (error) {
      window.alert('Delete failed: ' + error.message);
      return;
    }
    loadGalleryPhotos();
  }

  galleryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentGalleryImageUrls.length) {
      window.alert('Add at least one photo first.');
      return;
    }
    try {
      const payload = {
        image_urls: currentGalleryImageUrls,
        caption: document.getElementById('gallery-caption').value.trim() || null,
        date_taken: getDatePrecisionValue('gallery_date_taken'),
        location: document.getElementById('gallery-location').value.trim() || null,
        country: document.getElementById('gallery-country').value.trim() || null,
        tags: currentGalleryTags,
      };
      const result = editingGalleryId
        ? await client.from('gallery_photos').update(payload).eq('id', editingGalleryId)
        : await client.from('gallery_photos').insert(payload);
      if (result.error) {
        window.alert('Save failed: ' + result.error.message);
        return;
      }
      galleryForm.reset();
      setDatePrecisionValue('gallery_date_taken', null);
      editingGalleryId = null;
      currentGalleryTags = [];
      currentGalleryImageUrls = [];
      renderGalleryTags();
      renderGalleryImageThumbs();
      await loadGalleryPhotos();
      showGalleryList();
    } catch (err) {
      window.alert('Something went wrong saving this photo: ' + err.message);
    }
  });

  // --- File upload (shared: product photos, video, and the about image) ---

  async function uploadFile(file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '-');
    const path = Date.now() + '-' + safeName;
    const { error } = await client.storage.from('product-images').upload(path, file);
    if (error) {
      console.error('Storage upload failed:', error);
      throw error;
    }
    const { data } = client.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
  }

  document.getElementById('video-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      currentVideoUrl = await uploadFile(file);
      renderVideoStatus();
    } catch (err) {
      window.alert('Video upload failed: ' + err.message);
    }
    e.target.value = '';
  });

  document.getElementById('about-image-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      document.getElementById('about_image_url').value = await uploadFile(file);
    } catch (err) {
      window.alert('Upload failed: ' + err.message);
    }
  });

  // --- Apple Event ---

  let cachedEvents = [];
  let editingEventId = null;
  let currentEventProducts = [];

  const eventListView = document.getElementById('event-list-view');
  const eventFormView = document.getElementById('event-form-view');
  const eventListEl = document.getElementById('event-list');
  const eventForm = document.getElementById('event-form');
  const eventProductsListEl = document.getElementById('event-products-list');

  function showEventList() {
    eventListView.style.display = 'block';
    eventFormView.style.display = 'none';
  }

  function showEventForm() {
    eventListView.style.display = 'none';
    eventFormView.style.display = 'block';
    window.scrollTo(0, 0);
  }

  async function loadEvents() {
    const { data, error } = await client.from('apple_events').select('*').order('event_date', { ascending: false });
    eventListEl.innerHTML = '';
    if (error) {
      eventListEl.textContent = 'Could not load events: ' + error.message + ' (has supabase-schema-update-16.sql been run?)';
      return;
    }
    cachedEvents = data;
    if (!data.length) {
      eventListEl.textContent = 'No events yet, add your first one below.';
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th></th><th>Title</th><th>Date</th><th>Status</th><th></th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    data.forEach((event) => {
      const tr = document.createElement('tr');

      const photoTd = document.createElement('td');
      photoTd.className = 'admin-table-photo';
      if (event.image_url) {
        const img = document.createElement('img');
        img.src = event.image_url;
        img.alt = '';
        photoTd.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'admin-table-photo-placeholder';
        photoTd.appendChild(placeholder);
      }

      const titleTd = document.createElement('td');
      titleTd.textContent = event.heading || '\u2014';

      const dateTd = document.createElement('td');
      dateTd.textContent = event.event_date || '\u2014';

      const statusTd = document.createElement('td');
      statusTd.textContent = event.event_date && event.event_date >= today ? 'Upcoming' : 'Past';

      const actionsTd = document.createElement('td');
      actionsTd.className = 'admin-row-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => editEvent(event.id));
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => deleteEvent(event.id));
      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(deleteBtn);

      tr.appendChild(photoTd);
      tr.appendChild(titleTd);
      tr.appendChild(dateTd);
      tr.appendChild(statusTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    eventListEl.appendChild(table);
  }

  function renderEventProducts() {
    eventProductsListEl.innerHTML = '';
    currentEventProducts.forEach((product, i) => {
      const li = document.createElement('li');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!product.featured;
      checkbox.title = 'Feature on the archive card preview';
      checkbox.addEventListener('change', () => {
        currentEventProducts[i].featured = checkbox.checked;
      });
      const span = document.createElement('span');
      span.textContent = product.name;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        currentEventProducts.splice(i, 1);
        renderEventProducts();
      });
      li.appendChild(checkbox);
      li.appendChild(span);
      li.appendChild(removeBtn);
      eventProductsListEl.appendChild(li);
    });
  }

  document.getElementById('add-event-product-btn').addEventListener('click', () => {
    const input = document.getElementById('new-event-product');
    const value = input.value.trim();
    if (!value) return;
    if (!currentEventProducts.some((p) => p.name.toLowerCase() === value.toLowerCase())) {
      currentEventProducts.push({ name: value, featured: false });
    }
    input.value = '';
    renderEventProducts();
  });

  function renderEventImageThumb() {
    const thumbEl = document.getElementById('event-image-thumb');
    const url = document.getElementById('event_image_url').value;
    thumbEl.innerHTML = '';
    if (!url) return;
    const wrap = document.createElement('div');
    wrap.className = 'admin-thumb';
    const img = document.createElement('img');
    img.src = url;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '\u00d7';
    removeBtn.setAttribute('aria-label', 'Remove image');
    removeBtn.addEventListener('click', () => {
      document.getElementById('event_image_url').value = '';
      renderEventImageThumb();
    });
    wrap.appendChild(img);
    wrap.appendChild(removeBtn);
    thumbEl.appendChild(wrap);
  }

  document.getElementById('event-image-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      document.getElementById('event_image_url').value = await uploadFile(file);
      renderEventImageThumb();
    } catch (err) {
      window.alert('Upload failed: ' + err.message);
    }
    e.target.value = '';
  });

  function editEvent(id) {
    const event = cachedEvents.find((ev) => ev.id === id);
    if (!event) return;
    editingEventId = id;
    document.getElementById('event-form-title').textContent = 'Edit event';
    document.getElementById('event_heading').value = event.heading || '';
    document.getElementById('event_image_url').value = event.image_url || '';
    document.getElementById('event_date').value = event.event_date || '';
    document.getElementById('event_time').value = event.event_time || '';
    document.getElementById('event_url').value = event.event_url || '';
    document.getElementById('event_featured').checked = !!event.featured;
    currentEventProducts = (event.announced_products || []).map((p) => (typeof p === 'string' ? { name: p, featured: false } : p));
    renderEventImageThumb();
    renderEventProducts();
    showEventForm();
  }

  function startNewEvent() {
    editingEventId = null;
    eventForm.reset();
    document.getElementById('event_image_url').value = '';
    currentEventProducts = [];
    renderEventImageThumb();
    renderEventProducts();
    document.getElementById('event-form-title').textContent = 'Add event';
    showEventForm();
  }

  document.getElementById('new-event-btn').addEventListener('click', startNewEvent);

  document.getElementById('event-back-to-list-btn').addEventListener('click', showEventList);

  async function deleteEvent(id) {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    const { error } = await client.from('apple_events').delete().eq('id', id);
    if (error) {
      window.alert('Delete failed: ' + error.message);
      return;
    }
    loadEvents();
  }

  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      heading: document.getElementById('event_heading').value.trim(),
      image_url: document.getElementById('event_image_url').value.trim() || null,
      event_date: document.getElementById('event_date').value || null,
      event_time: document.getElementById('event_time').value.trim() || null,
      event_url: document.getElementById('event_url').value.trim() || null,
      featured: document.getElementById('event_featured').checked,
      announced_products: currentEventProducts,
    };
    if (!payload.heading || !payload.image_url || !payload.event_date) {
      window.alert('Title, image, and event date are all needed.');
      return;
    }
    try {
      const result = editingEventId
        ? await client.from('apple_events').update(payload).eq('id', editingEventId)
        : await client.from('apple_events').insert(payload);
      if (result.error) {
        window.alert(/featured/.test(result.error.message || '')
          ? 'Save failed: run supabase-schema-update-24.sql in Supabase first.'
          : 'Save failed: ' + result.error.message);
        return;
      }
      // Only one event can hold the homepage slot.
      if (payload.featured) {
        const others = cachedEvents.filter((ev) => ev.featured && ev.id !== editingEventId);
        for (const other of others) {
          const clear = await client.from('apple_events').update({ featured: false }).eq('id', other.id);
          if (clear.error) console.error('Could not un-feature an event:', clear.error);
        }
      }
      eventForm.reset();
      editingEventId = null;
      currentEventProducts = [];
      renderEventImageThumb();
      renderEventProducts();
      await loadEvents();
      showEventList();
    } catch (err) {
      window.alert('Something went wrong saving this event: ' + err.message);
    }
  });

  // --- Facts ---

  function buildTweetText(factText) {
    const lower = factText.toLowerCase();
    let emoji = '\ud83c\udf4e';
    const hashtags = ['#Apple'];
    const addTag = (keyword, tag, tagEmoji) => {
      if (lower.indexOf(keyword) !== -1) {
        hashtags.push(tag);
        if (tagEmoji) emoji = tagEmoji;
      }
    };
    addTag('iphone', '#iPhone', '\ud83d\udcf1');
    addTag('apple tv', '#AppleTV', '\ud83d\udcfa');
    addTag('airtag', '#AirTag', '\ud83d\udccd');
    addTag('vision pro', '#VisionPro', '\ud83e\udd7d');
    addTag('apple pencil', '#ApplePencil', '\u270f\ufe0f');
    addTag('watch', '#AppleWatch', '\u231a');
    addTag('airpods', '#AirPods', '\ud83c\udfa7');
    addTag('mac', '#Mac', '\ud83d\udcbb');
    addTag('ipad', '#iPad', '\ud83d\udcf2');
    if (hashtags.length < 3) hashtags.push('#TechFacts');
    const uniqueHashtags = Array.from(new Set(hashtags)).slice(0, 4);

    const hook = emoji + ' Apple Fact:';
    const footer = uniqueHashtags.join(' ') + '\n' + window.location.host;
    let body = hook + ' ' + factText;
    let full = body + '\n\n' + footer;

    // Twitter's 280-char limit: trim the fact text itself (never the
    // hashtags or link) if the combined text runs over.
    if (full.length > 280) {
      const overBy = full.length - 280;
      const keep = Math.max(20, factText.length - overBy - 1);
      const trimmed = factText.slice(0, keep).trim() + '\u2026';
      body = hook + ' ' + trimmed;
      full = body + '\n\n' + footer;
    }
    return full;
  }

  function generateFactImage(factText) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 1200, 675);
    gradient.addColorStop(0, '#0071e3');
    gradient.addColorStop(1, '#14213d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 675);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px system-ui, -apple-system, sans-serif';
    ctx.fillText('\ud83c\udf4e DID YOU KNOW?', 80, 120);

    ctx.font = '700 52px system-ui, -apple-system, sans-serif';
    const words = factText.split(' ');
    let line = '';
    let y = 230;
    const lineHeight = 66;
    const maxWidth = 1040;
    words.forEach((word) => {
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > maxWidth && line !== '') {
        ctx.fillText(line.trim(), 80, y);
        line = word + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    });
    ctx.fillText(line.trim(), 80, y);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '400 26px system-ui, -apple-system, sans-serif';
    ctx.fillText(window.location.host, 80, 610);

    return canvas.toDataURL('image/png');
  }

  function generateFactCandidates() {
    const facts = [];
    const allDates = [];
    cachedProducts.forEach((p) => (p.refresh_history || []).forEach((d) => allDates.push(d)));

    // Month-of-release pattern, only surfaced with a real sample behind it.
    if (allDates.length >= 5) {
      const monthCounts = {};
      allDates.forEach((d) => {
        const month = new Date(d).toLocaleDateString('en-GB', { month: 'long' });
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      });
      const topMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0];
      if (topMonth && topMonth[1] / allDates.length >= 0.3) {
        const pct = Math.round((topMonth[1] / allDates.length) * 100);
        facts.push(pct + '% of the ' + allDates.length + ' product releases tracked on this site have happened in ' + topMonth[0] + ' (' + topMonth[1] + ' of ' + allDates.length + ').');
      }
    }

    // Day-of-week pattern.
    if (allDates.length >= 5) {
      const dayCounts = {};
      allDates.forEach((d) => {
        const day = new Date(d).toLocaleDateString('en-GB', { weekday: 'long' });
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      });
      const topDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
      if (topDay && topDay[1] / allDates.length >= 0.3) {
        const pct = Math.round((topDay[1] / allDates.length) * 100);
        facts.push(pct + '% of the ' + allDates.length + ' product releases tracked here have landed on a ' + topDay[0] + ' (' + topDay[1] + ' of ' + allDates.length + ').');
      }
    }

    // Average refresh cycle per category.
    const categoryCycles = {};
    cachedProducts.forEach((p) => {
      const hist = (p.refresh_history || []).slice().sort();
      if (hist.length < 2) return;
      for (let i = 1; i < hist.length; i++) {
        const days = Math.round((new Date(hist[i]) - new Date(hist[i - 1])) / 86400000);
        if (days <= 0) continue;
        if (!categoryCycles[p.category]) categoryCycles[p.category] = [];
        categoryCycles[p.category].push(days);
      }
    });
    Object.keys(categoryCycles).forEach((cat) => {
      const cycles = categoryCycles[cat];
      if (cycles.length >= 2) {
        const avg = Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length);
        facts.push(cat + ' products have refreshed roughly every ' + avg + ' days on average, based on ' + cycles.length + ' refresh' + (cycles.length === 1 ? '' : 'es') + ' tracked here.');
      }
    });

    // Longest and shortest-lived discontinued products.
    const lifespans = cachedProducts
      .filter((p) => p.discontinued && p.discontinued_date)
      .map((p) => {
        const launch = p.original_launch_date || (p.refresh_history || []).slice().sort()[0];
        if (!launch) return null;
        const days = Math.round((new Date(p.discontinued_date) - new Date(launch)) / 86400000);
        return days > 0 ? { name: p.name, days: days } : null;
      })
      .filter(Boolean);
    if (lifespans.length >= 2) {
      const longest = lifespans.slice().sort((a, b) => b.days - a.days)[0];
      const longYears = Math.floor(longest.days / 365);
      const longText = longYears >= 1 ? 'about ' + longYears + ' year' + (longYears === 1 ? '' : 's') : longest.days + ' days';
      facts.push('The ' + longest.name + ' had the longest run of any discontinued product tracked on this site, lasting ' + longText + ' before being replaced.');

      const shortest = lifespans.slice().sort((a, b) => a.days - b.days)[0];
      if (shortest.name !== longest.name) {
        const shortYears = Math.floor(shortest.days / 365);
        const shortText = shortYears >= 1 ? 'about ' + shortYears + ' year' + (shortYears === 1 ? '' : 's') : 'just ' + shortest.days + ' days';
        facts.push('The ' + shortest.name + ' had the shortest run of any discontinued product tracked here, lasting ' + shortText + '.');
      }
    }

    // Always-available overall stats.
    const categoryCount = new Set(cachedProducts.map((p) => p.category)).size;
    facts.push('This site is currently tracking ' + cachedProducts.length + ' Apple products across ' + categoryCount + ' categories.');

    return facts;
  }

  function renderFactCandidates() {
    const listEl = document.getElementById('fact-candidates');
    const candidates = generateFactCandidates();
    listEl.innerHTML = '';
    if (!candidates.length) {
      listEl.textContent = 'No strong patterns yet, add more products with release dates to unlock these.';
      return;
    }
    candidates.forEach((text) => {
      const row = document.createElement('div');
      row.className = 'admin-fact-row';
      const textarea = document.createElement('textarea');
      textarea.className = 'admin-fact-textarea';
      textarea.value = text;
      textarea.rows = 2;
      const publishBtn = document.createElement('button');
      publishBtn.type = 'button';
      publishBtn.className = 'admin-btn admin-btn--small admin-btn--primary';
      publishBtn.textContent = 'Publish';
      publishBtn.addEventListener('click', async () => {
        const finalText = textarea.value.trim();
        if (!finalText) return;
        const { error } = await client.from('facts').insert({ text: finalText });
        if (error) {
          window.alert('Failed to publish: ' + error.message);
          return;
        }
        loadPublishedFacts();
      });
      row.appendChild(textarea);
      row.appendChild(publishBtn);
      listEl.appendChild(row);
    });
  }

  document.getElementById('generate-facts-btn').addEventListener('click', renderFactCandidates);

  async function loadPublishedFacts() {
    const listEl = document.getElementById('published-facts');
    const { data, error } = await client.from('facts').select('*').order('created_at', { ascending: false });
    listEl.innerHTML = '';
    if (error) {
      listEl.textContent = 'Could not load facts: ' + error.message + ' (has supabase-schema-update-17.sql been run?)';
      return;
    }
    if (!data.length) {
      listEl.textContent = 'Nothing published yet.';
      return;
    }
    data.forEach((fact) => {
      const row = document.createElement('div');
      row.className = 'admin-fact-row';
      const p = document.createElement('p');
      p.textContent = fact.text;
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'admin-btn admin-btn--small';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        const textarea = document.createElement('textarea');
        textarea.className = 'admin-fact-textarea';
        textarea.value = fact.text;
        textarea.rows = 2;
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'admin-btn admin-btn--small admin-btn--primary';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', async () => {
          const newText = textarea.value.trim();
          if (!newText) return;
          const { error: updateError } = await client.from('facts').update({ text: newText }).eq('id', fact.id);
          if (updateError) {
            window.alert('Save failed: ' + updateError.message);
            return;
          }
          loadPublishedFacts();
        });
        row.innerHTML = '';
        row.appendChild(textarea);
        row.appendChild(saveBtn);
      });
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'admin-btn admin-btn--small';
      copyBtn.textContent = 'Copy for Twitter';
      copyBtn.addEventListener('click', () => {
        const tweetText = buildTweetText(fact.text);
        navigator.clipboard.writeText(tweetText).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy for Twitter'; }, 1500);
        }).catch(() => {
          window.alert('Could not copy automatically, here is the text:\n\n' + tweetText);
        });
      });
      const imageBtn = document.createElement('button');
      imageBtn.type = 'button';
      imageBtn.className = 'admin-btn admin-btn--small';
      imageBtn.textContent = 'Download image';
      imageBtn.addEventListener('click', () => {
        const dataUrl = generateFactImage(fact.text);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'apple-refresher-fact.png';
        link.click();
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'admin-btn admin-btn--small';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        if (!window.confirm('Delete this fact?')) return;
        const { error: delError } = await client.from('facts').delete().eq('id', fact.id);
        if (delError) {
          window.alert('Delete failed: ' + delError.message);
          return;
        }
        loadPublishedFacts();
      });
      row.appendChild(p);
      row.appendChild(editBtn);
      row.appendChild(copyBtn);
      row.appendChild(imageBtn);
      row.appendChild(deleteBtn);
      listEl.appendChild(row);
    });
  }

  // --- Page text (homepage and family page intros) ---

  const pagetextForm = document.getElementById('pagetext-form');
  const pagetextTargetEl = document.getElementById('pagetext_target');
  let pageContentRows = {};

  function pagetextKeys() {
    const families = [];
    cachedProducts.forEach((p) => {
      const name = (p.category || '').trim();
      if (name && !families.some((f) => f.toLowerCase() === name.toLowerCase())) families.push(name);
    });
    families.sort((a, b) => a.localeCompare(b));
    return [
      { key: 'home', label: 'Homepage', path: '/' },
      { key: 'products', label: 'All products page', path: '/products/' },
      { key: 'categories', label: 'Browse by category page', path: '/categories/' },
      { key: 'discontinued', label: 'Discontinued page', path: '/discontinued/' },
      { key: 'gallery', label: 'Gallery page', path: '/gallery/' },
      { key: 'events', label: 'Apple Events page', path: '/events/' },
      { key: 'facts', label: 'Facts page', path: '/facts/' },
    ].concat(
      families.map((f) => ({ key: 'category:' + slugify(f), label: f + ' family page', path: '/categories/' + slugify(f) + '/' }))
    );
  }

  function fillPagetextTargets() {
    if (!pagetextTargetEl) return;
    const current = pagetextTargetEl.value;
    pagetextTargetEl.innerHTML = '';
    pagetextKeys().forEach((entry) => {
      const opt = document.createElement('option');
      opt.value = entry.key;
      opt.textContent = entry.label + (pageContentRows[entry.key] ? '  (has text)' : '');
      opt.dataset.path = entry.path;
      pagetextTargetEl.appendChild(opt);
    });
    if (current && Array.from(pagetextTargetEl.options).some((o) => o.value === current)) pagetextTargetEl.value = current;
    showPagetextRow();
  }

  function showPagetextRow() {
    const key = pagetextTargetEl.value;
    const row = pageContentRows[key] || {};
    document.getElementById('pagetext_heading').value = row.heading || '';
    document.getElementById('pagetext_subheading').value = row.subheading || '';
    document.getElementById('pagetext_hide_default_line').checked = !!row.hide_default_line;
    document.getElementById('pagetext_intro').innerHTML = row.intro_html || '';
    document.getElementById('pagetext_footer').innerHTML = row.footer_html || '';
    document.getElementById('pagetext_show_stats').checked = row.show_stats !== false;
    // The automatic stats sentence is about a family's refresh dates, so
    // it only belongs on a family page.
    document.getElementById('pagetext-stats-step').style.display = key.indexOf('category:') === 0 ? '' : 'none';
    const selected = pagetextTargetEl.options[pagetextTargetEl.selectedIndex];
    const path = selected ? selected.dataset.path : '/';
    const link = document.getElementById('pagetext-preview-link');
    link.innerHTML = '';
    const a = document.createElement('a');
    a.href = path;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'View this page \u2197';
    link.appendChild(a);
    document.getElementById('pagetext-status').textContent = '';
  }

  async function loadPageContent() {
    const { data, error } = await client.from('page_content').select('*');
    pageContentRows = {};
    if (!error) {
      (data || []).forEach((row) => { pageContentRows[row.key] = row; });
    }
    // The list of pages comes from the site itself, not the database, so
    // it is filled either way. Only the saved text needs the table.
    fillPagetextTargets();
    if (error) {
      document.getElementById('pagetext-status').textContent =
        'Saved text can\u2019t be loaded yet: run supabase-schema-update-22.sql and 23 in Supabase. You can still pick a page below.';
    }
  }

  if (pagetextTargetEl) pagetextTargetEl.addEventListener('change', showPagetextRow);

  // Counts the words a reader sees, not the formatting tags around them.
  function updateDidYouKnowCount() {
    const editor = document.getElementById('did_you_know_editor');
    const out = document.getElementById('did-you-know-count');
    if (!editor || !out) return;
    const len = (editor.textContent || '').trim().length;
    out.textContent = len ? len + ' / 320 characters' : '';
    out.classList.toggle('is-over', len > 320);
  }
  (function wireDidYouKnowCount() {
    const editor = document.getElementById('did_you_know_editor');
    if (!editor) return;
    editor.addEventListener('input', updateDidYouKnowCount);
  })();

  document.querySelectorAll('.richtext-toolbar [data-editor]').forEach((btn) => {
    // Stops the click stealing focus, which would clear the highlight
    // before the command runs.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      document.getElementById(btn.getAttribute('data-editor')).focus();
      document.execCommand(btn.getAttribute('data-cmd'));
    });
  });

  document.querySelectorAll('.richtext-toolbar [data-link-for]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      const url = window.prompt('Link URL (include https://)');
      if (!url) return;
      document.getElementById(btn.getAttribute('data-link-for')).focus();
      document.execCommand('createLink', false, url);
    });
  });

  if (pagetextForm) {
    pagetextForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const key = pagetextTargetEl.value;
      const clean = (html) => (html && html.trim() && html.trim() !== '<br>' ? html.trim() : null);
      const text = (id) => document.getElementById(id).value.trim() || null;
      const payload = {
        key,
        heading: text('pagetext_heading'),
        subheading: text('pagetext_subheading'),
        hide_default_line: document.getElementById('pagetext_hide_default_line').checked,
        intro_html: clean(document.getElementById('pagetext_intro').innerHTML),
        footer_html: clean(document.getElementById('pagetext_footer').innerHTML),
        show_stats: document.getElementById('pagetext_show_stats').checked,
        updated_at: new Date().toISOString(),
      };
      const { error } = await client.from('page_content').upsert(payload);
      const statusEl = document.getElementById('pagetext-status');
      if (error) {
        statusEl.textContent = /heading|subheading|hide_default_line/.test(error.message || '')
          ? 'Save failed: run supabase-schema-update-23.sql in Supabase first.'
          : 'Save failed: ' + error.message;
        return;
      }
      pageContentRows[key] = payload;
      fillPagetextTargets();
      statusEl.textContent = 'Saved. It appears on the site after the next build, a minute or two.';
    });
  }

  // --- Finding links ---
  //
  // A browser can't read another site's search results from this page,
  // so these open the right search in a new tab. One tap, then paste.
  // gl=us&hl=en keeps results on Apple's US site rather than apple.com/uk
  const US = '&gl=us&hl=en';
  const LINK_SEARCHES = {
    apple: (name) => 'https://www.google.com/search?q=' + encodeURIComponent('site:apple.com ' + name) + US,
    specs: (name) => 'https://www.google.com/search?q=' + encodeURIComponent('site:support.apple.com/en-us ' + name + ' technical specifications') + US,
    wikipedia: (name) => 'https://en.wikipedia.org/w/index.php?search=' + encodeURIComponent(name),
    newsroom: (name) => 'https://www.google.com/search?q=' + encodeURIComponent('site:apple.com/newsroom ' + name) + US,
  };

  document.querySelectorAll('[data-find-link]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = document.getElementById('name').value.trim();
      if (!name) {
        window.alert('Give the product a name first, in step 2.');
        return;
      }
      window.open(LINK_SEARCHES[btn.getAttribute('data-find-link')](name), '_blank', 'noopener');
    });
  });

  // Wikipedia has an open API that allows requests from other sites, so
  // this one can be filled in without leaving admin.
  // Fill automatically: asks the site's own helper to find the page, so
  // there is nothing to search for and paste back by hand.
  document.querySelectorAll('[data-auto-link]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const kind = btn.getAttribute('data-auto-link');
      const target = document.getElementById(btn.getAttribute('data-target'));
      const status = document.querySelector('[data-auto-status="' + kind + '"]');
      const name = document.getElementById('name').value.trim();
      const say = (msg) => { if (status) status.textContent = msg; };

      if (!name) { say('Give the product a name first, in step 2.'); return; }
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Looking\u2026';
      say('Looking for the page\u2026');
      try {
        const res = await fetch('/.netlify/functions/suggest-link?kind=' + encodeURIComponent(kind) +
          '&name=' + encodeURIComponent(name));
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'lookup failed');
        if (!body.url) {
          const why = {
            blocked: 'Apple would not let us look this time. Try again in a minute, or use the Find button.',
            unreachable: 'Could not reach Apple just now. Try again, or use the Find button.',
            not_found: kind === 'newsroom'
              ? 'No matching press release in Apple\u2019s recent announcements. Older products usually have none, so leaving this blank is fine.'
              : 'No page found at the addresses we tried. Use the Find button and paste the address in.',
          };
          say(why[body.reason] || 'Nothing found. Use the Find button and paste the address in.');
        } else if (target.value.trim() && target.value.trim() !== body.url) {
          if (window.confirm('Replace the address already in this box?\n\nCurrent:\n' + target.value + '\n\nFound:\n' + body.url)) {
            target.value = body.url;
            say('Filled in. Open it to check it is the right page before saving.');
          } else {
            say('Left as it was.');
          }
        } else {
          target.value = body.url;
          say('Filled in. Open it to check it is the right page before saving.');
        }
      } catch (err) {
        say('Could not look it up: ' + err.message + '. Use the Find button instead.');
      }
      btn.disabled = false;
      btn.textContent = label;
    });
  });

  const wikipediaBtn = document.getElementById('wikipedia-auto-btn');
  if (wikipediaBtn) {
    wikipediaBtn.addEventListener('click', async () => {
      const status = document.getElementById('wikipedia-auto-status');
      const name = document.getElementById('name').value.trim();
      if (!name) {
        status.textContent = 'Give the product a name first, in step 2.';
        return;
      }
      status.textContent = 'Searching Wikipedia\u2026';
      try {
        const url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
          encodeURIComponent(name) + '&srlimit=1&format=json&origin=*';
        const res = await fetch(url);
        const data = await res.json();
        const hit = data && data.query && data.query.search && data.query.search[0];
        if (!hit) {
          status.textContent = 'Nothing found. Try the Find button instead.';
          return;
        }
        document.getElementById('external_link').value = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(hit.title.replace(/ /g, '_'));
        status.textContent = 'Filled in "' + hit.title + '". Check it is the right page before saving.';
      } catch (err) {
        status.textContent = 'Wikipedia could not be reached. Use the Find button instead.';
      }
    });
  }

  // --- About page ---

  async function loadAbout() {
    const { data } = await client.from('site_content').select('*').eq('id', 'about').maybeSingle();
    if (data) {
      document.getElementById('about_heading').value = data.heading || '';
      document.getElementById('about_body').value = data.body || '';
      document.getElementById('about_image_url').value = data.image_url || '';
    }
  }

  aboutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      id: 'about',
      heading: document.getElementById('about_heading').value.trim(),
      body: document.getElementById('about_body').value.trim(),
      image_url: document.getElementById('about_image_url').value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('site_content').upsert(payload);
    if (error) {
      window.alert('Save failed: ' + error.message);
      return;
    }
    window.alert('About page saved.');
  });

  checkSession();
})();
