import Matter from 'matter-js';
import { CFG } from '../config';
import { angleDiff, clamp } from '../core/util';
import type { PlayerInput } from '../core/input';
import type { BodyMeta, PartName } from '../types';
import { createWeapon, setWeaponOwner, type Weapon } from './weapon';

const { Bodies, Body, Composite, Constraint } = Matter;

interface Joint {
  name: string;
  child: PartName; // the part that detaches if this joint snaps
  constraint: Matter.Constraint;
  integrity: number;
  max: number;
  broken: boolean;
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

  coreHealth: number = CFG.health.core;
  maxCore: number = CFG.health.core;
  koed = false;
  grounded = false;
  facing: 1 | -1 = 1;

  private targets = {} as Record<PartName, number>;
  private lastHit = {} as Record<PartName, number>;
  private prevJump = false;
  private prevAttack = false;
  private jumpReadyAt = 0;
  private swingUntil = 0;
  private swingCooldownUntil = 0;
  private walkPhase = 0;

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

    // Horizontal movement (steer the torso; momentum/knockback still applies).
    const legsLost = this.legsLost();
    let target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (target !== 0) {
      let speed = CFG.control.runSpeed * (legsLost >= 2 ? CFG.control.crippleSpeedMul : 1);
      if (!this.grounded) speed *= CFG.control.airControl + 0.65;
      const desired = target * speed;
      const t = this.grounded ? 0.45 : 0.12;
      Body.setVelocity(torso, { x: torso.velocity.x + (desired - torso.velocity.x) * t, y: torso.velocity.y });
      this.walkPhase += CFG.control.walkBobHz * (CFG.sim.fixedDt / 1000);
    } else if (this.grounded) {
      Body.setVelocity(torso, { x: torso.velocity.x * 0.8, y: torso.velocity.y });
    }

    // Jump (rising edge, grounded, off cooldown). Launch the WHOLE figure, not just
    // the torso, or the grounded limbs hold it down via the joints.
    if (input.jump && !this.prevJump && this.grounded && legsLost < 2 && now >= this.jumpReadyAt) {
      for (const p of Object.keys(this.parts) as PartName[]) {
        if (this.isBroken(p)) continue;
        const b = this.parts[p];
        Body.setVelocity(b, { x: b.velocity.x, y: -CFG.control.jumpSpeed });
      }
      this.grounded = false;
      this.jumpReadyAt = now + 320;
    }
    this.prevJump = input.jump;

    // Stand support: while grounded (and with legs), buoy the torso up to standing
    // height. Only ever pushes UP (never yanks down), so jumps/launches are unaffected.
    if (this.grounded && legsLost < 2 && torso.velocity.y > -2) {
      const targetY = CFG.arena.floorY - CFG.control.standHeight;
      const err = targetY - torso.position.y;
      if (err < -2) {
        const desiredVy = clamp(err * CFG.control.standGain, -CFG.control.standMaxVel, 0);
        Body.setVelocity(torso, {
          x: torso.velocity.x,
          y: torso.velocity.y + (desiredVy - torso.velocity.y) * CFG.control.standBlend,
        });
      }
    }

    // Attack -> start a swing (rising edge, has intact weapon arm + weapon, off cooldown).
    const armOk = !this.isBroken('upperArmR') && !this.isBroken('lowerArmR');
    if (input.attack && !this.prevAttack && this.hasWeapon() && armOk && now >= this.swingCooldownUntil) {
      this.swingUntil = now + CFG.combat.swingMs;
      this.swingCooldownUntil = now + CFG.combat.swingCooldownMs;
    }
    this.prevAttack = input.attack;

    this.poseAndDrive(now);
  }

  /** Compute target pose angles and apply PD torques ("active ragdoll"). */
  private poseAndDrive(now: number): void {
    const f = this.facing;
    const bob = Math.sin(this.walkPhase) * CFG.control.walkBobAmp;

    // Rest pose (absolute world angles; 0 == segment's long axis vertical).
    this.targets.head = 0;
    this.targets.upperArmL = -0.5 * f - bob * 0.4;
    this.targets.lowerArmL = -0.7 * f;
    this.targets.upperLegL = 0.05 + bob;
    this.targets.lowerLegL = 0.02 + bob * 0.6;
    this.targets.upperLegR = 0.05 - bob;
    this.targets.lowerLegR = 0.02 - bob * 0.6;

    // Weapon arm rest pose (when not swinging): weapon held up-and-forward.
    this.targets.upperArmR = 0.7 * f + bob * 0.4;
    this.targets.lowerArmR = 0.9 * f;

    const c = CFG.control;
    // Torso self-righting (keep upright).
    this.driveAngle('torso', 0, c.rightGain, c.rightBlend, c.rightMaxVel);

    const swinging = now < this.swingUntil;
    for (const p of Object.keys(this.targets) as PartName[]) {
      if (p === 'torso' || this.isBroken(p)) continue;
      // Whip the weapon arm hard during a swing so the weapon builds real momentum.
      if (swinging && (p === 'upperArmR' || p === 'lowerArmR')) {
        this.driveSpin(p, f * c.swingWhipSpeed, c.swingBlend);
      } else {
        const target = this.targets[p] + (p === 'head' ? this.parts.torso.angle : 0);
        this.driveAngle(p, target, c.poseGain, c.poseBlend, c.poseMaxVel);
      }
    }
  }

  /** Steer a segment's angular velocity directly toward `vel` (for fast swings). */
  private driveSpin(part: PartName, vel: number, blend: number): void {
    const body = this.parts[part];
    Body.setAngularVelocity(body, body.angularVelocity + (vel - body.angularVelocity) * blend);
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

  /** Returns the amount of damage actually applied (0 if on cooldown / already broken). */
  damagePart(part: PartName, amount: number, now: number): number {
    if (this.koed || amount <= 0) return 0;
    if (now - this.lastHit[part] < CFG.combat.perPartHitCooldownMs) return 0;
    this.lastHit[part] = now;

    // Core HP drain when the torso or head is struck.
    if (part === 'torso' || part === 'head') {
      this.coreHealth -= amount * CFG.combat.coreDamageFrac;
      if (this.coreHealth <= 0) {
        this.coreHealth = 0;
        this.koed = true;
      }
    }

    const j = this.jointByChild.get(part);
    if (j && !j.broken) {
      j.integrity -= amount;
      if (j.integrity <= 0) {
        j.integrity = 0;
        this.breakJoint(j);
      }
    }
    return amount;
  }

  private breakJoint(j: Joint): void {
    j.broken = true;
    Composite.remove(this.world, j.constraint);
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
