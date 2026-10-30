/* ================================================================
   Chat d'aide : assistant automatique pour les questions pratiques (horaires, stock, ordonnance…),
   plus un « Conseiller santé (IA) » : les questions de santé sont envoyées à la fonction serveur
   « conseiller-sante » (IA gratuite Groq), jamais directement depuis le navigateur. Urgences : SAMU 1515 en premier.
   Utilise ce que site.js définit : CONFIG, PRODUITS, etatCatalogue, ajouterAuPanier, norm, fcfa…
   ================================================================ */
(function chatAide() {
  const fab = $("#chat-fab"), box = $("#chat"), log = $("#chat-log"), form = $("#chat-form"), input = $("#chat-in");
  if (!fab || !box) return;
  let accueilFait = false;
  // Sur les autres pages que l'accueil, la boutique (site.js) n'est pas chargée.
  const boutique = typeof PRODUITS !== "undefined";
  const produits = () => (boutique ? PRODUITS : []);
  const catalogueOk = () => boutique && etatCatalogue === "ok";
  const lienCarte = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(CONFIG.mapsQuery);

  const MENU = [
    ["conseiller", "Conseiller santé (IA)"], ["horaires", "Horaires"], ["ordonnance", "Envoyer une ordonnance"], ["produit", "Un produit est-il disponible ?"],
    ["livraison", "Livraison"], ["paiement", "Paiement"], ["adresse", "Adresse"], ["pharmacien", "Parler au pharmacien"], ["urgence", "Urgence"]
  ];
  const lienWA = (texte, label = "Écrire au pharmacien sur WhatsApp") =>
    `<a class="wa" href="${escTexte(waLink(texte))}" target="_blank" rel="noopener">${label}</a>`;

  function ajouter(el) { log.appendChild(el); log.scrollTop = log.scrollHeight; }
  function bulle(html, classe = "bot") {
    const d = document.createElement("div");
    d.className = "msg " + classe; d.innerHTML = html; ajouter(d);
  }
  function bulleClient(texte) {
    const d = document.createElement("div");
    d.className = "msg moi"; d.textContent = texte;   // texte du visiteur : jamais interprété comme du HTML
    ajouter(d);
  }
  function options(html) {
    const d = document.createElement("div");
    d.className = "chat-opts"; d.innerHTML = html; ajouter(d);
  }
  const menu = () => options(MENU.map(([k, l]) => `<button type="button" data-k="${k}">${l}</button>`).join(""));

  function statut() {
    const now = dakarNow(), h = CONFIG.horaires[now.day];
    if (h && now.min >= toMin(h[0]) && now.min < toMin(h[1])) return `Nous sommes <b>ouverts</b> en ce moment, jusqu'à ${fmtH(h[1])}.`;
    if (CONFIG.deGarde) return "Nous sommes <b>de garde</b> aujourd'hui : présentez-vous ou appelez avant de venir.";
    return `Nous sommes <b>fermés</b> en ce moment. Nous ouvrons ${nextOpening(now)}.`;
  }
  function horaires() {
    const l = [1, 2, 3, 4, 5, 6, 0].map(d => {
      const r = CONFIG.horaires[d];
      return `<li>${JOURS[d]} : ${r ? fmtH(r[0]) + " – " + fmtH(r[1]) : "fermé"}</li>`;
    });
    return `${statut()}<ul>${l.join("")}</ul>`;
  }

  /* Recherche dans le catalogue de la base */
  const VIDES = new Set(("avez vous est il elle les des une un du de la le pour avec sans dans sur svp stp merci bonjour "
    + "disponible dispo stock prix combien coute cout vendez vend acheter cherche voudrais veux aimerais").split(" "));
  const decouper = s => norm(s).split(/[^a-z0-9+]+/).filter(Boolean);
  function chercherProduits(texte) {
    const mots = decouper(texte).filter(m => m.length >= 3 && !VIDES.has(m));
    if (!mots.length) return [];
    // Un mot de la question doit être le DÉBUT d'un mot du produit (« creme » → « crème »), pas un morceau (« ans » ≠ « sans »).
    return produits()
      .map(p => { const mp = decouper(p.nom + " " + p.desc + " " + p.cat); return { p, score: mots.filter(m => mp.some(w => w.startsWith(m))).length }; })
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(x => x.p);
  }
  function repondreProduits(texte, trouves) {
    if (!boutique) {
      bulle("Pour voir le stock, ouvrez la parapharmacie sur la page d'accueil, ou demandez directement au pharmacien.");
      options(`<a href="./#boutique">Voir la parapharmacie</a>` + lienWA(`Bonjour ${CONFIG.nom}, avez-vous : ${texte} ?`));
      return;
    }
    if (!catalogueOk()) {
      bulle("Je n'arrive pas à consulter le stock pour le moment. Le pharmacien peut vérifier pour vous.");
      options(lienWA(`Bonjour ${CONFIG.nom}, avez-vous : ${texte} ?`));
      return;
    }
    if (!trouves.length) {
      bulle("Je ne trouve pas ce produit dans notre catalogue en ligne. Il est peut-être en pharmacie : demandez au pharmacien.");
      options(lienWA(`Bonjour ${CONFIG.nom}, avez-vous : ${texte} ?`));
      return;
    }
    bulle("Voici ce que j'ai trouvé dans notre stock :" + trouves.map(p => `
      <div class="chat-prod"><span><b>${p.nom}</b><br><small>${fcfa(p.prix)} · ${p.dispo ? "en stock" : "bientôt disponible"}</small></span>
      ${p.dispo ? `<button class="add" type="button" data-add="${p.id}">Ajouter</button>` : ""}</div>`).join(""));
  }

  const R = {
    urgence: /urgen|inconscient|respire (plus|mal)|etouff|saign|hemorrag|poitrine|avc|paralys|convuls|empoison|intoxi|overdose|surdose|suicid|accident|evanoui/,
    salut: /^(bonjour|bonsoir|salut|salam|salamalekum|asalamalekum|nanga def|hello|coucou)\b/,
    merci: /merci|jerejef|jerejeuf/,
    horaires: /horaire|heure|ouvert|ferme|ouvre|dimanche|samedi|aujourd|demain/,
    garde: /garde|nuit|ferie|tabaski|korite/,
    ordonnance: /ordonnance|prescription|\bordo\b/,
    livraison: /livr|domicile|deplac/,
    paiement: /pay|paie|wave|orange money|carte bancaire|espece|ipm|assurance|mutuelle|prise en charge/,
    adresse: /adresse|ou etes|ou se trouve|situe|localis|itineraire|maps|quartier|venir/,
    contact: /telephone|numero|appeler|whatsapp|contact|joindre/,
    pharmacien: /pharmacien|humain|une personne|parler|conseiller|docteur|mbaye/,
    produit: /dispo|stock|avez[- ]vous|vous avez|prix|combien|coute|vendez|acheter|cherche/,
    sante: /dose|posologie|combien de (fois|comprim)|enceinte|grossesse|allait|effet|secondaire|melang|interaction|allerg|fievre|toux|mal de|douleur|diarr|vomi|palu|tension|diabet|antibio|traitement|maladie|symptome|soign/
  };
  const nbMots = t => t.split(/\s+/).filter(Boolean).length;

  /* ---------- Conseiller santé (IA) : fonction serveur « conseiller-sante » (Groq) ---------- */
  let modeConseiller = false, conseillerDispo = true;
  const historique = [];   // conversation avec le conseiller, gardée seulement dans cette page
  const boutonsConseiller = texte =>
    lienWA(`Bonjour ${CONFIG.nom}, j'ai une question : ${texte}`, "Demander au pharmacien")
    + `<button type="button" data-quitter="1">Quitter le conseiller</button>`;

  function entrerConseiller(invite) {
    modeConseiller = true;
    bulle("<b>Conseiller santé (IA)</b> · Je suis un assistant d'intelligence artificielle. Je donne des informations générales, pas un diagnostic ni une ordonnance. "
      + "Ne donnez pas votre nom ni votre numéro. <b>Urgence : SAMU 1515.</b>", "bot info");
    if (invite) { bulle("Posez votre question de santé : symptôme, prévention, bon usage d'un produit…"); input.focus(); }
  }
  function quitterConseiller() {
    modeConseiller = false; historique.length = 0;
    bulle("Vous avez quitté le conseiller santé. Que puis-je faire d'autre pour vous ?");
    menu();
  }
  async function demanderConseiller(texte) {
    const cfg = window.SUPABASE_CONFIG || {};
    if (!conseillerDispo || !cfg.url) {
      bulle("Pour une question sur votre santé ou un médicament, le pharmacien doit vous répondre lui-même. En cas d'urgence : SAMU 1515.");
      options(lienWA(`Bonjour ${CONFIG.nom}, j'ai une question : ${texte}`, "Poser ma question au pharmacien"));
      return;
    }
    if (!modeConseiller) entrerConseiller(false);
    historique.push({ role: "user", content: texte });
    const ecrit = document.createElement("div");
    ecrit.className = "msg bot ecrit"; ecrit.setAttribute("aria-label", "Le conseiller réfléchit");
    ecrit.innerHTML = "<i></i><i></i><i></i>";
    ajouter(ecrit);
    let r, j = {};
    try {
      r = await fetch(`${cfg.url}/functions/v1/conseiller-sante`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.anonKey },
        body: JSON.stringify({ messages: historique.slice(-12) })
      });
      j = await r.json().catch(() => ({}));
    } catch { r = null; }
    ecrit.remove();
    if (!r || !r.ok || typeof j.texte !== "string") {
      historique.pop();
      if (r && r.status === 503) { conseillerDispo = false; modeConseiller = false; }
      bulle(escTexte(j.message || "Le conseiller ne répond pas pour le moment (connexion ?)."));
      options(lienWA(`Bonjour ${CONFIG.nom}, j'ai une question : ${texte}`, "Poser ma question au pharmacien"));
      return;
    }
    historique.push({ role: "assistant", content: j.texte });
    const d = document.createElement("div");
    d.className = "msg bot ia"; d.textContent = j.texte;   // réponse affichée comme du texte, jamais comme du HTML
    ajouter(d);
    options(boutonsConseiller(texte));
  }

  function repondre(texteBrut) {
    const t = norm(texteBrut.trim());
    if (!t) return;
    if (R.urgence.test(t)) {
      bulle("<b>Si c'est une urgence vitale, appelez tout de suite le SAMU au 1515</b> (sapeurs-pompiers : 18). N'attendez pas de réponse ici.", "bot alerte");
      options(lienWA(`Bonjour ${CONFIG.nom}, j'ai besoin d'aide : ${texteBrut}`, "Prévenir aussi le pharmacien"));
      return;
    }
    if (modeConseiller) { demanderConseiller(texteBrut); return; }
    if (R.salut.test(t) && nbMots(t) <= 3) { bulle("Bonjour, dalal ak jàmm ! Que puis-je faire pour vous ?"); menu(); return; }
    if (R.merci.test(t) && nbMots(t) <= 4) { bulle("Avec plaisir. Bonne journée et prenez soin de vous !"); return; }
    if (R.garde.test(t)) {
      bulle(statut() + " Quand nous ne sommes pas de garde, la liste des pharmacies de garde est affichée sur notre vitrine. En cas d'urgence : SAMU 1515.");
      return;
    }
    if (R.horaires.test(t)) { bulle(horaires()); return; }
    if (R.ordonnance.test(t)) {
      bulle("Envoyez la photo de votre ordonnance avec le formulaire du site : le pharmacien la reçoit directement, et WhatsApp s'ouvre avec votre numéro de référence. Seul le pharmacien peut la voir.");
      options(`<button type="button" data-go="#ordonnance">Aller au formulaire</button>`);
      return;
    }
    if (R.livraison.test(t)) {
      bulle("Nous livrons dans le quartier. Le prix dépend de la distance et vous est annoncé sur WhatsApp avant la confirmation. Choisissez « Livraison » dans le formulaire d'ordonnance, ou commandez depuis « Ma liste ».");
      return;
    }
    if (R.paiement.test(t)) {
      bulle("Vous pouvez payer en <b>espèces, Wave, Orange Money</b> ou par carte bancaire. Pour une IPM ou une assurance, écrivez-nous son nom : nous vous disons les documents à apporter.");
      options(lienWA(`Bonjour ${CONFIG.nom}, j'ai une question sur le paiement / l'IPM : `));
      return;
    }
    if (R.adresse.test(t)) {
      bulle(`Adresse : ${escTexte(CONFIG.adresse)}.`);
      options(`<a href="${escTexte(lienCarte)}" target="_blank" rel="noopener">Itinéraire Google Maps</a>`);
      return;
    }
    if (R.contact.test(t)) {
      bulle(`Téléphone et WhatsApp : <b>${escTexte(CONFIG.telephone)}</b>.`);
      options(lienWA(`Bonjour ${CONFIG.nom}, `));
      return;
    }
    if (R.pharmacien.test(t)) { bulle("Le pharmacien vous répond directement sur WhatsApp."); options(lienWA(`Bonjour ${CONFIG.nom}, `)); return; }

    const trouves = chercherProduits(texteBrut);
    // Une question de santé passe avant une simple ressemblance avec un nom de produit.
    if (R.produit.test(t) || (trouves.length && !R.sante.test(t))) { repondreProduits(texteBrut, trouves); return; }
    if (R.sante.test(t)) { demanderConseiller(texteBrut); return; }   // question de santé : le conseiller (IA) répond
    bulle("Je n'ai pas bien compris. Choisissez un sujet, ou posez votre question au pharmacien.");
    menu();
    options(lienWA(`Bonjour ${CONFIG.nom}, ${texteBrut}`, "Demander au pharmacien"));
  }

  const ACTIONS = {
    conseiller: () => (conseillerDispo ? entrerConseiller(true) : demanderConseiller("")),
    horaires: () => bulle(horaires()),
    ordonnance: () => repondre("ordonnance"),
    produit: () => { bulle("Écrivez le nom du produit (par exemple : crème solaire, vitamine C, tensiomètre)."); input.focus(); },
    livraison: () => repondre("livraison"),
    paiement: () => repondre("paiement"),
    adresse: () => repondre("adresse"),
    pharmacien: () => repondre("pharmacien"),
    urgence: () => repondre("urgence")
  };

  log.addEventListener("click", e => {
    const k = e.target.closest("button[data-k]");
    if (k) { bulleClient(k.textContent); ACTIONS[k.dataset.k](); return; }
    const a = e.target.closest("button[data-add]");
    if (a) {
      if (boutique && ajouterAuPanier(a.dataset.add)) {
        a.textContent = "Ajouté ✓"; a.disabled = true;
        bulle("C'est dans votre liste. Ouvrez « Ma liste » pour envoyer la commande sur WhatsApp.");
        options(`<button type="button" data-liste="1">Ouvrir ma liste</button>`);
      }
      return;
    }
    if (e.target.closest("button[data-liste]")) { fermer(); $("#cart-fab").click(); return; }
    if (e.target.closest("button[data-quitter]")) { quitterConseiller(); return; }
    const go = e.target.closest("button[data-go]");
    if (go) {
      fermer();
      const cible = document.querySelector(go.dataset.go);
      if (cible) cible.scrollIntoView({ behavior: "smooth" }); else location.href = "./" + go.dataset.go;
    }
  });

  form.addEventListener("submit", e => {
    e.preventDefault();
    const texte = input.value.trim().slice(0, 600);
    if (!texte) return;
    input.value = "";
    bulleClient(texte);
    if (modeConseiller && !R.urgence.test(norm(texte))) { demanderConseiller(texte); return; }
    const ecrit = document.createElement("div");   // « l'assistant écrit… »
    ecrit.className = "msg bot ecrit"; ecrit.setAttribute("aria-label", "L'assistant écrit");
    ecrit.innerHTML = "<i></i><i></i><i></i>";
    ajouter(ecrit);
    setTimeout(() => { ecrit.remove(); repondre(texte); }, 650);
  });

  function ouvrir() {
    box.hidden = false; fab.setAttribute("aria-expanded", "true"); fab.classList.remove("appel");
    if (!accueilFait) {
      accueilFait = true;
      bulle(`Bonjour, je suis l'assistant de la ${CONFIG.nom}. ${statut()}<br>Comment puis-je vous aider ?`);
      menu();
    }
    input.focus();
  }
  function fermer() { box.hidden = true; fab.setAttribute("aria-expanded", "false"); fab.focus(); }
  fab.addEventListener("click", () => (box.hidden ? ouvrir() : fermer()));
  $("#chat-x").addEventListener("click", fermer);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) fermer(); });
})();
