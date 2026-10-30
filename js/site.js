/* ================================================================
   CONFIGURATION — à modifier par la pharmacie
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

// Produits : chargés uniquement depuis la base (vue publique « catalogue »), jamais écrits dans le site.
let PRODUITS = [];
let etatCatalogue = "chargement";   // chargement | ok | vide | erreur

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

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}

/* Coordonnées */
$("#year").textContent = new Date().getFullYear();
$("#c-addr").textContent = CONFIG.adresse;
$("#c-phone").textContent = CONFIG.telephone;
$("#c-wa").textContent = "+" + CONFIG.whatsapp.replace(/^(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");
$("#c-map").href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(CONFIG.mapsQuery);
$$("[data-tel]").forEach(a => (a.href = telHref));
$$("[data-phone-text]").forEach(s => (s.textContent = CONFIG.telephone));
$$("[data-wa]").forEach(a => (a.href = waLink(`Bonjour ${CONFIG.nom}, `)));
$$("[data-copy]").forEach(b => b.addEventListener("click", () => {
  const val = b.dataset.copy === "phone" ? CONFIG.telephone : $("#c-wa").textContent;
  const p = navigator.clipboard ? navigator.clipboard.writeText(val) : Promise.reject();
  p.then(() => toast("Numéro copié"), () => {
    const el = b.closest(".ct").querySelector(".val");
    const r = document.createRange(); r.selectNodeContents(el);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    toast("Numéro sélectionné, copiez-le");
  });
}));

/* Menu mobile */
const nav = $("#nav"), menuBtn = $("#menu-btn");
menuBtn.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", open);
});
$$("a", nav).forEach(a => a.addEventListener("click", () => { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", false); }));

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

function renderHours() {
  const now = dakarNow(), h = CONFIG.horaires[now.day];
  const open = !!h && now.min >= toMin(h[0]) && now.min < toMin(h[1]);
  let label, detail;
  if (open) { label = "Ouvert maintenant"; detail = `Ferme à ${fmtH(h[1])}`; }
  else { label = CONFIG.deGarde ? "De garde" : "Fermé"; detail = CONFIG.deGarde ? "Sonnez à la porte" : `Ouvre ${nextOpening(now)}`; }
  const isOpen = open || CONFIG.deGarde;

  $("#pill").classList.toggle("closed", !isOpen);
  $("#pill-text").textContent = label;
  $("#fact-status").textContent = label;
  $("#fact-hours").textContent = detail;
  $("#status-line").classList.toggle("closed", !isOpen);
  $("#status-text").textContent = `${label} · ${detail}`;
  if (CONFIG.deGarde) $("#garde-text").textContent = "Nous sommes de garde aujourd'hui. Présentez-vous à la pharmacie ou appelez-nous avant de venir.";

  const order = [1, 2, 3, 4, 5, 6, 0];
  $("#hours-body").innerHTML = order.map(d => {
    const r = CONFIG.horaires[d];
    return `<tr class="${d === now.day ? "today" : ""}"><td>${JOURS[d]}${d === now.day ? " · aujourd'hui" : ""}</td><td>${r ? fmtH(r[0]) + " – " + fmtH(r[1]) : "Fermé"}</td></tr>`;
  }).join("");
}
renderHours();
setInterval(renderHours, 60000);

/* Ordonnance */
const form = $("#rx-form"), fileIn = $("#rx-file"), drop = $("#drop");
$$('input[name="mode"]').forEach(r => r.addEventListener("change", () => {
  $("#addr-field").hidden = $("#rx-mode-l").checked === false;
}));
let rxFile = null;
function showFile(f) {
  if (!f) return;
  if (f.size > 15 * 1024 * 1024) { toast("Fichier trop lourd (15 Mo maximum)"); return; }
  rxFile = f;
  $("#preview-name").textContent = f.name;
  const img = $("#preview-img");
  if (f.type.startsWith("image/")) { img.src = URL.createObjectURL(f); img.hidden = false; }
  else img.hidden = true;
  $("#preview").hidden = false; drop.hidden = true;
}
fileIn.addEventListener("change", () => showFile(fileIn.files[0]));
["dragenter", "dragover"].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", ev => {
  const f = ev.dataTransfer.files[0];
  if (f) { try { const dt = new DataTransfer(); dt.items.add(f); fileIn.files = dt.files; } catch {} showFile(f); }
});
$("#preview-rm").addEventListener("click", () => { rxFile = null; fileIn.value = ""; $("#preview").hidden = true; drop.hidden = false; });

/* Connexion à la base (chargée une seule fois, à la demande) */
let sbPromise = null;
function getSb() {
  const c = window.SUPABASE_CONFIG;
  if (!c || !c.url || !c.anonKey) return Promise.resolve(null);
  if (!sbPromise) sbPromise = new Promise(res => {
    const make = () => res(window.supabase ? window.supabase.createClient(c.url, c.anonKey) : null);
    if (window.supabase) return make();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
    s.integrity = "sha384-GFr3yTh5lJznCbZfpTtXnwboFsxqtTQoeTZCRHhE0579KrRmlCzen5AA8ohaB5ug"; s.crossOrigin = "anonymous";
    s.onload = make; s.onerror = () => res(null);
    document.head.appendChild(s);
  });
  return sbPromise;
}

/* Photo réduite avant l'envoi : rapide même avec une petite connexion */
async function reduireImage(file, max) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, "image/jpeg", 0.85));
  } finally { URL.revokeObjectURL(url); }
}

/* L'ordonnance est déposée dans l'espace privé du pharmacien (lui seul peut l'ouvrir). */
async function envoyerOrdonnance(d) {
  const sb = await getSb();
  if (!sb) return null;
  const id = crypto.randomUUID();
  const reference = "ORD-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();
  let blob = rxFile, type = rxFile.type || "application/octet-stream", ext = (rxFile.name.split(".").pop() || "bin").toLowerCase();
  if (type.startsWith("image/")) {
    try { const r = await reduireImage(rxFile, 1800); if (r) { blob = r; type = "image/jpeg"; ext = "jpg"; } } catch {}
  }
  const fichier = `${id}.${ext}`;
  const up = await sb.storage.from("ordonnances").upload(fichier, blob, { contentType: type });
  if (up.error) throw up.error;
  const { error } = await sb.from("ordonnances").insert({ id, reference, fichier, ...d });
  if (error) throw error;
  return reference;
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#rx-name").value.trim(), phone = $("#rx-phone").value.trim();
  const livraison = $("#rx-mode-l").checked, addr = $("#rx-addr").value.trim();
  const note = $("#rx-note").value.trim();
  const err = $("#rx-err");
  const problems = [];
  if (!name) problems.push("votre nom");
  if (phone.replace(/\D/g, "").length < 9) problems.push("un numéro de téléphone valide (9 chiffres)");
  if (livraison && !addr) problems.push("l'adresse de livraison");
  if (!rxFile) problems.push("la photo de l'ordonnance");
  if (problems.length) { err.textContent = "Merci d'indiquer " + problems.join(", ") + "."; err.hidden = false; return; }
  err.hidden = true;

  const btn = $("#rx-submit");
  btn.disabled = true; btn.lastChild.textContent = "Envoi de l'ordonnance…";
  let ref = null;
  try {
    ref = await envoyerOrdonnance({ nom: name, telephone: phone, mode: livraison ? "livraison" : "retrait", adresse: livraison ? addr : null, note: note || null });
  } catch { ref = null; }
  btn.disabled = false; btn.lastChild.textContent = "Envoyer l'ordonnance";

  const lines = [
    `Bonjour ${CONFIG.nom}, je souhaite faire préparer une ordonnance.`,
    ``,
    `Nom : ${name}`,
    `Téléphone : ${phone}`,
    `Mode : ${livraison ? "Livraison – " + addr : "Retrait à la pharmacie"}`,
  ];
  if (note) lines.push(`Message : ${note}`);
  if (ref) lines.push(``, `Référence : ${ref}`, `(Photo de l'ordonnance envoyée par le site.)`);
  else lines.push(``, `(Je joins la photo de l'ordonnance.)`);
  const url = waLink(lines.join("\n"));
  $("#rx-link").href = url;
  $("#rx-done-title").textContent = ref ? `Ordonnance reçue · référence ${ref}` : "Votre message est prêt.";
  $("#rx-done-text").textContent = ref
    ? "Le pharmacien a bien reçu la photo. Envoyez maintenant le message WhatsApp pour le prévenir et recevoir la confirmation."
    : "Ouvrez WhatsApp, puis joignez la photo de l'ordonnance au message avant de l'envoyer.";
  $("#rx-done").hidden = false;
  window.open(url, "_blank", "noopener");
});

/* Boutique */
let cart = store.get("bs-cart", {});
// Les produits de la base ont des identifiants de type UUID : tout le reste vient d'une ancienne version du site.
Object.keys(cart).forEach(id => { if (!/^[0-9a-f-]{36}$/i.test(id)) delete cart[id]; });
let cat = "Tout";
function renderChips() {
  const cs = PRODUITS.length ? ["Tout", ...new Set(PRODUITS.map(p => p.cat))] : [];
  if (!cs.includes(cat)) cat = "Tout";
  $("#chips").innerHTML = cs.map(c => `<button class="chip" type="button" aria-pressed="${c === cat}" data-cat="${c}">${c}</button>`).join("");
}
$("#chips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  cat = b.dataset.cat;
  $$(".chip").forEach(x => x.setAttribute("aria-pressed", x === b));
  renderProducts();
});
$("#q").addEventListener("input", renderProducts);

const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/* Visuels des produits : la vraie photo si le pharmacien en a ajouté une, sinon une illustration du type de produit. */
function kindOf(p) {
  const n = norm(p.nom + " " + p.desc);
  const rules = [
    [/biberon/, "biberon"], [/couche/, "pack"], [/thermom/, "thermo"], [/tensiom/, "tensio"], [/glycemie|gluco/, "gluco"],
    [/trousse|pansement|secours/, "kit"], [/spray|repulsif|moustique/, "spray"], [/sachet|rehydratation/, "sachet"],
    [/effervescent/, "tubeC"], [/karite|beurre|lait infantile|baume/, "pot"], [/creme|dentifrice|pommade/, "tube"],
    [/gel|sirop|liniment|lotion|shampo|huile|flacon/, "bottle"]
  ];
  return (rules.find(([re]) => re.test(n)) || [, "box"])[1];
}
const S = 'fill="var(--surface)"', A = 'fill="var(--sand)"', G = 'fill="var(--green)"';
const ILL = {
  tube: `<path d="M62 22h36l-5 64H67z" ${S}/><path d="M62 22h36" stroke-width="5"/><rect x="70" y="42" width="20" height="24" rx="3" ${A}/><rect x="71" y="86" width="18" height="14" rx="3" ${G}/>`,
  pot: `<rect x="48" y="52" width="64" height="46" rx="9" ${S}/><rect x="44" y="38" width="72" height="17" rx="5" ${G}/><rect x="60" y="64" width="40" height="20" rx="3" ${A}/>`,
  bottle: `<rect x="74" y="16" width="12" height="12" rx="2" ${G}/><path d="M70 28h20v12l8 8v50H62V48l8-8z" ${S}/><rect x="66" y="60" width="28" height="26" rx="3" ${A}/>`,
  spray: `<path d="M74 14h16v8h10v6H74z" ${G}/><rect x="72" y="28" width="20" height="10" ${G}/><rect x="62" y="38" width="40" height="62" rx="10" ${S}/><rect x="68" y="56" width="28" height="26" rx="3" ${A}/>`,
  box: `<rect x="38" y="36" width="84" height="60" rx="4" ${S}/><path d="M38 50h84"/><rect x="48" y="60" width="38" height="9" rx="2" ${A}/><rect x="48" y="75" width="24" height="6" rx="2" ${G}/><circle cx="104" cy="76" r="8" ${A}/>`,
  tubeC: `<rect x="64" y="30" width="32" height="70" rx="5" ${S}/><rect x="61" y="18" width="38" height="14" rx="4" ${G}/><rect x="64" y="52" width="32" height="26" ${A}/>`,
  sachet: `<path d="M50 30l6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6v66H50z" ${S}/><rect x="60" y="52" width="40" height="22" rx="3" ${A}/><path d="M66 86h28"/>`,
  biberon: `<path d="M74 34q6-22 12 0z" ${A}/><path d="M66 34h28l4 10H62z" ${G}/><rect x="62" y="44" width="36" height="56" rx="10" ${S}/><path d="M86 58h8M86 70h8M86 82h8"/>`,
  pack: `<rect x="34" y="30" width="92" height="68" rx="8" ${S}/><rect x="34" y="30" width="92" height="16" rx="8" ${G}/><circle cx="80" cy="72" r="14" ${A}/><path d="M74 74q6 6 12 0"/>`,
  thermo: `<rect x="74" y="14" width="12" height="74" rx="6" ${S}/><rect x="70" y="40" width="20" height="12" rx="2" ${A}/><circle cx="80" cy="94" r="8" ${G}/>`,
  tensio: `<path d="M30 76q0-30 30-30" fill="none"/><rect x="56" y="34" width="70" height="60" rx="10" ${S}/><rect x="66" y="44" width="50" height="24" rx="3" ${G}/><circle cx="91" cy="82" r="6" ${A}/>`,
  gluco: `<rect x="56" y="24" width="48" height="76" rx="10" ${S}/><rect x="64" y="34" width="32" height="26" rx="3" ${G}/><circle cx="80" cy="78" r="7" ${A}/><rect x="74" y="100" width="12" height="12" ${A}/>`,
  kit: `<rect x="66" y="28" width="28" height="14" rx="4" fill="none"/><rect x="36" y="40" width="88" height="58" rx="8" ${S}/><path d="M74 54h12v10h10v12H86v10H74V76H64V64h10z" ${A}/>`
};
/* Photos libres de droits (img/photos/credits.json) pour les produits qui n'ont pas encore leur propre photo. */
function photoType(p) {
  const n = norm(p.nom + " " + p.desc);
  if (/tensiom/.test(n)) return "img/photos/tensio.jpg";
  if (/effervescent|vitamine c/.test(n)) return "img/photos/effervescent.jpg";
  if (/vitamin|acide folique|\bfer\b/.test(n)) return "img/photos/vitc.jpg";
  return "";
}
function pic(p) {
  const src = p.img || photoType(p);
  if (src) return `<div class="pic"><img src="${src}" alt="${p.nom}" loading="lazy" decoding="async"></div>`;
  return `<div class="pic" aria-hidden="true"><svg viewBox="0 0 160 120"><circle cx="128" cy="24" r="36" fill="var(--surface)" opacity=".55"/><g stroke="var(--green)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${ILL[kindOf(p)]}</g></svg></div>`;
}

const ETATS = {
  chargement: "Chargement des produits en stock…",
  vide: "Aucun produit n'est encore affiché en ligne. Demandez-nous directement sur WhatsApp.",
  erreur: "Le catalogue ne peut pas être chargé pour le moment (connexion ?). Réessayez dans un instant ou écrivez-nous sur WhatsApp."
};
function renderProducts() {
  if (etatCatalogue !== "ok") { $("#products").innerHTML = `<p class="empty">${ETATS[etatCatalogue]}</p>`; return; }
  const q = norm($("#q").value.trim());
  const list = PRODUITS.filter(p => (cat === "Tout" || p.cat === cat) && (!q || norm(p.nom + " " + p.desc + " " + p.cat).includes(q)));
  $("#products").innerHTML = list.length ? list.map(p => `
    <article class="card prod">
      ${pic(p)}
      <span class="cat">${p.cat}</span>
      <h3>${p.nom}</h3>
      <p>${p.desc}</p>
      <div class="foot"><span class="price">${fcfa(p.prix)}</span>
        ${p.dispo ? `<button class="add ${cart[p.id] ? "in" : ""}" type="button" data-id="${p.id}">${cart[p.id] ? "Ajouté ✓" : "Ajouter"}</button>`
          : `<span class="hint">Bientôt disponible</span>`}</div>
    </article>`).join("")
    : `<p class="empty">Aucun produit trouvé. Demandez-nous directement sur WhatsApp, nous l'avons peut-être en stock.</p>`;
}
/* Seul un produit présent dans la base ET en stock peut entrer dans le panier. */
function ajouterAuPanier(id) {
  const p = PRODUITS.find(x => x.id === id);
  if (!p || !p.dispo) { toast("Ce produit n'est pas disponible pour le moment"); renderProducts(); return false; }
  cart[id] = (cart[id] || 0) + 1;
  saveCart(); renderProducts();
  toast("Ajouté à votre liste");
  return true;
}
$("#products").addEventListener("click", e => {
  const b = e.target.closest(".add"); if (b) ajouterAuPanier(b.dataset.id);
});
/* Retire du panier ce qui n'est plus dans la base ou plus en stock. */
function nettoyerPanier() {
  const retires = [];
  Object.keys(cart).forEach(id => {
    const p = PRODUITS.find(x => x.id === id);
    if (!p || !p.dispo) { if (p) retires.push(p.nom); delete cart[id]; }
  });
  saveCart();
  return retires;
}

function saveCart() { store.set("bs-cart", cart); renderCart(); }
function renderCart() {
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  const n = ids.reduce((s, id) => s + cart[id], 0);
  $("#cart-n").textContent = n;
  $("#cart-fab").hidden = n === 0;
  let total = 0;
  $("#lines").innerHTML = ids.map(id => {
    const p = PRODUITS.find(x => x.id === id); if (!p) return "";
    total += p.prix * cart[id];
    return `<div class="line"><b>${p.nom}</b><span class="mono">${fcfa(p.prix * cart[id])}</span>
      <span class="q"><button type="button" data-d="-1" data-id="${id}" aria-label="Retirer un">−</button><span class="mono">${cart[id]}</span><button type="button" data-d="1" data-id="${id}" aria-label="Ajouter un">+</button></span></div>`;
  }).join("") || `<p class="empty">Votre liste est vide.</p>`;
  $("#total").textContent = fcfa(total);
  updateCartLink();
}
function updateCartLink() {
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  const name = $("#cart-name").value.trim();
  const lines = ids.map(id => { const p = PRODUITS.find(x => x.id === id); return p ? `• ${cart[id]} × ${p.nom}` : ""; }).filter(Boolean);
  const msg = [`Bonjour ${CONFIG.nom}${name ? ", je suis " + name : ""}.`, `Je souhaite commander :`, ...lines, ``, `Merci de me confirmer la disponibilité et le prix.`].join("\n");
  $("#cart-send").href = waLink(msg);
}
$("#cart-name").addEventListener("input", updateCartLink);
$("#lines").addEventListener("click", e => {
  const b = e.target.closest("button[data-d]"); if (!b) return;
  const id = b.dataset.id;
  if (+b.dataset.d > 0) { ajouterAuPanier(id); return; }
  cart[id] = Math.max(0, (cart[id] || 0) - 1);
  if (!cart[id]) delete cart[id];
  saveCart(); renderProducts();
});
$("#cart-clear").addEventListener("click", () => { cart = {}; saveCart(); renderProducts(); closeDrawer(); });
const drawer = $("#drawer");
function closeDrawer() { drawer.hidden = true; $("#cart-fab").focus(); }
$("#cart-fab").addEventListener("click", async () => {
  drawer.hidden = false; $("#drawer-x").focus();
  await chargerCatalogue();          // revérifie le stock avant la commande
});
$("#drawer-x").addEventListener("click", closeDrawer);
drawer.addEventListener("click", e => { if (e.target === drawer) closeDrawer(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });
renderChips(); renderProducts(); renderCart();

/* Stock réel depuis la base (catalogue public : nom, prix, disponible). Rechargé toutes les 2 minutes. */
const escTexte = t => String(t ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
async function chargerCatalogue() {
  try {
    const sb = await getSb();
    if (!sb) throw new Error("base non configurée");
    const { data, error } = await sb.from("catalogue").select("*").order("nom");
    if (error) throw error;
    PRODUITS = (data || []).map(p => ({ id: p.id, nom: escTexte(p.nom), desc: escTexte(p.description), cat: escTexte(p.categorie),
      prix: p.prix_vente, dispo: p.disponible === true,
      img: /^https:\/\//.test(p.image_url || "") ? escTexte(p.image_url) : "" }));
    etatCatalogue = PRODUITS.length ? "ok" : "vide";
    const retires = nettoyerPanier();
    if (retires.length) toast(`Retiré de votre liste (plus en stock) : ${retires.join(", ")}`);
  } catch {
    if (!PRODUITS.length) etatCatalogue = "erreur";   // on garde la dernière liste connue si elle existe
  }
  renderChips(); renderProducts(); renderCart();
}
chargerCatalogue();
setInterval(() => { if (!document.hidden) chargerCatalogue(); }, 120000);

/* Enseigne LED : croix verte animée, comme les croix de pharmacie */
(function led() {
  const c = $("#led"), ctx = c.getContext("2d");
  const N = 15, still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const inCross = (x, y) => (x >= 5 && x <= 9) || (y >= 5 && y <= 9);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth || 300;
    c.width = c.height = Math.round(w * dpr);
  }
  size(); addEventListener("resize", size);
  function frame(t) {
    const W = c.width, cell = W / N, r = cell * 0.36, on = css("--led"), off = css("--led-off");
    ctx.clearRect(0, 0, W, W);
    const s = t / 1000, mode = Math.floor(s / 6) % 3;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!inCross(x, y)) continue;
      const dx = x - 7, dy = y - 7, d = Math.hypot(dx, dy);
      let b;
      if (still) b = 1;
      else if (mode === 0) b = 0.55 + 0.45 * Math.sin(d * 0.9 - s * 4);                       // ondes depuis le centre
      else if (mode === 1) b = 0.5 + 0.5 * Math.sin((x + y) * 0.6 - s * 5);                     // balayage diagonal
      else b = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s * 3)) * (1 - Math.min(d / 10, 1)) + 0.25;  // pulsation
      b = Math.max(0.12, Math.min(1, b));
      const cx = (x + .5) * cell, cy = (y + .5) * cell;
      ctx.globalAlpha = 1; ctx.fillStyle = off;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = b; ctx.fillStyle = on;
      ctx.shadowColor = on; ctx.shadowBlur = cell * 0.5 * b;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    if (!still) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
