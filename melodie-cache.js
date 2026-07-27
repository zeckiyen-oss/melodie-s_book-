// ============================================
// Mélodie's Book — melodie-cache.js
// Pattern "cache d'abord + mise à jour silencieuse"
// (stale-while-revalidate) pour les données Supabase
// À inclure dans le <head> ou juste avant le script
// principal de chaque page, AVANT son utilisation :
// <script src="melodie-cache.js"></script>
// ============================================

var MELODIE_CACHE_PREFIX = 'mcache:';
var MELODIE_CACHE_TIMEOUT = 6000; // ms — délai max d'attente réseau

function melodieCacheRead(key) {
  try {
    var raw = localStorage.getItem(MELODIE_CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[melodieCache] Lecture cache impossible pour', key, e);
    return null;
  }
}

function melodieCacheWrite(key, data) {
  try {
    localStorage.setItem(MELODIE_CACHE_PREFIX + key, JSON.stringify(data));
  } catch (e) {
    console.warn('[melodieCache] Écriture cache impossible pour', key, e);
  }
}

function melodieTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('timeout réseau')); }, ms);
    })
  ]);
}

/**
 * melodieCache(key, fetchFn, renderFn)
 *
 * - key      : identifiant unique pour cette donnée (ex: 'repertoire-chansons-all')
 * - fetchFn  : async function() -> doit renvoyer les données fraîches et
 *              LANCER une erreur (throw) en cas d'échec Supabase, pour que
 *              le mécanisme de cache/fallback fonctionne correctement.
 * - renderFn : function(data, fromCache) -> appelée pour afficher les données.
 *
 * Déroulement :
 *   1. Si un cache existe → renderFn(cache, true) IMMÉDIATEMENT (affichage instantané)
 *   2. La vraie requête réseau est lancée en parallèle
 *   3. Si elle réussit → cache mis à jour + renderFn(fresh, false) (mise à jour silencieuse)
 *   4. Si elle échoue :
 *        - et qu'un cache avait déjà été affiché → on ne fait RIEN de plus
 *          (l'utilisateur garde les données déjà visibles, pas d'erreur affichée)
 *        - et qu'aucun cache n'existait → renderFn(null, false) pour que la page
 *          affiche un message "indisponible hors ligne"
 */
async function melodieCache(key, fetchFn, renderFn) {
  var cached = melodieCacheRead(key);
  var displayedFromCache = false;

  if (cached !== null) {
    renderFn(cached, true);
    displayedFromCache = true;
  }

  // Comme SmartLearn : si l'appareil est hors ligne, on ne tente même pas
  // l'appel réseau — on évite un délai inutile et des erreurs imprévisibles
  // selon les navigateurs.
  if (!navigator.onLine) {
    console.warn('[melodieCache] Hors ligne, pas de tentative réseau pour', key);
    if (!displayedFromCache) {
      renderFn(null, false);
    }
    return;
  }

  try {
    var fresh = await melodieTimeout(fetchFn(), MELODIE_CACHE_TIMEOUT);
    melodieCacheWrite(key, fresh);
    renderFn(fresh, false);
  } catch (err) {
    console.warn('[melodieCache] Réseau indisponible pour "' + key + '":', err.message || err);
    if (!displayedFromCache) {
      renderFn(null, false);
    }
  }
}
