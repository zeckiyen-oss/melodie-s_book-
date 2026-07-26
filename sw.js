// ============================================
// Mélodie's Book — sw.js
// Service Worker minimaliste — v5
// Corrections : précache complet (22 pages) +
// neutralisation des réponses redirigées
// ============================================

const CACHE_NAME = 'melodie-cache-v5';

// URLs SANS extension .html : Cloudflare Pages redirige
// automatiquement .html vers sa version sans extension (308),
// donc précacher directement en .html redéclencherait le bug
// qu'on corrige plus bas. Ce sont aussi ces URLs que les vraies
// navigations demanderont une fois tous les liens nettoyés.
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

// IMPORTANT : neutralise le flag "redirected" d'une réponse.
// Une requête de navigation a nativement un redirect mode
// "manual" — le navigateur REFUSE de servir une réponse
// "redirected" pour ce type de requête (erreur réseau bloquante,
// probablement la cause du ERR_FAILED déjà observé sur les liens
// .html). En reconstruisant un Response neuf à partir du body,
// on retire cette contamination avant utilisation ou mise en cache.
function cleanRedirectedResponse(response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// Installation : précharger les assets critiques.
// Promise.allSettled (pas cache.addAll) : un échec isolé
// n'empêche pas les autres fichiers d'être précachés.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          fetch(url, { redirect: 'follow', cache: 'no-store' })
            .then(response => {
              if (response && response.ok) {
                return cache.put(url, cleanRedirectedResponse(response));
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

// Activation : purge les anciens caches (v4 et antérieurs)
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

// Fetch : réseau d'abord, puis cache, puis offline
self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;

  // Domaines externes (Supabase, Cloudinary, Google Fonts...) :
  // on laisse le navigateur gérer nativement, sans intervention du SW.
  if (new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navigation HTML
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request.url, { redirect: 'follow', cache: 'no-store' })
        .then(response => {
          if (response && response.ok) {
            const cleanedResponse = cleanRedirectedResponse(response);
            const forCache = cleanedResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, forCache);
            });
            return cleanedResponse;
          }
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

  // Autres ressources same-origin (JS, CSS, images) : cache d'abord, puis réseau
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
