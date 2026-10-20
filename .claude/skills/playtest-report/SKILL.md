---
name: playtest-report
description: Turn the user's free-form play feedback on Dracul into a structured report (good, bad, bugs, tuning values to change) and append the actionable items to docs/playtests.md. Use when the user describes a play session, "j'ai joué", "retour de partie", /playtest-report.
argument-hint: "[retour de partie en texte libre]"
---

<!-- Adapted from playtest-report in https://github.com/donchitos/claude-code-game-studios (MIT). -->

# Rapport de partie

Input: the user's feedback (argument or recent messages). Read what it touches: `src/tuning.ts`, `src/gifts.ts`, the
relevant lines of `docs/decisions.md`. Do not ask questions first; mark anything unclear as « à préciser ».

Sort each observation into one bucket. A defect (crash, softlock, something that breaks rather than plays badly) is a
bug, not a pain point.

```
## <date> · <ce qui a été joué : salle, appareil, mode>
**Bien** : …
**Pénible / confus** : …
**Bugs** : <symptôme> · <comment le reproduire> · <fichier suspect si évident>
**Réglages** : `T.x.y` <actuel> → <proposé> · <pourquoi, citant le retour>
**Design** : <changement de règle ou de contenu, en conflit avec une décision ? laquelle>
**Finitions** : …
**À faire d'abord** : 1. … 2. … 3.
```

Rules:
- Every tuning line names a real key of `src/tuning.ts` with its current value. Changes stay proposals.
- Flag feedback that contradicts a line of `docs/decisions.md`; never rewrite that file here.
- Append the block to `docs/playtests.md` (create it with the title `# Journal des parties` if missing), newest at the
  bottom, empty buckets omitted. Then show it to the user.
- Next step to suggest: `/balance-check` for tuning, a fix for bugs, the training room (key T) to try values live.
