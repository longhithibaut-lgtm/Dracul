// Every gameplay number in one place. Native resolution is 480x270 (shown at x4 on 1080p, like Hyper Light Drifter).
// Distances in native pixels, durations in milliseconds, speeds in pixels per second.
export const T = {
  width: 480,
  height: 270,

  hero: { maxHealth: 5, speed: 95, hurtInvulnMs: 800, bufferMs: 150 }, // bufferMs: how early a press may come, see press()
  grand: { speed: 66 }, // the grand vampire (torture room, refuge) walks slower, heavier (his run frames follow the distance)
  dash: {
    speed: 330, durationMs: 130, cooldownMs: 380, stopShort: 22, // stopShort: halts this far from an enemy it'd end on
    // The dash strike: a slash pressed during the dash (it waits for the end) or this soon after it. The combo's first blow.
    strikeWindowMs: 120, strikeBonus: 1, strikeArcDeg: 180, strikeKnock: 1.5, // strikeKnock: x slash.knockback
  },
  slash: {
    range: 30, arcDeg: 130, damage: 1, cooldownMs: 210, comboWindowMs: 450, knockback: 140, hitStopMs: 40,
    // The combo's third blow, the finisher: heavier, wider and longer, but the next slash waits `finisherRecoveryMs` more.
    finisherMult: 2, finisherRange: 36, finisherArcDeg: 170, finisherKnock: 1.6, finisherHitStopMs: 40, finisherRecoveryMs: 150,
  },
  // Le Tir: a shard of blood flicked straight ahead, without limit; weaker and slower than the claws. It flies until the
  // first enemy, lantern, prop or wall in its way.
  // throwMs: the flick, at half speed. stunMs: a short flinch that never cancels a windup or an aim, so the tir can't pin.
  shot: { damage: 0.5, cooldownMs: 400, speed: 240, knockback: 40, throwMs: 120, stunMs: 80 },
  // La Morsure: the only heal. On a weakened human only; the hero is held at its throat, open to every blow, while it drains.
  bite: {
    weakAt: 1, // a human with this much hp or less can be bitten
    range: 26, arcDeg: 360, // no aiming: the nearest weakened human in reach, all around
    lungeMs: 70, // the snap onto the prey
    hitStopMs: 60,
    drainMs: 450, // latched: neither the hero nor the prey can act
    heal: 1,
    whiffCooldownMs: 300, // a bite with no valid prey: a teeth snap in place
    kneelMs: 1500, // a human just weakened kneels this long: it can't act, move or die but by the bite
  },

  // Le Glyphe: a blood sigil cast on the floor; once drawn, every enemy standing in it is bound (stops dead, cannot attack).
  glyph: {
    range: 110, // cast at the pointer, no farther than this from the hero's feet
    near: 60, // cast from the keyboard: this far ahead of him
    radius: 30, // half-width; an ellipse squashed like the ground (T.lantern.squash)
    armMs: 350, // the sigil draws itself, binding nothing yet
    holdMs: 2500, // then it binds, this long
    cooldownMs: 5000, // from one cast to the next
    castMs: 220, // the hero's cast pose
  },

  enemy: {
    hp: 3,
    speed: 42,
    spacing: 56, // packmates closer than this push apart, so a wave surrounds the hero instead of stacking
    stunMs: 200,
    spawnTelegraphMs: 700,
    // Attack: stop and telegraph (windup), then lunge. Only the lunge hurts, so it can be dodged.
    lungeRange: 38,
    holdRange: 58, // enemies waiting their turn to attack circle the hero at about this distance
    windupMs: 450,
    lungeSpeed: 210,
    lungeMs: 200,
    recoverMs: 500,
    restMs: 700, // then it backs off to the ring before it may attack again
    damage: 1,
  },

  // The Order's crossbowman: keeps its distance and shoots dodgeable bolts; frail once the hero is on it.
  crossbow: {
    hp: 2,
    speed: 38,
    near: 110, far: 140, // keeps the hero between these distances: backs off, strafes, closes in
    minShot: 56, maxShot: 200, // aims only at the hero between these distances, with a clear line
    aimMs: 650, // the tell: raise, sight, creak
    lockMs: 200, // the last part of the aim stops tracking the hero, so a sidestep dodges the bolt
    recoilMs: 300,
    reloadMs: 1700, // from one shot to the next aim
    firstShotMs: 1200, // after it appears
    boltSpeed: 260,
    damage: 1,
  },

  // The Order's Purificateur (« grand pixel » rooms, training only for now): a heavy flamethrower. He walks into range,
  // turns to the hero and lights his pilot, flaring (the tell, his aim locked: stepping aside dodges), then burns along
  // that aim. Nothing is marked on the floor.
  purifier: {
    hp: 3,
    speed: 30,
    near: 22, far: 38, // keeps the hero between these distances, in his flame's reach
    reach: 44, // the jet's length from his feet; he lights up only with the hero this close
    halfDeg: 18, // the jet's half-spread on the floor, as on the enemy sheet
    igniteMs: 750, // the tell: the stance, the pilot flaring
    fireMs: 550, // the jet; the hero standing in it is burnt (once: his invulnerability covers the rest)
    recoverMs: 450,
    reloadMs: 1900, // from one jet to the next ignition
    firstMs: 1200, // after he appears
    damage: 1,
    pilotLight: 3, // his pilot lighting the dark rooms (dark.ts) at the end of the tell; the jet, half as much again
  },
  // The Order's Prêtre (« grand pixel » rooms, training only for now): keeps behind, far from the hero; points his
  // monstrance, brightening as he prays, then the holy light falls where the hero stood (nothing marks the spot).
  priest: {
    hp: 2,
    speed: 28,
    near: 120, far: 160, // stays this far from the hero: behind the others
    maxCast: 230, // prays only at a hero this close, on screen
    radius: 22, // the light's half-width where it falls; an ellipse squashed like the ground (T.lantern.squash)
    fillMs: 1100, // the prayer: be gone from where you stood before it ends
    smiteMs: 350, // the light falls (it burns at its first instant)
    reloadMs: 2600,
    firstMs: 1500,
    damage: 1,
    light: 2, // his monstrance's light in the dark rooms (dark.ts), rising to prayLight as he prays
    prayLight: 5,
  },
  // The Order's Chien de chasse (« grand pixel » rooms, training only for now): hunts in packs of three, fast. The pack
  // spreads round the hero on the side away from the Order's shooters, so its leaps drive him toward them. The tell: it
  // flattens, muzzle open, its aim locked; then a straight leap that shoves the hero along it. Stepping aside dodges.
  hound: {
    hp: 2,
    speed: 80,
    ring: 64, // the pack waits this far from the hero
    spreadDeg: 50, // between packmates round him
    leapRange: 72, // it flattens only with the hero this close, in a straight line
    crouchMs: 500, // the tell
    leapSpeed: 270, leapMs: 280, // about 75 px
    recoverMs: 450,
    restMs: 900, // then back to the ring before it may leap again; one hound of the pack leaps at a time
    shove: 170, shoveMs: 160, // the hero thrown along the leap
    firstMs: 1000,
    damage: 1,
  },
  // The Order's Pénitent (« grand pixel » rooms, training only for now): cannon fodder in waves of six; drags his cross
  // straight at the hero and never backs off. The tell: he cocks his nailed scourge, his aim locked; then a short lash
  // in a cone. Stepping back dodges, and so does striking him first (a claw cuts the tell short).
  penitent: {
    hp: 2,
    speed: 24,
    strikeRange: 30, // he cocks his scourge with the hero this close
    reach: 36, halfDeg: 50, // the lash on the floor, from his feet
    cockMs: 600,
    lashMs: 180, // the hero in the cone meanwhile is struck
    recoverMs: 600,
    reloadMs: 1600,
    together: 2, // no more than this many lash at once
    firstMs: 800,
    damage: 1,
  },

  // Sacred lanterns of the Order: their pool of holy light burns the hero (never the ghouls) until he smashes them.
  lantern: {
    hp: 3,
    radius: 40, // half-width of the pool; it is an ellipse squashed like the ground
    squash: 0.72,
    graceMs: 400, // stepping into the light is free this long, then it burns
    burnEveryMs: 900,
    damage: 1,
    telegraphMs: 900,
    fromWave: 2, // one lantern from this wave on, two from `twoFromWave`
    twoFromWave: 4,
    clear: 1.3, // never planted with the hero inside this much of its pool
  },

  // The Eternal Dawn over the cloister's garth: free for a few seconds (the hero sees the danger build), then it burns
  // on a steady beat until he is back in the shade.
  dawn: { graceMs: 2500, burnEveryMs: 1000, damage: 1 },

  // A run is a string of rooms; the wave count carries on from room to room, so difficulty keeps climbing.
  run: {
    wavesPerRoom: 3,
    slowMo: 0.3, // the last kill of a room plays at this speed...
    slowMoMs: 450, // ...for this long (real time)
    giftDelayMs: 500, // then the gift of the Rat house appears on the medallion
    gateMs: 1100, // the portcullis rises
    fadeMs: 450, // to black, leaving through the gate; the next room fades in as fast
    titleMs: 1200, // "Salle N" stays up this long; the first wave comes when it is gone
  },

  // Gifts of the Rat house (gifts.ts), each taken at most once per run.
  gifts: {
    plagueMs: 2000, plagueDamage: 1, // la Peste (claws, shards, Contagion): an infected enemy loses this much, this long after
    contagion: 40, // Contagion: the plague of a sick enemy that dies leaps to the enemies this close to it
    // Nuée and Glyphe du nid: rats released by a dash (no more than `rats` of the dash's at once) or by the glyph arming.
    rats: 3, ratSpeed: 150, ratLifeMs: 2500, ratDamage: 1,
    dashRecharge: 1.4, // Fuite du rat: the dash recharges this many times faster
    gnaw: 1, // Rongeur: extra damage of the combo's third blow
    blood: 1, // Survivant: extra max health, healed once when taken
    bite: 1, // Morsure de rat: extra blood a bite gives back
  },
} as const;
