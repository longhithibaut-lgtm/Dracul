# Direction artistique

Deux directions coexistent. La **« grand pixel »** est en essai (salle de torture) et doit remplacer l'autre ; la
**« Nuit de sang »**, la direction précédente, reste celle de toutes les autres salles tant qu'elles ne sont pas
converties. Sections inspirées du modèle d'art bible de
[claude-code-game-studios](https://github.com/donchitos/claude-code-game-studios) (MIT) ; chaque règle cite une
décision ou une maquette validée.

## Direction en essai : « grand pixel » (2026-10-19)

**En une phrase** : grand pixel, réaliste, pas de contours, horreur crue et malsaine.

**Technique** (décisions du 2026-10-19 et 2026-10-20)
- Vue native 960×540 (affichée ×2 en 1080p). Dans le jeu aujourd'hui, seule la salle de torture (essai) passe en ×2
  (`skin.zoom` de `src/dark.ts`), le héros dessiné à l'échelle ½ ; densités de pixels mêlées acceptées.
- Personnages d'environ 80 px, rendus hors ligne depuis des modèles 3D simples éclairés (ombres portées, occlusion
  ambiante, liseré froid de dos), puis réduits en pixels sur une palette malade (67 couleurs pour le héros). Aucun
  contour. Chaque animation est rendue depuis le modèle posé par quelques nombres (`tools/art/grand-hero.gen.mjs`).
- Lumière de la salle cuite à la construction (G-buffer, torches et lueurs fixes avec leurs ombres) ; un shader
  d'écran ajoute ce qui bouge (lanterne vert-jaune du héros, lanternes de l'Ordre vert sale) puis la post-production :
  vignette, tonalité filmique, étalonnage désaturé, grain, tramage ordonné, palette de 58 couleurs. Ce qui luit ou
  prévient (yeux, flammes, ligne de visée rouge, effets) passe par-dessus, non éclairé.

**Personnages** : le héros vampire validé (`docs/maquettes/grand-heros.png`, modèle `tools/art/maquettes/grand/hero.mjs`) :
mince, longs cheveux noirs, yeux de braise rouge, long manteau à doublure violette (sa signature), griffes nues,
lanterne tenue bas ; sa brume est une brume de lune. Gestes lourds,
marche lente, les pieds tiennent au sol (course pilotée par la distance).

**Lieux** : le refuge validé (`docs/maquettes/refuge-*.png`, `refuge2-*.png`, plan dans `docs/lore.md`) ; la salle de
torture (`docs/maquettes/grand-ecran.png`, `src/torture.ts`) : pierre crasseuse, sang séché, torches mourantes, pendus,
cages, fosse aux corps.

**Maquettes** (`docs/maquettes/`, générateurs dans `tools/art/maquettes/`)

| Fichier | Statut |
|---|---|
| `grand-heros.png`, `grand-ecran.png` | direction retenue (essai) |
| `refuge-*.png`, `refuge2-*.png` | refuge validé |
| `a-encre-gothique.png`, `b-crasse-et-faim.png`, `c-clair-obscur.png` | pistes écartées (la B a donné l'éclairage) |
| `cloitre.png`, `ennemis-*.png` | archivées, pas encore de décision |

**À décider avec l'utilisateur** (aucune règle tant que ce n'est pas tranché) : palette commune des salles, ennemis
dans cette direction, HUD et police à 960×540, conversion des autres salles.

## Direction précédente : « Nuit de sang » (toutes les autres salles)

Référence : Hyper Light Drifter, sauf pour les salles : leur barre est la crypte validée par l'utilisateur
([references/salle-crypte.png](references/salle-crypte.png)). Une nouvelle salle doit l'égaler, pas battre Hyper Light Drifter. Résolution native 480×270, affichée ×4 en 1080p (`pixelArt: true`) ; sur un écran d'une autre forme, la vue la suit (une boîte de 480×270 le long de son grand côté, l'autre côté agrandi, debout aussi).

### Palette (base commune, à étendre avec parcimonie)

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
| Abîme (hors des murs, au fond des fosses de l'ossuaire) | `#1f0520` `#3d0a3a` `#5e1256` |
| Robe des serviteurs | `#33102a` `#521030` `#7a1a3e` `#b03a5e` |
| Ordre (humains) : or, tabard, acier, peau, bois | `#ffd66e` `#d9982e` `#8c5a1e` · `#fbf2dc` `#d9c7a0` `#9c8463` · `#e4eaf0` `#a0aabb` `#5a6176` · `#e9b78e` `#b57a52` · `#a66a3a` `#63391f` `#3c2418` |
| Ordre / lumière sacrée | `#fff6d8` `#ffd75e` `#c8902a` `#7a4a1c` (or, du blanc au bronze) ; au sol : couche multiplicative `#ff9830` (absorbe le bleu) puis or additif, en 3 paliers nets à bord jaune franc |
| Maison du Rat (Vesna la Grise) : argent, gris, gris sombre, sur le sang et la nuit des vampires | `#d4cdd2` `#948a91` `#574e57` |
| Peste (Dons du Rat) : vert-de-gris maladif | `#c2cc8f` `#86935e` `#4f5a3a` |
| Police (`src/font.ts`) : pixel, proportionnelle, capitales 7 px, minuscules 5 px + 2 px de jambage, accents français ; jamais mise à l'échelle | texte `#e8dcc8` (titres) `#b7a58f` (corps) `#d4cdd2` (Maison du Rat), ombre `#0b0710` |

### Règles

- Pixels natifs uniquement : pas de mise à l'échelle non entière, pas d'anti-crénelage, pas de rotation de sprites pixel art.
- Aplats et 2 à 4 tons par matière, lumière venant d'en haut à gauche. Pas de contour noir systématique.
- Silhouettes lisibles d'abord : un personnage doit se reconnaître en ombre chinoise.
- Chaque personnage a une ombre portée (ellipse sombre) au sol.
- Les lueurs vives (rose, sang clair, sarcelle) sont réservées à ce qui compte : coups, dangers, interactions.
- Lore non décidé : aucun texte d'histoire, noms provisoires.
