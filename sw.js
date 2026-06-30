/* ============================================================
   SERVICE WORKER — Mélodie's Book
   Version durcie : ne bloque JAMAIS la navigation, même si
   l'installation rencontre un souci (fichier manquant, etc.)
   ============================================================ */

var SW_VERSION = "melodie-v2";
var STATIC_CACHE = SW_VERSION + "-static";
var DATA_CACHE   = SW_VERSION + "-data";
var AUDIO_CACHE  = SW_VERSION + "-audio";

/* Liste réduite au strict nécessaire et garanti présent.
   On NE précharge PAS les CSS optionnels : ils seront mis en
   cache à la volée lors de leur première vraie requête. */
var STATIC_ASSETS = [
  "./dashboard.html",
  "./navbar.js",
  "./pwa-init.js",
  "./offline-data.js",
  "./manifest.json",
  "./offline.html"
];

var SUPABASE_HOST = "tjqicfxkxhlciebmswqu.supabase.co";
var CLOUDINARY_HOST = "res.cloudinary.com";

/* ── INSTALL : précharger, mais ne jamais faire échouer l'installation ── */
self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return Promise.allSettled(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url);
        })
      );
    }).then(function() {
      return self.skipWaiting();
    }).catch(function() {
      /* Même en cas d'erreur globale inattendue, on ne bloque pas l'install */
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (key.indexOf(SW_VERSION) !== 0) {
            return caches.delete(key);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ── Stratégie stale-while-revalidate, robuste face aux erreurs ── */
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(function(cache) {
    return cache.match(request).then(function(cached) {
      var networkFetch = fetch(request).then(function(response) {
        if (response && response.status === 200) {
          cache.put(request, response.clone()).catch(function() {});
        }
        return response;
      }).catch(function() {
        return cached || Response.error();
      });

      return cached || networkFetch;
    });
  }).catch(function() {
    /* Si même l'ouverture du cache échoue, on retombe sur le réseau pur */
    return fetch(request);
  });
}

self.addEventListener("fetch", function(event) {
  var req = event.request;
  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return; /* requête malformée, laisser passer normalement */
  }

  if (req.method !== "GET") {
    return;
  }

  /* Navigation HTML : réseau en priorité, cache en secours, offline.html en dernier recours.
     IMPORTANT : on essaie le réseau D'ABORD pour la navigation, afin de ne jamais
     bloquer un chargement normal à cause d'un cache éventuellement cassé. */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then(function(response) {
        if (response && response.status === 200) {
          caches.open(STATIC_CACHE).then(function(cache) {
            cache.put(req, response.clone()).catch(function() {});
          });
        }
        return response;
      }).catch(function() {
        return caches.match(req).then(function(cached) {
          return cached || caches.match("./offline.html");
        });
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  if (url.hostname === SUPABASE_HOST) {
    if (url.pathname.indexOf("/auth/") !== -1) {
      return;
    }
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }

  if (url.hostname === CLOUDINARY_HOST) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(function(cache) {
        return cache.match(req).then(function(cached) {
          if (cached) return cached;
          return fetch(req).then(function(response) {
            if (response && response.status === 200) {
              cache.put(req, response.clone()).catch(function() {});
            }
            return response;
          });
        });
      }).catch(function() {
        return fetch(req);
      })
    );
    return;
  }
});

self.addEventListener("message", function(event) {
  if (event.data && event.data.type === "CACHE_AUDIO" && event.data.url) {
    caches.open(AUDIO_CACHE).then(function(cache) {
      fetch(event.data.url).then(function(response) {
        if (response && response.status === 200) {
          cache.put(event.data.url, response.clone());
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ ok: true });
          }
        }
      }).catch(function() {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ ok: false });
        }
      });
    });
  }

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
