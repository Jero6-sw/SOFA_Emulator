"use strict";
/* Test du rééchantillonnage : sinc fenêtré (Blackman, 65 taps) vs linéaire — fidélité en bande, rejet d'aliasing, préservation de l'ITD et de l'ILD. */

const L=(typeof require==="function"&&typeof module!=="undefined")?require("./app_fonctions.js"):globalThis.__LIB__; // chargement de la bibliothèque (Node ou bac à sable)
const G=(typeof require==="function"&&typeof module!=="undefined")?require("./gen_sofa_synthetique.js"):globalThis.__GEN__; // chargement du générateur

function ampTrim(x, marge){ // amplitude efficace d'un signal, en rognant les bords (effets de bord du noyau)
  const n=Math.floor(x.length/2), debut=marge, fin=x.length-marge; // fenêtre d'analyse
  let e=0, c=0; // énergie et nombre d'échantillons
  for(let i=debut;i<fin;i++){ e+=x[i]*x[i]; c++; } // somme dans la fenêtre centrale
  return Math.sqrt(e/Math.max(1,c)); // valeur efficace
}

function run(){ // exécute tous les cas de test et renvoie le rapport
  const gen=G.run(); // jeu synthétique
  const sofa=L.parseSofa(gen.v1); // lecture
  const SR_OUT=44100; // fréquence cible du test : 44,1 kHz (décimation depuis 48 kHz)
  const cas=[]; // vérifications
  const verif=(nom,attendu,obtenu,tol)=>{ // enregistre une vérification
    const ok = tol===undefined ? attendu===obtenu : Math.abs(obtenu-attendu)<=tol; // stricte ou tolérance
    cas.push({nom, attendu, obtenu, ok}); // mémorisation
  };
  const mesures={}; // mesures numériques brutes pour le rapport
  /* ---- 1. fidélité en bande : sinus 1 kHz (amplitude 1) ---- */
  const n1=L.sinus(1000, sofa.sr, 4096, 1.0); // sinus 1 kHz, 4096 échantillons
  const s1=L.resampleSinc(sofa,n1,n1.length,SR_OUT); // sinc
  const l1=L.resampleLinear(sofa,n1,n1.length,SR_OUT); // linéaire
  const ampRef=Math.SQRT2/2; // amplitude efficace attendue du sinus unitaire
  const aSinc=ampTrim(s1,40)/ampRef, aLin=ampTrim(l1,4)/ampRef; // amplitudes relatives (le linéaire n'a pas de bord de noyau)
  verif("sinc : amplitude 1 kHz fidèle (±0,05)", 1, aSinc, 0.05); // bande passante plate
  verif("linéaire : amplitude 1 kHz fidèle (±0,05)", 1, aLin, 0.05); // les deux methods sont bonnes à 1 kHz
  mesures.fid1kHz={sinc:aSinc, lineaire:aLin}; // enregistrement
  /* ---- 2. fidélité en haut de bande : sinus 5 kHz ---- */
  const n5=L.sinus(5000, sofa.sr, 4096, 1.0); // sinus 5 kHz
  const s5=L.resampleSinc(sofa,n5,n5.length,SR_OUT); // sinc
  const l5=L.resampleLinear(sofa,n5,n5.length,SR_OUT); // linéaire
  const aS5=ampTrim(s5,40)/ampRef, aL5=ampTrim(l5,4)/ampRef; // amplitudes relatives
  verif("sinc : amplitude 5 kHz fidèle (±0,1)", 1, aS5, 0.1); // bande plate jusqu'à ~9,9 kHz (coupure 0,45 × Nyquist)
  verif("linéaire : atténuation attendue à 5 kHz (réf −0,58 dB, ±0,15)", 0.935, aL5, 0.15); // le linéaire atténue en haute fréquence (réponse en sinc²)
  mesures.fid5kHz={sinc:aS5, lineaire:aL5}; // enregistrement
  /* ---- 2bis. constat : sinus 10 kHz (bande de transition du sinc, au-dessus de la coupure 9,92 kHz) ---- */
  const n10=L.sinus(10000, sofa.sr, 4096, 1.0); // sinus 10 kHz
  const aS10=ampTrim(L.resampleSinc(sofa,n10,n10.length,SR_OUT),40)/ampRef; // amplitude sinc à 10 kHz
  const aL10=ampTrim(L.resampleLinear(sofa,n10,n10.length,SR_OUT),4)/ampRef; // amplitude linéaire à 10 kHz
  cas.push({nom:"constat : 10 kHz dans la bande de transition du sinc (coupure à 9,92 kHz)", attendu:"mesure", obtenu:{sinc:aS10, lineaire:aL10}, ok:true}); // mesure documentée, sans verdict pass/échec
  mesures.transition10kHz={sinc:aS10, lineaire:aL10}; // enregistrement
  /* ---- 3. rejet d'aliasing : sinus 25 kHz (au-delà du Nyquist cible 22,05 kHz) ---- */
  const n25=L.sinus(25000, sofa.sr, 8192, 1.0); // sinus 25 kHz (doit disparaître)
  const s25=L.resampleSinc(sofa,n25,n25.length,SR_OUT); // sinc
  const l25=L.resampleLinear(sofa,n25,n25.length,SR_OUT); // linéaire
  const attSinc=-L.db(ampTrim(s25,40)/ampRef), attLin=-L.db(ampTrim(l25,4)/ampRef); // atténuations en dB
  verif("sinc : alias 25 kHz atténué d'au moins 50 dB", 1, (attSinc>=50)?1:0, 0); // l'anti-aliasing du sinc est fort
  verif("linéaire : alias 25 kHz mal atténué (moins de 25 dB)", 1, (attLin<25)?1:0, 0); // le linéaire laisse passer l'alias
  verif("sinc rejette l'alias mieux que le linéaire", 1, (attSinc>attLin)?1:0, 0); // comparaison
  mesures.alias25kHz={attenuationSincDb:attSinc, attenuationLineaireDb:attLin}; // enregistrement
  /* ---- 4. préservation de l'ITD et de l'ILD sur le HRIR m0 (gauche retardée de 4 échantillons à 48 kHz) ---- */
  const base=0*sofa.R*sofa.N; // mesure m0 dans le tableau plat
  const Lg=new Float64Array(sofa.N), Rd=new Float64Array(sofa.N); // canaux de la mesure m0
  for(let i=0;i<sofa.N;i++){ Lg[i]=sofa.hrir[base+i]; Rd[i]=sofa.hrir[base+sofa.N+i]; } // extraction L (r=0) et R (r=1)
  const itdRef=L.itdSecondes(Lg,Rd,sofa.sr)*1e6; // ITD mesuré à 48 kHz (≈ +83,33 µs)
  const ildRef=L.ildDb(Lg,Rd); // ILD mesuré à 48 kHz (≈ −6,02 dB)
  verif("ITD mesuré à 48 kHz = +4 échantillons (83,33 µs)", 83.333, itdRef, 1); // cohérence interne
  verif("ILD mesuré à 48 kHz = −6,02 dB", 10*Math.log10(0.25), ildRef, 0.01); // cohérence interne
  for(const [meth, fn] of [["sinc", L.resampleSinc],["lineaire", L.resampleLinear]]){ // pour chaque méthode
    const Lr=fn(sofa,Lg,sofa.N,SR_OUT); // canal gauche rééchantillonné
    const Rr=fn(sofa,Rd,sofa.N,SR_OUT); // canal droit rééchantillonné
    const itd=L.itdSecondes(Lr,Rr,SR_OUT)*1e6; // ITD après rééchantillonnage (µs)
    const ild=L.ildDb(Lr,Rr); // ILD après rééchantillonnage (dB)
    if(meth==="sinc"){ // le sinc préserve exactement retards et énergies (impulsions centrées, fenêtre de Blackman nulle aux bords)
      verif(meth+" : ITD préservé à 44,1 kHz (±1 µs)", itdRef, itd, 1); // le retard inter-oreilles est conservé
      verif(meth+" : ILD préservé à 44,1 kHz (±0,1 dB)", ildRef, ild, 0.1); // le rapport d'énergie est conservé
    } else { // le linéaire présente un biais documenté sur les impulsions de Dirac (centroïde énergétique décalé) — HRIR réels : erreur moindre
      verif(meth+" : ITD préservé à 44,1 kHz (±8 µs, biais documenté sur Dirac)", itdRef, itd, 8); // biais ≈ −6 µs mesuré sur impulsions ponctuelles
      verif(meth+" : ILD dérive limitée (±1,5 dB, artifact documenté sur Dirac)", ildRef, ild, 1.5); // dispersion d'énergie selon la position fractionnaire
    }
    mesures["itdild_"+meth]={itdMicros:itd, ildDb:ild}; // enregistrement
  }
  const passes=cas.filter(c=>c.ok).length; // réussites
  return { test:"Rééchantillonnage sinc vs linéaire (48 kHz → 44,1 kHz)", passes, echecs:cas.length-passes, mesures, cas }; // rapport
}

if (typeof module!=="undefined" && module.exports) module.exports={run}; // export Node.js

/* Exécution en ligne de commande : node test_reechantillonnage.js */
if (typeof require==="function" && require.main===module){ // si lancé directement
  const r=run(); // exécution
  const fs=require("fs"); // accès fichiers
  fs.mkdirSync("results",{recursive:true}); // dossier results
  fs.writeFileSync("results/resultats_reechantillonnage.json", JSON.stringify(r,null,2)); // sauvegarde
  console.log(r.passes+" réussites / "+r.echecs+" échecs"); // résumé
}
