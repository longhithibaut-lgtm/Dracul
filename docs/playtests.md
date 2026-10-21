# Journal des parties

## 2026-10-21 · salle d'entraînement, les huit ennemis « grand pixel », PC
**Pénible / confus** : « ils sont tous un peu mou » : Purificateur, Prêtre, Chien de chasse, Pénitent, Sonneur, Inquisiteur, Amas et Bourreau approchent lentement, attendent longtemps entre deux attaques, restent plantés ; leurs coups manquent de mordant (peu de dégâts, presque pas de retour quand ils touchent).
**Réglages** : `T.penitent.speed` 24 → plus vite · `T.purifier.reloadMs` 1900, `T.penitent.reloadMs` 1600, `T.ringer.reloadMs` 3200, `T.inquisitor.reloadMs` 2200, `T.amas.reloadMs` 2600 → plus court · `T.hound.restMs` 900 → plus court · temps de préparation un peu plus courts, gardés lisibles (esquivables en réagissant 250 ms après leur début) · `T.purifier.damage`, `T.inquisitor.damage`, `T.amas.damage` 1, `T.bourreau.damage` 2 → plus · « mou »
**Design** : en groupe, attaques échelonnées au lieu d'attendre chacun son tour (en conflit avec « attaquent chacun leur tour », 2026-10-15) ; coups de suite : double fouet du Pénitent, nouveau bond du Chien s'il rate, second coup plus court du Bourreau si on reste devant lui ; le héros touché : gel, secousse selon le coup, recul, sang. Toujours aucune indication au sol.
**À faire d'abord** : 1. un tour d'agressivité sur les huit (vitesse, recharges, préparations, dégâts) 2. coups de suite 3. retour d'impact sur le héros
