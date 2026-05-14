const CACHE_NAME = 'happvpn-v1';
const STATIC_ASSETS = [
    '/',
    '/style.css',
    '/app.js',
    '/icon-512.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    // API requests — network only
    if (e.request.url.includes('/api/')) {
        return e.respondWith(fetch(e.request));
    }
    // Static — cache first, then network
    e.respondWith(
        caches.match(e.request).then(cached => {
            const fetched = fetch(e.request).then(res => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => cached);
            return cached || fetched;
        })
    );
});
