const CACHE_NAME = 'admin-os10-v1';
const ASSETS = [
  './admin.html',
  './style.css?v=2.6',
  './app.js?v=2.6',
  './logo-os10.webp',
  './favicon/favicon.ico',
  './favicon/site.webmanifest',
  './favicon/web-app-manifest-192x192.png',
  './favicon/web-app-manifest-512x512.png'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('Pre-cache warning: Some assets could not be cached on install.', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Network falling back to cache, or Cache falling back to network)
self.addEventListener('fetch', (e) => {
  // We handle local GET requests
  if (e.request.method === 'GET' && e.request.url.startsWith(self.location.origin)) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          // If valid response, clone and update cache
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, serve from cache
          return caches.match(e.request);
        })
    );
  }
});
