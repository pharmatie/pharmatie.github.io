// Connexion à la base de données Supabase.
// Remplir depuis Supabase > Project Settings > API :
//   url     = "Project URL"           (ex. https://abcdxyz.supabase.co)
//   anonKey = "anon public" key       (clé publique, prévue pour être dans le site)
// Tant que ces champs sont vides, le site utilise sa liste de produits intégrée
// et l'espace pharmacien fonctionne en mode démonstration.
window.SUPABASE_CONFIG = {
  url: "https://tiycpppxkyggxphdkscx.supabase.co",
  anonKey: "sb_publishable_tqAholTSmWzGf8GdhFXCXg_by6DKOAm"   // clé publique (publishable)
};
