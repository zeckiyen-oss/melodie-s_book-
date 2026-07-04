// ============================================
// Mélodie's Book — pwa-register.js
// Enregistrement minimaliste du Service Worker
// À inclure dans TOUTES les pages HTML via :
// <script src="pwa-register.js"></script>
// Placer juste avant </body>
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

// Gestion du bouton d'installation PWA (optionnel)
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;

  const btnInstall = document.getElementById('btn-install-pwa');
  if (btnInstall) {
    btnInstall.style.display = 'block';
    btnInstall.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] Choix utilisateur :', outcome);
      deferredPrompt = null;
      btnInstall.style.display = 'none';
    });
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] Mélodie\'s Book installée avec succès !');
  deferredPrompt = null;
  const btnInstall = document.getElementById('btn-install-pwa');
  if (btnInstall) btnInstall.style.display = 'none';
});
