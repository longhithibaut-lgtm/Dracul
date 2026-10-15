// Every gameplay number in one place. Native resolution is 480x270 (shown at x4 on 1080p, like Hyper Light Drifter).
// Distances in native pixels, durations in milliseconds, speeds in pixels per second.
export const T = {
  width: 480,
  height: 270,

  hero: { maxHealth: 5, speed: 95, hurtInvulnMs: 800 },
  dash: { speed: 330, durationMs: 130, cooldownMs: 380 },
  slash: { range: 30, arcDeg: 130, damage: 1, cooldownMs: 210, comboWindowMs: 450, knockback: 140, hitStopMs: 40 },

  enemy: {
    hp: 3,
    speed: 42,
    stunMs: 200,
    spawnTelegraphMs: 700,
    // Attack: stop and telegraph (windup), then lunge. Only the lunge hurts, so it can be dodged.
    lungeRange: 38,
    windupMs: 450,
    lungeSpeed: 210,
    lungeMs: 200,
    recoverMs: 500,
    damage: 1,
  },
} as const;
