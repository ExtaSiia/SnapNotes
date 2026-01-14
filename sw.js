const CACHE_NAME = 'raccourcis-v1';
const ASSETS = [
    './raccourcis.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://img.icons8.com/3d-fluency/94/bookmark-ribbon.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
