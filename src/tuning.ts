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

  // The grand foes (« grand pixel » rooms, below) when their blow lands on the hero: the game freezes `hitStopMs` and he is
  // thrown back at `knock` px/s for `knockMs`, both per point of blood lost, so a heavier blow lands harder. `poiseMs`:
  // struck out of an attack, a foe holds firm through the blows that follow this long (an attack begun meanwhile goes
  // on), so the claws cannot pin it down.
  foes: { hitStopMs: 45, knock: 110, knockMs: 90, poiseMs: 700 },

  // The Order's Purificateur (« grand pixel » rooms, training only for now): a heavy flamethrower. He walks into range,
  // turns to the hero and lights his pilot, flaring (the tell, his aim locked: stepping aside dodges), then burns along
  // that aim. Nothing is marked on the floor.
  purifier: {
    hp: 3,
    speed: 46,
    near: 22, far: 38, // keeps the hero between these distances, in his flame's reach
    reach: 44, // the jet's length from his feet; he lights up only with the hero this close
    halfDeg: 18, // the jet's half-spread on the floor, as on the enemy sheet
    igniteMs: 480, // the tell: the stance, the pilot flaring
    burstMs: 90, // the jet shoots out of the lance to its full length (overshooting a little)
    fireMs: 500, // the jet; the hero standing in it is burnt (once: his invulnerability covers the rest)
    press: 60, // he lunges on into his jet, along its aim, this fast
    recoverMs: 250,
    reloadMs: 1100, // from one jet to the next ignition
    firstMs: 700, // after he appears
    damage: 2,
    pilotLight: 3, // his pilot lighting the dark rooms (dark.ts) at the end of the tell; the jet, half as much again
  },
  // The Order's Prêtre (« grand pixel » rooms, training only for now): keeps behind, far from the hero; points his
  // monstrance, brightening as he prays, then the holy light falls where the hero stood (nothing marks the spot).
  priest: {
    hp: 2,
    speed: 40,
    near: 120, far: 160, // stays this far from the hero: behind the others
    maxCast: 230, // prays only at a hero this close, on screen
    radius: 22, // the light's half-width where it falls; an ellipse squashed like the ground (T.lantern.squash)
    fillMs: 850, // the prayer: be gone from where you stood before it ends
    smiteMs: 350, // the light falls (it burns at its first instant)
    reloadMs: 1600,
    firstMs: 900,
    damage: 1,
    light: 2, // his monstrance's light in the dark rooms (dark.ts), rising to prayLight as he prays
    prayLight: 5,
  },
  // The Order's Chien de chasse (« grand pixel » rooms, training only for now): hunts in packs of three, fast. The pack
  // spreads round the hero on the side away from the Order's shooters, so its leaps drive him toward them. The tell: it
  // flattens, muzzle open, its aim locked; then a straight leap that shoves the hero along it. Stepping aside dodges.
  hound: {
    hp: 2,
    speed: 105,
    ring: 64, // the pack waits this far from the hero
    spreadDeg: 50, // between packmates round him
    leapRange: 72, // it flattens only with the hero this close, in a straight line
    crouchMs: 380, // the tell
    leapSpeed: 340, leapMs: 230, // about 78 px
    releapMs: 300, // a leap that missed: it flattens again this long, at where he is now, and leaps once more
    recoverMs: 250,
    restMs: 450, // then back to the ring before it may leap again
    staggerMs: 350, // the pack leaps in turn: a hound flattens no sooner than this after a packmate did
    shove: 170, shoveMs: 160, // the hero thrown along the leap
    firstMs: 600,
    damage: 1,
  },
  // The Order's Pénitent (« grand pixel » rooms, training only for now): cannon fodder in waves of six; drags his cross
  // straight at the hero and never backs off. The tell: he cocks his nailed scourge, his aim locked; then a short lash
  // in a cone. Stepping back dodges, and so does striking him first (a claw cuts the tell short).
  penitent: {
    hp: 2,
    speed: 40,
    strikeRange: 30, // he cocks his scourge with the hero this close
    reach: 36, halfDeg: 50, // the lash on the floor, from his feet
    cockMs: 480, drawBack: 15, // the tell; he leans back from the hero this fast meanwhile
    lashMs: 140, lunge: 90, // the hero in the cone meanwhile is struck; he steps into it this fast
    recockMs: 220, // then he cocks again at the hero, aim locked anew, and lashes a second time
    recoverMs: 350,
    reloadMs: 900,
    together: 3, // no more than this many lash at once,
    staggerMs: 200, // each one cocking no sooner than this after another
    firstMs: 500,
    damage: 1,
  },
  // The Order's Sonneur (« grand pixel » rooms, training only for now): support, deaf, keeps far behind the others. The
  // tell: he raises his mallet and his bell's rim lights up; then he strikes it and three rings of sound roll out along the
  // floor, each stunning the hero it passes over (the mist passes through them, and they die out at `reach`). Each
  // strike quickens the Order's men round him for a while.
  ringer: {
    hp: 3,
    speed: 32,
    near: 85, far: 115, // keeps the hero between these distances: behind the others
    raiseMs: 750, // the tell
    strikeMs: 250, // the mallet on the rim
    reach: 100, // how far the rings roll on the floor (ground foreshortening undone); he strikes with the hero within `reach - 15`
    ringSpeed: 140, ringGapMs: 110, ringHalf: 4, // three rings, `ringGapMs` apart; one hits a hero within `ringHalf` of it
    stunMs: 900, // the hero struck stands dazed: no move, no dash, no blow
    recoverMs: 300,
    reloadMs: 2200,
    firstMs: 1100,
    damage: 1,
    haste: 1.5, hasteMs: 4000, hasteRange: 220, // the Order's men within `hasteRange` move this much faster this long
    light: 4, // his bell's rim in the dark rooms (dark.ts) at the end of the tell, the strike half as much again
  },
  // The Order's Inquisiteur (« grand pixel » rooms, training only for now): an elite; parries every claw and shard
  // coming at his front (he turns only so fast: his back is the way in), and the Order's men near him strike more often.
  // The tell: his censer starts whirling overhead, his aim locked; then a sweep through the half circle in front of him.
  // Getting into his back, or out of reach, dodges it.
  inquisitor: {
    hp: 6,
    speed: 44,
    near: 20, far: 30,
    turnDeg: 150, // how fast he turns to the hero, degrees a second
    parryDeg: 90, // the half-angle of the front he parries, from where he faces: his whole front half
    strikeRange: 32, // he whirls his censer with the hero this close
    reach: 40, // the sweep, from his feet; the half circle in front of his locked aim
    whirlMs: 700, // the tell
    sweepMs: 200, lunge: 110, // he steps into the sweep this fast
    recoverMs: 400,
    reloadMs: 1300,
    firstMs: 900,
    damage: 2,
    command: 1.6, commandRange: 160, // the Order's men within `commandRange` of him recover from their attacks this much faster
    light: 1.6, whirlLight: 3, // his censer's embers in the dark rooms, fanned by the whirl
  },
  // L'Amas (« grand pixel » rooms, training only for now): ghouls fused into one slow mass; no blood worth drinking.
  // Every blow tears a ghoul off it, which crawls at the hero. The tell: it gathers itself up as every arm rises; then it
  // slams down all round it, the blow spreading out over the floor to `reach`. Getting out of reach dodges it; then it
  // lies sprawled a while: the time to strike. Blows never cut it short nor push it back.
  amas: {
    hp: 12,
    speed: 22,
    strikeRange: 30, // it gathers itself with the hero this close (floor, from its middle)
    reach: 44, // the slam, all round it (floor, the ground's foreshortening undone)
    contractMs: 720, // the tell
    slamMs: 150, // the slam spreading out to `reach`; the hero it passes over is struck
    sprawlMs: 800, // then it lies spread out, slow to gather itself again
    reloadMs: 1500,
    firstMs: 1000,
    damage: 2,
    thralls: 4, // torn-off ghouls of one Amas alive at once, at most
    thrallHp: 1, crawl: 0.6, // they have this much hp and go at this much of a ghoul's pace
  },
  // Le Bourreau, guardian of the crypt (« grand pixel » rooms, training only for now): a mini-boss, huge, slow; his house
  // chief's reliquary chained at his belt. The tell: he raises his axe overhead, his aim locked; then the blow splits the
  // floor in a long line ahead of him (the crack, running out from the blade, is the attack). Stepping aside dodges it;
  // then he wrenches his axe out of the stone: the time to strike. Blows never cut him short nor push him back.
  bourreau: {
    hp: 16,
    speed: 30,
    near: 18, far: 30,
    strikeRange: 80, // he raises his axe with the hero this close
    reach: 120, half: 8, // the crack: its length from his feet and half its width (floor), stopped by props and walls
    heaveMs: 800, // the tell
    crackMs: 90, // the crack runs out to its end; the hero it reaches is struck
    chopMs: 160, // the blow, its pose held
    wrenchMs: 1000, // the axe stuck: he tugs it free
    // With the hero still close in front (`ripRange`, floor) as the axe lands, he tears it out at him instead: tugging
    // hard (`ripMs`, the tell), then the axe rips up through the half circle before him (`swingMs`); he recovers longer.
    ripRange: 36, ripMs: 450, swingMs: 140, ripDamage: 2, ripRecoverMs: 600,
    recoverMs: 200,
    reloadMs: 1100,
    firstMs: 900,
    damage: 3,
    light: 1.2, // his reliquary's faint gold in the dark rooms
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
