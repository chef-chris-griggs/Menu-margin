const CACHE_NAME = 'menumargin-shell-v1.0.2';
const SHELL = [
  './', './index.html', './styles.css?v=1.0.2', './manifest.webmanifest', './icons/icon.svg',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './vendor/supabase/supabase.js',
  './js/auth.js', './js/recipe.js', './js/pricebook.js', './js/invoice.js', './js/startup.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('menumargin-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match(request).then(response => response || caches.match('./index.html'))));
    return;
  }

  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    });
  }));
});
