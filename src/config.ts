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
    // Floating platforms (center x/y, size) for verticality + mobility.
    platforms: [
      { x: 268, y: 452, w: 196, h: 18 },
      { x: 1012, y: 452, w: 196, h: 18 },
      { x: 640, y: 330, w: 230, h: 18 },
    ],
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
    runSpeed: 5.2, // target horizontal speed (px/step)
    airControl: 0.55, // fraction of run speed usable in the air
    jumpSpeed: 13.5, // upward velocity on jump
    crippleSpeedMul: 0.45, // movement penalty when both legs are gone
    // "Active ragdoll" posing via direct, clamped angular-velocity steering.
    // Each limb is gently nudged toward a target orientation; stable + predictable.
    poseGain: 0.16, // commanded angular velocity per radian of error
    poseBlend: 0.18, // how hard we steer toward the commanded velocity (0..1)
    poseMaxVel: 0.16, // cap on commanded angular velocity (rad/step)
    rightGain: 0.2, // torso self-righting strength
    rightBlend: 0.18,
    rightMaxVel: 0.18,
    // "Stand support": buoy the torso to standing height while grounded so the
    // figure stands tall on its legs instead of sinking to the floor.
    standHeight: 110, // torso-center height above the floor when standing
    standGain: 0.35,
    standMaxVel: 7,
    standBlend: 0.35,
    // Procedural walk cycle (phase advances with travel distance so feet don't slide).
    strideRate: 0.13, // walk-phase radians per px of speed (lower => slower, readable steps)
    legSwingAmp: 0.8, // fore/aft upper-leg swing (radians)
    kneeBendAmp: 0.9, // knee bend on the lifting half of the step
    armSwingAmp: 0.55, // arm counter-swing while walking
    walkMinSpeed: 0.35, // |vx| above which the walk cycle plays
    // Legs get dedicated strong steering so they actually reach the walk pose
    // (the gentle pose gains can't keep up with the step cadence).
    walkLegGain: 0.55,
    walkLegMaxVel: 0.6,
  },

  combat: {
    perPartHitCooldownMs: 150,
    // Damage = (impactSpeed - threshold) * scale * weapon/bodyMul, capped, then x dmgMul.
    impactThreshold: 4.0,
    damageScale: 1.15,
    weaponMul: 2.4,
    bodyMul: 0.8,
    maxHitDamage: 34, // base per-hit cap (before the per-attack dmgMul)
    coreDamageFrac: 0.6, // fraction of a torso/head hit that drains core HP

    // Moveset. A slash/heavy rotates the whole arm+weapon rigidly about the shoulder
    // (constraint-consistent => a real fast whip); a stab thrusts the weapon forward.
    comboWindowMs: 540, // keep tapping within this to advance the light combo
    chargeMs: 330, // hold the attack key >= this => heavy
    cockOmega: 0.24, // backswing angular velocity during a slash/heavy anticipation
    stabSpeed: 25, // forward thrust speed of the weapon/hand during a stab
    // antMs = anticipation, strikeMs = strike window, omega = strike spin (slash/heavy),
    // lunge = forward hop, dmgMul/knock = damage scale + knockback impulse.
    light: { antMs: 60, strikeMs: 120, cooldownMs: 260, omega: 0.55, lunge: 2.2, dmgMul: 1.0, knock: 2 },
    stab: { antMs: 85, strikeMs: 110, cooldownMs: 320, omega: 0.0, lunge: 5.5, dmgMul: 1.2, knock: 3 },
    heavy: { antMs: 230, strikeMs: 175, cooldownMs: 600, omega: 0.7, lunge: 3.2, dmgMul: 1.85, knock: 9 },
    // Unarmed fallback (when disarmed or the weapon arm is broken): punch + kick.
    punch: { antMs: 50, strikeMs: 90, cooldownMs: 230, omega: 0.62, lunge: 2.4, dmgMul: 0.9, knock: 3 },
    kick: { antMs: 80, strikeMs: 110, cooldownMs: 340, omega: 0.72, lunge: 3.4, dmgMul: 1.15, knock: 6 },
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
