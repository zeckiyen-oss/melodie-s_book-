// ============================================
// Mélodie's Book — sw.js
// Service Worker minimaliste — v7
// v7 : ajout du cache audio Cloudinary (cache-first,
// cache séparé du cache de pages)
// ============================================

const CACHE_NAME = 'melodie-cache-v7';
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
                console.warn('[SW] Préchargement ignoré (statut non-ok) :', url);
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
          // On garde le cache de pages ET le cache audio — seuls les
          // caches d'anciennes versions (v4, v5, v6...) sont purgés.
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

  // Audio Cloudinary : cache-first, cache dédié. Nécessite
  // crossorigin="anonymous" sur les balises <audio> pour obtenir une
  // réponse exploitable (response.ok) plutôt qu'opaque.
  if (requestURL.hostname.endsWith('cloudinary.com')) {
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request)
            .then(response => {
              if (response && response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // Tout autre domaine externe (Supabase, Google Fonts...) : navigateur natif.
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
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, new Response(bodyText, init));
            });
            return new Response(bodyText, init);
          }

          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clonedResponse);
          });
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
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clonedResponse);
          });
        }
        return response;
      }).catch(() => {
        return new Response('', { status: 503 });
      });
    })
  );
});
