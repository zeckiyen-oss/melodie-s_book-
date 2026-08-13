// ============================================
// Mélodie's Book — pwa-register.js
// Enregistrement du Service Worker + gestion
// du bouton d'installation PWA (Android/Chrome
// via beforeinstallprompt, iOS via instructions
// manuelles, masquage automatique si déjà installée).
// À inclure dans TOUTES les pages HTML via :
// <script src="pwa-register.js"></script>
// Placer juste avant </body>
//
// Le bouton doit avoir l'id "melodieInstallBtn"
// (ex: dashboard.html). Les pages sans ce bouton
// ne sont pas affectées.
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(reg => {
        console.log('[PWA] Service Worker enregistré :', reg.scope);

        // Détecte une nouvelle version disponible
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              console.log('[PWA] Nouvelle version disponible');
              // Optional: afficher un bandeau à l'utilisateur
            }
          });
        });
      })
      .catch(err => console.warn('[PWA] Échec enregistrement SW :', err));
  });
}

// ── Détection : l'app tourne-t-elle déjà en mode installé/standalone ? ──
function melodieIsStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true; // iOS Safari (propriété historique)
}

// ── Détection iOS : Safari ne déclenche jamais 'beforeinstallprompt' ──
function melodieIsIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

function melodieGetInstallBtn() {
  return document.getElementById('melodieInstallBtn');
}

function melodieShowInstallBtn() {
  var btn = melodieGetInstallBtn();
  if (btn) btn.style.display = 'flex';
}

function melodieHideInstallBtn() {
  var btn = melodieGetInstallBtn();
  if (btn) btn.style.display = 'none';
}

var deferredPrompt = null;

function melodieSetupInstallBtn() {
  var btn = melodieGetInstallBtn();
  if (!btn || btn.dataset.melodieBound) return; // évite un double-binding si rappelé
  btn.dataset.melodieBound = '1';

  btn.addEventListener('click', async function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      var choice = await deferredPrompt.userChoice;
      console.log('[PWA] Choix utilisateur :', choice.outcome);
      deferredPrompt = null;
      melodieHideInstallBtn();
      return;
    }
    if (melodieIsIOS()) {
      melodieShowIOSInstructions();
    } else {
      melodieShowGenericInstructions();
    }
  });
}

function melodieShowGenericInstructions() {
  if (document.getElementById('melodieIOSModal')) return;
  var overlay = document.createElement('div');
  overlay.id = 'melodieIOSModal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:1rem;';
  overlay.innerHTML =
    '<div style="background:#1A2E45;border:1px solid rgba(201,168,76,0.4);border-radius:16px;padding:1.6rem 1.4rem;max-width:340px;width:100%;text-align:center;font-family:\'Lato\',sans-serif;color:#FAF6ED;">'
      + '<div style="font-size:2rem;margin-bottom:0.6rem;">&#128241;</div>'
      + '<h3 style="font-family:\'Cinzel\',serif;color:#F0D98A;margin:0 0 0.8rem;font-size:1rem;">Installer l\'application</h3>'
      + '<p style="font-size:0.85rem;line-height:1.6;color:rgba(250,246,237,0.75);margin:0 0 1.2rem;">'
        + 'Ouvrez le menu <strong>&#8942;</strong> de votre navigateur, puis appuyez sur <strong>Installer l\'application</strong> (choisissez bien "Installer", pas "Créer un raccourci").'
      + '</p>'
      + '<button id="melodieIOSModalClose" style="background:linear-gradient(135deg,#C9A84C,#F0D98A);color:#0D1B2A;border:none;border-radius:8px;padding:0.6rem 1.4rem;font-family:\'Lato\',sans-serif;font-weight:700;cursor:pointer;">Compris</button>'
    + '</div>';
  document.body.appendChild(overlay);
  document.getElementById('melodieIOSModalClose').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function melodieShowIOSInstructions() {
  if (document.getElementById('melodieIOSModal')) return;
  var overlay = document.createElement('div');
  overlay.id = 'melodieIOSModal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:1rem;';
  overlay.innerHTML =
    '<div style="background:#1A2E45;border:1px solid rgba(201,168,76,0.4);border-radius:16px;padding:1.6rem 1.4rem;max-width:340px;width:100%;text-align:center;font-family:\'Lato\',sans-serif;color:#FAF6ED;">'
      + '<div style="font-size:2rem;margin-bottom:0.6rem;">&#128241;</div>'
      + '<h3 style="font-family:\'Cinzel\',serif;color:#F0D98A;margin:0 0 0.8rem;font-size:1rem;">Installer l\'application</h3>'
      + '<p style="font-size:0.85rem;line-height:1.6;color:rgba(250,246,237,0.75);margin:0 0 1.2rem;">'
        + 'Appuyez sur <strong>Partager</strong> &#8593; en bas de Safari, puis sur <strong>Sur l\'écran d\'accueil</strong>.'
      + '</p>'
      + '<button id="melodieIOSModalClose" style="background:linear-gradient(135deg,#C9A84C,#F0D98A);color:#0D1B2A;border:none;border-radius:8px;padding:0.6rem 1.4rem;font-family:\'Lato\',sans-serif;font-weight:700;cursor:pointer;">Compris</button>'
    + '</div>';
  document.body.appendChild(overlay);
  document.getElementById('melodieIOSModalClose').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

// ── Initialisation à chaque chargement de page ──
document.addEventListener('DOMContentLoaded', function() {
  melodieSetupInstallBtn();

  if (melodieIsStandalone()) {
    // Déjà installée : le bouton ne doit jamais apparaître.
    melodieHideInstallBtn();
    return;
  }

  // Le bouton reste visible tant que l'app n'est pas installée, MÊME SI
  // 'beforeinstallprompt' ne s'est pas (encore) déclenché — Chrome peut
  // retarder cet événement après une désinstallation récente. Le clic
  // utilise le prompt natif s'il est prêt, sinon affiche des instructions
  // manuelles (cf. melodieSetupInstallBtn).
  melodieShowInstallBtn();
});

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
  if (!melodieIsStandalone()) {
    melodieSetupInstallBtn();
    melodieShowInstallBtn();
  }
});

window.addEventListener('appinstalled', function() {
  console.log('[PWA] Mélodie\'s Book installée avec succès !');
  deferredPrompt = null;
  melodieHideInstallBtn();
});
