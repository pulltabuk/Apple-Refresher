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
  const imageThumbsEl = document.getElementById('image-thumbs');
  const videoStatusEl = document.getElementById('video-status');

  const MAX_IMAGES = 6;
  let editingId = null;
  let editingSlug = null;
  let cachedProducts = [];
  let currentRefreshHistory = [];
  let currentImageUrls = [];
  let currentVideoUrl = null;

  function slugify(name) {
    return (name || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '');
  }

  // --- Tabs ---

  document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      document.getElementById('tab-products').style.display = tab === 'products' ? 'block' : 'none';
      document.getElementById('tab-about').style.display = tab === 'about' ? 'block' : 'none';
    });
  });

  async function showDashboard() {
    loginSection.style.display = 'none';
    dashboard.style.display = 'block';
    await loadProducts();
    loadAbout();
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (editId) editProduct(editId);
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

    // "Replaced by" picker: the value saved is the product's slug, the
    // label shown is its name.
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
      const thumbUrl = (p.image_urls && p.image_urls[0]) || p.image_url;
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

      const nameTd = document.createElement('td');
      nameTd.textContent = p.name;

      const categoryTd = document.createElement('td');
      categoryTd.textContent = p.category || '';

      const priceTd = document.createElement('td');
      priceTd.textContent = p.price || '\u2014';

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

  document.getElementById('add-refresh-date-btn').addEventListener('click', () => {
    const input = document.getElementById('new-refresh-date');
    if (!input.value) return;
    if (currentRefreshHistory.indexOf(input.value) === -1) {
      currentRefreshHistory.push(input.value);
      currentRefreshHistory.sort();
    }
    input.value = '';
    renderRefreshHistory();
  });

  function renderImageThumbs() {
    imageThumbsEl.innerHTML = '';
    currentImageUrls.forEach((url, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'admin-thumb';
      const img = document.createElement('img');
      img.src = url;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '\u00d7';
      removeBtn.setAttribute('aria-label', 'Remove photo');
      removeBtn.addEventListener('click', () => {
        currentImageUrls.splice(i, 1);
        renderImageThumbs();
      });
      wrap.appendChild(img);
      wrap.appendChild(removeBtn);
      imageThumbsEl.appendChild(wrap);
    });
  }

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
    document.getElementById('form-title').textContent = 'Edit product';
    document.getElementById('name').value = p.name || '';
    document.getElementById('category').value = p.category || '';
    document.getElementById('price').value = p.price || '';
    document.getElementById('chip').value = p.chip || '';
    document.getElementById('external_link').value = p.external_link || '';
    document.getElementById('rumor_note').value = p.rumor_note || '';
    document.getElementById('featured').checked = !!p.featured;
    document.getElementById('coming_soon').checked = !!p.coming_soon;
    document.getElementById('expected_date').value = p.expected_date || '';
    document.getElementById('discontinued').checked = !!p.discontinued;
    document.getElementById('discontinued_date').value = p.discontinued_date || '';
    document.getElementById('replaced_by').value = p.replaced_by || '';
    document.getElementById('discontinued_reason').value = p.discontinued_reason || '';
    currentRefreshHistory = (p.refresh_history || []).slice();
    currentImageUrls = (p.image_urls && p.image_urls.length ? p.image_urls : p.image_url ? [p.image_url] : []).slice();
    currentVideoUrl = p.video_url || null;
    renderRefreshHistory();
    renderImageThumbs();
    renderVideoStatus();
    document.getElementById('form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.getElementById('new-product-btn').addEventListener('click', () => {
    editingId = null;
    editingSlug = null;
    productForm.reset();
    currentRefreshHistory = [];
    currentImageUrls = [];
    currentVideoUrl = null;
    renderRefreshHistory();
    renderImageThumbs();
    renderVideoStatus();
    document.getElementById('form-title').textContent = 'Add product';
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
        chip: document.getElementById('chip').value.trim() || null,
        external_link: document.getElementById('external_link').value.trim() || null,
        refresh_history: currentRefreshHistory,
        rumor_note: document.getElementById('rumor_note').value.trim() || null,
        featured: document.getElementById('featured').checked,
        coming_soon: document.getElementById('coming_soon').checked,
        expected_date: document.getElementById('expected_date').value || null,
        discontinued: document.getElementById('discontinued').checked,
        discontinued_date: document.getElementById('discontinued_date').value || null,
        replaced_by: document.getElementById('replaced_by').value.trim() || null,
        discontinued_reason: document.getElementById('discontinued_reason').value.trim() || null,
        image_urls: currentImageUrls,
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
      editingId = null;
      editingSlug = null;
      currentRefreshHistory = [];
      currentImageUrls = [];
      currentVideoUrl = null;
      renderRefreshHistory();
      renderImageThumbs();
      renderVideoStatus();
      document.getElementById('form-title').textContent = 'Add product';
      loadProducts();
    } catch (err) {
      console.error('Unexpected error while saving:', err);
      window.alert('Something went wrong saving this product: ' + err.message + '. Check the browser console for the full error.');
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

  document.getElementById('image-upload').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_IMAGES - currentImageUrls.length;
    if (remaining <= 0) {
      window.alert('You already have 6 photos, remove one first.');
      e.target.value = '';
      return;
    }
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      window.alert('Only ' + remaining + ' more photo(s) can be added (6 max), the rest were skipped.');
    }
    for (const file of toUpload) {
      try {
        const url = await uploadFile(file);
        currentImageUrls.push(url);
        renderImageThumbs();
      } catch (err) {
        window.alert('Upload failed: ' + err.message + '. Check the browser console for details, and that the product-images bucket exists, is Public, and the storage upload policy has been run.');
      }
    }
    e.target.value = '';
  });

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
