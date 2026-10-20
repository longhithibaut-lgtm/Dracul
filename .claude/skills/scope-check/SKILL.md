---
name: scope-check
description: Compare a requested Dracul feature with the current goals (docs/decisions.md, docs/lore.md), estimate the work in agent passes and cost, and flag scope creep. Use before a large feature, for "est-ce que ça vaut le coup", "c'est gros ?", /scope-check.
argument-hint: "[fonctionnalité demandée]"
---

<!-- Adapted from scope-check in https://github.com/donchitos/claude-code-game-studios (MIT). -->

# Vérification de périmètre

1. **Le cap actuel** : read `docs/decisions.md` from the bottom up and note the latest lines that set direction (a
   « Cap », a project split, an art direction on trial) and `docs/lore.md` for what the story allows.
2. **La demande** : list what it needs, item by item (code, art, sound, tuning, tests, captures). Mark each item
   *dans le cap*, *découverte nécessaire* (needed for the cap) or *ajout* (not asked by the cap).
3. **Le coût** : find the closest past features (`git log --stat`, matching lines in decisions.md) and estimate from
   them: files touched, agent passes (code, art by an agent, `npm run shot` and look at the captures, user review),
   art rendered from 3D models or a gauntlet loop being the expensive parts. Give a range, say which past feature it
   is based on.
4. **Verdict**, in French:

```
## Périmètre : <fonctionnalité>
Verdict : DANS LE CAP / DÉRIVE MAÎTRISÉE / HORS CAP / NON ÉVALUÉ
Éléments : N (dont M ajouts, soit X %)
Coût estimé : <passes, fichiers>, comparable à <décision ou commit>
Garder : … · Reporter : … · Couper : … · À trancher par l'utilisateur : …
Plus petite version utile : …
```

Rules: additions over 25 % of the items without a matching cut is HORS CAP. No current goal readable, or a request
too vague to list items: NON ÉVALUÉ, never a percentage. New story or names: always « à trancher par l'utilisateur ».
