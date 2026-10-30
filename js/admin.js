/* L'espace pharmacien ne doit jamais s'afficher dans le cadre d'un autre site (anti-clickjacking). */
if (window.top !== window.self) { document.documentElement.innerHTML = ""; window.top.location = window.self.location.href; }

/* ===================== Accès aux données ===================== */
const cfg = window.SUPABASE_CONFIG || {};
const LIVE = !!(cfg.url && cfg.anonKey && window.supabase);

function fail(error) {
  const m = (error && error.message) || String(error);
  if (/Invalid login credentials/i.test(m)) return new Error("Email ou mot de passe incorrect.");
  if (/Failed to fetch|NetworkError/i.test(m)) return new Error("Pas de connexion internet. Réessayez.");
  if (/duplicate key.*code_barre/i.test(m)) return new Error("Ce code-barres existe déjà pour un autre produit.");
  return new Error(m);
}

const DB = LIVE ? (() => {
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  const q = async p => { const { data, error } = await p; if (error) throw fail(error); return data; };
  return {
    async user() { const { data } = await sb.auth.getSession(); return data.session?.user || null; },
    async login(email, password) { await q(sb.auth.signInWithPassword({ email, password })); },
    async logout() { await sb.auth.signOut(); },
    async reset(email) { await q(sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
    onRecovery(fn) { sb.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") fn(); }); },
    async setPassword(password) { await q(sb.auth.updateUser({ password })); },
    async isAdmin() { return await q(sb.rpc("is_admin")); },
    async monRole() { return await q(sb.rpc("mon_role")); },
    equipe: () => q(sb.from("admins").select("user_id, nom, email, role, created_at").order("created_at")),
    async equipeAction(body) {
      const { data, error } = await sb.functions.invoke("gerer-equipe", { body });
      if (error) {
        let msg = error.message;
        try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      return data;
    },
    produits: () => q(sb.from("produits").select("*").order("nom")),
    async save(p) {
      const { id, ...row } = p;
      if (id) return q(sb.from("produits").update(row).eq("id", id));
      const qte = row.quantite || 0; row.quantite = 0;
      const [created] = await q(sb.from("produits").insert(row).select());
      if (qte > 0) await this.mouvement({ produit_id: created.id, type: "entree", quantite: qte, date_peremption: row.prochaine_peremption, note: "Stock initial" });
    },
    remove: id => q(sb.from("produits").delete().eq("id", id)),
    async uploadPhoto(blob) {
      const path = `${crypto.randomUUID()}.jpg`;
      await q(sb.storage.from("produits").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" }));
      return sb.storage.from("produits").getPublicUrl(path).data.publicUrl;
    },
    ordonnances: () => q(sb.from("ordonnances").select("*").order("created_at", { ascending: false }).limit(100)),
    setStatut: (id, statut) => q(sb.from("ordonnances").update({ statut }).eq("id", id)),
    async fichierUrl(path) {
      const data = await q(sb.storage.from("ordonnances").createSignedUrl(path, 600));
      return data.signedUrl;
    },
    mouvement: m => q(sb.from("mouvements_stock").insert(m)),
    async mouvements() {
      const rows = await q(sb.from("mouvements_stock").select("*, produits(nom)").order("created_at", { ascending: false }).limit(40));
      return rows.map(r => ({ ...r, nom: r.produits?.nom || "Produit supprimé" }));
    }
  };
})() : (() => {
  /* Mode démonstration : mêmes règles que la vraie base, stockées dans le navigateur. */
  const K = "bs-demo-db";
  const today = new Date();
  const inDays = n => new Date(today.getTime() + n * 864e5).toISOString().slice(0, 10);
  const seed = () => {
    const P = [
      ["Paracétamol 500 mg", "Antalgiques", "Comprimé", 600, 350, 48, 10, inDays(400), false, false],
      ["Amoxicilline 500 mg", "Antibiotiques", "Gélule", 1800, 1100, 6, 8, inDays(210), true, false],
      ["Artéméther-Luméfantrine", "Antipaludiques", "Comprimé", 2500, 1700, 0, 10, null, true, false],
      ["Sels de réhydratation orale", "Premiers soins", "Sachet", 500, 250, 120, 20, inDays(60), false, true],
      ["Crème solaire SPF 50+", "Peau", "Crème", 9500, 6200, 12, 3, inDays(500), false, true],
      ["Vitamine C 1000 mg", "Vitamines", "Comprimé effervescent", 2500, 1500, 3, 5, inDays(45), false, true],
      ["Lait infantile 1er âge", "Bébé", "Poudre", 6000, 4800, 18, 6, inDays(160), false, true],
      ["Tensiomètre de poignet", "Matériel", "", 22000, 15000, 4, 1, null, false, true],
      ["Metformine 850 mg", "Diabète", "Comprimé", 1500, 900, 30, 10, inDays(25), true, false],
      ["Répulsif anti-moustiques", "Premiers soins", "Spray", 4500, 2900, 9, 5, inDays(300), false, true]
    ].map(([nom, categorie, forme, prix_vente, prix_achat, quantite, seuil_alerte, prochaine_peremption, sur_ordonnance, visible_site], i) =>
      ({ id: "d" + i, nom, categorie, forme, description: "", code_barre: null, prix_vente, prix_achat, quantite, seuil_alerte, prochaine_peremption, sur_ordonnance, visible_site }));
    const M = [
      { id: 2, produit_id: "d3", type: "sortie", quantite: -6, note: "Vente comptoir", created_at: new Date(today - 36e5).toISOString() },
      { id: 1, produit_id: "d0", type: "entree", quantite: 50, numero_lot: "PA2410", date_peremption: inDays(400), note: "Livraison grossiste", created_at: new Date(today - 864e5).toISOString() }
    ];
    return { P, M, n: 3 };
  };
  let db; try { db = JSON.parse(localStorage.getItem(K)) || seed(); } catch { db = seed(); }
  const persist = () => { try { localStorage.setItem(K, JSON.stringify(db)); } catch {} };
  let logged = false;
  return {
    async user() { return logged ? { email: "dr.mbaye@demo" } : null; },
    async login() { logged = true; },
    async logout() { logged = false; },
    async reset() {},
    onRecovery() {},
    async setPassword() {},
    async isAdmin() { return true; },
    async monRole() { return "titulaire"; },
    async equipe() {
      if (!db.E) { db.E = [
        { user_id: "u1", nom: "Dr Djily Mbaye", email: "dr.mbaye@demo", role: "titulaire", created_at: new Date().toISOString() },
        { user_id: "u2", nom: "Aminata Fall", email: "aminata@demo", role: "employe", created_at: new Date().toISOString() }
      ]; persist(); }
      return db.E;
    },
    async equipeAction(b) {
      await this.equipe();
      if (b.action === "creer") {
        if (db.E.some(m => m.email === b.email.toLowerCase())) throw new Error("Un compte existe déjà avec cet email.");
        db.E.push({ user_id: "u" + Date.now(), nom: b.nom, email: b.email.toLowerCase(), role: b.role, created_at: new Date().toISOString() });
      } else if (b.action === "retirer") db.E = db.E.filter(m => m.user_id !== b.user_id);
      persist(); return { ok: true };
    },
    async produits() { return [...db.P].sort((a, b) => a.nom.localeCompare(b.nom, "fr")); },
    async save(p) {
      if (p.id) { Object.assign(db.P.find(x => x.id === p.id), p); }
      else {
        if (p.code_barre && db.P.some(x => x.code_barre === p.code_barre)) throw new Error("Ce code-barres existe déjà pour un autre produit.");
        const id = "d" + Date.now(), qte = p.quantite || 0;
        db.P.push({ ...p, id, quantite: 0 });
        if (qte > 0) await this.mouvement({ produit_id: id, type: "entree", quantite: qte, date_peremption: p.prochaine_peremption, note: "Stock initial" });
      }
      persist();
    },
    async remove(id) { db.P = db.P.filter(x => x.id !== id); db.M = db.M.filter(m => m.produit_id !== id); persist(); },
    uploadPhoto: blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }),
    async ordonnances() {
      if (!db.O) {
        const ago = h => new Date(Date.now() - h * 36e5).toISOString();
        db.O = [
          { id: "o1", reference: "ORD-7K3F2A", nom: "Awa Diop", telephone: "77 123 45 67", mode: "retrait", adresse: null, note: "Générique accepté", fichier: null, statut: "nouvelle", created_at: ago(0.3) },
          { id: "o2", reference: "ORD-1B9C04", nom: "Moussa Ndiaye", telephone: "76 555 22 11", mode: "livraison", adresse: "Cité Keur Gorgui, villa 12", note: null, fichier: null, statut: "en_preparation", created_at: ago(3) },
          { id: "o3", reference: "ORD-E4D210", nom: "Fatou Sow", telephone: "70 987 65 43", mode: "retrait", adresse: null, note: null, fichier: null, statut: "terminee", created_at: ago(26) }
        ];
        persist();
      }
      return db.O;
    },
    async setStatut(id, statut) { db.O.find(o => o.id === id).statut = statut; persist(); },
    async fichierUrl() { return null; },
    async mouvement(m) {
      const p = db.P.find(x => x.id === m.produit_id);
      const delta = m.type === "entree" ? Math.abs(m.quantite) : m.type === "sortie" ? -Math.abs(m.quantite) : m.quantite;
      if (p.quantite + delta < 0) throw new Error(`Stock insuffisant : il reste ${p.quantite} unité(s)`);
      p.quantite += delta;
      if (m.type === "entree" && m.date_peremption && (!p.prochaine_peremption || p.prochaine_peremption < inDays(0) || m.date_peremption < p.prochaine_peremption)) p.prochaine_peremption = m.date_peremption;
      db.M.unshift({ ...m, quantite: delta, id: db.n++, created_at: new Date().toISOString() });
      persist();
    },
    async mouvements() { return db.M.slice(0, 40).map(m => ({ ...m, nom: db.P.find(p => p.id === m.produit_id)?.nom || "Produit supprimé" })); }
  };
})();

/* ===================== Outils ===================== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fcfa = n => (n ?? 0).toLocaleString("fr-FR").replace(/ | /g, " ") + " F";
const fdate = d => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const daysTo = d => d ? Math.round((new Date(d + "T00:00:00") - new Date(new Date().toDateString())) / 864e5) : Infinity;
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2800); }
function show(view) { ["#login-view", "#app-view", "#loading"].forEach(s => ($(s).hidden = s !== view)); }

let produits = [], filtre = "tous";

function etat(p) {
  if (p.quantite === 0) return { k: "rupture", cls: "bad", txt: "Rupture" };
  const j = daysTo(p.prochaine_peremption);
  if (j < 0) return { k: "perime", cls: "bad", txt: "Périmé" };
  if (p.quantite <= p.seuil_alerte) return { k: "faible", cls: "warn", txt: "Stock faible" };
  if (j <= 90) return { k: "peremption", cls: "warn", txt: `Périme dans ${j} j` };
  return { k: "ok", cls: "ok", txt: "En stock" };
}

/* ===================== Rendu ===================== */
const FILTRES = [["tous", "Tous"], ["alerte", "À commander"], ["peremption", "Péremption < 90 j"], ["ordonnance", "Sur ordonnance"], ["site", "Sur le site"]];
$("#filters").innerHTML = FILTRES.map(([k, l]) => `<button class="chip" type="button" data-f="${k}" aria-pressed="${k === filtre}">${l}</button>`).join("");
$("#filters").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) setFiltre(b.dataset.f); });
function setFiltre(f) { filtre = f; document.querySelectorAll("#filters .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.f === f)); renderRows(); }
$("#q").addEventListener("input", renderRows);

function renderTiles() {
  const alerte = produits.filter(p => p.quantite <= p.seuil_alerte).length;
  const rupt = produits.filter(p => p.quantite === 0).length;
  const per = produits.filter(p => p.quantite > 0 && daysTo(p.prochaine_peremption) <= 90).length;
  const valeur = produits.reduce((s, p) => s + (p.prix_achat ?? p.prix_vente) * p.quantite, 0);
  $("#tiles").innerHTML = `
    <button class="tile" data-f="tous" type="button"><span>Valeur du stock (prix d'achat)</span><b>${fcfa(valeur)}</b></button>
    <button class="tile" data-f="tous" type="button"><span>Produits référencés</span><b>${produits.length}</b></button>
    <button class="tile ${alerte ? "warn" : ""}" data-f="alerte" type="button"><span>À commander</span><b>${alerte}</b></button>
    <button class="tile ${rupt ? "bad" : ""}" data-f="alerte" type="button"><span>En rupture</span><b>${rupt}</b></button>
    <button class="tile ${per ? "warn" : ""}" data-f="peremption" type="button"><span>Péremption &lt; 90 jours</span><b>${per}</b></button>`;
}
$("#tiles").addEventListener("click", e => { const t = e.target.closest(".tile"); if (t) setFiltre(t.dataset.f); });

const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function renderRows() {
  const q = norm($("#q").value.trim());
  const list = produits.filter(p => {
    if (q && !norm(`${p.nom} ${p.categorie} ${p.forme} ${p.code_barre}`).includes(q)) return false;
    if (filtre === "alerte") return p.quantite <= p.seuil_alerte;
    if (filtre === "peremption") return p.quantite > 0 && daysTo(p.prochaine_peremption) <= 90;
    if (filtre === "ordonnance") return p.sur_ordonnance;
    if (filtre === "site") return p.visible_site && !p.sur_ordonnance;
    return true;
  });
  $("#rows").innerHTML = list.length ? list.map(p => {
    const e = etat(p);
    return `<tr>
      <td><div class="pcell">${p.image_url ? `<img class="thumb" src="${esc(p.image_url)}" alt="" loading="lazy">` : `<span class="thumb" aria-hidden="true">—</span>`}
        <div class="pname"><b>${esc(p.nom)}${p.sur_ordonnance ? '<span class="tag">Ordonnance</span>' : ""}</b><small>${esc(p.forme || "")}${p.code_barre ? " · " + esc(p.code_barre) : ""}</small></div></div></td>
      <td>${esc(p.categorie)}</td>
      <td class="num"><b>${p.quantite}</b> <small class="muted">/ ${p.seuil_alerte}</small></td>
      <td><span class="pill ${e.cls}">${e.txt}</span></td>
      <td class="num">${fcfa(p.prix_vente)}</td>
      <td>${fdate(p.prochaine_peremption)}</td>
      <td>${p.visible_site && !p.sur_ordonnance ? "Oui" : "<span class='muted'>Non</span>"}</td>
      <td><div class="acts">
        <button class="ibtn in" type="button" data-act="entree" data-id="${p.id}" aria-label="Entrée de stock : ${esc(p.nom)}">+</button>
        <button class="ibtn out" type="button" data-act="sortie" data-id="${p.id}" aria-label="Sortie de stock : ${esc(p.nom)}">−</button>
        <button class="ibtn" type="button" data-act="edit" data-id="${p.id}">Modifier</button>
      </div></td></tr>`;
  }).join("") : `<tr><td colspan="8" class="empty">Aucun produit ne correspond.</td></tr>`;
}
$("#rows").addEventListener("click", e => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const p = produits.find(x => String(x.id) === b.dataset.id);
  b.dataset.act === "edit" ? openProd(p) : openMvt(p, b.dataset.act);
});

async function renderHist() {
  const rows = await DB.mouvements();
  const label = { entree: "Entrée", sortie: "Sortie", ajustement: "Inventaire" };
  $("#hist").innerHTML = rows.length ? rows.map(m => `<li>
      <span class="q ${m.quantite > 0 ? "plus" : "minus"}">${m.quantite > 0 ? "+" : ""}${m.quantite}</span>
      <div><b>${esc(m.nom)}</b><br><small>${label[m.type]}${m.note ? " · " + esc(m.note) : ""}${m.numero_lot ? " · lot " + esc(m.numero_lot) : ""}</small></div>
      <small class="mono">${new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></li>`).join("")
    : `<li><span></span><span class="muted">Aucun mouvement pour l'instant.</span><span></span></li>`;
}

/* ===================== Ordonnances ===================== */
const STATUTS = [["nouvelle", "Nouvelle", "warn"], ["en_preparation", "En préparation", "warn"], ["prete", "Prête", "ok"], ["terminee", "Remise / livrée", "ok"], ["annulee", "Annulée", "bad"]];
let ordonnances = [], rxFiltre = "a_traiter";
const waClient = (tel, txt) => {
  let d = String(tel).replace(/\D/g, "").replace(/^00/, "");
  if (d.length === 9) d = "221" + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(txt)}`;
};
function renderOrdonnances() {
  const nouvelles = ordonnances.filter(o => o.statut === "nouvelle").length;
  $("#rx-badge").hidden = !nouvelles; $("#rx-badge").textContent = `${nouvelles} nouvelle${nouvelles > 1 ? "s" : ""}`;
  document.title = (nouvelles ? `(${nouvelles}) ` : "") + "Stock Borom Sam";
  const list = ordonnances.filter(o => rxFiltre === "toutes" || ["nouvelle", "en_preparation", "prete"].includes(o.statut));
  $("#rx-list").innerHTML = list.length ? list.map(o => {
    const st = STATUTS.find(s => s[0] === o.statut) || STATUTS[0];
    const msg = `Bonjour ${o.nom}, ici la Pharmacie Borom Sam. Votre ordonnance ${o.reference} `;
    return `<article class="rx-item ${o.statut}">
      <div class="rx-top"><b class="mono">${esc(o.reference)}</b><span class="pill ${st[2]}">${st[1]}</span>
        <small>${new Date(o.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div>
      <div><b>${esc(o.nom)}</b> · <span class="mono">${esc(o.telephone)}</span></div>
      <p>${o.mode === "livraison" ? "Livraison : " + esc(o.adresse || "") : "Retrait à la pharmacie"}</p>
      ${o.note ? `<p>« ${esc(o.note)} »</p>` : ""}
      <div class="rx-acts">
        <button class="btn btn-green" type="button" data-voir="${o.id}" style="min-height:36px">Voir l'ordonnance</button>
        <a class="btn btn-line" style="min-height:36px" target="_blank" rel="noopener" href="${esc(waClient(o.telephone, msg))}">Répondre</a>
        <select data-statut="${o.id}" aria-label="Statut de ${esc(o.reference)}">${STATUTS.map(s => `<option value="${s[0]}" ${s[0] === o.statut ? "selected" : ""}>${s[1]}</option>`).join("")}</select>
      </div></article>`;
  }).join("") : `<p class="empty" style="grid-column:1/-1">${rxFiltre === "toutes" ? "Aucune ordonnance reçue pour l'instant." : "Aucune ordonnance à traiter."}</p>`;
}
async function loadOrdonnances() {
  try { ordonnances = await DB.ordonnances(); renderOrdonnances(); }
  catch (e) { $("#rx-list").innerHTML = `<p class="empty" style="grid-column:1/-1">Ordonnances indisponibles : ${esc(fail(e).message)}</p>`; }
}
$("#rx-filters").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  rxFiltre = b.dataset.rf;
  document.querySelectorAll("#rx-filters .chip").forEach(c => c.setAttribute("aria-pressed", c === b));
  renderOrdonnances();
});
$("#rx-list").addEventListener("change", async e => {
  const s = e.target.closest("select[data-statut]"); if (!s) return;
  try { await DB.setStatut(s.dataset.statut, s.value); toast("Statut mis à jour"); loadOrdonnances(); }
  catch (x) { toast(fail(x).message); }
});
$("#rx-list").addEventListener("click", async e => {
  const b = e.target.closest("button[data-voir]"); if (!b) return;
  const o = ordonnances.find(x => x.id === b.dataset.voir);
  $("#rxv-title").textContent = `${o.reference} · ${o.nom}`;
  $("#rxv-body").innerHTML = `<p class="muted">Chargement…</p>`;
  $("#dlg-rx").showModal();
  try {
    const url = o.fichier ? await DB.fichierUrl(o.fichier) : null;
    if (!url) { $("#rxv-body").innerHTML = `<p class="muted">Exemple du mode démonstration : pas de photo jointe.</p>`; return; }
    const isPdf = /\.pdf$/i.test(o.fichier);
    $("#rxv-body").innerHTML = (isPdf ? `<p>Ordonnance au format PDF.</p>` : `<img src="${esc(url)}" alt="Ordonnance ${esc(o.reference)}">`)
      + `<p style="margin-top:12px"><a class="btn btn-line" href="${esc(url)}" target="_blank" rel="noopener">Ouvrir en grand</a></p>`;
    if (o.statut === "nouvelle") { await DB.setStatut(o.id, "en_preparation"); loadOrdonnances(); }
  } catch (x) { $("#rxv-body").innerHTML = `<p class="err">${esc(fail(x).message)}</p>`; }
});

async function refresh() {
  loadOrdonnances();
  try {
    produits = await DB.produits();
    $("#cats").innerHTML = [...new Set(produits.map(p => p.categorie))].map(c => `<option value="${esc(c)}">`).join("");
    renderTiles(); renderRows(); await renderHist();
  } catch (e) { toast(fail(e).message); }
}

/* ===================== Produit ===================== */
const dlgProd = $("#dlg-prod"); let editing = null;
function openProd(p) {
  editing = p || null;
  $("#prod-title").textContent = p ? "Modifier le produit" : "Nouveau produit";
  $("#p-nom").value = p?.nom || ""; $("#p-cat").value = p?.categorie || ""; $("#p-forme").value = p?.forme || "";
  $("#p-desc").value = p?.description || ""; $("#p-pv").value = p?.prix_vente ?? ""; $("#p-pa").value = p?.prix_achat ?? "";
  $("#p-seuil").value = p?.seuil_alerte ?? 5; $("#p-code").value = p?.code_barre || ""; $("#p-qte").value = 0;
  $("#p-per").value = p?.prochaine_peremption || ""; $("#p-ord").checked = !!p?.sur_ordonnance; $("#p-site").checked = p ? !!p.visible_site : false;
  $("#p-qte-field").hidden = !!p; $("#prod-del").hidden = !p || monRole !== "titulaire"; $("#prod-err").hidden = true;
  photoBlob = null; photoUrl = p?.image_url || null; $("#p-photo").value = ""; showPhoto(photoUrl);
  dlgProd.showModal(); $("#p-nom").focus();
}

/* Photo : réduite dans le navigateur avant l'envoi (rapide même en 3G) */
let photoBlob = null, photoUrl = null;
function showPhoto(src) {
  $("#p-photo-img").hidden = !src; $("#p-photo-ph").hidden = !!src; $("#p-photo-rm").hidden = !src;
  if (src) $("#p-photo-img").src = src;
}
async function resizeImage(file, max) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}
$("#p-photo").addEventListener("change", async () => {
  const f = $("#p-photo").files[0]; if (!f) return;
  try {
    photoBlob = await resizeImage(f, LIVE ? 900 : 420);
    showPhoto(URL.createObjectURL(photoBlob));
  } catch { $("#prod-err").textContent = "Cette image ne peut pas être lue. Essayez une photo JPG ou PNG."; $("#prod-err").hidden = false; }
});
$("#p-photo-rm").addEventListener("click", () => { photoBlob = null; photoUrl = null; $("#p-photo").value = ""; showPhoto(null); });
$("#new-prod").addEventListener("click", () => openProd(null));
$("#form-prod").addEventListener("submit", async e => {
  e.preventDefault();
  const int = s => s.value === "" ? null : Math.max(0, Math.round(+s.value));
  const row = {
    nom: $("#p-nom").value.trim(), categorie: $("#p-cat").value.trim() || "Autre", forme: $("#p-forme").value.trim() || null,
    description: $("#p-desc").value.trim() || null, prix_vente: int($("#p-pv")), prix_achat: int($("#p-pa")),
    seuil_alerte: int($("#p-seuil")) ?? 5, code_barre: $("#p-code").value.trim() || null,
    prochaine_peremption: $("#p-per").value || null, sur_ordonnance: $("#p-ord").checked, visible_site: $("#p-site").checked
  };
  const err = $("#prod-err");
  if (!row.nom || row.prix_vente === null) { err.textContent = "Indiquez au moins le nom et le prix de vente."; err.hidden = false; return; }
  if (editing) row.id = editing.id; else row.quantite = int($("#p-qte")) || 0;
  const btn = e.submitter || $("#form-prod button[type=submit]");
  btn.disabled = true; btn.textContent = photoBlob ? "Envoi de la photo…" : "Enregistrement…";
  try {
    row.image_url = photoBlob ? await DB.uploadPhoto(photoBlob) : photoUrl;
    await DB.save(row); dlgProd.close(); toast(editing ? "Produit modifié" : "Produit ajouté"); refresh();
  }
  catch (x) { err.textContent = fail(x).message; err.hidden = false; }
  finally { btn.disabled = false; btn.textContent = "Enregistrer"; }
});
let delArmed = false;
$("#prod-del").addEventListener("click", async () => {
  const b = $("#prod-del");
  if (!delArmed) { delArmed = true; b.textContent = "Confirmer la suppression"; setTimeout(() => { delArmed = false; b.textContent = "Supprimer"; }, 4000); return; }
  delArmed = false; b.textContent = "Supprimer";
  try { await DB.remove(editing.id); dlgProd.close(); toast("Produit supprimé"); refresh(); }
  catch (x) { $("#prod-err").textContent = fail(x).message; $("#prod-err").hidden = false; }
});

/* ===================== Mouvement ===================== */
const dlgMvt = $("#dlg-mvt"); let mvtProd = null;
function syncMvt() {
  const t = document.querySelector('input[name="mtype"]:checked').value;
  $("#m-qte-label").textContent = t === "entree" ? "Quantité reçue" : t === "sortie" ? "Quantité sortie" : "Quantité réellement comptée en rayon";
  $("#m-lot-row").hidden = t !== "entree";
}
document.querySelectorAll('input[name="mtype"]').forEach(r => r.addEventListener("change", syncMvt));
function openMvt(p, type) {
  mvtProd = p;
  $("#mvt-prod").textContent = `${p.nom} · stock actuel : ${p.quantite}`;
  $(type === "sortie" ? "#m-out" : "#m-in").checked = true;
  ["#m-qte", "#m-lot", "#m-per", "#m-note"].forEach(s => ($(s).value = ""));
  $("#mvt-err").hidden = true; syncMvt();
  dlgMvt.showModal(); $("#m-qte").focus();
}
$("#form-mvt").addEventListener("submit", async e => {
  e.preventDefault();
  const type = document.querySelector('input[name="mtype"]:checked').value;
  const n = Math.round(+$("#m-qte").value), err = $("#mvt-err");
  if ($("#m-qte").value === "" || n < 0 || (type !== "ajustement" && n === 0)) { err.textContent = "Indiquez une quantité valide."; err.hidden = false; return; }
  const m = { produit_id: mvtProd.id, type, note: $("#m-note").value.trim() || null };
  if (type === "ajustement") {
    m.quantite = n - mvtProd.quantite;
    if (m.quantite === 0) { dlgMvt.close(); toast("Le stock compté est déjà juste"); return; }
    m.note = m.note || `Inventaire : ${mvtProd.quantite} → ${n}`;
  } else m.quantite = n;
  if (type === "entree") { m.numero_lot = $("#m-lot").value.trim() || null; m.date_peremption = $("#m-per").value || null; }
  try { await DB.mouvement(m); dlgMvt.close(); toast("Stock mis à jour"); refresh(); }
  catch (x) { err.textContent = fail(x).message; err.hidden = false; }
});
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

/* ===================== Export CSV ===================== */
$("#export").addEventListener("click", () => {
  const cols = ["nom", "categorie", "forme", "code_barre", "quantite", "seuil_alerte", "prix_vente", "prix_achat", "prochaine_peremption", "sur_ordonnance"];
  const csv = [cols.join(";"), ...produits.map(p => cols.map(c => `"${String(p[c] ?? "").replace(/"/g, '""')}"`).join(";"))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `stock-borom-sam-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

/* ===================== Connexion ===================== */
$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#login-btn"), err = $("#login-err");
  err.hidden = true; btn.disabled = true; btn.textContent = "Connexion…";
  try { await DB.login($("#email").value.trim(), $("#password").value); $("#password").value = ""; await enter(); }
  catch (x) { err.textContent = fail(x).message; err.hidden = false; }
  finally { btn.disabled = false; btn.textContent = "Se connecter"; }
});
$("#forgot").addEventListener("click", async () => {
  const email = $("#email").value.trim(), err = $("#login-err");
  if (!email) { err.textContent = "Saisissez d'abord votre email."; err.hidden = false; return; }
  try { await DB.reset(email); toast("Email de réinitialisation envoyé"); } catch (x) { err.textContent = fail(x).message; err.hidden = false; }
});
$("#logout").addEventListener("click", async () => { await DB.logout(); location.reload(); });

/* ===================== Équipe ===================== */
let monRole = null, equipe = [];
const ROLE_TXT = { titulaire: "Titulaire", employe: "Employé(e)" };
async function loadEquipe() {
  try { equipe = await DB.equipe(); }
  catch (x) { $("#team-list").innerHTML = `<li class="muted">${esc(fail(x).message)}</li>`; return; }
  const moiEmail = $("#who-email").textContent;
  $("#team-list").innerHTML = equipe.map(m => {
    const moi = m.email === moiEmail;
    return `<li><div class="who-txt"><b>${esc(m.nom || m.email || "Compte")}</b><small>${esc(m.email || "")}</small></div>
      <span class="pill ${m.role === "titulaire" ? "ok" : "warn"}">${ROLE_TXT[m.role] || m.role}</span>
      ${moi ? `<span class="muted" style="font-size:.85rem">(vous)</span>` : `
        <button class="ibtn" type="button" data-pw="${esc(m.user_id)}">Nouveau mot de passe</button>
        <button class="ibtn out" type="button" data-retirer="${esc(m.user_id)}">Retirer l'accès</button>`}</li>`;
  }).join("") || `<li class="muted">Aucun membre.</li>`;
}
function motDePasse() {
  const c = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789", a = new Uint32Array(12);
  crypto.getRandomValues(a);
  return [...a].map(n => c[n % c.length]).join("");
}
$("#t-gen").addEventListener("click", () => { $("#t-pw").value = motDePasse(); });
$("#team-form").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#t-err"), btn = $("#t-submit");
  const body = { action: "creer", nom: $("#t-nom").value.trim(), email: $("#t-email").value.trim(), password: $("#t-pw").value, role: $("#t-role").value };
  if (!body.nom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.password.length < 10) {
    err.textContent = "Indiquez le nom, un email valide et un mot de passe d'au moins 10 caractères."; err.hidden = false; return;
  }
  err.hidden = true; btn.disabled = true; btn.textContent = "Création…";
  try {
    await DB.equipeAction(body);
    toast(`Compte créé pour ${body.nom}`);
    ["#t-nom", "#t-email", "#t-pw"].forEach(s => ($(s).value = "")); $("#t-role").value = "employe";
    loadEquipe();
  } catch (x) { err.textContent = fail(x).message; err.hidden = false; }
  finally { btn.disabled = false; btn.textContent = "Créer le compte"; }
});
let retirerArme = null;
$("#team-list").addEventListener("click", async e => {
  const r = e.target.closest("[data-retirer]"), p = e.target.closest("[data-pw]");
  if (r) {
    const id = r.dataset.retirer;
    if (retirerArme !== id) { retirerArme = id; r.textContent = "Confirmer le retrait"; setTimeout(() => { if (retirerArme === id) { retirerArme = null; r.textContent = "Retirer l'accès"; } }, 4000); return; }
    retirerArme = null;
    try { await DB.equipeAction({ action: "retirer", user_id: id }); toast("Accès retiré"); loadEquipe(); }
    catch (x) { toast(fail(x).message); }
  }
  if (p) {
    const pw = motDePasse();
    try {
      await DB.equipeAction({ action: "mot_de_passe", user_id: p.dataset.pw, password: pw });
      p.outerHTML = `<span class="mono" style="font-size:.9rem">Nouveau : <b>${pw}</b></span>`;
      toast("Mot de passe changé : notez-le et donnez-le à la personne");
    } catch (x) { toast(fail(x).message); }
  }
});
$("#my-pw").addEventListener("click", () => { $("#pw1").value = ""; $("#pw2").value = ""; $("#pw-err").hidden = true; $("#dlg-pw").showModal(); });

async function enter() {
  const user = await DB.user();
  if (!user) { $("#who").hidden = true; show("#login-view"); return; }
  if (!(await DB.isAdmin())) {
    await DB.logout(); show("#login-view");
    $("#login-err").textContent = "Ce compte n'a pas accès à l'espace pharmacien."; $("#login-err").hidden = false; return;
  }
  monRole = (await DB.monRole()) || "employe";
  $("#who-email").textContent = user.email; $("#who-role").textContent = monRole === "titulaire" ? "Titulaire" : "Employé(e)";
  $("#who").hidden = false;
  $("#team-sec").hidden = monRole !== "titulaire";
  if (monRole === "titulaire") loadEquipe();
  $("#today").textContent = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  show("#app-view"); refresh();
  clearInterval(enter.poll);
  enter.poll = setInterval(() => { if (!document.hidden) loadOrdonnances(); }, 60000);  // nouvelles ordonnances chaque minute
}

/* Déconnexion automatique après 30 minutes sans activité */
let idle;
const resetIdle = () => { clearTimeout(idle); idle = setTimeout(async () => { if (!$("#app-view").hidden) { await DB.logout(); location.reload(); } }, 30 * 60 * 1000); };
["click", "keydown", "touchstart"].forEach(ev => addEventListener(ev, resetIdle, { passive: true }));
resetIdle();

DB.onRecovery(() => $("#dlg-pw").showModal());
$("#form-pw").addEventListener("submit", async e => {
  e.preventDefault();
  const a = $("#pw1").value, b = $("#pw2").value, err = $("#pw-err");
  if (a.length < 10) { err.textContent = "10 caractères minimum."; err.hidden = false; return; }
  if (a !== b) { err.textContent = "Les deux mots de passe sont différents."; err.hidden = false; return; }
  try { await DB.setPassword(a); $("#dlg-pw").close(); toast("Mot de passe modifié"); enter(); }
  catch (x) { err.textContent = fail(x).message; err.hidden = false; }
});

$("#demo-banner").hidden = LIVE;
if (!LIVE) { $("#email").value = "dr.mbaye@demo"; $("#password").placeholder = "Mode démo : n'importe quel mot de passe"; }
enter().catch(x => { show("#login-view"); $("#login-err").textContent = fail(x).message; $("#login-err").hidden = false; });
