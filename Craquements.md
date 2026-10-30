Bonne question — l'interpolation à 3 points ne protège pas des craquements, car elle est **spatiale, pas temporelle**. Voici pourquoi ça craque :

## Pourquoi l'interpolation ne suffit pas

L'interpolation pondère les **3 positions mesurées les plus proches** pour fabriquer un HRIR intermédiaire : elle rend le filtre « continu sur la grille SOFA » (les grilles sont souvent espacées de 5 à 15° !). Mais elle ne dit **rien de la continuité du signal audio dans le temps** : à chaque tick de rotation, le HRIR change d'un coup, et le son en cours traverse un filtre différent.

## Les vraies causes des craquements, par ordre de probabilité

1. **Bascule instantanée du noyau du convolveur.** Dans le code, la rotation appelle `sync()` → `applyHRIR()`, qui remplace `conv.buffer` d'un bloc. Le `ConvolverNode` passe au nouveau filtre au prochain quantum de rendu (128 échantillons), **sans transition** : la sortie « saute » d'un rendu à l'autre → clic.

2. **Discontinuité de phase / ITD.** Le HRIR est dominé par une impulsion directe dont la position dépend de l'azimut (l'ITD fait jusqu'à ~600 µs). Entre deux pas de 2°, cette impulsion se **décale de quelques échantillons** : c'est comme si le signal était brusquement re-timé → créneau dans l'onde, très audible sur les transitoires.

3. **Saut de niveau.** Chaque HRIR est normalisé séparément (énergie unité), mais le contenu basse fréquence / les résonances varient avec la position : le niveau perçu change d'un pas à l'autre.

4. **Grille mesurée quantifiée.** Même interpolée, la position tourne par pas de 2° toutes les 100 ms (20°/s). Si la grille SOFA est grossière, les poids des 3 points voisins changent brutalement d'un pas à l'autre (la mesure la plus proche change d'identité) → le HRIR « saute » de temps en temps.

L'oreille est très sensible à ces discontinuités : un saut même de quelques échantillons sur l'impulsion directe est un vrai « tick ».

## Comment l'éliminer

La solution standard est le **cross-fade entre HRIR successifs** : deux convolveurs en parallèle par source (ancien HRIR + nouveau HRIR), avec rampes de gain croisées de ~20–30 ms (`gain.linearRampToValueAtTime` ou `setTargetAtTime`). La rotation devient inaudible même à 20°/s. Variantes plus légères : lisser les coefficients eux-mêmes dans le temps (filtrage du pas d'azimut), ou ralentir la rotation.

Voulez-vous que j'implémente le cross-fade à deux convolveurs (V2.2) dans le canvas et que je le publie ?
