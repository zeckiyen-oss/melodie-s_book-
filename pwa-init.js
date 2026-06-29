/* ============================================================
   PWA-INIT.JS — Enregistrement du Service Worker
   À inclure dans CHAQUE page : <script src="pwa-init.js"></script>
   ============================================================ */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function() {
    navigator.serviceWorker.register("./sw.js").then(function(reg) {
      reg.update();
    }).catch(function(err) {
      console.warn("Service Worker non enregistré :", err);
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
