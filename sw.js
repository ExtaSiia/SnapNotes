const CACHE_NAME = 'raccourcis-v2.3';
const ASSETS = [
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://img.icons8.com/3d-fluency/94/bookmark-ribbon.png'
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
