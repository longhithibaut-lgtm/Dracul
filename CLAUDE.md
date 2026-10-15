# Dracul

Hades-like 2D vue de dessus, lore vampire. Phaser 4.2 + TypeScript + Vite. Conception et étapes : `docs/gameplan.md`
(lire avant toute tâche de gameplay ; noter chaque décision dans sa section « Décisions »).
Réponses et textes du jeu en français ; code et commentaires en anglais.

- `npm run dev` · `npm test` (règles pures de `src/logic.ts`) · `npm run build` (tsc + build)
- `npm run shot` : un bot joue dans Chromium sans écran, captures dans `shots/`, sortie 1 si erreur dans la page.
  Sur PC, une fois : `npx playwright install chromium` (déjà installé en session cloud).
- Après un changement de gameplay : tests + build, puis `npm run shot` et **regarder les captures** (adapter le bot si besoin).
- Tous les réglages de gameplay sont dans `src/tuning.ts`.
- C'est **Phaser 4**, pas 3 : `setTintFill()` ne fait rien (utiliser `setTint(c).setTintMode(Phaser.TintModes.FILL)`) ;
  réinitialiser l'état dans `init()` ; en cas de doute, vérifier l'API dans `node_modules/phaser/types/phaser.d.ts`.
- `gauntlet-loop` : seulement pour peaufiner une mécanique déjà validée comme amusante (coûteux).

@.claude/ponytail.md
