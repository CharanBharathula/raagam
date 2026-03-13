const CACHE = 'raagam-v1';
const PRECACHE = ['/', '/index.html', '/style.css', '/app.js', '/ai-engine.js', '/songs-db.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first for API/external, cache-first for app shell
  if (e.request.url.includes('lrclib.net') || e.request.url.includes('youtube') || e.request.url.includes('googleapis')) {
    return; // let these go to network
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return resp;
    }))
  );
});
