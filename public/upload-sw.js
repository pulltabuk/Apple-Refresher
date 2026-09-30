// Service worker for the phone upload page (/upload/). Fetches the page's
// own files fresh each time (so changes show up straight away) and keeps
// a saved copy to fall back on when the network is slow or offline. Data
// (Supabase), uploads and publishing always go to the network.
const CACHE = 'upload-shell-v3';
const LOCAL_FILES = ['/upload/', '/upload.css', '/upload.js', '/facts-kit.js', '/logo.png', '/favicon.png', '/upload.webmanifest'];
const LIBRARY = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.113.0/dist/umd/supabase.js';
const NETWORK_WAIT_MS = 2500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(LOCAL_FILES.map((f) => fetch(f, { cache: 'reload' }).then((r) => r.ok && cache.put(f, r))))
        .then(() => cache.add(LIBRARY).catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('upload-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Which cached copy a request maps to (query strings such as ?v= ignored).
function cacheKey(request) {
  const url = new URL(request.url);
  if (url.href === LIBRARY) return LIBRARY;
  if (url.origin !== self.location.origin) return null;
  if (request.mode === 'navigate' && url.pathname.startsWith('/upload')) return '/upload/';
  return LOCAL_FILES.includes(url.pathname) ? url.pathname : null;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const key = cacheKey(event.request);
  if (!key) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key);
      // The pinned library never changes: the saved copy is always right.
      if (key === LIBRARY && cached) return cached;
      // Everything else: latest from the network first, so changes show up
      // straight away; the saved copy only if the network is slow or offline.
      const network = fetch(key === '/upload/' ? '/upload/' : event.request.url, { cache: 'no-cache' })
        .then((response) => {
          if (response && response.ok) cache.put(key, response.clone());
          return response;
        });
      if (!cached) return network;
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_WAIT_MS));
      const winner = await Promise.race([network.catch(() => null), timeout]);
      if (winner && winner.ok) return winner;
      event.waitUntil(network.catch(() => {}));
      return cached;
    })
  );
});
