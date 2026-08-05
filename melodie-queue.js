/* melodie-queue.js — Mélodie's Book
   File d'attente d'écriture hors ligne.

   Usage type dans une page :

     if (!navigator.onLine) {
       melodieQueueMutation({
         table: 'programme_culte',
         op: 'insert',
         payload: { culte_id: culteId, chanson_id: chanson.id, rubrique: rubrique, ordre: ordre, tonalite:'', tonalite_libre:'' },
         tempId: monIdTemporaire
       }, 'Ajout de "' + chanson.titre + '" au programme');
       showToast('Hors ligne : l\'action sera appliquée automatiquement dès que vous serez reconnecté.', 'info');
       return;
     }

   Pour une action groupée (plusieurs opérations sous un seul libellé) :
     melodieQueueMutation([op1, op2, op3], 'Sauvegarde du programme');

   Pour réagir à une synchronisation réussie (ex : remplacer un id temporaire
   par le vrai id renvoyé par Supabase) :
     melodieOnQueueSync(function(entry, result) {
       if (result.success) { ... }
     });

   Pour corriger une opération encore en attente avant qu'elle ne parte
   (ex : mettre à jour la tonalité d'un ajout de chanson pas encore synchronisé) :
     melodieUpdateQueueEntry(queueEntryId, function(entry) {
       entry.ops[0].payload.tonalite = 'Sol';
     });

   Fiabilité : la synchronisation se déclenche à coup sûr quand l'app est
   ouverte et connectée (événement 'online', chargement de page, vérification
   périodique). Elle ne se déclenche PAS si l'app reste fermée en arrière-plan —
   ce n'est pas garanti par les navigateurs/Android de façon fiable, donc ce
   n'est pas implémenté ici pour éviter une fausse promesse.
*/

(function () {
  var QUEUE_KEY = 'melodie-write-queue';
  var listeners = [];
  var processing = false;

  function _readQueue() {
    try {
      var raw = localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('[melodie-queue] lecture impossible, file réinitialisée :', e);
      return [];
    }
  }

  function _writeQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.warn('[melodie-queue] écriture impossible :', e);
    }
  }

  function _uid() {
    return 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function melodieQueueMutation(opsOrSingle, label) {
    var ops = Array.isArray(opsOrSingle) ? opsOrSingle : [opsOrSingle];
    var queue = _readQueue();
    var entry = {
      id: _uid(),
      label: label || 'Action en attente',
      ops: ops,
      createdAt: new Date().toISOString(),
      attempts: 0
    };
    queue.push(entry);
    _writeQueue(queue);
    return entry;
  }

  function melodieCancelQueueEntry(id) {
    var queue = _readQueue().filter(function (e) { return e.id !== id; });
    _writeQueue(queue);
  }

  function melodieUpdateQueueEntry(id, updaterFn) {
    var queue = _readQueue();
    var idx = -1;
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return false;
    updaterFn(queue[idx]);
    _writeQueue(queue);
    return true;
  }

  function melodieQueueCount() {
    return _readQueue().length;
  }

  function melodieQueueEntries() {
    return _readQueue();
  }

  function melodieOnQueueSync(cb) {
    listeners.push(cb);
  }

  async function _runOp(op) {
    var sb = window._sb;
    if (!sb) throw new Error('Client Supabase indisponible');
    var table = sb.from(op.table);

    if (op.op === 'insert') {
      var res = await table.insert(op.payload).select().single();
      if (res.error) throw res.error;
      return res.data;
    }
    if (op.op === 'update') {
      var qb = table.update(op.payload);
      Object.keys(op.match || {}).forEach(function (k) { qb = qb.eq(k, op.match[k]); });
      var res2 = await qb;
      if (res2.error) throw res2.error;
      return null;
    }
    if (op.op === 'delete') {
      var qd = table.delete();
      Object.keys(op.match || {}).forEach(function (k) { qd = qd.eq(k, op.match[k]); });
      var res3 = await qd;
      if (res3.error) throw res3.error;
      return null;
    }
    throw new Error("Type d'opération inconnu : " + op.op);
  }

  async function melodieProcessQueue() {
    if (processing) return;
    if (!navigator.onLine) return;
    var queue = _readQueue();
    if (queue.length === 0) return;
    processing = true;

    for (var i = 0; i < queue.length; i++) {
      var entry = queue[i];
      try {
        var results = [];
        for (var j = 0; j < entry.ops.length; j++) {
          results.push(await _runOp(entry.ops[j]));
        }
        queue = _readQueue().filter(function (e) { return e.id !== entry.id; });
        _writeQueue(queue);
        if (window.showToast) {
          window.showToast('✓ Synchronisé : ' + entry.label, 'success');
        }
        listeners.forEach(function (cb) {
          try { cb(entry, { success: true, results: results }); } catch (e) {}
        });
      } catch (err) {
        entry.attempts = (entry.attempts || 0) + 1;
        var q2 = _readQueue().map(function (e) { return e.id === entry.id ? entry : e; });
        _writeQueue(q2);
        console.warn('[melodie-queue] échec sur "' + entry.label + '" :', err);
        if (window.showToast) {
          window.showToast('Synchronisation différée : ' + entry.label, 'error');
        }
        listeners.forEach(function (cb) {
          try { cb(entry, { success: false, error: err }); } catch (e) {}
        });
        break; // on garde l'ordre : on retentera tout depuis cette entrée la prochaine fois
      }
      if (!navigator.onLine) break;
    }

    processing = false;
  }

  window.addEventListener('online', melodieProcessQueue);

  document.addEventListener('DOMContentLoaded', function () {
    if (navigator.onLine) melodieProcessQueue();
  });

  setInterval(function () {
    if (navigator.onLine) melodieProcessQueue();
  }, 25000);

  window.melodieQueueMutation    = melodieQueueMutation;
  window.melodieCancelQueueEntry = melodieCancelQueueEntry;
  window.melodieUpdateQueueEntry = melodieUpdateQueueEntry;
  window.melodieQueueCount       = melodieQueueCount;
  window.melodieQueueEntries     = melodieQueueEntries;
  window.melodieOnQueueSync      = melodieOnQueueSync;
  window.melodieProcessQueue     = melodieProcessQueue;
})();
