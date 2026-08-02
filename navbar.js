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
   ============================================================ */

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
    { href: "dashboard",             label: "🏠 Accueil",           id: "dashboard",             roles: ["membre","preparateur","admin"] },
    { href: "repertoire",            label: "🎵 Répertoire",        id: "repertoire",            roles: ["membre","preparateur","admin"] },
    { href: "themes",                label: "📖 Thèmes",            id: "themes",                roles: ["membre","preparateur","admin"] },
    { href: "historique",            label: "📜 Historique",        id: "historique",            roles: ["membre","preparateur","admin"] },
    { href: "bibliotheque",          label: "📚 Bibliothèque",      id: "bibliotheque",          roles: ["membre","preparateur","admin"] },
    { href: "proposer",              label: "💡 Proposer",          id: "proposer",              roles: ["membre","preparateur","admin"] },
    { href: "programme",             label: "🕊️ Programme",         id: "programme",             roles: ["membre","preparateur","admin"] },
    { href: "preparation-culte",     label: "⛪ Prépa. culte",      id: "preparation-culte",     roles: ["preparateur","admin"] },
    { href: "preparation-evenement", label: "📅 Prépa. événement",  id: "preparation-evenement", roles: ["admin"], rolesExtra: ["preparateur"], requiresEvenement: true },
    { href: "propositions",          label: "📋 Propositions",      id: "propositions",          roles: ["admin"] },
    { href: "validation-programme",  label: "✅ Validation",        id: "validation-programme",  roles: ["admin"] },
    { href: "designateur",           label: "🎯 Désignateur",       id: "designateur",           roles: ["admin"] },
    { href: "gestion-themes",        label: "🏷️ Gestion thèmes",   id: "gestion-themes",        roles: ["admin"] },
    { href: "evenements",            label: "📅 Événements",        id: "evenements",            roles: ["admin"] },
    { href: "statistiques",          label: "📊 Statistiques",      id: "statistiques",          roles: ["membre","preparateur","admin"] },
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
    + '<span class="snav-logo">&#9834;</span>'
    + '<span class="snav-title">Mélodie\'s Book</span>'
    + '</a>'
    + '<div class="snav-user">'
    + '<div class="snav-user-info">'
    + '<span class="snav-user-nom">' + _esc(nom) + '</span>'
    + '<span class="snav-user-role" style="' + roleCouleur + '">' + roleLabel + '</span>'
    + '</div>'
    + (isDashboard ? '<button class="snav-quit" onclick="snavLogout()">&#11161; Quitter</button>' : '')
    + '</div>'
    + '</div>'
    + '<div class="snav-links-wrap">'
    + '<div class="snav-links" id="snavLinks">';

  liensFiltres.forEach(function(l) {
    var isActive = l.id === pageActive;
    navHtml += '<a href="' + l.href + '" class="snav-link' + (isActive ? ' snav-link-active' : '') + '">'
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
      ".snav-quit:hover{border-color:rgba(192,57,43,0.5);color:#E57373;background:rgba(192,57,43,0.08);}",
      ".snav-links-wrap{overflow-x:auto;scrollbar-width:none;border-top:1px solid rgba(201,168,76,0.1);}",
      ".snav-links-wrap::-webkit-scrollbar{display:none;}",
      ".snav-links{display:flex;gap:0;padding:0 0.5rem;min-width:max-content;}",
      ".snav-link{display:inline-flex;align-items:center;padding:0.55rem 0.85rem;font-family:'Lato',sans-serif;font-size:0.8rem;font-weight:600;color:rgba(250,246,237,0.6);text-decoration:none;letter-spacing:0.03em;white-space:nowrap;border-bottom:2px solid transparent;transition:color 0.2s,border-color 0.2s;}",
      ".snav-link:hover{color:#FAF6ED;}",
      ".snav-link-active{color:#F0D98A;border-bottom-color:#C9A84C;}",
      "body{padding-top:0!important;}"
    ].join("");
    document.head.appendChild(style);
  }
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

function _esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
