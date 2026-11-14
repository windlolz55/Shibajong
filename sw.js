const CACHE_NAME = 'mj-game-cache-v3.12';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './audio.js',
  './game.js',
  './rules.js',
  './bot.js',
  './network.js',
  './ui.js',
  './app.js',
  './manifest.json',
  // 音效檔案
  './Hopeless.mp3',
  './On cloud nine1.mp3',
  './On cloud nine2.mp3',
  './Sunshine, Rainbow, White Pony.mp3',
  './Wei & Meng.mp3',
  './dllm.mp3',
  './du.mp3',
  './sorry.mp3'
];

// 安裝 Service Worker 並快取靜態資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 清理舊的快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 攔截網路請求：HTML/JS/CSS 採用 Network-First（確保版本即時更新），圖片與音效採用 Cache-First
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isCodeOrDoc =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('/');

  if (isCodeOrDoc) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response;
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          return networkResponse;
        })
        .catch(() => {});
    })
  );
});
