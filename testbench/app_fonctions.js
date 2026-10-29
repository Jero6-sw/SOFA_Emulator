"use strict";
/* Bibliothèque de test — fonctions copiées depuis SOFA_Emulator.html v2.0 (29/10/2026). */
/* Seule différence avec l'application : aucune dépendance au DOM ; les options (flip, interpolation, précision, méthode) sont des paramètres explicites. */

/* ================= Lecteur NetCDF-3 (identique à l'application) ================= */
const NC_TYPES = {1:1,2:1,3:2,4:4,5:4,6:8}; // taille en octets de chaque type NetCDF (byte, char, short, int, float, double)
function readNetCDF3(buf){ // parse un conteneur NetCDF-3 et renvoie un lecteur de variables
  const dv = new DataView(buf); // vue gros-boutiste sur l'octet-blob du fichier
  const dec = new TextDecoder("ascii"); // décodeur pour les noms et attributs texte
  const magic = dec.decode(new Uint8Array(buf,0,3)); // lecture de la signature d'en-tête (3 premiers octets)
  if(magic !== "CDF") throw new Error("En-tête NetCDF invalide (CDF attendu)."); // le banc d'essai ne teste que du NetCDF-3
  const ver = dv.getUint8(3); // octet de version : 1 = classic, 2 = 64-bit offset
  let p = 4; // curseur de lecture, juste après l'en-tête magique de 4 octets
  const i32 = ()=>dv.getInt32(p); // lecture 32 bits sans avancer le curseur
  const numRecs = i32(); p += 4; // nombre d'enregistrements (dimension illimitée)
  function name(){ // lit un nom NetCDF : longueur (int) + caractères + alignement sur 4 octets
    const n=i32(); p+=4; // longueur de la chaîne
    const s=dec.decode(new Uint8Array(buf,p,n)); // lecture des n caractères
    p+=Math.ceil(n/4)*4; // avance en arrondissant au multiple de 4 supérieur (padding XDR)
    return s; // retourne le nom
  }
  function attrs(){ // lit une liste d'attributs : tag + compteur, puis paires nom/type/valeurs
    const t=i32(); p+=4; // tag : 12 = NC_ATTRIBUTE, 0 = ABSENT
    const n=i32(); p+=4; // nombre d'attributs (0 si liste absente)
    const o={}; // objet résultat : nom → valeur texte
    if(t!==0){ // si la liste existe bien
      for(let i=0;i<n;i++){ // pour chaque attribut
        const nm=name(); // nom de l'attribut
        const ty=i32(); p+=4; // type des valeurs
        const ne=i32(); p+=4; // nombre de valeurs
        const nb=NC_TYPES[ty]*ne; // taille totale en octets des valeurs
        const raw=new Uint8Array(buf,p,nb); // extraction brute des octets de valeur
        p+=Math.ceil(nb/4)*4; // avance avec alignement sur 4 octets
        o[nm]=String.fromCharCode(...raw).replace(/\0+$/,""); // conversion en chaîne, zéros finaux supprimés
      }
    }
    return o; // attributs de la section parcourue
  }
  const dimTag = i32(); p+=4; // tag de la liste des dimensions (10 = NC_DIMENSION, 0 = absente)
  const nd=i32(); p+=4; // nombre de dimensions
  let dimNames=[], dimLens=[]; // noms et longueurs des dimensions
  if(dimTag!==0){ // si la liste des dimensions existe
    for(let i=0;i<nd;i++){ dimNames.push(name()); dimLens.push(i32()); p+=4; } // chaque dimension : nom + longueur (0 = dimension illimitée)
  }
  attrs(); // attributs globaux du fichier (non utilisés, mais il faut consommer les octets)
  const vt = i32(); p+=4; // tag de la liste des variables (11 = NC_VARIABLE, 0 = absente)
  const nv=i32(); p+=4; // nombre de variables
  let vars=[]; // descriptions des variables
  if(vt!==0){ // si la liste des variables existe
    for(let i=0;i<nv;i++){ // pour chaque variable
      const nm=name(); // nom de la variable
      const ndv=i32(); p+=4; // nombre de dimensions de la variable
      const ids=[]; // identifiants des dimensions
      for(let d=0;d<ndv;d++){ ids.push(i32()); p+=4; } // lecture de chaque identifiant de dimension
      attrs(); // attributs propres à la variable (consommés, non utilisés)
      const ty=i32(); p+=4; // type des données de la variable
      const vsize=i32(); p+=4; // taille "vsize" du bloc de données (alignée sur 4 octets)
      const begin = ver===2 ? dv.getUint32(p)*4294967296 + dv.getUint32(p+4) : dv.getUint32(p); // offset de début des données : 8 octets (mot fort puis mot faible) en v2, 4 octets en v1
      p += ver===2?8:4; // avance le curseur selon la version du format
      vars.push({name:nm, type:ty, ids, vsize, begin, isRec:ids.some(id=>dimLens[id]===0)}); // mémorise la variable et si elle dépend de la dimension record
    }
  }
  const recVars = vars.filter(v=>v.isRec); // variables stockées dans la zone d'enregistrements
  const recSize = recVars.reduce((a,v)=>a+v.vsize,0); // taille totale d'un enregistrement
  const numRecDims = numRecs; // nombre d'enregistrements (alias lisible)
  function readVar(v){ // lit une variable complète et renvoie {dims, data}
    const dims = v.ids.map(id=>({name:dimNames[id], len:dimLens[id]===0?numRecDims:dimLens[id]})); // dimensions effectives
    let n=1; dims.forEach(d=>n*=d.len); // nombre total d'éléments = produit des dimensions
    const out = new Float64Array(n); // tampon de sortie en double précision
    readInto(out, 0, n, v.begin, v.type, v.name); // lecture du bloc complet (aucune variable record dans le banc d'essai)
    return {dims, data:out}; // variable lue
  }
  function readInto(out, off, cnt, off0, ty, vname){ // écrit cnt éléments de type ty lus à l'offset off0 dans out à partir de l'indice off
    for(let i=0;i<cnt;i++){ // pour chaque élément à lire
      const q=off0+i*NC_TYPES[ty]; // offset octet du i-ème élément
      if(q+NC_TYPES[ty]>buf.byteLength) throw new Error("Données tronquées dans « "+vname+" »."); // garde-fou : ne jamais lire au-delà du fichier
      out[off+i] = ty===5?dv.getFloat32(q): ty===6?dv.getFloat64(q): ty===4?dv.getInt32(q): ty===1?dv.getInt8(q): dv.getInt16(q); // conversion selon le type NetCDF
    }
  }
  return {vars:()=>{ // API : renvoie un objet {nom → variable lue}
    const o={}; // dictionnaire résultat
    vars.forEach(v=>o[v.name]=readVar(v)); // décode chaque variable
    return o; // toutes les variables du fichier
  }};
}

/* ================= Géométrie et extraction SOFA (identiques à l'application) ================= */
function deg2rad(d){ return d*Math.PI/180; } // conversion degrés → radians
function sphToUnit(az,el){ // convertit (azimut, élévation) en vecteur unitaire ; az : convention UI horaire (+90° = droite)
  const elR=deg2rad(el), azR=deg2rad(az); // angles en radians
  return [Math.cos(elR)*Math.cos(azR), Math.cos(elR)*Math.sin(azR), Math.sin(elR)]; // (x=avant, y=droite, z=haut)
}
function parseSofa(buf){ // transforme l'octet-blob d'un fichier SOFA en objet exploitable
  const file = readNetCDF3(buf); // parse le conteneur NetCDF-3
  const V = file.vars(); // décode toutes les variables
  const irVar = V["Data.IR"] || V["Data.Real"]; // réponses impulsionnelles : Data.IR (SOFA 2.x) ou Data.Real (1.0)
  if(!irVar || !V["SourcePosition"]) throw new Error("Data.IR/Data.Real ou SourcePosition absentes."); // variables requises manquantes
  const sr = V["Data.SamplingRate"].data[0]; // fréquence d'échantillonnage des mesures (Hz)
  const M = V["SourcePosition"].dims[0].len; // nombre de positions mesurées
  const C = V["SourcePosition"].dims[1].len; // nombre de coordonnées par position
  const sp = V["SourcePosition"].data; // tableau plat (azimut, élévation, rayon) × M
  let azMin=1e9, azMax=-1e9, elMin=1e9, elMax=-1e9; // bornes de la grille de mesures
  const units=[], azs=[], els=[]; // vecteurs unitaires, azimuts et élévations
  for(let m=0;m<M;m++){ // pour chaque position mesurée
    const a=sp[m*C], b=sp[m*C+1]; // azimut et élévation SOFA de la mesure m
    azs.push(a); els.push(b); // mémorisation brute
    azMin=Math.min(azMin,a); azMax=Math.max(azMax,a); // bornes d'azimut
    elMin=Math.min(elMin,b); elMax=Math.max(elMax,b); // bornes d'élévation
    units.push(sphToUnit(-a,b)); // vecteur unitaire en convention UI (SOFA antihoraire → azimut négatif)
  }
  const [dm,dR,dN]=irVar.dims.map(d=>d.len); // dimensions M × R × N
  const N=dN, R=dR; // alias lisibles
  let earSwap=false; // vrai si le fichier stocke l'oreille droite en récepteur 1
  const rpVar=V["ReceiverPosition"]; // positions des récepteurs (oreilles)
  if(rpVar && R===2){ // si disponible et fichier binaural
    const rc=rpVar.dims.map(d=>d.len); // dimensions de ReceiverPosition
    const cc=rc.includes(3)?3:rc[rc.length-1]; // nombre de coordonnées par récepteur
    const y0=rpVar.data[1], y1=rpVar.data[cc+1]; // composante y (SOFA : y>0 = gauche) de chaque récepteur
    if(y1>y0) earSwap=true; // récepteur 2 plus à gauche → récepteur 1 = oreille droite → inversion
  }
  if(R<2) throw new Error("HRIR non binaural (R<2)."); // un fichier mono n'est pas spatialisable
  return {sr, M, N, R, units, azs, els, hrir:irVar.data, azMin, azMax, elMin, elMax, earSwap}; // objet SOFA prêt à l'emploi
}
function angularDist(u,v){ // distance angulaire (grand cercle) entre deux vecteurs unitaires
  const d=Math.max(-1,Math.min(1,u[0]*v[0]+u[1]*v[1]+u[2]*v[2])); // produit scalaire borné
  return Math.acos(d); // angle en radians
}
function getHRIR(sofa, azDeg, elDeg, interp, flip){ // calcule le HRIR binaural (L,R) pour une position donnée — flip en paramètre (1 = miroir)
  const f = flip ? -1 : 1; // facteur de miroir gauche/droite
  const u = sphToUnit(f*azDeg, elDeg); // vecteur unitaire cible en convention UI
  const idx = Array.from({length:sofa.M},(_,i)=>i) // indices de toutes les mesures
    .map(i=>({i, d:angularDist(u,sofa.units[i])})) // distance angulaire de chaque mesure
    .sort((a,b)=>a.d-b.d) // tri par distance croissante
    .slice(0,interp?3:1); // les 3 plus proches (interpolation) ou la plus proche seule
  const wsum = idx.reduce((a,x)=>a+1/(x.d+1e-6),0); // somme des poids (inverse de distance)
  const offL = sofa.earSwap ? sofa.N : 0, offR = sofa.earSwap ? 0 : sofa.N; // décalages de canal selon l'ordre des oreilles
  const L=new Float64Array(sofa.N), Rt=new Float64Array(sofa.N); // tampons gauche et droite
  for(const x of idx){ // pour chaque mesure retenue
    const w=(1/(x.d+1e-6))/wsum; // poids normalisé
    const base=x.i*sofa.R*sofa.N; // offset de la mesure dans le tableau plat [M][R][N]
    for(let n=0;n<sofa.N;n++){ // pour chaque échantillon
      L[n]+=w*sofa.hrir[base+offL+n]; // accumulation pondérée du canal gauche
      Rt[n]+=w*sofa.hrir[base+offR+n]; // accumulation pondérée du canal droit
    }
  }
  return {L, R:Rt, nearest:idx[0]}; // HRIR interpolé + mesure la plus proche
}

/* ================= Rééchantillonnage (identique à l'application) ================= */
function resampleHRIR(sofa, a, N, srOut, methode){ // dispatch vers la méthode demandée ("sinc" ou "linear")
  return methode==="linear" ? resampleLinear(sofa, a, N, srOut) : resampleSinc(sofa, a, N, srOut); // choix de l'algorithme
}
function resampleLinear(sofa, a, N, srOut){ // rééchantillonnage linéaire : rapide, anti-aliasing limité
  const N2=Math.round(N*srOut/sofa.sr); // nouvelle longueur proportionnelle
  const o=new Float64Array(N2); // tampon de sortie
  for(let i=0;i<N2;i++){ // pour chaque échantillon de sortie
    const t=i*sofa.sr/srOut; // position d'origine (en échantillons source)
    const j=Math.floor(t), fr=t-j; // indice entier et fraction
    o[i]=(a[j]||0)*(1-fr)+(a[j+1]||0)*fr; // interpolation linéaire (0 au-delà du signal)
  }
  return o; // coefficients rééchantillonnés
}
function resampleSinc(sofa, a, N, srOut){ // rééchantillonnage sinc fenêtré Blackman (65 taps) : anti-aliasing fort
  const step=sofa.sr/srOut; // pas en échantillons source
  const N2=Math.round(N*srOut/sofa.sr); // longueur de sortie
  const out=new Float64Array(N2); // tampon de sortie
  const fc=Math.min(1, srOut/sofa.sr)*0.45; // coupure normalisée : 0,45 × le Nyquist le plus bas
  const K=32; // demi-largeur du noyau (65 taps au total)
  for(let i=0;i<N2;i++){ // pour chaque échantillon de sortie
    const t=i*step; // position exacte dans la source
    const j0=Math.floor(t); // échantillon source le plus proche
    let s=0, wsum=0; // accumulateur et somme des poids
    for(let j=j0-K; j<=j0+K; j++){ // pour chaque tap du noyau
      if(j<0 || j>=N) continue; // hors du signal : nul
      const d=t-j; // distance du tap au centre
      const z=fc*d; // argument du sinc
      const snc = Math.abs(z)<1e-9 ? 1 : Math.sin(Math.PI*z)/(Math.PI*z); // sinc tronqué
      const w = 0.42 + 0.5*Math.cos(Math.PI*d/K) + 0.08*Math.cos(2*Math.PI*d/K); // fenêtre Blackman
      const k = snc*w; // tap du noyau
      s += a[j]*k; // contribution
      wsum += k; // accumulation pour normalisation
    }
    out[i] = wsum>1e-12 ? s/wsum : 0; // normalisation par l'énergie du noyau utilisé
  }
  return out; // coefficients rééchantillonnés
}

/* ================= Codage float16 / float32 IEEE-754 (identique à l'application) ================= */
const _cvt=new DataView(new ArrayBuffer(4)); // tampon de conversion réutilisé
function f32tof16(x){ // convertit un float32 en demi-précision (bits uint16, arrondi au plus proche pair)
  _cvt.setFloat32(0,x); // écrit la valeur dans le tampon
  const b=_cvt.getUint32(0); // relit ses 32 bits
  const sign=(b>>>16)&0x8000; // bit de signe déplacé en position half
  const e32=((b>>>23)&0xff), man32=b&0x7fffff; // exposant et mantisse float32
  if(e32===0xff) return sign|0x7c00|(man32?0x200:0); // NaN ou infini
  let e=e32-127+15; // exposant re-centré : biais 127 → biais 15
  if(e>=31) return sign|0x7c00; // débordement : infini half
  if(e<=0){ // zone dénormalisée half
    if(e<-10) return sign; // trop petit : zéro signé
    const mm=man32|0x800000; // mantisse avec bit caché rétabli
    const shift=14-e; // décalage vers la position dénormalisée
    let half=mm>>shift; // partie entière
    const rem=mm&((1<<shift)-1); // bits perdus
    const mid=1<<(shift-1); // bit de mi-chemin
    if(rem>mid || (rem===mid && (half&1))) half++; // arrondi au plus proche pair
    return sign|half; // valeur half dénormalisée
  }
  let half=(e<<10)|(man32>>13); // construction normale : exposant + 10 bits de mantisse
  const rem=man32&0x1fff; // 13 bits perdus
  if(rem>0x1000 || (rem===0x1000 && (half&1))) half++; // arrondi au plus proche pair
  if((half&0x7c00)===0x7c00) half=(half&0x8000)|0x7c00; // débordement d'exposant : infini
  return sign|half; // bits float16 résultat
}
function f16tof32(h){ // reconvertit des bits float16 en valeur float32
  const s=(h&0x8000)?-1:1; // signe
  const e=(h>>10)&0x1f, m=h&0x3ff; // exposant et mantisse half
  if(e===0) return s*m*Math.pow(2,-24); // dénormalisé
  if(e===31) return m?NaN:s*Infinity; // NaN ou ±infini
  return s*(1+m/1024)*Math.pow(2,e-15); // valeur normale
}
function quant16(v){ return f16tof32(f32tof16(v)); } // quantification aller-retour en demi-précision
function f2hex(v){ _cvt.setFloat32(0,v,false); return _cvt.getUint32(0,false).toString(16).padStart(8,"0"); } // float32 → 8 chiffres hexa gros-boutistes
function h2hex(v){ return f32tof16(v).toString(16).padStart(4,"0"); } // valeur → 4 chiffres hexa de ses bits float16
function quantifierHRIR(L, R, bits){ // réplique de hrirBuffer de l'application : normalisation d'énergie puis quantification éventuelle
  const N=L.length; // longueur des canaux
  let e=0; for(let i=0;i<N;i++) e+=L[i]*L[i]+R[i]*R[i]; // énergie totale L+R
  const gn=1/Math.sqrt(Math.max(e,1e-12)); // gain de normalisation (préserve l'ILD)
  const Lf=new Float64Array(N), Rf=new Float64Array(N); // tampons résultat
  for(let i=0;i<N;i++){ Lf[i]=L[i]*gn; Rf[i]=R[i]*gn; } // normalisation appliquée aux deux canaux
  if(bits===16){ // si le codage demandé est float16
    for(let i=0;i<N;i++){ Lf[i]=quant16(Lf[i]); Rf[i]=quant16(Rf[i]); } // coefficients quantifiés en demi-précision
  }
  return {L:Lf, R:Rf, gain:gn}; // canaux normalisés (et quantifiés si 16 bits) + gain appliqué
}

/* ================= Mesures (outils du banc d'essai) ================= */
function energie(x){ let e=0; for(let i=0;i<x.length;i++) e+=x[i]*x[i]; return e; } // énergie totale d'un signal
function rms(x){ return Math.sqrt(energie(x)/Math.max(1,x.length)); } // valeur efficace d'un signal
function centroidEnergie(x, sr){ // centre de gravité énergétique (retard moyen) en secondes
  let n=0, e=0; // accumulateurs : moment et masse
  for(let i=0;i<x.length;i++){ const p=x[i]*x[i]; n+=i*p; e+=p; } // pondération par l'énergie de chaque échantillon
  return e>1e-30 ? n/e/sr : 0; // position moyenne en secondes (0 si signal nul)
}
function itdSecondes(L, R, sr){ return centroidEnergie(L,sr) - centroidEnergie(R,sr); } // ITD = retard du centroïde gauche moins droit (positif = gauche en retard)
function ildDb(L, R){ return 10*Math.log10(Math.max(energie(L),1e-30)/Math.max(energie(R),1e-30)); } // ILD en dB (positif = gauche plus fort)
function sinus(freq, sr, n, amp){ // générateur de sinus pur (pour les tests de rééchantillonnage)
  const o=new Float64Array(n); // tampon de sortie
  for(let i=0;i<n;i++) o[i]=amp*Math.sin(2*Math.PI*freq*i/sr); // sinusoïde exacte
  return o; // signal de test
}
function db(x){ return 20*Math.log10(Math.max(x,1e-30)); } // conversion amplitude → dB

/* ================= Exports (Node.js et environnements compatibles) ================= */
if (typeof module!=="undefined" && module.exports) { // si l'environnement fournit module (Node.js)
  module.exports = { NC_TYPES, readNetCDF3, deg2rad, sphToUnit, parseSofa, angularDist, getHRIR, resampleHRIR, resampleLinear, resampleSinc, f32tof16, f16tof32, quant16, f2hex, h2hex, quantifierHRIR, energie, rms, centroidEnergie, itdSecondes, ildDb, sinus, db }; // API publique de la bibliothèque
}
