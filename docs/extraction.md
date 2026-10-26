# Dracul : direction « extraction × ARPG » (document de travail)

Statut : **direction validée dans ses grandes lignes ; personnages à écrire ensemble**. Prototype codé : passe 1 (la boucle : anneaux, ennemis placés, sang porté, bassin, sauvegarde) et passe 2 (la battue, le Rongé et sa boutique) ; `docs/decisions.md` 2026-10-23. À jouer : protocole du §12. Les points marqués *(à valider)* touchent au
lore (`docs/lore.md`) ou sont des choix ouverts.

## 1. L'idée en une phrase

Le Sans-Maison part du refuge en expédition dans un monde souterrain presque ouvert, tue, pille et explore, puis doit
**revenir à pied jusqu'au refuge** avec son butin. S'il meurt en route, il **perd tout ce qu'il porte**. Ce qu'il
rapporte (sang, objets) sert à améliorer le refuge et le héros.

## 2. Choix déjà faits par l'utilisateur

| Sujet | Choix |
|---|---|
| Mort en expédition | Il perd **tout ce qu'il porte** (sang et objets). Il se reforme dans son cercueil. |
| Retour | Il faut **revenir jusqu'au refuge**, quand on veut. Seuls le danger et la vie restante poussent à rentrer. |
| Monde | **Fait main**, une seule carte, tout accessible, de plus en plus dur en s'éloignant. |
| Progression | **Objets** trouvés et rapportés + **améliorations du refuge** payées en sang. |
| Raccourcis | **À ouvrir**, comme Dark Souls : ils restent ouverts pour toujours, le monde se replie vers le refuge. |
| Ennemis | Ils **reviennent à chaque expédition**. Boss et lieux nettoyés restent nettoyés. |
| Donneurs de quêtes | Les **chefs des maisons**, des **vampires sans maison**, des **humains**. |
| Méthode | **D'abord ce document**, puis un prototype. |

## 3. La boucle

1. **Au refuge** : dépenser le sang (améliorations), s'équiper (objets rapportés), prendre ou rendre des quêtes.
2. **Sortir** par l'escalier de la grande salle.
3. **Explorer** : combats, lieux à fouiller, coffres, quêtes, raccourcis à ouvrir.
4. **Décider** quand rentrer : la vie baisse, le sac se remplit, la zone devient trop dure.
5. **Revenir** au refuge. Tout ce qui est porté est **mis à l'abri** : sang versé au bassin, objets au coffre.
6. **Mourir** = cendres ; tout le butin porté est perdu ; on se reforme au cercueil.

La tension vient de l'écart entre ce qu'on porte et le chemin du retour.

## 4. Le monde

### Pourquoi souterrain
Le lore dit que l'Aube éternelle brûle tout vampire à la surface. Le monde est donc surtout **sous terre** :
nécropole, catacombes, cryptes, égouts, caves. La **surface** existe en morceaux (cloîtres, cours, parvis) : ce sont
des zones de lumière, très dangereuses, qu'on traverse par l'ombre. C'est notre mécanique ombre/lumière, à
l'échelle du monde.

### Zones (proposition, *à valider*)
Du plus proche au plus lointain du refuge, donc du plus facile au plus dur :

| Anneau | Zone | Ambiance | Ennemis dominants |
|---|---|---|---|
| 0 | Le refuge | sûr | aucun |
| 1 | La nécropole | tombes, ossuaires, goules | goules, Amas |
| 2 | Les catacombes | galeries, rats, la cheffe du Rat prisonnière | goules, chiens, pénitents |
| 3 | La crypte de l'Ordre | gardée, lumière des lanternes | arbalétriers, prêtres, purificateurs |
| 4 | Le cloître et le bourg | surface, soleil de l'Aube | inquisiteurs, sonneurs, chiens |
| 5 | La cathédrale et le clocher | le cœur de l'Ordre | tout, plus le Grand Inquisiteur |

Les quatre régions du lore deviennent des **zones du même monde**, reliées entre elles, au lieu de fuites séparées.
Les chefs restent prisonniers chacun dans sa zone, gardés par un mini-boss (le Bourreau garde la crypte).

### Forme du monde *(validé)*
Pas une seule carte continue : des **salles** (de la taille des salles actuelles) et de **grands espaces ouverts**
avec des **points d'intérêt** (une crypte à forcer, un reliquaire, un campement de l'Ordre, un trésor, un raccourci),
reliés par des passages. Les grands espaces donnent la sensation de monde ; les salles gardent le poids des fichiers
raisonnable (une carte continue cuite au pixel dépasserait les 150 Mo).

### Lieux
Chaque zone a des **lieux** où l'on entre : une crypte scellée, une chapelle, une cave, une salle de torture… Ce
sont des intérieurs faits à la main, dans le style des salles actuelles. **On réutilise les salles déjà peintes**
(crypte, nef, ossuaire, chapelle, cloître, salle de torture) comme premiers lieux.

### Raccourcis
Portes verrouillées d'un seul côté, échelles à descendre, grilles à lever, puits. Ouvert une fois, ouvert pour
toujours (sauvegardé). C'est ce qui rend les zones lointaines accessibles sans tout retraverser.

### La nécropole, première zone ouverte *(demande de l'utilisateur, 2026-10-26)*
« Un monde plus ouvert, des cartes clairement agrandies, avec des raccourcis. » La nécropole est **une seule grande
caverne d'environ 8 × 5 écrans** (3840 × 1350 px de salle) autour du refuge, où l'on marche librement dans toutes les
directions ; les salles déjà peintes deviennent des **intérieurs** dont on passe la porte. Plan (x vers l'est) :

```
 N  roche ══[R]═══════════════════════╗chaussée╔═══(b)═══════════════════════════════════(B)═════════════
    escalier du refuge      ║  gouffre ║[A]grille  nef▣   fosses   ░brèche de░  galerie    chapelle▣
    parvis      tombes      ║          ║  cour   ossements         ░ l'Aube  ░  camp de l'Ordre
    tombes crypte▣ tombes   ║          ║ ═══ mur d'os ══════════  ║        ║ (tentes, bûcher,
    tombes  reliquaire      ║          ║  ossuaire▣  éboulis      ║        ║  braseros, lanternes)
    tombes   tombes         ║   pont ══╬═ fosses  tombes          ║        ║        tombes
 S  roche ════════════════════════════════════════════════════════════════════════════════════════════
      proche (anneau 1)                milieu (anneau 2)                     loin (anneau 3)
```

- **Le proche** (ouest, goules) : l'escalier du refuge débouche au nord-ouest sur un parvis dallé entre deux braseros ;
  au sud, le **champ des tombes** (croix, stèles, buttes, sarcophages, petits mausolées) traversé d'allées de gravier,
  la **porte de la crypte**, un reliquaire à fouiller, des puits de lune.
- **Le gouffre** coupe la caverne du nord au sud. On le passe par **le pont** (tout au sud) ; au nord, une **chaussée**
  en ruine mène à une petite cour fermée par **la grille (raccourci A)**, qui ne se lève que du côté du milieu.
- **Le milieu** (pénitents, chiens, prêtres) : un long **mur d'ossements** le coupe en deux bandes, ouvert seulement à
  l'est ; au sud, la **porte de l'ossuaire** (dans le mur), un éboulis de galerie effondrée, des tombes ouvertes ; au
  nord, la **porte de la nef**, un champ de fosses, un puits de lune, et une **bouche murée** de la galerie (b).
- **La brèche de l'Aube** : le mur d'os entre le milieu et le loin s'est effondré sous un trou de la voûte qui donne
  sur la surface ; l'Aube y tombe et **brûle** ; on la traverse vite, ou par l'ombre des piliers brisés.
- **Le loin** (est, l'Ordre) : le **camp de l'Ordre** (tentes, palissade, bûcher, braseros, lanternes, coffre à
  fouiller), la **porte de la chapelle** (au fond de la chapelle, ses herses mènent au cloître, la surface sous l'Aube,
  comme avant), un reliquaire ; sous la falaise nord, **la porte scellée (raccourci B)** : l'autre bouche de la galerie
  qui court sous la falaise jusqu'au milieu, levée seulement de ce côté-ci ; ses deux bouches s'ouvrent ensemble.
- **Chemins** (mesurés sur la grille de marche, de la porte de la chapelle à l'escalier du refuge) : sans raccourci,
  pont et brèche, environ 4 100 px (une minute de marche) ; **A** ouvert, 3 400 px ; **A et B**, 2 000 px (la galerie se
  passe d'un fondu au noir, d'une bouche à l'autre). B seul ne sert qu'à qui vient déjà de la bande nord du milieu.
- **Ennemis** : des groupes placés par secteur (proche nord et sud, milieu nord et sud, loin ouest, camp, est),
  tirés dans la réserve de l'anneau du secteur ; les intérieurs gardent leur anneau (crypte 1, nef et ossuaire 2,
  chapelle 3, cloître 4). **La battue** se poste sur le chemin du retour à travers la caverne (par la galerie si elle
  est ouverte), entre le héros et l'escalier du refuge, hors de vue (à 300 px au moins) ; une meute sur deux tient
  l'escalier.
- **Technique** : la caverne est cuite hors ligne comme les salles, en **morceaux d'un écran** (480 × 270) chargés
  autour de la caméra et déchargés derrière elle ; murs, fosses et accessoires sont des données.

## 5. Ennemis et niveaux cachés

### L'odeur du sang *(validé)*
Le sang porté **attire l'Ordre** : plus on en porte, plus une **battue** (meute de chiens, puis un Inquisiteur et
ses chiens) se met en chasse et vient se placer **entre le héros et le refuge**, dans un espace déjà traversé. Le
retour devient la partie la plus tendue, au lieu d'une marche vide. Seuils et composition dans `T` (premier jet : une
meute tous les 50 sang portés). Les ennemis tués **restent morts pendant l'expédition** ; seule la battue revient.

- Chaque ennemi a un **niveau** qui n'est **jamais affiché**. On le devine à sa zone, à sa tenue, à son comportement.
- Le niveau change les PV, les dégâts, la vitesse de réaction et parfois une variante (un pénitent aguerri porte
  une croix cloutée).
- Un ennemi trop fort pour le héros doit se **voir** avant le combat : plus grand, mieux armé, une autre couleur de
  tabard. C'est un jeu d'horreur : on doit pouvoir fuir.
- Les ennemis **reviennent à chaque expédition**. Les mini-boss vaincus et les lieux vidés restent vidés.
- On garde les dix ennemis actuels et leur combat (préparations lisibles au corps, aucune indication au sol).

## 6. Butin

### Le sang
- **La monnaie** : tuer, finir une quête, ouvrir un trésor donne du sang.
- Le sang **porté** est perdu à la mort. Il n'est gagné que **versé au bassin** du refuge.
- Le sang de vie (les gouttes du HUD) et le sang récolté sont **deux choses différentes** : on ne paie pas avec sa
  vie *(validé)*.

### Les objets
Proposition de trois familles, lisibles et peu nombreuses :

| Famille | Emplacements | Exemples d'effet |
|---|---|---|
| **Armes** (griffes, dagues, crocs d'acier) | 1 | change les dégâts, la portée, l'enchaînement |
| **Reliques** | 2 | effets actifs ou passifs (la Peste, les rats, la brume) |
| **Talismans** | 3 | bonus de stats (vie, vitesse, recharge, résistance à la lumière) |

- Raretés : commun, rare, épique (déjà en place pour les Dons).
- Les objets trouvés dans une zone lointaine sont meilleurs.
- On équipe au refuge **et** sur le terrain. Ce qui est trouvé en expédition est perdu à la mort tant qu'il n'est
  pas rapporté ; **un objet rapporté au refuge est acquis pour toujours**, même équipé et même si l'on meurt ensuite
  avec *(validé ; pas d'emplacement « assuré »)*.
- **Le sac est limité** : il faut choisir ce qu'on rapporte *(validé ; la taille s'améliore au refuge)*.

### Ce que deviennent les Dons et les Pactes
- Les **Dons du Rat** deviennent des **pouvoirs débloqués au refuge** auprès de Vesna, une fois libérée (Peste, rats,
  la Nuée). Ils sont permanents et se choisissent avant de partir, dans des emplacements comme aujourd'hui.
- Les **Pactes de sang** restent : ce sont des reliques maudites trouvées dans le monde, très fortes avec un prix.
- La rareté passe des Dons aux objets.

### Le soin
- **La morsure n'est plus là au départ** : elle devient une **amélioration** à débloquer au refuge *(validé, maintenu
  après la revue)*. Conséquence à coder : tant qu'elle n'est pas débloquée, un humain affaibli **meurt normalement**
  (plus de mise à genoux qui n'attend que la morsure, `wound()` dans `src/logic.ts`).
- Les autres soins existent mais sont **très rares** (fioles, autels, quêtes) *(validé)*. La vie est donc la
  ressource qui décide du retour.

## 7. Le refuge

### Le marchand du refuge *(validé : le Rongé)*
Il est là dès la première nuit, avant tout chef libéré. Proposition : **le Rongé** (nom provisoire), un vampire sans
maison comme le héros, qui a trouvé la chapelle oubliée avant lui. Affamé depuis des années, il est **à moitié
devenu goule** : le sang qu'on lui verse le garde lucide. Il fouille les catacombes la nuit, revend ce qu'il trouve
contre du sang et se souvient, quand il a assez bu, de techniques oubliées (les améliorations du héros). S'il reste
longtemps sans sang, il redevient bête un temps (boutique fermée, il grogne dans sa niche). Il explique le bassin :
c'est lui qui boit ce qu'on y verse.

### Les marchands des zones *(à valider)*
Environ **un par zone**, chacun avec sa façon de commercer. Ils prennent le **sang porté** : le dépenser sur place
le met à l'abri (il ne peut plus être perdu), mais il n'atteint jamais le bassin. Pistes : un **receleur** humain
qui vend des reliques volées à l'Ordre, un **autel** où le Rongé a caché des réserves, un **colporteur** qui change de
zone d'une nuit à l'autre.

- **Le bassin de sang** : on y verse le sang rapporté. C'est la banque.
- **Le coffre** : les objets rapportés.
- **Les améliorations** payées en sang :
  - **le héros** : la morsure, vie maximum, recharge de la brume, dégâts de base, taille du sac ;
  - **le refuge** : salles qui se réparent et ouvrent des services (atelier pour améliorer un objet, autel des
    pouvoirs, carte des raccourcis) ;
  - **les maisons** : chaque chef libéré ouvre sa salle et ses améliorations propres (Vesna : rats et Peste ;
    Séverin : esquive ; Magda : arène de défis ; Lucian : la carte).
- Le refuge **change à l'œil** quand on l'améliore : bougies, réparations, chefs présents.

## 8. Quêtes et personnages

| Qui | Quoi | Lore |
|---|---|---|
| Les **chefs** libérés | quêtes de leur maison, au refuge | déjà dans le lore |
| Des **vampires sans maison** | cachés dans le monde ; on peut les rallier au refuge | *nouveau, à écrire ensemble* |
| Des **humains** (prisonniers, déserteurs, villageois) | marchandent avec un vampire, par peur ou intérêt | *nouveau, à écrire ensemble* |

Types de quêtes simples, faciles à faire et à combiner :
- **Rapporter** un objet d'un lieu (et le rapporter vivant au refuge : c'est de l'extraction).
- **Tuer** une cible précise (un inquisiteur nommé, un Amas).
- **Escorter** ou **libérer** quelqu'un jusqu'au refuge.
- **Ouvrir** un passage ou un raccourci.

Aucun personnage n'est écrit tant que l'utilisateur ne l'a pas validé.

## 9. Ce qu'on garde, ce qui change

| On garde | Change | Disparaît |
|---|---|---|
| Le combat, le héros et ses animations | Les salles deviennent des lieux d'un même monde | Les fuites en salles enchaînées |
| Les 10 ennemis | La caméra suit le héros sur une grande carte | Les vagues par salle (remplacées par des groupes placés) |
| Le style « grand pixel », la lumière qui brûle | Le sang devient monnaie et butin | Les Dons tirés en fin de salle, les deux portes |
| Le refuge et ses salles | Les Dons deviennent des pouvoirs du refuge | |
| Les Pactes | Les Pactes deviennent des reliques | |

**Nouveau et lourd** :
- une **sauvegarde** (raccourcis ouverts, sang au bassin, coffre, améliorations, quêtes) ;
- une **grande carte** souterraine en morceaux reliés, chargés au fur et à mesure ;
- un **inventaire** et un écran d'équipement ;
- les **niveaux** d'ennemis ;
- le **système de quêtes** et des PNJ.

## 10. Plan proposé

1. **Valider ce document** (sections marquées *à valider*).
2. **Prototype** (« est-ce que c'est fun ? ») :
   - le refuge, plus une nécropole autour (environ 4 écrans), un lieu à l'intérieur (la crypte actuelle) et un
     raccourci ;
   - des goules de deux niveaux et des arbalétriers ;
   - du sang à ramasser, qu'on perd en mourant et qu'on verse au bassin en rentrant ;
   - une amélioration du héros au refuge ;
   - une sauvegarde minimale.
   On garde le mode en salles actuel à côté pour comparer.
3. Si c'est bon : objets et inventaire, puis zones 2 et 3, puis quêtes et PNJ, puis le reste.

Ordre de grandeur : le prototype vaut à peu près 2 à 3 passes d'agent (comme le refuge ou les salles cuites). Le jeu
complet, plusieurs dizaines.

## 11. Questions ouvertes

1. ~~Sang de vie et sang récolté~~ : deux réserves séparées.
2. ~~Emplacement assuré~~ : non ; ce qui est rapporté est acquis pour toujours.
3. ~~Sac~~ : limité.
4. ~~Soin~~ : la morsure devient une amélioration ; autres soins très rares.
5. ~~Les zones~~ : validées telles quelles pour l'instant ; on agrandira peut-être plus tard.
6. Les vampires sans maison et les humains : qui sont-ils, que veulent-ils ?
7. ~~La fin~~ : elle peut changer ; à réécrire plus tard avec l'utilisateur.

## 12. Revue du juge (2026-10-21)

Note **5,5/10**, « on y va, avec des changements ». Retenu par l'utilisateur : **l'odeur du sang** et **salles +
grands espaces ouverts à points d'intérêt** (ci-dessus). Maintenu contre l'avis du juge : **la morsure retirée au
départ**. Prototype : **pas encore**.

Points du juge encore ouverts, à trancher :
1. **Farm de la zone 1** *(validé)* : rendement du sang croissant avec l'éloignement (×1, ×3, ×8, ×20), coûts d'amélioration
   géométriques, un seul raccourci par zone qui n'en court-circuite pas l'intérieur.
2. **Variété entre expéditions** *(validé)* : composition des groupes et emplacements du butin tirés au hasard, un événement par
   nuit, un Inquisiteur qui rôde dès la zone 3 *(à valider)*.
3. **Pouvoir fuir** *(validé)* : le chien (105 px/s) est plus rapide que le héros (66 px/s) ; les ennemis abandonnent après 4 s
   sans le voir, ne passent pas les portes (les chiens une salle au plus), l'ombre réduit leur détection.
4. ~~**Objets = les Dons**~~ *(refusé : les objets restent une famille à part)* : les 17 Dons existants comme reliques trouvées, un doublon rapporté monte la rareté (raison
   de faire la 50e expédition) ; pas d'armes ni de talismans au début.
5. ~~**Mourir loin** (les cendres)~~ *(refusé : à la mort, tout le butin porté est perdu, sans seconde chance)* : le sang porté reste en cendres là où l'on meurt, une seule chance de le reprendre *(à valider)* ;
   un raccourci tôt dans chaque zone.
6. **Réduire le chantier** : pas de niveaux d'ennemis redessinés (une marque d'élite recolorée), pas d'écran
   d'inventaire (échange en une touche, sac en icônes dans le HUD), pas d'armes qui changent les animations, quêtes
   plus tard ; sauvegarde = un petit JSON versionné dans le navigateur.
7. **Contradictions du lore** *(réponse : un marchand est là dès le départ, voir §7 ; puis environ un par zone)* : Vesna est la marchande du refuge mais prisonnière en zone 2 (qui vend avant sa
   libération ?) ; le lore dit que ses Dons aident dès le départ, en secret.
8. **Questions** *(réponses : la durée dépend des améliorations et des choix du joueur ; la fuite façon Hades est
   abandonnée : Dons tirés en fin de salle, deux portes et vagues disparaîtront avec le prototype)* : durée visée d'une expédition (5 ou 20 min) ; que garde-t-on de la fuite façon Hades (Dons tirés,
   deux portes) ; que fait-on une fois tout libéré (doublons, nuits plus dures) ?

Prototype proposé par le juge (zéro dessin neuf) : le refuge et les 5 salles peintes reliées en profondeur, sang porté
au rendement croissant, battue, une amélioration, sauvegarde ; critères : sur 10 expéditions, au moins 4 retours
volontaires, au moins 2 morts « j'aurais dû rentrer », envie spontanée d'en refaire une.
