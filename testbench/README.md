# Testbench — SOFA_Emulator v2.0

Banc d'essai des fonctions de [SOFA_Emulator.html](../SOFA_Emulator.html) (v2.0, 29/10/2026) :
tests des **nouvelles fonctions** (codage float16/float32, mixage multi-sources) et **non-régression des anciennes** (lecteur NetCDF-3, extraction SOFA, interpolation HRIR, rééchantillonnage), avec **résultats** et **analyse de cohérence** (float16/32, rééchantillonnage, validité ITD/ILD).

## Contenu

| Fichier | Rôle |
|---|---|
| `app_fonctions.js` | Bibliothèque : copie conforme des algorithmes de l'application (parseur NetCDF-3, extraction SOFA, HRIR, rééchantillonnage sinc/linéaire, codage float16/32), sans dépendance au DOM |
| `gen_sofa_synthetique.js` | Générateur d'un fichier SOFA **synthétique** (NetCDF-3 classic v1 + 64-bit offset v2) : 3 positions, impulsions de Dirac à ITD (±83,33 µs) et ILD (±6,02 dB) théoriques connus |
| `test_netcdf.js` | Non-régression : lecture exacte des deux formats NetCDF-3 (32 vérifications) |
| `test_float16.js` | Nouvelle fonction : conversion IEEE-754 demi-précision, encodage hexadécimal CSV, effet de la quantification sur l'énergie, l'ITD et l'ILD (37 vérifications) |
| `test_reechantillonnage.js` | Fidélité en bande, rejet d'aliasing, préservation ITD/ILD — sinc fenêtré vs linéaire (14 vérifications) |
| `test_itd_ild.js` | Validité ITD/ILD sur la chaîne complète : positions exactes, interpolation, miroir, float16, rééchantillonnage (19 vérifications) |
| `results/resultats_*.json` | Rapports détaillés de la dernière exécution (102 vérifications, 0 échec) |
| `ANALYSE.md` | Analyse et interprétation des résultats |

## Exécution (Node.js ≥ 14, aucune dépendance)

```bash
cd testbench
node gen_sofa_synthetique.js     # (optionnel) écrit test_synthetique_v1.sofa et test_synthetique_v2.sofa
node test_netcdf.js              # → results/resultats_netcdf.json
node test_float16.js             # → results/resultats_float16.json
node test_reechantillonnage.js   # → results/resultats_reechantillonnage.json
node test_itd_ild.js             # → results/resultats_itd_ild.json
```

Chaque script affiche `N réussites / M échecs` et écrit son rapport JSON dans `results/`.

## Comment générer les résultats (outils, configuration)

### Outils nécessaires

- **Node.js version 14 ou supérieure** — seule dépendance. Vérification : `node --version`.
  Toute version disposant de `padStart`, `DataView.setFloat64` et `TextDecoder` convient ;
  aucune bibliothèque externe (pas de `npm install`) : les scripts n'utilisent que le module standard `fs`.
- Aucun navigateur ni fichier SOFA réel n'est nécessaire : les tests embarquent leur
  propre générateur de fichier synthétique.

### Configuration des tests

La configuration est **dans le code** (constantes en tête de la fonction `run()`),
volontairement sans fichier externe :

| Paramètre | Emplacement | Valeur par défaut | Rôle |
|---|---|---|---|
| Fréquence source | `gen_sofa_synthetique.js` → `SR` | 48 000 Hz | fréquence du SOFA synthétique |
| Dimensions | `gen_sofa_synthetique.js` → `M, R, N` | 3 × 2 × 64 | positions × oreilles × échantillons |
| Positions des impulsions | `gen_sofa_synthetique.js` → `impulsion(...)` | échantillons 30/34 | ITD théorique = 4 échantillons = 83,33 µs |
| Amplitudes | idem | 0,5 / 0,75 / 1,0 | ILD théorique = ±6,02 dB — valeurs **exactement représentables en float32** |
| Fréquence cible | `test_reechantillonnage.js` → `SR_OUT` | 44 100 Hz | décimation testée (48 kHz → 44,1 kHz) |
| Tonalités de test | `test_reechantillonnage.js` → `L.sinus(...)` | 1, 5, 10, 25 kHz | fidélité en bande, bande de transition, rejet d'aliasing |
| Tolérances | 4ᵉ argument de chaque `verif(...)` | ex. ±0,5 µs, ±0,02 dB | marge acceptée entre attendu et obtenu |

Pour changer un scénario : modifier la constante puis relancer le script ; le JSON de `results/`
est écrasé. Les tolérances reflètent la spécification (ex. « ILD float16 inchangé à ±0,01 dB ») ;
les élargir revient à affaiblir le test.

### Reproductibilité

Les tests sont **déterministes** : aucun aléatoire, aucune horloge, aucun accès réseau.
Deux exécutions successives produisent des JSON identiques — les rapports archivés dans
`results/` correspondent donc exactement aux scripts de cette version (V2.0, 29/10/2026).

## Comment lire les résultats

### Format d'un rapport JSON (`results/resultats_*.json`)

Chaque rapport suit la même structure :

```json
{
  "test": "Nom de la campagne",
  "passes": 32,
  "echecs": 0,
  "mesures": { },
  "tableau": [ ],
  "cas": [
    {
      "nom": "classic v1 · fréquence d'échantillonnage",
      "attendu": 48000,
      "obtenu": 48000,
      "ok": true
    }
  ]
}
```

- `passes` / `echecs` : nombre de vérifications réussies / échouées (un banc sain affiche `echecs: 0`).
- `cas` : détail de chaque vérification — `nom` (ce qui est testé), `attendu` (valeur théorique),
  `obtenu` (valeur mesurée par le banc), `ok` (verdict).
- `mesures` (selon les tests) : mesures numériques brutes sans verdict (amplitudes, atténuations).
- `tableau` (test ITD/ILD) : récapitulatif par position — azimut, ITD en µs, ILD en dB.

### Méthode de lecture

1. **En-tête du rapport** : commencer par `passes` / `echecs`. Un banc sain affiche `echecs: 0`.
2. **En cas d'échec** : chercher dans `cas` les entrées `"ok": false` ; le champ `nom` dit ce qui
   est testé, `attendu` donne la théorie, `obtenu` la mesure.
3. **Tolérances** : chaque vérification admet soit une **égalité stricte** (bits, chaînes :
   `attendu === obtenu`), soit une **tolérance absolue** (ex. ITD ±0,5 µs) — la marge est
   indiquée dans le nom du cas.
4. **Mesures sans verdict** : les entrées préfixées « constat : » (ex. bande de transition à 10 kHz)
   sont des mesures documentées, toujours `ok: true` : elles comparent des méthodes entre elles
   plutôt qu'à une théorie.
5. **Interprétation transversale** : croiser les `tableau` et `mesures` des différents rapports avec
   `ANALYSE.md`, qui contient les tableaux de synthèse, les verdicts de cohérence (float16/32,
   sinc/linéaire, ITD/ILD) et l'explication de chaque chiffre.

### Unités et conventions

| Grandeur | Unité | Convention |
|---|---|---|
| ITD | µs | centroïde énergétique gauche − droite (positif = gauche en retard) |
| ILD | dB | 10·log₁₀(énergie gauche / énergie droite) (positif = gauche plus fort) |
| Atténuation | dB | 20·log₁₀(amplitude), 0 dB = fidélité parfaite |
| Codage | hexadécimal | bits IEEE-754 gros-boutistes : 8 chiffres (float32, ex. `3f800000`), 4 chiffres (float16, ex. `3c00`) |
| Azimuts | degrés | UI horaire : +90° = droite, 0° = avant, −90° = gauche |

Le fichier SOFA synthétique place les impulsions au centre de la fenêtre (échantillons 30/34)
pour isoler les effets du noyau de rééchantillonnage de la troncature aux bords.
