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
    // Weighted locomotion: accelerate toward the target speed (a little ramp =
    // weight), skid harder when reversing, and brake quickly when you let go.
    accel: 0.95, // ground acceleration (px/step per step)
    turnDecel: 1.8, // extra decel when reversing direction (the skid that reads as weight)
    airAccel: 0.42, // weaker control mid-air
    groundFriction: 0.70, // velocity retained per step with no input (quick, deliberate stop)
    airFriction: 0.94,
    runLean: 0.045, // torso lean (rad) per px/step of horizontal speed
    maxLean: 0.24,
    landHardVy: 7.5, // fall speed (px/step) above which a landing thumps (dust + shake)
    jumpSpeed: 13.5, // upward velocity on jump
    crippleSpeedMul: 0.45, // movement penalty when both legs are gone
    // Jump feel.
    doubleJump: true,
    coyoteMs: 110, // grace period to still jump just after leaving the ground
    jumpBufferMs: 130, // press jump slightly before landing and it still fires
    jumpCutMul: 0.45, // release jump early => cut upward velocity (variable height)
    airJumpSpeed: 12.5, // velocity of the mid-air (double) jump
    // Dodge roll (double-tap a direction).
    dodgeSpeed: 15, // horizontal burst speed
    dodgeMs: 240, // dash + i-frame duration
    dodgeCooldownMs: 520,
    doubleTapMs: 270, // max gap between taps to trigger a dodge
    dodgeLean: 0.7, // torso lean (radians) into the roll
    // Block.
    blockMoveMul: 0.35, // movement slowed while guarding
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
    walkLegGain: 0.6,
    walkLegMaxVel: 0.7,
    // Foot-planting IK locomotion: feet lock to the ground while the body moves
    // over them, then step forward (kills the 'ghost gliding' slide).
    stride: 46, // step length (px) before the swing foot plants ahead
    stepLift: 16, // how high the swing foot lifts mid-step (px)
    footSpread: 10, // idle stance width (px from hip center)
    kneeDir: -1, // knee bend direction
  },

  // Evolution branches mutate the ragdoll's abilities (RPG, mainly Survival mode).
  evolution: {
    flyThrust: 1.0, // upward accel per frame while an Aviator holds jump airborne
    flyMaxRise: 7.5, // cap on flight ascent speed
    digCarve: 22, // Burrower tunnel radius (vs default ~8) through powder terrain
    burrowSpeedMul: 1.18, // Burrower ground speed bonus
    titanScale: 1.35, // Titan body-size multiplier (visual + reach)
    beastSpeedMul: 1.28, // Beast ground speed (+ triple jump)
    mutantAura: 6, // Mutant acid-aura paint radius (px); also immune to chemistry
    tinkerJumpMul: 1.45, // Tinker rocket-jump strength
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
    // Deterministic strike hitboxes: during a move's active window we sweep the
    // weapon/fist/foot and reliably hit anyone in range for the move's base damage
    // (x the fighter's damageMul). Connection no longer depends on physics luck.
    meleeReach: 16, // extra px around the limb/weapon that counts as a hit
    // Stamina: every attack + dodge costs it; run out and you're briefly winded.
    stamina: {
      max: 100,
      regenPerSec: 26,
      regenDelayMs: 420, // pause after spending before it refills
      windedMs: 750, // locked out of attacks/dodge when it bottoms out
      cost: { slash: 15, stab: 19, heavy: 32, punch: 11, kick: 17, dodge: 22 },
    },
    // Defense.
    blockDamageMul: 0.18, // damage taken while guarding (from the front)
    blockKnockMul: 0.3, // knockback taken while guarding
    parryWindowMs: 170, // block within this of an incoming hit => parry
    parryStunMs: 650, // attacker is staggered this long on a parry

    // Moveset. A slash/heavy rotates the whole arm+weapon rigidly about the shoulder
    // (constraint-consistent => a real fast whip); a stab thrusts the weapon forward.
    comboWindowMs: 540, // keep tapping within this to advance the light combo
    chargeMs: 330, // hold the attack key >= this => heavy
    cockOmega: 0.24, // backswing angular velocity during a slash/heavy anticipation
    stabSpeed: 25, // forward thrust speed of the weapon/hand during a stab
    // antMs = anticipation, strikeMs = strike window, omega = strike spin (slash/heavy),
    // lunge = forward hop, base = deterministic strike damage, knock = knockback impulse,
    // hitstop = freeze-frames on a clean hit (the "crunch"). dmgMul scales the base.
    light: { antMs: 70, strikeMs: 120, cooldownMs: 300, omega: 0.55, lunge: 2.6, base: 9, dmgMul: 1.0, knock: 5, hitstop: 3 },
    stab: { antMs: 95, strikeMs: 110, cooldownMs: 360, omega: 0.0, lunge: 6.0, base: 13, dmgMul: 1.0, knock: 7, hitstop: 4 },
    heavy: { antMs: 250, strikeMs: 175, cooldownMs: 640, omega: 0.7, lunge: 4.0, base: 22, dmgMul: 1.0, knock: 15, hitstop: 8 },
    // Unarmed fallback (when disarmed or the weapon arm is broken): punch + kick.
    punch: { antMs: 56, strikeMs: 90, cooldownMs: 250, omega: 0.62, lunge: 2.6, base: 7, dmgMul: 1.0, knock: 5, hitstop: 3 },
    kick: { antMs: 90, strikeMs: 110, cooldownMs: 370, omega: 0.72, lunge: 3.6, base: 11, dmgMul: 1.0, knock: 9, hitstop: 4 },
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
