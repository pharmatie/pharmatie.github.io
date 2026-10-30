/* ================================================================
   CONFIGURATION — à modifier par la pharmacie (partagée par toutes les pages)
   ================================================================ */
const CONFIG = {
  nom: "Pharmacie Borom Sam",
  pharmacien: "Dr Djily Mbaye",
  telephone: "+221 77 866 84 24",
  whatsapp: "221778668424",              // indicatif + numéro, sans + ni espaces
  adresse: "Adresse à compléter, Sénégal", // À REMPLACER : quartier, rue, repère
  mapsQuery: "Pharmacie Borom Sam Sénégal", // ce que Google Maps doit chercher
  deGarde: false,                         // passer à true les jours de garde
  // Horaires : 0 = dimanche … 6 = samedi. null = fermé.
  horaires: {
    1: ["08:00", "23:00"], 2: ["08:00", "23:00"], 3: ["08:00", "23:00"],
    4: ["08:00", "23:00"], 5: ["08:00", "23:00"], 6: ["08:00", "23:00"],
    0: ["08:00", "20:00"]
  }
};

/* ================================================================ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fcfa = n => n.toLocaleString("fr-FR").replace(/ | /g, " ") + " FCFA";
const waLink = text => `https://wa.me/${CONFIG.whatsapp}` + (text ? `?text=${encodeURIComponent(text)}` : "");
const telHref = "tel:" + CONFIG.telephone.replace(/\s/g, "");
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const siPresent = (s, fn) => { const e = $(s); if (e) fn(e); };

function toast(msg) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}

/* Liens et coordonnées présents sur toutes les pages */
siPresent("#year", e => (e.textContent = new Date().getFullYear()));
$$("[data-tel]").forEach(a => (a.href = telHref));
$$("[data-phone-text]").forEach(s => (s.textContent = CONFIG.telephone));
$$("[data-wa]").forEach(a => (a.href = waLink(`Bonjour ${CONFIG.nom}, `)));
$$("[data-adresse]").forEach(e => (e.textContent = CONFIG.adresse));

/* Menu mobile */
siPresent("#menu-btn", menuBtn => {
  const nav = $("#nav");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  $$("a", nav).forEach(a => a.addEventListener("click", () => { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", false); }));
});

/* Horaires, heure de Dakar (GMT) */
function dakarNow() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Dakar", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, min: (+get("hour") % 24) * 60 + +get("minute") };
}
const toMin = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const fmtH = s => s.replace(":00", "h").replace(":", "h");

function nextOpening(now) {
  for (let i = 0; i < 8; i++) {
    const d = (now.day + i) % 7, h = CONFIG.horaires[d];
    if (!h) continue;
    if (i === 0 && now.min >= toMin(h[0])) continue;
    return (i === 0 ? "aujourd'hui" : i === 1 ? "demain" : JOURS[d].toLowerCase()) + " à " + fmtH(h[0]);
  }
  return "";
}

/* Statut ouvert / fermé : met à jour tout ce qui existe sur la page */
function renderHours() {
  const now = dakarNow(), h = CONFIG.horaires[now.day];
  const open = !!h && now.min >= toMin(h[0]) && now.min < toMin(h[1]);
  let label, detail;
  if (open) { label = "Ouvert maintenant"; detail = `Ferme à ${fmtH(h[1])}`; }
  else { label = CONFIG.deGarde ? "De garde" : "Fermé"; detail = CONFIG.deGarde ? "Sonnez à la porte" : `Ouvre ${nextOpening(now)}`; }
  const isOpen = open || CONFIG.deGarde;

  siPresent("#pill", e => e.classList.toggle("closed", !isOpen));
  siPresent("#pill-text", e => (e.textContent = label));
  siPresent("#fact-status", e => (e.textContent = label));
  siPresent("#fact-hours", e => (e.textContent = detail));
  siPresent("#status-line", e => e.classList.toggle("closed", !isOpen));
  siPresent("#status-text", e => (e.textContent = `${label} · ${detail}`));
  if (CONFIG.deGarde) siPresent("#garde-text", e => (e.textContent = "Nous sommes de garde aujourd'hui. Présentez-vous à la pharmacie ou appelez-nous avant de venir."));

  siPresent("#hours-body", e => {
    e.innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => {
      const r = CONFIG.horaires[d];
      return `<tr class="${d === now.day ? "today" : ""}"><td>${JOURS[d]}${d === now.day ? " · aujourd'hui" : ""}</td><td>${r ? fmtH(r[0]) + " – " + fmtH(r[1]) : "Fermé"}</td></tr>`;
    }).join("");
  });
}

/* Horloge : heure de Dakar en direct (même heure pour tous les visiteurs, où qu'ils soient). */
const fmtHorloge = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Dakar", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const fmtDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Dakar", weekday: "long", day: "numeric", month: "long" });
let derniereMinute = "";
function horloge() {
  const maintenant = new Date();
  const hms = fmtHorloge.format(maintenant);
  $$("[data-horloge]").forEach(el => (el.textContent = hms));
  $$("[data-date-dakar]").forEach(el => (el.textContent = fmtDate.format(maintenant)));
  const minute = hms.slice(0, 5);
  if (minute !== derniereMinute) { derniereMinute = minute; renderHours(); }   // statut « ouvert / fermé » à la minute près
}
horloge();
setInterval(horloge, 1000);

/* Outils de texte */
const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const escTexte = t => String(t ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/* Barre du haut au défilement : elle se resserre, une ligne lumineuse montre la progression
   dans la page, et le lien de la section en cours s'allume. */
(function barreDefilement() {
  const barre = $(".topbar");
  if (!barre) return;
  const liens = $$('#nav a[href^="./#"]')
    .map(a => ({ a, cible: document.getElementById(a.getAttribute("href").slice(3)) }))
    .filter(x => x.cible);
  let prevu = false;
  function maj() {
    prevu = false;
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    barre.classList.toggle("defile", y > 12);
    barre.style.setProperty("--progression", max > 0 ? Math.min(1, y / max).toFixed(4) : "0");
    let actif = null;
    liens.forEach(x => { if (x.cible.getBoundingClientRect().top <= 140) actif = x; });
    if (y + innerHeight >= document.documentElement.scrollHeight - 4 && liens.length) actif = liens[liens.length - 1];
    liens.forEach(x => x.a.classList.toggle("actif", x === actif));
  }
  const planifier = () => { if (!prevu) { prevu = true; requestAnimationFrame(maj); } };
  addEventListener("scroll", planifier, { passive: true });
  addEventListener("resize", planifier);
  maj();
})();
