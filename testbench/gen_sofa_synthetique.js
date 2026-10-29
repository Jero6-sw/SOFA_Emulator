"use strict";
/* Générateur de fichier SOFA synthétique (NetCDF-3, formats classic v1 et 64-bit offset v2). */
/* Les HRIR sont des impulsions simples à position et amplitude connues → ITD et ILD théoriques exacts. */

const NC_T = {5:4, 6:8}; // taille en octets des types utilisés (float=5, double=6)

function i32b(a,x){ a.push((x>>>24)&255,(x>>>16)&255,(x>>>8)&255,x&255); } // écrit un entier 32 bits gros-boutiste dans le tableau d'octets a
function i64b(a,x){ i32b(a,Math.floor(x/4294967296)); i32b(a,x>>>0); } // écrit un offset 64 bits : mot fort puis mot faible (format v2)
function nomB(a,s){ // écrit un nom NetCDF : longueur + caractères + alignement sur 4 octets
  i32b(a,s.length); // longueur de la chaîne
  for(let i=0;i<s.length;i++) a.push(s.charCodeAt(i)); // caractères ASCII
  while(a.length%4!==0) a.push(0); // padding XDR jusqu'au multiple de 4
}
function blobVar(type, vals){ // encode les valeurs d'une variable en octets gros-boutistes, alignés sur 4
  const nb=vals.length*NC_T[type]; // taille utile en octets
  const buf=new ArrayBuffer(nb); // tampon binaire
  const dv=new DataView(buf); // vue gros-boutiste
  for(let i=0;i<vals.length;i++){ // pour chaque valeur
    if(type===5) dv.setFloat32(i*4, vals[i], false); // NC_FLOAT : 4 octets
    else dv.setFloat64(i*8, vals[i], false); // NC_DOUBLE : 8 octets
  }
  const out=Array.from(new Uint8Array(buf)); // conversion en tableau d'octets
  while(out.length%4!==0) out.push(0); // padding jusqu'au multiple de 4 (vsize aligné)
  return out; // octets prêts à concaténer
}
function ecrireNetCDF3(ver, dims, vars){ // assemble un fichier NetCDF-3 complet (en-tête + données)
  // passe 1 : en-tête avec offsets provisoires pour connaître la position de départ des données
  const construire = (begins) => { // fonction interne : construit l'en-tête avec les offsets fournis
    const H=[]; // tableau d'octets de l'en-tête
    H.push(67,68,70,ver); // signature "CDF" + octet de version (1 ou 2)
    i32b(H,0); // numRecs = 0 (aucune dimension illimitée)
    i32b(H,10); i32b(H,dims.length); // liste des dimensions : tag NC_DIMENSION + nombre
    for(const [n,l] of dims){ nomB(H,n); i32b(H,l); } // chaque dimension : nom + longueur
    i32b(H,0); i32b(H,0); // liste d'attributs globaux absente (tag 0, compteur 0)
    i32b(H,11); i32b(H,vars.length); // liste des variables : tag NC_VARIABLE + nombre
    vars.forEach((v,i)=>{ // pour chaque variable
      nomB(H,v.name); // nom de la variable
      i32b(H,v.dims.length); // nombre de dimensions
      for(const d of v.dims) i32b(H,d); // identifiants des dimensions
      i32b(H,0); i32b(H,0); // liste d'attributs de variable absente
      i32b(H,v.type); // type des données
      i32b(H,v.blob.length); // vsize : taille du bloc de données aligné sur 4
      if(ver===2) i64b(H,begins[i]); else i32b(H,begins[i]); // offset de début des données : 8 octets en v2, 4 en v1
    });
    return H; // en-tête complet
  };
  const dummy=construire(vars.map(()=>0)); // en-tête avec offsets nuls pour mesurer sa longueur
  let off=dummy.length; // position où commence la zone de données
  const begins=vars.map(v=>{ const b=off; off+=v.blob.length; return b; }); // calcul des vrais offsets par taille cumulée
  const H=construire(begins); // en-tête final avec les vrais offsets
  const total=new Uint8Array(H.length + vars.reduce((a,v)=>a+v.blob.length,0)); // fichier complet
  total.set(H,0); // copie de l'en-tête
  let o=H.length; // curseur de copie des données
  for(const v of vars){ total.set(v.blob,o); o+=v.blob.length; } // concaténation des blocs de données dans l'ordre
  return total.buffer; // ArrayBuffer du fichier NetCDF-3
}

function run(){ // construit le jeu de test synthétique et renvoie les deux fichiers (v1 et v2)
  const SR=48000, M=3, R=2, N=64; // paramètres du jeu : 48 kHz, 3 positions, 2 oreilles, 64 échantillons
  const azs=[-90,0,90], els=[0,0,0]; // azimuts SOFA (antihoraires) et élévations des 3 mesures
  const hrir=new Float64Array(M*R*N); // tableau plat des HRIR [M][R][N]
  const impulsion=(m,r,delai,amp)=>{ hrir[m*R*N + r*N + delai]=amp; }; // écrit une impulsion de Dirac discrète à l'échantillon "delai"
  impulsion(0,0,34,0.5);  impulsion(0,1,30,1.0); // m0 (az=-90 → source à droite en UI) : gauche retardée de 4 échantillons (34 vs 30) et atténuée (0,5) — impulsions centrées pour éviter la troncature du noyau de rééchantillonnage
  impulsion(1,0,30,0.75); impulsion(1,1,30,0.75); // m1 (az=0, devant) : parfaitement symétrique (ITD=0, ILD=0) — amplitude 0,75 exactement représentable en float32
  impulsion(2,0,30,1.0);  impulsion(2,1,34,0.5); // m2 (az=+90 → source à gauche en UI) : miroir exact de m0
  const dims=[["M",M],["C",3],["R",R],["N",N]]; // dimensions : M=3, C=3 (coordonnées), R=2, N=64
  const srVals=[SR,SR,SR]; // Data.SamplingRate : une valeur par position (48 kHz)
  const srcPos=[]; for(let m=0;m<M;m++){ srcPos.push(azs[m],els[m],1.0); } // SourcePosition : (azimut, élévation, rayon=1 m)
  const rcvPos=[0,0.09,0, 0,-0.09,0]; // ReceiverPosition : récepteur 1 à y=+0,09 m (gauche en convention SOFA), récepteur 2 à y=-0,09 m
  const mkVars=()=>[ // description des 4 variables requises par le parseur
    {name:"Data.SamplingRate", type:5, dims:[0], blob:blobVar(5,srVals)}, // fréquence d'échantillonnage (NC_FLOAT, dimension M)
    {name:"SourcePosition",    type:6, dims:[0,1], blob:blobVar(6,srcPos)}, // positions des sources (NC_DOUBLE, M×3)
    {name:"ReceiverPosition",  type:6, dims:[2,1], blob:blobVar(6,rcvPos)}, // positions des récepteurs (NC_DOUBLE, R×3)
    {name:"Data.IR",            type:5, dims:[0,2,3], blob:blobVar(5,Array.from(hrir))}, // réponses impulsionnelles (NC_FLOAT, M×R×N)
  ];
  const attendu={ // valeurs théoriques attendues après lecture (documentées pour les tests de cohérence)
    SR, M, R, N, azs, els, earSwap:false, // métadonnées : récepteur 1 = gauche (pas d'inversion)
    itdMicros:m=>{ return m===0?4/SR*1e6 : m===1?0 : -4/SR*1e6; }, // ITD théorique par mesure en µs (gauche moins droite) : +83,33 / 0 / −83,33
    ildDb:m=>{ return m===0?10*Math.log10(0.25) : m===1?0 : 10*Math.log10(4); }, // ILD théorique par mesure en dB (gauche/droite) : −6,02 / 0 / +6,02
    hrirRef:Array.from(hrir), // valeurs exactes stockées (copie de référence)
  };
  return { // résultat du générateur
    v1: ecrireNetCDF3(1, dims, mkVars()), // fichier NetCDF-3 classic (offsets 32 bits)
    v2: ecrireNetCDF3(2, dims, mkVars()), // fichier NetCDF-3 64-bit offset (offsets 64 bits)
    attendu, // description des valeurs attendues
  };
}

if (typeof module!=="undefined" && module.exports) module.exports={run}; // export Node.js

/* Exécution en ligne de commande : node gen_sofa_synthetique.js → écrit les deux fichiers .sofa */
if (typeof require==="function" && require.main===module) { // si lancé directement sous Node
  const fs=require("fs"); // accès au système de fichiers
  const r=run(); // génération des deux fichiers
  fs.writeFileSync("test_synthetique_v1.sofa", Buffer.from(r.v1)); // écriture du fichier classic
  fs.writeFileSync("test_synthetique_v2.sofa", Buffer.from(r.v2)); // écriture du fichier 64-bit offset
  console.log("Fichiers écrits : test_synthetique_v1.sofa ("+r.v1.byteLength+" octets), test_synthetique_v2.sofa ("+r.v2.byteLength+" octets)"); // confirmation
}
