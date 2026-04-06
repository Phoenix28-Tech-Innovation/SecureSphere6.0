const CACHE_NAME = 'securesphere-static-v1';
const DYNAMIC_CACHE = 'securesphere-dynamic-v1';

// Get the base path dynamically (works on GitHub Pages subpaths)
const getBasePath = () => {
  try {
    const pathname = self.location.pathname;
    // Return the full path without the sw.js filename
    return pathname.substring(0, pathname.lastIndexOf('/')) || '/';
  } catch (e) {
    return '/';
  }
};

const BASE_PATH = getBasePath();

const ASSETS = [
  BASE_PATH,
  BASE_PATH + '/index.html',
  BASE_PATH + '/Style.css',
  BASE_PATH + '/app.js',
  BASE_PATH + '/api-client.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // API or health endpoints: try cache first, update in background
  if (url.hostname === location.hostname && (url.pathname.startsWith('/api') || url.pathname.startsWith('/health'))) {
    event.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          try { caches.open(DYNAMIC_CACHE).then(cache => cache.put(req, res.clone())); } catch(e){}
          return res;
        }).catch(() => null);
        return cached || network || new Response(null, { status: 503, statusText: 'Service Unavailable' });
      })
    );
    return;
  }

  // For same-origin GET requests try cache-first, then network
  if (req.method === 'GET' && url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        try { caches.open(DYNAMIC_CACHE).then(cache => cache.put(req, res.clone())); } catch(e){}
        return res;
      }).catch(() => caches.match('/index.html')))
    );
    return;
  }

  // Fallback to network for other requests
  event.respondWith(fetch(req));
});
