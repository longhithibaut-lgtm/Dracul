// Every gameplay number in one place, so feel can be tuned without hunting through code.
// Distances in pixels, durations in milliseconds, speeds in pixels per second.
export const T = {
  width: 960,
  height: 540,
  wall: 32,

  player: {
    maxBlood: 10,
    speed: 220,
    hurtInvulnMs: 700,
  },
  mist: { speed: 640, durationMs: 160, cooldownMs: 450 },
  claw: { range: 64, arcDeg: 110, damage: 1, cooldownMs: 260, knockback: 260, hitStopMs: 45 },
  bite: { range: 46, arcDeg: 70, damage: 1, heal: 2, cooldownMs: 1400, knockback: 120, hitStopMs: 90 },

  ghoul: {
    hp: 3,
    speed: 105,
    stunMs: 220,
    spawnTelegraphMs: 650,
    // Attack: stop and glow red (windup), then lunge. Only the lunge hurts, so it can be dodged.
    lungeRange: 80,
    windupMs: 420,
    lungeSpeed: 420,
    lungeMs: 220,
    recoverMs: 450,
    damage: 2,
  },
} as const;
