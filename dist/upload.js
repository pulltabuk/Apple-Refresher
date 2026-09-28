// Phone upload page (/upload/): pick photos, give them a title, date,
// place and tags, and publish, without opening the admin panel. Uses the
// same Supabase sign-in as the admin panel; the database only accepts
// writes from signed-in users, so the page itself holds no secrets.
(function () {
  const client = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  const MAX_PHOTOS = 12;
  const MAX_EDGE = 3000; // longest side in pixels after resizing
  const JPEG_QUALITY = 0.88;
  const SUGGESTED_TAG_LIMIT = 16;

  const $ = (id) => document.getElementById(id);
  const sections = { loading: $('up-loading'), login: $('up-login'), main: $('up-main'), done: $('up-done') };

  let photos = []; // { id, file, preview, status: 'working'|'done'|'error', url, error, promise }
  let photoSeq = 0;
  let processQueue = Promise.resolve();
  let selectedTags = [];
  let allTags = []; // existing tags, most used first
  let showAllTags = false;
  let submitting = false;

  function show(name) {
    Object.keys(sections).forEach((key) => { sections[key].hidden = key !== name; });
    $('up-footer').hidden = name === 'login' || name === 'loading';
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
    show('login');
  });

  function enterApp(session) {
    $('up-user').textContent = session && session.user ? session.user.email : '';
    show('main');
    loadSuggestions();
  }

  // --- Suggestions: existing tags, places and product names ---

  async function loadSuggestions() {
    const [photosRes, productsRes] = await Promise.all([
      client.from('gallery_photos').select('tags, location, country'),
      client.from('products').select('name'),
    ]);
    const rows = photosRes.data || [];
    const counts = new Map();
    rows.forEach((row) => (row.tags || []).forEach((tag) => {
      const t = String(tag).trim();
      if (t) counts.set(t, (counts.get(t) || 0) + 1);
    }));
    allTags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
    const productNames = (productsRes.data || []).map((p) => p.name).filter(Boolean);
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

  function parseTypedDate(text) {
    const s = (text || '').trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
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
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d))
      .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .replace(',', '');
  }

  const dateInput = $('up-date');
  const dateEcho = $('up-date-echo');
  let dateFromPhoto = false;

  function updateDateEcho(final) {
    const raw = dateInput.value.trim();
    const iso = parseTypedDate(raw);
    dateEcho.classList.toggle('up-hint--error', !!raw && !iso && final);
    // Once the box already reads as the tidy long date, don't repeat it.
    if (iso) dateEcho.textContent = dateInput.value === longDate(iso) ? (dateFromPhoto ? 'Taken from the photo' : '') : longDate(iso) + (dateFromPhoto ? ' (from the photo)' : '');
    else if (raw) dateEcho.textContent = 'Not a date I can read. Try 15 Oct 2024 or 15/10/2024.';
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
    const wasEmpty = photos.length === 0;
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
      img.src = entry.preview;
      img.alt = 'Photo ' + (i + 1);
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
        URL.revokeObjectURL(entry.preview);
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
      const { error } = await client.from('gallery_photos').insert(payload);
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
      $('up-done-title').textContent = count === 1 ? 'Photo uploaded' : count + ' photos uploaded';
      $('up-done-text').textContent = doneText;
      setStatus('');
      show('done');
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

  // Location and country are kept for the next set, since photos taken
  // on the same outing usually share them.
  $('up-again').addEventListener('click', () => {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    photos = [];
    selectedTags = [];
    showAllTags = false;
    $('up-title').value = '';
    setDate(null);
    renderPhotos();
    show('main');
    loadSuggestions();
  });

  start();
})();
