"use strict";
/* Test du codage float16 / float32 : conversion IEEE-754 demi-précision, encodage hexadécimal CSV, effet de la quantification sur les HRIR (énergie, ITD, ILD). */

const L=(typeof require==="function"&&typeof module!=="undefined")?require("./app_fonctions.js"):globalThis.__LIB__; // chargement de la bibliothèque (Node ou bac à sable)
const G=(typeof require==="function"&&typeof module!=="undefined")?require("./gen_sofa_synthetique.js"):globalThis.__GEN__; // chargement du générateur

function run(){ // exécute tous les cas de test et renvoie le rapport
  const gen=G.run(); // jeu synthétique
  const sofa=L.parseSofa(gen.v1); // lecture du fichier classic
  const A=gen.attendu; // valeurs théoriques
  const cas=[]; // vérifications
  const verif=(nom,attendu,obtenu,tol)=>{ // enregistre une vérification
    const ok = tol===undefined ? attendu===obtenu : Math.abs(obtenu-attendu)<=tol; // stricte ou tolérance
    cas.push({nom, attendu, obtenu, ok}); // mémorisation
  };
  /* ---- 1. vecteurs de référence IEEE-754 demi-précision ---- */
  const vecteurs=[ // couples {valeur, bits attendus, hexadécimal attendu}
    {v:1,       bits:0x3c00, hex:"3c00"}, // 1.0
    {v:2,       bits:0x4000, hex:"4000"}, // 2.0
    {v:0.5,     bits:0x3800, hex:"3800"}, // 0.5 (exact en demi-précision)
    {v:-2,      bits:0xc000, hex:"c000"}, // -2.0
    {v:65504,   bits:0x7bff, hex:"7bff"}, // plus grand demi-précision fini
    {v:-65504,  bits:0xfbff, hex:"fbff"}, // plus petit (négatif) fini
    {v:6.103515625e-5, bits:0x0400, hex:"0400"}, // plus petit demi-précision normalisé
    {v:5.960464477539063e-8, bits:0x0001, hex:"0001"}, // plus petit dénormalisé
    {v:1e9,     bits:0x7c00, hex:"7c00"}, // débordement → +infini (pas d'aller-retour possible)
    {v:0,       bits:0x0000, hex:"0000"}, // zéro
  ];
  for(const t of vecteurs){ // pour chaque vecteur de référence
    verif("f32tof16("+t.v+") bits", t.bits, L.f32tof16(t.v)); // bits de la conversion
    verif("h2hex("+t.v+")", t.hex, L.h2hex(t.v)); // encodage hexadécimal CSV 4 chiffres
    if(t.v!==1e9) verif("f16tof32(aller-retour "+t.v+")", t.v, L.f16tof32(L.f32tof16(t.v)), 1e-6*Math.max(1,Math.abs(t.v))); // aller-retour sauf pour le cas débordement
  }
  verif("f16tof32(débordement 1e9) = +infini", true, !isFinite(L.f16tof32(L.f32tof16(1e9))) && L.f16tof32(L.f32tof16(1e9))>0); // le débordement de plage donne bien l'infini IEEE
  /* ---- 2. encodage hexadécimal float32 (CSV) ---- */
  verif("f2hex(1.0) = 3f800000", "3f800000", L.f2hex(1)); // 1.0 float32
  verif("f2hex(-2.0) = c0000000", "c0000000", L.f2hex(-2)); // -2.0 float32
  verif("f2hex(0.5) = 3f000000", "3f000000", L.f2hex(0.5)); // 0.5 float32
  /* ---- 3. quantification d'un HRIR réaliste (sinusoïde amortie, 64 échantillons) ---- */
  const N=sofa.N; // longueur du HRIR synthétique
  const hrirR=new Float64Array(N); // HRIR gauche « réaliste » : sinusoïde amortie
  const hrirL=new Float64Array(N); // copie retardée de 4 échantillons et atténuée (structure m0)
  for(let i=0;i<N;i++) hrirR[i]=0.3*Math.exp(-i/16)*Math.sin(2*Math.PI*2000*i/sofa.sr); // signal oscillant décroissant
  for(let i=4;i<N;i++) hrirL[i]=0.5*hrirR[i-4]; // copie : retard 4 échantillons, gain 0,5
  const q32=L.quantifierHRIR(hrirL,hrirR,32); // traitement float32 (référence)
  const q16=L.quantifierHRIR(hrirL,hrirR,16); // traitement float16 (quantifié)
  let errMax=0; // erreur relative maximale entre coefficients 32 et 16 bits
  for(let i=0;i<N;i++){ // pour chaque échantillon
    if(Math.abs(q32.L[i])>1e-6) errMax=Math.max(errMax, Math.abs(q16.L[i]-q32.L[i])/Math.abs(q32.L[i])); // erreur relative sur L
    if(Math.abs(q32.R[i])>1e-6) errMax=Math.max(errMax, Math.abs(q16.R[i]-q32.R[i])/Math.abs(q32.R[i])); // erreur relative sur R
  }
  verif("float16 : erreur relative maximale ≤ 2^-10 (0,098 %)", 0, errMax, 9.8e-4); // la demi-précision garantit ~2^-11 par valeur
  const errE=L.db(Math.sqrt(L.energie(q16.L))/Math.sqrt(L.energie(q32.L))); // dérive d'énergie du canal gauche
  verif("float16 : dérive d'énergie canal gauche ≤ 0,01 dB", 0, errE, 0.01); // l'arrondi ne doit pas dériver l'énergie
  const itd16=L.itdSecondes(q16.L,q16.R,sofa.sr)*1e6, itd32=L.itdSecondes(q32.L,q32.R,sofa.sr)*1e6; // ITD avant/après quantification (µs)
  verif("float16 : ITD inchangé (±0,5 µs)", itd32, itd16, 0.5); // les positions temporelles sont préservées
  const ild16=L.ildDb(q16.L,q16.R), ild32=L.ildDb(q32.L,q32.R); // ILD avant/après quantification (dB)
  verif("float16 : ILD inchangé (±0,01 dB)", ild32, ild16, 0.01); // le rapport d'énergie inter-oreilles est préservé
  const passes=cas.filter(c=>c.ok).length; // réussites
  return { test:"Codage float16 / float32 IEEE-754", passes, echecs:cas.length-passes, mesures:{ errRelativeMax:errMax, errEnergieDb:errE, itd32Micros:itd32, itd16Micros:itd16, ild32Db:ild32, ild16Db:ild16 }, cas }; // rapport
}

if (typeof module!=="undefined" && module.exports) module.exports={run}; // export Node.js

/* Exécution en ligne de commande : node test_float16.js */
if (typeof require==="function" && require.main===module){ // si lancé directement
  const r=run(); // exécution
  const fs=require("fs"); // accès fichiers
  fs.mkdirSync("results",{recursive:true}); // création du dossier results si besoin
  fs.writeFileSync("results/resultats_float16.json", JSON.stringify(r,null,2)); // sauvegarde du rapport
  console.log(r.passes+" réussites / "+r.echecs+" échecs"); // résumé console
}
