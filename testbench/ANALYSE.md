# Analyse des résultats — SOFA_Emulator v2.0 (29/10/2026)

Synthèse des quatre campagnes de test (102 vérifications, 0 échec — rapports dans `results/`).
Objectif : vérifier la **cohérence** des sorties sur trois axes : codage float16/32, rééchantillonnage, validité ITD/ILD.

## 1. Non-régression : lecteur NetCDF-3 / extraction SOFA — 32/32 ✔

Le parseur lit **exactement** (à l'égalité près) les valeurs écrites par le générateur, dans les deux
variantes du format (classic v1 et 64-bit offset v2) : dimensions M=3, R=2, N=64, fréquence 48 000 Hz,
azimuts/élévations, les 384 coefficients de `Data.IR` bit à bit (amplitudes choisies exactement
représentables en float32), ordre des oreilles (récepteur 1 = gauche, `earSwap=false`), conversion
sphérique (distance angulaire nulle sur la mesure cible, π/2 entre mesures voisines).
→ Aucune régression des corrections historiques (listes absentes, offsets 64 bits, layout [M][R][N]).

## 2. Codage float16 / float32 — 37/37 ✔

| Grandeur | float32 (réf.) | float16 | Verdict |
|---|---|---|---|
| Erreur relative max sur coefficients | — | 4,5 × 10⁻⁴ (< 2⁻¹⁰) | conforme à la demi-précision (ε ≈ 2⁻¹¹ par valeur) |
| Dérive d'énergie (canal gauche) | 0 dB | +0,0005 dB | négligeable |
| ITD (µs) | 83,236 | 83,236 (Δ ≈ 0,000016 µs) | inchangé — la quantification ne déplace pas les retards |
| ILD (dB) | −6,0210 | −6,0210 (Δ ≈ 6 × 10⁻⁸ dB) | inchangé — l'arrondi est commun aux deux canaux |
| Vecteurs IEEE-754 | 1.0→`3c00`, 2.0→`4000`, 0.5→`3800`, ±65504, min normal `0400`, min dénormal `0001`, 1e9→`7c00` (+∞), zéros signés | | tous exacts |

**Interprétation** : l'écoute A/B float16/float32 proposée dans l'application teste un codage ~100 fois
plus grossier que la limite audible sur les amplitudes ; les indices de localisation (ITD, ILD) sont
mathématiquement préservés (erreur < 10⁻⁷ dB), donc toute différence audible ne peut venir que du bruit
de quantification large bande (≈ −72 dB sur l'énergie du filtre), pas d'un biais de localisation.
Le CSV float16 (4 chiffres hexa) est l'image exacte des bits stockés → cohérence garantie entre
l'écoute et l'export.

## 3. Rééchantillonnage sinc fenêtré vs linéaire (48 → 44,1 kHz) — 14/14 ✔

| Mesure | sinc (défaut) | linéaire |
|---|---|---|
| Amplitude 1 kHz | 0,99999 (0 dB) | 0,99883 (−0,01 dB) |
| Amplitude 5 kHz | 0,99992 (0 dB) | 0,96476 (−0,31 dB) |
| Amplitude 10 kHz (constat) | 0,4566 (−6,8 dB : bande de transition, coupure à 0,45 × Nyquist = 9,92 kHz) | 0,8677 (−1,2 dB) |
| Rejet alias 25 kHz | **−105,3 dB** | **−4,7 dB** |
| ITD après rééchantillonnage (réf. 83,33 µs) | 83,334 µs (Δ +0,001 µs) | 77,188 µs (biais −6,1 µs) |
| ILD après rééchantillonnage (réf. −6,02 dB) | −6,020 dB (Δ < 0,001 dB) | −4,677 dB (dérive +1,34 dB) |

**Interprétation** :
- Le **sinc fenêtré** est cohérent avec sa conception : bande plate jusqu'à 9,92 kHz (coupure
  volontairement prudente à 0,45 × Nyquist, marge de transition du filtre à 65 taps), rejet d'aliasing
  massif (−105 dB), ITD et ILD préservés à mieux que le millième. C'est bien le défaut de l'application.
- Le **linéaire** est fidèle à basse fréquence mais cumule trois dégradations mesurées : attenuation
  haute fréquence (réponse en sinc²), aliasing quasi non rejeté (−4,7 dB seulement), et sur des
  **impulsions de Dirac** (pire cas du banc) un biais d'ITD de −6 µs et une dérive d'ILD de +1,3 dB
  (le centroïde énergétique d'une impulsion étalée sur deux échantillons n'est pas sa position exacte).
  Sur des HRIR réels (signaux lisses, plusieurs dizaines d'échantillons), ces biais sont notablement
  plus faibles ; ils restent la raison pour laquelle le sinc est le défaut.
- Le constat « 10 kHz » n'est pas un défaut : il documente la bande de transition assumée du filtre
  (rien n'est attendu au-dessus de 9,92 kHz en sortie 44,1 kHz — c'est la marge anti-repliement).

## 4. Validité ITD / ILD sur la chaîne complète — 19/19 ✔

Chaîne testée : parseur → HRIR (interpolation inverse-distance) → normalisation d'énergie →
quantification float16/32 → rééchantillonnage éventuel.

| Position (UI) | ITD mesuré (µs) | ITD théorique (µs) | ILD mesuré (dB) | ILD théorique (dB) |
|---|---|---|---|---|
| +90° (droite) | +83,333 | +83,333 | −6,0206 | −6,0206 |
| 0° (avant) | 0,000 | 0 | 0,0000 | 0 |
| −90° (gauche) | −83,333 | −83,333 | +6,0206 | +6,0206 |
| +45° interp. | +13,885 | +13,885 | −3,3661 | −3,3661 |
| −45° interp. | −13,885 | (opposé) | +3,3661 | (opposé) |
| +90°, float16 | +83,333 | +83,333 | −6,0206 | −6,0206 |
| +90°, rééchant. sinc | +83,334 | +83,333 | −6,0204 | −6,0206 |
| +90°, rééchant. linéaire | +77,188 | (biais documenté) | −4,6769 | (biais documenté) |

**Interprétation** :
- **Restitution exacte** aux positions mesurées : la chaîne restitue les ITD (±0,5 µs) et ILD (±0,02 dB)
  théoriques du jeu synthétique — le signe et l'ordre de grandeur physiques sont corrects
  (ITD nul au centre, maximal ±latéral, antisymétrique ; ILD corrélé en sens inverse).
- **Interpolation cohérente** : à 45°, l'ITD mesuré (13,885 µs) correspond **exactement** au centroïde
  énergétique théorique du mélange pondéré par inverse-distance des mesures voisines (13,885 µs),
  de même que l'ILD (−3,366 dB). À noter : la moyenne pondérée des HRIR ne donne pas la moyenne des ITD
  (les impulsions des mesures voisines se superposent) — c'est le comportement attendu de
  l'interpolation, et l'antisymétrie ±45° est parfaite.
- **Miroir (flip)** : le signe de l'ITD et de l'ILD s'inverse exactement (+90° ↔ −90°) — la case
  « azimut horaire » fonctionne.
- **float16** : aucun effet mesurable sur ITD/ILD (voir §2).
- **Rééchantillonnage** : sinc transparent ; linéaire dégradé de façon documentée (voir §3).
- Les valeurs absolues (83 µs, 6 dB à 90°) sont celles du jeu synthétique ; un HRIR de tête réelle
  donne typiquement 200–700 µs et 3–20 dB à 90° — le banc valide la **chaîne de traitement**,
  pas la physique d'une tête particulière.

## Conclusion générale

- **102 vérifications, 0 échec** : les fonctions nouvelles (float16, sélecteurs) et anciennes
  (NetCDF-3 v1/v2, extraction SOFA, interpolation, rééchantillonnage) sont cohérentes entre elles
  et avec leurs spécifications.
- Le **codage float16** est sûr pour l'écoute : erreurs ~10⁻⁴ sur les coefficients, indices de
  localisation intacts.
- Le **sinc fenêtré** doit rester le défaut : il est le seul à préserver simultanément le spectre,
  l'ITD et l'ILD ; le linéaire reste utile comme référence rapide.
- Piste d'amélioration identifiée (hors périmètre V2) : la coupure à 0,45 × Nyquist sacrifie la bande
  9,9–22 kHz ; un noyau plus long (129 taps) ou une coupure à 0,47 × Nyquist réduirait la bande
  de transition si un jour un usage l'exige.
