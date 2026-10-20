---
name: perf-profile
description: Measure Dracul's frame time, room build time and hotspots in headless Chromium (before/after a change), find the likely costs in the code, and give the recipe to measure on the user's phone. Use for "ça rame", "saccades", "fps", "performance", "c'est lent sur le téléphone", /perf-profile.
argument-hint: "[salle (hall|nave|ossuary|chapel|cloister|torture) ou changement à mesurer]"
---

<!-- Adapted from perf-profile in https://github.com/donchitos/claude-code-game-studios (MIT). -->

# Profil de performance

Headless Chromium renders WebGL on the CPU (SwiftShader): its fps is far below a phone's and only **compares** two
runs on the same machine and tool. A verdict about the phone needs the phone (step 4). Budget: 60 fps (16,7 ms per
frame) on the user's phone unless `docs/decisions.md` sets another; say it is that assumption.

1. **Mesurer en headless**. `node tools/art/torture.shots.mjs` already prints the trial room's fps on the phone shapes,
   light shader on and off. For another room or case, write a throwaway script in the scratchpad (not in `tools/`)
   copying that script's setup (vite server, SwiftShader flags, phone context, `window.game`) and:
   - enter the room: `window.game.scene.getScene('room').scene.restart({ training: true, layout })`, wait for
     `hero?.body`, timing the wait with `performance.now()` (room build: the trial room bakes its light here);
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
À vérifier sur le téléphone : …
```

4. **Sur le téléphone** (the real check; Android, Chrome), give the user these steps: Paramètres > À propos > tap the
   build number 7 times, then Options pour les développeurs > Débogage USB; plug into the PC; in Chrome on the PC open
   `chrome://inspect#devices`, open the game on the phone (the GitHub Pages URL, or the dev server with
   `npx vite --host` on the same Wi-Fi), « inspect », then Performance > record 10 s of play (frames over 16,7 ms in
   red), or the Rendering tab > « Frame rendering stats » for a live fps meter on the phone. Ask for the numbers or
   a screenshot back.

No measurement, no claim: a section without numbers says « non mesuré ». Do not change game code here; propose.
