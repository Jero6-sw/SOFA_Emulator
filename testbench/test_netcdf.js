"use strict";
/* Test de non-régression : lecteur NetCDF-3 (formats classic v1 et 64-bit offset v2) + extraction SOFA. */
/* Vérifie que le parseur lit exactement les valeurs écrites par le générateur (dimensions, fréquence, positions, HRIR, ordre des oreilles). */

const L=(typeof require==="function"&&typeof module!=="undefined")?require("./app_fonctions.js"):globalThis.__LIB__; // chargement de la bibliothèque (Node ou bac à sable)
const G=(typeof require==="function"&&typeof module!=="undefined")?require("./gen_sofa_synthetique.js"):globalThis.__GEN__; // chargement du générateur

function run(){ // exécute tous les cas de test et renvoie le rapport
  const gen=G.run(); // génération des deux fichiers synthétiques
  const A=gen.attendu; // valeurs théoriques
  const cas=[]; // liste des vérifications
  const verif=(nom,attendu,obtenu,tol)=>{ // enregistre une vérification : nom, attendu, obtenu, tolérance absolue
    const ok = tol===undefined ? attendu===obtenu : Math.abs(obtenu-attendu)<=tol; // égalité stricte ou tolérance
    cas.push({nom, attendu, obtenu, ok}); // mémorisation du résultat
    return ok; // renvoie le verdict
  };
  for(const [etiquette, buf] of [["classic v1",gen.v1],["64-bit offset v2",gen.v2]]){ // pour les deux variantes de format
    const sofa=L.parseSofa(buf); // lecture par le parseur de l'application
    verif(etiquette+" · fréquence d'échantillonnage", A.SR, sofa.sr, 0); // 48000 Hz exactement
    verif(etiquette+" · nombre de positions M", A.M, sofa.M, 0); // M = 3
    verif(etiquette+" · nombre d'oreilles R", A.R, sofa.R, 0); // R = 2
    verif(etiquette+" · longueur des HRIR N", A.N, sofa.N, 0); // N = 64
    verif(etiquette+" · oreille 1 = gauche (earSwap)", false, sofa.earSwap); // pas d'inversion détectée
    for(let m=0;m<A.M;m++){ // pour chaque position mesurée
      verif(etiquette+" · azimut SOFA mesure "+m, A.azs[m], sofa.azs[m], 0); // azimut exact
      verif(etiquette+" · élévation SOFA mesure "+m, A.els[m], sofa.els[m], 0); // élévation exacte
    }
    let identiques=true; // les 384 valeurs de Data.IR doivent être exactes
    for(let i=0;i<A.hrirRef.length;i++){ if(sofa.hrir[i]!==A.hrirRef[i]){ identiques=false; break; } } // comparaison exhaustive
    verif(etiquette+" · valeurs Data.IR exactes ("+A.hrirRef.length+" valeurs)", true, identiques); // verdict de l'exactitude
    const u=L.sphToUnit(-(-90),0); // vecteur UI de la mesure m0 (az SOFA -90 → UI +90 : droite)
    verif(etiquette+" · vecteur unitaire m0 (y=droite=1)", 1, u[1], 1e-12); // cohérence de la conversion sphérique
    verif(etiquette+" · vecteur unitaire m0 (x=avant=0)", 0, u[0], 1e-12); // composante avant nulle
    const d0=L.angularDist(u,sofa.units[0]); // distance angulaire à la mesure 0
    verif(etiquette+" · distance angulaire cible m0 = 0", 0, d0, 1e-9); // la cible tombe pile sur la mesure
    const d1=L.angularDist(u,sofa.units[1]); // distance angulaire à la mesure 1
    verif(etiquette+" · distance angulaire m0→m1 = 90°", Math.PI/2, d1, 1e-9); // le quart de tour exact
  }
  const passes=cas.filter(c=>c.ok).length; // nombre de vérifications réussies
  return { test:"Non-régression NetCDF-3 / extraction SOFA", passes, echecs:cas.length-passes, cas }; // rapport complet
}

if (typeof module!=="undefined" && module.exports) module.exports={run}; // export Node.js

/* Exécution en ligne de commande : node test_netcdf.js */
if (typeof require==="function" && require.main===module){ // si lancé directement
  const r=run(); // exécution des tests
  const fs=require("fs"); // accès fichiers
  fs.writeFileSync("results/resultats_netcdf.json", JSON.stringify(r,null,2)); // sauvegarde du rapport
  console.log(r.passes+" réussites / "+r.echecs+" échecs"); // résumé console
}
