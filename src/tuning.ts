// Every gameplay number in one place. Native resolution is 480x270 (shown at x4 on 1080p, like Hyper Light Drifter).
// Distances in native pixels, durations in milliseconds, speeds in pixels per second.
export const T = {
  width: 480,
  height: 270,

  hero: { maxHealth: 5, speed: 95, hurtInvulnMs: 800 },
  dash: { speed: 330, durationMs: 130, cooldownMs: 380, stopShort: 22 }, // stopShort: halts this far from an enemy it'd end on
  slash: { range: 30, arcDeg: 130, damage: 1, cooldownMs: 210, comboWindowMs: 450, knockback: 140, hitStopMs: 40 },

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
} as const;
