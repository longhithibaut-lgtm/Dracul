# Direction artistique

Tout le jeu est en **« grand pixel »** (le refuge, les cinq salles des fuites, la salle de torture d'entraînement) ;
la **« Nuit de sang »**, la direction précédente, est archivée en bas de page. Sections inspirées du modèle d'art bible de
[claude-code-game-studios](https://github.com/donchitos/claude-code-game-studios) (MIT) ; chaque règle cite une
décision ou une maquette validée.

## Direction en essai : « grand pixel » (2026-10-19)

**En une phrase** : grand pixel, réaliste, pas de contours, horreur crue et malsaine.

**Technique** (décisions du 2026-10-19 et 2026-10-20)
- Vue native 960×540 (affichée ×2 en 1080p). Dans le jeu, toute salle est vue ×2 (`ZOOM` de `src/dark.ts`), le
  héros et les ennemis de l'Ordre dessinés à l'échelle ½. Le refuge et les cinq salles des fuites sont des scènes 3D
  rendues hors ligne au pixel de la maquette (deux par pixel de salle) ; la salle de torture garde ses gros pixels,
  comme les goules (densités mêlées acceptées).
- Personnages d'environ 80 px, rendus hors ligne depuis des modèles 3D simples éclairés (ombres portées, occlusion
  ambiante, liseré froid de dos), puis réduits en pixels sur une palette malade (67 couleurs pour le héros). Aucun
  contour. Chaque animation est rendue depuis le modèle posé par quelques nombres (`tools/art/grand-hero.gen.mjs`).
- Lumière de la salle cuite à la construction (G-buffer, torches et lueurs fixes avec leurs ombres) ; un shader
  d'écran ajoute ce qui bouge (lanterne vert-jaune du héros, lanternes de l'Ordre vert sale) puis la post-production :
  vignette, tonalité filmique, étalonnage désaturé, grain, tramage ordonné, palette de 58 couleurs. Ce qui luit
  (yeux, flammes, effets) passe par-dessus, non éclairé. Aucune marque au sol, ligne ni icône n'annonce une attaque :
  seuls le corps de l'ennemi (pose, lumière qu'il porte) et le son la préviennent.

**Personnages** : le héros vampire validé (`docs/maquettes/grand-heros.png`, modèle `tools/art/maquettes/grand/hero.mjs`) :
mince, longs cheveux noirs, yeux de braise rouge, long manteau à doublure violette (sa signature), griffes nues,
lanterne tenue bas ; sa brume est une vapeur de sang caillé. Gestes lourds,
marche lente, les pieds tiennent au sol (course pilotée par la distance) ; 8 directions, recul et pas chassés quand
il regarde ailleurs que là où il va (`src/gait.ts`).

**Lieux** : le refuge validé (`docs/maquettes/refuge-*.png`, `refuge2-*.png`, plan dans `docs/lore.md`) ; la salle de
torture (`docs/maquettes/grand-ecran.png`, `src/torture.ts`) : pierre crasseuse, sang séché, torches mourantes, pendus,
cages, fosse aux corps ; la crypte (`tools/art/rooms/crypt.mjs`) : dalles crasseuses, médaillons gravés sous deux rais
de lune, cercueils moisis sur leurs socles, piliers à torche, braseros, bougies, ossuaire, os et vieux sang ; le cloître
sous l'Aube (`docs/maquettes/cloitre.png`, `tools/art/rooms/cloister.mjs`) : soleil sacré dur venu d'en haut à gauche,
ombres froides nettes, plus clair que les cryptes ; le soleil y est le danger, l'ombre l'abri ; la nef
(`tools/art/rooms/nave.mjs`) : tapis rouge pourri entre deux rangées de piliers brisés, rosaces sous la lune ;
l'ossuaire effondré (`ossuary.mjs`) : sol tombé dans le noir (parois à pic), tas d'os et de crânes ; la chapelle aux
vitraux (`chapel.mjs`) : l'Aube entre basse par les vitraux du mur ouest, rais dorés dans la poussière et vitraux
plombés posés au sol, qui brûlent ; bancs, autel à soleil doré, bénitier. La nécropole (`tools/art/rooms/necropolis.mjs`,
première zone ouverte, cuite par morceaux d'un écran) : caverne sous une voûte jamais vue, falaise nord, gouffre, terre
sombre semée d'os, allées de gravier, champs de croix et de stèles sur leurs buttes, mausolées, murs d'ossements au
sommet de crânes entassés, moignons de colonnes de roche, flaques de lune par les fissures de la voûte (froides, qui
ne brûlent pas) et la brèche où tombe l'Aube (dorée, qui brûle, liseré jaune) ; le camp de l'Ordre (tentes coniques,
bûcher, braseros, lanternes vert sale dont la flaque brûle) ; mêmes lumière, palette et post-production que les cryptes. Les catacombes (`tools/art/rooms/catacombs.mjs`, sous la nécropole, mêmes morceaux d'un écran) : roche creusée en lits, coups de pic en biais, suintements ; vue d'en haut, la roche est un noir à peine strié (son sommet), basse au bord sud des galeries pour ne jamais les cacher, haute là où sa face regarde la caméra ; faces d'ossuaire aux rangs de crânes, niches en arc aux crânes posés sur leur rebord, crânes tombés au pied ; sol de poussière d'os, sentier plus clair des patrouilles, flaques suintantes ; peu de lumière : bougies des patrouilles dans une niche sur trois, la lune par les puits (le fond du puits, la grande croisée, les eaux noires), braseros et lanterne de l'Ordre aux croisées et à la prison, pourriture phosphorescente vert pâle au nid, aux rats, dans la galerie basse ; le nid (amas de restes couvert de crânes, cadavres rongés, sang traîné), le lac noir, la prison dallée au médaillon gravé et le reliquaire de Vesna (cage de fer, coffre doré, cire rouge, signe du Rat en argent). Dans la nécropole, le puits (margelle ouverte, échelons, treuil) et le caveau (mausolée à pyramide de pierre, grille).

**Maquettes** (`docs/maquettes/`, générateurs dans `tools/art/maquettes/`)

| Fichier | Statut |
|---|---|
| `grand-heros.png`, `grand-ecran.png` | direction retenue (essai) |
| `refuge-*.png`, `refuge2-*.png` | refuge validé |
| `a-encre-gothique.png`, `b-crasse-et-faim.png`, `c-clair-obscur.png` | pistes écartées (la B a donné l'éclairage) |
| `fx-a-sang*.png` | effets de combat retenus (sang artériel, gouttes, caillots ; `src/fx-blood.ts`) |
| `fx-b-*.png`, `fx-c-*.png` | pistes d'effets écartées (ombre, cendre) |
| `cloitre.png` | cloître validé (« plus clair dehors, moins d'arbres ») |
| `ennemis-*.png` | ennemis retenus (voir `docs/decisions.md`) |

**À décider avec l'utilisateur** (aucune règle tant que ce n'est pas tranché) : palette commune des salles, HUD et
police à 960×540.

## Archive : « Nuit de sang » (remplacée le 2026-10-21)

La direction précédente (Hyper Light Drifter, 480×270 affiché ×4, palette violette, sol cobalt, abîme magenta) n'est
plus celle d'aucune salle ni d'aucun personnage : salles peintes, ancien héros, goules en robe, arbalétrier et effets
qui la suivaient ont été supprimés (`docs/decisions.md`, 2026-10-21). Restent à ses couleurs le HUD, la police
(`src/font.ts`), les icônes des Dons du Rat et le panneau d'entraînement ; sa palette et ses règles restent lisibles
dans l'historique de ce fichier.
