/* ============================================================
   NAVBAR.JS — Barre de navigation partagée · Mélodie's Book
   Inclure dans chaque page : <script src="navbar.js"></script>
   Appeler après auth : buildSharedNavbar(profil, pageActive)
   pageActive = nom du fichier sans .html ex: "repertoire"

   IMPORTANT : buildSharedNavbar est maintenant ASYNC.
   Si du code doit s'exécuter après l'injection de la navbar,
   utiliser : await buildSharedNavbar(profil, pageActive)

   NOTE : tous les liens utilisent des URLs SANS .html
   (Cloudflare Pages échoue sur les URLs .html directes —
   voir diagnostic du 2026-07-09).

   GARDE-FOUS HORS LIGNE (2026-08-07) :
   Les pages listées dans MELODIE_ONLINE_ONLY_PAGES nécessitent
   une connexion internet pour fonctionner (écriture, ou lecture
   de données non mises en cache). Leurs liens dans la navbar
   sont automatiquement désactivés hors ligne.
   Pour les boutons internes à une page (ex: "Ajouter une
   chanson" dans repertoire.html), ajoutez l'attribut
   data-online-only="1" sur l'élément, puis appelez
   window.melodieApplyOfflineGuards() après l'avoir injecté
   dans le DOM.
   ============================================================ */

/* Pages nécessitant une connexion internet pour être utilisées.
   Toute page absente de cette liste est considérée offline-safe
   (lecture via melodie-cache.js, ou écriture via melodie-queue.js
   pour preparation-culte / preparation-evenement). */
var MELODIE_ONLINE_ONLY_PAGES = [
  "comptes",
  "validation-programme",
  "proposer",
  "propositions",
  "ajouter-chanson",
  "modifier-chanson",
  "designateur",
  "gestion-themes",
  "evenements",
  "statistiques"
];

/* ── Résolution d'identité, sûre hors ligne ──────────────────
   À appeler en tout début de init() sur chaque page protégée,
   à la place de l'ancien duo getSession() + from('profils').
   Retourne { userId, userEmail, profil }, ou null si aucune
   identité exploitable (redirige alors automatiquement vers
   la connexion — la page appelante n'a qu'à faire "return").
   ============================================================ */
async function melodieResolveIdentity() {
  var userId = null;
  var userEmail = null;

  if (navigator.onLine) {
    try {
      var sb = window._sb || window.sb;
      var sessionData = await melodieTimeout(sb.auth.getSession(), MELODIE_CACHE_TIMEOUT);
      if (sessionData.data.session) {
        userId = sessionData.data.session.user.id;
        userEmail = sessionData.data.session.user.email;
        localStorage.setItem('melodie-last-user', JSON.stringify({ id: userId, email: userEmail }));
      }
    } catch (e) {
      console.warn('[melodieResolveIdentity] getSession a échoué :', e);
    }
  }

  if (!userId) {
    try {
      var last = JSON.parse(localStorage.getItem('melodie-last-user') || 'null');
      if (last && last.id) {
        userId = last.id;
        userEmail = last.email;
      }
    } catch (e) {}
  }

  if (!userId) {
    window.location.href = '/';
    return null;
  }

  var profil = null;
  await melodieCache('profil-' + userId, async function() {
    var sb = window._sb || window.sb;
    var profilData = await sb.from('profils').select('*').eq('id', userId).single();
    if (!profilData.data) throw new Error('Profil introuvable');
    return profilData.data;
  }, function(data) {
    profil = data;
  });

  if (!profil) {
    window.location.href = '/';
    return null;
  }

  return { userId: userId, userEmail: userEmail, profil: profil };
}

async function buildSharedNavbar(profil, pageActive) {
  var role = profil.role || "membre";
  var nom  = profil.nom || profil.email || "";
  var isDashboard = (pageActive === "dashboard");

  var aEvenementAssigne = false;
  if (role === "preparateur") {
    try {
      var sbClient = window._sb || window.sb;
      if (sbClient) {
        var res = await sbClient
          .from("evenements")
          .select("id")
          .eq("preparateur_id", profil.id)
          .eq("statut", "en_preparation")
          .limit(1);
        aEvenementAssigne = !!(res.data && res.data.length > 0);
      }
    } catch (e) {
      aEvenementAssigne = false;
    }
  }

  var liens = [
    { href: "dashboard",             label: "<svg class="nav-icon"><use href="icons.svg#icon-home"></use></svg> Accueil",           id: "dashboard",             roles: ["membre","preparateur","admin"] },
    { href: "repertoire",            label: "<svg class="logo-icon"><use href="icons.svg#icon-musical-note"></use></svg> Répertoire",        id: "repertoire",            roles: ["membre","preparateur","admin"] },
    { href: "themes",                label: "<svg class="nav-icon"><use href="icons.svg#icon-book-open"></use></svg> Thèmes",            id: "themes",                roles: ["membre","preparateur","admin"] },
    { href: "historique",            label: "<svg class="nav-icon"><use href="icons.svg#icon-scroll"></use></svg> Historique",        id: "historique",            roles: ["membre","preparateur","admin"] },
    { href: "bibliotheque",          label: "<svg class="nav-icon"><use href="icons.svg#icon-book"></use></svg> Bibliothèque",      id: "bibliotheque",          roles: ["membre","preparateur","admin"] },
    { href: "proposer",              label: "<svg class="action-icon"><use href="icons.svg#icon-lightbulb"></use></svg> Proposer",          id: "proposer",              roles: ["membre","preparateur","admin"] },
    { href: "programme",             label: "🕊️ Programme",         id: "programme",             roles: ["membre","preparateur","admin"] },
    { href: "preparation-culte",     label: "<svg class="nav-icon"><use href="icons.svg#icon-church"></use></svg> Prépa. culte",      id: "preparation-culte",     roles: ["preparateur","admin"] },
    { href: "preparation-evenement", label: "<svg class="action-icon"><use href="icons.svg#icon-calendar"></use></svg> Prépa. événement",  id: "preparation-evenement", roles: ["admin"], rolesExtra: ["preparateur"], requiresEvenement: true },
    { href: "propositions",          label: "<svg class="action-icon"><use href="icons.svg#icon-list"></use></svg> Propositions",      id: "propositions",          roles: ["admin"] },
    { href: "validation-programme",  label: "<svg class="nav-icon"><use href="icons.svg#icon-check"></use></svg> Validation",        id: "validation-programme",  roles: ["admin"] },
    { href: "designateur",           label: "🎯 Désignateur",       id: "designateur",           roles: ["admin"] },
    { href: "gestion-themes",        label: "🏷️ Gestion thèmes",   id: "gestion-themes",        roles: ["admin"] },
    { href: "evenements",            label: "<svg class="action-icon"><use href="icons.svg#icon-calendar"></use></svg> Événements",        id: "evenements",            roles: ["admin"] },
    { href: "statistiques",          label: "<svg class="action-icon"><use href="icons.svg#icon-chart"></use></svg> Statistiques",      id: "statistiques",          roles: ["membre","preparateur","admin"] },
    { href: "comptes",               label: "👥 Comptes",           id: "comptes",               roles: ["admin"] }
  ];

  var liensFiltres = liens.filter(function(l) {
    var roleOk = l.roles.indexOf(role) !== -1 || (l.rolesExtra && l.rolesExtra.indexOf(role) !== -1);
    if (!roleOk) return false;
    if (l.requiresEvenement && role === "preparateur" && !aEvenementAssigne) return false;
    return true;
  });

  var roleLabel = role === "admin" ? "Administrateur"
    : role === "preparateur" ? "Préparateur" : "Membre";
  var roleCouleur = role === "admin"
    ? "background:rgba(201,168,76,0.18);color:#F0D98A;border:1px solid rgba(201,168,76,0.4);"
    : role === "preparateur"
    ? "background:rgba(156,126,204,0.18);color:#C5B3E8;border:1px solid rgba(156,126,204,0.4);"
    : "background:rgba(91,163,201,0.15);color:#7ECFF0;border:1px solid rgba(91,163,201,0.35);";

  var navHtml = '<nav class="snav">'
    + '<div class="snav-top">'
    + '<a href="dashboard" class="snav-brand">'
    + '<span class="snav-logo"><svg class="logo-icon"><use href="icons.svg#icon-musical-note"></use></svg></span>'
    + '<span class="snav-title">Mélodie\'s Book</span>'
    + '</a>'
    + '<div class="snav-user">'
    + '<div class="snav-user-info">'
    + '<span class="snav-user-nom">' + _esc(nom) + '</span>'
    + '<span class="snav-user-role" style="' + roleCouleur + '">' + roleLabel + '</span>'
    + '</div>'
    + '<button class="theme-toggle-btn" onclick="toggleTheme()" title="Changer de th\u00e8me">'
    + '<span id="theme-toggle-icon"><svg class="theme-icon"><use href="icons.svg#icon-sun"></use></svg></span>'
    + '</button>'
    + (isDashboard ? '<button class="snav-quit" onclick="snavLogout()">&#11161; Quitter</button>' : '')
    + '</div>'
    + '</div>'
    + '<div class="snav-links-wrap">'
    + '<div class="snav-links" id="snavLinks">';

  liensFiltres.forEach(function(l) {
    var isActive = l.id === pageActive;
    var isOnlineOnly = MELODIE_ONLINE_ONLY_PAGES.indexOf(l.id) !== -1;
    navHtml += '<a href="' + l.href + '" class="snav-link' + (isActive ? ' snav-link-active' : '') + '"'
      + (isOnlineOnly ? ' data-online-only="1"' : '') + '>'
      + l.label + '</a>';
  });

  navHtml += '</div></div></nav>';

  var existing = document.querySelector(".snav");
  if (existing) existing.remove();
  var existingOld = document.querySelector(".navbar");
  if (existingOld) existingOld.remove();
  document.body.insertAdjacentHTML("afterbegin", navHtml);

  if (!document.getElementById("snav-style")) {
    var style = document.createElement("style");
    style.id = "snav-style";
    style.textContent = [
      ".snav{position:sticky;top:0;z-index:200;background:rgba(13,27,42,0.97);border-bottom:1px solid rgba(201,168,76,0.2);backdrop-filter:blur(12px);}",
      ".snav-top{display:flex;align-items:center;justify-content:space-between;padding:0.6rem 1.2rem;gap:0.8rem;}",
      ".snav-brand{display:flex;align-items:center;gap:0.5rem;text-decoration:none;}",
      ".snav-logo{width:34px;height:34px;background:linear-gradient(135deg,#C9A84C,#F0D98A);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1rem;color:#0D1B2A;font-weight:700;flex-shrink:0;box-shadow:0 0 12px rgba(201,168,76,0.35);}",
      ".snav-title{font-family:'Cinzel',serif;font-size:1rem;font-weight:700;color:#F0D98A;letter-spacing:0.04em;white-space:nowrap;}",
      ".snav-user{display:flex;align-items:center;gap:0.6rem;flex-shrink:0;}",
      ".snav-user-info{display:flex;flex-direction:column;align-items:flex-end;gap:0.15rem;}",
      ".snav-user-nom{font-family:'Lato',sans-serif;font-size:0.8rem;font-weight:700;color:#FAF6ED;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis;}",
      ".snav-user-role{font-size:0.62rem;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;padding:1px 7px;border-radius:20px;white-space:nowrap;}",
      ".snav-quit{background:transparent;border:1px solid rgba(201,168,76,0.3);color:rgba(250,246,237,0.55);font-size:0.72rem;font-family:'Lato',sans-serif;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:0.28rem 0.7rem;border-radius:6px;cursor:pointer;transition:all 0.2s;white-space:nowrap;}",
      ".theme-toggle-btn{background:transparent;border:1px solid rgba(201,168,76,0.3);color:var(--accent-light);font-size:1.2rem;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;margin-left:0.5rem;}",
      ".theme-toggle-btn:hover{border-color:var(--accent);background:rgba(201,168,76,0.1);}",
      ".snav-quit:hover{border-color:rgba(192,57,43,0.5);color:#E57373;background:rgba(192,57,43,0.08);}",
      ".snav-links-wrap{overflow-x:auto;scrollbar-width:none;border-top:1px solid rgba(201,168,76,0.1);}",
      ".snav-links-wrap::-webkit-scrollbar{display:none;}",
      ".snav-links{display:flex;gap:0;padding:0 0.5rem;min-width:max-content;}",
      ".snav-link{display:inline-flex;align-items:center;padding:0.55rem 0.85rem;font-family:'Lato',sans-serif;font-size:0.8rem;font-weight:600;color:rgba(250,246,237,0.6);text-decoration:none;letter-spacing:0.03em;white-space:nowrap;border-bottom:2px solid transparent;transition:color 0.2s,border-color 0.2s;}",
      ".snav-link:hover{color:#FAF6ED;}",
      ".snav-link-active{color:#F0D98A;border-bottom-color:#C9A84C;}",
      "body{padding-top:0!important;}",
      /* ── Garde-fous hors ligne ── */
      ".melodie-disabled{opacity:0.32!important;pointer-events:none!important;cursor:not-allowed!important;filter:grayscale(0.6);}",
      ".melodie-offline-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);background:rgba(13,27,42,0.97);border:1px solid rgba(201,168,76,0.4);color:#F0D98A;font-family:'Lato',sans-serif;font-size:0.82rem;font-weight:600;padding:0.7rem 1.2rem;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:9999;opacity:0;transition:opacity 0.25s ease,transform 0.25s ease;pointer-events:none;text-align:center;max-width:88vw;}",
      ".melodie-offline-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}"
    ].join("");
    document.head.appendChild(style);
  }

  melodieApplyOfflineGuards();
  melodieBindOfflineListeners();
}

/* ── Garde-fous hors ligne ────────────────────────────────────
   Désactive tout élément [data-online-only] quand l'appareil
   est hors ligne (navbar ET boutons internes aux pages).
   Idempotent : peut être rappelée autant de fois que nécessaire
   (ex: après avoir injecté dynamiquement des boutons dans une
   page — cf. quickAccessGrid du dashboard).
   ============================================================ */
function melodieApplyOfflineGuards() {
  var offline = !navigator.onLine;
  document.body.classList.toggle('melodie-offline', offline);

  var els = document.querySelectorAll('[data-online-only]');
  els.forEach(function(el) {
    if (offline) {
      el.classList.add('melodie-disabled');
      el.setAttribute('aria-disabled', 'true');
      if (el.tagName === 'A' && el.hasAttribute('href')) {
        el.dataset.melodieHref = el.getAttribute('href');
        el.removeAttribute('href');
      }
      if (el.tagName === 'BUTTON') el.disabled = true;
    } else {
      el.classList.remove('melodie-disabled');
      el.removeAttribute('aria-disabled');
      if (el.tagName === 'A' && el.dataset.melodieHref) {
        el.setAttribute('href', el.dataset.melodieHref);
        delete el.dataset.melodieHref;
      }
      if (el.tagName === 'BUTTON') el.disabled = false;
    }
  });
}
window.melodieApplyOfflineGuards = melodieApplyOfflineGuards;

/* Lie les écouteurs online/offline une seule fois par session de page,
   même si buildSharedNavbar est rappelée. */
function melodieBindOfflineListeners() {
  if (window._melodieOfflineListenersBound) return;
  window._melodieOfflineListenersBound = true;
  window.addEventListener('online', melodieApplyOfflineGuards);
  window.addEventListener('offline', melodieApplyOfflineGuards);

  // Filet de sécurité : si un élément désactivé est cliqué malgré tout
  // (ex: race condition juste au moment du passage hors ligne),
  // on bloque l'action et on affiche un message clair.
  document.addEventListener('click', function(e) {
    if (!document.body.classList.contains('melodie-offline')) return;
    var el = e.target.closest && e.target.closest('[data-online-only]');
    if (el) {
      e.preventDefault();
      e.stopPropagation();
      melodieOfflineToast();
    }
  }, true);
}

function melodieOfflineToast() {
  var existing = document.querySelector('.melodie-offline-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.className = 'melodie-offline-toast';
  toast.textContent = 'Action impossible hors ligne. Connectez-vous à internet.';
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.add('show'); });
  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() { toast.remove(); }, 300);
  }, 2600);
}

async function snavLogout() {
  var sb = window._sb || window.sb;
  try {
    if (sb) await sb.auth.signOut();
  } catch (e) {
    console.warn('[snavLogout] signOut réseau a échoué :', e);
  }
  localStorage.removeItem('melodie-last-user');
  window.location.href = "/";
}

// Theme Manager Functions
function initTheme() {
  var savedTheme = localStorage.getItem('melodie-theme') || 'dark';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  var body = document.body;
  body.classList.remove('dark-mode', 'light-mode');
  if (theme === 'light') {
    body.classList.add('light-mode');
  } else {
    body.classList.add('dark-mode');
  }
  localStorage.setItem('melodie-theme', theme);
  updateThemeToggleIcon();
}

function toggleTheme() {
  var currentTheme = localStorage.getItem('melodie-theme') || 'dark';
  var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
}

function updateThemeToggleIcon() {
  var currentTheme = localStorage.getItem('melodie-theme') || 'dark';
  var toggleIcon = document.getElementById('theme-toggle-icon');
  if (toggleIcon) {
    toggleIcon.textContent = currentTheme === 'light' ? '<svg class="theme-icon"><use href="icons.svg#icon-moon"></use></svg>' : '<svg class="theme-icon"><use href="icons.svg#icon-sun"></use></svg>';
  }
}

// Initialize theme on page load
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initTheme);
}

function _esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
