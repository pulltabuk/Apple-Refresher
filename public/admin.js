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
  let editingSlug = null;
  let cachedProducts = [];
  let currentRefreshHistory = [];
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

  const DATE_FIELD_PREFIXES = ['original_launch_date', 'expected_date', 'discontinued_date', 'new_refresh_date', 'gallery_date_taken'];
  DATE_FIELD_PREFIXES.forEach(wireDatePrecisionField);

  document.querySelectorAll('.date-precision-clear').forEach((btn) => {
    btn.addEventListener('click', () => {
      setDatePrecisionValue(btn.getAttribute('data-prefix'), null);
    });
  });

  // --- Tabs ---

  let galleryLoaded = false;
  document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      document.getElementById('tab-products').style.display = tab === 'products' ? 'block' : 'none';
      document.getElementById('tab-gallery').style.display = tab === 'gallery' ? 'block' : 'none';
      document.getElementById('tab-about').style.display = tab === 'about' ? 'block' : 'none';
      if (tab === 'gallery' && !galleryLoaded) {
        galleryLoaded = true;
        loadGalleryPhotos();
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
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    if (editId) {
      editProduct(editId);
    } else if (params.get('new')) {
      startNewProduct();
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

  const DEFAULT_CATEGORIES = ['iPhone', 'Mac', 'iPad', 'Apple Watch', 'AirPods', 'Vision Pro', 'Other'];

  function updateCategoryOptions() {
    const categoryOptions = document.getElementById('category-options');
    const categories = new Set(DEFAULT_CATEGORIES);
    cachedProducts.forEach((p) => { if (p.category) categories.add(p.category); });
    categoryOptions.innerHTML = '';
    categories.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      categoryOptions.appendChild(opt);
    });

    // "Replaced by" / "Previous model" pickers: the value saved is the
    // product's slug, the label shown is its name.
    const productOptions = document.getElementById('product-options');
    productOptions.innerHTML = '';
    cachedProducts.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.slug;
      opt.label = p.name;
      opt.textContent = p.name;
      productOptions.appendChild(opt);
    });
  }

  async function loadProducts() {
    const { data, error } = await client.from('products').select('*').order('name');
    productListEl.innerHTML = '';
    if (error) {
      productListEl.textContent = 'Could not load products: ' + error.message;
      return;
    }
    cachedProducts = data;
    updateCategoryOptions();

    if (!data.length) {
      productListEl.textContent = 'No products yet, add your first one below.';
      return;
    }

    const table = document.createElement('table');
    table.className = 'admin-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Status</th><th></th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.forEach((p) => {
      const tr = document.createElement('tr');

      const photoTd = document.createElement('td');
      photoTd.className = 'admin-table-photo';
      const placeholder = document.createElement('span');
      placeholder.className = 'admin-table-photo-placeholder';
      photoTd.appendChild(placeholder);

      const nameTd = document.createElement('td');
      const nameLink = document.createElement('a');
      nameLink.href = '/products/' + p.slug + '/';
      nameLink.target = '_blank';
      nameLink.rel = 'noopener';
      nameLink.textContent = p.name;
      nameTd.appendChild(nameLink);

      const categoryTd = document.createElement('td');
      categoryTd.textContent = p.category || '';

      const priceTd = document.createElement('td');
      priceTd.textContent = p.price ? (/^[£$€]/.test(p.price.trim()) ? p.price : '£' + p.price) : '\u2014';

      const statusTd = document.createElement('td');
      statusTd.textContent = p.discontinued ? 'Discontinued' : p.coming_soon ? 'Coming soon' : 'Active';

      const actionsTd = document.createElement('td');
      actionsTd.className = 'admin-row-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => editProduct(p.id));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => deleteProduct(p.id));

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(deleteBtn);

      tr.appendChild(photoTd);
      tr.appendChild(nameTd);
      tr.appendChild(categoryTd);
      tr.appendChild(priceTd);
      tr.appendChild(statusTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    productListEl.appendChild(table);
  }

  function renderRefreshHistory() {
    refreshHistoryListEl.innerHTML = '';
    currentRefreshHistory.forEach((date, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = date;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        currentRefreshHistory.splice(i, 1);
        renderRefreshHistory();
      });
      li.appendChild(span);
      li.appendChild(removeBtn);
      refreshHistoryListEl.appendChild(li);
    });
  }

  const richTextEditor = document.getElementById('rumor_note_editor');
  if (document.queryCommandSupported && document.queryCommandSupported('defaultParagraphSeparator')) {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  }

  document.querySelectorAll('.richtext-toolbar [data-cmd]').forEach((btn) => {
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
    const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const paragraphs = extractParagraphs(richTextEditor);
    richTextEditor.innerHTML = paragraphs.map((p) => '<p>' + escapeText(p) + '</p>').join('');
  });

  function addRefreshDateFromWidget() {
    const value = getDatePrecisionValue('new_refresh_date');
    if (!value) return;
    if (currentRefreshHistory.indexOf(value) === -1) {
      currentRefreshHistory.push(value);
      currentRefreshHistory.sort();
    }
    setDatePrecisionValue('new_refresh_date', null);
    renderRefreshHistory();
  }

  document.getElementById('add-refresh-date-btn').addEventListener('click', addRefreshDateFromWidget);
  ['new_refresh_date_day', 'new_refresh_date_month', 'new_refresh_date_year'].forEach((id) => {
    document.getElementById(id).addEventListener('change', addRefreshDateFromWidget);
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

  function editProduct(id) {
    const p = cachedProducts.find((x) => x.id === id);
    if (!p) return;
    editingId = id;
    editingSlug = p.slug;
    if (window.history && window.history.pushState) {
      window.history.pushState({}, '', '/admin/?edit=' + id);
    }
    document.getElementById('form-title').textContent = 'Edit product';
    document.getElementById('name').value = p.name || '';
    document.getElementById('category').value = p.category || '';
    document.getElementById('price').value = p.price || '';
    document.getElementById('external_link').value = p.external_link || '';
    document.getElementById('apple_url').value = p.apple_url || '';
    document.getElementById('apple_url_unavailable').checked = !!p.apple_url_unavailable;
    document.getElementById('rumor_note_editor').innerHTML = p.rumor_note || '';
    document.getElementById('featured').checked = !!p.featured;
    document.getElementById('coming_soon').checked = !!p.coming_soon;
    document.getElementById('discontinued').checked = !!p.discontinued;
    document.getElementById('replaced_by').value = p.replaced_by || '';
    document.getElementById('discontinued_reason').value = p.discontinued_reason || '';
    document.getElementById('previous_model').value = p.previous_model || '';
    document.getElementById(p.days_basis === 'launch' ? 'days_basis_launch' : 'days_basis_refresh').checked = true;
    document.getElementById('is_new_launch').checked = !!p.is_new_launch;
    setDatePrecisionValue('original_launch_date', p.original_launch_date || null);
    setDatePrecisionValue('expected_date', p.expected_date || null);
    setDatePrecisionValue('discontinued_date', p.discontinued_date || null);
    setDatePrecisionValue('new_refresh_date', null);
    currentRefreshHistory = (p.refresh_history || []).slice();
    currentVideoUrl = p.video_url || null;
    renderRefreshHistory();
    renderVideoStatus();
    showProductForm();
  }

  function startNewProduct() {
    editingId = null;
    editingSlug = null;
    if (window.history && window.history.pushState) {
      window.history.pushState({}, '', '/admin/?new=1');
    }
    productForm.reset();
    document.getElementById('rumor_note_editor').innerHTML = '';
    setDatePrecisionValue('original_launch_date', null);
    setDatePrecisionValue('expected_date', null);
    setDatePrecisionValue('discontinued_date', null);
    setDatePrecisionValue('new_refresh_date', null);
    currentRefreshHistory = [];
    currentVideoUrl = null;
    renderRefreshHistory();
    renderVideoStatus();
    document.getElementById('form-title').textContent = 'Add product';
    showProductForm();
  }

  document.getElementById('new-product-btn').addEventListener('click', startNewProduct);

  document.getElementById('back-to-list-btn').addEventListener('click', () => {
    if (window.history && window.history.pushState) {
      window.history.pushState({}, '', '/admin/');
    }
    showProductList();
  });

  async function deleteProduct(id) {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;
    const { error } = await client.from('products').delete().eq('id', id);
    if (error) {
      window.alert('Delete failed: ' + error.message);
      return;
    }
    loadProducts();
  }

  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const name = document.getElementById('name').value.trim();
      const slug = editingId ? editingSlug : slugify(name);

      const payload = {
        slug,
        name,
        category: document.getElementById('category').value.trim() || 'Other',
        price: document.getElementById('price').value.trim() || null,
        external_link: document.getElementById('external_link').value.trim() || null,
        apple_url: document.getElementById('apple_url').value.trim() || null,
        apple_url_unavailable: document.getElementById('apple_url_unavailable').checked,
        refresh_history: currentRefreshHistory,
        original_launch_date: getDatePrecisionValue('original_launch_date'),
        rumor_note: (function () {
          const html = document.getElementById('rumor_note_editor').innerHTML.trim();
          return html && html !== '<br>' ? html : null;
        })(),
        featured: document.getElementById('featured').checked,
        days_basis: document.querySelector('input[name="days_basis"]:checked').value,
        is_new_launch: document.getElementById('is_new_launch').checked,
        previous_model: document.getElementById('previous_model').value.trim() || null,
        coming_soon: document.getElementById('coming_soon').checked,
        expected_date: getDatePrecisionValue('expected_date'),
        discontinued: document.getElementById('discontinued').checked,
        discontinued_date: getDatePrecisionValue('discontinued_date'),
        replaced_by: document.getElementById('replaced_by').value.trim() || null,
        discontinued_reason: document.getElementById('discontinued_reason').value.trim() || null,
        video_url: currentVideoUrl,
      };

      const result = editingId
        ? await client.from('products').update(payload).eq('id', editingId)
        : await client.from('products').insert(payload);

      if (result.error) {
        console.error('Save failed:', result.error);
        window.alert('Save failed: ' + result.error.message);
        return;
      }
      productForm.reset();
      document.getElementById('rumor_note_editor').innerHTML = '';
      setDatePrecisionValue('original_launch_date', null);
      setDatePrecisionValue('expected_date', null);
      setDatePrecisionValue('discontinued_date', null);
      setDatePrecisionValue('new_refresh_date', null);
      editingId = null;
      editingSlug = null;
      currentRefreshHistory = [];
      currentVideoUrl = null;
      renderRefreshHistory();
      renderVideoStatus();
      document.getElementById('form-title').textContent = 'Add product';
      await loadProducts();
      if (window.history && window.history.pushState) {
        window.history.pushState({}, '', '/admin/');
      }
      showProductList();
    } catch (err) {
      console.error('Unexpected error while saving:', err);
      window.alert('Something went wrong saving this product: ' + err.message + '. Check the browser console for the full error.');
    }
  });

  // --- Gallery ---

  let cachedGalleryPhotos = [];
  let editingGalleryId = null;
  let currentGalleryTags = [];
  let currentGalleryImageUrl = null;

  const galleryListView = document.getElementById('gallery-list-view');
  const galleryFormView = document.getElementById('gallery-form-view');
  const galleryListEl = document.getElementById('gallery-list');
  const galleryForm = document.getElementById('gallery-form');
  const galleryTagsListEl = document.getElementById('gallery-tags-list');
  const galleryImageThumbEl = document.getElementById('gallery-image-thumb');

  function showGalleryList() {
    galleryListView.style.display = 'block';
    galleryFormView.style.display = 'none';
  }

  function showGalleryForm() {
    galleryListView.style.display = 'none';
    galleryFormView.style.display = 'block';
    window.scrollTo(0, 0);
  }

  async function loadGalleryPhotos() {
    const { data, error } = await client.from('gallery_photos').select('*').order('created_at', { ascending: false });
    galleryListEl.innerHTML = '';
    if (error) {
      galleryListEl.textContent = 'Could not load gallery photos: ' + error.message + ' (has supabase-schema-update-9.sql been run?)';
      return;
    }
    cachedGalleryPhotos = data;
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
      if (photo.image_url) {
        const img = document.createElement('img');
        img.src = photo.image_url;
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

  function renderGalleryImageThumb() {
    galleryImageThumbEl.innerHTML = '';
    if (!currentGalleryImageUrl) return;
    const wrap = document.createElement('div');
    wrap.className = 'admin-thumb';
    const img = document.createElement('img');
    img.src = currentGalleryImageUrl;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '\u00d7';
    removeBtn.setAttribute('aria-label', 'Remove photo');
    removeBtn.addEventListener('click', () => {
      currentGalleryImageUrl = null;
      renderGalleryImageThumb();
    });
    wrap.appendChild(img);
    wrap.appendChild(removeBtn);
    galleryImageThumbEl.appendChild(wrap);
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
    const file = e.target.files[0];
    if (!file) return;
    try {
      currentGalleryImageUrl = await uploadFile(file);
      renderGalleryImageThumb();
    } catch (err) {
      window.alert('Upload failed: ' + err.message);
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
    setDatePrecisionValue('gallery_date_taken', photo.date_taken || null);
    currentGalleryTags = (photo.tags || []).slice();
    currentGalleryImageUrl = photo.image_url || null;
    renderGalleryTags();
    renderGalleryImageThumb();
    showGalleryForm();
  }

  function startNewGalleryPhoto() {
    editingGalleryId = null;
    galleryForm.reset();
    setDatePrecisionValue('gallery_date_taken', null);
    currentGalleryTags = [];
    currentGalleryImageUrl = null;
    renderGalleryTags();
    renderGalleryImageThumb();
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
    if (!currentGalleryImageUrl) {
      window.alert('Add a photo first.');
      return;
    }
    try {
      const payload = {
        image_url: currentGalleryImageUrl,
        caption: document.getElementById('gallery-caption').value.trim() || null,
        date_taken: getDatePrecisionValue('gallery_date_taken'),
        location: document.getElementById('gallery-location').value.trim() || null,
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
      currentGalleryImageUrl = null;
      renderGalleryTags();
      renderGalleryImageThumb();
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
