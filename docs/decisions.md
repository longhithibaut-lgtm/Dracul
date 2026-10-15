# Journal des décisions

Une ligne par décision, la plus récente en bas. On ne réécrit pas l'histoire : une décision annulée garde sa ligne,
et la nouvelle dit ce qu'elle remplace.

| Date | Décision | Pourquoi |
|---|---|---|
| 2026-10-15 | Phaser 4 + TypeScript + Vite, 2D vue de dessus, résolution native 480×270 affichée ×4 | Jeu web que Claude peut lancer et voir en session cloud ; même résolution qu'Hyper Light Drifter |
| 2026-10-15 | Référence visuelle : Hyper Light Drifter (gauntlet loop, critiques à l'aveugle) | Barre concrète et comparable |
| 2026-10-15 | Gauntlet limité à 3 manches par morceau, puis 1 manche pour le combat complet | Choix de l'utilisateur pour maîtriser le coût (environ 6 M tokens au total) |
| 2026-10-15 | Les ennemis ne blessent que pendant une attaque annoncée, et attaquent chacun leur tour | L'esquive doit avoir un sens ; combat lisible façon Hades |
| 2026-10-15 | Salles : la barre est la crypte validée par l'utilisateur (`docs/references/salle-crypte.png`), plus Hyper Light Drifter | L'utilisateur préfère la version de la manche 1 ; les halos lui conviennent |
| 2026-10-15 | Lore « L'Aube éternelle » : les vampires contre l'Ordre humain, quatre maisons liées aux formes de la nuit, chefs à libérer qui rejoignent le refuge (`docs/lore.md`) | Ennemis humains variés et lumière qui brûle ; un refuge vivant grâce aux vampires sauvés |
| 2026-10-15 | Le héros est le Sans-Maison | Choix de l'utilisateur ; justifie qu'il reçoive les Dons de toutes les maisons |
| 2026-10-15 | La Maison du Rat aide le héros dès la première fuite ; les trois autres se débloquent en libérant leur chef | Choix de l'utilisateur ; on gagne les maisons une à une |
| 2026-10-15 | Chefs de maison : Vesna la Grise (Rat), Séverin d'Ombrelune (Brume), Magda Croc-de-Fer (Loup), Lucian Noctule (Chauve-souris) | L'utilisateur a laissé Claude choisir ; provisoires |
| 2026-10-15 | Sons de combat synthétisés en Web Audio (`src/sfx.ts`, aucun fichier audio), sur le contexte audio de Phaser ; touche M pour couper le son ; vérifiés par mesure (`tools/sfx.check.mjs`) | Pas de dépendance ni d'asset ; Phaser gère déjà le déverrouillage au premier geste et le mute |
| 2026-10-15 | Lisibilité au contact : la ruée s'arrête au contact d'un ennemi sur lequel elle finirait (pas d'un ennemi qui charge), et le flash de coup ennemi devient un liseré blanc avec la robe éclaircie au lieu d'un aplat blanc | Le héros et l'ennemi frappé se fondaient en une seule tache pâle à l'impact |
| 2026-10-15 | Premier humain de l'Ordre : l'arbalétrier (chapel de fer, tabard blanc à croix d'or, arbalète ; 2 PV), à partir de la 2e vague (1 puis 2, à la place des goules des points d'apparition les plus éloignés du héros). Il garde ses distances, vise 650 ms (pose, ligne de visée en pointillés d'or, grincement) puis verrouille sa visée 200 ms avant de tirer ; un seul arbalétrier vise à la fois, un seul carreau en vol chacun, et les carreaux s'arrêtent sur les obstacles et les murs | Menace à distance lisible et esquivable (pas de côté ou ruée de brume) qui donne un sens au couvert, et récompense le contact |
| 2026-10-15 | Lanternes sacrées de l'Ordre dès la vague 2 (2 dès la vague 4) : leur flaque de lumière dorée brûle le Sans-Maison (1 sang toutes les 0,9 s après 0,4 s de grâce, rien pendant la ruée de brume), pas les goules ; 3 coups pour les briser ; posées sur 4 emplacements fixes autour du médaillon, jamais sur le héros | La lumière sacrée du lore devient un enjeu de placement lisible : bord net, annonce de 0,9 s, toujours une ombre où se réfugier |
| 2026-10-15 | Cri d'alerte de la goule : deux claquements de crocs puis un court grondement qui monte (variante C), à la place du sifflement aigu | Choix de l'utilisateur à l'écoute de 5 variantes ; le sifflement était le seul son qui ne lui plaisait pas |
