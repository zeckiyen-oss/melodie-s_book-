/* ============================================================
   SERVICE WORKER — Mélodie's Book
   v3 : corrige 2 bugs qui cassaient le mode hors ligne
   1) cache.add() échouait silencieusement sur dashboard.html et
      offline.html car Cloudflare Pages redirige (308) toute URL
      .html vers sa version sans extension, et cache.add()/addAll()
      rejettent une réponse issue d'une redirection.
      => on précharge maintenant via fetch(redirect:"follow") + put()
         manuel, qui n'a pas cette restriction.
   2) Les pages étaient mises en cache sous la clé de la requête
      d'origine (ex: /repertoire.html) mais relues sous l'URL affichée
      après redirection (/repertoire) => cache miss malgré une visite
      déjà faite.
      => on normalise systématiquement la clé de cache (on retire
         ".html") aussi bien à l'écriture qu'à la lecture.
   ============================================================ */

var SW_VERSION = "melodie-v4";
var STATIC_CACHE = SW_VERSION + "-static";
var DATA_CACHE   = SW_VERSION + "-data";
var AUDIO_CACHE  = SW_VERSION + "-audio";

/* Pages et fichiers à précharger dès l'installation.
   On inclut maintenant toutes les pages de LECTURE déjà migrées
   vers melodieFetch, + le shell PWA + le fallback offline. */
var STATIC_ASSETS = [
  "./dashboard.html",
  "./repertoire.html",
  "./chanson.html",
  "./bibliotheque.html",
  "./programme.html",
  "./themes.html",
  "./historique.html",
  "./statistiques.html",
  "./navbar.js",
  "./pwa-init.js",
  "./offline-data.js",
  "./manifest.json",
  "./offline.html"
];

var SUPABASE_HOST = "tjqicfxkxhlciebmswqu.supabase.co";
var CLOUDINARY_HOST = "res.cloudinary.com";

/* ── Journal de bord de diagnostic ──
   Enregistre chaque tentative de navigation (réussie ou non) dans le
   cache, pour pouvoir la relire depuis diagnostic-pwa.html une fois
   reconnecté. Ne bloque jamais la réponse (utilisé via waitUntil). */
var DEBUG_LOG_KEY = "/__sw_debug_log__";
var DEBUG_LOG_MAX = 40;

function swLog(entry) {
  entry.time = new Date().toISOString();
  return caches.open(DATA_CACHE).then(function(cache) {
    return cache.match(DEBUG_LOG_KEY).then(function(res) {
      return res ? res.json() : [];
    }).catch(function() { return []; }).then(function(list) {
      list.push(entry);
      if (list.length > DEBUG_LOG_MAX) list = list.slice(list.length - DEBUG_LOG_MAX);
      return cache.put(DEBUG_LOG_KEY, new Response(JSON.stringify(list), {
        headers: { "Content-Type": "application/json" }
      }));
    });
  }).catch(function() {});
}

/* ── Normalisation des clés de cache ──
   Retire l'extension .html afin qu'une page soit retrouvée en cache
   qu'elle ait été demandée avec ou sans extension (Cloudflare Pages
   redirige silencieusement l'une vers l'autre). */
function normalizeCacheKey(rawUrl) {
  try {
    var u = new URL(rawUrl, self.location.href);
    if (/\.html$/.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\.html$/, "");
      if (u.pathname === "") u.pathname = "/";
    }
    return u.href;
  } catch (e) {
    return rawUrl;
  }
}

/* ── Précharge un asset en suivant les redirections, puis le stocke
   sous sa clé normalisée. Ne fait jamais échouer l'installation. ── */
function precacheAsset(cache, relUrl) {
  var absUrl = new URL(relUrl, self.location.href).href;
  return fetch(absUrl, { redirect: "follow", cache: "reload" })
    .then(function(response) {
      if (response && response.ok) {
        return cache.put(normalizeCacheKey(absUrl), response.clone());
      }
    })
    .catch(function() { /* asset indisponible au moment de l'install, tant pis */ });
}

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return Promise.allSettled(
        STATIC_ASSETS.map(function(url) {
          return precacheAsset(cache, url);
        })
      );
    }).then(function() {
      return self.skipWaiting();
    }).catch(function() {
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

/* ── Stratégie stale-while-revalidate pour les assets non-HTML ── */
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
    return fetch(request);
  });
}

self.addEventListener("fetch", function(event) {
  var req = event.request;
  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  if (req.method !== "GET") {
    return;
  }

  /* Navigation HTML : réseau d'abord, puis cache normalisé,
     puis offline.html en dernier recours. */
  if (req.mode === "navigate") {
    event.waitUntil(swLog({ url: req.url, step: "fetch-event-recu" }));
    event.respondWith(
      Promise.race([
        fetch(req),
        new Promise(function(_, reject) {
          setTimeout(function() { reject(new Error("timeout-reseau-2s")); }, 2000);
        })
      ]).then(function(response) {
        if (response && response.ok) {
          var key = normalizeCacheKey(req.url);
          caches.open(STATIC_CACHE).then(function(cache) {
            cache.put(key, response.clone()).catch(function() {});
          });
        }
        event.waitUntil(swLog({
          url: req.url,
          outcome: "reseau-ok",
          status: response ? response.status : null
        }));
        return response;
      }).catch(function(err) {
        var key = normalizeCacheKey(req.url);
        return caches.open(STATIC_CACHE).then(function(cache) {
          return cache.match(key).then(function(cached) {
            if (cached) {
              event.waitUntil(swLog({
                url: req.url, outcome: "reseau-echec_cache-trouve",
                key: key, error: String(err)
              }));
              return cached;
            }
            var offlineKey = normalizeCacheKey(new URL("./offline.html", self.location.href).href);
            return cache.match(offlineKey).then(function(off) {
              event.waitUntil(swLog({
                url: req.url,
                outcome: off ? "reseau-echec_cache-absent_offline-affiche" : "reseau-echec_cache-absent_OFFLINE-HTML-MANQUANT",
                key: key, offlineKey: offlineKey, error: String(err)
              }));
              return off;
            });
          });
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
