/* ============================================================
   SERVICE WORKER — Mélodie's Book
   Stratégie : stale-while-revalidate partout.
   - Le cache répond IMMÉDIATEMENT si disponible (app perçue comme native).
   - En parallèle, une requête réseau rafraîchit le cache pour la prochaine fois.
   - Si le réseau échoue (offline), le cache reste la seule source : ok.
   - Si rien n'est en cache et pas de réseau : erreur visible (géré côté page).
   ============================================================ */

var SW_VERSION = "melodie-v1";
var STATIC_CACHE = SW_VERSION + "-static";
var DATA_CACHE   = SW_VERSION + "-data";
var AUDIO_CACHE  = SW_VERSION + "-audio";

/* Pages et assets statiques mis en cache dès l'installation.
   Liste volontairement large : toutes les pages de LECTURE (pas d'action d'écriture). */
var STATIC_ASSETS = [
  "./",
  "./dashboard.html",
  "./repertoire.html",
  "./chanson.html",
  "./themes.html",
  "./historique.html",
  "./bibliotheque.html",
  "./programme.html",
  "./statistiques.html",
  "./navbar.js",
  "./pwa-init.js",
  "./offline-data.js",
  "./manifest.json",
  "./offline.html",
  "./css/style.css",
  "./css/themes.css",
  "./css/historique.css"
];

/* Domaines dont les requêtes sont mises en cache pour la lecture de données (Supabase REST) */
var SUPABASE_HOST = "tjqicfxkxhlciebmswqu.supabase.co";
var CLOUDINARY_HOST = "res.cloudinary.com";

/* ── INSTALL : précharger les assets statiques ── */
self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return Promise.all(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function() {
            /* Une page manquante ne doit pas bloquer toute l'installation */
            return null;
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ── ACTIVATE : nettoyer les anciens caches de versions précédentes ── */
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

/* ── Stratégie stale-while-revalidate générique ── */
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(function(cache) {
    return cache.match(request).then(function(cached) {
      var networkFetch = fetch(request).then(function(response) {
        /* Ne met en cache que les réponses valides (200) */
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function() {
        /* Pas de réseau : on retombe sur le cache s'il existe */
        return cached;
      });

      /* Si une version en cache existe, la retourner IMMÉDIATEMENT.
         La requête réseau continue en arrière-plan (silencieuse). */
      return cached || networkFetch;
    });
  });
}

/* ── FETCH : router selon le type de requête ── */
self.addEventListener("fetch", function(event) {
  var req = event.request;
  var url = new URL(req.url);

  /* Ignorer les requêtes non-GET (POST/PUT/DELETE = écriture, jamais mises en cache) */
  if (req.method !== "GET") {
    return;
  }

  /* Navigation HTML (changement de page) */
  if (req.mode === "navigate" || (req.method === "GET" && req.headers.get("accept") && req.headers.get("accept").indexOf("text/html") !== -1 && url.origin === self.location.origin)) {
    event.respondWith(
      staleWhileRevalidate(req, STATIC_CACHE).catch(function() {
        return caches.match("./offline.html");
      })
    );
    return;
  }

  /* Assets statiques du même domaine (CSS, JS, fonts, images locales) */
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  /* Polices Google Fonts */
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  /* Requêtes de LECTURE Supabase (table REST API) : GET uniquement, donc on les cache.
     Les écritures (POST/PATCH/DELETE) ne passent jamais ici car déjà filtrées plus haut. */
  if (url.hostname === SUPABASE_HOST) {
    /* Ne pas mettre en cache les requêtes d'authentification (toujours besoin du réseau) */
    if (url.pathname.indexOf("/auth/") !== -1) {
      return; /* laisser passer normalement, pas de cache */
    }
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }

  /* Fichiers audio Cloudinary : cache-first avec mise à jour silencieuse.
     Un fichier audio ne change jamais une fois uploadé donc cache-first pur est safe
     et évite de re-télécharger à chaque écoute. */
  if (url.hostname === CLOUDINARY_HOST) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(function(cache) {
        return cache.match(req).then(function(cached) {
          if (cached) return cached;
          return fetch(req).then(function(response) {
            if (response && response.status === 200) {
              cache.put(req, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  /* Tout le reste : comportement réseau normal, pas de cache */
});

/* ── Message depuis la page : forcer le préchargement d'un audio ── */
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
});
