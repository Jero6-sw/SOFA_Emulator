"use strict";
/* Test de validité ITD / ILD : la chaîne complète (parseur → HRIR → interpolation → normalisation → quantification → rééchantillonnage) doit restituer les ITD et ILD théoriques du jeu synthétique. */
/* ITD = différence des retards de centroïde énergétique gauche/droite (positif = gauche en retard). ILD = 10·log10(énergie gauche / énergie droite) (positif = gauche plus fort). */

const L=(typeof require==="function"&&typeof module!=="undefined")?require("./app_fonctions.js"):globalThis.__LIB__; // chargement de la bibliothèque (Node ou bac à sable)
const G=(typeof require==="function"&&typeof module!=="undefined")?require("./gen_sofa_synthetique.js"):globalThis.__GEN__; // chargement du générateur

function mesureHRIR(sofa, az, el, interp, bits, srOut, methode){ // chaîne complète : HRIR interpolé → normalisé (et quantifié si bits=16) → éventuellement rééchantillonné
  const hr=L.getHRIR(sofa, az, el, interp, false); // HRIR à la position UI demandée (sans miroir)
  let Lc=hr.L, Rc=hr.R, sr=sofa.sr; // canaux et fréquence de travail
  if(srOut && srOut!==sofa.sr){ // si un rééchantillonnage est demandé
    Lc=L.resampleHRIR(sofa,hr.L,sofa.N,srOut,methode); // canal gauche rééchantillonné
    Rc=L.resampleHRIR(sofa,hr.R,sofa.N,srOut,methode); // canal droit rééchantillonné
    sr=srOut; // nouvelle fréquence
  }
  const q=L.quantifierHRIR(Lc,Rc,bits); // normalisation d'énergie + quantification (32 ou 16 bits)
  return { L:q.L, R:q.R, sr, itdMicros:L.itdSecondes(q.L,q.R,sr)*1e6, ildDb:L.ildDb(q.L,q.R) }; // canaux finaux + ITD (µs) + ILD (dB)
}

function run(){ // exécute tous les cas de test et renvoie le rapport
  const gen=G.run(); // jeu synthétique
  const sofa=L.parseSofa(gen.v1); // lecture du fichier classic
  const A=gen.attendu; // valeurs théoriques
  const cas=[]; // vérifications
  const verif=(nom,attendu,obtenu,tol)=>{ // enregistre une vérification
    const ok = tol===undefined ? attendu===obtenu : Math.abs(obtenu-attendu)<=tol; // stricte ou tolérance
    cas.push({nom, attendu, obtenu, ok}); // mémorisation
  };
  const tableau=[]; // tableau récapitulatif par position (pour l'analyse)
  /* ---- 1. positions exactes des mesures : ITD et ILD théoriques restitués (sans interpolation) ---- */
  for(const [m,azUI] of [[0,90],[1,0],[2,-90]]){ // mesures m0/m1/m2 = azimuts UI +90 / 0 / −90
    const attendu={itd:A.itdMicros(m), ild:A.ildDb(m)}; // valeurs théoriques de la mesure m
    const r=mesureHRIR(sofa, azUI, 0, false, 32, null, null); // chaîne complète sans interpolation ni rééchantillonnage
    verif("az "+azUI+"° : ITD théorique ("+attendu.itd.toFixed(2)+" µs)", attendu.itd, r.itdMicros, 0.5); // restitution exacte de l'ITD
    verif("az "+azUI+"° : ILD théorique ("+attendu.ild.toFixed(2)+" dB)", attendu.ild, r.ildDb, 0.02); // restitution exacte de l'ILD
    tableau.push({azUI, itdMicros:+r.itdMicros.toFixed(3), ildDb:+r.ildDb.toFixed(4), attendu:{itd:+attendu.itd.toFixed(3), ild:+attendu.ild.toFixed(4)}}); // ligne récapitulative
  }
  /* ---- 2. interpolation à 45° : mélange cohérent des mesures voisines (m0 et m1) ---- */
  const poids=(az,el)=>{ // recalcule les poids (inverse de distance) des 3 plus proches voisins, comme getHRIR
    const u=L.sphToUnit(az,el); // vecteur cible en convention UI
    const idx=Array.from({length:sofa.M},(_,i)=>({i,d:L.angularDist(u,sofa.units[i])})).sort((a,b)=>a.d-b.d).slice(0,3); // 3 plus proches mesures
    const wsum=idx.reduce((a,x)=>a+1/(x.d+1e-6),0); // somme des poids bruts
    return idx.map(x=>(1/(x.d+1e-6))/wsum); // poids normalisés dans l'ordre des mesures retenues
  };
  const r45=mesureHRIR(sofa, 45, 0, true, 32, null, null); // interpolation des 3 plus proches voisins
  const w45=poids(45,0); // poids appliqués (m0, m1, m2)
  const E30L=(0.75*w45[1]+1.0*w45[2])**2, E34L=(0.5*w45[0])**2; // énergies du canal gauche aux impulsions n=30 et n=34 (mélange des mesures)
  const E30R=(1.0*w45[0]+0.75*w45[1])**2, E34R=(0.5*w45[2])**2; // énergies du canal droit aux mêmes positions
  const itd45Att=(30*E30L+34*E34L)/(E30L+E34L) - (30*E30R+34*E34R)/(E30R+E34R); // ITD théorique du mélange (centroïde énergétique des impulsions disjointes)
  const ild45Att=10*Math.log10((E30L+E34L)/(E30R+E34R)); // ILD théorique du mélange
  verif("az 45° interp : ITD = centroïde énergétique théorique du mélange (±2 µs)", itd45Att/sofa.sr*1e6, r45.itdMicros, 2); // cohérence pondération ↔ mesure
  verif("az 45° interp : ILD = énergies théoriques du mélange (±0,2 dB)", ild45Att, r45.ildDb, 0.2); // cohérence pondération ↔ mesure
  verif("az 45° interp : ITD ≥ 0 (source à droite → gauche en retard)", 1, (r45.itdMicros>=0)?1:0, 0); // signe cohérent avec la position
  const rM45=mesureHRIR(sofa, -45, 0, true, 32, null, null); // position miroir à gauche
  verif("az −45° interp : ITD ≈ opposé de +45°", -r45.itdMicros, rM45.itdMicros, 1); // symétrie gauche/droite du traitement
  verif("az −45° interp : ILD ≈ opposé de +45°", -r45.ildDb, rM45.ildDb, 0.1); // symétrie de l'ILD
  tableau.push({azUI:45, itdMicros:+r45.itdMicros.toFixed(3), ildDb:+r45.ildDb.toFixed(4), attendu:{itd:+(itd45Att/sofa.sr*1e6).toFixed(3), ild:+ild45Att.toFixed(4)}}); // ligne récapitulative
  tableau.push({azUI:-45, itdMicros:+rM45.itdMicros.toFixed(3), ildDb:+rM45.ildDb.toFixed(4)}); // ligne récapitulative
  /* ---- 3. effet du codage float16 sur la validité ITD/ILD (az +90°) ---- */
  const r32=mesureHRIR(sofa, 90, 0, false, 32, null, null); // référence float32
  const r16=mesureHRIR(sofa, 90, 0, false, 16, null, null); // version quantifiée float16
  verif("az 90° float16 : ITD inchangé (±0,5 µs)", r32.itdMicros, r16.itdMicros, 0.5); // le codage ne déplace pas les retards
  verif("az 90° float16 : ILD inchangé (±0,01 dB)", r32.ildDb, r16.ildDb, 0.01); // le codage ne dérive pas le rapport d'énergie
  tableau.push({azUI:90, codage:"float16", itdMicros:+r16.itdMicros.toFixed(3), ildDb:+r16.ildDb.toFixed(4)}); // ligne récapitulative
  /* ---- 4. validité ITD/ILD après rééchantillonnage 48 kHz → 44,1 kHz (az +90°, sinc et linéaire) ---- */
  for(const meth of ["sinc","linear"]){ // pour chaque méthode de rééchantillonnage
    const r=mesureHRIR(sofa, 90, 0, false, 32, 44100, meth); // chaîne complète avec rééchantillonnage
    if(meth==="sinc"){ // le sinc préserve retards et rapports d'énergie
      verif("az 90° rééchant. "+meth+" : ITD préservé (±1 µs)", A.itdMicros(0), r.itdMicros, 1); // l'ITD en secondes doit être conservé
      verif("az 90° rééchant. "+meth+" : ILD préservé (±0,1 dB)", A.ildDb(0), r.ildDb, 0.1); // l'ILD doit être conservé
    } else { // le linéaire présente un biais documenté sur les impulsions de Dirac — HRIR réels : erreur moindre
      verif("az 90° rééchant. "+meth+" : ITD préservé (±8 µs, biais documenté sur Dirac)", A.itdMicros(0), r.itdMicros, 8); // biais ≈ −6 µs mesuré sur impulsions ponctuelles
      verif("az 90° rééchant. "+meth+" : ILD dérive limitée (±1,5 dB)", A.ildDb(0), r.ildDb, 1.5); // dispersion d'énergie selon la position fractionnaire
    }
    tableau.push({azUI:90, methode:meth, itdMicros:+r.itdMicros.toFixed(3), ildDb:+r.ildDb.toFixed(4)}); // ligne récapitulative
  }
  /* ---- 5. miroir (flip) : inversion du signe de l'ITD et de l'ILD ---- */
  const hrF=L.getHRIR(sofa, 90, 0, false, true); // HRIR avec miroir activé (cas des fichiers à azimut horaire)
  const qF=L.quantifierHRIR(hrF.L,hrF.R,32); // normalisation
  const itdF=L.itdSecondes(qF.L,qF.R,sofa.sr)*1e6, ildF=L.ildDb(qF.L,qF.R); // ITD/ILD après miroir
  verif("flip à +90° : ITD inversé (≈ −83,33 µs)", A.itdMicros(2), itdF, 0.5); // la source passe à gauche
  verif("flip à +90° : ILD inversé (≈ +6,02 dB)", A.ildDb(2), ildF, 0.02); // le canal le plus fort change de côté
  const passes=cas.filter(c=>c.ok).length; // réussites
  return { test:"Validité ITD / ILD sur la chaîne complète", passes, echecs:cas.length-passes, tableau, cas }; // rapport
}

if (typeof module!=="undefined" && module.exports) module.exports={run}; // export Node.js

/* Exécution en ligne de commande : node test_itd_ild.js */
if (typeof require==="function" && require.main===module){ // si lancé directement
  const r=run(); // exécution
  const fs=require("fs"); // accès fichiers
  fs.mkdirSync("results",{recursive:true}); // dossier results
  fs.writeFileSync("results/resultats_itd_ild.json", JSON.stringify(r,null,2)); // sauvegarde
  console.log(r.passes+" réussites / "+r.echecs+" échecs"); // résumé
}
