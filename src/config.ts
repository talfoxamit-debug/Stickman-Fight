// Central tunables for the Phase 1 ragdoll duel.
// These are deliberately exposed in one place so the feel can be playtested
// and tweaked without hunting through the simulation code.

export const CFG = {
  view: { width: 1280, height: 720 },

  sim: {
    fixedDt: 1000 / 60, // ms per physics step
    gravityY: 1.0,
    // Stability guards (stop the sim from ever exploding into NaN territory).
    maxLinearSpeed: 28,
    maxAngularSpeed: 1.1,
  },

  arena: {
    floorY: 600,
    floorThickness: 60,
    wallInset: 46, // platform edge inset; beyond the railings = ring-out pit
    railHeight: 78, // edge railing; clearable only by a strong launch/throw
    ringOutY: 760, // fall below this and you're out
  },

  body: {
    headRadius: 15,
    torso: { w: 26, h: 66 },
    upperArm: { w: 10, h: 34 },
    lowerArm: { w: 9, h: 34 },
    upperLeg: { w: 12, h: 38 },
    lowerLeg: { w: 11, h: 40 },
    density: 0.0016,
  },

  control: {
    runSpeed: 4.4, // target horizontal speed (px/step)
    airControl: 0.35, // fraction of run speed usable in the air
    jumpSpeed: 12.5, // upward velocity on jump
    crippleSpeedMul: 0.45, // movement penalty when both legs are gone
    // PD gains for "active ragdoll" posing (normalized by inertia internally).
    rightingKp: 0.12,
    rightingKd: 0.03,
    limbKp: 0.06,
    limbKd: 0.007,
    maxAngAccel: 0.08, // clamp on PD output (rad/step^2-ish)
    walkBobHz: 6, // leg swing frequency while moving
    walkBobAmp: 0.5, // radians
  },

  combat: {
    swingMs: 230,
    swingCooldownMs: 480,
    perPartHitCooldownMs: 150,
    // Damage = (impactSpeed - threshold) * scale * weapon/bodyMul.
    impactThreshold: 4.0,
    damageScale: 1.15,
    weaponMul: 2.4,
    bodyMul: 0.8,
    maxHitDamage: 38, // cap a single blow so fights stay readable (no one-shots)
    coreDamageFrac: 0.6, // fraction of a torso/head hit that drains core HP
  },

  // Joint integrity (HP). 0 => the joint snaps and the limb (+ any held weapon) detaches.
  joints: {
    neck: 130, // tough: decapitation is an earned finish, not a one-shot
    shoulder: 60,
    elbow: 48, // arms still break fairly readily => satisfying "disarm" plays
    hip: 90,
    knee: 72,
  },

  health: { core: 130 },

  rounds: { winsNeeded: 2 }, // best-of-3
} as const;

export type Config = typeof CFG;
