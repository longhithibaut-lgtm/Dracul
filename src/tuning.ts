// Every gameplay number in one place. Native resolution is 480x270 (shown at x4 on 1080p, like Hyper Light Drifter).
// Distances in native pixels, durations in milliseconds, speeds in pixels per second.
export const T = {
  width: 480,
  height: 270,

  hero: { maxHealth: 5, speed: 95, hurtInvulnMs: 800, bufferMs: 150 }, // bufferMs: how early a press may come, see press()
  dash: { speed: 330, durationMs: 130, cooldownMs: 380, stopShort: 22 }, // stopShort: halts this far from an enemy it'd end on
  slash: { range: 30, arcDeg: 130, damage: 1, cooldownMs: 210, comboWindowMs: 450, knockback: 140, hitStopMs: 40 },
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
    aimMs: 650, // telegraph: raise, aim line, creak
    lockMs: 200, // the last part of the aim stops tracking the hero, so a sidestep dodges the bolt
    recoilMs: 300,
    reloadMs: 1700, // from one shot to the next aim
    firstShotMs: 1200, // after it appears
    boltSpeed: 260,
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

  // Gifts of the Rat house, each taken at most once per run.
  gifts: {
    plagueMs: 2000, plagueDamage: 1, // Griffes pestilentes: an infected enemy loses this much more, this long after
    rats: 3, ratSpeed: 150, ratLifeMs: 2500, ratDamage: 1, // Nuée: rats released by a dash (no more than `rats` at once)
    dashRecharge: 1.4, // Fuite du rat: the dash recharges this many times faster
    gnaw: 1, // Rongeur: extra damage of the combo's third blow
    blood: 1, // Survivant: extra max health, healed once when taken
    bite: 1, // Morsure de rat: extra blood a bite gives back
  },
} as const;
