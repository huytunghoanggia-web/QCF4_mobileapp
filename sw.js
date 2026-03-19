// ══════════════════════════════════════════════════════════════
// Service Worker — RPAC QC PWA v2
// Chiến lược: Cache First cho app shell, offline hoàn toàn
// ══════════════════════════════════════════════════════════════
var CACHE_VERSION = 'rpac-qc-v2';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── Install: cache TOÀN BỘ app shell ngay khi cài ─────────────
self.addEventListener('install', function(e){
  console.log('[SW] Installing, caching app shell...');
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache){
      // addAll: thất bại 1 file → toàn bộ thất bại
      // Dùng add từng file để không bị block nếu icon lỗi
      var promises = APP_SHELL.map(function(url){
        return cache.add(url).catch(function(err){
          console.warn('[SW] Failed to cache:', url, err);
        });
      });
      return Promise.all(promises);
    })
  );
  // Kích hoạt ngay, không chờ tab cũ đóng
  self.skipWaiting();
});

// ── Activate: dọn cache phiên bản cũ ─────────────────────────
self.addEventListener('activate', function(e){
  console.log('[SW] Activating, cleaning old caches...');
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_VERSION; })
            .map(function(k){
              console.log('[SW] Deleting old cache:', k);
              return caches.delete(k);
            })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', function(e){
  var url = e.request.url;
  var method = e.request.method;

  // Chỉ xử lý GET
  if(method !== 'GET') return;

  // GAS API (script.google.com) → Network Only
  // Nếu offline → trả JSON lỗi để app xử lý
  if(url.indexOf('script.google.com') >= 0){
    e.respondWith(
      fetch(e.request.clone()).catch(function(){
        return new Response(
          JSON.stringify({ok:false,error:'offline'}),
          {status:200, headers:{'Content-Type':'application/json'}}
        );
      })
    );
    return;
  }

  // Google Drive (ảnh) → Network Only, không cache
  if(url.indexOf('drive.google.com') >= 0 ||
     url.indexOf('lh3.googleusercontent.com') >= 0){
    e.respondWith(
      fetch(e.request).catch(function(){
        return new Response('', {status: 503});
      })
    );
    return;
  }

  // App shell (index.html, manifest, icons) → Cache First
  // Nếu có trong cache → dùng ngay (offline OK)
  // Nếu không → fetch rồi cache lại
  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached){
        // Có cache → dùng ngay, đồng thời cập nhật ngầm
        var fetchUpdate = fetch(e.request.clone()).then(function(response){
          if(response && response.status === 200){
            caches.open(CACHE_VERSION).then(function(cache){
              cache.put(e.request, response.clone());
            });
          }
          return response;
        }).catch(function(){ /* offline OK, đã có cache */ });
        return cached;
      }

      // Không có cache → fetch
      return fetch(e.request.clone()).then(function(response){
        if(response && response.status === 200){
          var toCache = response.clone();
          caches.open(CACHE_VERSION).then(function(cache){
            cache.put(e.request, toCache);
          });
        }
        return response;
      }).catch(function(){
        // Offline + không có cache → trả index.html (SPA fallback)
        if(e.request.destination === 'document'){
          return caches.match('./index.html');
        }
        return new Response('', {status: 503});
      });
    })
  );
});

// ── Message: force update cache khi QC nhấn Refresh ──────────
self.addEventListener('message', function(e){
  if(e.data && e.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
  if(e.data && e.data.type === 'UPDATE_CACHE'){
    // Xóa cache cũ rồi re-cache app shell
    caches.delete(CACHE_VERSION).then(function(){
      return caches.open(CACHE_VERSION);
    }).then(function(cache){
      return cache.addAll(APP_SHELL);
    }).then(function(){
      // Báo lại cho page
      self.clients.matchAll().then(function(clients){
        clients.forEach(function(c){
          c.postMessage({type:'CACHE_UPDATED'});
        });
      });
    });
  }
});
