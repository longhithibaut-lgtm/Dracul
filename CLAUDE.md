# Dracul

Hades-like 2D jouable dans le navigateur, plus modeste que Hades : le dernier vampire libre contre l'Ordre humain.
Lore validé : `docs/lore.md` (noms provisoires ; aucune nouvelle histoire sans l'utilisateur). Direction artistique :
`docs/art.md`. Noter chaque décision dans `docs/decisions.md`.
Réponses et textes du jeu en français ; code et commentaires en anglais.

`npm test` · `npm run build` · `npm run shot` (un bot joue dans Chromium sans écran et enregistre des captures
dans `shots/` : les regarder après tout changement visuel ou de gameplay). Réglages de gameplay : `src/tuning.ts`.
Skills `/playtest-report`, `/balance-check`, `/scope-check`, `/perf-profile`, `/patch-notes` ; agents `economy-designer`
(progression, coûts, récompenses), `art-director` (art contre `docs/art.md` et maquettes), `level-designer` (plans de
salle), `qa-tester` (recette par les outils de capture).

@.claude/ponytail.md
