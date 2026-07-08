// ============================================
// Mélodie's Book — sw.js
// Service Worker minimaliste
// ============================================

const CACHE_NAME = 'melodie-cache-v4';
const STATIC_ASSETS = [
  './',
  './dashboard.html',
  './repertoire.html',
  './chanson.html',
  './bibliotheque.html',
  './programme.html',
  './themes.html',
  './historique.html',
  './statistiques.html',
  './offline.html',
  './manifest.json',
  './pwa-register.js',
  './melodie-cache.js',
  './css/style.css',
  './navbar.js',
];

// Installation : précharger les assets critiques.
// IMPORTANT : on utilise Promise.allSettled (et non cache.addAll) car
// cache.addAll() est "tout ou rien" — si UN SEUL fichier échoue à se
// charger (redirection 308 de Cloudflare, fichier renommé, etc.), AUCUN
// fichier n'est mis en cache, pas même offline.html. Avec allSettled,
// chaque fichier est mis en cache indépendamment : un échec isolé
// n'empêche pas les autres d'être précachés.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          fetch(url, { redirect: 'follow', cache: 'no-store' })
            .then(response => {
              if (response && response.ok) {
                return cache.put(url, response);
              }
              console.warn('[SW] Préchargement ignoré (statut non-ok) :', url);
            })
            .catch(err => {
              console.warn('[SW] Préchargement échoué :', url, err);
            })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activation : nettoyer les anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch : stratégie réseau d'abord, puis cache, puis offline
self.addEventListener('fetch', event => {
  const { request } = event;

  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') return;

  // IMPORTANT : ignorer les domaines externes (CDN Supabase, Google Fonts,
  // API Supabase, etc.). Ces requêtes cross-origin renvoient des réponses
  // "opaques" (statut 0) que notre logique de cache ne sait pas gérer
  // correctement (le test response.status === 200 échoue toujours pour
  // elles), donc elles ne sont jamais mises en cache par notre code — et
  // pire, notre fallback "réponse vide 503" en cas d'échec réseau CASSE
  // ces ressources critiques (ex: la librairie Supabase) au lieu de
  // laisser le navigateur gérer l'échec normalement. On laisse ces
  // requêtes suivre leur cours natif, sans intervention du SW.
  if (new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navigation HTML
  if (request.mode === 'navigate') {
    event.respondWith(
      // IMPORTANT : redirect 'follow' explicite pour éviter les réponses
      // "opaque redirect" causées par les redirections 308 de Cloudflare
      // sur les URLs .html (le mode par défaut d'une requête navigate
      // est 'manual', ce qui bloque le SW sur la redirection).
      fetch(request.url, { redirect: 'follow', cache: 'no-store' })
        .then(response => {
          if (response && response.ok) {
            const clonedResponse = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          // Réseau échoue → chercher en cache
          return caches.match(request).then(cached => {
            if (cached) return cached;
            // Dernier recours : page offline
            return caches.match('./offline.html');
          });
        })
    );
    return;
  }

  // Autres ressources same-origin (JS, CSS, images) : cache d'abord, puis réseau
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request, { redirect: 'follow' }).then(response => {
        // Mettre à jour le cache
        if (response && response.status === 200) {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clonedResponse);
          });
        }
        return response;
      }).catch(() => {
        // Offline : retourner une réponse vide
        return new Response('', { status: 503 });
      });
    })
  );
});
