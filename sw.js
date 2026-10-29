const CACHE_PREFIX = 'menumargin-shell-' + encodeURIComponent(new URL(self.registration.scope).pathname) + '-';
const CACHE_NAME = CACHE_PREFIX + 'v2.0.0-paddleocr';
const cachedResponse = request => caches.open(CACHE_NAME).then(cache => cache.match(request));
const SHELL = [
  './', './index.html', './styles.css?v=1.0.5', './styles/invoice-scanner.css?v=2', './styles/recipe-price-links.css?v=2.1.1', './styles/account.css?v=2.1.1', './privacy.html', './help.html', './terms.html', './manifest.webmanifest', './icons/icon.svg',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './vendor/supabase/supabase.js',
  './js/cloud-data.js?v=2.1.1', './js/site-config.js?v=2.1.1', './js/pricing.js?v=2.1.0', './js/auth-recovery.js?v=2.1.2', './js/auth.js?v=2.1.3-email', './js/recipe.js?v=2.1.1-launch', './js/pricebook.js?v=2.1.1-launch', './js/invoice.js?v=2.1.1-launch', './js/startup.js?v=2.1.3-email', './vendor/scanner/client.js?v=2.0.0-scanner'
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
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {}));
      }
      return response;
    }).catch(() => cachedResponse(request).then(response => response || (url.pathname === new URL(self.registration.scope).pathname || url.pathname.endsWith('/index.html') ? cachedResponse('./index.html') : new Response('This page is unavailable offline. Return to MenuMargin when connected.', {status:503,headers:{'content-type':'text/plain'}})))));
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
