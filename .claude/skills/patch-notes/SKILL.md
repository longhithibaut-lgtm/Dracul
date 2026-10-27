---
name: patch-notes
description: Write a short French « Quoi de neuf » of what changed in Dracul since the last publish to GitHub Pages, in the player's words, with what to try on PC. Use after `sh scripts/pages.sh`, for "quoi de neuf", "notes de version", "qu'est-ce qui a changé", /patch-notes.
argument-hint: "[commit ou date de départ, sinon la dernière publication]"
---

<!-- Adapted from patch-notes (with changelog) in https://github.com/donchitos/claude-code-game-studios (MIT). -->

# Quoi de neuf

1. **Depuis quand** : the argument, else the previous publish. `scripts/pages.sh` commits each build to `gh-pages` as
   « Game build from <sha> »: `git fetch -q origin gh-pages && git log -2 --format='%s %cd' FETCH_HEAD` (right after a
   publish, the second line is the previous one). Unreachable: ask the user for a commit or a date.
2. **Quoi** : `git log --format='%h %ad %s' --date=short <sha>..<head>` and the `docs/decisions.md` lines dated since
   (they already say it in French and why). Keep only what a player meets: mechanics, rooms, enemies, Dons, controls,
   art, sound, HUD, fixes. Drop tooling (agents, skills, `tools/`, captures, archived mockups) and say how many
   commits were dropped. A change made then undone in the range (« retiré », « remplace la ligne ») is not news.
3. **Comment** : the player's words, not the code's (« les goules contournent les fosses », not « grille de marche
   partagée »); keep numbers that matter (« il marche plus lentement : 66 au lieu de 95 »); trial content says where
   to find it (salle d'entraînement, touche T).

```
## Quoi de neuf · <date> (depuis le <date de la publication précédente>)
**Nouveau** : …
**Changé** : …
**Corrigé** : …
**À essayer** : 1. … 2. … (le plus risqué d'abord : contrôles, nouveaux lieux, fluidité)
https://longhithibaut-lgtm.github.io/Dracul/
```

Empty sections omitted, ten lines at most. Show it, ready to paste; write no file. Feedback after trying it:
`/playtest-report`.
