// ============================================
// Mélodie's Book — sw.js
// Service Worker minimaliste — v8
// v8 : les cache.put() hors installation n'étaient
// pas protégés par waitUntil() — le SW pouvait être
// tué avant la fin de l'écriture en cache, empêchant
// silencieusement la mise en cache de pages visitées
// en ligne.
// ============================================

const CACHE_NAME = 'melodie-cache-v8';
const AUDIO_CACHE_NAME = 'melodie-audio-cache-v1';

const STATIC_ASSETS = [
  './',
  './dashboard',
  './repertoire',
  './chanson',
  './bibliotheque',
  './programme',
  './themes',
  './historique',
  './statistiques',
  './comptes',
  './proposer',
  './propositions',
  './preparation-culte',
  './preparation-evenement',
  './validation-programme',
  './designateur',
  './gestion-themes',
  './evenements',
  './ajouter-chanson',
  './modifier-chanson',
  './diagnostic-pwa',
  './offline',
  './manifest.json',
  './pwa-register.js',
  './melodie-cache.js',
  './css/style.css',
  './navbar.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          fetch(url, { redirect: 'follow', cache: 'no-store' })
            .then(response => {
              if (!response || !response.ok) {
                console.warn('[SW] Préchargement ignoré (statut non-ok) :', url, response && response.status);
                return;
              }
              if (response.redirected) {
                return response.text().then(bodyText => {
                  return cache.put(url, new Response(bodyText, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                  }));
                });
              }
              return cache.put(url, response);
            })
            .catch(err => {
              console.warn('[SW] Préchargement échoué :', url, err);
            })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME && key !== AUDIO_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const requestURL = new URL(request.url);

  if (requestURL.hostname.endsWith('cloudinary.com')) {
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request)
            .then(response => {
              if (response && response.ok) {
                event.waitUntil(cache.put(request, response.clone()));
              }
              return response;
            })
            .catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  if (requestURL.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request.url, { redirect: 'follow', cache: 'no-store' })
        .then(async response => {
          if (!response || !response.ok) return response;

          if (response.redirected) {
            const bodyText = await response.text();
            const init = {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            };
            event.waitUntil(
              caches.open(CACHE_NAME).then(cache =>
                cache.put(request, new Response(bodyText, init))
              )
            );
            return new Response(bodyText, init);
          }

          const clonedResponse = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then(cache =>
              cache.put(request, clonedResponse)
            )
          );
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            if (cached) return cached;
            return caches.match('./offline');
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request, { redirect: 'follow' }).then(response => {
        if (response && response.status === 200) {
          const clonedResponse = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then(cache =>
              cache.put(request, clonedResponse)
            )
          );
        }
        return response;
      }).catch(() => {
        return new Response('', { status: 503 });
      });
    })
  );
});
