---
name: balance-check
description: Check Dracul's balance from src/tuning.ts and src/gifts.ts. Flags outliers, dominant strategies, broken curves and useless gifts, with numbers. Use for "équilibrage", "c'est trop fort", "balance check", /balance-check.
argument-hint: "[système : griffes|tir|glyphe|morsure|ennemis|dons|lumière|tout]"
---

<!-- Adapted from balance-check in https://github.com/donchitos/claude-code-game-studios (MIT). -->

# Vérification d'équilibrage

Read `src/tuning.ts`, `src/gifts.ts` and the decisions for the system in `docs/decisions.md` (they state the intent,
e.g. "le tir plus faible et plus lent que les griffes", "un humain debout ne meurt jamais d'un seul coup"). An intent
stated there is the target; a value with no stated intent is listed as « non jugé », not as an outlier.

Compute with `node -e`, from the real values:
- **Dégâts** : damage per second of each action (claws over a 3-blow combo with the finisher and its recovery, dash
  strike, shot, rats, Peste), with and without each gift. Time to kill a ghoul and a crossbowman for each.
- **Survie** : hits the hero takes per room vs heal (bites: humans per room × `T.bite.heal`), lantern and Dawn burn per
  second of exposure, invulnerability windows.
- **Dominance** : an action or gift strictly better than another (more damage, less risk); a combo that removes all
  risk (e.g. a bind that outlasts its cooldown, an endless dash); a gift that is never worth taking.
- **Courbes** : enemy count and pressure per wave as rooms go up; dead zones and spikes.

For in-game numbers: `npm run shot` (the bot fights, its last lines print the room and hero state) or the training
room (key T) to set values live. Run `npm test` before trusting any change.

Output, in French:

```
## Équilibrage : <système>
Verdict : SAIN / À SURVEILLER / CASSÉ
| Mesure | Valeur | Cible (décision) | Écart |
Stratégies dominantes : …
Propositions : `T.x.y` actuel → proposé · effet chiffré
Non jugé : …
```
Propose, do not edit `src/tuning.ts` unless the user asks.
