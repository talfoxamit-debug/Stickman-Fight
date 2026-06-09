import Matter from 'matter-js';
import { CFG } from '../config';
import { clamp, dist } from '../core/util';
import type { PlayerInput } from '../core/input';
import { EMPTY_INPUT } from '../core/input';
import { Fighter } from '../physics/fighter';
import { setWeaponOwner, type Weapon } from '../physics/weapon';
import type { BodyMeta } from '../types';
import { Bot } from './bot';

const { Engine, Composite, Bodies, Body, Events } = Matter;

export interface FxSink {
  impact(x: number, y: number, strength: number, color: string): void;
  blood(x: number, y: number, amount: number): void;
  confetti(x: number, y: number): void;
  shake(amount: number): void;
}

export type MatchState = 'intro' | 'fight' | 'roundover' | 'matchover';

const FIGHTER_SETUP = [
  { color: '#22e3ff', accent: '#aef9ff', name: 'P1', weaponIndex: 0 },
  { color: '#ff4dd2', accent: '#ffd0f3', name: 'P2', weaponIndex: 1 },
];

export class Match {
  engine: Matter.Engine;
  world: Matter.World;
  fighters: [Fighter, Fighter];
  looseWeapons: Weapon[] = [];

  state: MatchState = 'intro';
  scores: [number, number] = [0, 0];
  round = 1;
  roundWinner = -1;
  matchWinner = -1;
  message = 'GET READY';

  botEnabled = false;
  private bot = new Bot();

  private stateTimer = 0; // sim-ms remaining for the current transient state
  private hitstopSteps = 0;
  private prevGrab: [boolean, boolean] = [false, false];

  constructor(private fx: FxSink) {
    this.engine = Engine.create();
    this.engine.gravity.y = CFG.sim.gravityY;
    this.world = this.engine.world;
    this.buildArena();
    this.fighters = this.spawnFighters();
    this.wireCollisions();
    this.beginRound();
  }

  // ---- setup --------------------------------------------------------------

  private buildArena(): void {
    const W = CFG.view.width;
    const floorTop = CFG.arena.floorY;
    const inset = CFG.arena.wallInset;
    // Central platform with open sides => fighters can be knocked off (ring-out).
    const platform = Bodies.rectangle(
      W / 2,
      floorTop + CFG.arena.floorThickness / 2,
      W - inset * 2,
      CFG.arena.floorThickness,
      { isStatic: true, friction: 0.9, label: 'ground' },
    );
    (platform as unknown as { meta: BodyMeta }).meta = { fighterId: -1, kind: 'ground' };
    Composite.add(this.world, platform);

    // Low edge railings: stop trivial slide-offs, but a strong launch can still
    // send a fighter up and over into the pit (ring-out stays a real finish).
    const railH = CFG.arena.railHeight;
    for (const rx of [inset, W - inset]) {
      const rail = Bodies.rectangle(rx, floorTop - railH / 2 + 6, 14, railH, {
        isStatic: true,
        friction: 0.4,
        label: 'rail',
      });
      (rail as unknown as { meta: BodyMeta }).meta = { fighterId: -1, kind: 'wall' };
      Composite.add(this.world, rail);
    }

    // Floating platforms for verticality.
    for (const p of CFG.arena.platforms) {
      const plat = Bodies.rectangle(p.x, p.y, p.w, p.h, { isStatic: true, friction: 0.9, label: 'platform' });
      (plat as unknown as { meta: BodyMeta }).meta = { fighterId: -1, kind: 'ground' };
      Composite.add(this.world, plat);
    }
  }

  private spawnFighters(): [Fighter, Fighter] {
    const W = CFG.view.width;
    const a = new Fighter(this.world, { id: 0, x: W * 0.38, facing: 1, ...FIGHTER_SETUP[0] });
    const b = new Fighter(this.world, { id: 1, x: W * 0.62, facing: -1, ...FIGHTER_SETUP[1] });
    return [a, b];
  }

  private wireCollisions(): void {
    Events.on(this.engine, 'collisionStart', (e) => {
      for (const pair of e.pairs) this.resolveHit(pair.bodyA, pair.bodyB);
    });
    Events.on(this.engine, 'collisionActive', (e) => {
      for (const pair of e.pairs) {
        this.checkGrounded(pair.bodyA, pair.bodyB);
        this.checkGrounded(pair.bodyB, pair.bodyA);
      }
    });
  }

  // ---- per-step -----------------------------------------------------------

  step(now: number, rawInputs: [PlayerInput, PlayerInput]): void {
    this.simNow = now; // keep collision callbacks (which fire mid-step) on the right clock
    if (this.hitstopSteps > 0) {
      this.hitstopSteps--;
      return;
    }

    const inputs: [PlayerInput, PlayerInput] = [
      this.state === 'fight' ? rawInputs[0] : EMPTY_INPUT,
      this.state === 'fight'
        ? this.botEnabled
          ? this.bot.think(this.fighters[1], this.fighters[0], this.looseWeapons)
          : rawInputs[1]
        : EMPTY_INPUT,
    ];

    // 1) Apply control (reads grounded from the previous step).
    this.fighters[0].applyControl(now, inputs[0]);
    this.fighters[1].applyControl(now, inputs[1]);

    // 2) Reset grounded; collisionActive will re-assert it during the step.
    this.fighters[0].grounded = false;
    this.fighters[1].grounded = false;

    // 3) Advance physics (fires collision events => damage + grounded).
    Engine.update(this.engine, CFG.sim.fixedDt);

    // 4) Post-step bookkeeping. Handle grabs first (a throw pushes to the drop
    //    queue), then drain the queue so thrown/severed weapons become loose now.
    this.clampVelocities();
    this.handleGrabs(inputs);
    this.drainDroppedWeapons();
    this.drainBreaks();
    this.faceOpponents();
    this.checkRingOut();
    this.advanceRoundFlow(now);
  }

  private clampVelocities(): void {
    const maxV = CFG.sim.maxLinearSpeed;
    const maxW = CFG.sim.maxAngularSpeed;
    const bodies = Composite.allBodies(this.world);
    for (const b of bodies) {
      if (b.isStatic) continue;
      const sp = Math.hypot(b.velocity.x, b.velocity.y);
      if (sp > maxV) Body.setVelocity(b, { x: (b.velocity.x / sp) * maxV, y: (b.velocity.y / sp) * maxV });
      if (Math.abs(b.angularVelocity) > maxW) Body.setAngularVelocity(b, Math.sign(b.angularVelocity) * maxW);
    }
  }

  // ---- combat -------------------------------------------------------------

  private resolveHit(a: Matter.Body, b: Matter.Body): void {
    const now = this.simNow;
    const ma = (a as unknown as { meta?: BodyMeta }).meta;
    const mb = (b as unknown as { meta?: BodyMeta }).meta;
    if (!ma || !mb) return;
    const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
    if (speed <= CFG.combat.impactThreshold) return;
    this.tryDamage(a, ma, b, mb, speed, now);
    this.tryDamage(b, mb, a, ma, speed, now);
  }

  private tryDamage(
    target: Matter.Body,
    tMeta: BodyMeta,
    other: Matter.Body,
    oMeta: BodyMeta,
    speed: number,
    now: number,
  ): void {
    // Target must be a damageable fighter part.
    if (tMeta.fighterId < 0 || !tMeta.part) return;
    // Source must be a different fighter's part/weapon, or a loose weapon.
    const hostile = (oMeta.fighterId >= 0 && oMeta.fighterId !== tMeta.fighterId) || oMeta.kind === 'weapon';
    if (!hostile || oMeta.kind === 'ground') return;

    const mul = oMeta.kind === 'weapon' ? CFG.combat.weaponMul : CFG.combat.bodyMul;
    const massFactor = clamp(other.mass / 1.0, 0.6, 2.2);
    const raw = (speed - CFG.combat.impactThreshold) * CFG.combat.damageScale * mul * massFactor;
    let dmg = Math.min(raw, CFG.combat.maxHitDamage);
    if (dmg <= 0) return;

    // A weapon or fist/foot swung as part of an attack scales damage + applies knockback.
    let knock = 0;
    if (oMeta.fighterId >= 0) {
      const pow = this.fighters[oMeta.fighterId].attackPower();
      dmg *= pow.dmgMul;
      knock = pow.knock;
    }

    const fighter = this.fighters[tMeta.fighterId];

    // Defense: a guard from the front reduces damage; a well-timed guard parries.
    if (fighter.isBlocking()) {
      const fromFront = Math.sign(other.position.x - fighter.torsoBody.position.x) === fighter.facing;
      if (fromFront) {
        if (fighter.blockAge(now) <= CFG.combat.parryWindowMs) {
          const attacker = oMeta.fighterId >= 0 ? this.fighters[oMeta.fighterId] : null;
          if (attacker) {
            attacker.stagger(now, CFG.combat.parryStunMs);
            this.applyKnockback(attacker, fighter.torsoBody, 7);
          }
          const px = fighter.torsoBody.position.x;
          const py = fighter.torsoBody.position.y - 18;
          this.fx.impact(px, py, 18, '#ffffff');
          this.fx.shake(11);
          this.hitstopSteps = Math.max(this.hitstopSteps, 5);
          return; // parried: no damage
        }
        dmg *= CFG.combat.blockDamageMul;
        knock *= CFG.combat.blockKnockMul;
        this.fx.impact(other.position.x, other.position.y, 10, '#bfe9ff'); // guard spark
      }
    }

    const applied = fighter.damagePart(tMeta.part, dmg, now);
    if (applied > 0) {
      if (knock > 0) this.applyKnockback(fighter, other, knock);
      const cx = (target.position.x + other.position.x) / 2;
      const cy = (target.position.y + other.position.y) / 2;
      this.fx.blood(cx, cy, applied);
      if (oMeta.kind === 'weapon') this.fx.impact(cx, cy, applied * 0.5, '#fff2a8'); // blade spark
      if (applied > 10) {
        this.fx.shake(Math.min(18, applied * 0.5));
        this.hitstopSteps = Math.max(this.hitstopSteps, applied > 22 ? 4 : 2);
      }
    }
  }

  /** Shove the whole target away from the attacking weapon (heavier on big attacks). */
  private applyKnockback(target: Fighter, source: Matter.Body, knock: number): void {
    const c = target.torsoBody.position;
    let nx = c.x - source.position.x;
    let ny = c.y - source.position.y;
    const d = Math.hypot(nx, ny) || 1;
    nx = nx / d;
    ny = ny / d - 0.4; // bias upward for a satisfying pop
    for (const b of target.bodies()) {
      Body.setVelocity(b, { x: b.velocity.x + nx * knock, y: b.velocity.y + ny * knock });
    }
  }

  private checkGrounded(part: Matter.Body, ground: Matter.Body): void {
    const pm = (part as unknown as { meta?: BodyMeta }).meta;
    const gm = (ground as unknown as { meta?: BodyMeta }).meta;
    if (!pm || gm?.kind !== 'ground' || pm.fighterId < 0) return;
    const p = pm.part;
    if (p === 'lowerLegL' || p === 'lowerLegR' || p === 'upperLegL' || p === 'upperLegR' || p === 'torso') {
      this.fighters[pm.fighterId].grounded = true;
    }
  }

  // ---- weapons / grabbing -------------------------------------------------

  private drainDroppedWeapons(): void {
    for (const f of this.fighters) {
      if (f.justDropped.length) {
        this.looseWeapons.push(...f.justDropped);
        f.justDropped.length = 0;
      }
    }
  }

  /** A severed limb sprays a big gout of blood + a jolt. */
  private drainBreaks(): void {
    for (const f of this.fighters) {
      for (const b of f.justBroke) {
        this.fx.blood(b.x, b.y, 30);
        this.fx.shake(9);
        this.hitstopSteps = Math.max(this.hitstopSteps, 3);
      }
      f.justBroke.length = 0;
    }
  }

  private handleGrabs(inputs: [PlayerInput, PlayerInput]): void {
    for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
      const f = this.fighters[i];
      const pressed = inputs[i].grab && !this.prevGrab[i];
      this.prevGrab[i] = inputs[i].grab;
      if (!pressed || f.koed) continue;

      if (f.hasWeapon()) {
        f.dropWeapon(15); // throw
      } else {
        const hand = f.handPos();
        let best: Weapon | null = null;
        let bestD = 70;
        for (const w of this.looseWeapons) {
          const d = dist(hand.x, hand.y, w.body.position.x, w.body.position.y);
          if (d < bestD) {
            bestD = d;
            best = w;
          }
        }
        if (best) {
          this.looseWeapons = this.looseWeapons.filter((w) => w !== best);
          setWeaponOwner(best, f.id, f.group);
          f.attachWeapon(best);
        }
      }
    }
  }

  private faceOpponents(): void {
    const [a, b] = this.fighters;
    if (!a.koed && !a.manualFacing) a.facing = b.torsoBody.position.x >= a.torsoBody.position.x ? 1 : -1;
    if (!b.koed && !b.manualFacing) b.facing = a.torsoBody.position.x >= b.torsoBody.position.x ? 1 : -1;
  }

  private checkRingOut(): void {
    for (const f of this.fighters) {
      if (!f.koed && f.torsoBody.position.y > CFG.arena.ringOutY) f.koed = true;
    }
  }

  // ---- round / match flow -------------------------------------------------

  private simNow = 0;

  private beginRound(): void {
    this.state = 'intro';
    this.message = `ROUND ${this.round}`;
    this.stateTimer = 1100;
  }

  private advanceRoundFlow(now: number): void {
    this.simNow = now;
    this.stateTimer -= CFG.sim.fixedDt;

    if (this.state === 'intro') {
      if (this.stateTimer <= 0) {
        this.state = 'fight';
        this.message = 'FIGHT!';
        this.stateTimer = 600;
      }
      return;
    }

    if (this.state === 'fight') {
      if (this.stateTimer > 0) this.stateTimer -= CFG.sim.fixedDt; // let "FIGHT!" fade
      const downA = this.fighters[0].koed;
      const downB = this.fighters[1].koed;
      if (downA || downB) {
        // If both somehow drop, last torso standing higher wins; else the survivor.
        this.roundWinner = downB && !downA ? 0 : downA && !downB ? 1 : this.higherFighter();
        this.scores[this.roundWinner]++;
        this.fx.confetti(this.fighters[this.roundWinner].torsoBody.position.x, 180);
        this.fx.shake(16);
        this.message = `${this.fighters[this.roundWinner].name} SCORES!`;
        this.state = 'roundover';
        this.stateTimer = 1700;
      }
      return;
    }

    if (this.state === 'roundover') {
      if (this.stateTimer <= 0) {
        if (this.scores[this.roundWinner] >= CFG.rounds.winsNeeded) {
          this.matchWinner = this.roundWinner;
          this.message = `${this.fighters[this.matchWinner].name} WINS THE PARTY!`;
          this.state = 'matchover';
          this.stateTimer = 0;
        } else {
          this.round++;
          this.resetFighters();
          this.beginRound();
        }
      }
      return;
    }
    // matchover: wait for restart (R).
  }

  private higherFighter(): number {
    return this.fighters[0].torsoBody.position.y <= this.fighters[1].torsoBody.position.y ? 0 : 1;
  }

  private resetFighters(): void {
    for (const f of this.fighters) f.destroy();
    for (const w of this.looseWeapons) Composite.remove(this.world, w.body);
    this.looseWeapons = [];
    this.fighters = this.spawnFighters();
    this.faceOpponents();
  }

  // ---- external controls --------------------------------------------------

  restart(): void {
    this.scores = [0, 0];
    this.round = 1;
    this.matchWinner = -1;
    this.roundWinner = -1;
    this.resetFighters();
    this.beginRound();
  }

  toggleBot(): void {
    this.botEnabled = !this.botEnabled;
  }
}
