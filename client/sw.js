// 모두의 퀴즈 PWA Service Worker
const CACHE_NAME = 'quiz-game-cache-v2';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('PWA precache partial failure:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key.startsWith('quiz-game-cache-') && key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Public assets may be reused for one hour. Code/shell still checks the network;
// API responses and other origins are never stored in this application cache.
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and http/https schemes
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.headers.has('range'))return;

  event.respondWith(
    (async()=>{
      const cache=await caches.open(CACHE_NAME);
      if(url.pathname.startsWith('/assets/')){
        const cached=await cache.match(event.request);
        const savedAt=cached?Date.parse(cached.headers.get('Date')):NaN;
        if(cached&&Number.isFinite(savedAt)&&Date.now()-savedAt<3600000)return cached;
      }
      try {
        const response=await fetch(event.request);
        if(response.status===200)event.waitUntil(cache.put(event.request,response.clone()).catch(()=>{}));
        return response;
      } catch(error) {
        const cached=await cache.match(event.request);
        if(cached)return cached;
        throw error;
      }
    })()
  );
});
