const CACHE_NAME = 'mj-game-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './game.js',
  './network.js',
  './manifest.json',
  // 音效檔案
  './Hopeless.mp3',
  './On cloud nine1.mp3',
  './On cloud nine2.mp3',
  './Sunshine, Rainbow, White Pony.mp3',
  './Wei & Meng.mp3',
  './dllm.mp3',
  './du.mp3',
  './sorry.mp3',
  // CDN 依賴
  'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.css'
];

// 安裝 Service Worker 並快取靜態資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
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
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 攔截網路請求，優先使用快取，如果沒有再發送網路請求 (Cache First 策略，適合靜態遊戲)
self.addEventListener('fetch', (event) => {
  // 忽略非 GET 請求或跨域非靜態資源的複雜請求
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      // 找到快取，直接回傳
      if (response) {
        return response;
      }
      
      // 沒找到快取，發送網路請求，並嘗試將新資源存入快取 (適用於 tiles/ 目錄下的圖片)
      return fetch(event.request).then((networkResponse) => {
        // 確認回應是否有效 (HTTP 200) 且為基本類型
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        
        // 複製一份 response 存入快取 (因為 response stream 只能被讀取一次)
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return networkResponse;
      }).catch(() => {
        // 斷網且沒快取的情況下 (可返回一個 offline 頁面，這裡略過)
        console.warn('Network fetch failed for:', event.request.url);
      });
    })
  );
});
