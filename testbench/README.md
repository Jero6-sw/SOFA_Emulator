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
node test_itd_ild.js              # → results/resultats_itd_ild.json
```

Chaque script affiche `N réussites / M échecs` et écrit son rapport JSON dans `results/`.

## Convention des mesures

- **ITD** (Interaural Time Difference) : différence des retards de centroïde énergétique gauche − droite, en µs (positif = gauche en retard).
- **ILD** (Interaural Level Difference) : 10·log₁₀(énergie gauche / énergie droite), en dB (positif = gauche plus fort).
- Le fichier SOFA synthétique place les impulsions au centre de la fenêtre (échantillons 30/34) pour isoler les effets du noyau de rééchantillonnage de la troncature aux bords.
