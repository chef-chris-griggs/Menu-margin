const CACHE_PREFIX = 'menumargin-shell-' + encodeURIComponent(new URL(self.registration.scope).pathname) + '-';
const CACHE_NAME = CACHE_PREFIX + 'v2.0.0-paddleocr';
const cachedResponse = request => caches.open(CACHE_NAME).then(cache => cache.match(request));
const SHELL = [
  './', './index.html', './styles.css?v=1.0.5', './styles/invoice-scanner.css?v=2', './manifest.webmanifest', './icons/icon.svg',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './vendor/supabase/supabase.js',
  './js/auth.js?v=2.0.0-scanner', './js/recipe.js?v=2.0.0-scanner', './js/pricebook.js?v=2.0.0-scanner', './js/invoice.js?v=2.0.0-scanner', './js/startup.js?v=2.0.0-scanner', './vendor/scanner/client.js?v=2.0.0-scanner'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)).catch(() => {}));
      }
      return response;
    }).catch(() => cachedResponse(request).then(response => response || cachedResponse('./index.html'))));
    return;
  }

  event.respondWith(cachedResponse(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {}));
      }
      return response;
    });
  }));
});
