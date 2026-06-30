/* ============================================================
   PWA-INIT.JS — Enregistrement du Service Worker
   + Bouton d'installation natif (affiché seulement si non installé)
   ============================================================ */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function() {
    navigator.serviceWorker.register("./sw.js").then(function(reg) {
      reg.update();
      /* Si un nouveau SW est en attente, l'activer immédiatement
         pour éviter qu'un ancien SW cassé reste actif trop longtemps */
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      reg.addEventListener("updatefound", function() {
        var newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", function() {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    }).catch(function(err) {
      console.warn("Service Worker non enregistré :", err);
    });

    /* Recharger une seule fois si le service worker change de contrôleur,
       pour s'assurer que la nouvelle version prend effet proprement */
    var refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", function() {
      if (refreshed) return;
      refreshed = true;
    });
  });
}

window.MELODIE_ONLINE = navigator.onLine;

window.addEventListener("online", function() {
  window.MELODIE_ONLINE = true;
  document.dispatchEvent(new CustomEvent("melodie:online"));
});

window.addEventListener("offline", function() {
  window.MELODIE_ONLINE = false;
  document.dispatchEvent(new CustomEvent("melodie:offline"));
});

function _melodieShowOfflineBanner() {
  if (document.getElementById("melodie-offline-banner")) return;
  var banner = document.createElement("div");
  banner.id = "melodie-offline-banner";
  banner.textContent = "📡 Hors ligne — vous consultez une version enregistrée";
  banner.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:99999",
    "background:#C9A84C", "color:#0D1B2A", "font-family:'Lato',sans-serif",
    "font-size:0.75rem", "font-weight:700", "text-align:center",
    "padding:0.4rem 0.6rem", "letter-spacing:0.02em"
  ].join(";");
  document.body.appendChild(banner);
}

function _melodieHideOfflineBanner() {
  var banner = document.getElementById("melodie-offline-banner");
  if (banner) banner.remove();
}

if (!navigator.onLine) {
  document.addEventListener("DOMContentLoaded", _melodieShowOfflineBanner);
}
document.addEventListener("melodie:offline", _melodieShowOfflineBanner);
document.addEventListener("melodie:online", _melodieHideOfflineBanner);

/* ============================================================
   BOUTON D'INSTALLATION PWA
   Affiché uniquement si :
   - l'app n'est pas déjà installée (mode standalone)
   - le navigateur a déclenché l'événement beforeinstallprompt
   Cible un élément avec id="melodieInstallBtn" si présent sur la page.
   ============================================================ */

var _melodieDeferredPrompt = null;

function _melodieIsStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true; /* iOS Safari */
}

window.addEventListener("beforeinstallprompt", function(e) {
  e.preventDefault();
  _melodieDeferredPrompt = e;
  _melodieShowInstallButton();
});

window.addEventListener("appinstalled", function() {
  _melodieDeferredPrompt = null;
  _melodieHideInstallButton();
});

function _melodieShowInstallButton() {
  if (_melodieIsStandalone()) return;
  var btn = document.getElementById("melodieInstallBtn");
  if (btn) btn.style.display = "inline-flex";
}

function _melodieHideInstallButton() {
  var btn = document.getElementById("melodieInstallBtn");
  if (btn) btn.style.display = "none";
}

function melodieTriggerInstall() {
  if (!_melodieDeferredPrompt) return;
  _melodieDeferredPrompt.prompt();
  _melodieDeferredPrompt.userChoice.then(function() {
    _melodieDeferredPrompt = null;
    _melodieHideInstallButton();
  });
}

document.addEventListener("DOMContentLoaded", function() {
  if (_melodieIsStandalone()) {
    _melodieHideInstallButton();
  }
  var btn = document.getElementById("melodieInstallBtn");
  if (btn) {
    btn.addEventListener("click", melodieTriggerInstall);
  }
});
