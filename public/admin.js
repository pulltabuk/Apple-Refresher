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
  // The product's countdown tick as it was when opened, so a save that
  // changes it rebuilds the site.
  let loadedInCountdown = false;
  // The Coming soon list (every product with a release date still ahead)
  // in place of the family tiles.
  let comingView = false;
  // An announcement added before any release date exists. It attaches
  // itself to the first release added, so dates can be entered in any order.
  let pendingAnnouncedDate = null;
  let focusNameFor = null; // a release whose Name box should get the cursor
  let pendingPreorderDate = null;
  let editingSlug = null;
  let cachedProducts = [];
  // X cards show the product a post is about, so they need the products.
  if (window.FactsKit && window.FactsKit.setCardProductsLoader) {
    window.FactsKit.setCardProductsLoader(async () => {
      const [products, icons] = await Promise.all([
        client.from('products').select('*'),
        client.from('category_icons').select('*'),
      ]);
      const map = {};
      (icons.data || []).forEach((row) => { if (row.icon_url) map[row.category] = row.icon_url; });
      window.FactsKit.setCardCategoryIcons(map);
      return products.data || [];
    });
  }
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

  // Typed-date box that sits in front of the native date picker. Whatever
  // is typed is parsed and written into "<prefix>_day", which stays the
  // source of truth for getDatePrecisionValue and everything else.
  const TYPED_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const TYPED_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  function typedMonthIndex(word) {
    const w = word.toLowerCase().replace(/\.$/, '');
    if (w.length < 3) return -1;
    if (w === 'sept') return 8;
    return TYPED_MONTHS.findIndex((m) => m === w || (w.length === 3 && m.startsWith(w)));
  }

  function isoFromParts(y, m, d) {
    if (!(y >= 1000 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return String(y) + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // Returns "YYYY-MM-DD" or null. All-numeric input is read day-first.
  function parseTypedDate(text) {
    let s = (text || '').trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return isoFromParts(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (m) return isoFromParts(+m[3], +m[2], +m[1]);
    // Drop a leading weekday so the tidied "Friday 19 September 2025" re-parses.
    const words = s.split(' ');
    const first = words[0].toLowerCase().replace(/\.$/, '');
    if (words.length === 4 && TYPED_WEEKDAYS.some((d) => d === first || (first.length === 3 && d.startsWith(first)))) words.shift();
    if (words.length !== 3) return null;
    const dayOf = (w) => (/^\d{1,2}(st|nd|rd|th)?$/i.test(w) ? parseInt(w, 10) : NaN);
    if (!/^\d{4}$/.test(words[2])) return null;
    const year = +words[2];
    let day = dayOf(words[0]);
    let month = typedMonthIndex(words[1]);
    if (isNaN(day) || month < 0) {
      day = dayOf(words[1]);
      month = typedMonthIndex(words[0]);
    }
    if (isNaN(day) || month < 0) return null;
    return isoFromParts(year, month + 1, day);
  }

  function longTypedDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(',', '');
  }

  function setTypedDateEcho(prefix, iso, invalid) {
    const echo = document.getElementById(prefix + '_echo');
    if (!echo) return;
    echo.classList.toggle('date-precision-echo--error', !!invalid);
    echo.textContent = invalid ? 'Not a date I can read. Try 15 Oct 2024 or 15/10/2024.' : (iso ? longTypedDate(iso) : '');
  }

  // Mirror "<prefix>_day" into the text box (after load, calendar, clear).
  function syncTypedDateFromDay(prefix) {
    const textInput = document.getElementById(prefix + '_text');
    const dayInput = document.getElementById(prefix + '_day');
    if (!textInput || !dayInput) return;
    textInput.value = dayInput.value ? longTypedDate(dayInput.value) : '';
    setTypedDateEcho(prefix, dayInput.value || null, false);
  }

  function wireTypedDateInput(prefix) {
    const textInput = document.getElementById(prefix + '_text');
    const dayInput = document.getElementById(prefix + '_day');
    if (!textInput || !dayInput) return;
    textInput.addEventListener('input', () => {
      const raw = textInput.value.trim();
      const iso = parseTypedDate(raw);
      dayInput.value = iso || '';
      setTypedDateEcho(prefix, iso, !!raw && !iso);
    });
    textInput.addEventListener('blur', () => {
      const raw = textInput.value.trim();
      const iso = parseTypedDate(raw);
      if (iso) textInput.value = longTypedDate(iso);
      setTypedDateEcho(prefix, iso, !!raw && !iso);
    });
    textInput.addEventListener('keydown', (e) => {
      // Enter tidies the date instead of submitting the whole form.
      if (e.key === 'Enter') { e.preventDefault(); textInput.blur(); }
    });
    // The date input itself is invisible; the calendar button opens its
    // native picker, and a pick flows back into the text box below.
    const calendarBtn = document.querySelector('.date-precision-calendar[data-prefix="' + prefix + '"]');
    if (calendarBtn) {
      calendarBtn.addEventListener('click', () => {
        try {
          dayInput.showPicker();
        } catch (err) {
          dayInput.focus();
          dayInput.click();
        }
      });
    }
    dayInput.addEventListener('input', () => syncTypedDateFromDay(prefix));
    dayInput.addEventListener('change', () => syncTypedDateFromDay(prefix));
    const form = textInput.form;
    if (form) form.addEventListener('reset', () => setTimeout(() => syncTypedDateFromDay(prefix), 0));
  }

  function updateDatePrecisionVisibility(prefix) {
    const checked = document.querySelector('input[name="' + prefix + '_precision"]:checked');
    const val = checked ? checked.value : 'day';
    const dayInput = document.getElementById(prefix + '_day');
    const monthInput = document.getElementById(prefix + '_month');
    const yearInput = document.getElementById(prefix + '_year');
    if (!dayInput || !monthInput || !yearInput) return;
    const picker = document.getElementById(prefix + '_picker');
    if (picker) picker.style.display = val === 'day' ? '' : 'none';
    const textInput = document.getElementById(prefix + '_text');
    if (textInput) textInput.style.display = val === 'day' ? '' : 'none';
    const echo = document.getElementById(prefix + '_echo');
    if (echo) echo.style.display = val === 'day' ? '' : 'none';
    monthInput.style.display = val === 'month' ? '' : 'none';
    yearInput.style.display = val === 'year' ? '' : 'none';
  }

  function wireDatePrecisionField(prefix) {
    document.querySelectorAll('input[name="' + prefix + '_precision"]').forEach((radio) => {
      radio.addEventListener('change', () => updateDatePrecisionVisibility(prefix));
    });
    wireTypedDateInput(prefix);
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
    syncTypedDateFromDay(prefix);
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

  // --- Earnings: Apple's quarterly results (table: earnings). Saving
  // rebuilds the site so the homepage line and /earnings/ update.
  let earningsRows = [];
  let editingEarningsId = null;
  const earnEl = (id) => document.getElementById(id);
  function showEarningsForm(show) {
    earnEl('earnings-list-view').style.display = show ? 'none' : '';
    earnEl('earnings-form-view').style.display = show ? '' : 'none';
  }
  async function loadEarningsAdmin() {
    const list = earnEl('earnings-list');
    if (!list) return;
    list.textContent = 'Loading…';
    const { data, error } = await client.from('earnings').select('*').order('report_date', { ascending: false });
    if (error) {
      list.textContent = 'Could not load earnings: ' + error.message + ' (has supabase-schema-update-29.sql been run in Supabase?)';
      return;
    }
    earningsRows = data || [];
    list.innerHTML = '';
    if (!earningsRows.length) { list.textContent = 'No quarters yet.'; return; }
    const today = new Date().toISOString().slice(0, 10);
    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML = '<thead><tr><th>Quarter</th><th>Results</th><th>Headline</th><th>Press release</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    earningsRows.forEach((row) => {
      const tr = document.createElement('tr');
      const cell = (text) => { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; };
      cell('Q' + row.fiscal_quarter + ' FY' + row.fiscal_year);
      cell((row.report_date || '') + (row.report_date >= today ? ' (upcoming)' : ''));
      cell(row.headline || '—');
      cell(row.press_release_url ? 'Added' : (row.report_date < today ? 'Missing' : '—'));
      const actions = document.createElement('td');
      actions.className = 'admin-row-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => openEarningsForm(row));
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!window.confirm('Delete Q' + row.fiscal_quarter + ' FY' + row.fiscal_year + '?')) return;
        const { error: delError } = await client.from('earnings').delete().eq('id', row.id);
        if (delError) { window.alert('Could not delete: ' + delError.message); return; }
        await rebuildSite();
        loadEarningsAdmin();
        loadNextEarnings();
      });
      actions.appendChild(edit);
      actions.appendChild(del);
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    list.appendChild(table);
  }
  function openEarningsForm(row) {
    editingEarningsId = row ? row.id : null;
    // A new quarter follows on from the latest one.
    const latest = earningsRows[0];
    const nextYear = latest ? (latest.fiscal_quarter === 4 ? latest.fiscal_year + 1 : latest.fiscal_year) : new Date().getFullYear();
    const nextQuarter = latest ? (latest.fiscal_quarter % 4) + 1 : 1;
    earnEl('earnings-form-title').textContent = row ? 'Edit Q' + row.fiscal_quarter + ' FY' + row.fiscal_year : 'Add a quarter';
    earnEl('earn_year').value = row ? row.fiscal_year : nextYear;
    earnEl('earn_quarter').value = String(row ? row.fiscal_quarter : nextQuarter);
    earnEl('earn_date').value = row ? row.report_date || '' : '';
    earnEl('earn_time').value = row ? row.report_time || '' : '1:30pm PT';
    earnEl('earn_call').value = row ? row.call_time || '' : '2pm PT';
    earnEl('earn_qend').value = row ? row.quarter_end || '' : '';
    earnEl('earn_url').value = row ? row.press_release_url || '' : '';
    earnEl('earn_headline').value = row ? row.headline || '' : '';
    earnEl('earnings-error').textContent = '';
    earnEl('earnings-status').textContent = '';
    showEarningsForm(true);
  }
  if (earnEl('earnings-form')) {
    earnEl('new-earnings-btn').addEventListener('click', () => openEarningsForm(null));
    earnEl('earnings-back-btn').addEventListener('click', () => showEarningsForm(false));
    earnEl('earnings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = earnEl('earn_url').value.trim();
      if (url && !/^https:\/\//.test(url)) { earnEl('earnings-error').textContent = 'The press release link should start with https://'; return; }
      const record = {
        fiscal_year: Number(earnEl('earn_year').value),
        fiscal_quarter: Number(earnEl('earn_quarter').value),
        report_date: earnEl('earn_date').value,
        report_time: earnEl('earn_time').value.trim() || null,
        call_time: earnEl('earn_call').value.trim() || null,
        quarter_end: earnEl('earn_qend').value || null,
        press_release_url: url || null,
        headline: earnEl('earn_headline').value.trim() || null,
      };
      if (!record.fiscal_year || !record.report_date) { earnEl('earnings-error').textContent = 'Add the fiscal year and the results date.'; return; }
      const query = editingEarningsId
        ? client.from('earnings').update(record).eq('id', editingEarningsId)
        : client.from('earnings').insert(record);
      const { error } = await query;
      if (error) {
        earnEl('earnings-error').textContent = /duplicate|unique/i.test(error.message)
          ? 'That quarter is already listed: edit it instead.'
          : 'Could not save: ' + error.message;
        return;
      }
      earnEl('earnings-status').textContent = 'Saved. Publishing…';
      const published = await rebuildSite();
      earnEl('earnings-status').textContent = published.ok ? 'Saved. Live on the site in about a minute.' : 'Saved, but publishing failed (' + published.error + '). Press Publish changes.';
      await loadEarningsAdmin();
      loadNextEarnings();
      setTimeout(() => showEarningsForm(false), 1200);
    });
  }

  // Loads the X tab's drafts to review; set up inside xPosts() below.
  let xDraftsLoader = null;

  // --- X posts: for the X account only, nothing is saved or published
  // on the site.
  (function xPosts() {
    const $x = (id) => document.getElementById(id);
    const origin = window.location.origin;
    let ideas = [];
    let shown = 0;
    let cardUrl = null;
    let cardTimer = null;

    // The card rides along as the link's preview (see xCardLink in
    // facts-kit.js), so it is saved to storage as soon as the wording
    // settles; Post to X waits until it is.
    let cardKey = null;
    let cardFor = '';
    let uploadTimer = null;
    // The card's headline and line: guessed from the post until the writer
    // types in either, then exactly what they typed.
    let cardFieldsOwn = false;
    // The card's heading ("On this day", "Launch day"): picked from the
    // post until the writer types one or an idea brings its own.
    let cardLabelOwn = false;
    const cardFields = () => ({
      headline: $x('x-card-headline').value,
      line: $x('x-card-line').value,
      title: $x('x-card-title').value,
      icon: $x('x-card-emoji').value.trim() || $x('x-card-icon').value,
      source: $x('x-card-source').value,
    });
    // The post's link when it goes to another site (an article being
    // shared): the card then forwards there instead of to this site.
    const outsideLink = () => {
      const link = $x('x-link-on').checked ? $x('x-link').value.trim() : '';
      try { return link && new URL(link).origin !== origin && /^https:/i.test(link) ? link : ''; } catch (e) { return ''; }
    };
    function guessCardFields() {
      // "Automatic" says which icon it will use.
      const text = $x('x-text').value.trim();
      $x('x-card-icon-auto').textContent = text ? 'Auto uses: ' + window.FactsKit.cardAutoIconName(text) : '';
      if (cardFieldsOwn && cardLabelOwn) return;
      const guess = window.FactsKit.cardGuess(text);
      if (!cardLabelOwn) $x('x-card-label').value = text ? guess.label : 'Did you know?';
      if (cardFieldsOwn) return;
      $x('x-card-headline').value = guess.headline;
      $x('x-card-line').value = guess.line;
      $x('x-card-title').value = guess.title;
    }
    // The X box: built from the fields until it's edited by hand.
    let previewOwn = false;
    const postText = () => $x('x-preview').value.trim();

    const cardSig = () => ($x('x-card-label').value.trim() || 'Did you know?') + '\n' + $x('x-text').value.trim() + '\n' + JSON.stringify(cardFields()) + '\n' + outsideLink();
    const wantsCard = () => $x('x-card-on').checked && !!$x('x-text').value.trim();
    const cardReady = () => !wantsCard() || (cardKey && cardFor === cardSig());
    // Whether the saved card's link opened properly when checked; if not,
    // the post carries the plain link.
    let cardLinkOk = false;

    function fullText() {
      const link = $x('x-link-on').checked ? $x('x-link').value.trim() : '';
      return window.FactsKit.xPostText($x('x-text').value, {
        hashtags: $x('x-tags').checked,
        products: cachedProducts,
        link: wantsCard() && cardReady() && cardLinkOk ? window.FactsKit.xCardLink(origin, cardKey, link) : link,
      });
    }

    function prepareCard() {
      clearTimeout(uploadTimer);
      if (!wantsCard() || cardReady()) return;
      const sig = cardSig();
      uploadTimer = setTimeout(async () => {
        const label = $x('x-card-label').value.trim() || 'Did you know?';
        const away = outsideLink();
        const key = await window.FactsKit.uploadXCard(client, $x('x-text').value.trim(), label, cardFields(), away || undefined);
        if (sig !== cardSig()) return;
        const check = key ? await window.FactsKit.checkXCardLink(origin, key, away || undefined)
          : { ok: false, reason: window.FactsKit.uploadXCard.lastError || 'the card didn\u2019t save' };
        if (sig !== cardSig()) return;
        cardKey = key || 'none';
        cardFor = sig;
        cardLinkOk = check.ok;
        const note = $x('x-link-note');
        note.hidden = false;
        note.classList.toggle('x-card-note', !check.ok);
        note.textContent = check.ok
          ? (away ? 'Card link checked: it shows the card on X and opens the article.' : 'Card link checked: it opens and shows the card on X.')
          : 'The card link isn\u2019t working (' + check.reason + '), so this post uses the plain link instead. You can still download the card and add it to the post in X.';
        $x('x-post-btn').textContent = 'Post to X';
        refresh();
      }, 900);
    }

    // The count and buttons follow whatever is in the X box, as that is
    // what gets posted.
    // Takes the hashtags out: from the X box itself when it's been edited
    // by hand (the tick box no longer changes it), otherwise by unticking.
    $x('x-over-tags').addEventListener('click', () => {
      if (previewOwn) {
        $x('x-preview').value = window.FactsKit.xWithoutHashtags($x('x-preview').value);
        $x('x-preview').dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        $x('x-tags').checked = false;
        $x('x-tags').dispatchEvent(new Event('change', { bubbles: true }));
        $x('x-tags').dispatchEvent(new Event('input', { bubbles: true }));
      }
      updateCount();
    });

    function updateCount() {
      const post = postText();
      const len = window.FactsKit.xPostLength(post);
      $x('x-count').textContent = post ? len + ' / 280 characters' + window.FactsKit.xLengthNote(post, $x('x-tags').checked) : '';
      $x('x-count').classList.toggle('is-over', len > 280);
      $x('x-post-btn').disabled = !post || len > 280 || !cardReady();
      const overNote = window.FactsKit.xOverNote(post);
      $x('x-over').hidden = !overNote;
      if (overNote) {
        $x('x-over-text').textContent = overNote.text;
        $x('x-over-tags').hidden = !overNote.tagsFix;
      }
      if (post && !cardReady()) $x('x-post-btn').textContent = 'Preparing card\u2026';
      else if ($x('x-post-btn').textContent === 'Preparing card\u2026') $x('x-post-btn').textContent = 'Post to X';
      $x('x-copy-btn').disabled = !post;
      $x('x-preview-reset').hidden = !previewOwn;
      $x('x-preview-note').hidden = !previewOwn;
    }

    function refresh() {
      const text = $x('x-text').value.trim();
      guessCardFields();
      if (!previewOwn) {
        $x('x-preview').value = text ? fullText() : '';
      } else if (cardKey && cardReady()) {
        // Edited by hand: only keep its card link pointing at the latest card.
        const box = $x('x-preview');
        const swapped = box.value.replace(new RegExp(origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/c/[0-9a-z]+/', 'gi'), cardLinkOk && wantsCard() ? origin + '/c/' + cardKey + '/' : origin + '/');
        if (swapped !== box.value) box.value = swapped;
      }
      if (!wantsCard() || !cardReady()) $x('x-link-note').hidden = true;
      prepareCard();
      updateCount();
      // The card follows the text, redrawn a moment after typing stops.
      clearTimeout(cardTimer);
      const wantCard = $x('x-card-on').checked && text;
      $x('x-card').hidden = !wantCard;
      $x('x-card-btn').hidden = !wantCard;
      $x('x-card-fields').hidden = !$x('x-card-on').checked;
      if (!wantCard) $x('x-card-note').hidden = true;
      if (wantCard) {
        cardTimer = setTimeout(async () => {
          const sig = cardSig();
          const card = await window.FactsKit.xCardPreview(text, $x('x-card-label').value.trim() || 'Did you know?', cardFields());
          // The wording changed (or the post was cleared) while it drew.
          if (sig !== cardSig() || !$x('x-card-on').checked) return;
          cardUrl = card.url;
          $x('x-card').src = cardUrl;
          $x('x-card-note').hidden = !card.lineCut;
          $x('x-card-note').textContent = card.lineCut ? 'The card\u2019s text is too long, so it is cut short (\u2026). Shorten the headline or the line to show it all.' : '';
        }, 300);
      }
    }

    // Other tabs (Facts) hand a fact over to post: switch here and fill it in.
    window.AdminX = {
      use(idea) {
        const tabBtn = document.querySelector('.admin-tab-btn[data-tab="x"]');
        if (tabBtn) tabBtn.click();
        useIdea(idea);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      // From the "Tweet this" bookmark: { url, title, site, via } read off
      // the article itself.
      shareArticle(info) {
        const tabBtn = document.querySelector('.admin-tab-btn[data-tab="x"]');
        if (tabBtn) tabBtn.click();
        window.scrollTo({ top: 0 });
        if (info.title) useArticle(info);
        else { $x('x-article').value = info.url; $x('x-article-btn').click(); }
      },
    };

    // Someone else's story: its headline and the article's own link. With
    // a card, the card opens the article (see outsideLink), and its source
    // line names the site.
    function useArticle(info) {
      const post = window.FactsKit.articlePostText(info);
      useIdea({ text: post, link: info.url, kind: 'News' });
      const site = String(info.site || '').trim();
      $x('x-card-source').value = site ? 'Source: ' + site : '';
      // The card starts as the article's headline in large type (no big
      // figure), which suits news; every field can still be changed.
      $x('x-card-headline').value = '';
      $x('x-card-line').value = post.replace(/\s+via\s+@?\S+$/i, '');
      cardFieldsOwn = true;
      $x('x-article').value = '';
      $x('x-article-note').textContent = 'Ready: check the wording below, then Post to X.';
      refresh();
    }

    $x('x-article-btn').addEventListener('click', async () => {
      const raw = $x('x-article').value.trim();
      const url = /^https?:\/\//i.test(raw) ? raw : raw ? 'https://' + raw : '';
      if (!url) { $x('x-article').focus(); return; }
      const btn = $x('x-article-btn');
      btn.disabled = true;
      btn.textContent = 'Reading\u2026';
      $x('x-article-note').textContent = 'Reading the article\u2019s headline\u2026';
      try {
        const { data } = await client.auth.getSession();
        const token = data && data.session ? data.session.access_token : null;
        const res = await fetch('/.netlify/functions/article-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ url }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.title) throw new Error(body.error || 'no headline found');
        useArticle({ url: body.url || url, title: body.title, site: body.site, via: body.via });
      } catch (err) {
        // Still useful without the headline: the link is in, type the rest.
        useIdea({ text: '', link: url, kind: 'News' });
        try { $x('x-card-source').value = 'Source: ' + new URL(url).hostname.replace(/^www\./, ''); } catch (e) { /* not a link */ }
        refresh();
        $x('x-article-note').textContent = 'Couldn\u2019t read the headline (' + err.message + '). The link is in: type what you want to say above it.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Share article';
      }
    });
    $x('x-article').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $x('x-article-btn').click(); }
    });

    // The "Tweet this" bookmark: run on an article, it reads the headline,
    // site name and X account from the page's own tags and opens this page
    // with them (handled in showDashboard).
    const bookmarklet = "javascript:(function(){var m=function(s){var e=document.querySelector(s);return e&&e.content?e.content:''};" +
      "var t=m('meta[property=\"og:title\"]')||m('meta[name=\"twitter:title\"]')||document.title;" +
      "var u=m('meta[property=\"og:url\"]')||location.href;if(!/^https:/.test(u))u=location.href;" +
      "window.open('" + origin + "/admin/?share='+encodeURIComponent(u)+'&title='+encodeURIComponent(t)+'&site='+encodeURIComponent(m('meta[property=\"og:site_name\"]')||location.hostname.replace(/^www\\./,''))+'&via='+encodeURIComponent(m('meta[name=\"twitter:site\"]')||m('meta[property=\"twitter:site\"]')),'_blank');})();";
    $x('x-bookmarklet').setAttribute('href', bookmarklet);
    $x('x-bookmarklet').addEventListener('click', (e) => {
      e.preventDefault();
      window.alert('Drag this button up to your bookmarks bar (in Safari, show it with View > Show Favorites Bar). Then click it while reading any article.');
    });

    function useIdea(idea) {
      if ($x('x-text').value.trim() && !window.confirm('Replace the post you are writing with this idea?')) return;
      // Shortened if need be, so it never arrives over X's 280.
      $x('x-text').value = window.FactsKit.xFitText(idea.text, { products: cachedProducts, link: idea.link });
      $x('x-link').value = idea.link || '';
      $x('x-link-on').checked = !!idea.link;
      $x('x-card-label').value = idea.kind || 'Did you know?';
      cardLabelOwn = !!idea.kind;
      $x('x-card-source').value = '';
      cardFieldsOwn = false;
      previewOwn = false;
      $x('x-card-emoji').value = '';
      $x('x-card-icon').value = 'auto';
      markIcon();
      // An event's idea brings its own card: artwork, name and countdown.
      if (window.FactsKit.applyIdeaCard(idea, {
        title: $x('x-card-title'), headline: $x('x-card-headline'), line: $x('x-card-line'),
        emoji: $x('x-card-emoji'), select: $x('x-card-icon'), picker: $x('x-card-icon-picker'),
      }, refresh)) {
        cardFieldsOwn = true;
        $x('x-card-on').checked = true;
      }
      refresh();
      $x('x-text').focus();
    }

    function showIdeas() {
      const box = $x('x-ideas');
      box.innerHTML = '';
      if (!ideas.length) {
        box.textContent = 'No ideas yet: add some products and dates first.';
        return;
      }
      for (let i = 0; i < Math.min(6, ideas.length); i++) {
        const idea = ideas[(shown + i) % ideas.length];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fact-suggestion';
        const kind = document.createElement('span');
        kind.className = 'x-idea-kind';
        kind.textContent = idea.kind;
        btn.appendChild(kind);
        btn.appendChild(document.createTextNode(idea.text));
        btn.addEventListener('click', () => useIdea(idea));
        box.appendChild(btn);
      }
      shown = (shown + 6) % ideas.length;
      $x('x-ideas-btn').textContent = ideas.length > 6 ? 'More ideas' : 'Ideas from my data';
    }

    let eventIdeaCount = 0;
    $x('x-ideas-btn').addEventListener('click', async () => {
      if (!ideas.length) {
        ideas = window.FactsKit.xPostIdeas(cachedProducts, origin);
        // Mixed up, so each batch has a bit of everything.
        for (let i = ideas.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ideas[i], ideas[j]] = [ideas[j], ideas[i]];
        }
        shown = 0;
        eventIdeaCount = 0;
      }
      // A coming, live or just-held Apple Event goes first, read afresh
      // each time so it has the latest announced products.
      const { data: events } = await client.from('apple_events').select('*');
      const eventIdeas = window.FactsKit.eventPostIdeas(events || [], origin);
      ideas = eventIdeas.concat(ideas.slice(eventIdeaCount));
      eventIdeaCount = eventIdeas.length;
      showIdeas();
    });

    $x('x-claude-btn').addEventListener('click', () => {
      const prompt = window.FactsKit.xPostPrompt($x('x-topic').value.trim());
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(prompt).catch(() => {});
      $x('x-claude-note').textContent = 'Claude opened in a new tab (the request is also copied, in case it opens empty). Check its sources, then copy the post you like into the box below.';
      window.open(window.FactsKit.claudeResearchUrl(prompt), '_blank', 'noopener');
    });
    $x('x-topic').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $x('x-claude-btn').click(); }
    });

    ['x-text', 'x-link'].forEach((id) => $x(id).addEventListener('input', refresh));
    $x('x-card-label').addEventListener('input', () => { cardLabelOwn = true; refresh(); });
    ['x-card-headline', 'x-card-line', 'x-card-title', 'x-card-emoji'].forEach((id) => $x(id).addEventListener('input', () => { cardFieldsOwn = true; refresh(); }));
    // The source isn't guessed from the post, so typing it leaves the
    // other card fields following the text.
    $x('x-card-source').addEventListener('input', refresh);
    window.FactsKit.mountIconPicker($x('x-card-icon-picker'), $x('x-card-icon'), $x('x-card-emoji'), refresh);
    const markIcon = () => { if ($x('x-card-icon-picker').markPicked) $x('x-card-icon-picker').markPicked(); };
    $x('x-preview').addEventListener('input', () => { previewOwn = true; updateCount(); });
    $x('x-preview-reset').addEventListener('click', () => { previewOwn = false; refresh(); });
    ['x-tags', 'x-link-on', 'x-card-on'].forEach((id) => $x(id).addEventListener('change', refresh));

    // The writing fields, always editable when the page is in view (a
    // phone coming back from X can leave them looking stuck).
    const xFields = ['x-text', 'x-link', 'x-card-label', 'x-card-headline', 'x-card-line', 'x-card-title', 'x-card-source', 'x-card-icon', 'x-card-emoji', 'x-preview', 'x-topic', 'x-tags', 'x-link-on', 'x-card-on'];
    function unlockFields() {
      xFields.forEach((id) => { const el = $x(id); if (el) { el.disabled = false; el.readOnly = false; } });
    }
    window.addEventListener('pageshow', unlockFields);
    window.addEventListener('focus', unlockFields);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) unlockFields(); });

    // Everything that belongs to one post, beyond its text: hand edits
    // to the X box and the card, the saved card, and the drawn image.
    function forgetPostState() {
      cardFieldsOwn = false;
      cardLabelOwn = false;
      previewOwn = false;
      $x('x-card-headline').value = '';
      $x('x-card-line').value = '';
      $x('x-card-title').value = '';
      $x('x-card-source').value = '';
      $x('x-card-emoji').value = '';
      $x('x-card-icon').value = 'auto';
      markIcon();
      clearTimeout(cardTimer);
      clearTimeout(uploadTimer);
      cardKey = null;
      cardFor = '';
      cardUrl = null;
      $x('x-card').removeAttribute('src');
      $x('x-preview').value = '';
      $x('x-link-note').hidden = true;
    }

    function clearPost() {
      // Hand edits are forgotten first, so nothing below can leave the
      // last post's wording stuck in the X box or on the card.
      forgetPostState();
      $x('x-text').value = '';
      $x('x-link').value = '';
      $x('x-link-on').checked = false;
      // Back to the defaults (sharing an article turns the card off).
      $x('x-tags').checked = true;
      $x('x-card-on').checked = true;
      $x('x-card-label').value = 'Did you know?';
      $x('x-topic').value = '';
      $x('x-ideas').innerHTML = '';
      $x('x-after').hidden = true;
      // The last post's Buffer message and draft go with it.
      composerDraft = null;
      $x('x-buffer-note').hidden = true;
      $x('x-buffer-when').hidden = true;
      unlockFields();
      refresh();
    }

    // Pasting into an empty post box, or over the whole of it, is a new
    // post: the X box and card follow the new words, whatever was edited
    // by hand for the last one (and even if Clear never ran: a browser
    // that has blocked its "Clear this post?" question cancels it).
    $x('x-text').addEventListener('paste', () => {
      const box = $x('x-text');
      const whole = !box.value.trim() || (box.selectionStart === 0 && box.selectionEnd === box.value.length);
      if (whole) forgetPostState();
    });

    $x('x-post-btn').addEventListener('click', () => {
      window.open('https://x.com/intent/post?text=' + encodeURIComponent(postText()), '_blank', 'noopener');
      $x('x-after').hidden = false;
      $x('x-after').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Emoji buttons: added where the cursor is in the X box (the end, if
    // it hasn't been clicked into), which then counts as edited by hand.
    let previewCaret = null;
    ['select', 'keyup', 'click'].forEach((ev) => $x('x-preview').addEventListener(ev, () => {
      const box = $x('x-preview');
      previewCaret = [box.selectionStart, box.selectionEnd];
    }));
    document.querySelectorAll('#x-emoji-row .x-emoji').forEach((btn) => btn.addEventListener('click', () => {
      const box = $x('x-preview');
      if (!box.value.trim()) return;
      const [start, end] = previewCaret || [box.value.length, box.value.length];
      box.setRangeText(btn.dataset.emoji, start, end, 'end');
      previewCaret = [box.selectionStart, box.selectionEnd];
      previewOwn = true;
      updateCount();
      box.focus();
    }));
    // Done: start afresh and go back to the admin's first tab.
    $x('x-done-btn').addEventListener('click', () => $x('x-back-btn').click());
    $x('x-clear-btn').addEventListener('click', () => {
      if ($x('x-text').value.trim() && !window.confirm('Clear this post and start again?')) return;
      clearPost();
      $x('x-text').focus();
    });
    $x('x-another-btn').addEventListener('click', () => {
      clearPost();
      $x('x-ideas-btn').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $x('x-edit-btn').addEventListener('click', () => {
      $x('x-after').hidden = true;
      unlockFields();
      $x('x-text').focus();
    });
    $x('x-back-btn').addEventListener('click', () => {
      clearPost();
      const home = document.querySelector('.admin-tab-btn[data-tab="products"]');
      if (home) home.click();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $x('x-copy-btn').addEventListener('click', () => {
      const text = postText();
      const btn = $x('x-copy-btn');
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy text'; }, 1500);
      }).catch(() => window.prompt('Copy this:', text));
    });
    $x('x-card-btn').addEventListener('click', () => {
      if (!cardUrl) return;
      const link = document.createElement('a');
      link.href = cardUrl;
      link.download = 'apple-sunset-post.png';
      link.click();
    });

    // --- Buffer: posts go to Buffer, which publishes them to X, added to
    // its queue (the next free slot) or for a set time, with the card
    // attached as an image. The Buffer key stays on Netlify; the browser
    // only ever talks to the site's own (owner-only) function.
    async function ownerToken() {
      const { data } = await client.auth.getSession();
      return data && data.session ? data.session.access_token : null;
    }
    // The card saved to storage, as a public image address for Buffer.
    async function cardImageUrl(text, label, fields) {
      const key = await window.FactsKit.uploadXCard(client, text, label, fields);
      if (!key) throw new Error(window.FactsKit.uploadXCard.lastError || 'the card didn\u2019t save');
      const { data } = client.storage.from('product-images').getPublicUrl('x-cards/' + key + '.png');
      return data.publicUrl;
    }
    async function sendToBuffer(post, mode, dueAt) {
      const token = await ownerToken();
      if (!token) throw new Error('You\u2019re signed out. Log in again.');
      const res = await fetch('/.netlify/functions/buffer', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', text: post.text, imageUrl: post.imageUrl || '', mode, dueAt: dueAt || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || 'Buffer send failed (' + res.status + ')');
      return body;
    }
    const whenText = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    // A time picker's local "2026-10-24T09:00" as a real moment.
    const pickedTime = (value) => (value ? new Date(value).toISOString() : '');
    function defaultPickTime() {
      const t = new Date(Date.now() + 2 * 3600000);
      t.setMinutes(0, 0, 0);
      const pad = (n) => String(n).padStart(2, '0');
      return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) + 'T' + pad(t.getHours()) + ':00';
    }

    // The draft (from the list below) being finished in the composer, so
    // sending it from there marks it done.
    let composerDraft = null;
    async function markDraft(id, fields) {
      if (!id) return;
      const { error } = await client.from('x_drafts').update(Object.assign({ decided_at: new Date().toISOString() }, fields)).eq('id', id);
      if (error) console.error('Could not update the draft:', error);
    }

    // The composer's own Buffer buttons: the post as written above, with
    // the card attached as an image (so the post carries the plain link,
    // not the card link that X would otherwise preview).
    let bufferSending = false;
    async function sendComposer(mode, dueAt) {
      const note = $x('x-buffer-note');
      note.hidden = false;
      note.classList.remove('x-card-note');
      const body = $x('x-text').value.trim();
      if (!body) { note.textContent = 'Write a post first.'; return; }
      bufferSending = true;
      const link = $x('x-link-on').checked ? $x('x-link').value.trim() : '';
      const text = previewOwn ? postText() : window.FactsKit.xPostText(body, { hashtags: $x('x-tags').checked, products: cachedProducts, link });
      note.textContent = 'Sending to Buffer\u2026';
      try {
        const label = $x('x-card-label').value.trim() || 'Did you know?';
        const imageUrl = wantsCard() ? await cardImageUrl(body, label, cardFields()) : '';
        const sent = await sendToBuffer({ text, imageUrl }, mode, dueAt);
        note.textContent = mode === 'schedule'
          ? 'Scheduled in Buffer for ' + whenText(sent.dueAt || dueAt) + '.'
          : 'Added to your Buffer queue' + (sent.dueAt ? ', going out ' + whenText(sent.dueAt) : '') + '.';
        if (composerDraft) {
          await markDraft(composerDraft, { status: mode === 'schedule' ? 'scheduled' : 'queued', buffer_post_id: sent.id || null, scheduled_for: sent.dueAt || dueAt || null, text: body });
          composerDraft = null;
          loadDrafts();
        }
      } catch (err) {
        note.classList.add('x-card-note');
        note.textContent = 'Not sent: ' + err.message;
      }
      bufferSending = false;
    }
    // A Buffer message ("Not sent: ...", "Added to your queue") is about the
    // post as it was when sent: once the post or its options change, it
    // goes, so it never looks like a verdict on the new wording.
    function forgetBufferNote(e) {
      if (bufferSending || e.target.closest('#x-buffer-when, #x-drafts')) return;
      $x('x-buffer-note').hidden = true;
    }
    ['input', 'change'].forEach((type) => $x('tab-x').addEventListener(type, forgetBufferNote));
    ['x-card-icon-picker', 'x-emoji-row', 'x-over-tags', 'x-preview-reset'].forEach((id) => $x(id).addEventListener('click', forgetBufferNote));
    $x('x-buffer-queue-btn').addEventListener('click', () => sendComposer('queue'));
    $x('x-buffer-schedule-btn').addEventListener('click', () => {
      const row = $x('x-buffer-when');
      row.hidden = !row.hidden;
      if (!row.hidden && !$x('x-buffer-at').value) $x('x-buffer-at').value = defaultPickTime();
    });
    $x('x-buffer-at-btn').addEventListener('click', () => {
      const at = pickedTime($x('x-buffer-at').value);
      if (!at) { $x('x-buffer-at').focus(); return; }
      $x('x-buffer-when').hidden = true;
      sendComposer('schedule', at);
    });
    $x('x-clear-btn').addEventListener('click', () => { if (!$x('x-text').value.trim()) { composerDraft = null; $x('x-buffer-note').hidden = true; } });

    // --- Drafts to review: written each morning (x-drafts-background on
    // Netlify) from the site's data and, with an Anthropic key, researched
    // by Claude. Each can be queued or scheduled in Buffer, finished in the
    // composer, or rejected. Nothing goes out without a click here.
    let pollTimer = null;
    async function loadRunNote() {
      const { data } = await client.from('site_content').select('body').eq('id', 'x-drafts-run').maybeSingle();
      let run = null;
      try { run = data && data.body ? JSON.parse(data.body) : null; } catch (e) { run = null; }
      if (!run) return '';
      const made = run.site + run.researched;
      return 'Last made ' + whenText(run.at) + ': ' + (made ? (run.site ? run.site + ' from your data' : '') + (run.site && run.researched ? ', ' : '') + (run.researched ? run.researched + ' researched by Claude' : '') : 'nothing new') + '.' +
        (run.notes && run.notes.length ? ' ' + run.notes.join(' ') : '');
    }
    async function loadDrafts() {
      const list = $x('x-drafts-list');
      const status = $x('x-drafts-status');
      const { data, error } = await client.from('x_drafts').select('*').eq('status', 'new').order('created_at', { ascending: false }).limit(30);
      if (error) {
        list.innerHTML = '';
        status.textContent = /x_drafts|relation|schema cache/i.test(error.message)
          ? 'Drafts aren\u2019t switched on yet: run supabase-schema-update-35.sql in the Supabase SQL editor.'
          : 'Couldn\u2019t load drafts: ' + error.message;
        return;
      }
      const note = await loadRunNote().catch(() => '');
      status.textContent = (data.length ? data.length + ' draft' + (data.length === 1 ? '' : 's') + ' waiting. ' : 'No drafts waiting. ') + note;
      list.innerHTML = '';
      data.forEach((d) => list.appendChild(draftItem(d)));
    }
    xDraftsLoader = loadDrafts;

    function draftItem(d) {
      const card = d.card || {};
      const label = card.label || d.kind || 'Did you know?';
      const fields = { headline: card.headline || '', line: card.line || '', title: card.title || '', icon: card.icon || 'auto', source: card.source || '' };
      const item = document.createElement('article');
      item.className = 'x-draft';
      const meta = document.createElement('div');
      meta.className = 'x-draft-meta';
      meta.innerHTML = '<span class="x-idea-kind"></span><span class="x-draft-origin"></span><span class="x-draft-date"></span>';
      meta.children[0].textContent = d.kind || 'Post';
      meta.children[1].textContent = d.origin === 'claude' ? 'Researched by Claude' : 'From your data';
      meta.children[1].classList.toggle('is-claude', d.origin === 'claude');
      meta.children[2].textContent = whenText(d.created_at);
      const body = document.createElement('div');
      body.className = 'x-draft-body';
      const img = document.createElement('img');
      img.className = 'x-draft-card';
      img.alt = 'The card for this post';
      const main = document.createElement('div');
      main.className = 'x-draft-main';
      const text = document.createElement('textarea');
      text.className = 'x-draft-text';
      text.rows = 4;
      text.value = d.text;
      text.setAttribute('aria-label', 'Post text');
      main.appendChild(text);
      if (Array.isArray(d.sources) && d.sources.length) {
        const src = document.createElement('p');
        src.className = 'x-draft-sources';
        src.appendChild(document.createTextNode('Sources: '));
        d.sources.forEach((s, i) => {
          const a = document.createElement('a');
          a.href = s.url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = s.title || s.url;
          if (i) src.appendChild(document.createTextNode(' \u00b7 '));
          src.appendChild(a);
        });
        main.appendChild(src);
      }
      const actions = document.createElement('div');
      actions.className = 'x-actions x-draft-actions';
      const btn = (labelText, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'admin-btn' + (cls ? ' ' + cls : ''); b.textContent = labelText; actions.appendChild(b); return b; };
      const queueBtn = btn('Add to Buffer queue', 'admin-btn--primary');
      const schedBtn = btn('Schedule\u2026');
      const editBtn = btn('Edit in composer');
      const rejectBtn = btn('Reject', 'admin-btn--ghost');
      main.appendChild(actions);
      const when = document.createElement('div');
      when.className = 'x-buffer-when';
      when.hidden = true;
      when.innerHTML = '<input type="datetime-local" aria-label="When to post"> <button type="button" class="admin-btn admin-btn--primary">Schedule</button>';
      main.appendChild(when);
      const note = document.createElement('p');
      note.className = 'admin-hint x-draft-note';
      main.appendChild(note);
      body.appendChild(img);
      body.appendChild(main);
      item.appendChild(meta);
      item.appendChild(body);

      // The card, drawn here as it will go out.
      window.FactsKit.xCardPreview(d.text, label, fields).then((p) => { img.src = p.url; }).catch(() => { img.hidden = true; });

      const busy = (on) => { [queueBtn, schedBtn, editBtn, rejectBtn].forEach((b) => { b.disabled = on; }); };
      async function send(mode, dueAt) {
        busy(true);
        note.classList.remove('x-card-note');
        note.textContent = 'Sending to Buffer\u2026';
        try {
          const words = text.value.trim();
          const fitted = window.FactsKit.xFitText(words, { products: cachedProducts, link: d.link || '' });
          const postBody = window.FactsKit.xPostText(fitted, { hashtags: true, products: cachedProducts, link: d.link || '' });
          const imageUrl = await cardImageUrl(fitted, label, fields);
          const sent = await sendToBuffer({ text: postBody, imageUrl }, mode, dueAt);
          await markDraft(d.id, { status: mode === 'schedule' ? 'scheduled' : 'queued', buffer_post_id: sent.id || null, scheduled_for: sent.dueAt || dueAt || null, text: words });
          item.classList.add('is-done');
          note.textContent = mode === 'schedule' ? 'Scheduled in Buffer for ' + whenText(sent.dueAt || dueAt) + '.' : 'Added to your Buffer queue' + (sent.dueAt ? ', going out ' + whenText(sent.dueAt) : '') + '.';
          setTimeout(loadDrafts, 2500);
        } catch (err) {
          note.classList.add('x-card-note');
          note.textContent = 'Not sent: ' + err.message;
          busy(false);
        }
      }
      queueBtn.addEventListener('click', () => send('queue'));
      schedBtn.addEventListener('click', () => {
        when.hidden = !when.hidden;
        const input = when.querySelector('input');
        if (!when.hidden && !input.value) input.value = defaultPickTime();
      });
      when.querySelector('button').addEventListener('click', () => {
        const at = pickedTime(when.querySelector('input').value);
        if (!at) return;
        when.hidden = true;
        send('schedule', at);
      });
      editBtn.addEventListener('click', () => {
        useIdea({ kind: label, text: text.value.trim(), link: d.link || '' });
        // Its card comes with it, to change there.
        $x('x-card-headline').value = fields.headline;
        $x('x-card-line').value = fields.line;
        $x('x-card-title').value = fields.title;
        $x('x-card-source').value = fields.source;
        cardFieldsOwn = true;
        $x('x-card-on').checked = true;
        composerDraft = d.id;
        refresh();
        $x('x-text').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      rejectBtn.addEventListener('click', async () => {
        busy(true);
        await markDraft(d.id, { status: 'rejected' });
        item.remove();
        loadDrafts();
      });
      return item;
    }

    $x('x-drafts-make').addEventListener('click', async () => {
      const status = $x('x-drafts-status');
      const token = await ownerToken();
      if (!token) { status.textContent = 'You\u2019re signed out. Log in again.'; return; }
      $x('x-drafts-make').disabled = true;
      status.textContent = 'Making drafts\u2026 They\u2019ll appear here in a minute or two (researched ones take longest).';
      try {
        await fetch('/.netlify/functions/x-drafts-background', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      } catch (err) {
        status.textContent = 'Couldn\u2019t start the drafts: ' + err.message;
        $x('x-drafts-make').disabled = false;
        return;
      }
      // Check back every 20 seconds for five minutes.
      let tries = 0;
      clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        tries += 1;
        loadDrafts();
        if (tries >= 15) { clearInterval(pollTimer); $x('x-drafts-make').disabled = false; }
      }, 20000);
    });

    refresh();
  })();

  // Starts a rebuild of the live site (the same as Publish changes,
  // without asking first).
  // A note at the foot of the screen, wherever the page is scrolled to,
  // for a change that rebuilds the site (the status line by Publish
  // changes is out of sight lower down the page).
  let toastTimer = null;
  function adminToast(text, ok) {
    let el = document.getElementById('admin-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'admin-toast';
      el.className = 'admin-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.toggle('is-error', !ok);
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-shown'), ok ? 7000 : 14000);
  }

  async function rebuildSite() {
    try {
      const { data } = await client.auth.getSession();
      const token = data && data.session ? data.session.access_token : null;
      if (!token) return { ok: false, error: 'signed out' };
      const res = await fetch('/.netlify/functions/publish', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      const body = await res.json().catch(() => ({}));
      return res.ok ? { ok: true } : { ok: false, error: body.error || 'status ' + res.status };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      // The tab goes in the address (#facts), so a refresh comes back to it.
      // The product being edited (?edit=) stays in the address only while
      // its form is on screen: otherwise a refresh on another tab would
      // reopen that product instead of the tab.
      if (window.history && window.history.replaceState) {
        const params = new URLSearchParams(window.location.search);
        const formView = document.getElementById('product-form-view');
        let search = '';
        if (tab === 'products' && formView && formView.style.display !== 'none') {
          search = editingId ? '?edit=' + encodeURIComponent(editingId) : (params.get('new') ? '?new=1' : '');
        } else if (tab === 'gallery' && params.get('editPhoto')) {
          search = '?editPhoto=' + encodeURIComponent(params.get('editPhoto'));
        }
        window.history.replaceState(window.history.state, '', window.location.pathname + search + (tab === 'products' ? '' : '#' + tab));
      }
      document.getElementById('tab-products').style.display = tab === 'products' ? 'block' : 'none';
      document.getElementById('tab-families').style.display = tab === 'families' ? 'block' : 'none';
      document.getElementById('tab-gallery').style.display = tab === 'gallery' ? 'block' : 'none';
      document.getElementById('tab-event').style.display = tab === 'event' ? 'block' : 'none';
      document.getElementById('tab-earnings').style.display = tab === 'earnings' ? 'block' : 'none';
      document.getElementById('tab-facts').style.display = tab === 'facts' ? 'block' : 'none';
      document.getElementById('tab-x').style.display = tab === 'x' ? 'block' : 'none';
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
      if (tab === 'earnings') loadEarningsAdmin();
      if (tab === 'x' && xDraftsLoader) xDraftsLoader();
      if (tab === 'facts') loadFactRotation();
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

  let productFormDirty = false;

  function showProductForm() {
    productListView.style.display = 'none';
    productFormView.style.display = 'block';
    productFormDirty = false;
    window.scrollTo(0, 0);
  }

  // Any change to the product form, so opening another product from the
  // search can ask before throwing unsaved changes away.
  productForm.addEventListener('input', () => { productFormDirty = true; });
  productForm.addEventListener('change', () => { productFormDirty = true; });
  productForm.addEventListener('click', (e) => { if (e.target.closest('button')) productFormDirty = true; });

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
    const shareUrl = params.get('share');
    if (shareUrl && /^https?:\/\//i.test(shareUrl)) {
      // From the "Tweet this" bookmark on an article.
      showProductList();
      if (window.history && window.history.replaceState) window.history.replaceState({}, '', '/admin/#x');
      window.AdminX.shareArticle({ url: shareUrl, title: params.get('title') || '', site: params.get('site') || '', via: params.get('via') || '' });
    } else if (editId) {
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
      // Back to the tab in the address, e.g. /admin/#facts after a refresh.
      const hashTab = window.location.hash.slice(1);
      const hashBtn = hashTab && document.querySelector('.admin-tab-btn[data-tab="' + hashTab.replace(/[^a-z]/g, '') + '"]');
      if (hashBtn) hashBtn.click();
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
    HomePod: '<path d="M9 17c0-6.5 5-10 11-10s11 3.5 11 10v5c0 7-5 11-11 11S9 29 9 22z"/><ellipse cx="20" cy="12" rx="6" ry="2"/>',
    iPod: '<rect x="11" y="4" width="18" height="32" rx="3"/><rect x="14" y="7.5" width="12" height="10" rx="1.2"/><circle cx="20" cy="26.5" r="5"/><circle cx="20" cy="26.5" r="1.5"/>',
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

  // Same family first, then every other product, as one product can
  // be replaced by another from a different line (iPhone 8 by the iPhone
  // SE 2nd generation, say).
  function fillProductSelect(selectEl, keepValue) {
    const currentCategory = (document.getElementById('category').value || '').trim().toLowerCase();
    const value = keepValue !== undefined ? keepValue : selectEl.value;
    selectEl.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'None';
    selectEl.appendChild(none);
    const others = cachedProducts.filter((p) => p.id !== editingId).sort((a, b) => a.name.localeCompare(b.name));
    const same = others.filter((p) => (p.category || '').trim().toLowerCase() === currentCategory);
    const rest = others.filter((p) => (p.category || '').trim().toLowerCase() !== currentCategory);
    const addGroup = (label, list, withCategory) => {
      if (!list.length) return;
      const group = document.createElement('optgroup');
      group.label = label;
      list.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.slug;
        opt.textContent = p.name + (withCategory && p.category ? ' (' + p.category + ')' : '') + (p.discontinued ? ' (discontinued)' : '');
        group.appendChild(opt);
      });
      selectEl.appendChild(group);
    };
    addGroup(currentCategory ? 'Same family' : 'Products', same, false);
    addGroup(same.length ? 'All other products' : 'All products', rest, true);
    if (value && !others.some((p) => p.slug === value)) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
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
  // Mirror of updatePreviousModelChoice: when you name the product that
  // replaced this one, offer to retire this one on that product's release
  // date, so backfilling older models does not mean editing dates by hand.
  function updateReplacedByChoice() {
    const picked = document.getElementById('replaced_by').value;
    const wrap = document.getElementById('replaced-by-choice');
    if (!wrap) return;
    const next = cachedProducts.find((p) => p.slug === picked);
    const announced = next ? successorRetireDate(next) : null;
    const when = announced || (next ? successorReleaseDate(next) : null);
    const show = !!picked && !currentDiscontinuedDate && !!when;
    wrap.style.display = show ? '' : 'none';
    if (!show) {
      const keep = document.querySelector('input[name="replaced_by_action"][value="keep"]');
      if (keep) keep.checked = true;
      return;
    }
    const hint = document.getElementById('replaced-by-choice-hint');
    if (hint) hint.textContent = announced
      ? 'Retiring it sets its discontinued date to ' + formatAdminDate(announced) +
        ', the day ' + next.name + ' was announced.'
      : 'Retiring it sets its discontinued date to ' + formatAdminDate(when) +
        ', the day ' + next.name + ' reached shops. No announced date is recorded for ' +
        next.name + ', and Apple usually drops the old model on announcement day, so check this by hand.';
  }

  function successorReleaseDate(product) {
    const dates = (product.refresh_history || []).slice().sort();
    return product.original_launch_date || dates[0] || null;
  }

  // The day the old model actually left the price list. Apple normally
  // pulls it when the successor is announced, not when the successor
  // reaches shops, so the announced date wins wherever one has been
  // recorded against that release. Returns null when none has been, so
  // the caller can say so rather than quietly use the release date.
  function successorRetireDate(product) {
    const release = successorReleaseDate(product);
    const details = product.generation_details;
    if (!release || !details || typeof details !== 'object') return null;
    const info = details[release];
    return (info && info.announced) || null;
  }

  function updatePreviousModelChoice() {
    const picked = document.getElementById('previous_model').value;
    const wrap = document.getElementById('previous-model-choice');
    const prev = cachedProducts.find((p) => p.slug === picked);
    wrap.style.display = picked && prev && !prev.discontinued ? '' : 'none';
    if (!picked) document.querySelector('input[name="previous_model_action"][value="keep"]').checked = true;
  }

  document.getElementById('previous_model').addEventListener('change', updatePreviousModelChoice);
  document.getElementById('replaced_by').addEventListener('change', updateReplacedByChoice);

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
    if (window.FactsKit && window.FactsKit.setCardProducts) window.FactsKit.setCardProducts(data);
    await loadFeaturedOrder();
    await loadNextEarnings();
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
        comingView = false;
        if (productSearchInputEl) productSearchInputEl.value = '';
        renderProductList();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      tilesEl.appendChild(btn);
    };
    // Every product with a release date still ahead, as one list.
    const comingCount = comingProducts().length;
    if (comingCount) {
      const comingTile = document.createElement('button');
      comingTile.type = 'button';
      comingTile.className = 'family-tile family-tile--coming';
      comingTile.innerHTML = '<span class="family-tile-plus" aria-hidden="true">\u23f1</span><span class="family-tile-name">Coming soon</span><span class="family-tile-count">' + comingCount + '</span>';
      comingTile.title = 'Every product with a release date still ahead';
      comingTile.addEventListener('click', openComingList);
      tilesEl.appendChild(comingTile);
    }
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

  function productCard(p, showFamilyName, showAdded) {
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
        '<span class="line-card-meta">' + escapeAttr([lifespanText(p), dates + ' date' + (dates === 1 ? '' : 's')].filter(Boolean).join(' \u00b7 ')) + '</span>' +
        (showAdded && p.created_at ? '<span class="line-card-meta">Added ' + escapeAttr(formatAdminDate(String(p.created_at).slice(0, 10))) + '</span>' : '') +
        '<span class="line-card-status' + (p.discontinued ? ' line-card-status--discontinued' : (!last ? ' line-card-status--empty' : '')) + '">' + escapeAttr(meta) + '</span>' +
        (p.discontinued && p.last_in_line ? '<span class="line-card-last">Last of the line</span>' : '') +
      '</span>';
    main.addEventListener('click', () => openProduct(p.id));

    const actions = document.createElement('div');
    actions.className = 'line-card-actions';
    const addDateBtn = document.createElement('button');
    addDateBtn.type = 'button';
    addDateBtn.className = 'admin-btn admin-btn--small admin-btn--primary';
    addDateBtn.textContent = '+ Date';
    addDateBtn.addEventListener('click', () => openProduct(p.id, { focusGeneration: true }));
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'admin-btn admin-btn--small admin-btn--ghost';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openProduct(p.id));
    actions.appendChild(addDateBtn);
    actions.appendChild(editBtn);
    // Lit up while the product is on the homepage; tapping it again
    // takes it off.
    if (!p.discontinued) {
      const featureBtn = document.createElement('button');
      featureBtn.type = 'button';
      featureBtn.setAttribute('aria-pressed', p.featured ? 'true' : 'false');
      if (p.featured) {
        featureBtn.className = 'admin-btn admin-btn--small admin-btn--featured';
        featureBtn.textContent = '\u2605 Featured';
        featureBtn.title = 'On the homepage. Tap to take it off';
        featureBtn.addEventListener('click', () => unfeature(p));
      } else {
        featureBtn.className = 'admin-btn admin-btn--small admin-btn--ghost';
        featureBtn.textContent = '\u2606 Feature';
        featureBtn.title = 'Put this in a free homepage featured slot (up to 3)';
        featureBtn.addEventListener('click', () => makeFeatured(p));
      }
      actions.appendChild(featureBtn);
    }
    // While a release date is still ahead: in or out of the homepage
    // countdown in one tap, lit up green while it counts down.
    const today = new Date().toISOString().slice(0, 10);
    if (!p.discontinued && (p.refresh_history || []).some((d) => d > today)) {
      const cdBtn = document.createElement('button');
      cdBtn.type = 'button';
      cdBtn.setAttribute('aria-pressed', p.in_countdown ? 'true' : 'false');
      if (p.in_countdown) {
        cdBtn.className = 'admin-btn admin-btn--small admin-btn--countdown is-on';
        cdBtn.textContent = '\u23f1 Counting down';
        cdBtn.title = 'In the homepage countdown. Tap to take it out';
        cdBtn.addEventListener('click', () => removeFromCountdown(p));
      } else {
        cdBtn.className = 'admin-btn admin-btn--small admin-btn--countdown';
        cdBtn.textContent = '\u23f1 Countdown';
        cdBtn.title = 'Add to the homepage countdown (up to ' + COUNTDOWN_MAX + ')';
        cdBtn.addEventListener('click', () => {
          const counting = cachedProducts.filter((x) => x.in_countdown && !x.discontinued && (x.refresh_history || []).some((d) => d > today)).length;
          if (counting >= COUNTDOWN_MAX) {
            window.alert('The countdown already has ' + COUNTDOWN_MAX + ' products. Take one out first.');
            return;
          }
          addToCountdown(p, cdBtn);
        });
      }
      actions.appendChild(cdBtn);
    }
    card.appendChild(main);
    card.appendChild(actions);
    return card;
  }

  // From a product list, or from the search while another product is
  // open: the search clears so its results don't sit above the form.
  function openProduct(id, options) {
    if (productFormView.style.display !== 'none' && productFormDirty &&
        !window.confirm('Leave this product without saving your changes?')) return;
    if (productSearchInputEl) productSearchInputEl.value = '';
    document.getElementById('search-screen').style.display = 'none';
    editProduct(id, options);
  }

  // The free featured slot being filled from the strip (1-3), if any.
  let slotPickerFor = null;
  let slotPickerQuery = '';
  let focusSlotPicker = false;

  // A picker under the strip: a search box over a list of products, and
  // picking one calls onPick. Fills a featured slot, or adds a coming
  // product to the countdown.
  function stripPicker(opts) {
    const box = document.createElement('div');
    box.className = 'slot-picker';
    const head = document.createElement('div');
    head.className = 'slot-picker-head';
    const title = document.createElement('strong');
    title.textContent = opts.title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'slot-picker-close';
    close.textContent = '\u00d7';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', opts.onClose);
    head.appendChild(title);
    head.appendChild(close);
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'admin-search-input slot-picker-search';
    input.placeholder = opts.placeholder;
    input.setAttribute('aria-label', opts.ariaLabel);
    input.autocomplete = 'off';
    input.value = opts.query || '';
    const list = document.createElement('div');
    list.className = 'slot-picker-list';
    function fill() {
      const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const matches = opts.candidates
        .filter((p) => words.every((w) => (p.name + ' ' + (p.category || '')).toLowerCase().includes(w)))
        .slice(0, words.length ? 12 : 8);
      list.innerHTML = '';
      if (!matches.length) {
        const none = document.createElement('p');
        none.className = 'slot-picker-empty';
        none.textContent = opts.empty(words.length > 0);
        list.appendChild(none);
        return;
      }
      matches.forEach((p) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'slot-picker-item';
        const icon = document.createElement('span');
        icon.className = 'slot-picker-icon';
        icon.innerHTML = iconHtml(p.category, p.icon_url, 26);
        const text = document.createElement('span');
        text.className = 'slot-picker-text';
        const name = document.createElement('span');
        name.className = 'slot-picker-name';
        name.textContent = p.name;
        const meta = document.createElement('span');
        meta.className = 'slot-picker-meta';
        meta.textContent = opts.meta(p);
        text.appendChild(name);
        text.appendChild(meta);
        item.appendChild(icon);
        item.appendChild(text);
        item.addEventListener('click', () => opts.onPick(p, item));
        list.appendChild(item);
      });
    }
    input.addEventListener('input', () => { opts.onQuery(input.value); fill(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); opts.onClose(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = list.querySelector('.slot-picker-item');
        if (first) first.click();
      }
    });
    fill();
    box.appendChild(head);
    box.appendChild(input);
    box.appendChild(list);
    // Only when just opened, so it never takes the cursor from elsewhere.
    if (focusSlotPicker) {
      focusSlotPicker = false;
      setTimeout(() => input.focus(), 0);
    }
    return box;
  }

  // Filling a featured slot: products on sale and not featured, newest
  // release first. Picking one puts it in the slot.
  function slotPicker(slot, today) {
    const newest = (p) => (p.refresh_history || []).slice().sort().pop() || '';
    return stripPicker({
      title: 'Fill slot ' + slot + (slot === 1 ? ' (the big tile)' : ''),
      placeholder: 'Search products on sale\u2026',
      ariaLabel: 'Search products to feature',
      query: slotPickerQuery,
      onQuery: (q) => { slotPickerQuery = q; },
      candidates: cachedProducts
        .filter((p) => !p.discontinued && !p.featured)
        .sort((a, b) => newest(b).localeCompare(newest(a)) || a.name.localeCompare(b.name)),
      meta: (p) => {
        const last = newest(p);
        return [p.category, last ? (last > today ? 'Coming ' : 'Released ') + formatAdminDate(last) : ''].filter(Boolean).join(' \u00b7 ');
      },
      empty: () => 'No products on sale match.',
      onClose: () => { slotPickerFor = null; renderHomepageStrip(); },
      onPick: (p, item) => fillFeaturedSlot(p, slot, item),
    });
  }

  // The homepage countdown: up to five coming products. The homepage
  // shows three, and the rest behind "+2 more coming".
  const COUNTDOWN_MAX = 5;
  let countdownPickerOpen = false;
  let countdownPickerQuery = '';

  // Adding to the countdown: products with a release date still to come
  // that aren't counting down yet, soonest first.
  function countdownPicker(today, count) {
    const due = (p) => (p.refresh_history || []).filter((d) => d > today).sort()[0] || '';
    return stripPicker({
      title: 'Add a coming product to the countdown (' + count + ' of ' + COUNTDOWN_MAX + ')',
      placeholder: 'Search coming products\u2026',
      ariaLabel: 'Search coming products',
      query: countdownPickerQuery,
      onQuery: (q) => { countdownPickerQuery = q; },
      candidates: cachedProducts
        .filter((p) => !p.discontinued && !p.in_countdown && due(p))
        .sort((a, b) => due(a).localeCompare(due(b)) || a.name.localeCompare(b.name)),
      meta: (p) => [p.category, 'Coming ' + formatAdminDate(due(p))].filter(Boolean).join(' \u00b7 '),
      empty: (searching) => (searching
        ? 'No coming products match.'
        : 'No other product has a release date still to come. Give one a future release date, then add it here.'),
      onClose: () => { countdownPickerOpen = false; renderHomepageStrip(); },
      onPick: (p, item) => addToCountdown(p, item),
    });
  }

  async function addToCountdown(product, button) {
    if (button) button.disabled = true;
    const result = await client.from('products').update({ in_countdown: true }).eq('id', product.id);
    if (result.error) {
      window.alert('Failed to add "' + product.name + '" to the countdown: ' + result.error.message);
      if (button) button.disabled = false;
      return;
    }
    countdownPickerOpen = false;
    countdownPickerQuery = '';
    // The countdown is built into the page, so it needs a rebuild to show.
    const published = await rebuildSite();
    const statusEl = document.getElementById('publish-status');
    if (statusEl) {
      statusEl.textContent = published.ok
        ? product.name + ' is in the countdown. Live in about a minute.'
        : product.name + ' is in the countdown, but the rebuild didn\u2019t start (' + published.error + '). Press Publish changes.';
      statusEl.className = 'admin-hint admin-publish-status' + (published.ok ? ' is-ok' : ' is-error');
      adminToast(statusEl.textContent, published.ok);
    }
    loadProducts();
  }

  async function fillFeaturedSlot(product, slot, button) {
    if (button) button.disabled = true;
    const result = await client.from('products').update({ featured: true }).eq('id', product.id);
    if (result.error) {
      window.alert('Failed to feature "' + product.name + '": ' + result.error.message);
      if (button) button.disabled = false;
      return;
    }
    await setFeaturedSlot(product.id, slot);
    slotPickerFor = null;
    slotPickerQuery = '';
    loadProducts();
  }

  // Top of the product lists: what the homepage shows right now, each
  // with an x to take it off, so nothing has to be hunted for.
  function renderHomepageStrip() {
    const strip = document.getElementById('homepage-strip');
    if (!strip) return;
    const searching = productSearchInputEl && productSearchInputEl.value.trim();
    const today = new Date().toISOString().slice(0, 10);
    const byId = (id) => cachedProducts.find((p) => String(p.id) === String(id));
    const counting = cachedProducts
      .map((p) => ({ p, due: (p.refresh_history || []).filter((d) => d > today).sort()[0] }))
      .filter((x) => x.p.in_countdown && x.due)
      .sort((a, b) => (a.due < b.due ? -1 : 1));
    strip.innerHTML = '';
    strip.hidden = !!searching;

    function chip(text, product, removeTitle, onRemove, onOpen, openTitle) {
      const wrap = document.createElement('span');
      wrap.className = 'homepage-chip';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'homepage-chip-name';
      open.textContent = text;
      open.title = openTitle || 'Edit ' + product.name;
      open.addEventListener('click', onOpen || (() => openProduct(product.id)));
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'homepage-chip-x';
      x.textContent = '\u00d7';
      x.title = removeTitle;
      x.setAttribute('aria-label', removeTitle);
      x.addEventListener('click', onRemove);
      wrap.appendChild(open);
      wrap.appendChild(x);
      return wrap;
    }
    function row(label, chips) {
      const r = document.createElement('div');
      r.className = 'homepage-strip-row';
      const l = document.createElement('span');
      l.className = 'homepage-strip-label';
      l.textContent = label;
      r.appendChild(l);
      chips.forEach((c) => r.appendChild(c));
      strip.appendChild(r);
    }

    const slots = featuredSlots();
    row('\u2605 Featured', slots.map((id, i) => {
      const p = id && byId(id);
      if (!p) {
        // A free slot opens a picker to fill it from here.
        const empty = document.createElement('button');
        empty.type = 'button';
        empty.className = 'homepage-chip homepage-chip--empty homepage-chip--add' + (slotPickerFor === i + 1 ? ' is-open' : '');
        empty.textContent = '+ Fill slot ' + (i + 1);
        empty.title = 'Pick a product for slot ' + (i + 1) + (i === 0 ? ' (the big tile)' : '');
        empty.setAttribute('aria-expanded', slotPickerFor === i + 1 ? 'true' : 'false');
        empty.addEventListener('click', () => {
          slotPickerFor = slotPickerFor === i + 1 ? null : i + 1;
          slotPickerQuery = '';
          countdownPickerOpen = false;
          focusSlotPicker = true;
          renderHomepageStrip();
        });
        return empty;
      }
      return chip((i + 1) + '. ' + p.name, p, 'Take ' + p.name + ' off the homepage', () => unfeature(p));
    }));
    if (slotPickerFor && !slots[slotPickerFor - 1]) strip.appendChild(slotPicker(slotPickerFor, today));
    else slotPickerFor = null;
    // The countdown: what's counting down, and while there's room (five),
    // a picker to add another coming product from here.
    const countdownChips = counting.map((x) => chip(x.p.name + ' \u00b7 ' + formatAdminDate(x.due), x.p,
      'Take ' + x.p.name + ' out of the countdown', () => removeFromCountdown(x.p)));
    if (counting.length < COUNTDOWN_MAX) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'homepage-chip homepage-chip--empty homepage-chip--add' + (countdownPickerOpen ? ' is-open' : '');
      add.textContent = '+ Add a coming product';
      add.title = 'Count down to another product (up to ' + COUNTDOWN_MAX + ')';
      add.setAttribute('aria-expanded', countdownPickerOpen ? 'true' : 'false');
      add.addEventListener('click', () => {
        countdownPickerOpen = !countdownPickerOpen;
        countdownPickerQuery = '';
        slotPickerFor = null;
        focusSlotPicker = true;
        renderHomepageStrip();
      });
      countdownChips.push(add);
    } else {
      countdownPickerOpen = false;
    }
    // Every coming product, as tiles here in the admin.
    const comingLink = document.createElement('button');
    comingLink.type = 'button';
    comingLink.className = 'homepage-chip homepage-chip--link';
    comingLink.textContent = 'All coming soon (' + comingProducts().length + ') \u2192';
    comingLink.title = 'Every product with a release date still ahead';
    comingLink.addEventListener('click', openComingList);
    countdownChips.push(comingLink);
    row('\u23f1 Countdown', countdownChips);
    if (countdownPickerOpen) strip.appendChild(countdownPicker(today, counting.length));
    // The next results: the line under the homepage countdown (or the
    // countdown itself when nothing else is coming). Hidden until the
    // earnings table exists.
    if (earningsTableReady) {
      const e = nextEarningsRow;
      if (e) {
        const name = 'Q' + e.fiscal_quarter + ' FY' + e.fiscal_year;
        row('$ Earnings', [chip(name + ' results \u00b7 ' + formatAdminDate(e.report_date) + (e.report_time ? ', ' + e.report_time : ''), null,
          'Delete ' + name, () => deleteNextEarnings(e), () => openEarningsTab(e), 'Edit ' + name)]);
      } else {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'homepage-chip homepage-chip--empty homepage-chip--add';
        add.textContent = '+ Add the next quarter';
        add.addEventListener('click', () => openEarningsTab(null));
        row('$ Earnings', [add]);
      }
    }
  }

  // Products retired on the day their replacement reached shops, when
  // that replacement's announced date is on record: Apple usually drops
  // the old model the day the new one is announced, and the "Retire it"
  // buttons used the release date until October 2026. Listed above the
  // strip with a one-tap fix, or "Leave it" to stop asking.
  const RETIRE_OK_KEY = 'admin-retire-date-ok';
  function retireDateChecks() {
    let ok = [];
    try { ok = JSON.parse(localStorage.getItem(RETIRE_OK_KEY) || '[]'); } catch (e) { ok = []; }
    return cachedProducts.map((p) => {
      if (!p.discontinued || !p.discontinued_date) return null;
      const next = (p.replaced_by && cachedProducts.find((q) => q.slug === p.replaced_by)) ||
        cachedProducts.find((q) => q.previous_model === p.slug);
      if (!next) return null;
      const release = successorReleaseDate(next);
      const announced = successorRetireDate(next);
      if (!announced || announced === release || p.discontinued_date !== release) return null;
      if (ok.indexOf(p.id + ':' + p.discontinued_date) !== -1) return null;
      return { p, next, release, announced };
    }).filter(Boolean);
  }

  function renderRetireCheck() {
    const box = document.getElementById('retire-check');
    if (!box) return;
    const searching = productSearchInputEl && productSearchInputEl.value.trim();
    const checks = searching ? [] : retireDateChecks();
    box.innerHTML = '';
    box.hidden = !checks.length;
    if (!checks.length) return;
    const head = document.createElement('p');
    head.className = 'retire-check-head';
    head.textContent = 'Discontinued dates to check: these were retired on the day their replacement reached shops, but Apple usually drops a model the day its replacement is announced.';
    box.appendChild(head);
    checks.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'retire-check-row';
      const text = document.createElement('span');
      text.className = 'retire-check-text';
      text.textContent = c.p.name + ': ' + formatAdminDate(c.release) + ' \u2192 ' + formatAdminDate(c.announced) + ' (' + c.next.name + ' announced)';
      const fix = document.createElement('button');
      fix.type = 'button';
      fix.className = 'admin-btn admin-btn--small admin-btn--primary';
      fix.textContent = 'Use ' + formatAdminDate(c.announced);
      fix.addEventListener('click', () => fixRetireDates([c]));
      const leave = document.createElement('button');
      leave.type = 'button';
      leave.className = 'admin-btn admin-btn--small admin-btn--ghost';
      leave.textContent = 'Leave it';
      leave.title = 'The release date is right for this one: stop asking';
      leave.addEventListener('click', () => {
        let ok = [];
        try { ok = JSON.parse(localStorage.getItem(RETIRE_OK_KEY) || '[]'); } catch (e) { ok = []; }
        ok.push(c.p.id + ':' + c.p.discontinued_date);
        try { localStorage.setItem(RETIRE_OK_KEY, JSON.stringify(ok)); } catch (e) { /* private mode: asks again next time */ }
        renderRetireCheck();
      });
      row.appendChild(text);
      row.appendChild(fix);
      row.appendChild(leave);
      box.appendChild(row);
    });
    if (checks.length > 1) {
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'admin-btn admin-btn--small admin-btn--primary retire-check-all';
      all.textContent = 'Fix all ' + checks.length;
      all.addEventListener('click', () => fixRetireDates(checks));
      box.appendChild(all);
    }
  }

  async function fixRetireDates(checks) {
    const list = checks.map((c) => c.p.name + ' \u2192 ' + formatAdminDate(c.announced)).join('\n');
    if (!window.confirm('Change the discontinued date of:\n\n' + list + '\n\nPress Publish changes afterwards to update the site.')) return;
    for (const c of checks) {
      const result = await client.from('products').update({ discontinued_date: c.announced }).eq('id', c.p.id);
      if (result.error) window.alert('Could not update ' + c.p.name + ': ' + result.error.message);
    }
    const statusEl = document.getElementById('publish-status');
    if (statusEl) {
      statusEl.textContent = 'Discontinued dates updated. Press Publish changes to put them on the site.';
      statusEl.className = 'admin-hint admin-publish-status is-ok';
    }
    await loadProducts();
  }

  let nextEarningsRow = null;
  let earningsTableReady = false;
  async function loadNextEarnings() {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { data, error } = await client.from('earnings').select('*').gte('report_date', today).order('report_date', { ascending: true }).limit(1);
      earningsTableReady = !error;
      nextEarningsRow = !error && data && data.length ? data[0] : null;
    } catch (err) {
      earningsTableReady = false;
      nextEarningsRow = null;
    }
  }

  // Straight to that quarter's form on the Earnings tab (a new one with
  // no row).
  function openEarningsTab(row) {
    const tabBtn = document.querySelector('.admin-tab-btn[data-tab="earnings"]');
    if (tabBtn) tabBtn.click();
    openEarningsForm(row);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteNextEarnings(row) {
    const name = 'Q' + row.fiscal_quarter + ' FY' + row.fiscal_year;
    if (!window.confirm('Delete ' + name + ' results (' + formatAdminDate(row.report_date) + ')?\n\nIt comes off the homepage and the Earnings page. The site rebuilds straight away.')) return;
    const { error } = await client.from('earnings').delete().eq('id', row.id);
    if (error) {
      window.alert('Could not delete ' + name + ': ' + error.message);
      return;
    }
    const published = await rebuildSite();
    const statusEl = document.getElementById('publish-status');
    if (statusEl) {
      statusEl.textContent = published.ok
        ? name + ' deleted. Live in about a minute.'
        : name + ' deleted, but the rebuild didn\u2019t start (' + published.error + '). Press Publish changes.';
      statusEl.className = 'admin-hint admin-publish-status' + (published.ok ? ' is-ok' : ' is-error');
    }
    await loadNextEarnings();
    renderHomepageStrip();
  }

  async function removeFromCountdown(product) {
    if (!window.confirm('Take ' + product.name + ' out of the homepage countdown?\n\nThe site rebuilds straight away, live in about a minute.')) return;
    const result = await client.from('products').update({ in_countdown: false }).eq('id', product.id);
    if (result.error) {
      window.alert('Failed to update "' + product.name + '": ' + result.error.message);
      return;
    }
    // The countdown is built into the page, so it needs a rebuild to go.
    const published = await rebuildSite();
    const statusEl = document.getElementById('publish-status');
    if (statusEl) {
      statusEl.textContent = published.ok
        ? product.name + ' is out of the countdown. Live in about a minute.'
        : product.name + ' is out of the countdown, but the rebuild didn\u2019t start (' + published.error + '). Press Publish changes.';
      statusEl.className = 'admin-hint admin-publish-status' + (published.ok ? ' is-ok' : ' is-error');
      adminToast(statusEl.textContent, published.ok);
    }
    loadProducts();
  }

  // Products with a release date still ahead, soonest first.
  function comingProducts() {
    const today = new Date().toISOString().slice(0, 10);
    const due = (p) => (p.refresh_history || []).filter((d) => d > today).sort()[0] || '';
    return cachedProducts
      .filter((p) => !p.discontinued && due(p))
      .sort((a, b) => due(a).localeCompare(due(b)) || a.name.localeCompare(b.name));
  }
  function openComingList() {
    if (productFormView.style.display !== 'none' && productFormDirty &&
        !window.confirm('Leave this product without saving your changes?')) return;
    comingView = true;
    selectedFamily = null;
    if (productSearchInputEl) productSearchInputEl.value = '';
    showProductList();
    renderProductList();
    const screen = document.getElementById('coming-screen');
    if (screen) screen.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderProductList() {
    renderRetireCheck();
    renderHomepageStrip();
    renderFamilyTiles();
    const query = productSearchInputEl ? productSearchInputEl.value.trim().toLowerCase() : '';

    // Searching jumps straight to matching products, from either list
    // screen. While a product is open the results show above its form.
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
    const comingScreen = document.getElementById('coming-screen');
    if (comingScreen) comingScreen.style.display = 'none';

    // The Coming soon list: one tile per product, soonest first.
    if (comingView && comingScreen) {
      document.getElementById('family-screen').style.display = 'none';
      document.getElementById('products-screen').style.display = 'none';
      comingScreen.style.display = '';
      const list = document.getElementById('coming-list');
      const coming = comingProducts();
      document.getElementById('coming-count').textContent = coming.length + ' product' + (coming.length === 1 ? '' : 's');
      list.innerHTML = '';
      if (!coming.length) list.textContent = 'Nothing has a release date still ahead. Add a future release date to a product and it shows here.';
      coming.forEach((p) => list.appendChild(productCard(p, true)));
      return;
    }

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
    const inFamily = sortFamilyProducts(cachedProducts
      .filter((p) => (p.category || '').trim().toLowerCase() === selectedFamily.toLowerCase()), productSort);
    document.querySelectorAll('[data-product-sort]').forEach((btn) => {
      const on = btn.getAttribute('data-product-sort') === productSort;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // A family whose last product is marked: said once, above the tiles.
    const endedNote = document.getElementById('line-ended-note');
    const last = inFamily.every((p) => p.discontinued) && inFamily.find((p) => p.last_in_line);
    if (endedNote) {
      endedNote.hidden = !last;
      endedNote.textContent = last ? 'Line ended' + (last.discontinued_date ? ' ' + formatAdminDate(last.discontinued_date) : '') + ': the ' + last.name + ' was the last ' + selectedFamily + '.' : '';
    }
    inFamily.forEach((p) => productListEl.appendChild(productCard(p, false, productSort === 'added')));

    const newCard = document.createElement('button');
    newCard.type = 'button';
    newCard.className = 'line-card line-card--new';
    newCard.innerHTML = '<span class="family-tile-plus">+</span><span>Add a product to ' + escapeAttr(selectedFamily) + '</span>';
    newCard.addEventListener('click', () => startNewProduct({ category: selectedFamily }));
    productListEl.appendChild(newCard);
  }

  const productSearchInputEl = document.getElementById('product-search-input');
  if (productSearchInputEl) productSearchInputEl.addEventListener('input', renderProductList);

  // A family's products in order: by when they came out (their life on
  // sale, newest or oldest first), when they were added here, or A to Z.
  // The choice is remembered on this device.
  const PRODUCT_SORT_KEY = 'admin-product-sort';
  let productSort = 'newest';
  try { productSort = localStorage.getItem(PRODUCT_SORT_KEY) || 'newest'; } catch (e) { /* private mode */ }
  function productFirstDate(p) {
    const dates = (p.refresh_history || []).slice().sort();
    return p.original_launch_date || dates[0] || '';
  }
  function sortFamilyProducts(list, mode) {
    const byName = (a, b) => a.name.localeCompare(b.name);
    const sorted = list.slice();
    if (mode === 'name') {
      return sorted.sort((a, b) => (!!a.discontinued !== !!b.discontinued ? (a.discontinued ? 1 : -1) : byName(a, b)));
    }
    if (mode === 'added') {
      return sorted.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || byName(a, b));
    }
    // Newest or oldest by first date; a product with no dates yet (just
    // added) goes at the top of Newest and the end of Oldest.
    return sorted.sort((a, b) => {
      const da = productFirstDate(a);
      const db = productFirstDate(b);
      if (!da || !db) return (!da && !db) ? byName(a, b) : (!da ? -1 : 1) * (mode === 'oldest' ? -1 : 1);
      const cmp = da.localeCompare(db) || (productLastDate(a) || '').localeCompare(productLastDate(b) || '');
      return (mode === 'oldest' ? cmp : -cmp) || byName(a, b);
    });
  }
  document.querySelectorAll('[data-product-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      productSort = btn.getAttribute('data-product-sort');
      try { localStorage.setItem(PRODUCT_SORT_KEY, productSort); } catch (e) { /* private mode */ }
      renderProductList();
    });
  });

  // "Oct 2001 – Apr 2003", "Since Sep 2025" or "Coming Nov 2026": how long
  // the product was (or has been) on sale, for the tiles.
  function lifespanText(p) {
    const today = new Date().toISOString().slice(0, 10);
    const first = productFirstDate(p);
    if (!first) return '';
    const month = (d) => new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    if (p.discontinued) return month(first) + (p.discontinued_date ? ' \u2013 ' + month(p.discontinued_date) : '');
    return (first > today ? 'Coming ' : 'Since ') + month(first);
  }

  // Home and New product sit either side of the pinned search, so they
  // are on screen from anywhere in the Products tab, mid-form included.
  function okToLeaveForm() {
    return productFormView.style.display === 'none' || !productFormDirty ||
      window.confirm('Leave this product without saving your changes?');
  }
  document.getElementById('admin-home-btn').addEventListener('click', () => {
    if (!okToLeaveForm()) return;
    selectedFamily = null;
    comingView = false;
    editingId = null;
    editingSlug = null;
    if (productSearchInputEl) productSearchInputEl.value = '';
    if (window.history && window.history.pushState) window.history.pushState({}, '', '/admin/');
    showProductList();
    renderProductList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('admin-new-btn').addEventListener('click', () => {
    if (!okToLeaveForm()) return;
    if (productSearchInputEl) productSearchInputEl.value = '';
    document.getElementById('search-screen').style.display = 'none';
    startNewProduct();
  });

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
    // Oldest first, so the list reads the way the product's life ran:
    // launch, then each release, then the day it was discontinued.
    dates.forEach((date) => {
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

      if (info.still_on_sale && type !== 'discontinued' && !currentDiscontinuedDate) {
        const onSaleTag = document.createElement('span');
        onSaleTag.className = 'generation-tag';
        onSaleTag.textContent = 'Still on sale';
        top.appendChild(onSaleTag);
      }
      const released = document.createElement('span');
      released.className = 'generation-date';
      released.textContent = formatAdminDate(date);
      top.appendChild(released);

      // The name is a button: one click opens this release with its Name
      // box ready to type in.
      if (type !== 'discontinued') {
        const nameText = document.createElement('button');
        nameText.type = 'button';
        nameText.className = 'generation-name-text' + ((info.name || '').trim() ? '' : ' generation-name-text--auto');
        nameText.textContent = (info.name || '').trim() || autoName;
        nameText.title = 'Rename this release';
        const pencil = document.createElement('span');
        pencil.className = 'generation-rename-icon';
        pencil.setAttribute('aria-hidden', 'true');
        pencil.textContent = ' \u270e';
        nameText.appendChild(pencil);
        nameText.addEventListener('click', () => {
          expandedGenerations.add(date);
          focusNameFor = date;
          renderRefreshHistory();
        });
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

      // Announcement and pre-order come before the release they belong to,
      // because that is the order they happened in: announced, then open
      // for pre-order, then shipped. They stay grouped with their release.
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
      li.appendChild(top);

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
          nameLabel.textContent = 'Name (blank uses the automatic one)';
          const nameInput = document.createElement('input');
          nameInput.type = 'text';
          nameInput.value = info.name || '';
          nameInput.placeholder = autoName;
          nameInput.addEventListener('input', () => { detailFor(date).name = nameInput.value; });
          nameLabel.appendChild(nameInput);
          if (focusNameFor === date) {
            focusNameFor = null;
            setTimeout(() => { nameInput.focus(); nameInput.select(); }, 0);
          }
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

          const preLabel = document.createElement('label');
          preLabel.textContent = 'Pre-orders opened';
          const preInput = document.createElement('input');
          preInput.type = 'date';
          preInput.value = /^\d{4}-\d{2}-\d{2}$/.test(info.preorder || '') ? info.preorder : '';
          preInput.addEventListener('change', () => { detailFor(date).preorder = preInput.value || null; });
          preLabel.appendChild(preInput);
          if (info.preorder && !/^\d{4}-\d{2}-\d{2}$/.test(info.preorder)) {
            const note = document.createElement('span');
            note.className = 'admin-hint';
            note.textContent = 'Currently ' + formatAdminDate(info.preorder) + '.';
            preLabel.appendChild(note);
          }
          fields.appendChild(preLabel);

          // Only an older release can be "still on sale": the newest one
          // always is (until the product is discontinued).
          const newestRelease = releaseDates[releaseDates.length - 1];
          if (date !== newestRelease && !currentDiscontinuedDate) {
            const onSale = document.createElement('label');
            onSale.className = 'checkbox-label';
            const onSaleBox = document.createElement('input');
            onSaleBox.type = 'checkbox';
            onSaleBox.checked = !!info.still_on_sale;
            onSaleBox.addEventListener('change', () => {
              detailFor(date).still_on_sale = onSaleBox.checked;
              renderRefreshHistory();
            });
            onSale.appendChild(onSaleBox);
            onSale.appendChild(document.createTextNode(' Still on sale alongside the newer release'));
            fields.appendChild(onSale);
          }

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
      const field = type === 'preorder' ? 'preorder' : 'announced';
      opt.textContent = formatAdminDate(d) + ((info.name || '').trim() ? ' \u2013 ' + info.name.trim() : '') + (info[field] ? ' (already has one)' : '');
      select.appendChild(opt);
    });
    if (targetChosenByHand && keep && Array.from(select.options).some((o) => o.value === keep)) select.value = keep;
    else pickTargetForDate();
  }

  // An announcement or pre-order belongs to the first release on or after
  // its date (they come before the release). Picked automatically as the
  // date is typed, unless the release has been chosen by hand.
  let targetChosenByHand = false;
  function releaseForDate(value) {
    const releases = currentRefreshHistory.filter((d) => d !== currentDiscontinuedDate).slice().sort();
    if (!releases.length) return null;
    if (!value) return releases[releases.length - 1];
    return releases.find((d) => d >= value) || releases[releases.length - 1];
  }
  function pickTargetForDate() {
    if (targetChosenByHand) return;
    const select = document.getElementById('announced_target');
    const best = releaseForDate(getDatePrecisionValue('new_refresh_date'));
    if (best && Array.from(select.options).some((o) => o.value === best)) select.value = best;
  }
  document.getElementById('announced_target').addEventListener('change', () => { targetChosenByHand = true; });
  ['input', 'change'].forEach((evt) => document.getElementById('new_refresh_date_field').addEventListener(evt, () => setTimeout(pickTargetForDate, 0)));

  document.querySelectorAll('input[name="entry_type"]').forEach((radio) => {
    radio.addEventListener('change', updateAddPanelForType);
  });

  function selectedEntryType() {
    const checked = document.querySelector('input[name="entry_type"]:checked');
    return checked ? checked.value : 'release';
  }

  // "The last iPod: Apple ended the iPod line with this one"
  function updateLastInLineText() {
    const el = document.getElementById('last-in-line-text');
    if (!el) return;
    const family = canonicalFamily(document.getElementById('category').value);
    el.textContent = family
      ? 'The last ' + family + ': Apple ended the ' + family + ' line with this one'
      : 'The last of its family: Apple ended the line with this one';
  }
  document.getElementById('category').addEventListener('input', updateLastInLineText);

  // Status is simply read off the dates, so there is no separate switch
  // to keep in step with them.
  function updateStatusReadout() {
    const readout = document.getElementById('status-readout');
    const isDiscontinued = !!currentDiscontinuedDate;
    document.getElementById('discontinued').checked = isDiscontinued;
    document.getElementById('discontinued-fields').style.display = isDiscontinued ? '' : 'none';
    updateLastInLineText();
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

  // Turns the selected words into a link; with nothing selected, the
  // address itself goes in as the link text, so a link is never silently
  // lost.
  function insertLink(editor, url) {
    editor.focus();
    const sel = window.getSelection();
    const inside = sel && sel.rangeCount && editor.contains(sel.anchorNode);
    if (inside && !sel.isCollapsed) {
      document.execCommand('createLink', false, url);
      return;
    }
    if (!inside) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const a = document.createElement('a');
    a.href = url;
    a.textContent = url;
    document.execCommand('insertHTML', false, a.outerHTML + '&nbsp;');
  }

  const richtextLinkBtn = document.getElementById('richtext-link-btn');
  richtextLinkBtn.addEventListener('mousedown', (e) => e.preventDefault());
  richtextLinkBtn.addEventListener('click', () => {
    const url = window.prompt('Link URL (include https://)');
    if (!url) return;
    insertLink(richTextEditor, url.trim());
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

  // After adding a date the box keeps it, since the next one (pre-order,
  // then release) is usually a few days later: just adjust the day.
  // The date left in the box after adding one, so saving doesn't mistake
  // it for a new date that still needs adding.
  let carriedDate = null;
  function resetGenerationPanel(keepDate) {
    targetChosenByHand = false;
    carriedDate = keepDate || null;
    setDatePrecisionValue('new_refresh_date', keepDate || null);
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
      resetGenerationPanel(value);
      renderRefreshHistory();
      updateStatusReadout();
      return;
    }
    if (type === 'announced' || type === 'preorder') {
      const field = type === 'preorder' ? 'preorder' : 'announced';
      if (currentRefreshHistory.length === 0) {
        if (field === 'preorder') pendingPreorderDate = value; else pendingAnnouncedDate = value;
        resetGenerationPanel(value);
        renderRefreshHistory();
        return;
      }
      if (!targetChosenByHand) pickTargetForDate();
      const target = document.getElementById('announced_target').value;
      if (!target) {
        errorEl.textContent = 'Pick which release this belongs to.';
        return;
      }
      detailFor(target)[field] = value;
      resetGenerationPanel(value);
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
    }
    if (pendingPreorderDate) {
      detailFor(value).preorder = pendingPreorderDate;
      pendingPreorderDate = null;
    }
    resetGenerationPanel(value);
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

  // One video per product: an upload, or a link typed in the box (the
  // box is left empty for an upload).
  const videoLinkEl = document.getElementById('video_link');
  const isUploadedVideo = (url) => /\/storage\/v1\/object\/public\//.test(url || '');
  function renderVideoStatus() {
    videoStatusEl.innerHTML = '';
    if (videoLinkEl && document.activeElement !== videoLinkEl) videoLinkEl.value = currentVideoUrl && !isUploadedVideo(currentVideoUrl) ? currentVideoUrl : '';
    if (!currentVideoUrl) {
      videoStatusEl.textContent = 'No video yet.';
      return;
    }
    const info = window.FactsKit.videoInfo(currentVideoUrl);
    const span = document.createElement('span');
    span.textContent = !info
      ? 'That doesn\u2019t look like a link yet: it should start with https:// '
      : isUploadedVideo(currentVideoUrl)
      ? 'Uploaded video attached. '
      : info.kind === 'embed'
      ? info.host + ' video: plays on the product page. '
      : info.kind === 'file'
      ? 'Video file: plays on the product page. '
      : 'Link to a video on ' + info.host + ': shows as \u201cWatch on ' + info.host + '\u201d. ';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      currentVideoUrl = null;
      if (videoLinkEl) videoLinkEl.value = '';
      renderVideoStatus();
    });
    videoStatusEl.appendChild(span);
    videoStatusEl.appendChild(removeBtn);
  }

  function clearFormErrors() {
    ['family-error', 'name-error', 'discontinued-error', 'generation-add-error', 'video-error'].forEach((id) => {
      document.getElementById(id).textContent = '';
    });
  }

  function editProduct(id, options) {
    // By id, or by slug (the site's "Edit this product" link).
    const p = cachedProducts.find((x) => x.id === id) || cachedProducts.find((x) => x.slug === id);
    if (!p) return;
    id = p.id;
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
    document.getElementById('specs_url_unavailable').checked = !!p.specs_url_unavailable;
    document.getElementById('rumor_note_editor').innerHTML = p.rumor_note || '';
    updateFeaturedSlotOptions(p.id);
    document.getElementById('in_countdown').checked = !!p.in_countdown;
    loadedInCountdown = !!p.in_countdown;
    document.getElementById('did_you_know_editor').innerHTML = p.did_you_know || '';
    updateDidYouKnowCount();
    loadedFactText = (document.getElementById('did_you_know_editor').textContent || '').trim();
    factDateTouched = false;
    document.getElementById('did_you_know_date').value = p.did_you_know_date || '';
    document.getElementById('did-you-know-date-note').hidden = factDateColumnExists();
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
    const rk = document.querySelector('input[name="replaced_by_action"][value="keep"]');
    if (rk) rk.checked = true;
    updatePreviousModelChoice();
    document.getElementById('discontinued_reason').value = p.discontinued_reason || '';
    document.getElementById('last_in_line').checked = !!p.last_in_line;
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
      const dateTextInput = document.getElementById('new_refresh_date_text');
      if (dateTextInput) dateTextInput.focus({ preventScroll: true });
    }
  }

  function startNewProduct(options) {
    editingId = null;
    editingSlug = null;
    loadedInCountdown = false;
    pendingAnnouncedDate = null;
    pendingPreorderDate = null;
    clearFormErrors();
    const advancedSectionNew = document.querySelector('.admin-advanced');
    if (advancedSectionNew) advancedSectionNew.open = false;
    if (window.history && window.history.pushState) {
      window.history.pushState({}, '', '/admin/?new=1');
    }
    productForm.reset();
    updateFeaturedSlotOptions(null);
    const wantsNewFamily = !!(options && options.newFamily);
    const preset = wantsNewFamily ? '' : (options && options.category ? canonicalFamily(options.category) : (selectedFamily || ''));
    document.getElementById('category').value = preset;
    document.getElementById('new-family-wrap').style.display = wantsNewFamily ? '' : 'none';
    document.getElementById('rumor_note_editor').innerHTML = '';
    document.getElementById('did_you_know_editor').innerHTML = '';
    updateDidYouKnowCount();
    loadedFactText = '';
    factDateTouched = false;
    document.getElementById('did_you_know_date').value = '';
    document.getElementById('did-you-know-date-note').hidden = factDateColumnExists();
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
    const rk = document.querySelector('input[name="replaced_by_action"][value="keep"]');
    if (rk) rk.checked = true;
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
  document.getElementById('coming-back-btn').addEventListener('click', () => {
    comingView = false;
    renderProductList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
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

  // --- Homepage featured products: up to 3, in slot order. The order
  // is kept as a list of product ids in the site_content row 'featured';
  // each product's own "featured" flag says whether it is in a slot.
  let featuredOrder = [];
  async function loadFeaturedOrder() {
    try {
      const { data } = await client.from('site_content').select('body').eq('id', 'featured').maybeSingle();
      const ids = JSON.parse((data && data.body) || '[]');
      featuredOrder = Array.isArray(ids) ? ids : [];
    } catch (err) {
      featuredOrder = [];
    }
  }

  // Which product id is in each of the 3 slots (null when empty).
  function featuredSlots() {
    const featured = cachedProducts.filter((p) => p.featured && !p.discontinued);
    const isFeatured = (id) => featured.some((p) => String(p.id) === String(id));
    const slots = [0, 1, 2].map((i) => (featuredOrder[i] != null && isFeatured(featuredOrder[i]) ? String(featuredOrder[i]) : null));
    featured
      .filter((p) => !slots.includes(String(p.id)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => { const free = slots.indexOf(null); if (free > -1) slots[free] = String(p.id); });
    return slots;
  }

  function productNameById(id) {
    const p = cachedProducts.find((x) => String(x.id) === String(id));
    return p ? p.name : '';
  }

  // Shows who is in each slot, so it is clear what picking one replaces.
  function updateFeaturedSlotOptions(currentId) {
    const select = document.getElementById('featured_slot');
    if (!select) return;
    const slots = featuredSlots();
    [1, 2, 3].forEach((n) => {
      const occupant = slots[n - 1];
      const base = n === 1 ? 'Slot 1 (big tile)' : 'Slot ' + n;
      select.options[n].textContent = occupant && occupant !== String(currentId) ? base + ' \u2014 now ' + productNameById(occupant) : base;
    });
    const mine = currentId != null ? slots.indexOf(String(currentId)) : -1;
    select.value = String(mine + 1);
  }

  // Puts a product in a slot (0 takes it out), un-featuring whatever was
  // there, and saves the order.
  async function setFeaturedSlot(productId, slot) {
    const id = String(productId);
    const slots = featuredSlots().map((s) => (s === id ? null : s));
    if (slot > 0) {
      const displaced = slots[slot - 1];
      if (displaced) {
        const clear = await client.from('products').update({ featured: false }).eq('id', displaced);
        if (clear.error) window.alert('Could not un-feature ' + productNameById(displaced) + ': ' + clear.error.message);
      }
      slots[slot - 1] = id;
    }
    const result = await client.from('site_content').upsert({ id: 'featured', body: JSON.stringify(slots) });
    if (result.error) {
      window.alert('The featured order could not be saved: ' + result.error.message);
      return;
    }
    featuredOrder = slots;
  }

  // The "Feature" button in the list: the first free slot, or (when all
  // three are taken) slot 3 after asking.
  async function makeFeatured(product) {
    const slots = featuredSlots();
    let slot = slots.indexOf(null) + 1;
    if (!slot) {
      if (!window.confirm('All 3 featured slots are taken. Put ' + product.name + ' in slot 3 instead of ' + productNameById(slots[2]) + '?')) return;
      slot = 3;
    }
    const result = await client.from('products').update({ featured: true }).eq('id', product.id);
    if (result.error) {
      window.alert('Failed to feature "' + product.name + '": ' + result.error.message);
      return;
    }
    await setFeaturedSlot(product.id, slot);
    loadProducts();
  }

  // The lit "Featured" button in the list: off the homepage, slot freed.
  async function unfeature(product) {
    if (!window.confirm('Take ' + product.name + ' off the homepage?')) return;
    const result = await client.from('products').update({ featured: false }).eq('id', product.id);
    if (result.error) {
      window.alert('Failed to un-feature "' + product.name + '": ' + result.error.message);
      return;
    }
    await setFeaturedSlot(product.id, 0);
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
  // Saves the slot picked in the form. A new product's id is only known
  // after it has been inserted, so it is looked up by its address.
  async function saveFeaturedSlot(slug) {
    const slot = parseInt(document.getElementById('featured_slot').value, 10) || 0;
    let id = editingId;
    if (!id) {
      if (!slot) return;
      const { data } = await client.from('products').select('id').eq('slug', slug).maybeSingle();
      if (!data) return;
      id = data.id;
    }
    const current = featuredSlots().indexOf(String(id)) + 1;
    if (current === slot) return;
    await setFeaturedSlot(id, slot);
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
    const cached = cachedProducts.find((p) => p.slug === payload.previous_model);
    if (!cached) return;
    // This writes the other product's row directly, where the form cannot
    // show what changed, so a date already on the record is left alone:
    // it may well have been corrected by hand. Read afresh rather than
    // from this tab's copy, which can predate a fix made elsewhere (on
    // the phone, or in another tab).
    const fresh = await client.from('products').select('id, discontinued, discontinued_date, replaced_by').eq('id', cached.id).maybeSingle();
    if (fresh.error || !fresh.data) return;
    const prev = fresh.data;
    if (prev.discontinued && prev.discontinued_date) return;
    const newLaunchDate = successorRetireDate(payload) ||
      payload.original_launch_date || (payload.refresh_history && payload.refresh_history[0]) || null;
    const result = await client.from('products').update({
      discontinued: true,
      replaced_by: prev.replaced_by || payload.slug,
      discontinued_date: prev.discontinued_date || newLaunchDate,
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
      const stillOnSale = !!info.still_on_sale;
      // preorder was missing here, so every pre-order date typed in was
      // thrown away on save without a word.
      if (name || announced || preorder || stillOnSale) {
        out[date] = { name: name || null, announced, preorder };
        if (stillOnSale) out[date].still_on_sale = true;
      }
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
      // If a successor was named and "Retire it" chosen, retire this product
      // on the day that successor arrived.
      const retireEl = document.querySelector('input[name="replaced_by_action"]:checked');
      const successorSlug = document.getElementById('replaced_by').value;
      if (!currentDiscontinuedDate && successorSlug && retireEl && retireEl.value === 'discontinue') {
        const next = cachedProducts.find((p) => p.slug === successorSlug);
        const when = next ? (successorRetireDate(next) || successorReleaseDate(next)) : null;
        if (when) currentDiscontinuedDate = when;
      }
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
      // A date still sitting in the "Add a date" box only blocks saving if
      // it's new: not the one carried over from the last add, and not
      // already recorded as a release, announcement or pre-order.
      const pendingGenerationDate = getDatePrecisionValue('new_refresh_date');
      const alreadyRecorded = (d) => currentRefreshHistory.indexOf(d) !== -1 || d === currentDiscontinuedDate ||
        Object.values(currentGenerationDetails).some((info) => info && (info.announced === d || info.preorder === d)) ||
        d === pendingAnnouncedDate || d === pendingPreorderDate;
      if (pendingGenerationDate && pendingGenerationDate !== carriedDate && !alreadyRecorded(pendingGenerationDate)) {
        document.getElementById('generation-add-error').textContent = 'You picked a date but haven\u2019t added it yet. Tap "+ Add", or clear the date.';
        firstError = firstError || document.getElementById('step-generations');
      }
      // Never drop a video link without saying so.
      if (currentVideoUrl && !window.FactsKit.videoInfo(currentVideoUrl)) {
        document.getElementById('video-error').textContent = 'That video link doesn\u2019t look right. Paste the full address from YouTube, Vimeo or the video\u2019s page, or clear the box.';
        firstError = firstError || document.getElementById('step-extras');
      }
      if (firstError) {
        firstError.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }

      // A discontinued date of today or later is almost always a slip (a
      // date picker left on today), and it shows straight away on the
      // site, so check before saving a new one.
      const todayStr = new Date().toISOString().slice(0, 10);
      const storedProduct = editingId ? cachedProducts.find((p) => p.id === editingId) : null;
      const storedDiscontinued = storedProduct && storedProduct.discontinued ? storedProduct.discontinued_date : null;
      if (discontinuedDate && discontinuedDate >= todayStr && discontinuedDate !== storedDiscontinued) {
        const ok = window.confirm('The discontinued date is ' + (discontinuedDate === todayStr ? 'today' : 'in the future') + ' (' + formatAdminDate(discontinuedDate) + ').\n\nIs that right? Press Cancel to change it.');
        if (!ok) {
          document.getElementById('step-generations').scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
      }
      const prevAction = document.querySelector('input[name="previous_model_action"]:checked');
      const prevSlug = document.getElementById('previous_model').value;
      if (prevSlug && prevAction && prevAction.value === 'discontinue') {
        const prev = cachedProducts.find((p) => p.slug === prevSlug);
        const firstRelease = currentOriginalLaunchDate || currentRefreshHistory.slice().sort()[0] || null;
        const firstInfo = firstRelease ? currentGenerationDetails[firstRelease] : null;
        const prevWhen = (firstInfo && firstInfo.announced) || firstRelease;
        if (prev && !prev.discontinued && prevWhen && prevWhen >= todayStr) {
          const ok = window.confirm('This marks the ' + prev.name + ' discontinued on ' + (prevWhen === todayStr ? 'today' : formatAdminDate(prevWhen) + ', which is in the future') + '.\n\nIs that right? Press Cancel to change it.');
          if (!ok) return;
        }
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
        featured: document.getElementById('featured_slot').value !== '0',
        in_countdown: document.getElementById('in_countdown').checked,
        did_you_know: (() => { const h = document.getElementById('did_you_know_editor').innerHTML.trim(); return h && h !== '<br>' ? h : null; })(),
        days_basis: document.querySelector('input[name="days_basis"]:checked').value,
        is_new_launch: document.getElementById('is_new_launch').checked,
        previous_model: document.getElementById('previous_model').value || null,
        discontinued: isDiscontinued,
        discontinued_date: isDiscontinued ? discontinuedDate : null,
        // Was only saved for discontinued products, so setting a successor
        // on a product still on sale was silently thrown away.
        replaced_by: document.getElementById('replaced_by').value || null,
        discontinued_reason: isDiscontinued ? (document.getElementById('discontinued_reason').value.trim() || null) : null,
        // A half-typed link that isn't one yet isn't saved.
        video_url: window.FactsKit.videoInfo(currentVideoUrl) ? currentVideoUrl : null,
      };
      // Sent when ticked, or once the column exists, so saving still works
      // before supabase-schema-update-32.sql has been run.
      const specsGone = document.getElementById('specs_url_unavailable').checked;
      if (specsGone || cachedProducts.some((p) => 'specs_url_unavailable' in p)) payload.specs_url_unavailable = specsGone;
      // Likewise before supabase-schema-update-33.sql. Only a discontinued
      // product can be the last of its line.
      const lastInLine = isDiscontinued && document.getElementById('last_in_line').checked;
      const lineColumn = cachedProducts.some((p) => 'last_in_line' in p);
      if (lastInLine || lineColumn) payload.last_in_line = lastInLine;
      if (factDateColumnExists()) {
        const factDate = document.getElementById('did_you_know_date').value || null;
        payload.did_you_know_date = payload.did_you_know ? (factDate || todayIso()) : null;
      }

      // The saved row is asked back, so a save the database quietly
      // ignored (no error, nothing changed, e.g. a lapsed login) is caught
      // here rather than looking like it worked.
      const saveRow = (body) => (editingId
        ? client.from('products').update(body).eq('id', editingId).select('id, refresh_history')
        : client.from('products').insert(body).select('id, refresh_history'));
      let result = await saveRow(payload);
      // The "last of the line" column missing (supabase-schema-update-33.sql
      // not run, or Supabase not caught up with it yet) must never cost the
      // rest of the product: save without it, then say so.
      let lineNotSaved = false;
      if (result.error && /last_in_line/.test(result.error.message || '') && 'last_in_line' in payload) {
        console.error('Save failed on last_in_line, saving without it:', result.error);
        lineNotSaved = payload.last_in_line;
        delete payload.last_in_line;
        result = await saveRow(payload);
      }

      if (result.error) {
        console.error('Save failed:', result.error);
        const missingColumns = /generation_details|icon_url|specs_url|press_release_url|in_countdown|did_you_know/.test(result.error.message || '');
        window.alert(missingColumns
          ? 'Save failed because the database hasn\u2019t been updated yet. Run the latest supabase-schema-update SQL file in the Supabase SQL editor, then save again.\n\n(' + result.error.message + ')'
          : 'Save failed: ' + result.error.message);
        return;
      }
      if (!result.data || !result.data.length) {
        window.alert('Nothing was saved: the database didn\u2019t accept the change, and no error came back. This usually means the login has lapsed. Log out and in again, then save again (your changes are still in the form).');
        return;
      }
      if (lineNotSaved) {
        window.alert('Saved, dates and all, except the \u201clast of the line\u201d tick: the database doesn\u2019t have that column yet.\n\nIn the Supabase SQL editor, run:\n\nalter table products add column if not exists last_in_line boolean not null default false;\nnotify pgrst, \'reload schema\';\n\nThen tick it and save again.');
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
      // One last product per family: marking this one unmarks any other.
      if (lastInLine && !lineNotSaved) {
        const others = cachedProducts.filter((p) => p.last_in_line && p.slug !== slug &&
          (p.category || '').trim().toLowerCase() === category.trim().toLowerCase());
        for (const other of others) {
          const res = await client.from('products').update({ last_in_line: false }).eq('id', other.id);
          if (res.error) console.error('Could not unmark ' + other.name + ':', res.error);
        }
      }
      await autoDiscontinuePreviousModel(payload, document.querySelector('input[name="previous_model_action"]:checked').value === 'discontinue');
      const linked = await mirrorRelationships({ ...payload, slug });
      if (linked.length) {
        window.alert('Also updated ' + linked.join(' and ') + ' so the two link to each other. Publish when you are ready for that to show on the site.');
      }
      await saveFeaturedSlot(slug);
      // The countdown is built into the homepage: a changed tick rebuilds
      // the site now, so it shows within a minute (rather than waiting on
      // the database's own change hook, which can start a build before
      // the save lands).
      if (!!payload.in_countdown !== loadedInCountdown) {
        const published = await rebuildSite();
        const statusEl = document.getElementById('publish-status');
        if (statusEl) {
          const name = payload.name || 'This product';
          statusEl.textContent = published.ok
            ? name + (payload.in_countdown ? ' is in' : ' is out of') + ' the homepage countdown. Live in about a minute.'
            : name + '\u2019s countdown tick is saved, but the rebuild didn\u2019t start (' + published.error + '). Press Publish changes.';
          statusEl.className = 'admin-hint admin-publish-status' + (published.ok ? ' is-ok' : ' is-error');
          adminToast(statusEl.textContent, published.ok);
        }
      }
      loadedInCountdown = false;
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

  // A gallery photo's 800px copy, or the photo itself if there isn't one.
  function smallPhoto(img, url) {
    const small = FactsKit.sizedPhotoUrl(url, 800);
    img.src = small;
    if (small !== url) img.onerror = () => { img.onerror = null; img.src = url; };
  }

  // --- Quick-loading copies ---
  // Photos added before October 2026 have no smaller copies, so pages load
  // them at full size. Checked once per visit; the button makes the copies.
  const speedBox = document.getElementById('gallery-speed');
  const speedText = document.getElementById('gallery-speed-text');
  const speedBtn = document.getElementById('gallery-speed-btn');
  let photosWithoutCopies = null;
  let copiesRunning = false;

  async function checkPhotoCopies(albums) {
    if (photosWithoutCopies !== null || copiesRunning) return;
    photosWithoutCopies = [];
    try {
      photosWithoutCopies = await FactsKit.photosMissingCopies(albums);
    } catch (err) {
      console.error('Checking photo copies failed:', err);
      return;
    }
    if (!photosWithoutCopies.length) return;
    const n = photosWithoutCopies.length;
    speedText.textContent = n + (n === 1 ? ' photo loads' : ' photos load') + ' slowly on the site because ' + (n === 1 ? 'it has' : 'they have') + ' no quick-loading copies yet. Making them takes a few seconds a photo; keep this page open until it finishes.';
    speedBtn.hidden = false;
    speedBox.hidden = false;
  }

  speedBtn.addEventListener('click', async () => {
    if (copiesRunning || !photosWithoutCopies || !photosWithoutCopies.length) return;
    copiesRunning = true;
    speedBtn.hidden = true;
    const todo = photosWithoutCopies.slice();
    const failed = [];
    for (let i = 0; i < todo.length; i++) {
      speedText.textContent = 'Making quick-loading copies: ' + (i + 1) + ' of ' + todo.length + '…';
      try {
        await FactsKit.makePhotoCopies(client, todo[i]);
      } catch (err) {
        console.error('Copies failed for', todo[i], err);
        failed.push(todo[i]);
      }
    }
    copiesRunning = false;
    photosWithoutCopies = failed;
    if (failed.length) {
      speedText.textContent = (todo.length - failed.length) + ' done, but ' + failed.length + ' couldn’t be copied. Try again, and if it keeps failing, tell Claude.';
      speedBtn.hidden = false;
    } else {
      speedText.textContent = 'Done: every gallery photo now has quick-loading copies.';
    }
  });

  async function loadGalleryPhotos() {
    const { data, error } = await client.from('gallery_photos').select('*').order('created_at', { ascending: false });
    galleryListEl.innerHTML = '';
    if (error) {
      galleryListEl.textContent = 'Could not load gallery photos: ' + error.message + ' (has supabase-schema-update-9.sql been run?)';
      return;
    }
    cachedGalleryPhotos = data;
    updateGalleryLocationCountryOptions();
    checkPhotoCopies(data);
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
        smallPhoto(img, thumbUrl);
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
      smallPhoto(img, url);
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
        // Resized to at most 2560px with location data removed, plus the
        // smaller copies the gallery loads (as on the phone upload page).
        const url = await FactsKit.uploadGalleryPhoto(client, file);
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
    document.getElementById('gallery-story').value = photo.story || '';
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
      // Sent when written, or once the column exists, so saving still
      // works before supabase-schema-update-36.sql has been run.
      const story = document.getElementById('gallery-story').value.trim();
      if (story || cachedGalleryPhotos.some((p) => 'story' in p)) payload.story = story || null;
      const result = editingGalleryId
        ? await client.from('gallery_photos').update(payload).eq('id', editingGalleryId)
        : await client.from('gallery_photos').insert(payload);
      if (result.error) {
        window.alert(/story/.test(result.error.message || '')
          ? 'Save failed: run supabase-schema-update-36.sql in the Supabase SQL editor first, so albums can have a story.'
          : 'Save failed: ' + result.error.message);
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

  // A link pasted without its https:// ("youtube.com/watch?v=…",
  // "www.youtube.com/…") was saved as nothing at all; it gets one.
  function fullLink(value) {
    const t = String(value || '').trim();
    if (!t || /^https?:\/\//i.test(t)) return t;
    if (/^\/\//.test(t)) return 'https:' + t;
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(?:[/?#]|$)/i.test(t)) return 'https://' + t;
    return t;
  }
  if (videoLinkEl) {
    videoLinkEl.addEventListener('input', () => {
      currentVideoUrl = fullLink(videoLinkEl.value) || null;
      document.getElementById('video-error').textContent = '';
      renderVideoStatus();
    });
    videoLinkEl.addEventListener('blur', () => {
      if (currentVideoUrl && !isUploadedVideo(currentVideoUrl)) videoLinkEl.value = currentVideoUrl;
    });
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
      const phase = window.FactsKit.eventPhase(event, Date.now());
      statusTd.textContent = phase === 'upcoming' ? 'Upcoming' : phase === 'live' ? 'Live now' : phase === 'recap' ? 'Just held (on the homepage)' : event.event_date ? 'Past' : '\u2014';

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
      // A ready-made post with the event's own card, in the X posts tab.
      const xBtn = document.createElement('button');
      xBtn.type = 'button';
      xBtn.textContent = 'Post to X';
      // Read afresh, so products added since this list loaded (say, from
      // the phone app) are in the post.
      xBtn.addEventListener('click', async () => {
        const { data: latest } = await client.from('apple_events').select('*').eq('id', event.id).maybeSingle();
        window.AdminX.use(window.FactsKit.eventPostIdea(latest || event, { origin: window.location.origin }));
      });
      actionsTd.appendChild(xBtn);
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
      // Typed straight into, so a misspelt name can be put right
      // without removing it and adding it again.
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'event-product-name';
      nameInput.value = product.name;
      nameInput.setAttribute('aria-label', 'Product name');
      nameInput.autocomplete = 'off';
      nameInput.addEventListener('input', () => {
        currentEventProducts[i].name = nameInput.value;
      });
      // Enter finishes the name rather than saving the whole event.
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); }
      });
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        currentEventProducts.splice(i, 1);
        renderEventProducts();
      });
      li.appendChild(checkbox);
      li.appendChild(nameInput);
      li.appendChild(removeBtn);
      eventProductsListEl.appendChild(li);
    });
  }

  document.getElementById('add-event-product-btn').addEventListener('click', () => {
    const input = document.getElementById('new-event-product');
    const value = input.value.trim();
    if (!value) return;
    if (!currentEventProducts.some((p) => p.name.trim().toLowerCase() === value.toLowerCase())) {
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
    document.getElementById('event_summary_editor').innerHTML = window.FactsKit.summaryToEditorHtml(event.summary);
    updateEventSummaryCount();
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
    document.getElementById('event_summary_editor').innerHTML = '';
    updateEventSummaryCount();
    document.getElementById('event-form-title').textContent = 'Add event';
    showEventForm();
  }

  // A running count, since a summary reads best at a line or two.
  function updateEventSummaryCount() {
    document.getElementById('event-summary-count').textContent = window.FactsKit.summaryLengthNote(document.getElementById('event_summary_editor'));
  }
  document.getElementById('event_summary_editor').addEventListener('input', updateEventSummaryCount);
  document.getElementById('event-summary-clear-all-btn').addEventListener('click', () => {
    const editor = document.getElementById('event_summary_editor');
    if (!editor.textContent.trim()) return;
    if (!window.confirm('Remove all formatting from this summary? This keeps the text but clears bold, italic, and links.')) return;
    const escapeText = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    editor.innerHTML = extractParagraphs(editor).map((para) => '<p>' + escapeText(para) + '</p>').join('');
    updateEventSummaryCount();
  });

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
    const published = await rebuildSite();
    eventStatus(published.ok ? 'Deleted. The site updates in about a minute.' : 'Deleted, but the site rebuild didn\u2019t start (' + published.error + '). Press Publish changes.', !published.ok);
  }

  function eventStatus(text, isError) {
    const el = document.getElementById('event-status');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? 'var(--overdue-text)' : '';
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
      // A name cleared out while editing counts as removed.
      announced_products: currentEventProducts
        .map((p) => ({ ...p, name: p.name.trim() }))
        .filter((p) => p.name),
    };
    // Sent when there is one, or once the column exists, so saving still
    // works before supabase-schema-update-31.sql has been run.
    const summaryText = window.FactsKit.summaryFromEditor(document.getElementById('event_summary_editor'));
    const editingEvent = editingEventId ? cachedEvents.find((ev) => ev.id === editingEventId) : null;
    if (summaryText || (editingEvent && 'summary' in editingEvent)) payload.summary = summaryText || null;
    if (!payload.heading || !payload.image_url || !payload.event_date) {
      window.alert('Title, image, and event date are all needed.');
      return;
    }
    try {
      const result = editingEventId
        ? await client.from('apple_events').update(payload).eq('id', editingEventId)
        : await client.from('apple_events').insert(payload);
      if (result.error) {
        window.alert(/summary/.test(result.error.message || '')
          ? 'Save failed: run supabase-schema-update-31.sql in Supabase first, so events can have a summary.'
          : /featured/.test(result.error.message || '')
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
      eventStatus('Saved. Updating the site\u2026');
      const published = await rebuildSite();
      eventStatus(published.ok ? 'Saved. The homepage and event pages update in about a minute.' : 'Saved, but the site rebuild didn\u2019t start (' + published.error + '). Press Publish changes.', !published.ok);
    } catch (err) {
      window.alert('Something went wrong saving this event: ' + err.message);
    }
  });

  // --- Facts ---

  // The fact generator, tweet text and image card live in facts-kit.js,
  // shared with the phone app.
  const generateFactImage = (text) => window.FactsKit.generateFactImage(text);
  const generateFactCandidates = () => window.FactsKit.generateFactCandidates(cachedProducts);

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
        const { data, error } = await client.from('facts').insert({ text: finalText }).select();
        if (error) {
          window.alert('Failed to publish: ' + error.message);
          return;
        }
        // Saves the fact's card online for its page's tweet preview.
        if (data && data[0] && data[0].id) await window.FactsKit.uploadFactCard(client, data[0]);
        loadPublishedFacts();
      });
      const xOnlyBtn = document.createElement('button');
      xOnlyBtn.type = 'button';
      xOnlyBtn.className = 'admin-btn admin-btn--small';
      xOnlyBtn.textContent = 'Post to X only';
      xOnlyBtn.addEventListener('click', () => {
        const finalText = textarea.value.trim();
        if (finalText) window.AdminX.use({ text: finalText, link: window.location.origin + '/facts/', kind: 'Did you know?' });
      });
      row.appendChild(textarea);
      row.appendChild(publishBtn);
      row.appendChild(xOnlyBtn);
      listEl.appendChild(row);
    });
  }

  document.getElementById('generate-facts-btn').addEventListener('click', renderFactCandidates);

  let cachedFacts = [];

  // --- Research a fact with Claude, and add your own (same as the phone app) ---

  document.getElementById('ask-claude-btn').addEventListener('click', () => {
    const topicEl = document.getElementById('fact-topic');
    const note = document.getElementById('ask-claude-note');
    const topic = topicEl.value.trim();
    if (!topic) {
      note.textContent = 'Type what the fact should be about first.';
      topicEl.focus();
      return;
    }
    const prompt = window.FactsKit.claudeResearchPrompt(topic, cachedFacts.map((f) => f.text));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(prompt).catch(() => {});
    note.textContent = 'Claude opened in a new tab (the request is also copied, in case it opens empty). Copy the fact you like into "Add your own fact" below.';
    window.open(window.FactsKit.claudeResearchUrl(prompt), '_blank', 'noopener');
  });
  document.getElementById('fact-topic').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('ask-claude-btn').click();
  });

  document.getElementById('own-fact-x-btn').addEventListener('click', () => {
    const text = document.getElementById('own-fact').value.trim();
    if (!text) { document.getElementById('own-fact-note').textContent = 'Type or paste a fact first.'; return; }
    const named = window.FactsKit.productNamed(text, cachedProducts);
    window.AdminX.use({ text, link: window.location.origin + (named ? '/products/' + named.slug + '/' : '/facts/'), kind: 'Did you know?' });
  });

  // --- The homepage rotation: the same pool and daily pick the build
  // uses (FactsKit.dailyFactPool / pickDailyFact), for today and the next
  // six days, each one ready to post to X.
  async function loadFactRotation() {
    const listEl = document.getElementById('fact-rotation');
    if (!listEl) return;
    const [factsRes, eventsRes, lockRes] = await Promise.all([
      client.from('facts').select('*'),
      client.from('apple_events').select('*'),
      client.from('site_content').select('body').eq('id', 'daily_fact').maybeSingle(),
    ]);
    // Today's fact as the build saved it, so the list matches the homepage.
    let locked = null;
    try { locked = JSON.parse((lockRes.data && lockRes.data.body) || 'null'); } catch (err) { locked = null; }
    const published = factsRes.data || [];
    const events = eventsRes.data || [];
    // The products in the big homepage tile, as the build picks them:
    // featured, on sale and with a release date, slot order first, at most 3.
    const featured = cachedProducts.filter((p) => p.featured && !p.discontinued && (p.refresh_history || []).length);
    const order = featuredOrder.map(String);
    featured.sort((a, b) => {
      const ia = order.indexOf(String(a.id)); const ib = order.indexOf(String(b.id));
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return String(a.name).localeCompare(String(b.name));
    });
    const tileSlugs = featured.slice(0, 3).map((p) => p.slug);
    const pool = window.FactsKit.dailyFactPool(cachedProducts, published);
    listEl.innerHTML = '';
    if (!pool.length) { listEl.textContent = 'No facts yet.'; return; }
    for (let i = 0; i < 7; i++) {
      const day = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
      // An Apple Event in the big tile means no product is there that day.
      const eventInTile = events.some((e) => e.featured) || events.some((e) => e.event_date >= day);
      const item = window.FactsKit.pickDailyFact(pool, day, eventInTile ? [] : tileSlugs, locked);
      if (!item) continue;
      const row = document.createElement('div');
      row.className = 'admin-fact-row fact-rotation-row' + (i === 0 ? ' is-today' : '');
      const when = document.createElement('p');
      when.className = 'fact-rotation-when';
      when.textContent = i === 0 ? 'Today' : new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      const kind = document.createElement('span');
      kind.className = 'fact-rotation-kind';
      kind.textContent = item.key.charAt(0) === 'p' ? item.name + "'s fact" : item.key.charAt(0) === 'f' ? 'Published fact' : 'Statistic';
      when.appendChild(kind);
      const text = document.createElement('p');
      text.className = 'fact-rotation-text';
      text.textContent = item.plain;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-btn admin-btn--small admin-btn--primary';
      btn.textContent = 'Post to X';
      btn.addEventListener('click', () => window.AdminX.use({
        text: item.post || item.plain,
        link: window.location.origin + (item.slug ? '/products/' + item.slug + '/' : '/facts/'),
        kind: 'Did you know?',
      }));
      const body = document.createElement('div');
      body.className = 'fact-rotation-body';
      body.appendChild(when);
      body.appendChild(text);
      row.appendChild(body);
      row.appendChild(btn);
      listEl.appendChild(row);
    }
  }

  // The site's day is UTC (the daily build), so "today" here is too.
  const pinToday = () => new Date().toISOString().slice(0, 10);
  const niceDay = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  // The homepage day chosen for a new fact: null for the rotation, the
  // date to pin it to, or false when "on a date" has no date yet.
  function homepageDay(selectId, dateId) {
    const when = document.getElementById(selectId).value;
    if (when === 'today') return pinToday();
    if (when === 'date') return document.getElementById(dateId).value || false;
    return null;
  }
  document.getElementById('own-fact-when').addEventListener('change', (e) => {
    const dateEl = document.getElementById('own-fact-date');
    dateEl.hidden = e.target.value !== 'date';
    dateEl.min = pinToday();
    if (!dateEl.hidden && !dateEl.value) dateEl.focus();
  });

  document.getElementById('own-fact-btn').addEventListener('click', async () => {
    const box = document.getElementById('own-fact');
    const note = document.getElementById('own-fact-note');
    const btn = document.getElementById('own-fact-btn');
    const text = box.value.trim().replace(/\s+/g, ' ');
    if (!text) return;
    if (cachedFacts.some((f) => window.FactsKit.sameFact(f.text, text))) {
      note.textContent = 'That fact is already published.';
      return;
    }
    const pin = homepageDay('own-fact-when', 'own-fact-date');
    if (pin === false) { note.textContent = 'Pick the day to show it on the homepage.'; return; }
    btn.disabled = true;
    const { data, error, pinSkipped } = await window.FactsKit.insertFact(client, text, pin);
    if (error) {
      btn.disabled = false;
      note.textContent = 'Could not publish: ' + error.message;
      return;
    }
    if (data && data[0] && data[0].id) await window.FactsKit.uploadFactCard(client, data[0]);
    box.value = '';
    document.getElementById('own-fact-when').value = 'rotation';
    document.getElementById('own-fact-date').hidden = true;
    note.textContent = 'Publishing…';
    const published = await rebuildSite();
    btn.disabled = false;
    note.textContent = (pinSkipped ? 'Published, but not yet on a set day: run supabase-schema-update-30.sql in Supabase first. ' : '') +
      (published.ok
        ? (pin === pinToday() ? 'Published. It will be on the homepage in about a minute.' : pin ? 'Published. It will be on the homepage on ' + niceDay(pin) + '.' : 'Published. It will take its turn on the homepage.')
        : 'Saved, but publishing failed (' + published.error + '). Press Publish changes.');
    loadPublishedFacts();
    loadFactRotation();
  });

  async function loadPublishedFacts() {
    const listEl = document.getElementById('published-facts');
    const { data, error } = await client.from('facts').select('*').order('created_at', { ascending: false });
    listEl.innerHTML = '';
    cachedFacts = data || [];
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
          await window.FactsKit.uploadFactCard(client, { id: fact.id, text: newText });
          loadPublishedFacts();
        });
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'admin-btn admin-btn--small';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => loadPublishedFacts());
        const editBox = document.createElement('div');
        editBox.className = 'fact-admin-edit';
        editBox.appendChild(textarea);
        const editActions = document.createElement('div');
        editActions.className = 'fact-admin-actions';
        editActions.appendChild(saveBtn);
        editActions.appendChild(cancelBtn);
        editBox.appendChild(editActions);
        p.replaceWith(editBox);
        actions.hidden = true;
        textarea.focus();
      });
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'admin-btn admin-btn--small';
      copyBtn.textContent = 'Copy text';
      copyBtn.addEventListener('click', () => {
        const tweetText = window.FactsKit.buildTweetText(fact.text, window.FactsKit.factPageUrl(fact), cachedProducts);
        navigator.clipboard.writeText(tweetText).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy text'; }, 1500);
        }).catch(() => {
          window.alert('Could not copy automatically, here is the text:\n\n' + tweetText);
        });
      });
      // Post to X: the tweet links to the fact's own page, whose preview
      // is the fact's card. X remembers a preview for days, so the button
      // only opens X once that page is live with the card.
      const xBtn = document.createElement('button');
      xBtn.type = 'button';
      xBtn.className = 'admin-btn admin-btn--small admin-btn--primary';
      xBtn.textContent = 'Checking card\u2026';
      xBtn.disabled = true;
      let xReady = false;
      const markReady = () => { xReady = true; xBtn.disabled = false; xBtn.textContent = 'Post to X'; };
      const waitForPage = async (tries) => {
        if (!xBtn.isConnected) return;
        if (await window.FactsKit.factPageLive(fact)) { markReady(); return; }
        if (tries >= 40) { xBtn.disabled = false; xBtn.textContent = 'Make card'; return; }
        xBtn.textContent = 'Card ready in a moment\u2026';
        setTimeout(() => waitForPage(tries + 1), 15000);
      };
      window.FactsKit.factPageLive(fact).then((live) => {
        if (live) markReady();
        else { xBtn.disabled = false; xBtn.textContent = 'Make card'; }
      });
      xBtn.addEventListener('click', async () => {
        if (xReady) {
          const tweetText = window.FactsKit.buildTweetText(fact.text, window.FactsKit.factPageUrl(fact), cachedProducts);
          window.open('https://x.com/intent/post?text=' + encodeURIComponent(tweetText), '_blank', 'noopener');
          return;
        }
        xBtn.disabled = true;
        xBtn.textContent = 'Making card\u2026';
        if (!(await window.FactsKit.factCardExists(client, fact))) await window.FactsKit.uploadFactCard(client, fact);
        const rebuilt = await rebuildSite();
        if (!rebuilt.ok) {
          xBtn.disabled = false;
          xBtn.textContent = 'Make card';
          window.alert('The card is saved, but the site rebuild didn\u2019t start (' + rebuilt.error + '). Press Publish changes, then try again.');
          return;
        }
        waitForPage(0);
      });
      const imageBtn = document.createElement('button');
      imageBtn.type = 'button';
      imageBtn.className = 'admin-btn admin-btn--small';
      imageBtn.textContent = 'Image';
      imageBtn.title = 'Download the card image';
      imageBtn.addEventListener('click', async () => {
        const dataUrl = await generateFactImage(fact.text);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'apple-sunset-fact.png';
        link.click();
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'fact-admin-delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        if (!window.confirm('Delete this fact? It comes off the Facts page and the homepage rotation.')) return;
        const { error: delError } = await client.from('facts').delete().eq('id', fact.id);
        if (delError) {
          window.alert('Delete failed: ' + delError.message);
          return;
        }
        loadPublishedFacts();
      });
      // Homepage day: shown as a status pill; "Homepage day…" opens a
      // small panel to set, change or clear it.
      const pin = fact.homepage_date ? String(fact.homepage_date).slice(0, 10) : '';
      const today = new Date().toISOString().slice(0, 10);
      const pill = document.createElement('span');
      pill.className = 'fact-admin-pill' + (pin && pin >= today ? ' is-scheduled' : '');
      pill.textContent = pin === today ? 'On the homepage today'
        : pin > today ? 'On the homepage ' + new Date(pin + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        : 'In the daily rotation';
      const meta = document.createElement('p');
      meta.className = 'fact-admin-meta';
      meta.textContent = fact.created_at ? 'Published ' + new Date(fact.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Published';
      meta.appendChild(pill);

      const pinPanel = document.createElement('div');
      pinPanel.className = 'fact-admin-pin';
      pinPanel.hidden = true;
      const pinLabel = document.createElement('label');
      pinLabel.textContent = 'Show it on the homepage on ';
      const pinInput = document.createElement('input');
      pinInput.type = 'date';
      pinInput.value = pin;
      pinInput.min = today;
      pinLabel.appendChild(pinInput);
      const savePin = async (value) => {
        const { error: pinError } = await client.from('facts').update({ homepage_date: value || null }).eq('id', fact.id);
        if (pinError) {
          window.alert(/homepage_date/.test(pinError.message) ? 'Run supabase-schema-update-30.sql in Supabase first.' : 'Could not save: ' + pinError.message);
          return;
        }
        await rebuildSite();
        loadPublishedFacts();
        loadFactRotation();
      };
      const pinSave = document.createElement('button');
      pinSave.type = 'button';
      pinSave.className = 'admin-btn admin-btn--small admin-btn--primary';
      pinSave.textContent = 'Save';
      pinSave.addEventListener('click', () => { if (pinInput.value) savePin(pinInput.value); else pinInput.focus(); });
      const pinToday = document.createElement('button');
      pinToday.type = 'button';
      pinToday.className = 'admin-btn admin-btn--small';
      pinToday.textContent = 'Today';
      pinToday.addEventListener('click', () => savePin(today));
      const pinClear = document.createElement('button');
      pinClear.type = 'button';
      pinClear.className = 'admin-btn admin-btn--small';
      pinClear.textContent = 'Back to the rotation';
      pinClear.hidden = !pin;
      pinClear.addEventListener('click', () => savePin(''));
      pinPanel.appendChild(pinLabel);
      pinPanel.appendChild(pinSave);
      pinPanel.appendChild(pinToday);
      pinPanel.appendChild(pinClear);
      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.className = 'admin-btn admin-btn--small';
      pinBtn.textContent = 'Homepage day\u2026';
      pinBtn.addEventListener('click', () => { pinPanel.hidden = !pinPanel.hidden; if (!pinPanel.hidden) pinInput.focus(); });

      row.className = 'fact-admin-card';
      p.className = 'fact-admin-text';
      const actions = document.createElement('div');
      actions.className = 'fact-admin-actions';
      [xBtn, copyBtn, imageBtn, editBtn, pinBtn].forEach((btn) => actions.appendChild(btn));
      actions.appendChild(deleteBtn);
      row.appendChild(p);
      row.appendChild(meta);
      row.appendChild(actions);
      row.appendChild(pinPanel);
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
      { key: 'coming-soon', label: 'Coming soon page', path: '/coming-soon/' },
      { key: 'gallery', label: 'Gallery page', path: '/gallery/' },
      { key: 'events', label: 'Apple Events page', path: '/events/' },
      { key: 'facts', label: 'Facts page', path: '/facts/' },
      { key: 'earnings', label: 'Earnings page', path: '/earnings/' },
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
    editor.addEventListener('input', stampFactDate);
  })();

  // --- Fact helper: three facts worked out from this product's own data,
  // or a Claude research request built from an idea.

  // This product as it stands in the form, for the fact helpers.
  function formProduct() {
    const symbol = (document.querySelector('input[name="price_currency"]:checked') || {}).value || '';
    const priceRaw = document.getElementById('price').value.trim();
    return {
      name: document.getElementById('name').value.trim(),
      refresh_history: currentRefreshHistory.slice(),
      discontinued: !!currentDiscontinuedDate,
      discontinued_date: currentDiscontinuedDate,
      generation_details: currentGenerationDetails,
      previous_model: document.getElementById('previous_model').value || null,
      price: priceRaw ? symbol + priceRaw : null,
    };
  }

  function productFactSuggestions() {
    return window.FactsKit.productFactCandidates(formProduct(), cachedProducts);
  }

  function setFactText(text) {
    const editor = document.getElementById('did_you_know_editor');
    if (editor.textContent.trim() && !window.confirm('Replace the current fact with this one?')) return;
    const p = document.createElement('p');
    p.textContent = text;
    editor.innerHTML = '';
    editor.appendChild(p);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  document.getElementById('fact-suggest-btn').addEventListener('click', () => {
    const box = document.getElementById('fact-suggestions');
    const list = productFactSuggestions();
    box.innerHTML = '';
    if (!list.length) {
      document.getElementById('fact-helper-note').textContent = 'Add this product\u2019s release dates first, or use Research with Claude.';
      return;
    }
    list.forEach((text) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fact-suggestion';
      btn.textContent = text;
      btn.addEventListener('click', () => { setFactText(text); box.innerHTML = ''; });
      box.appendChild(btn);
    });
    document.getElementById('fact-helper-note').textContent = 'Tap one to use it. You can edit it in the box above.';
  });

  document.getElementById('fact-research-btn').addEventListener('click', () => {
    const name = document.getElementById('name').value.trim();
    const seed = document.getElementById('fact-seed').value.trim();
    const note = document.getElementById('fact-helper-note');
    if (!name && !seed) {
      note.textContent = 'Give the product a name, or type an idea, first.';
      return;
    }
    const prompt = window.FactsKit.productFactPrompt(name, seed, cachedProducts.filter((p) => p.id !== editingId), cachedFacts.map((f) => f.text));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(prompt).catch(() => {});
    note.textContent = 'Claude opened in a new tab with your request (also copied, in case it opens empty). It finds 3 checked facts; paste the one you like into the box above.';
    window.open(window.FactsKit.claudeResearchUrl(prompt), '_blank', 'noopener');
  });
  document.getElementById('notes-research-btn').addEventListener('click', () => {
    const product = formProduct();
    const note = document.getElementById('notes-helper-note');
    if (!product.name) {
      note.textContent = 'Give the product a name first.';
      return;
    }
    product.category = document.getElementById('category').value || selectedFamily || '';
    product.rumor_note = document.getElementById('rumor_note_editor').innerHTML;
    const prompt = window.FactsKit.productNotesPrompt(product, document.getElementById('notes-seed').value.trim(), cachedProducts);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(prompt).catch(() => {});
    note.textContent = 'Claude opened in a new tab with your request (also copied, in case it opens empty). Check its sources, paste the notes into the box above, edit, then save.';
    window.open(window.FactsKit.claudeResearchUrl(prompt), '_blank', 'noopener');
  });
  document.getElementById('notes-seed').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('notes-research-btn').click(); }
  });
  document.getElementById('fact-seed').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('fact-research-btn').click(); }
  });

  // The fact's "As of" date: set to today whenever the fact's wording
  // changes, unless a date has been picked by hand.
  let loadedFactText = '';
  let factDateTouched = false;
  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function stampFactDate() {
    const input = document.getElementById('did_you_know_date');
    const text = (document.getElementById('did_you_know_editor').textContent || '').trim();
    if (!input || factDateTouched) return;
    if (!text) { input.value = ''; return; }
    if (text !== loadedFactText) input.value = todayIso();
  }
  (function wireFactDate() {
    const input = document.getElementById('did_you_know_date');
    if (input) input.addEventListener('input', () => { factDateTouched = true; });
  })();
  // Only send the date once the database has the column, so saving keeps
  // working before the SQL update has been run.
  function factDateColumnExists() {
    return cachedProducts.some((p) => Object.prototype.hasOwnProperty.call(p, 'did_you_know_date'));
  }

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
      insertLink(document.getElementById(btn.getAttribute('data-link-for')), url.trim());
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
