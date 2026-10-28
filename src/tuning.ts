// Every gameplay number in one place. Native resolution is 480x270 (shown at x4 on 1080p, like Hyper Light Drifter).
// Distances in native pixels, durations in milliseconds, speeds in pixels per second.
export const T = {
  width: 480,
  height: 270,

  // speed: the grand vampire walks heavily (his run frames follow the distance); bufferMs: how early a press may come, see press()
  hero: { maxHealth: 5, speed: 66, hurtInvulnMs: 800, bufferMs: 150 },
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

  // The grand foes (below) when their blow lands on the hero: the game freezes `hitStopMs` and he is
  // thrown back at `knock` px/s for `knockMs`, both per point of blood lost, so a heavier blow lands harder. `poiseMs`:
  // struck out of an attack, a foe holds firm through the blows that follow this long (an attack begun meanwhile goes
  // on), so the claws cannot pin it down.
  foes: { hitStopMs: 45, knock: 110, knockMs: 90, poiseMs: 700 },

  // The Order's Purificateur: a heavy flamethrower. He walks into range,
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
  // The Order's Prêtre: keeps behind, far from the hero; points his
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
  // The Order's Chien de chasse: hunts in packs of three, fast. The pack
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
  // The Order's Pénitent: cannon fodder in waves of six; drags his cross
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
  // The Order's Sonneur: support, deaf, keeps far behind the others. The
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
  // The Order's Inquisiteur: an elite; parries every claw and shard
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
  // L'Amas: ghouls fused into one slow mass; no blood worth drinking.
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
  // Le Bourreau, guardian of the crypt: a mini-boss, huge, slow; his house
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

  // La Nourrice des goules, version A « l'Araignée » (docs/decisions.md): kept for a later boss, out of the catacombs
  // (the training room calls her in; her phase 2 crawls the edges of the view she was called into). Huge,
  // perched high on four long limbs, goules clinging to them. Nothing marks the floor: her body, her seal's gold, the
  // sound tell every blow. Blows never cut her short nor push her back; the glyph does not bind her.
  nourrice: {
    hp: 40,
    speed: 46,
    reach: 18, // her body's half-width on the floor: the claws reach her this much farther
    hard: 2, goules: 3, // a blow of `hard` or more shakes one of her clinging goules off (three cling to her); no more than `goules` of hers alive at once
    near: 50, far: 100, // phase 1: she stalks the hero between these
    // The drop: the body sinks, the fore-limbs rise very high, claws open, her joints crack one after another
    // (`teleMs`; she follows him with her eyes `trackMs`, then her aim is locked), then she leaps (`leapMs`) and slams
    // down where he stood: struck within `radius` (floor). Then she pulls herself up (`stuckMs`): the time to strike.
    dropRange: 170, teleMs: 900, trackMs: 250, leapMs: 320, radius: 30, dropDamage: 2, stuckMs: 1400,
    // The rake: a fore-limb drawn back and up (`rakeTeleMs`, her aim locked), then swept low across her front
    // (`rakeMs`): struck between `rakeIn` and `rakeOut` (floor) within `rakeDeg` of her aim.
    rakeRange: 56, rakeTeleMs: 800, rakeMs: 200, rakeIn: 12, rakeOut: 70, rakeDeg: 150, rakeDamage: 1, rakeRecoverMs: 600,
    reloadMs: 1100,
    // Phase 2, at half her blood: the Order's chains snap off her (`snapMs`, the tell: she rears, links fly), she
    // leaps onto the walls (`climbMs`) and crawls along the arena's edge `wallZ` px up (`wallSpeed`), out of reach.
    snapMs: 1400, climbMs: 600, wallZ: 34, wallSpeed: 80,
    // From the wall she hurls (`hurlMs`, the tell: a limb raised back with a lump of bones) debris, or one of her
    // goules, at where he stands as it leaves her claws; it lands `flightMs` later, striking within `hurlRadius`.
    // `hurls` throws `hurlGapMs` apart; then she crosses the vault over him (`vaultZ` up, `vaultSpeed`, at most
    // `creepMs`), holds there (`holdMs`, locked: dust falls off her, her joints creak) and drops (`fallMs`), striking
    // within `radius`; down, she pulls herself up (`stuck2Ms`) and walks the floor `floorMs` before she climbs again.
    hurlMs: 750, flightMs: 650, hurlRadius: 16, hurlDamage: 1, hurls: 2, hurlGapMs: 900,
    vaultZ: 110, vaultSpeed: 120, creepMs: 1800, holdMs: 750, fallMs: 220, stuck2Ms: 1800, floorMs: 6000,
    light: 1.2, teleLight: 2.6, // her seal's gold in the dark, flaring as she winds up
  },

  // La Matrice (the Nourrice des goules, version B), the catacombs' guardian before Vesna's reliquary (docs/decisions.md):
  // crucified on an Order wheel hung from the vault over the arena's middle (its pivot), her belly a translucent sac of
  // larvae, umbilical cords to the goules crawling round her. Nothing marks the floor: the wheel, the sac's light, the
  // chains' sound tell every swing. Blows never cut her short; the glyph does not bind her.
  matrice: {
    hp: 40, speed: 0,
    reach: 16, // the wheel is broad: the claws reach her this much farther
    hangZ: 34, vault: 170, // hanging, the rim's foot this high (out of reach); the pivot this high over the floor
    // Phase 1, the pendulum. Hanging `reloadMs`, then the tell (`teleMs`): the wheel drawn back `back` away from him and
    // turned a notch, the sac lit from within, the cords taut, the chains creaking; her aim follows him `trackMs`, then
    // locks. The swing (`swingMs`) sweeps from there through the pivot to `over` past where he stood (at most `arm` from
    // the pivot): whoever is within `radius` (floor) of the wheel as it passes low is struck for `damage`. It ends low,
    // grounded (`lowMs`: the time to strike her), then is hauled back up to the pivot (`haulMs`).
    reloadMs: 1400, teleMs: 1000, trackMs: 200, back: 50, swingMs: 650, over: 40, arm: 230, radius: 24, damage: 2,
    lowMs: 2000, haulMs: 900,
    // Her cords: `cords` goules at most tethered to the sac, fed (+1 hp every `feedMs`, up to a ghoul's) and kept within
    // `tether` (floor) of the pivot; one born every `birthMs` while fewer. A cord is cut by a claw across its low part (by
    // the goule; nearer her it hangs high) or the goule's death. Each cut cord bares the sac: a blow on her deals its
    // share of the cords cut (none cut: nothing).
    cords: 3, tether: 100, feedMs: 1500, birthMs: 9000,
    // Phase 2, at half her blood: the chains snap, the wheel shudders and spins, the sac tears (`tearMs`), `burst` young
    // goules spill out (untethered), then one every `broodMs` while fewer than `brood` of hers live; the cords are gone and
    // every blow on her lands whole. The swing, faster and wider: a tell of `tele2Ms`, out to `over2` past him (at most
    // `arm2`) and back to the pivot in `swing2Ms`, striking both ways; then low at the bottom of its swing (`low2Ms`).
    tearMs: 1600, burst: 3, brood: 4, broodMs: 6000, tele2Ms: 800, swing2Ms: 1000, over2: 60, arm2: 260, low2Ms: 1500,
    light: 1.4, teleLight: 3.4, // the sac's glow in the dark, blazing on the tell
  },

  // ---- The necropolis' own fauna (docs/maquettes/necropole-ennemis-planche-1.png, names provisional). Their damage is
  // in today's drops of life (T.hero.maxHealth 5): for the coming 50 HP pool, multiply it by 10. ----

  // Les Corneilles (crows.ts): a flock of `birds` carrion crows pecking at the dead, sentinels. The hero within `notice`
  // of them (only `shade` while he keeps out of the light), or a fight within `noise` of them (a claw swung, a blow on
  // him, a death), and they burst up cawing (`burstMs`): every foe within `alarm` that is not hunting comes to look
  // where they rose, at its pace (it gives up `lookMs` later). Up, they wheel `height` px over him while he stays within
  // `stay` of where they rose; every `diveEveryMs` one hangs shrieking over him, talons out (`diveTellMs`, its aim locked
  // on where he stood), then stoops on that spot (`diveMs`): struck within `peckRadius` (floor). Struck (claws, a shard,
  // anything), they scatter cawing (the alarm again) and settle back on their dead `backMs` later. They cannot die.
  crows: {
    hp: 1, speed: 80, birds: 6,
    notice: 90, shade: 50, noise: 150, alarm: 320, lookMs: 9000,
    burstMs: 700,
    stay: 150, height: 46, wheel: 24,
    diveEveryMs: 1700, diveTellMs: 500, diveMs: 200, peckRadius: 10, damage: 1,
    backMs: 20000,
  },
  // L'Enterré (enterre.ts): a dead man half under his grave mound, only his fingers and his eyes above the earth; blows
  // do nothing to him there. The hero's feet within `trigger` of his middle (floor) and the earth cracks, a hand claws up
  // (`crackMs`, the tell: the cracking is heard); still within `reach` at its end (no mist), he is caught by the ankle:
  // `damage` at once and every `tickMs`, dragged toward the mound at `drag` px/s, until he struggles free: `free` points,
  // a claw landing on him `blow`, a direction key pressed anew `key`. Then he sinks back (`sinkMs`, the time to strike him)
  // and waits under `rearmMs` more. Never moves; others punish a hero held.
  enterre: {
    hp: 6, speed: 0,
    trigger: 22, crackMs: 550, reach: 30,
    damage: 1, tickMs: 1200, drag: 8,
    free: 6, blow: 2, key: 1,
    sinkMs: 1400, rearmMs: 1500,
    firstMs: 0,
  },
  // Le Gavé (gave.ts): slow and heavy, blows never cut it short nor push it back. It eats the dead within `smell` (floor)
  // when it is not hunting, or when a body lies nearer than the hero: `eatMs` over it (struck meanwhile, it eats on),
  // then the body is gone and it grows (the k-th: `grow.scale` bigger, `grow.hp` more blood and `grow.heal` back, its
  // blows `grow.damage` harder, rounded down), `max` bodies at most. Kill it before it feeds.
  // The slam: up on its legs, arms high (`slamTeleMs`, aim locked), then belly first `slamAhead` ahead: struck within
  // `slamRadius` of where it lands (floor); it lies there `sprawlMs`. The bile: reared back, the throat bulging, a reflux
  // (`bileTeleMs`, aim locked), then it pours black bile in a cone (`bileReach`, `bileHalfDeg`) for `spewMs`; the bile
  // lies there `poolMs`, a pool burning whoever stands in it `poolDamage` (each time his last wound has closed).
  gave: {
    hp: 14, speed: 24,
    near: 20, far: 30,
    smell: 240, eatMs: 2400,
    grow: { scale: 0.14, hp: 4, heal: 6, damage: 0.5 }, max: 3,
    slamRange: 32, slamTeleMs: 750, slamAhead: 18, slamRadius: 24, slamDamage: 2, sprawlMs: 900,
    bileRange: 70, bileTeleMs: 850, bileReach: 64, bileHalfDeg: 22, spewMs: 450, bileDamage: 1, poolMs: 1800, poolDamage: 1,
    recoverMs: 400, reloadMs: 1500, firstMs: 900,
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
    clear: 1.3, // never planted with the hero inside this much of its pool
  },

  // The Eternal Dawn over the cloister's garth: free for a few seconds (the hero sees the danger build), then it burns
  // on a steady beat until he is back in the shade.
  dawn: { graceMs: 2500, burnEveryMs: 1000, damage: 1 },

  // The expeditions (world.ts): out of the refuge, deeper ring by ring, back on foot. A room's foes are placed on its
  // first entry in an expedition and stay dead until the hero is back at the refuge: `groups` groups by ring (the
  // refuge's is 0), each drawn from the ring's `pools` (gentle in the crypt, the Order's men deeper, the Amas, packs of
  // hounds), on spawn points at least `clear` from where he came in and `gap` apart; `guards`, a room's own, stand at
  // its medallion (the Bourreau before the cloister's church). `caches`: the fewest and most blood caches a room hides.
  expedition: {
    groups: [0, 2, 3, 3, 2],
    pools: [
      [],
      [['ghoul', 'ghoul'], ['ghoul', 'ghoul', 'ghoul'], ['ghoul', 'ghoul', 'crossbow']],
      [['ghoul', 'ghoul', 'penitent'], ['penitent', 'penitent', 'penitent'], ['ghoul', 'purifier', 'crossbow'], ['hound', 'hound', 'hound'], ['penitent', 'penitent', 'priest']],
      [['ghoul', 'purifier', 'crossbow', 'crossbow'], ['penitent', 'penitent', 'penitent', 'ringer'], ['hound', 'hound', 'hound', 'crossbow'], ['inquisitor', 'penitent', 'penitent', 'crossbow'], ['amas', 'ghoul', 'ghoul']],
      [['purifier', 'inquisitor', 'penitent', 'priest'], ['hound', 'hound', 'hound', 'crossbow', 'ringer'], ['amas', 'penitent', 'penitent', 'purifier', 'priest']],
    ],
    // Les catacombes' own, by ring (3 by the well, 4 deep): the ghouls' den, the Amas, the Order's hounds and penitents
    // hunting down there (docs/extraction.md §4).
    catacombs: [
      [], [], [],
      [['ghoul', 'ghoul', 'ghoul'], ['ghoul', 'ghoul', 'ghoul', 'ghoul'], ['hound', 'hound', 'penitent'], ['penitent', 'penitent', 'penitent'], ['amas', 'ghoul', 'ghoul']],
      [['ghoul', 'ghoul', 'ghoul', 'ghoul', 'ghoul'], ['amas', 'ghoul', 'ghoul', 'ghoul'], ['hound', 'hound', 'hound', 'penitent'], ['penitent', 'penitent', 'penitent', 'priest'], ['amas', 'amas', 'ghoul'], ['inquisitor', 'hound', 'hound', 'penitent']],
    ],
    guards: { cloister: ['bourreau'] },
    clear: 170, gap: 90, zoneGap: 180, // the zone's groups farther apart (twice T.sight.call): one roused does not wake its neighbours
    caches: [1, 2],
    fadeMs: 450, // to black through an exit; the next room fades in as fast
    titleMs: 1200, // a room's name, or what just happened, stays up this long
  },
  // How a placed foe notices the hero: within `range` (px) with no prop between them, or struck, but only within `shade`
  // while he keeps out of the light (docs/extraction.md §12.3: the baked light at his feet under `lit`, dark.ts's T, 4 at
  // full; no Order lantern's pool; his own lantern does not count); then the others of
  // its pack within `call` hunt with it. Hunting, it keeps him in sight within `keep`, gives up `giveUpMs` after it last
  // saw him and walks back to its post at `homeSpeed` of its pace. None follows him through an exit but the hounds, once
  // (`followMs` after him), never a second room.
  sight: { range: 130, shade: 80, lit: 0.6, keep: 200, call: 90, giveUpMs: 4000, homeSpeed: 0.5, followMs: 1200 },
  // La carte (key C, src/map.ts): an open zone's map shows only what he has seen, cells of `cell` px kept in the save for
  // good: those within `dark` px of him (`lit`: in light, as for the foes above), his sight stopped by rock and walls but
  // for their first `into` px (so the edges he faces are drawn).
  carte: { cell: 32, dark: 120, lit: 190, into: 24 },
  // Blood carried, apart from life: the dead drop `drops` of their kind (an Amas' torn ghouls none), a cache holds
  // `cache`, both times the ring's multiplier `ring`. Picked up within `pickup` px of his feet, searched within
  // `search`; at most `bag` carried (to be raised at the refuge). All of it lost at death; banked by walking up to the
  // refuge's basin (within `basin`).
  blood: {
    ring: [0, 1, 3, 8, 20],
    drops: { ghoul: 1, crossbow: 2, penitent: 2, hound: 2, purifier: 3, priest: 3, ringer: 3, inquisitor: 5, amas: 6, bourreau: 15, nourrice: 20, matrice: 20, enterre: 3, gave: 8 }, // (a flock of crows never dies of a blow),
    cache: 5,
    pickup: 16, search: 24, bag: 400, basin: 52,
  },
  // The blood's scent (docs/extraction.md §5): every `every` blood carried (picked up) looses a pack of the battue, with
  // a distant horn and a line. It lies in wait across the zone on his way back to the refuge (world.ts loose()), the
  // first point of it at least `far` px from him (out of sight; from a room, from its door), every other pack before the
  // refuge's stairs (`door` walk cells short of them). The k-th pack loosed in an expedition is `packs[k - 1]` (the last
  // repeats): hounds first, then an Inquisiteur with his. Too near the refuge for that, it waits until he is farther.
  // Down in the catacombs, the packs wait at their narrow ways, every other one up in the necropolis on his way home.
  battue: {
    every: 80,
    packs: [['hound', 'hound'], ['hound', 'hound', 'hound'], ['inquisitor', 'hound', 'hound']],
    far: 300, door: 8,
    up: 120, // from the catacombs, every other pack waits up in the necropolis, this far at least from the door he comes up by
  },

  // Le Rongé, the refuge's merchant (docs/lore.md), crouched by the basin (refuge.ts RONGE): F within `talk` of him
  // opens his wares, paid with the blood banked; he raises his head at the hero within `notice`. Prices: the bite once,
  // max life and the bag by ranks at `cost` x `mult` to the rank bought (40, 72, 130, 233; 60, 108, 194), the bag `size`
  // blood and one item (T.items.bag) bigger a rank. Back `hunger` times (returns or deaths) without pouring into the basin, he turns beast: wares
  // closed until blood is poured again.
  ronge: {
    talk: 40, notice: 90,
    bite: 80,
    life: { cost: 40, mult: 1.8, ranks: 4 },
    bag: { cost: 60, mult: 1.8, ranks: 3, size: 100 },
    hunger: 3,
  },

  // Vesna la Grise, freed, at her shop in the refuge (refuge.ts VESNA): F within `talk` of her opens her stall, the
  // Rat house's powers (powers.ts) for the blood banked: the k-th of the slot powers bought costs `cost` x `mult`^k
  // (100, 150, 225, 338, 506, 759, 1139, 1709), la Nuée `swarm`.
  vesna: { talk: 40, cost: 100, mult: 1.5, swarm: 1200 },

  // Items (items.ts, docs/extraction.md §6): found on an expedition, lost at death until brought back to the refuge,
  // where they are acquired for good (its chest). Worn in `slots` by family; carried in a bag of `bag` items, one more
  // a rank of le Rongé's bag. Found: in a cache, by its ring's `cache` chance (every cache of the zone's `sure` areas:
  // the Order's camp chest), on the body of an `elite`; of a rarity drawn by the ring's `odds` [commun, rare, épique];
  // picked up (F) within `pickup`. A weapon's bleed: its number of hp over `bleedMs`, in `bleedTicks` blows. Each item's
  // numbers below are triples [commun, rare, épique], bonuses summed over the items worn (items.ts stats()): a fraction
  // (+0.2: 20 % more, -0.2: 20 % less) unless said.
  items: {
    bag: 4,
    slots: { arme: 1, relique: 2, talisman: 3 },
    cache: [0, 0.3, 0.4, 0.5, 0.6],
    odds: [[1, 0, 0], [0.9, 0.1, 0], [0.6, 0.33, 0.07], [0.35, 0.45, 0.2], [0.2, 0.45, 0.35]],
    sure: ['camp'],
    elites: ['inquisitor', 'amas', 'bourreau', 'nourrice', 'matrice'],
    pickup: 22,
    bleedMs: 2000, bleedTicks: 4,
    defs: {
      // Armes: the claws. claw: their damage; pace: their cooldown; finisher: added to the finisher's x2; knock: its
      // knockback; reach: px added to their range; arc: degrees added; bleed: hp bled (see bleedMs); leech: the chance a
      // killing finisher gives back one life.
      acier: { claw: [0.25, 0.4, 0.6] },
      stylet: { pace: [-0.15, -0.22, -0.3] },
      fer: { finisher: [0.5, 1, 1.5], knock: [0.3, 0.5, 0.8], pace: [0.08, 0.08, 0.08] },
      faucille: { reach: [4, 6, 9], arc: [20, 30, 40] },
      saignee: { bleed: [1, 1.5, 2] },
      goule: { leech: [0.08, 0.12, 0.2] },
      // Reliques. shade: how near a foe notices him out of the light (T.sight.shade); burn: how fast holy light burns
      // him; scent: blood carried for each pack of the battue (T.battue.every); spoils: blood the dead drop; purse: blood
      // carried (added to the bag's); horn: px within which the battue's packs in wait are shown on the screen's edge;
      // mist: the dash's length.
      linceul: { shade: [-0.15, -0.25, -0.35] },
      voile: { burn: [-0.25, -0.4, -0.55] },
      flacon: { scent: [0.25, 0.5, 0.8] },
      calice: { spoils: [0.25, 0.5, 0.75] },
      outre: { purse: [60, 120, 200] },
      cor: { horn: [400, 600, 900] },
      fiole: { mist: [0.2, 0.35, 0.5] },
      // Talismans. life: max life (drops); speed: his walk; dash: the dash's recharge; dmg: all his damage; grace: ms of
      // holy light before it burns.
      chapelet: { life: [1, 1, 2] },
      eperon: { speed: [0.06, 0.1, 0.15] },
      sablier: { dash: [-0.15, -0.25, -0.35] },
      croc: { dmg: [0.1, 0.15, 0.25] },
      cendre: { grace: [200, 350, 500] },
    },
  },

  // Gifts of the Rat house (gifts.ts), toggled in the training room (none is offered on an expedition). The number of a gift with a rarity is named
  // after it, a triple [commun, rare, épique]: the rarity it is offered at picks one (T.rarity).
  gifts: {
    plagueMs: 2000, plagueDamage: 1, // la Peste: an infected enemy loses its gift's number (Contagion's: this) this long after
    contagion: 40, // Contagion (no rarity): the plague of a sick enemy that dies leaps to the enemies this close to it
    // Rats, from any gift: released by a dash (no more than its number of the dash's at once), the glyph arming, the
    // finisher, a throw or a kill; a rat bites once (more with Grouillement), `ratBiteMs` apart.
    ratSpeed: 150, ratLifeMs: 2500, ratDamage: 1, ratBiteMs: 300,
    griffes: [1, 1.5, 2], eclats: [1, 1.5, 2], pestilent: [1, 1.5, 2], miasme: [1, 1.5, 2], // plague givers: its damage
    grouillantes: [2, 3, 4], // Griffes grouillantes: rats released by the finisher
    jet: [1, 1.5, 2], jetRats: 2, // Rat de jet: the thrown rat's bite (the shard does 0.5); no more than `jetRats` running at once
    nid: [3, 4, 5], nuee: [3, 4, 5], // Glyphe du nid, Brume aux rats: rats
    rongeur: [1, 1.5, 2], // extra damage of the combo's third blow
    fuite: [1.4, 1.6, 1.8], // the dash recharges this many times faster
    morsure: [1, 2, 3], // extra blood a bite gives back
    survivant: [1, 2, 3], // extra max health, healed once when taken
    fievre: [1, 2, 3], // Fièvre: the plague strikes this many times more, plagueMs apart
    grouillement: [2, 3, 4], // Grouillement: bites of each rat
  },
  // Pactes de sang: Vesna's darker gifts, a strong gift with a cost (toggled in the training room for now).
  pacts: {
    maigre: { mult: 1.5, maxBlood: 2 }, // every blow of the hero does `mult` times as much; max blood -maxBlood
    noires: { mult: 2, burn: 2 }, // the claws do `mult` times as much; holy light burns `burn` times as fast
    curee: { every: 3, heal: 1, bite: 1 }, // every `every` kills heal `heal`; a bite costs `bite` blood instead of healing
    vermine: { rats: 2, toll: 1 }, // each kill releases `rats` rats; each new room costs `toll` blood (never the last)
  },
  // La Nuée, the Rat house's form of the night: bought from Vesna (powers.ts), R turns the hero into a swarm of rats for
  // `durationMs`: fast (`speed` times his walk), untouchable by blows, it bites every enemy within `radius` (floor),
  // each once every `tickMs`; no claws, shard, bite, glyph or dash. Holy light disperses it at once.
  swarm: { durationMs: 4000, cooldownMs: 18000, speed: 2, radius: 16, damage: 1, tickMs: 350, rats: 11 },
  // The mix's buses in dB (src/ambience.ts), round the levels the sounds are made at; knobs of the training panel.
  audio: { master: 0, ambience: 0, music: 0, effects: 0 },
} as const;
