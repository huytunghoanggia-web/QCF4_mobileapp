// ══════════════════════════════════════════════════════════════
// Service Worker — RPAC QC PWA
// Cache app shell để mở offline ngay cả khi chưa có mạng
// ══════════════════════════════════════════════════════════════
var CACHE_NAME = 'rpac-qc-v1';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── Install: cache app shell ──────────────────────────────────
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// ── Activate: xóa cache cũ ────────────────────────────────────
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// ── Fetch: Cache First cho app shell, Network First cho GAS API ──
self.addEventListener('fetch', function(e){
  var url = e.request.url;

  // GAS API calls → network only (không cache)
  if(url.indexOf('script.google.com') >= 0){
    e.respondWith(
      fetch(e.request).catch(function(){
        return new Response(JSON.stringify({ok:false,error:'Offline — không có kết nối mạng'}),
          {headers:{'Content-Type':'application/json'}});
      })
    );
    return;
  }

  // App shell → Cache First
  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached) return cached;
      return fetch(e.request).then(function(response){
        // Cache các file mới lấy về
        if(response && response.status === 200 && response.type === 'basic'){
          var toCache = response.clone();
          caches.open(CACHE_NAME).then(function(cache){
            cache.put(e.request, toCache);
          });
        }
        return response;
      }).catch(function(){
        // Fallback khi offline và không có cache
        if(e.request.destination === 'document'){
          return caches.match('./index.html');
        }
      });
    })
  );
});
