# Dracul — document de conception

> Document vivant. Les noms marqués *(provisoire)* sont des propositions à valider.

## Pitch

Un rogue-lite d'action en vue de dessus, inspiré de Hades, en plus modeste. On joue l'héritier de
Dracul qui tente de s'échapper du château de son père avant l'aube. Chaque mort ramène le héros
dans son cercueil, au fond des cryptes : il recommence la fuite, un peu plus fort à chaque fois.

## Piliers (ce qui doit rester vrai)

1. **Le combat est agréable avant tout.** Lisible, nerveux, chaque coup se sent.
2. **Le sang est la vie.** Les PV sont le *Sang* ; on ne se soigne qu'en mordant, donc en prenant
   un risque au corps à corps.
3. **Chaque fuite est différente.** Les salles et les Dons des Anciens changent d'une partie à l'autre.
4. **Petit mais fini.** Mieux vaut une région complète et polie que quatre régions bâclées.

## Ce que le jeu ne sera pas (anti-objectifs)

- Pas de 3D : de la 2D vue de dessus, avec un effet de profondeur (tri par Y, ombres) plus tard.
- Pas de système de dialogues ramifiés ni de doublage.
- Pas de multijoueur, pas de génération procédurale de salles : des arènes faites à la main, tirées au hasard.
- Pas de monétisation.

## Boucle de jeu

**Seconde à seconde :** se déplacer, frapper aux griffes, esquiver en brume, mordre pour reprendre du sang.

**Salle à salle :** entrer dans une arène, survivre aux vagues, choisir une récompense, passer la porte.

**Partie à partie :** mourir, se réveiller dans le cercueil, dépenser les Cendres en améliorations
permanentes, repartir.

- **Victoire :** vaincre Dracul sur les remparts avant l'aube.
- **Défaite :** Sang à 0, le héros retombe en poussière.
- **Durée d'une fuite complète visée :** 20 à 30 minutes ; une salle : 30 à 60 secondes.

## Contrôles

| Action | Clavier/souris | Rôle |
|---|---|---|
| Se déplacer | ZQSD, WASD ou flèches | Les deux dispositions (AZERTY/QWERTY) marchent sans réglage |
| Griffes | Clic gauche (ou J) | Attaque rapide en arc, vers la souris |
| Morsure | Clic droit (ou K) | Courte portée, lente, **soigne** ; temps de recharge |
| Brume | Espace (ou Maj) | Esquive : invulnérable pendant le dash |
| Nuée de chauves-souris | *(plus tard)* | Attaque à distance (l'équivalent du « Cast » de Hades) |

## Lore (vampires à la place des dieux)

- **Le héros** : *Mircea (provisoire)*, enfant de Dracul, qui refuse de régner sur la nuit éternelle.
- **Le père** : **Dracul**, boss final, l'équivalent de Hadès.
- **Le refuge** : le cercueil au fond des cryptes, l'équivalent de la Maison d'Hadès.
- **Les Anciens** (l'équivalent des dieux de l'Olympe) : les doyens des lignées vampiriques
  aident le héros en secret. Chacun offre des **Dons de sang** (les « bienfaits ») à son image.
  Exemples *(provisoire)* :

| Ancien | Lignée / inspiration | Thème des Dons |
|---|---|---|
| La Strigoaïca | Strigoi (folklore roumain) | Corbeaux, peur, ralentissement |
| Le Moroï | Moroi (folklore roumain) | Givre, brume, esquive |
| La Lamia | Lamia (mythe grec) | Serpents, poison sur la durée |
| L'Upir | Upir (folklore slave) | Saignement, vol de vie |

- **Méta-progression** : le **Miroir sans reflet** (les vampires n'en ont pas), où l'on dépense les
  **Cendres** récoltées pendant les fuites (l'équivalent du Miroir de la Nuit).

### Régions de la fuite *(provisoire)*

1. **Les Cryptes** — sous le château. Goules, rats, squelettes. Mini-boss : le Gardien des cercueils.
2. **L'Ossuaire** — galeries d'os. Ennemis qui reviennent à la vie s'ils ne sont pas mordus.
3. **Les Salles du château** — serviteurs, armures animées.
4. **Les Remparts** — l'aube approche. Boss final : Dracul.

## Étapes

| Étape | Contenu | Question à laquelle elle répond |
|---|---|---|
| **M0 — Prototype de combat** *(en cours)* | Une arène, griffes + morsure + brume, un type d'ennemi (goule), vagues, salles qui s'enchaînent, mort → recommencer | Le combat est-il agréable ? |
| **M1 — Une fuite** | Choix de 1 Don sur 3 après chaque salle, 3 types d'ennemis, région 1 complète (~8 salles) + mini-boss | La boucle de partie donne-t-elle envie de recommencer ? |
| **M2 — Méta et habillage** | Refuge, Cendres, Miroir sans reflet, premiers vrais graphismes et sons | Progresse-t-on d'une partie à l'autre ? |
| **M3 — Contenu** | Régions 2 à 4, Dracul | Le jeu tient-il sur une fuite complète ? |
| **M4 — Publication** | Build web sur itch.io | — |

### M0 : critères pour garder ou jeter (cf. skill `prototype-fast`)

- **Garder** si : esquiver puis mordre au bon moment est satisfaisant, et on a envie de refaire une salle.
- **Revoir** si : la morsure est inutile (trop risquée) ou obligatoire (seul moyen de gagner).
- Le code de M0 est **à garder** (pas jetable) : il servira de base à M1.

## Décisions

| Date | Décision | Pourquoi |
|---|---|---|
| 2026-10-15 | Phaser 4 + TypeScript + Vite | Jeu web : Claude peut le lancer et le voir (captures) dans n'importe quelle session ; publication itch.io directe |
| 2026-10-15 | 2D vue de dessus, profondeur simulée plus tard | Le plus simple pour un Hades-like modeste |
| 2026-10-15 | Graphismes de M0 dessinés par le code | Aucun asset à gérer tant que le combat n'est pas validé |
| 2026-10-15 | Textes du jeu en français, code en anglais | Public francophone ; code lisible par les outils |
| 2026-10-15 | Les ennemis ne blessent que pendant une attaque annoncée (préparation visible, puis ruée), jamais au simple contact ; frapper pendant la préparation l'interrompt | Sinon l'esquive n'a aucun sens et le combat devient une course aux PV |
