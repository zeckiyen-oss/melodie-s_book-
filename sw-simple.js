// ============================================
// Mélodie's Book — sw.js
// Service Worker minimaliste
// ============================================

const CACHE_NAME = 'melodie-cache-v1';
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
  './css/style.css',
  './navbar.js',
];

// Installation : précharger les assets critiques
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Erreur préchargement :', err);
        // Continue même si un asset échoue
      });
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

  // Navigation HTML
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Mettre à jour le cache avec le contenu frais
          if (response && response.status === 200) {
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

  // Autres ressources (JS, CSS, images) : cache d'abord, puis réseau
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
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
