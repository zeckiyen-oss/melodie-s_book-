/* ============================================================
   OFFLINE-DATA.JS — Cache local des données (IndexedDB)
   À inclure APRÈS la création du client Supabase (var sb = ...)
   et APRÈS pwa-init.js.

   Usage dans une page :
     melodieFetch('chansons-all', async function() {
       var res = await sb.from('chansons').select('*').order('numero');
       return res.data || [];
     }, function(data) {
       renderChansons(data);
     });

   Principe : stale-while-revalidate côté application.
   1. Si une version est en cache (IndexedDB) → callback(cache) instantané,
      ET l'appelant n'est PAS bloqué en attendant le réseau (effet natif).
   2. En parallèle, requête réseau lancée en tâche de fond.
   3. Si la requête réussit → cache mis à jour + callback(fraisData) à nouveau,
      silencieusement (pas de loader, pas de flash, juste un re-render).
   4. Si la requête échoue (offline) et qu'il y a déjà eu un cache → rien de plus.
   5. Si pas de cache ET pas de réseau → callback(null), l'appelant ATTEND ce cas
      car il n'y a rien d'autre à montrer.
   ============================================================ */

var MELODIE_DB_NAME = "melodie_offline_db";
var MELODIE_DB_VERSION = 1;
var MELODIE_STORE = "cache_kv";

function _melodieOpenDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(MELODIE_DB_NAME, MELODIE_DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(MELODIE_STORE)) {
        db.createObjectStore(MELODIE_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function _melodieDbGet(key) {
  return _melodieOpenDB().then(function(db) {
    return new Promise(function(resolve) {
      var tx = db.transaction(MELODIE_STORE, "readonly");
      var store = tx.objectStore(MELODIE_STORE);
      var req = store.get(key);
      req.onsuccess = function() {
        resolve(req.result ? req.result.value : null);
      };
      req.onerror = function() { resolve(null); };
    });
  }).catch(function() { return null; });
}

function _melodieDbSet(key, value) {
  return _melodieOpenDB().then(function(db) {
    return new Promise(function(resolve) {
      var tx = db.transaction(MELODIE_STORE, "readwrite");
      var store = tx.objectStore(MELODIE_STORE);
      store.put({ key: key, value: value, updated_at: Date.now() });
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { resolve(false); };
    });
  }).catch(function() { return false; });
}

/**
 * melodieFetch(key, fetchFn, onData)
 * - key       : identifiant unique du cache (string)
 * - fetchFn   : fonction async qui retourne les données fraîches (appel Supabase)
 * - onData    : callback(data, fromCache) appelé une ou deux fois
 */
async function melodieFetch(key, fetchFn, onData) {
  var cached = await _melodieDbGet(key);
  var alreadyCalledWithCache = false;

  if (cached !== null) {
    onData(cached, true);
    alreadyCalledWithCache = true;
  }

  var networkPromise = (async function() {
    try {
      var fresh = await fetchFn();
      if (fresh !== undefined && fresh !== null) {
        await _melodieDbSet(key, fresh);
        var changed = JSON.stringify(fresh) !== JSON.stringify(cached);
        if (!alreadyCalledWithCache || changed) {
          onData(fresh, false);
        }
      }
    } catch (err) {
      if (!alreadyCalledWithCache) {
        onData(null, false);
      }
      /* Si le cache a déjà répondu, on n'affiche rien de plus : silencieux */
    }
  })();

  /* Si le cache a déjà répondu, on ne bloque PAS l'appelant en attendant le réseau :
     la mise à jour se fera silencieusement dès qu'elle arrive, sans empêcher
     l'affichage immédiat. Si rien n'était en cache, on attend le réseau
     car il n'y a rien d'autre à montrer. */
  if (alreadyCalledWithCache) {
    return; /* ne pas await networkPromise : laisse tourner en arrière-plan */
  }
  return networkPromise;
}

/**
 * melodieCacheAudio(url)
 * Demande au service worker de précharger un fichier audio pour écoute offline future.
 * Appel silencieux, sans bloquer l'UI.
 */
function melodieCacheAudio(url) {
  if (!url) return;
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: "CACHE_AUDIO", url: url });
}

/**
 * melodieClearCache()
 * Vide le cache de données local (IndexedDB). Utile si besoin d'un "reset" manuel.
 */
function melodieClearCache() {
  return _melodieOpenDB().then(function(db) {
    return new Promise(function(resolve) {
      var tx = db.transaction(MELODIE_STORE, "readwrite");
      tx.objectStore(MELODIE_STORE).clear();
      tx.oncomplete = function() { resolve(true); };
    });
  });
}
