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
  let editingId = null;
  let cachedProducts = [];

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

  async function loadProducts() {
    const { data, error } = await client.from('products').select('*').order('name');
    productListEl.innerHTML = '';
    if (error) {
      productListEl.textContent = 'Could not load products: ' + error.message;
      return;
    }
    cachedProducts = data;
    data.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'admin-row';
      const label = document.createElement('span');
      label.textContent = p.name + (p.discontinued ? ' (discontinued)' : '');
      const actions = document.createElement('span');
      actions.className = 'admin-row-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => editProduct(p.id));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => deleteProduct(p.id));

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(label);
      row.appendChild(actions);
      productListEl.appendChild(row);
    });
  }

  function editProduct(id) {
    const p = cachedProducts.find((x) => x.id === id);
    if (!p) return;
    editingId = id;
    document.getElementById('form-title').textContent = 'Edit product';
    document.getElementById('slug').value = p.slug || '';
    document.getElementById('name').value = p.name || '';
    document.getElementById('category').value = p.category || 'Other';
    document.getElementById('price').value = p.price || '';
    document.getElementById('chip').value = p.chip || '';
    document.getElementById('refresh_history').value = (p.refresh_history || []).join(', ');
    document.getElementById('rumor_note').value = p.rumor_note || '';
    document.getElementById('featured').checked = !!p.featured;
    document.getElementById('discontinued').checked = !!p.discontinued;
    document.getElementById('discontinued_date').value = p.discontinued_date || '';
    document.getElementById('image_url').value = p.image_url || '';
    window.scrollTo(0, 0);
  }

  document.getElementById('new-product-btn').addEventListener('click', () => {
    editingId = null;
    productForm.reset();
    document.getElementById('image_url').value = '';
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
    const historyRaw = document.getElementById('refresh_history').value;
    const refresh_history = historyRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      slug: document.getElementById('slug').value.trim(),
      name: document.getElementById('name').value.trim(),
      category: document.getElementById('category').value,
      price: document.getElementById('price').value.trim() || null,
      chip: document.getElementById('chip').value.trim() || null,
      refresh_history,
      rumor_note: document.getElementById('rumor_note').value.trim() || null,
      featured: document.getElementById('featured').checked,
      discontinued: document.getElementById('discontinued').checked,
      discontinued_date: document.getElementById('discontinued_date').value || null,
      image_url: document.getElementById('image_url').value.trim() || null,
    };

    const result = editingId
      ? await client.from('products').update(payload).eq('id', editingId)
      : await client.from('products').insert(payload);

    if (result.error) {
      window.alert('Save failed: ' + result.error.message);
      return;
    }
    productForm.reset();
    editingId = null;
    document.getElementById('form-title').textContent = 'Add product';
    loadProducts();
  });

  // --- Image upload (shared by product and about forms) ---

  async function uploadImage(file) {
    const path = Date.now() + '-' + file.name.replace(/\s+/g, '-');
    const { error } = await client.storage.from('product-images').upload(path, file);
    if (error) throw error;
    const { data } = client.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
  }

  document.getElementById('image-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      document.getElementById('image_url').value = await uploadImage(file);
    } catch (err) {
      window.alert('Upload failed: ' + err.message);
    }
  });

  document.getElementById('about-image-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      document.getElementById('about_image_url').value = await uploadImage(file);
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
    window.alert('About page saved. It goes live on the next site rebuild.');
  });

  checkSession();
})();
