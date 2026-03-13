const CACHE = 'raagam-v2';
const AUDIO_CACHE = 'raagam-audio-v1';
const PRECACHE = ['/', '/index.html', '/style.css', '/app.js', '/ai-engine.js'];
// Note: songs-db.js and bollywood-songs-db.js are large; cache on first fetch, not precache

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== AUDIO_CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Skip non-GET and external APIs that should always go to network
  if (e.request.method !== 'GET') return;
  if (url.includes('lrclib.net') || url.includes('youtube') || url.includes('googleapis')) return;

  // Audio files — serve from audio cache if available, else network
  if (url.includes('aac.saavncdn.com') || url.includes('.mp4')) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // Image files from CDN — cache-first with network fallback
  if (url.includes('c.saavncdn.com')) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(resp => {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          }).catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // App shell — cache-first, update on network
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(() => {
      // Offline fallback for navigation
      if (e.request.mode === 'navigate') return caches.match('/index.html');
      return new Response('', { status: 503 });
    }))
  );
});

// Handle messages from the app for cache management
self.addEventListener('message', e => {
  if (e.data.type === 'CACHE_AUDIO') {
    const { audioUrl, imageUrl } = e.data;
    e.waitUntil(
      caches.open(AUDIO_CACHE).then(async cache => {
        const promises = [];
        if (audioUrl) promises.push(cache.add(audioUrl).catch(() => {}));
        if (imageUrl) promises.push(caches.open(CACHE).then(c => c.add(imageUrl)).catch(() => {}));
        await Promise.all(promises);
        // Notify all clients of completion
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({ type: 'CACHE_COMPLETE', audioUrl }));
      })
    );
  }

  if (e.data.type === 'UNCACHE_AUDIO') {
    const { audioUrl, imageUrl } = e.data;
    e.waitUntil(
      caches.open(AUDIO_CACHE).then(async cache => {
        if (audioUrl) await cache.delete(audioUrl).catch(() => {});
        // Don't delete images — they may be shared
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({ type: 'UNCACHE_COMPLETE', audioUrl }));
      })
    );
  }

  if (e.data.type === 'GET_CACHE_SIZE') {
    e.waitUntil(
      caches.open(AUDIO_CACHE).then(async cache => {
        const keys = await cache.keys();
        let totalSize = 0;
        for (const req of keys) {
          const resp = await cache.match(req);
          if (resp) {
            const blob = await resp.clone().blob();
            totalSize += blob.size;
          }
        }
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({
          type: 'CACHE_SIZE',
          size: totalSize,
          count: keys.length
        }));
      })
    );
  }

  if (e.data.type === 'IS_CACHED') {
    const { audioUrl } = e.data;
    e.waitUntil(
      caches.open(AUDIO_CACHE).then(async cache => {
        const resp = await cache.match(audioUrl);
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({
          type: 'IS_CACHED_RESULT',
          audioUrl,
          cached: !!resp
        }));
      })
    );
  }
});
