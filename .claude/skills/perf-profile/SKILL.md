---
name: perf-profile
description: Measure Dracul's frame time, room build time and hotspots in headless Chromium (before/after a change), find the likely costs in the code, and give the recipe to measure on the user's phone. Use for "ça rame", "saccades", "fps", "performance", "c'est lent sur le téléphone", /perf-profile.
argument-hint: "[salle (refuge|necropolis|catacombs|hall|nave|ossuary|chapel|cloister) ou changement à mesurer]"
---

<!-- Adapted from perf-profile in https://github.com/donchitos/claude-code-game-studios (MIT). -->

# Profil de performance

Headless Chromium renders WebGL on the CPU (SwiftShader): its fps is far below a real GPU's and only **compares**
two runs on the same machine and tool. A verdict needs the user's PC (step 4). Budget: 60 fps (16,7 ms per
frame) on the user's PC unless `docs/decisions.md` sets another; say it is that assumption.

1. **Mesurer en headless**. `npm run shot -- --only=fps` prints each place's fps (standing and walking across the zones'
   chunks). For another case, write a throwaway script in the scratchpad (not in `tools/`) copying
   `scripts/shot.mjs`'s setup (vite server, SwiftShader flags, 1920×1080, `window.game`) and:
   - enter the room: `window.game.scene.getScene('room').scene.restart({ training: true, layout })`, wait for
     `hero?.body`, timing the wait with `performance.now()` (room build);
   - fight: hold movement keys with enemies up (as `scripts/shot.mjs` does), then record each
     `requestAnimationFrame` interval for 3 s after a 1 s settle: median, p95, worst, frames over 2× the median;
   - hotspots, when a number is bad: a CDP session (`page.context().newCDPSession(page)`, `Profiler.enable`,
     `Profiler.start`, play 3 s, `Profiler.stop`) and sum self time per function and file under `src/`.
   Same run before and after the change (`git stash` or a worktree), three times each; report the spread.
2. **Lire le code** where the profile points, Phaser suspects first: work in `update()` that allocates or loops over
   all enemies or the walk grid per enemy per frame, `Graphics` redrawn every frame, textures generated or baked at
   runtime, camera filters and shaders (`src/dark.ts`), particle counts, physics bodies and overlaps.
3. **Rapport**, in French:

```
## Performance : <salle ou changement>
Verdict : OK / À SURVEILLER / TROP LENT / NON MESURÉ
| Mesure (headless, forme) | Avant | Après | Écart |
Points chauds : <fonction, fichier:ligne> · <part du temps> · <piste>
Propositions : 1. <changement> · gain attendu · risque
À vérifier sur le PC de l'utilisateur : …
```

4. **Sur le PC** (the real check), give the user these steps: open the game (GitHub Pages URL) in Chrome, F12 >
   Performance > record 10 s of play (frames over 16,7 ms in red), or ⋮ > More tools > Rendering > « Frame rendering
   stats » for a live fps meter. Ask for the numbers or a screenshot back.

No measurement, no claim: a section without numbers says « non mesuré ». Do not change game code here; propose.
