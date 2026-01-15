const CACHE_NAME = 'raccourcis-v3.3';
const ASSETS = [
    './index.html',
    './style.css',
    './js/app.js',
    './js/modules/state.js',
    './js/modules/utils.js',
    './js/modules/crypto.js',
    './js/modules/db.js',
    './js/modules/ui.js',
    './assets/logo_clair.png',
    './assets/logo_sombre.png',
    './assets/favicon.png',
    './manifest.json'
];

// Install: Cache files & Force activation
self.addEventListener('install', (e) => {
    self.skipWaiting(); // IMPORTANT: takeover immediately
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

// Activate: Clean up old caches & Claim clients
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        }).then(() => self.clients.claim()) // IMPORTANT: control open tabs
    );
});

// Fetch: Cache First
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
