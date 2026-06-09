// Terraria-style open-world mode: explore a big diggable world, fight roaming
// monsters for loot, and dig for materials. Camera scrolls/zooms to follow you.

import Matter from 'matter-js';
import { CFG } from '../config';
import { clamp } from '../core/util';
import type { PlayerInput } from '../core/input';
import { EMPTY_INPUT } from '../core/input';
import { Fighter, type Evolution } from '../physics/fighter';
import { WorldGrid } from './worldgrid';
import { Mat } from '../powder/materials';
import { Bot } from '../game/bot';
import { pickArchetype } from '../game/monsters';
import type { BodyMeta } from '../types';
import type { FxSink } from '../game/match';
import type { SoundName } from '../audio/audio';

const { Engine, Composite, Body, Events } = Matter;
const C = CFG.combat;

export class World {
  engine: Matter.Engine;
  grid: WorldGrid;
  player: Fighter;
  monsters: Fighter[] = [];
  private bots: Bot[] = [];
  private byId = new Map<number, Fighter>();
  private nextId = 1;

  camera = { x: 0, y: 0 };
  zoom = 0.55;
  inventory = new Map<Mat, number>();
  kills = 0;
  loot = 0;
  message = '';
  crafting = false;
  upgrades = { hp: 0, dmg: 0, spd: 0, wpn: 0 };
  private messageUntil = 0;

  private digCdUntil = 0;
  private spawnAt = 0;
  private playerDeadAt = 0;
  private simNow = 0;
  private readonly MAX_MONSTERS = 4;

  constructor(private fx: FxSink, public playerEvo: Evolution = 'none') {
    this.engine = Engine.create();
    this.engine.gravity.y = CFG.sim.gravityY;
    this.grid = new WorldGrid();
    this.player = this.makeFighter(0, this.grid.spawnX, this.grid.spawnY, 1, '#22e3ff', '#aef9ff', 'YOU', 0, CFG.health.core, this.playerEvo);
    Events.on(this.engine, 'collisionStart', (e) => { for (const p of e.pairs) this.resolveHit(p.bodyA, p.bodyB); });
    this.centerCamera();
  }

  private makeFighter(id: number, x: number, y: number, facing: 1 | -1, color: string, accent: string, name: string, weaponIndex: number, hp: number, evo: Evolution = 'none'): Fighter {
    const f = new Fighter(this.engine.world, { id, x, facing, color, accent, name, weaponIndex });
    f.maxCore = hp; f.coreHealth = hp;
    f.evolution = evo;
    f.groundSampler = (gx, gy) => this.grid.groundBelowPx(gx, gy);
    Body.setPosition(f.torsoBody, { x, y });
    this.byId.set(id, f);
    return f;
  }

  // ---- step ---------------------------------------------------------------

  step(now: number, input: PlayerInput): void {
    this.simNow = now;
    if (now > this.messageUntil) this.message = '';
    this.spawnMonsters(now);

    const playerInput = this.player.koed ? EMPTY_INPUT : input;
    this.player.applyControl(now, playerInput);
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      const inp = m.koed ? EMPTY_INPUT : this.bots[i].think(m, this.player, []);
      m.applyControl(now, inp);
    }

    Engine.update(this.engine, CFG.sim.fixedDt);

    this.blockWalls(this.player);
    for (const m of this.monsters) this.blockWalls(m);
    this.mineWithSwing(now, input);
    this.handleDeaths(now);
    for (const ev of this.player.soundEvents) this.fx.sound(ev as SoundName);
    this.player.soundEvents.length = 0;
    for (const m of this.monsters) m.soundEvents.length = 0; // don't spam enemy swings
    this.clampSpeeds();
    this.centerCamera();
  }

  private spawnMonsters(now: number): void {
    if (this.player.koed || this.monsters.length >= this.MAX_MONSTERS || now < this.spawnAt) return;
    this.spawnAt = now + 2600;
    const side = Math.random() < 0.5 ? -1 : 1;
    const span = (CFG.view.width / this.zoom) * 0.62;
    const x = clamp(this.player.torsoBody.position.x + side * span, 60, this.grid.widthPx - 60);
    const a = pickArchetype(Math.min(7, 1 + ((this.kills / 3) | 0)));
    const id = this.nextId++;
    const hp = (52 + this.kills * 4) * a.hpMul;
    const wi = typeof a.weapon === 'number' ? a.weapon : (Math.random() * 3) | 0;
    const sy = this.grid.groundBelowPx(x, 0) - 70;
    const m = this.makeFighter(id, x, sy, side > 0 ? -1 : 1, a.color, a.accent, a.name.toUpperCase(), wi, hp, a.evolution);
    m.speedMul = a.speedMul ?? 1;
    this.monsters.push(m);
    this.bots.push(new Bot());
    this.fx.sound('spawn', 0.6);
  }

  private mineWithSwing(now: number, input: PlayerInput): void {
    if (this.player.koed || !input.attack || now < this.digCdUntil) return;
    if (!this.player.isStriking(now)) return;
    this.digCdUntil = now + 130;
    const w = this.player.weapon;
    const px = w ? w.body.position.x : this.player.handPos().x;
    const py = w ? w.body.position.y : this.player.handPos().y;
    const mined = this.grid.digPx(px, py, this.grid.cell * (this.player.evolution === 'burrower' ? 2.2 : 1.2));
    for (const [m, n] of mined) this.inventory.set(m, (this.inventory.get(m) ?? 0) + n);
    if (mined.size > 0) this.fx.sound('dig');
  }

  private handleDeaths(now: number): void {
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (!m.koed) continue;
      this.kills++;
      this.loot += 5 + ((m.maxCore / 30) | 0);
      if (Math.random() < 0.45) this.inventory.set(Mat.Ore, (this.inventory.get(Mat.Ore) ?? 0) + 1);
      const p = m.torsoBody.position;
      this.fx.confetti(p.x, p.y);
      m.destroy();
      this.byId.delete(m.id);
      this.monsters.splice(i, 1);
      this.bots.splice(i, 1);
      this.flash(`SLAIN! +${5 + ((m.maxCore / 30) | 0)} loot`, now);
    }
    if (this.player.koed) {
      if (this.playerDeadAt === 0) { this.playerDeadAt = now + 2600; this.flash('YOU DIED — respawning…', now + 2600); this.loot = Math.floor(this.loot * 0.5); }
      else if (now >= this.playerDeadAt) this.respawnPlayer();
    }
  }

  private respawnPlayer(): void {
    const evo = this.player.evolution;
    this.player.destroy();
    this.byId.delete(0);
    this.player = this.makeFighter(0, this.grid.spawnX, this.grid.spawnY, 1, '#22e3ff', '#aef9ff', 'YOU', 0, CFG.health.core, evo);
    this.applyPlayerUpgrades();
    this.playerDeadAt = 0;
  }

  private flash(msg: string, now: number): void {
    this.message = msg;
    this.messageUntil = now + 1500;
  }

  // ---- combat -------------------------------------------------------------

  private resolveHit(a: Matter.Body, b: Matter.Body): void {
    const ma = (a as unknown as { meta?: BodyMeta }).meta;
    const mb = (b as unknown as { meta?: BodyMeta }).meta;
    if (!ma || !mb) return;
    const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
    if (speed <= C.impactThreshold) return;
    this.tryDamage(a, ma, b, mb, speed);
    this.tryDamage(b, mb, a, ma, speed);
  }

  private tryDamage(target: Matter.Body, tMeta: BodyMeta, other: Matter.Body, oMeta: BodyMeta, speed: number): void {
    if (tMeta.fighterId < 0 || !tMeta.part) return;
    const tf = this.byId.get(tMeta.fighterId);
    if (!tf) return;
    const hostile = (oMeta.fighterId >= 0 && oMeta.fighterId !== tMeta.fighterId) || oMeta.kind === 'weapon';
    if (!hostile) return;
    const mul = oMeta.kind === 'weapon' ? C.weaponMul : C.bodyMul;
    const massFactor = clamp(other.mass, 0.6, 2.2);
    let dmg = Math.min((speed - C.impactThreshold) * C.damageScale * mul * massFactor, C.maxHitDamage);
    let knock = 0;
    if (oMeta.fighterId >= 0) {
      const af = this.byId.get(oMeta.fighterId);
      if (af) { const pow = af.attackPower(); dmg *= pow.dmgMul; knock = pow.knock; }
    }
    const applied = tf.damagePart(tMeta.part, dmg, this.simNow);
    if (applied > 0) {
      if (knock > 0) {
        const c = tf.torsoBody.position;
        let nx = c.x - other.position.x, ny = c.y - other.position.y;
        const d = Math.hypot(nx, ny) || 1; nx /= d; ny = ny / d - 0.4;
        for (const bb of tf.bodies()) Body.setVelocity(bb, { x: bb.velocity.x + nx * knock, y: bb.velocity.y + ny * knock });
      }
      this.fx.blood((target.position.x + other.position.x) / 2, (target.position.y + other.position.y) / 2, applied);
      if (applied > 10) this.fx.shake(Math.min(12, applied * 0.4));
    }
  }

  // ---- terrain ------------------------------------------------------------

  private blockWalls(f: Fighter): void {
    const t = f.torsoBody;
    const dir = Math.sign(t.velocity.x);
    if (dir === 0) return;
    const hw = 16;
    const frontX = t.position.x + dir * hw;
    const stepUp = this.grid.groundBelowPx(t.position.x, t.position.y) - this.grid.groundBelowPx(frontX, t.position.y);
    if (stepUp > this.grid.cell * 1.6) {
      Body.setVelocity(t, { x: 0, y: t.velocity.y });
      Body.setPosition(t, { x: Math.round(frontX / this.grid.cell) * this.grid.cell - dir * hw, y: t.position.y });
    }
  }

  private centerCamera(): void {
    const halfW = CFG.view.width / (2 * this.zoom);
    const halfH = CFG.view.height / (2 * this.zoom);
    const px = this.player.torsoBody.position.x, py = this.player.torsoBody.position.y;
    this.camera.x = this.grid.widthPx > 2 * halfW ? clamp(px, halfW, this.grid.widthPx - halfW) : this.grid.widthPx / 2;
    this.camera.y = this.grid.heightPx > 2 * halfH ? clamp(py, halfH, this.grid.heightPx - halfH) : this.grid.heightPx / 2;
  }

  private clampSpeeds(): void {
    const maxV = CFG.sim.maxLinearSpeed, maxW = CFG.sim.maxAngularSpeed;
    for (const bdy of Composite.allBodies(this.engine.world)) {
      const sp = Math.hypot(bdy.velocity.x, bdy.velocity.y);
      if (sp > maxV) Body.setVelocity(bdy, { x: (bdy.velocity.x / sp) * maxV, y: (bdy.velocity.y / sp) * maxV });
      if (Math.abs(bdy.angularVelocity) > maxW) Body.setAngularVelocity(bdy, Math.sign(bdy.angularVelocity) * maxW);
    }
  }

  // ---- crafting / progression ---------------------------------------------

  craftDefs: { name: string; desc: string }[] = [
    { name: 'Reinforce', desc: '+30 max health' },
    { name: 'Sharpen', desc: '+20% damage' },
    { name: 'Swift Boots', desc: '+12% move speed' },
    { name: 'Forge Blade', desc: '+15% damage' },
  ];

  craftCost(i: number): { loot: number; mats: [Mat, number][] } {
    const u = this.upgrades;
    if (i === 0) return { loot: 18 + u.hp * 12, mats: [[Mat.Stone, 4]] };
    if (i === 1) return { loot: 16 + u.dmg * 12, mats: [[Mat.Ore, 2]] };
    if (i === 2) return { loot: 14 + u.spd * 12, mats: [[Mat.Wood, 4]] };
    return { loot: 12 + u.wpn * 15, mats: [[Mat.Wood, 6], [Mat.Stone, 6], [Mat.Ore, 3]] };
  }

  canCraft(i: number): boolean {
    const c = this.craftCost(i);
    if (this.loot < c.loot) return false;
    for (const [m, n] of c.mats) if ((this.inventory.get(m) ?? 0) < n) return false;
    return true;
  }

  craft(i: number): boolean {
    if (!this.canCraft(i)) { this.fx.sound('ui'); return false; }
    const c = this.craftCost(i);
    this.loot -= c.loot;
    for (const [m, n] of c.mats) this.inventory.set(m, (this.inventory.get(m) ?? 0) - n);
    if (i === 0) this.upgrades.hp++;
    else if (i === 1) this.upgrades.dmg++;
    else if (i === 2) this.upgrades.spd++;
    else this.upgrades.wpn++;
    this.applyPlayerUpgrades();
    this.fx.sound('parry');
    return true;
  }

  private applyPlayerUpgrades(): void {
    const u = this.upgrades;
    const newMax = CFG.health.core + u.hp * 30;
    const ratio = this.player.maxCore > 0 ? this.player.coreHealth / this.player.maxCore : 1;
    this.player.maxCore = newMax;
    this.player.coreHealth = Math.min(newMax, newMax * ratio + (u.hp ? 30 : 0));
    this.player.damageMul = 1 + u.dmg * 0.2 + u.wpn * 0.15;
    this.player.speedMul = 1 + u.spd * 0.12;
  }

  /** Depth below the surface in tiles (for the HUD). */
  depth(): number {
    const surfaceY = this.grid.rows * 0.32 * this.grid.cell;
    return Math.max(0, Math.round((this.player.torsoBody.position.y - surfaceY) / this.grid.cell));
  }
}
