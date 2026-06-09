import Matter from 'matter-js';
import { CFG } from '../config';
import { angleDiff, clamp, lerp } from '../core/util';
import type { PlayerInput } from '../core/input';
import type { BodyMeta, PartName } from '../types';
import { createWeapon, setWeaponOwner, type Weapon } from './weapon';
import { ARMOR, DEFAULT_LOADOUT, makeArmor, type ArmorPiece, type DamageType } from './armor';

const { Bodies, Body, Composite, Constraint } = Matter;

export type Evolution = 'none' | 'aviator' | 'burrower' | 'titan' | 'beast' | 'mutant' | 'tinker';
export const EVOLUTIONS: Evolution[] = ['none', 'aviator', 'burrower', 'titan', 'beast', 'mutant', 'tinker'];

interface Joint {
  name: string;
  child: PartName; // the part that detaches if this joint snaps
  constraint: Matter.Constraint;
  integrity: number;
  max: number;
  broken: boolean;
}

type AttackMotion = 'slash' | 'stab' | 'heavy' | 'punch' | 'kick';

interface AttackDef {
  antMs: number;
  strikeMs: number;
  cooldownMs: number;
  omega: number;
  lunge: number;
  dmgMul: number;
  knock: number;
}

interface ActiveAttack {
  motion: AttackMotion;
  dir: number; // swing direction (±facing)
  start: number;
  antMs: number; // anticipation window
  strikeMs: number; // strike window
  omega: number; // strike spin
  lunge: number;
  dmgMul: number;
  knock: number;
  lunged: boolean;
  limb?: 'L' | 'R'; // which arm/leg for punch/kick
}

const B = CFG.body;

/** One ragdoll stickman with active-ragdoll posing and breakable joints. */
export class Fighter {
  readonly id: number;
  readonly group: number;
  readonly color: string;
  readonly accent: string;
  readonly name: string;

  parts = {} as Record<PartName, Matter.Body>;
  joints: Joint[] = [];
  private jointByChild = new Map<PartName, Joint>();

  weapon: Weapon | null = null;
  private grip: Matter.Constraint | null = null;
  /** Weapons released this step (by a thrown drop or an arm break); drained by Match. */
  justDropped: Weapon[] = [];
  /** Joints severed this step (positions for blood spray); drained by Match. */
  justBroke: { x: number; y: number }[] = [];
  /** Material-aware armor per limb (absorbs damage, then breaks off). */
  armor: Partial<Record<PartName, ArmorPiece>> = makeArmor(DEFAULT_LOADOUT);

  armorAt(part: PartName): ArmorPiece | undefined {
    return this.armor[part];
  }

  coreHealth: number = CFG.health.core;
  maxCore: number = CFG.health.core;
  koed = false;
  grounded = false;
  facing: 1 | -1 = 1;
  evolution: Evolution = 'none';
  speedMul = 1; // movement multiplier (fast monsters, buffs)
  damageMul = 1; // outgoing attack damage multiplier (upgrades)

  private targets = {} as Record<PartName, number>;
  private lastHit = {} as Record<PartName, number>;
  private prevJump = false;
  private prevAttack = false;
  private attack: ActiveAttack | null = null;
  private comboStep = 0;
  private comboResetAt = 0;
  private attackHeldSince = -1;
  private heavyArmed = false;
  private swingCooldownUntil = 0;
  private walking = false;
  private walkDir = 1;
  // Foot-planting IK locomotion state.
  private footPlantX: [number, number] = [0, 0];
  private swingStartX: [number, number] = [0, 0];
  private swingFoot = 0;
  private swingPhase = 1; // 1 = both feet planted
  private gaitPhase = 0;
  private feetInit = false;
  // Resolved IK joint positions for rendering planted-foot legs.
  private ikValid = false;
  private ikHip = { x: 0, y: 0 };
  private ikL = { kx: 0, ky: 0, fx: 0, fy: 0 };
  private ikR = { kx: 0, ky: 0, fx: 0, fy: 0 };
  // Mobility / defense.
  blocking = false;
  manualFacing = false;
  private blockStart = 0;
  private dodgeUntil = 0;
  private dodgeCooldownUntil = 0;
  private dodgeDir = 1;
  private lastTapDir = 0;
  private lastTapAt = -9999;
  private prevLeft = false;
  private prevRight = false;
  private airJumps = 0;
  private lastGroundedAt = 0;
  private jumpBufferedAt = -9999;
  private jumpingUp = false;
  private staggerUntil = 0;

  constructor(
    private world: Matter.World,
    opts: { id: number; x: number; facing: 1 | -1; color: string; accent: string; name: string; weaponIndex: number },
  ) {
    this.id = opts.id;
    this.group = -(opts.id + 1); // unique negative group => own parts never self-collide
    this.color = opts.color;
    this.accent = opts.accent;
    this.name = opts.name;
    this.facing = opts.facing;
    this.build(opts.x, CFG.arena.floorY - 120, opts.weaponIndex);
  }

  // ---- construction -------------------------------------------------------

  private mkPart(part: PartName, x: number, y: number, w: number, h: number, kind: BodyMeta['kind']): Matter.Body {
    const isHead = part === 'head';
    const body = isHead
      ? Bodies.circle(x, y, w / 2, { density: B.density })
      : Bodies.rectangle(x, y, w, h, { density: B.density, chamfer: { radius: w * 0.45 } });
    body.friction = 0.6;
    body.frictionAir = 0.012;
    body.collisionFilter.group = this.group;
    body.label = `${this.name}:${part}`;
    const meta: BodyMeta = { fighterId: this.id, part, kind };
    (body as unknown as { meta: BodyMeta }).meta = meta;
    this.parts[part] = body;
    this.targets[part] = 0;
    this.lastHit[part] = -9999;
    return body;
  }

  private link(name: string, parent: PartName, child: PartName, parentOffY: number, childOffY: number, integrity: number): void {
    const c = Constraint.create({
      bodyA: this.parts[parent],
      bodyB: this.parts[child],
      pointA: { x: 0, y: parentOffY },
      pointB: { x: 0, y: childOffY },
      stiffness: 0.85,
      damping: 0.18,
      length: 0,
    });
    const joint: Joint = { name, child, constraint: c, integrity, max: integrity, broken: false };
    this.joints.push(joint);
    this.jointByChild.set(child, joint);
    Composite.add(this.world, c);
  }

  private build(x: number, y: number, weaponIndex: number): void {
    const t = B.torso, ua = B.upperArm, la = B.lowerArm, ul = B.upperLeg, ll = B.lowerLeg;
    const torsoTop = y - t.h / 2;
    const torsoBot = y + t.h / 2;
    const shoulderY = torsoTop + 8;

    this.mkPart('torso', x, y, t.w, t.h, 'core');
    this.mkPart('head', x, torsoTop - B.headRadius - 4, B.headRadius * 2, B.headRadius * 2, 'head');

    this.mkPart('upperArmL', x - 14, shoulderY + ua.h / 2, ua.w, ua.h, 'limb');
    this.mkPart('lowerArmL', x - 14, shoulderY + ua.h + la.h / 2, la.w, la.h, 'limb');
    this.mkPart('upperArmR', x + 14, shoulderY + ua.h / 2, ua.w, ua.h, 'limb');
    this.mkPart('lowerArmR', x + 14, shoulderY + ua.h + la.h / 2, la.w, la.h, 'limb');

    this.mkPart('upperLegL', x - 7, torsoBot + ul.h / 2, ul.w, ul.h, 'limb');
    this.mkPart('lowerLegL', x - 7, torsoBot + ul.h + ll.h / 2, ll.w, ll.h, 'limb');
    this.mkPart('upperLegR', x + 7, torsoBot + ul.h / 2, ul.w, ul.h, 'limb');
    this.mkPart('lowerLegR', x + 7, torsoBot + ul.h + ll.h / 2, ll.w, ll.h, 'limb');

    const J = CFG.joints;
    this.link('neck', 'torso', 'head', -t.h / 2 + 2, B.headRadius - 2, J.neck);
    this.link('shoulderL', 'torso', 'upperArmL', -t.h / 2 + 10, -ua.h / 2, J.shoulder);
    this.link('elbowL', 'upperArmL', 'lowerArmL', ua.h / 2, -la.h / 2, J.elbow);
    this.link('shoulderR', 'torso', 'upperArmR', -t.h / 2 + 10, -ua.h / 2, J.shoulder);
    this.link('elbowR', 'upperArmR', 'lowerArmR', ua.h / 2, -la.h / 2, J.elbow);
    this.link('hipL', 'torso', 'upperLegL', t.h / 2 - 4, -ul.h / 2, J.hip);
    this.link('kneeL', 'upperLegL', 'lowerLegL', ul.h / 2, -ll.h / 2, J.knee);
    this.link('hipR', 'torso', 'upperLegR', t.h / 2 - 4, -ul.h / 2, J.hip);
    this.link('kneeR', 'upperLegR', 'lowerLegR', ul.h / 2, -ll.h / 2, J.knee);

    for (const p of Object.values(this.parts)) Composite.add(this.world, p);

    // Start holding a weapon in the right hand.
    const hand = this.parts.lowerArmR;
    const w = createWeapon(weaponIndex, hand.position.x, hand.position.y - 30, this.group, this.id);
    Composite.add(this.world, w.body);
    this.attachWeapon(w);
  }

  // ---- weapon -------------------------------------------------------------

  hasWeapon(): boolean {
    return this.weapon !== null;
  }

  handPos(): Matter.Vector {
    return this.parts.lowerArmR.position;
  }

  attachWeapon(weapon: Weapon): void {
    if (this.weapon) return;
    setWeaponOwner(weapon, this.id, this.group);
    const hand = this.parts.lowerArmR;
    this.grip = Constraint.create({
      bodyA: hand,
      bodyB: weapon.body,
      pointA: { x: 0, y: B.lowerArm.h / 2 },
      pointB: { x: 0, y: weapon.def.len / 2 - 6 },
      stiffness: 0.9,
      damping: 0.2,
      length: 0,
    });
    Composite.add(this.world, this.grip);
    this.weapon = weapon;
  }

  dropWeapon(throwImpulse = 0): Weapon | null {
    const w = this.weapon;
    if (!w || !this.grip) return null;
    Composite.remove(this.world, this.grip);
    this.grip = null;
    this.weapon = null;
    setWeaponOwner(w, -1, w.body.collisionFilter.group ?? this.group);
    if (throwImpulse > 0) {
      Body.setVelocity(w.body, { x: this.facing * throwImpulse, y: -throwImpulse * 0.4 });
      Body.setAngularVelocity(w.body, this.facing * 0.4);
    }
    this.justDropped.push(w);
    return w;
  }

  // ---- per-step control ---------------------------------------------------

  applyControl(now: number, input: PlayerInput): void {
    if (this.koed) return;
    const torso = this.parts.torso;
    const C = CFG.control;

    if (this.grounded) {
      this.lastGroundedAt = now;
      this.airJumps = this.evolution === 'beast' ? 2 : C.doubleJump ? 1 : 0;
    }

    // Staggered (just got parried): briefly stunned, no control.
    if (now < this.staggerUntil) {
      this.prevJump = input.jump;
      this.prevAttack = input.attack;
      this.poseAndDrive(now);
      return;
    }

    const legsLost = this.legsLost();

    // Aim: mouse cursor sets facing for P1; otherwise Match faces the opponent.
    this.manualFacing = false;
    if (input.aimX != null) {
      this.facing = input.aimX >= torso.position.x ? 1 : -1;
      this.manualFacing = true;
    }

    // Dodge roll: double-tap a direction.
    const leftEdge = input.left && !this.prevLeft;
    const rightEdge = input.right && !this.prevRight;
    if (now >= this.dodgeCooldownUntil && legsLost < 2) {
      if (leftEdge) this.tryDodge(now, -1);
      if (rightEdge) this.tryDodge(now, 1);
    }
    this.prevLeft = input.left;
    this.prevRight = input.right;
    const dodging = now < this.dodgeUntil;

    // Block / guard (grounded, not dodging or mid-attack).
    const wantBlock = input.block && this.grounded && !dodging && this.attack === null && legsLost < 2;
    if (wantBlock && !this.blocking) this.blockStart = now;
    this.blocking = wantBlock;

    // Horizontal movement.
    if (dodging) {
      Body.setVelocity(torso, { x: this.dodgeDir * C.dodgeSpeed, y: torso.velocity.y });
    } else {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let speed = C.runSpeed * this.speedMul * (legsLost >= 2 ? C.crippleSpeedMul : 1);
      if (this.evolution === 'burrower') speed *= CFG.evolution.burrowSpeedMul;
      if (this.evolution === 'beast') speed *= CFG.evolution.beastSpeedMul;
      if (this.blocking) speed *= C.blockMoveMul;
      if (!this.grounded) speed *= C.airControl + 0.65;
      if (dir !== 0) {
        const desired = dir * speed;
        const t = this.grounded ? 0.45 : 0.12;
        Body.setVelocity(torso, { x: torso.velocity.x + (desired - torso.velocity.x) * t, y: torso.velocity.y });
      } else if (this.grounded) {
        Body.setVelocity(torso, { x: torso.velocity.x * 0.8, y: torso.velocity.y });
      }
    }

    // Gait state for the foot-planting locomotion.
    const vx = torso.velocity.x;
    this.walking = this.grounded && !dodging && Math.abs(vx) > C.walkMinSpeed;
    if (this.walking) this.walkDir = Math.sign(vx);

    // Jump: buffer + coyote time + double jump + variable height.
    if (input.jump && !this.prevJump) this.jumpBufferedAt = now;
    const buffered = now - this.jumpBufferedAt <= C.jumpBufferMs;
    const coyote = now - this.lastGroundedAt <= C.coyoteMs;
    if (buffered && legsLost < 2 && !dodging) {
      if (this.grounded || coyote) {
        this.doJump(C.jumpSpeed);
        this.jumpBufferedAt = -9999;
        this.lastGroundedAt = -9999;
        this.jumpingUp = true;
      } else if (this.airJumps > 0) {
        this.doJump(C.airJumpSpeed);
        this.airJumps--;
        this.jumpBufferedAt = -9999;
        this.jumpingUp = true;
      }
    }
    if (this.jumpingUp && !input.jump && torso.velocity.y < 0) {
      Body.setVelocity(torso, { x: torso.velocity.x, y: torso.velocity.y * C.jumpCutMul });
      this.jumpingUp = false;
    }
    if (torso.velocity.y >= 0) this.jumpingUp = false;
    // Aviator flight: hold jump in the air to thrust/hover (whole body so it lifts).
    if (this.evolution === 'aviator' && !this.grounded && input.jump) {
      for (const p of Object.keys(this.parts) as PartName[]) {
        if (this.isBroken(p)) continue;
        const b = this.parts[p];
        Body.setVelocity(b, { x: b.velocity.x, y: Math.max(b.velocity.y - CFG.evolution.flyThrust, -CFG.evolution.flyMaxRise) });
      }
      this.jumpingUp = false;
    }
    this.prevJump = input.jump;

    // Stand support (skipped during a dodge).
    if (!dodging && this.grounded && legsLost < 2 && torso.velocity.y > -2) {
      const targetY = CFG.arena.floorY - C.standHeight;
      const err = targetY - torso.position.y;
      if (err < -2) {
        const desiredVy = clamp(err * C.standGain, -C.standMaxVel, 0);
        Body.setVelocity(torso, {
          x: torso.velocity.x,
          y: torso.velocity.y + (desiredVy - torso.velocity.y) * C.standBlend,
        });
      }
    }

    // Attacks are locked out while blocking or dodging.
    if (!this.blocking && !dodging) this.handleAttackInput(now, input);
    else this.prevAttack = input.attack;

    this.poseAndDrive(now);
  }

  private doJump(speed: number): void {
    const s = this.evolution === 'tinker' ? speed * CFG.evolution.tinkerJumpMul : speed;
    for (const p of Object.keys(this.parts) as PartName[]) {
      if (this.isBroken(p)) continue;
      const b = this.parts[p];
      Body.setVelocity(b, { x: b.velocity.x, y: -s });
    }
    this.grounded = false;
  }

  private tryDodge(now: number, dir: number): void {
    if (this.lastTapDir === dir && now - this.lastTapAt <= CFG.control.doubleTapMs) {
      this.dodgeDir = dir;
      this.dodgeUntil = now + CFG.control.dodgeMs;
      this.dodgeCooldownUntil = now + CFG.control.dodgeCooldownMs;
      this.lastTapDir = 0;
      this.lastTapAt = -9999;
      const t = this.parts.torso;
      Body.setVelocity(t, { x: dir * CFG.control.dodgeSpeed, y: Math.min(t.velocity.y, -2.5) });
    } else {
      this.lastTapDir = dir;
      this.lastTapAt = now;
    }
  }

  // ---- defense queries (for the damage system) ----------------------------

  isDodging(now: number): boolean {
    return now < this.dodgeUntil;
  }
  isBlocking(): boolean {
    return this.blocking;
  }
  blockAge(now: number): number {
    return now - this.blockStart;
  }
  stagger(now: number, ms: number): void {
    this.staggerUntil = Math.max(this.staggerUntil, now + ms);
    this.attack = null;
    this.blocking = false;
  }

  // ---- attacks ------------------------------------------------------------

  /** Tap = light combo; hold past chargeMs = heavy. Falls back to punch/kick if disarmed. */
  private handleAttackInput(now: number, input: PlayerInput): void {
    const C = CFG.combat;
    const ready = !this.koed && (this.canStrikeArmed() || this.canStrikeUnarmed());
    if (now > this.comboResetAt) this.comboStep = 0;

    const a = input.attack;
    if (a && !this.prevAttack) {
      this.attackHeldSince = now;
      this.heavyArmed = false;
    }
    // Heavy fires once the key has been held long enough (armed only).
    if (a && this.canStrikeArmed() && !this.heavyArmed && !this.attack && this.attackHeldSince >= 0 &&
        now - this.attackHeldSince >= C.chargeMs && now >= this.swingCooldownUntil) {
      this.begin(now, 'heavy', this.facing, C.heavy);
      this.comboStep = 0;
      this.heavyArmed = true;
    }
    // Light combo fires on release of a short tap.
    if (!a && this.prevAttack) {
      if (!this.heavyArmed && ready && now >= this.swingCooldownUntil &&
          this.attackHeldSince >= 0 && now - this.attackHeldSince < C.chargeMs) {
        this.startLightCombo(now);
      }
      this.attackHeldSince = -1;
    }
    this.prevAttack = a;
  }

  private canStrikeArmed(): boolean {
    return this.hasWeapon() && !this.isBroken('upperArmR') && !this.isBroken('lowerArmR');
  }
  private canStrikeUnarmed(): boolean {
    return this.intactArm() !== null || this.intactLeg() !== null;
  }
  private intactArm(): 'L' | 'R' | null {
    if (!this.isBroken('upperArmL') && !this.isBroken('lowerArmL')) return 'L';
    if (!this.isBroken('upperArmR') && !this.isBroken('lowerArmR')) return 'R';
    return null;
  }
  private intactLeg(): 'L' | 'R' | null {
    if (!this.isBroken('upperLegR') && !this.isBroken('lowerLegR')) return 'R';
    if (!this.isBroken('upperLegL') && !this.isBroken('lowerLegL')) return 'L';
    return null;
  }

  private begin(now: number, motion: AttackMotion, dir: number, def: AttackDef, limb?: 'L' | 'R'): void {
    this.attack = {
      motion, dir, start: now, antMs: def.antMs, strikeMs: def.strikeMs, omega: def.omega,
      lunge: def.lunge, dmgMul: def.dmgMul, knock: def.knock, lunged: false, limb,
    };
    this.swingCooldownUntil = now + def.cooldownMs;
  }

  private startLightCombo(now: number): void {
    const C = CFG.combat;
    const f = this.facing;
    const step = this.comboStep;
    if (this.canStrikeArmed()) {
      if (step === 2) this.begin(now, 'stab', f, C.stab);
      else this.begin(now, 'slash', step === 0 ? f : -f, C.light); // forehand, then backhand
    } else {
      const arm = this.intactArm();
      const leg = this.intactLeg();
      if (step === 2 && leg) this.begin(now, 'kick', f, C.kick, leg);
      else if (arm) this.begin(now, 'punch', step === 0 ? f : -f, C.punch, arm);
      else if (leg) this.begin(now, 'kick', f, C.kick, leg);
      else return;
    }
    this.comboStep = (step + 1) % 3;
    this.comboResetAt = now + C.comboWindowMs;
  }

  /** Power exposed to the damage system for the current attack (or neutral). */
  attackPower(): { dmgMul: number; knock: number } {
    return this.attack ? { dmgMul: this.attack.dmgMul * this.damageMul, knock: this.attack.knock } : { dmgMul: 1, knock: 0 };
  }

  /** True while an attack is winding up or striking (used by the AI to react). */
  isAttacking(): boolean {
    return this.attack !== null;
  }

  /** True during the active strike window (used by emitter weapons to spray). */
  isStriking(now: number): boolean {
    const a = this.attack;
    return a !== null && now - a.start >= a.antMs && now < a.start + a.antMs + a.strikeMs;
  }

  isCharging(now: number): boolean {
    return this.prevAttack && !this.heavyArmed && !this.attack && this.attackHeldSince >= 0 &&
      now - this.attackHeldSince >= 110 && this.canStrikeArmed();
  }

  private attackEnd(): number {
    return this.attack ? this.attack.start + this.attack.antMs + this.attack.strikeMs : 0;
  }

  /** Runs the active attack and returns the parts it is driving (so posing skips them). */
  private executeAttack(now: number): PartName[] {
    const atk = this.attack!;
    const striking = now - atk.start >= atk.antMs;
    const cock = CFG.combat.cockOmega;

    if (atk.motion === 'punch' || atk.motion === 'kick') {
      const isArm = atk.motion === 'punch';
      const s = atk.limb ?? 'L';
      const upper = (isArm ? `upperArm${s}` : `upperLeg${s}`) as PartName;
      const lower = (isArm ? `lowerArm${s}` : `lowerLeg${s}`) as PartName;
      if (this.isBroken(upper) || this.isBroken(lower)) { this.attack = null; return []; }
      this.lungeOnce(atk, striking);
      const pivot = isArm ? this.shoulderPivot() : this.hipPivot();
      this.rigidSwing([this.parts[upper], this.parts[lower]], pivot, striking ? atk.dir * atk.omega : -atk.dir * cock);
      return [upper, lower];
    }

    // Weapon attacks (slash / stab / heavy) use the right arm.
    if (this.isBroken('upperArmR') || this.isBroken('lowerArmR')) { this.attack = null; return []; }
    this.lungeOnce(atk, striking);
    if (atk.motion === 'stab') {
      if (striking) this.stabForward(atk.dir);
      else this.swingArm(-atk.dir * cock);
    } else {
      this.swingArm(striking ? atk.dir * atk.omega : -atk.dir * cock);
    }
    return ['upperArmR', 'lowerArmR'];
  }

  private lungeOnce(atk: ActiveAttack, striking: boolean): void {
    if (striking && !atk.lunged) {
      const t = this.parts.torso;
      Body.setVelocity(t, { x: t.velocity.x + atk.dir * atk.lunge, y: t.velocity.y });
      atk.lunged = true;
    }
  }

  private shoulderPivot(): { x: number; y: number } {
    const t = this.parts.torso;
    const a = -(CFG.body.torso.h / 2 - 10);
    return { x: t.position.x - a * Math.sin(t.angle), y: t.position.y + a * Math.cos(t.angle) };
  }
  private hipPivot(): { x: number; y: number } {
    const t = this.parts.torso;
    const a = CFG.body.torso.h / 2 - 4;
    return { x: t.position.x - a * Math.sin(t.angle), y: t.position.y + a * Math.cos(t.angle) };
  }

  /** Rotate a limb chain (+held weapon) rigidly about a pivot (constraint-consistent). */
  private rigidSwing(parts: Matter.Body[], pivot: { x: number; y: number }, omega: number): void {
    const cap = CFG.sim.maxLinearSpeed * 0.78;
    for (const b of parts) {
      let vx = -omega * (b.position.y - pivot.y);
      let vy = omega * (b.position.x - pivot.x);
      const sp = Math.hypot(vx, vy);
      if (sp > cap) { vx = (vx / sp) * cap; vy = (vy / sp) * cap; }
      Body.setVelocity(b, { x: vx, y: vy });
      Body.setAngularVelocity(b, omega);
    }
  }

  private swingArm(omega: number): void {
    const parts: Matter.Body[] = [this.parts.upperArmR, this.parts.lowerArmR];
    if (this.weapon) parts.push(this.weapon.body);
    this.rigidSwing(parts, this.shoulderPivot(), omega);
  }

  /** Thrust the hand + weapon straight forward; the arm extends, the tip leads. */
  private stabForward(dir: number): void {
    const v = CFG.combat.stabSpeed;
    Body.setVelocity(this.parts.lowerArmR, { x: dir * v, y: this.parts.lowerArmR.velocity.y });
    Body.setVelocity(this.parts.upperArmR, { x: dir * v * 0.55, y: this.parts.upperArmR.velocity.y });
    if (this.weapon) Body.setVelocity(this.weapon.body, { x: dir * v, y: this.weapon.body.velocity.y });
    this.driveAngle('lowerArmR', -dir * 1.45, CFG.control.poseGain * 2.5, 0.5, 0.9);
    this.driveAngle('upperArmR', -dir * 1.2, CFG.control.poseGain * 2.5, 0.5, 0.9);
  }

  /** Compute target pose angles + apply active-ragdoll steering (walk cycle + swing). */
  private poseAndDrive(now: number): void {
    const c = CFG.control;
    const f = this.facing;

    this.targets.head = 0;

    // Dodge roll: lean hard into the dash and curl up; no upright righting.
    if (now < this.dodgeUntil) {
      this.driveAngle('torso', this.dodgeDir * c.dodgeLean, c.rightGain * 2.5, c.rightBlend, c.rightMaxVel * 3);
      const tilt = this.parts.torso.angle;
      for (const p of Object.keys(this.targets) as PartName[]) {
        if (p === 'torso' || this.isBroken(p)) continue;
        this.driveAngle(p, tilt, c.poseGain * 2.2, c.poseBlend, c.poseMaxVel * 2.2);
      }
      return;
    }

    // Legs: foot-planting IK (feet lock to the ground; body pivots over them).
    this.updateLegs();
    // Arms counter-swing with the gait.
    this.gaitPhase += Math.abs(this.parts.torso.velocity.x) / CFG.control.stride;
    const armS = this.walking ? Math.sin(this.gaitPhase) * c.armSwingAmp : 0;
    this.targets.upperArmL = -0.5 * f + armS;
    this.targets.lowerArmL = -0.7 * f;

    // Weapon-arm rest pose (used when not mid-swing): held up-and-forward as a guard.
    this.targets.upperArmR = 0.7 * f;
    this.targets.lowerArmR = 0.9 * f;

    // Block: raise both forearms across the front into a guard.
    if (this.blocking) {
      this.targets.upperArmR = -0.35 * f;
      this.targets.lowerArmR = -1.4 * f;
      this.targets.upperArmL = -0.35 * f;
      this.targets.lowerArmL = -1.25 * f;
    }

    // Torso self-righting (keep upright).
    this.driveAngle('torso', 0, c.rightGain, c.rightBlend, c.rightMaxVel);

    // Run the active attack (returns the limbs it drives), a charged-heavy telegraph,
    // or nothing; posing below skips whatever the attack is steering.
    if (this.attack && now >= this.attackEnd()) this.attack = null;
    let driven: PartName[] = [];
    if (this.attack) {
      driven = this.executeAttack(now);
    } else if (!this.blocking && this.isCharging(now)) {
      this.driveAngle('upperArmR', -2.1 * f, c.poseGain * 2, c.poseBlend, c.poseMaxVel * 2.4);
      this.driveAngle('lowerArmR', -1.3 * f, c.poseGain * 2, c.poseBlend, c.poseMaxVel * 2.4);
      driven = ['upperArmR', 'lowerArmR'];
    }
    const drivenSet = new Set(driven);

    // Drive all remaining (non-broken) segments toward their target pose. Legs get
    // dedicated strong steering while walking so they actually reach the step pose.
    for (const p of Object.keys(this.targets) as PartName[]) {
      if (p === 'torso' || this.isBroken(p) || drivenSet.has(p)) continue;
      const isLeg = p === 'upperLegL' || p === 'lowerLegL' || p === 'upperLegR' || p === 'lowerLegR';
      const gain = isLeg ? c.walkLegGain : c.poseGain;
      const maxVel = isLeg ? c.walkLegMaxVel : c.poseMaxVel;
      const target = this.targets[p] + (p === 'head' ? this.parts.torso.angle : 0);
      this.driveAngle(p, target, gain, c.poseBlend, maxVel);
    }
  }

  /**
   * Foot-planting locomotion: each foot locks to a world position while the body
   * moves over it, then steps forward. Sets the four leg-segment targets via 2-bone IK.
   */
  private updateLegs(): void {
    const c = CFG.control;
    const torso = this.parts.torso;
    const hip = this.hipPivot();
    const groundY = torso.position.y + c.standHeight;
    const L1 = CFG.body.upperLeg.h * 0.96;
    const L2 = CFG.body.lowerLeg.h * 0.96;
    this.ikHip = hip;
    this.ikValid = this.grounded && !this.koed;

    if (!this.feetInit) {
      this.footPlantX = [hip.x - c.footSpread, hip.x + c.footSpread];
      this.swingStartX = [this.footPlantX[0], this.footPlantX[1]];
      this.feetInit = true;
    }

    if (!this.grounded) {
      this.legIK('L', hip, hip.x - 7, groundY - 12, L1, L2);
      this.legIK('R', hip, hip.x + 7, groundY - 12, L1, L2);
      return;
    }

    let lFootX: number, lFootY: number, rFootX: number, rFootY: number;
    if (this.walking) {
      this.swingPhase += Math.abs(torso.velocity.x) / c.stride;
      const sw = this.swingFoot;
      const st = 1 - sw;
      if (this.swingPhase >= 1) {
        this.footPlantX[sw] = hip.x + this.walkDir * c.stride;
        this.swingFoot = st;
        this.swingStartX[st] = this.footPlantX[st];
        this.swingPhase = 0;
      }
      const sp = clamp(this.swingPhase, 0, 1);
      const swingX = lerp(this.swingStartX[this.swingFoot], hip.x + this.walkDir * c.stride, sp);
      const swingY = groundY - Math.sin(sp * Math.PI) * c.stepLift;
      const stanceX = this.footPlantX[1 - this.swingFoot];
      const swIsLeft = this.swingFoot === 0;
      lFootX = swIsLeft ? swingX : stanceX;
      lFootY = swIsLeft ? swingY : groundY;
      rFootX = swIsLeft ? stanceX : swingX;
      rFootY = swIsLeft ? groundY : swingY;
    } else {
      this.footPlantX = [hip.x - c.footSpread, hip.x + c.footSpread];
      this.swingPhase = 1;
      lFootX = this.footPlantX[0]; lFootY = groundY;
      rFootX = this.footPlantX[1]; rFootY = groundY;
    }
    this.legIK('L', hip, lFootX, lFootY, L1, L2);
    this.legIK('R', hip, rFootX, rFootY, L1, L2);
  }

  /** 2-bone IK: place the foot at (fx,fy) and set the leg segment target angles. */
  private legIK(side: 'L' | 'R', hip: { x: number; y: number }, fx: number, fy: number, L1: number, L2: number): void {
    let vx = fx - hip.x;
    let vy = fy - hip.y;
    let d = Math.hypot(vx, vy) || 0.001;
    const cd = clamp(d, Math.abs(L1 - L2) + 1, L1 + L2 - 1);
    vx = (vx / d) * cd; vy = (vy / d) * cd; d = cd;
    const a = Math.atan2(vy, vx);
    const cosA = clamp((d * d + L1 * L1 - L2 * L2) / (2 * d * L1), -1, 1);
    const A = Math.acos(cosA);
    const kneeSign = this.facing * CFG.control.kneeDir;
    const upperStd = a - kneeSign * A;
    const kx = hip.x + Math.cos(upperStd) * L1;
    const ky = hip.y + Math.sin(upperStd) * L1;
    const lowerStd = Math.atan2(fy - ky, fx - kx);
    const up = (side === 'L' ? 'upperLegL' : 'upperLegR') as PartName;
    const lo = (side === 'L' ? 'lowerLegL' : 'lowerLegR') as PartName;
    this.targets[up] = Math.atan2(-Math.cos(upperStd), Math.sin(upperStd));
    this.targets[lo] = Math.atan2(-Math.cos(lowerStd), Math.sin(lowerStd));
    const store = side === 'L' ? this.ikL : this.ikR;
    store.kx = kx; store.ky = ky; store.fx = fx; store.fy = fy;
  }

  /** IK leg joint positions for rendering planted-foot legs (invalid when ragdolling). */
  ikLegs(): {
    valid: boolean;
    hip: { x: number; y: number };
    L: { kx: number; ky: number; fx: number; fy: number };
    R: { kx: number; ky: number; fx: number; fy: number };
  } {
    return { valid: this.ikValid && this.feetInit, hip: this.ikHip, L: this.ikL, R: this.ikR };
  }

  /**
   * Stable "active ragdoll" steering: command an angular velocity proportional to the
   * orientation error (capped), then blend the body's current angular velocity toward
   * it. No torque/inertia/dt coupling, so it can't explode into wobble.
   */
  private driveAngle(part: PartName, target: number, gain: number, blend: number, maxVel: number): void {
    const body = this.parts[part];
    const err = angleDiff(body.angle, target);
    const commanded = clamp(err * gain, -maxVel, maxVel);
    const next = body.angularVelocity + (commanded - body.angularVelocity) * blend;
    Body.setAngularVelocity(body, next);
  }

  // ---- damage / breaking --------------------------------------------------

  isBroken(part: PartName): boolean {
    const j = this.jointByChild.get(part);
    return j ? j.broken : false;
  }

  legsLost(): number {
    return (this.isBroken('upperLegL') ? 1 : 0) + (this.isBroken('upperLegR') ? 1 : 0);
  }

  /** 0..1 integrity of the joint holding this part (1 = healthy, used for wound tinting). */
  limbHealth(part: PartName): number {
    const j = this.jointByChild.get(part);
    if (!j) return 1;
    return j.broken ? 0 : Math.max(0, j.integrity / j.max);
  }

  /** Returns the amount of damage actually applied (0 if on cooldown / already broken). */
  damagePart(part: PartName, amount: number, now: number, type: DamageType = 'phys'): number {
    if (this.koed || amount <= 0) return 0;
    if (now < this.dodgeUntil) return 0; // i-frames while dodging
    if (now - this.lastHit[part] < CFG.combat.perPartHitCooldownMs) return 0;
    this.lastHit[part] = now;

    // Armor soaks damage (per type) until it wears out and falls off.
    let dmg = amount;
    const ar = this.armor[part];
    if (ar && ar.hp > 0) {
      const resist = ARMOR[ar.mat].resist[type];
      ar.hp -= dmg;
      dmg *= 1 - resist;
      if (ar.hp <= 0) delete this.armor[part];
    }
    if (this.evolution === 'titan') dmg *= 0.7; // Titans shrug off blows

    // Core HP drain when the torso or head is struck.
    if (part === 'torso' || part === 'head') {
      this.coreHealth -= dmg * CFG.combat.coreDamageFrac;
      if (this.coreHealth <= 0) {
        this.coreHealth = 0;
        this.koed = true;
      }
    }

    const j = this.jointByChild.get(part);
    if (j && !j.broken) {
      j.integrity -= dmg;
      if (j.integrity <= 0) {
        j.integrity = 0;
        this.breakJoint(j);
      }
    }
    return dmg;
  }

  private breakJoint(j: Joint): void {
    j.broken = true;
    Composite.remove(this.world, j.constraint);
    const p = this.parts[j.child].position;
    this.justBroke.push({ x: p.x, y: p.y });
    // Losing the weapon arm drops the weapon.
    if ((j.child === 'upperArmR' || j.child === 'lowerArmR') && this.weapon) {
      this.dropWeapon(0);
    }
    // Decapitation is an instant KO.
    if (j.child === 'head') this.koed = true;
  }

  // ---- queries ------------------------------------------------------------

  get torsoBody(): Matter.Body {
    return this.parts.torso;
  }

  bodies(): Matter.Body[] {
    return Object.values(this.parts);
  }

  /** Remove every body/constraint owned by this fighter from the world. */
  destroy(): void {
    if (this.grip) Composite.remove(this.world, this.grip);
    for (const j of this.joints) if (!j.broken) Composite.remove(this.world, j.constraint);
    for (const p of Object.values(this.parts)) Composite.remove(this.world, p);
  }
}
