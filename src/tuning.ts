// Every gameplay number in one place. Native resolution is 480x270 (shown at x4 on 1080p, like Hyper Light Drifter).
// Distances in native pixels, durations in milliseconds, speeds in pixels per second.
export const T = {
  width: 480,
  height: 270,

  hero: { maxHealth: 5, speed: 95, hurtInvulnMs: 800, bufferMs: 150 }, // bufferMs: how early a press may come, see press()
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

  // The Eternal Dawn over the cloister's garth: free for a few seconds (the hero sees the danger build), then it burns
  // on a steady beat until he is back in the shade.
  dawn: { graceMs: 2500, burnEveryMs: 1000, damage: 1 },

  // The invisible floating stick (touch.ts): it appears where the thumb lands. In CSS px, about the same on every phone.
  stick: {
    radius: 46, // the knob's travel; the base follows a thumb that drags farther
    dead: 0.18, // of the radius: a resting thumb doesn't walk him
    tapMs: 200, slopPx: 12, // lifted this soon, having strayed this little: a tap, the mist
  },

  // The horde (the default mode): ghouls pour in all through the room, more and more, until its time is up.
  horde: {
    roomMs: 90000, roomMsStep: 10000, // room 1 lasts this long, each next room this much longer
    first: 10, // the opening rush, at once
    rate: 1.2, rateEnd: 4.4, // ghouls a second at the start of room 1 and at its end (rising in between)...
    ratePerRoom: 0.4, // ...both this much higher each next room
    max: 60, // alive at once
    hp: 1, hpPerRoom: 0.5, // weaker than the old ghouls (T.enemy.hp): one or two blows
    speed: 38, speedPerRoom: 3,
    spacing: 13, // packmates closer than this push apart
    // Their swipe, telegraphed like the old lunge but short: within `reach` (sprite to sprite) it stops, winds up, lunges.
    reach: 20, windupMs: 420, lungeSpeed: 170, lungeMs: 110, recoverMs: 350, restMs: 600,
    margin: 24, // they rise this far beyond the edge of the view...
    clear: 110, // ...and never closer than this to the hero
    // The Order, the Hades side: crossbowmen (`bows` at a time in room 1, one more each next room) and lanterns.
    bowFirstMs: 15000, bowEveryMs: 20000, bows: 1,
    lanternAt: [0.3, 0.6], // a lantern at these fractions of the room; room 1 only the first
  },

  // Blood and level-ups: every kill drops blood; the bar full, the game pauses on three upgrade cards (upgrades.ts).
  level: {
    first: 30, step: 10, // drops the first level needs, and how many more each next one
    magnet: 44, // drops this close are pulled to the hero...
    pull: 240, // ...at up to this speed
    ghoul: 1, bow: 5, // drops' worth
  },

  // The automatic attacks of the default mode, all from the kit above.
  auto: {
    glyphMin: 3, // the glyph waits for a cluster of at least this many enemies in view
    spread: 0.22, // radians between the shards of a fan (Gerbe d'éclats)
  },

  // The upgrades (upgrades.ts), per level taken; each stacks up to `max` levels.
  ups: {
    max: 5,
    reach: 4, arc: 12, // Griffes longues: px, degrees
    claw: 0.5, // Griffes acérées: damage
    frenzy: 0.1, // Frénésie: claws' cooldown x (1 - frenzy) per level
    finisher: 1, // Coup de grâce: the finisher's damage
    shards: 1, // Gerbe d'éclats: shards per throw
    shotRate: 0.15, // Main leste: shards' cooldown x (1 - shotRate) per level
    glyphRadius: 6, // Grand sceau: px
    glyphRate: 0.15, // Sceau pressé
    mist: 0.15, // Brume vive
    speed: 0.08, // Foulée nocturne: x (1 + speed x level)
    magnet: 0.5, // Appel du sang: x (1 + magnet x level)
    vigor: 1, // Sang épais: max health, healed when taken
    feast: 1, // Festin: blood a bite gives back
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
