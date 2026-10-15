# Direction artistique

Référence : Hyper Light Drifter, sauf pour les salles : leur barre est la crypte validée par l'utilisateur
([references/salle-crypte.png](references/salle-crypte.png)). Une nouvelle salle doit l'égaler, pas battre Hyper Light Drifter. Résolution native 480×270, affichée ×4 en 1080p (`pixelArt: true`).

## Palette « Nuit de sang » (base commune, à étendre avec parcimonie)

| Rôle | Couleurs |
|---|---|
| Vide, ombres | `#0b0710` `#1c1029` `#2e1838` |
| Pierre | `#3b2a4a` `#5a4468` `#8a6f8f` |
| Os, peau pâle | `#e8dcc8` `#b7a58f` |
| Sang | `#5c0a1c` `#a3122f` `#e0284a` |
| Lueurs (magie, coups) | `#ff4f8b` `#8f195e` `#ffe4ee` (cœur blanc des coups) |
| Lune (accent froid) | `#1f4a5a` `#3fa7a3` `#8ff0dc` |
| Bougies, feu | `#ffb347` |
| Murs de la crypte | `#2b1631` `#4a1d3c` `#6e2d4f` |
| Sol (dalles cobalt) | `#1b2b60` `#21346f` `#293e80` |
| Abîme hors des murs | `#1f0520` `#3d0a3a` `#5e1256` |
| Robe des serviteurs | `#33102a` `#521030` `#7a1a3e` `#b03a5e` |
| Ordre (humains) : or, tabard, acier, peau, bois | `#ffd66e` `#d9982e` `#8c5a1e` · `#fbf2dc` `#d9c7a0` `#9c8463` · `#e4eaf0` `#a0aabb` `#5a6176` · `#e9b78e` `#b57a52` · `#a66a3a` `#63391f` `#3c2418` |
| Ordre / lumière sacrée | `#fff6d8` `#ffd75e` `#c8902a` `#7a4a1c` (or, du blanc au bronze) ; au sol : couche multiplicative `#ff9830` (absorbe le bleu) puis or additif, en 3 paliers nets à bord jaune franc |
| Maison du Rat (Vesna la Grise) : argent, gris, gris sombre, sur le sang et la nuit des vampires | `#d4cdd2` `#948a91` `#574e57` |
| Peste (Griffes pestilentes) : vert-de-gris maladif | `#c2cc8f` `#86935e` `#4f5a3a` |
| Police (`src/font.ts`) : pixel, proportionnelle, capitales 7 px, minuscules 5 px + 2 px de jambage, accents français ; jamais mise à l'échelle | texte `#e8dcc8` (titres) `#b7a58f` (corps) `#d4cdd2` (Maison du Rat), ombre `#0b0710` |

## Règles

- Pixels natifs uniquement : pas de mise à l'échelle non entière, pas d'anti-crénelage, pas de rotation de sprites pixel art.
- Aplats et 2 à 4 tons par matière, lumière venant d'en haut à gauche. Pas de contour noir systématique.
- Silhouettes lisibles d'abord : un personnage doit se reconnaître en ombre chinoise.
- Chaque personnage a une ombre portée (ellipse sombre) au sol.
- Les lueurs vives (rose, sang clair, sarcelle) sont réservées à ce qui compte : coups, dangers, interactions.
- Lore non décidé : aucun texte d'histoire, noms provisoires.
