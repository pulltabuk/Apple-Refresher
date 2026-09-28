// Service worker for the phone upload page (/upload/). Serves the page's
// own files from the phone straight away and refreshes them in the
// background, so the Home Screen app opens instantly. Data (Supabase),
// uploads and publishing always go to the network.
const CACHE = 'upload-shell-v1';
const LOCAL_FILES = ['/upload/', '/upload.css', '/upload.js', '/logo.png', '/favicon.png', '/upload.webmanifest'];
const LIBRARY = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.113.0/dist/umd/supabase.js';
const SHELL = LOCAL_FILES.concat(LIBRARY);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(LOCAL_FILES).then(() => cache.add(LIBRARY).catch(() => {})))
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

function shellKey(request) {
  const url = new URL(request.url);
  if (request.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith('/upload')) return '/upload/';
  const key = url.origin === self.location.origin ? url.pathname : url.href;
  return SHELL.includes(key) ? key : null;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const key = shellKey(event.request);
  if (!key) return;
  // Stale-while-revalidate: answer from the cache, then update it.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key);
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) cache.put(key, response.clone());
          return response;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network;
    })
  );
});
