// Phone upload page (/upload/): pick photos, give them a title, date,
// place and tags, and publish, without opening the admin panel. The
// "Edit existing" tab edits or deletes any gallery set, including ones
// added from the admin panel. Uses the
// same Supabase sign-in as the admin panel; the database only accepts
// writes from signed-in users, so the page itself holds no secrets.
(function () {
  const client = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
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

  const MAX_PHOTOS = 12;
  const MAX_EDGE = 2560; // longest side in pixels after resizing
  const JPEG_QUALITY = 0.85;
  const LIST_CACHE_KEY = 'upload-gallery-cache-v1';
  const SUGGESTED_TAG_LIMIT = 16;

  const $ = (id) => document.getElementById(id);
  const sections = { loading: $('up-loading'), login: $('up-login'), home: $('up-home'), x: $('up-x'), products: $('up-products'), product: $('up-product'), main: $('up-main'), library: $('up-library'), facts: $('up-facts'), done: $('up-done') };

  // Photos already on the site have a url and no file.
  let photos = []; // { id, file, preview, status: 'working'|'done'|'error', url, error, promise }
  let photoSeq = 0;
  let processQueue = Promise.resolve();
  let selectedTags = [];
  let allTags = []; // existing tags, most used first
  let showAllTags = false;
  let submitting = false;
  let editingId = null; // null while adding a new set
  let gallerySets = []; // every gallery_photos row, newest first

  // Small, cached thumbnails via Netlify's Image CDN instead of full-size
  // photos. If the CDN can't serve one (or on a local preview), the image
  // falls back to the original file.
  function thumbUrl(url, size) {
    if (!/^https?:\/\//.test(url) || location.protocol !== 'https:') return url;
    return '/.netlify/images?url=' + encodeURIComponent(url) + '&w=' + size + '&h=' + size + '&fit=cover&q=70';
  }

  function thumbImg(img, url, size) {
    img.src = thumbUrl(url, size);
    if (img.src !== url) {
      img.addEventListener('error', function fallback() {
        img.removeEventListener('error', fallback);
        img.src = url;
      });
    }
  }

  function readListCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(LIST_CACHE_KEY) || 'null');
      return cached && Array.isArray(cached.rows) ? cached : null;
    } catch (err) {
      return null;
    }
  }

  function writeListCache(rows, productNames) {
    try {
      localStorage.setItem(LIST_CACHE_KEY, JSON.stringify({ rows, productNames }));
    } catch (err) {
      // Storage full or blocked: the list just loads from the network.
    }
  }

  function show(name) {
    Object.keys(sections).forEach((key) => { sections[key].hidden = key !== name; });
    $('up-footer').hidden = name === 'login' || name === 'loading';
    // The menu is the starting page; every other page has a Menu button
    // back to it.
    $('up-tabs').hidden = true;
    $('up-home-btn').hidden = name === 'home' || name === 'login' || name === 'loading';
    $('up-heading').textContent = name === 'home' ? 'Apple Sunset'
      : name === 'facts' ? 'Did you know?'
      : name === 'products' || name === 'product' ? 'Product facts'
      : name === 'x' ? 'X posts'
      : name === 'library' || (name === 'main' && editingId) ? 'Edit albums'
      : name === 'done' ? 'Done'
      : 'Add photos';
    window.scrollTo(0, 0);
  }

  // --- Sign in ---

  async function start() {
    const { data } = await client.auth.getSession();
    if (data.session) enterApp(data.session);
    else show('login');
  }

  $('up-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = $('up-login-error');
    errorEl.textContent = '';
    const { data, error } = await client.auth.signInWithPassword({
      email: $('up-email').value.trim(),
      password: $('up-password').value,
    });
    if (error) {
      errorEl.textContent = 'Sign in failed: ' + error.message;
      return;
    }
    $('up-password').value = '';
    enterApp(data.session);
  });

  $('up-logout').addEventListener('click', async () => {
    await client.auth.signOut();
    try { localStorage.removeItem(LIST_CACHE_KEY); } catch (err) { /* ignore */ }
    gallerySets = [];
    show('login');
  });

  function enterApp(session) {
    $('up-user').textContent = session && session.user ? session.user.email : '';
    clearForm(true);
    setFormMode();
    show('home');
    loadSuggestions();
  }

  // --- Suggestions: existing tags, places and product names ---

  // Loads every gallery set (for the Edit list) and builds the tag, place
  // and product suggestions from them.
  // Shows the copy remembered from last time straight away, then refreshes
  // it from the database.
  let suggestionsFromCache = false;
  async function loadSuggestions() {
    if (!gallerySets.length && !suggestionsFromCache) {
      suggestionsFromCache = true;
      const cached = readListCache();
      if (cached) applySuggestions(cached.rows, cached.productNames || []);
    }
    const [photosRes, productsRes] = await Promise.all([
      client.from('gallery_photos').select('*').order('created_at', { ascending: false }),
      client.from('products').select('name'),
    ]);
    if (photosRes.error) return;
    const productNames = (productsRes.data || []).map((p) => p.name).filter(Boolean);
    writeListCache(photosRes.data || [], productNames);
    applySuggestions(photosRes.data || [], productNames);
  }

  function applySuggestions(rows, productNames) {
    gallerySets = rows;
    if (!sections.library.hidden) renderLibrary();
    const counts = new Map();
    rows.forEach((row) => (row.tags || []).forEach((tag) => {
      const t = String(tag).trim();
      if (t) counts.set(t, (counts.get(t) || 0) + 1);
    }));
    allTags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
    fillDatalist('up-tag-options', uniqueSorted(allTags.concat(productNames)));
    fillDatalist('up-location-options', uniqueSorted(rows.map((r) => r.location)));
    fillDatalist('up-country-options', uniqueSorted(rows.map((r) => r.country)));
    renderTags();
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function fillDatalist(id, values) {
    const list = $(id);
    list.innerHTML = '';
    values.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      list.appendChild(opt);
    });
  }

  // --- Tags ---

  function pill(text, on, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'up-pill' + (on ? ' up-pill--on' : '');
    btn.textContent = text;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) btn.setAttribute('aria-label', 'Remove tag ' + text);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function hasTag(tag) {
    return selectedTags.some((t) => t.toLowerCase() === tag.toLowerCase());
  }

  function addTag(raw) {
    const tag = (raw || '').trim().replace(/\s+/g, ' ');
    if (!tag || hasTag(tag)) return;
    // Reuse the existing spelling of a tag, so "iphone 17" joins "iPhone 17".
    const existing = allTags.find((t) => t.toLowerCase() === tag.toLowerCase());
    selectedTags.push(existing || tag);
    renderTags();
  }

  function renderTags() {
    const selectedEl = $('up-selected-tags');
    selectedEl.innerHTML = '';
    selectedTags.forEach((tag) => selectedEl.appendChild(pill(tag, true, () => {
      selectedTags = selectedTags.filter((t) => t !== tag);
      renderTags();
    })));

    const suggestEl = $('up-suggested-tags');
    suggestEl.innerHTML = '';
    const available = allTags.filter((t) => !hasTag(t));
    const visible = showAllTags ? available : available.slice(0, SUGGESTED_TAG_LIMIT);
    visible.forEach((tag) => suggestEl.appendChild(pill(tag, false, () => addTag(tag))));
    const moreBtn = $('up-more-tags');
    moreBtn.hidden = showAllTags || available.length <= SUGGESTED_TAG_LIMIT;
    moreBtn.textContent = 'Show all ' + available.length + ' tags';
  }

  $('up-more-tags').addEventListener('click', () => {
    showAllTags = true;
    renderTags();
  });

  function addTypedTag() {
    const input = $('up-new-tag');
    addTag(input.value);
    input.value = '';
  }

  $('up-add-tag-btn').addEventListener('click', addTypedTag);
  $('up-new-tag').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTypedTag();
    }
  });
  // Picking a suggestion from the keyboard's list adds it straight away.
  $('up-new-tag').addEventListener('input', (e) => {
    if (e.inputType === 'insertReplacementText' || e.inputType === undefined) {
      const value = e.target.value.trim();
      const options = [...$('up-tag-options').options].map((o) => o.value);
      if (options.includes(value)) addTypedTag();
    }
  });

  // --- Date: typed, read day-first, echoed back with the weekday ---

  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  function monthIndex(word) {
    const w = word.toLowerCase().replace(/\.$/, '');
    if (w.length < 3) return -1;
    if (w === 'sept') return 8;
    return MONTHS.findIndex((m) => m === w || (w.length === 3 && m.startsWith(w)));
  }

  function isoFromParts(y, m, d) {
    if (!(y >= 1000 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return String(y) + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // Returns "YYYY-MM-DD", or "YYYY-MM" / "YYYY" for a month or year only
  // (the gallery already stores those for some older sets), or null.
  function parseTypedDate(text) {
    const s = (text || '').trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
    if (!s) return null;
    if (/^\d{4}$/.test(s)) return +s >= 1000 ? s : null;
    let m = s.match(/^(\d{4})-(\d{1,2})$/) || s.match(/^(\d{1,2})[/.-](\d{4})$/);
    if (m) {
      const [y, mo] = m[1].length === 4 ? [+m[1], +m[2]] : [+m[2], +m[1]];
      return mo >= 1 && mo <= 12 ? y + '-' + String(mo).padStart(2, '0') : null;
    }
    const monthOnly = s.split(' ');
    if (monthOnly.length === 2 && /^\d{4}$/.test(monthOnly[1]) && monthIndex(monthOnly[0]) >= 0) {
      return monthOnly[1] + '-' + String(monthIndex(monthOnly[0]) + 1).padStart(2, '0');
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return isoFromParts(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return isoFromParts(+m[3], +m[2], +m[1]);
    const words = s.split(' ');
    const first = words[0].toLowerCase().replace(/\.$/, '');
    if (words.length === 4 && WEEKDAYS.some((d) => d === first || (first.length === 3 && d.startsWith(first)))) words.shift();
    if (words.length !== 3 || !/^\d{4}$/.test(words[2])) return null;
    const dayOf = (w) => (/^\d{1,2}(st|nd|rd|th)?$/i.test(w) ? parseInt(w, 10) : NaN);
    let day = dayOf(words[0]);
    let month = monthIndex(words[1]);
    if (isNaN(day) || month < 0) {
      day = dayOf(words[1]);
      month = monthIndex(words[0]);
    }
    if (isNaN(day) || month < 0) return null;
    return isoFromParts(+words[2], month + 1, day);
  }

  function longDate(iso) {
    if (/^\d{4}$/.test(iso)) return iso;
    const [y, m, d] = iso.split('-').map(Number);
    if (!d) return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return new Date(Date.UTC(y, m - 1, d))
      .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .replace(',', '');
  }

  function precisionNote(iso) {
    if (/^\d{4}$/.test(iso)) return 'Year only';
    if (/^\d{4}-\d{2}$/.test(iso)) return 'Month and year only';
    return '';
  }

  const dateInput = $('up-date');
  const dateEcho = $('up-date-echo');
  let dateFromPhoto = false;

  function updateDateEcho(final) {
    const raw = dateInput.value.trim();
    const iso = parseTypedDate(raw);
    dateEcho.classList.toggle('up-hint--error', !!raw && !iso && final);
    // Once the box already reads as the tidy long date, don't repeat it.
    if (iso) {
      const note = dateFromPhoto ? 'Taken from the photo' : precisionNote(iso);
      dateEcho.textContent = dateInput.value === longDate(iso) ? note : longDate(iso) + (note ? ' (' + note.toLowerCase() + ')' : '');
    }
    else if (raw) dateEcho.textContent = 'Not a date I can read. Try 15 Oct 2024, 15/10/2024 or Oct 2024.';
    else dateEcho.textContent = '';
    return iso;
  }

  dateInput.addEventListener('input', () => {
    dateFromPhoto = false;
    updateDateEcho(false);
  });
  dateInput.addEventListener('blur', () => {
    const iso = parseTypedDate(dateInput.value);
    if (iso) dateInput.value = longDate(iso);
    updateDateEcho(true);
  });

  // An old error shouldn't linger once something has been changed.
  $('up-form').addEventListener('input', () => {
    if ($('up-status').classList.contains('up-status--error')) setStatus('');
  });

  function setDate(iso, fromPhoto) {
    dateFromPhoto = !!fromPhoto;
    dateInput.value = iso ? longDate(iso) : '';
    updateDateEcho(true);
  }

  // Reads DateTimeOriginal from a JPEG's EXIF block. Returns YYYY-MM-DD or null.
  async function readExifDate(file) {
    try {
      const buf = await file.slice(0, 256 * 1024).arrayBuffer();
      const v = new DataView(buf);
      if (v.getUint16(0) !== 0xffd8) return null;
      let off = 2;
      while (off + 4 <= v.byteLength) {
        const marker = v.getUint16(off);
        if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
        if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return exifDateFromTiff(v, off + 10);
        off += 2 + v.getUint16(off + 2);
      }
    } catch (err) {
      // Unreadable or unusual file: leave the date for typing.
    }
    return null;
  }

  function exifDateFromTiff(v, t) {
    const le = v.getUint16(t) === 0x4949;
    const u16 = (o) => v.getUint16(o, le);
    const u32 = (o) => v.getUint32(o, le);
    const readIfd = (ifdOffset) => {
      const entries = {};
      const count = u16(t + ifdOffset);
      for (let i = 0; i < count; i++) {
        const e = t + ifdOffset + 2 + i * 12;
        entries[u16(e)] = { count: u32(e + 4), valueAt: e + 8 };
      }
      return entries;
    };
    const readString = (entry) => {
      const at = entry.count > 4 ? t + u32(entry.valueAt) : entry.valueAt;
      let s = '';
      for (let i = 0; i < entry.count - 1; i++) s += String.fromCharCode(v.getUint8(at + i));
      return s;
    };
    const ifd0 = readIfd(u32(t + 4));
    let raw = null;
    if (ifd0[0x8769]) {
      const exif = readIfd(u32(ifd0[0x8769].valueAt));
      if (exif[0x9003]) raw = readString(exif[0x9003]);
      else if (exif[0x9004]) raw = readString(exif[0x9004]);
    }
    if (!raw && ifd0[0x0132]) raw = readString(ifd0[0x0132]);
    const m = raw && raw.match(/^(\d{4}):(\d{2}):(\d{2})/);
    return m ? isoFromParts(+m[1], +m[2], +m[3]) : null;
  }

  // --- Photos: resize, strip metadata, upload in the background ---

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read this photo.'));
      img.src = src;
    });
  }

  // Redrawing through a canvas shrinks the file for mobile data and drops
  // the EXIF block, including GPS location, before anything is public.
  async function prepareImage(file) {
    const src = URL.createObjectURL(file);
    try {
      const img = await loadImage(src);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error('Could not prepare this photo.');
      return blob;
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  async function uploadBlob(blob) {
    const path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-gallery.jpg';
    const { error } = await client.storage.from('product-images').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    return client.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }

  function processPhoto(entry) {
    entry.status = 'working';
    entry.error = null;
    renderPhotos();
    // One at a time keeps memory down on older iPhones.
    entry.promise = processQueue = processQueue.then(async () => {
      if (!photos.includes(entry)) return;
      try {
        entry.url = await uploadBlob(await prepareImage(entry.file));
        entry.status = 'done';
      } catch (err) {
        entry.status = 'error';
        entry.error = err.message || 'Upload failed';
      }
      renderPhotos();
    });
  }

  $('up-file').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setStatus('Only ' + MAX_PHOTOS + ' photos per set, so ' + (files.length - room) + ' were left out.', true);
    const added = files.slice(0, Math.max(0, room)).map((file) => ({
      id: ++photoSeq,
      file,
      preview: URL.createObjectURL(file),
      status: 'working',
    }));
    const wasEmpty = photos.length === 0 && !editingId;
    photos = photos.concat(added);
    added.forEach(processPhoto);
    if (wasEmpty && added.length && !dateInput.value.trim()) {
      for (const entry of added) {
        const iso = await readExifDate(entry.file);
        if (iso) {
          if (!dateInput.value.trim()) setDate(iso, true);
          break;
        }
      }
    }
  });

  function renderPhotos() {
    const grid = $('up-photos');
    grid.innerHTML = '';
    photos.forEach((entry, i) => {
      const cell = document.createElement('div');
      cell.className = 'up-photo up-photo--' + entry.status;
      const img = document.createElement('img');
      if (entry.file) img.src = entry.preview;
      else thumbImg(img, entry.url, 360);
      img.alt = 'Photo ' + (i + 1);
      img.decoding = 'async';
      cell.appendChild(img);

      const state = document.createElement('div');
      state.className = 'up-photo-state';
      if (entry.status === 'error') {
        state.textContent = 'Failed. Tap to retry';
        state.addEventListener('click', () => processPhoto(entry));
      } else {
        state.textContent = 'Uploading…';
      }
      cell.appendChild(state);

      if (i === 0 && photos.length > 1) {
        const main = document.createElement('span');
        main.className = 'up-photo-main';
        main.textContent = 'Main';
        cell.appendChild(main);
      } else if (i > 0) {
        const first = document.createElement('button');
        first.type = 'button';
        first.className = 'up-photo-first';
        first.textContent = 'Make main';
        first.addEventListener('click', () => {
          photos.splice(i, 1);
          photos.unshift(entry);
          renderPhotos();
        });
        cell.appendChild(first);
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'up-photo-remove';
      remove.setAttribute('aria-label', 'Remove photo ' + (i + 1));
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        photos = photos.filter((p) => p !== entry);
        if (entry.file) URL.revokeObjectURL(entry.preview);
        renderPhotos();
      });
      cell.appendChild(remove);
      grid.appendChild(cell);
    });
    $('up-file-label').textContent = photos.length ? 'Add more photos' : 'Choose photos';
    $('up-file-label').hidden = photos.length >= MAX_PHOTOS;
  }

  // --- Submit ---

  function setStatus(text, isError) {
    const el = $('up-status');
    el.textContent = text || '';
    el.classList.toggle('up-status--error', !!isError);
  }

  $('up-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!photos.length) {
      setStatus('Choose at least one photo first.', true);
      return;
    }
    const rawDate = dateInput.value.trim();
    const dateTaken = parseTypedDate(rawDate);
    if (rawDate && !dateTaken) {
      updateDateEcho(true);
      setStatus('Fix the date, or clear it, first.', true);
      dateInput.focus();
      return;
    }
    if ($('up-new-tag').value.trim()) addTypedTag();

    submitting = true;
    const submitBtn = $('up-submit');
    submitBtn.disabled = true;
    try {
      if (photos.some((p) => p.status === 'working')) {
        setStatus('Finishing the photo uploads…');
        await Promise.all(photos.map((p) => p.promise));
      }
      const failed = photos.filter((p) => p.status !== 'done');
      if (failed.length) {
        setStatus(failed.length + ' photo' + (failed.length === 1 ? '' : 's') + ' did not upload. Tap it to retry, or remove it.', true);
        return;
      }

      setStatus('Saving…');
      const payload = {
        image_urls: photos.map((p) => p.url),
        caption: $('up-title').value.trim() || null,
        date_taken: dateTaken,
        location: $('up-location').value.trim() || null,
        country: $('up-country').value.trim() || null,
        tags: selectedTags.slice(),
      };
      const wasEditing = !!editingId;
      const { data: saved, error } = wasEditing
        ? await client.from('gallery_photos').update(payload).eq('id', editingId)
        : await client.from('gallery_photos').insert(payload).select();
      if (error) {
        setStatus('Could not save: ' + error.message, true);
        return;
      }

      let doneText = 'Saved to the gallery.';
      if ($('up-publish').checked) {
        setStatus('Publishing…');
        const published = await publishSite();
        doneText = published.ok
          ? 'It will be live on the site in about a minute.'
          : 'Saved, but publishing failed (' + published.error + '). It will go live at the next publish, or with the daily rebuild tomorrow morning.';
      } else {
        doneText = 'Saved. It will go live the next time you publish, or with the daily rebuild tomorrow morning.';
      }
      const count = payload.image_urls.length;
      $('up-done-title').textContent = wasEditing ? 'Changes saved' : (count === 1 ? 'Photo uploaded' : count + ' photos uploaded');
      $('up-done-text').textContent = doneText;
      setStatus('');
      lastSavedId = wasEditing ? editingId : (saved && saved[0] && saved[0].id) || null;
      $('up-edit-saved').hidden = !lastSavedId;
      // Clear the form now, so the Add tab is fresh if tapped from here.
      // A new upload keeps its place for the next set from the same outing.
      editingId = null;
      clearForm(!wasEditing);
      setFormMode();
      show('done');
      loadSuggestions();
    } finally {
      submitting = false;
      submitBtn.disabled = false;
    }
  });

  async function publishSite() {
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

  function clearForm(keepPlace) {
    photos.forEach((p) => { if (p.file) URL.revokeObjectURL(p.preview); });
    photos = [];
    selectedTags = [];
    showAllTags = false;
    $('up-title').value = '';
    if (!keepPlace) {
      $('up-location').value = '';
      $('up-country').value = '';
    }
    $('up-new-tag').value = '';
    setDate(null);
    setStatus('');
    renderPhotos();
    renderTags();
  }

  function setFormMode() {
    const editing = !!editingId;
    $('up-editing').hidden = !editing;
    $('up-remove-card').hidden = !editing;
    $('up-submit').textContent = editing ? 'Save changes' : 'Upload';
  }

  // Location and country are kept for the next set, since photos taken
  // on the same outing usually share them.
  function startNew() {
    const wasEditing = !!editingId;
    editingId = null;
    clearForm(!wasEditing);
    setFormMode();
    show('main');
    loadSuggestions();
  }

  $('up-again').addEventListener('click', startNew);

  // "Edit this set" on the done screen: straight back into what was saved.
  let lastSavedId = null;
  $('up-edit-saved').addEventListener('click', async () => {
    if (!lastSavedId) return;
    if (!gallerySets.some((set) => set.id === lastSavedId)) await loadSuggestions();
    editSet(lastSavedId);
  });

  // --- Edit existing sets ---

  function hasUnsavedNewSet() {
    return !editingId && photos.length > 0;
  }

  function setTitle(set) {
    return set.caption || (set.tags && set.tags[0]) || 'Untitled photo';
  }

  function setImages(set) {
    if (set.image_urls && set.image_urls.length) return set.image_urls;
    return set.image_url ? [set.image_url] : [];
  }

  function openLibrary() {
    show('library');
    renderLibrary();
    loadSuggestions();
  }

  function renderLibrary() {
    const list = $('up-library-list');
    const query = $('up-search').value.trim().toLowerCase();
    const words = query.split(/\s+/).filter(Boolean);
    const matches = gallerySets.filter((set) => {
      const hay = [set.caption, set.location, set.country].concat(set.tags || []).filter(Boolean).join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    $('up-library-count').textContent = gallerySets.length
      ? (query ? matches.length + ' of ' + gallerySets.length + ' sets' : gallerySets.length + ' sets. Tap one to edit it.')
      : 'No photos in the gallery yet.';
    list.innerHTML = '';
    matches.forEach((set) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'up-set';
      const images = setImages(set);
      if (images[0]) {
        const img = document.createElement('img');
        thumbImg(img, images[0], 160);
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        btn.appendChild(img);
      } else {
        const blank = document.createElement('span');
        blank.className = 'up-set-noimg';
        btn.appendChild(blank);
      }
      const text = document.createElement('span');
      text.className = 'up-set-text';
      const title = document.createElement('span');
      title.className = 'up-set-title';
      title.textContent = setTitle(set);
      const meta = document.createElement('span');
      meta.className = 'up-set-meta';
      meta.textContent = [set.date_taken ? longDate(set.date_taken).replace(/^[A-Za-z]+day /, '') : '', set.location, set.country].filter(Boolean).join(' · ') || 'No date or place';
      text.appendChild(title);
      text.appendChild(meta);
      btn.appendChild(text);
      if (images.length > 1) {
        const count = document.createElement('span');
        count.className = 'up-set-count';
        count.textContent = images.length + ' photos';
        btn.appendChild(count);
      }
      btn.addEventListener('click', () => editSet(set.id));
      list.appendChild(btn);
    });
  }

  $('up-search').addEventListener('input', renderLibrary);

  function editSet(id) {
    const set = gallerySets.find((s) => s.id === id);
    if (!set) return;
    if (hasUnsavedNewSet() && !window.confirm('Discard the new photos you haven\'t uploaded yet?')) return;
    clearForm(false);
    editingId = id;
    photos = setImages(set).map((url) => ({ id: ++photoSeq, file: null, preview: url, url, status: 'done', promise: Promise.resolve() }));
    $('up-title').value = set.caption || '';
    $('up-location').value = set.location || '';
    $('up-country').value = set.country || '';
    selectedTags = (set.tags || []).slice();
    setDate(set.date_taken || null);
    $('up-editing-title').textContent = setTitle(set);
    setFormMode();
    renderPhotos();
    renderTags();
    show('main');
  }

  $('up-cancel-edit').addEventListener('click', () => {
    editingId = null;
    clearForm(false);
    setFormMode();
    openLibrary();
  });

  // --- Menu ---
  $('up-home-btn').addEventListener('click', () => show('home'));
  // Add photos picks up a half-finished new album where it was left;
  // otherwise it starts a fresh one.
  $('up-go-add').addEventListener('click', () => {
    if (editingId) { startNew(); return; }
    show('main');
    loadSuggestions();
  });
  $('up-go-edit').addEventListener('click', openLibrary);
  $('up-go-facts').addEventListener('click', openFacts);
  $('up-go-products').addEventListener('click', openProducts);
  $('up-go-x').addEventListener('click', openXPosts);

  // --- X posts: for the X account only, nothing is saved or published on
  // the site. Ideas come from the products; the card goes to the X app
  // through the share sheet.
  let xIdeas = [];
  let xShown = 0;
  let xCardFile = null;
  let xCardTimer = null;

  // Post to X carries the card as the link's preview (see xCardLink in
  // facts-kit.js), so the card is saved to storage once the wording
  // settles, and Post to X waits for it. The share sheet attaches the
  // image itself, so it keeps the plain link.
  let xCardKey = null;
  let xCardFor = '';
  let xUploadTimer = null;
  let xProductsLoading = false;
  const xCardSig = () => ($('up-x-card-label').value.trim() || 'Did you know?') + '\n' + $('up-x-text').value.trim();
  const xWantsCard = () => $('up-x-card-on').checked && !!$('up-x-text').value.trim();
  const xCardReady = () => !xWantsCard() || (xCardKey && xCardFor === xCardSig());

  function xFullText(withCardLink) {
    const link = $('up-x-link-on').checked ? $('up-x-link').value.trim() : '';
    return window.FactsKit.xPostText($('up-x-text').value, {
      hashtags: $('up-x-tags').checked,
      products: allProducts,
      link: withCardLink && xWantsCard() && xCardReady() ? window.FactsKit.xCardLink(window.location.origin, xCardKey, link) : link,
    });
  }

  function xPrepareCard() {
    clearTimeout(xUploadTimer);
    if (!xWantsCard() || xCardReady()) return;
    const sig = xCardSig();
    xUploadTimer = setTimeout(async () => {
      const label = $('up-x-card-label').value.trim() || 'Did you know?';
      const key = await window.FactsKit.uploadXCard(client, $('up-x-text').value.trim(), label);
      if (sig !== xCardSig()) return;
      if (key) { xCardKey = key; xCardFor = sig; }
      $('up-x-post').textContent = key ? 'Post to X' : 'Post to X (card failed to save)';
      xRefresh();
    }, 900);
  }

  function xRefresh() {
    const text = $('up-x-text').value.trim();
    // The product list gives the #ProductName hashtag.
    if (text && !allProducts.length && !xProductsLoading) {
      xProductsLoading = true;
      client.from('products').select('*').then(({ data }) => { if (data && data.length) { allProducts = data; xRefresh(); } });
    }
    const full = text ? xFullText(true) : '';
    $('up-x-preview').textContent = full || 'Your post will appear here.';
    const len = window.FactsKit.xPostLength(full);
    $('up-x-count').textContent = text ? len + ' / 280 characters' + (len > 280 ? ' — too long for X' : '') : '';
    $('up-x-count').classList.toggle('up-fact-count--over', len > 280);
    ['up-x-share', 'up-x-post', 'up-x-copy'].forEach((id) => { $(id).disabled = !text || len > 280; });
    if (text && !xCardReady()) { $('up-x-post').disabled = true; $('up-x-post').textContent = 'Preparing card\u2026'; }
    else if ($('up-x-post').textContent === 'Preparing card\u2026') $('up-x-post').textContent = 'Post to X';
    xPrepareCard();
    $('up-x-link').hidden = !$('up-x-link-on').checked;
    const wantCard = $('up-x-card-on').checked && !!text;
    $('up-x-card-label').hidden = !$('up-x-card-on').checked;
    $('up-x-card').hidden = !wantCard;
    $('up-x-share').textContent = $('up-x-card-on').checked ? 'Share to X with card' : 'Share to X';
    clearTimeout(xCardTimer);
    xCardFile = null;
    if (wantCard) {
      xCardTimer = setTimeout(async () => {
        const label = $('up-x-card-label').value.trim() || 'Did you know?';
        $('up-x-card').src = await window.FactsKit.generateFactImage(text, label);
        xCardFile = await window.FactsKit.factImageFile(text, label);
      }, 300);
    }
  }

  function xUseIdea(idea) {
    if ($('up-x-text').value.trim() && !window.confirm('Replace the post you are writing with this idea?')) return;
    $('up-x-text').value = idea.text;
    $('up-x-link').value = idea.link || '';
    $('up-x-link-on').checked = !!idea.link;
    $('up-x-card-label').value = idea.kind || 'Did you know?';
    $('up-x-idea-list').innerHTML = '';
    xRefresh();
    $('up-x-text').scrollIntoView({ block: 'center' });
  }

  function xShowIdeas() {
    const box = $('up-x-idea-list');
    box.innerHTML = '';
    if (!xIdeas.length) {
      box.textContent = 'No ideas yet: add some products and dates first.';
      return;
    }
    for (let i = 0; i < Math.min(5, xIdeas.length); i++) {
      const idea = xIdeas[(xShown + i) % xIdeas.length];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'up-fact-pick';
      const kind = document.createElement('span');
      kind.className = 'up-x-kind';
      kind.textContent = idea.kind;
      btn.appendChild(kind);
      btn.appendChild(document.createTextNode(idea.text));
      btn.addEventListener('click', () => xUseIdea(idea));
      box.appendChild(btn);
    }
    xShown = (xShown + 5) % xIdeas.length;
    $('up-x-ideas').textContent = xIdeas.length > 5 ? 'More ideas' : 'Ideas from my data';
  }

  async function openXPosts() {
    show('x');
    xRefresh();
  }

  $('up-x-ideas').addEventListener('click', async () => {
    if (!xIdeas.length) {
      $('up-x-ideas').disabled = true;
      if (!allProducts.length) {
        const { data } = await client.from('products').select('*');
        allProducts = data || [];
      }
      $('up-x-ideas').disabled = false;
      xIdeas = window.FactsKit.xPostIdeas(allProducts, window.location.origin);
      for (let i = xIdeas.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [xIdeas[i], xIdeas[j]] = [xIdeas[j], xIdeas[i]];
      }
      xShown = 0;
    }
    xShowIdeas();
  });

  $('up-x-claude').addEventListener('click', () => {
    openClaude(window.FactsKit.xPostPrompt($('up-x-topic').value.trim()), 'up-x-claude-note',
      'Claude is writing 5 posts, each checked against two sources (the request is also copied). Check its sources, then copy the one you like into the box below.');
  });

  ['up-x-text', 'up-x-link', 'up-x-card-label'].forEach((id) => $(id).addEventListener('input', xRefresh));
  ['up-x-tags', 'up-x-link-on', 'up-x-card-on'].forEach((id) => $(id).addEventListener('change', xRefresh));

  $('up-x-share').addEventListener('click', async () => {
    const text = xFullText();
    const btn = $('up-x-share');
    // Copied first, in case the app picked from the share sheet drops it.
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
    if ($('up-x-card-on').checked && !xCardFile) {
      clearTimeout(xCardTimer);
      const label = $('up-x-card-label').value.trim() || 'Did you know?';
      xCardFile = await window.FactsKit.factImageFile($('up-x-text').value.trim(), label);
    }
    const withCard = $('up-x-card-on').checked && xCardFile && navigator.canShare && navigator.canShare({ files: [xCardFile] });
    if (navigator.share) {
      try {
        await navigator.share(withCard ? { text, files: [xCardFile] } : { text });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    if (!withCard) { openInX(text); return; }
    flash(btn, 'Copied: open X and paste');
  });
  $('up-x-post').addEventListener('click', () => openInX(xFullText(true)));
  $('up-x-copy').addEventListener('click', () => copyText(xFullText(true), $('up-x-copy')));

  // --- Product facts & notes: a product's "Did you know?" and its Notes,
  // written here or researched with Claude, then saved and published.
  let allProducts = [];
  let currentProduct = null;
  let loadedFact = '';
  let loadedNotes = '';
  let factDateTouchedApp = false;

  function todayIsoApp() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function escapeText(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Plain text from the phone back to the page's paragraphs.
  function textToHtml(text) {
    return text.split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => '<p>' + escapeText(p) + '</p>').join('');
  }
  // Bold, italics or links in what is stored, which plain text would lose.
  function hasFormatting(html) {
    return /<(a|b|strong|i|em|u)\b/i.test(html || '');
  }
  function lastRelease(p) {
    const dates = (p.refresh_history || []).filter((d) => d !== p.discontinued_date).slice().sort();
    return dates[dates.length - 1] || null;
  }

  async function openProducts() {
    show('products');
    if (!allProducts.length) $('up-product-count').textContent = 'Loading…';
    const { data, error } = await client.from('products').select('*').order('name');
    if (error) {
      $('up-product-count').textContent = 'Could not load products: ' + error.message;
      return;
    }
    allProducts = data || [];
    renderProducts();
  }

  function renderProducts() {
    const list = $('up-product-list');
    const words = $('up-product-search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = allProducts.filter((p) => {
      const hay = [p.name, p.category].filter(Boolean).join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    $('up-product-count').textContent = words.length ? matches.length + ' of ' + allProducts.length + ' products' : allProducts.length + ' products. Tap one to write its fact or notes.';
    list.innerHTML = '';
    matches.forEach((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'up-set';
      const text = document.createElement('span');
      text.className = 'up-set-text';
      const title = document.createElement('span');
      title.className = 'up-set-title';
      title.textContent = p.name;
      const meta = document.createElement('span');
      meta.className = 'up-set-meta';
      meta.textContent = [p.category, p.discontinued ? 'Discontinued' : '', p.did_you_know ? 'Has a fact' : 'No fact yet'].filter(Boolean).join(' · ');
      text.appendChild(title);
      text.appendChild(meta);
      btn.appendChild(text);
      btn.addEventListener('click', () => openProduct(p));
      list.appendChild(btn);
    });
  }
  $('up-product-search').addEventListener('input', renderProducts);
  $('up-product-back').addEventListener('click', () => { show('products'); renderProducts(); });

  function updateProductFactCount() {
    const len = $('up-pf-fact').value.trim().length;
    $('up-pf-fact-count').textContent = len ? len + ' / 320 characters' : '';
    $('up-pf-fact-count').classList.toggle('up-fact-count--over', len > 320);
  }

  function openProduct(p) {
    currentProduct = p;
    $('up-product-name').textContent = p.name;
    const latest = lastRelease(p);
    $('up-product-meta').textContent = [p.category, latest ? 'Last released ' + longDate(latest).replace(/^[A-Za-z]+day /, '') : '', p.discontinued ? 'Discontinued' : ''].filter(Boolean).join(' · ');
    loadedFact = window.FactsKit.plainText(p.did_you_know).replace(/\n+/g, ' ');
    loadedNotes = window.FactsKit.plainText(p.rumor_note);
    $('up-pf-fact').value = loadedFact;
    $('up-pf-notes').value = loadedNotes;
    $('up-pf-notes-format').textContent = hasFormatting(p.rumor_note) ? 'These notes have bold or links. Saving changed notes from here keeps the words but drops that formatting.' : '';
    const hasDateColumn = Object.prototype.hasOwnProperty.call(p, 'did_you_know_date');
    $('up-pf-date-wrap').hidden = !hasDateColumn;
    $('up-pf-date').value = p.did_you_know_date || '';
    factDateTouchedApp = false;
    ['up-pf-suggestions', 'up-pf-fact-note', 'up-pf-notes-note', 'up-pf-status'].forEach((id) => { $(id).textContent = ''; });
    $('up-pf-fact-idea').value = '';
    $('up-pf-notes-idea').value = '';
    updateProductFactCount();
    show('product');
  }

  $('up-pf-fact').addEventListener('input', () => {
    updateProductFactCount();
    if (factDateTouchedApp) return;
    const text = $('up-pf-fact').value.trim();
    $('up-pf-date').value = !text ? '' : text !== loadedFact ? todayIsoApp() : (currentProduct.did_you_know_date || '');
  });
  $('up-pf-date').addEventListener('input', () => { factDateTouchedApp = true; });

  $('up-pf-suggest').addEventListener('click', () => {
    const box = $('up-pf-suggestions');
    box.innerHTML = '';
    const list = window.FactsKit.productFactCandidates(currentProduct, allProducts);
    if (!list.length) {
      $('up-pf-fact-note').textContent = 'Not enough dates on this product yet. Try Research a fact with Claude.';
      return;
    }
    $('up-pf-fact-note').textContent = 'Tap one to use it, then edit it if you like.';
    list.forEach((text) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'up-fact-pick';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        if ($('up-pf-fact').value.trim() && !window.confirm('Replace the current fact with this one?')) return;
        $('up-pf-fact').value = text;
        $('up-pf-fact').dispatchEvent(new Event('input'));
        box.innerHTML = '';
        $('up-pf-fact-note').textContent = '';
      });
      box.appendChild(btn);
    });
  });

  // Opens the Claude app with the request (and copies it, in case the
  // app opens without it).
  function openClaude(prompt, noteId, message) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(prompt).catch(() => {});
    $(noteId).textContent = message;
    window.open(window.FactsKit.claudeResearchUrl(prompt), '_blank');
  }
  $('up-pf-fact-claude').addEventListener('click', () => {
    const others = allProducts.filter((p) => p.id !== currentProduct.id);
    const prompt = window.FactsKit.productFactPrompt(currentProduct.name, $('up-pf-fact-idea').value.trim(), others, publishedFacts.map((f) => f.text));
    openClaude(prompt, 'up-pf-fact-note', 'Claude is finding 3 checked facts (the request is also copied). Check its sources, then copy the one you like into the box above.');
  });
  $('up-pf-notes-claude').addEventListener('click', () => {
    const product = Object.assign({}, currentProduct, { rumor_note: textToHtml($('up-pf-notes').value) });
    const prompt = window.FactsKit.productNotesPrompt(product, $('up-pf-notes-idea').value.trim(), allProducts);
    openClaude(prompt, 'up-pf-notes-note', 'Claude is drafting notes, checking each point against two sources (the request is also copied). Check its sources, then paste the notes into the box above and edit.');
  });

  $('up-pf-save').addEventListener('click', async () => {
    const btn = $('up-pf-save');
    const status = $('up-pf-status');
    const fact = $('up-pf-fact').value.trim().replace(/\s+/g, ' ');
    const notes = $('up-pf-notes').value.trim();
    const update = {};
    if (fact !== loadedFact) update.did_you_know = fact ? textToHtml(fact) : null;
    if (notes !== loadedNotes) update.rumor_note = notes ? textToHtml(notes) : null;
    if (Object.prototype.hasOwnProperty.call(currentProduct, 'did_you_know_date')) {
      const date = fact ? ($('up-pf-date').value || todayIsoApp()) : null;
      if (date !== (currentProduct.did_you_know_date || null)) update.did_you_know_date = date;
    }
    if (!Object.keys(update).length) {
      status.textContent = 'Nothing has changed.';
      return;
    }
    btn.disabled = true;
    status.classList.remove('up-status--error');
    status.textContent = 'Saving…';
    const { error } = await client.from('products').update(update).eq('id', currentProduct.id);
    if (error) {
      btn.disabled = false;
      status.classList.add('up-status--error');
      status.textContent = 'Could not save: ' + error.message;
      return;
    }
    Object.assign(currentProduct, update);
    loadedFact = fact;
    loadedNotes = notes;
    status.textContent = 'Saved. Publishing…';
    const published = await publishSite();
    btn.disabled = false;
    status.textContent = published.ok ? 'Saved and published. The page updates in a minute or two.' : 'Saved, but publishing didn’t start (' + published.error + '). It will go live with the next publish.';
  });

  $('up-tab-new').addEventListener('click', () => {
    if (!sections.main.hidden) return;
    if (!sections.done.hidden) { startNew(); return; }
    show('main');
  });
  $('up-tab-facts').addEventListener('click', () => {
    if (!sections.facts.hidden) return;
    openFacts();
  });
  $('up-tab-edit').addEventListener('click', () => {
    if (!sections.library.hidden) return;
    openLibrary();
  });
  $('up-to-library').addEventListener('click', () => {
    clearForm(false);
    setFormMode();
    openLibrary();
  });

  $('up-remove-set').addEventListener('click', async () => {
    if (!editingId || submitting) return;
    const set = gallerySets.find((s) => s.id === editingId);
    if (!window.confirm('Delete "' + (set ? setTitle(set) : 'this set') + '" from the gallery? This can\'t be undone.')) return;
    submitting = true;
    try {
      setStatus('Deleting…');
      const { error } = await client.from('gallery_photos').delete().eq('id', editingId);
      if (error) {
        setStatus('Could not delete: ' + error.message, true);
        return;
      }
      let doneText = 'It has been removed from the gallery.';
      if ($('up-publish').checked) {
        setStatus('Publishing…');
        const published = await publishSite();
        doneText = published.ok
          ? 'It will be gone from the site in about a minute.'
          : 'Deleted, but publishing failed (' + published.error + '). It will disappear at the next publish, or with the daily rebuild tomorrow morning.';
      } else {
        doneText = 'Deleted. It will disappear from the site the next time you publish, or with the daily rebuild tomorrow morning.';
      }
      editingId = null;
      clearForm(false);
      setFormMode();
      $('up-done-title').textContent = 'Photo set deleted';
      $('up-done-text').textContent = doneText;
      lastSavedId = null;
      $('up-edit-saved').hidden = true;
      show('done');
      loadSuggestions();
    } finally {
      submitting = false;
    }
  });

  // --- Did you know? facts ---
  // Candidates come from FactsKit (facts-kit.js, shared with the admin
  // panel's Facts tab); publishing writes to the facts table and rebuilds
  // the site so the fact appears on the homepage and /facts/.

  let factProducts = [];
  let publishedFacts = [];

  function factsStatus(text, isError) {
    const el = $('up-facts-status');
    el.textContent = text || '';
    el.classList.toggle('up-status--error', !!isError);
  }

  function actionButton(label, extraClass, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gallery-action' + (extraClass ? ' ' + extraClass : '');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function flash(btn, text) {
    const original = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = original; }, 1600);
  }

  async function loadFactData() {
    const [productsRes, factsRes] = await Promise.all([
      client.from('products').select('*'),
      client.from('facts').select('*').order('created_at', { ascending: false }),
    ]);
    if (!productsRes.error) factProducts = productsRes.data || [];
    if (factsRes.error) {
      factsStatus('Could not load facts: ' + factsRes.error.message, true);
      return;
    }
    publishedFacts = factsRes.data || [];
    renderPublishedFacts();
    makeMissingCards();
  }

  // Facts published before cards were saved online (or from somewhere
  // that didn't save one) get their card made now, then one rebuild so
  // their pages pick it up.
  let makingCards = false;
  async function makeMissingCards() {
    if (makingCards) return;
    makingCards = true;
    try {
      const missing = [];
      for (const fact of publishedFacts) {
        if (!(await window.FactsKit.factCardExists(client, fact))) missing.push(fact);
      }
      if (!missing.length) return;
      factsStatus('Making tweet cards for ' + missing.length + ' fact' + (missing.length === 1 ? '' : 's') + '…');
      let made = 0;
      for (const fact of missing) {
        if (await window.FactsKit.uploadFactCard(client, fact)) made++;
      }
      if (made) {
        const published = await publishSite();
        factsStatus(published.ok ? 'Tweet cards ready. Post to X will show them in about a minute.' : 'Cards saved, but the site rebuild failed (' + published.error + ').', !published.ok);
      } else {
        factsStatus('Could not save the tweet cards. Check the connection and open this tab again.', true);
      }
    } finally {
      makingCards = false;
    }
  }

  function openFacts() {
    show('facts');
    loadFactData();
  }

  const sameFact = (a, b) => window.FactsKit.sameFact(a, b);

  function tweetCount(textarea, countEl) {
    const text = textarea.value.trim();
    // buildTweetText shortens the fact itself when the tweet runs over 280.
    const over = text && !window.FactsKit.buildTweetText(text).includes(text);
    countEl.textContent = over ? 'Too long for one tweet, it will be shortened' : 'Fits in a tweet';
    countEl.classList.toggle('up-fact-count--over', !!over);
  }

  function renderFactChoices() {
    const list = $('up-fact-choices');
    list.innerHTML = '';
    const candidates = window.FactsKit.generateFactCandidates(factProducts)
      .filter((text) => !publishedFacts.some((f) => sameFact(f.text, text)));
    if (!factProducts.length) {
      factsStatus('Could not load the product data to work facts out from.', true);
      return;
    }
    if (!candidates.length) {
      factsStatus('No new facts right now. Every one the data supports is already published; add more products or dates to unlock more.');
      return;
    }
    factsStatus(candidates.length + ' fact' + (candidates.length === 1 ? '' : 's') + ' to choose from. Edit the wording if you like, then tap Use this fact.');
    candidates.forEach((text) => {
      const card = document.createElement('div');
      card.className = 'up-card';
      const area = document.createElement('textarea');
      area.className = 'up-fact-edit';
      area.value = text;
      area.setAttribute('aria-label', 'Fact wording');
      const count = document.createElement('p');
      count.className = 'up-fact-count';
      area.addEventListener('input', () => tweetCount(area, count));
      const use = actionButton('Use this fact', 'gallery-action--primary gallery-action--block', async () => {
        if (await publishFact(area.value, use)) card.remove();
      });
      card.appendChild(area);
      card.appendChild(count);
      card.appendChild(use);
      list.appendChild(card);
      tweetCount(area, count);
    });
  }

  // Saves a fact, makes its tweet card, rebuilds the site. Shared by the
  // generated choices and "Add your own fact". Returns true when saved.
  if ($('up-fact-when')) {
    $('up-fact-when').addEventListener('change', (e) => {
      $('up-fact-date').hidden = e.target.value !== 'date';
      $('up-fact-date').min = new Date().toISOString().slice(0, 10);
    });
  }

  async function publishFact(rawText, button) {
    const finalText = (rawText || '').trim().replace(/\s+/g, ' ');
    if (!finalText) return false;
    if (publishedFacts.some((f) => sameFact(f.text, finalText))) {
      factsStatus('That fact is already published.', true);
      return false;
    }
    // The day it goes on the homepage, if one was chosen above.
    const when = $('up-fact-when') ? $('up-fact-when').value : 'rotation';
    const today = new Date().toISOString().slice(0, 10);
    const pin = when === 'today' ? today : when === 'date' ? $('up-fact-date').value : null;
    if (when === 'date' && !pin) {
      factsStatus('Pick the day to show it on the homepage first.', true);
      return false;
    }
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Publishing…';
    const { data, error, pinSkipped } = await window.FactsKit.insertFact(client, finalText, pin);
    if (error) {
      button.disabled = false;
      button.textContent = label;
      factsStatus('Could not publish: ' + error.message, true);
      return false;
    }
    const row = data && data[0];
    if (row && row.id) await window.FactsKit.uploadFactCard(client, row); // the tweet preview card
    const published = await publishSite();
    const whenText = pin === today ? 'It will be on the homepage in about a minute.'
      : pin ? 'It will be on the homepage on ' + new Date(pin + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + '.'
      : 'It will take its turn on the homepage, and is on the Facts page in about a minute.';
    factsStatus(published.ok
      ? (pinSkipped ? 'Published, but not on a set day yet: run supabase-schema-update-30.sql in Supabase first.' : 'Published. ' + whenText)
      : 'Saved, but the site rebuild failed (' + published.error + '). It will appear at the next publish or the morning rebuild.', !published.ok || !!pinSkipped);
    if ($('up-fact-when')) { $('up-fact-when').value = 'rotation'; $('up-fact-date').hidden = true; }
    button.disabled = false;
    button.textContent = label;
    await loadFactData();
    return true;
  }

  // --- Research a fact with Claude (free: uses the Claude app, not the API) ---
  // Builds a careful research request and opens Claude with it filled in
  // (also copied, in case Claude opens without it).
  const claudeResearchPrompt = (topic) =>
    window.FactsKit.claudeResearchPrompt(topic, publishedFacts.map((f) => f.text));

  $('up-ask-claude').addEventListener('click', () => {
    const topic = $('up-fact-topic').value.trim();
    const note = $('up-ask-claude-note');
    if (!topic) {
      note.textContent = 'Type what the fact should be about first.';
      note.classList.add('up-hint--error');
      $('up-fact-topic').focus();
      return;
    }
    note.classList.remove('up-hint--error');
    const prompt = claudeResearchPrompt(topic);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(prompt).catch(() => {});
    note.textContent = 'Opening Claude. The request is also copied: if it opens empty, paste it in. When Claude replies, copy the fact you like into "Add your own fact" below.';
    window.open('https://claude.ai/new?q=' + encodeURIComponent(prompt), '_blank', 'noopener');
  });

  $('up-own-fact').addEventListener('input', () => tweetCount($('up-own-fact'), $('up-own-fact-count')));
  $('up-own-fact-use').addEventListener('click', async () => {
    if (await publishFact($('up-own-fact').value, $('up-own-fact-use'))) {
      $('up-own-fact').value = '';
      $('up-own-fact-count').textContent = '';
    }
  });

  $('up-generate-facts').addEventListener('click', async () => {
    factsStatus('Working them out…');
    if (!factProducts.length) await loadFactData();
    renderFactChoices();
  });

  // The share sheet has to open straight from the tap, so each card's
  // image is made ahead of time.
  function renderPublishedFacts() {
    const list = $('up-fact-published');
    list.innerHTML = '';
    if (!publishedFacts.length) {
      const empty = document.createElement('p');
      empty.className = 'up-muted';
      empty.textContent = 'Nothing published yet.';
      list.appendChild(empty);
      return;
    }
    publishedFacts.forEach((fact) => list.appendChild(publishedFactCard(fact)));
  }

  function publishedFactCard(fact) {
    const card = document.createElement('div');
    card.className = 'up-card';
    let imageFile = null;
    window.FactsKit.factImageFile(fact.text).then((file) => { imageFile = file; });
    const tweet = () => window.FactsKit.buildTweetText(fact.text, window.FactsKit.factPageUrl(fact), allProducts);

    const text = document.createElement('p');
    text.className = 'up-fact-text';
    text.textContent = fact.text;
    card.appendChild(text);
    if (fact.created_at) {
      const date = document.createElement('p');
      date.className = 'up-fact-date';
      date.textContent = 'Published ' + new Date(fact.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      card.appendChild(date);
    }

    const actions = document.createElement('div');
    actions.className = 'up-fact-actions';

    // Share: text + image card to the share sheet (pick X there).
    const send = actionButton('Share with image', 'gallery-action--primary gallery-action--wide', async () => {
      const data = imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })
        ? { text: tweet(), files: [imageFile] }
        : { text: tweet() };
      if (navigator.share) {
        try {
          await navigator.share(data);
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      copyText(tweet(), send);
    });
    // Post to X links to the fact's page, whose preview is the card. X
    // remembers a preview for days, so wait until the page is live.
    const toX = actionButton('Post to X', '', () => openInX(tweet()));
    toX.disabled = true;
    toX.textContent = 'Checking card…';
    (async function waitForPage(tries) {
      if (!card.isConnected && tries > 0) return;
      if (await window.FactsKit.factPageLive(fact)) {
        toX.disabled = false;
        toX.textContent = 'Post to X';
        return;
      }
      toX.textContent = 'Card ready in a moment…';
      if (tries < 40) setTimeout(() => waitForPage(tries + 1), 15000);
      else toX.textContent = 'Card not live yet';
    })(0);
    const copy = actionButton('Copy text', '', () => copyText(tweet(), copy));
    const save = actionButton('Save image', '', async () => {
      if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
        try {
          await navigator.share({ files: [imageFile] }); // the sheet offers Save Image
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      const link = document.createElement('a');
      link.href = await window.FactsKit.generateFactImage(fact.text);
      link.download = 'apple-sunset-fact.png';
      link.click();
    });
    const edit = actionButton('Edit', '', () => editFact(card, fact));
    const remove = actionButton('Delete', 'gallery-action--danger gallery-action--wide', async () => {
      if (!window.confirm('Delete this fact? It will come off the site.')) return;
      const { error } = await client.from('facts').delete().eq('id', fact.id);
      if (error) {
        factsStatus('Could not delete: ' + error.message, true);
        return;
      }
      card.remove();
      const published = await publishSite();
      factsStatus(published.ok ? 'Deleted. It will be gone from the site in about a minute.' : 'Deleted, but the site rebuild failed (' + published.error + ').', !published.ok);
      loadFactData();
    });
    [send, toX, copy, save, edit, remove].forEach((b) => actions.appendChild(b));
    card.appendChild(actions);
    return card;
  }

  // Opens the X app's composer with the tweet. A Home Screen app can't
  // hand x.com links to the X app (they open in a Safari sheet), so on
  // iPhone this uses the app's own link, and falls back to the website
  // only if the app didn't open.
  function openInX(text) {
    const web = 'https://x.com/intent/post?text=' + encodeURIComponent(text);
    const go = window.__uploadNavigate || ((url) => { window.location.href = url; });
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      window.open(web, '_blank', 'noopener');
      return;
    }
    let left = false;
    const markLeft = () => { left = true; };
    window.addEventListener('blur', markLeft, { once: true });
    document.addEventListener('visibilitychange', markLeft, { once: true });
    go('twitter://post?message=' + encodeURIComponent(text));
    setTimeout(() => {
      window.removeEventListener('blur', markLeft);
      document.removeEventListener('visibilitychange', markLeft);
      if (!left && document.visibilityState === 'visible') go(web);
    }, 2000);
  }

  function copyText(text, btn) {
    const done = () => flash(btn, 'Copied');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => window.prompt('Copy this:', text));
    } else {
      window.prompt('Copy this:', text);
    }
  }

  function editFact(card, fact) {
    card.innerHTML = '';
    const area = document.createElement('textarea');
    area.className = 'up-fact-edit';
    area.value = fact.text;
    area.setAttribute('aria-label', 'Fact wording');
    const count = document.createElement('p');
    count.className = 'up-fact-count';
    area.addEventListener('input', () => tweetCount(area, count));
    const actions = document.createElement('div');
    actions.className = 'up-fact-actions';
    const saveBtn = actionButton('Save', 'gallery-action--primary', async () => {
      const newText = area.value.trim();
      if (!newText) return;
      saveBtn.disabled = true;
      const { error } = await client.from('facts').update({ text: newText }).eq('id', fact.id);
      if (error) {
        saveBtn.disabled = false;
        factsStatus('Could not save: ' + error.message, true);
        return;
      }
      await window.FactsKit.uploadFactCard(client, { id: fact.id, text: newText }); // new wording, new card
      const published = await publishSite();
      factsStatus(published.ok ? 'Saved. The site will update in about a minute.' : 'Saved, but the site rebuild failed (' + published.error + ').', !published.ok);
      loadFactData();
    });
    const cancel = actionButton('Cancel', '', () => card.replaceWith(publishedFactCard(fact)));
    actions.appendChild(saveBtn);
    actions.appendChild(cancel);
    card.appendChild(area);
    card.appendChild(count);
    card.appendChild(actions);
    tweetCount(area, count);
    area.focus();
  }

  start();
})();
