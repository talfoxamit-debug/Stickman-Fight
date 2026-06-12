// Terraria-style open-world mode: explore a big diggable world, fight roaming
// monsters for loot, and dig for materials. Camera scrolls/zooms to follow you.

import Matter from 'matter-js';
import { CFG } from '../config';
import { clamp } from '../core/util';
import type { PlayerInput } from '../core/input';
import { EMPTY_INPUT } from '../core/input';
import { Fighter, type Evolution } from '../physics/fighter';
import type { DamageType } from '../physics/armor';
import { WorldGrid } from './worldgrid';
import { Mat } from '../powder/materials';
import { Bot } from '../game/bot';
import { pickArchetypeFor } from '../game/monsters';
import { resolveMelee } from '../game/combat';
import type { BodyMeta } from '../types';
import type { FxSink } from '../game/match';
import type { SoundName } from '../audio/audio';
import { type CharState, xpForCharLevel, passives, canLearn, SKILLS, SKILL_BY_ID } from '../game/skills';
import { type Recipe, type CraftCategory, RECIPE_BY_ID, BLOCK_MAT, hasIngredients } from '../game/crafting';
import { QUESTS, type QuestStage, type QuestStats, newQuestStats, questValue } from './quests';

const { Engine, Composite, Body, Events } = Matter;
const C = CFG.combat;

// Aimed elemental spells: cast toward the mouse cursor (hold RMB), cycle with C.
export interface SpellDef { name: string; type: DamageType; color: string; dmg: number; mana: number; speed: number; radius: number; stagger: number; aoe: number }
export const SPELLS: SpellDef[] = [
  { name: 'Firebolt', type: 'heat', color: '#ff7a18', dmg: 16, mana: 8, speed: 15, radius: 13, stagger: 0, aoe: 72 },
  { name: 'Frost', type: 'phys', color: '#bfe9ff', dmg: 11, mana: 7, speed: 13, radius: 13, stagger: 420, aoe: 0 },
  { name: 'Acid', type: 'acid', color: '#9cff5a', dmg: 14, mana: 7, speed: 14, radius: 12, stagger: 0, aoe: 0 },
  { name: 'Spark', type: 'shock', color: '#cdeeff', dmg: 12, mana: 5, speed: 22, radius: 10, stagger: 200, aoe: 0 },
];

export interface Projectile {
  x: number; y: number; vx: number; vy: number; spell: SpellDef; damage: number; life: number; trail: { x: number; y: number }[];
}

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
  // Minecraft-style crafting: category being viewed, permanent gear owned, and
  // stackable consumable/block items the player holds.
  craftCategory: CraftCategory = 'tool';
  owned = new Set<string>();
  items: Record<string, number> = {};
  selectedBlock: string | null = null;
  digTier = 0;
  private gearHp = 0;
  private gearDef = 0;
  private gearSpeed = 0;
  private weaponDmgBonus = 0;
  private equippedWeaponIndex = 0;
  private placeCdUntil = 0;
  private bombCdUntil = 0;
  // RPG character: level, XP, skill tree, mana.
  char: CharState = { level: 1, xp: 0, skillPoints: 1, learned: {} };
  mana = 30;
  maxMana = 30;
  skillTreeOpen = false;
  slots: string[] = []; // equipped active skill ids (quickbar 1-4)
  private skillCdUntil: Record<string, number> = {};
  private regenAcc = 0;
  private messageUntil = 0;

  private digCdUntil = 0;
  private spawnAt = 0;
  private playerDeadAt = 0;
  private simNow = 0;
  private hitstopSteps = 0;
  // Loop stakes: danger + reward escalate with depth; elites are the deep prizes.
  private eliteIds = new Set<number>();
  private deepestBand = 0;

  // Onboarding / objective chain (gives the world direction + teaches one control at a time).
  questStats: QuestStats = newQuestStats();
  questIndex = 0;
  private prevPlayerX = 0;

  // Aimed elemental spells (mouse-aim, RMB to cast).
  projectiles: Projectile[] = [];
  spellIndex = 0;
  private spellCdUntil = 0;

  constructor(private fx: FxSink, public playerEvo: Evolution = 'none') {
    this.engine = Engine.create();
    this.engine.gravity.y = CFG.sim.gravityY;
    this.grid = new WorldGrid();
    this.player = this.makeFighter(0, this.grid.spawnX, this.grid.spawnY, 1, '#22e3ff', '#aef9ff', 'YOU', 0, CFG.health.core, this.playerEvo);
    Events.on(this.engine, 'collisionStart', (e) => { for (const p of e.pairs) this.resolveHit(p.bodyA, p.bodyB); });
    this.prevPlayerX = this.player.torsoBody.position.x;
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
    if (this.hitstopSteps > 0) { this.hitstopSteps--; return; } // meaty freeze-frame on hits
    if (now > this.messageUntil) this.message = '';
    this.spawnMonsters(now);

    const playerInput = this.player.koed ? EMPTY_INPUT : input;
    this.player.applyControl(now, playerInput);
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      const inp = m.koed ? EMPTY_INPUT : this.bots[i].think(m, this.player, [], now);
      m.applyControl(now, inp);
    }

    Engine.update(this.engine, CFG.sim.fixedDt);

    this.blockWalls(this.player);
    for (const m of this.monsters) this.blockWalls(m);
    this.hitstopSteps = Math.max(this.hitstopSteps, resolveMelee([this.player, ...this.monsters], this.fx, now));
    this.drainLandings();
    this.mineWithSwing(now, input);
    this.updateProjectiles(now);
    this.worldHazards(now);
    this.handleDeaths(now);
    this.updateQuests(now);
    for (const ev of this.player.soundEvents) this.fx.sound(ev as SoundName);
    this.player.soundEvents.length = 0;
    for (const m of this.monsters) m.soundEvents.length = 0; // don't spam enemy swings
    // Mana + HP regen.
    this.regenAcc += CFG.sim.fixedDt;
    if (this.regenAcc >= 250) {
      const sec = this.regenAcc / 1000;
      this.mana = Math.min(this.maxMana, this.mana + 8 * sec);
      const hp = passives(this.char.learned).regenPerSec;
      if (hp > 0 && !this.player.koed) this.player.coreHealth = Math.min(this.player.maxCore, this.player.coreHealth + hp * sec);
      this.regenAcc = 0;
    }
    this.clampSpeeds();
    this.centerCamera();
  }

  /** Difficulty/reward tier: rises with kills and (faster) with how deep you've dug. */
  dangerTier(): number {
    return Math.max(1, 1 + ((this.kills / 3) | 0) + ((this.depth() / 12) | 0));
  }

  /** Deeper = bigger swarms. */
  private maxMonsters(): number {
    return Math.min(7, 3 + ((this.depth() / 22) | 0));
  }

  private spawnMonsters(now: number): void {
    if (this.player.koed || this.monsters.length >= this.maxMonsters() || now < this.spawnAt) return;
    const depth = this.depth();
    this.spawnAt = now + Math.max(1100, 2600 - depth * 22); // they come faster the deeper you go
    const side = Math.random() < 0.5 ? -1 : 1;
    const span = (CFG.view.width / this.zoom) * 0.62;
    const x = clamp(this.player.torsoBody.position.x + side * span, 60, this.grid.widthPx - 60);
    const tier = this.dangerTier();
    const biome = this.grid.biomeAtPx(x);
    const a = pickArchetypeFor(tier, biome);
    const id = this.nextId++;

    // Elite "guardian": rare near the surface, common deep — a tanky, oversized prize.
    const elite = depth > 12 && Math.random() < Math.min(0.4, 0.06 + depth * 0.004);
    let hp = (46 + tier * 11) * a.hpMul;
    let color = a.color, accent = a.accent, evo = a.evolution;
    if (elite) { hp *= 2.4; color = '#ffd24a'; accent = '#fff3c0'; evo = 'titan'; this.eliteIds.add(id); }

    const wi = typeof a.weapon === 'number' ? a.weapon : (Math.random() * 3) | 0;
    const sy = this.grid.groundBelowPx(x, 0) - 70;
    const m = this.makeFighter(id, x, sy, side > 0 ? -1 : 1, color, accent, a.name.toUpperCase(), wi, hp, evo);
    m.speedMul = a.speedMul ?? 1;
    this.monsters.push(m);
    // Smarter enemies the further you get (kills) and the deeper you dig (depth).
    const skill = clamp(0.32 + this.kills * 0.025 + depth * 0.004 + (elite ? 0.15 : 0), 0.32, 0.95);
    this.bots.push(new Bot(skill));
    this.fx.sound('spawn', 0.6);
    if (elite) this.flash('⚠ ELITE GUARDIAN approaches', now);
  }

  private mineWithSwing(now: number, input: PlayerInput): void {
    if (this.player.koed || !input.attack || now < this.digCdUntil) return;
    if (!this.player.isStriking(now)) return;
    this.digCdUntil = now + Math.max(70, 130 - this.digTier * 18); // pickaxes mine faster
    const w = this.player.weapon;
    const px = w ? w.body.position.x : this.player.handPos().x;
    const py = w ? w.body.position.y : this.player.handPos().y;
    const radiusMul = 1.2 + this.digTier * 0.55 + (this.player.evolution === 'burrower' ? 1.0 : 0);
    const mined = this.grid.digPx(px, py, this.grid.cell * radiusMul);
    for (const [m, n] of mined) {
      this.inventory.set(m, (this.inventory.get(m) ?? 0) + n);
      this.questStats.mined += n;
      if (m === Mat.Ore) this.questStats.minedOre += n;
    }
    if (mined.size > 0) this.fx.sound('dig');
  }

  /** Deep lava burns anyone standing in it; chests reward exploration. */
  private worldHazards(now: number): void {
    for (const f of [this.player, ...this.monsters]) {
      if (f.koed) continue;
      const t = f.torsoBody;
      if (this.grid.matAtPx(t.position.x, t.position.y + 26) === Mat.Lava || this.grid.matAtPx(t.position.x, t.position.y) === Mat.Lava) {
        f.damagePart('torso', 7, now, 'heat');
        Body.setVelocity(t, { x: t.velocity.x, y: t.velocity.y - 0.6 });
        if (f === this.player) this.fx.sound('hit', 0.4);
      }
    }
    const p = this.player.torsoBody.position;
    for (const ch of this.grid.chests) {
      if (ch.looted || Math.hypot(p.x - ch.x, p.y - ch.y) > this.grid.cell * 1.5) continue;
      ch.looted = true;
      const gain = 20 + ((Math.random() * 30) | 0);
      this.loot += gain;
      this.inventory.set(Mat.Ore, (this.inventory.get(Mat.Ore) ?? 0) + 2 + ((Math.random() * 3) | 0));
      this.fx.confetti(ch.x, ch.y);
      this.fx.sound('parry');
      this.flash(`TREASURE! +${gain} loot`, now);
    }
  }

  private handleDeaths(now: number): void {
    const depthMul = 1 + this.depth() * 0.03; // deeper kills pay more
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (!m.koed) continue;
      this.kills++;
      const elite = this.eliteIds.has(m.id);
      this.eliteIds.delete(m.id);
      const baseLoot = Math.round((5 + ((m.maxCore / 30) | 0)) * depthMul * (elite ? 3 : 1));
      this.addXP(Math.round((8 + ((m.maxCore / 4) | 0)) * (elite ? 2.5 : 1)));
      this.loot += baseLoot;
      // Ore drops get richer with depth; elites are guaranteed a haul.
      const oreDrop = elite ? 3 + ((Math.random() * 3) | 0) : (Math.random() < 0.4 + this.depth() * 0.006 ? 1 : 0);
      if (oreDrop > 0) this.inventory.set(Mat.Ore, (this.inventory.get(Mat.Ore) ?? 0) + oreDrop);
      const p = m.torsoBody.position;
      this.fx.confetti(p.x, p.y);
      if (elite) this.fx.shake(14);
      m.destroy();
      this.byId.delete(m.id);
      this.monsters.splice(i, 1);
      this.bots.splice(i, 1);
      this.flash(elite ? `★ ELITE SLAIN! +${baseLoot} loot +${oreDrop} ore` : `SLAIN! +${baseLoot} loot`, now);
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
    this.applyPlayerStats();
    if (this.equippedWeaponIndex !== 0) this.player.equipWeapon(this.equippedWeaponIndex);
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
    // Hostile = a DIFFERENT fighter's body part, or a weapon that isn't yours.
    // (Your own held weapon must never damage you — that was the phantom sword self-hit.)
    const hostile = oMeta.fighterId !== tMeta.fighterId && (oMeta.kind === 'weapon' || oMeta.fighterId >= 0);
    if (!hostile) return;
    // Intentional strikes go through resolveMelee; impact damage only for incidental
    // contact (ragdoll shoves, loose/thrown weapons).
    if (oMeta.fighterId >= 0) { const af = this.byId.get(oMeta.fighterId); if (af && af.isStriking(this.simNow)) return; }
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

  /** Dust + a little shake when someone lands hard. */
  private drainLandings(): void {
    for (const f of [this.player, ...this.monsters]) {
      for (const l of f.justLanded) {
        this.fx.impact(l.x, l.y, l.power * 0.5, '#cfd6e2');
        if (f === this.player) this.fx.shake(Math.min(6, l.power * 0.35));
      }
      f.justLanded.length = 0;
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

  // ---- crafting (Minecraft-style) -----------------------------------------

  /** Can the recipe be crafted right now (have ingredients, not already owned)? */
  canCraftRecipe(r: Recipe): boolean {
    if (r.permanent && this.owned.has(r.id)) return false;
    return hasIngredients(r, this.inventory);
  }

  craftRecipe(id: string): boolean {
    const r = RECIPE_BY_ID[id];
    if (!r || !this.canCraftRecipe(r)) { this.fx.sound('ui'); return false; }
    for (const [m, n] of r.ingredients) this.inventory.set(m, (this.inventory.get(m) ?? 0) - n);
    this.applyRecipe(r);
    this.questStats.crafted++;
    this.fx.sound('parry');
    this.flash(`CRAFTED ${r.name}!`, this.simNow);
    return true;
  }

  private applyRecipe(r: Recipe): void {
    if (r.category === 'weapon') {
      this.equippedWeaponIndex = r.weaponIndex ?? 0;
      this.player.equipWeapon(this.equippedWeaponIndex);
      this.weaponDmgBonus = r.dmgBonus ?? 0;
    } else if (r.category === 'tool') {
      this.owned.add(r.id);
      this.digTier = Math.max(this.digTier, r.digTier ?? 0);
    } else if (r.category === 'armor') {
      this.owned.add(r.id);
      this.gearHp += r.hpBonus ?? 0;
      this.gearDef = Math.min(0.6, this.gearDef + (r.defBonus ?? 0));
      this.gearSpeed += r.speedBonus ?? 0;
    } else {
      const k = r.give!;
      this.items[k] = (this.items[k] ?? 0) + (r.stack ?? 1);
      if (r.category === 'block' && !this.selectedBlock) this.selectedBlock = k;
    }
    this.applyPlayerStats();
  }

  /** Use a crafted block: place it into empty space at the cursor (hold Q). */
  placeBlockAt(sx: number, sy: number, now: number): void {
    const k = this.selectedBlock;
    if (!k || (this.items[k] ?? 0) <= 0 || now < this.placeCdUntil) return;
    const w = this.screenToWorld(sx, sy);
    const pt = this.player.torsoBody.position;
    if (Math.hypot(w.x - pt.x, w.y - pt.y) < this.grid.cell * 0.9) return; // not on yourself
    if (this.grid.placePx(w.x, w.y, BLOCK_MAT[k])) {
      this.items[k] = (this.items[k] ?? 0) - 1;
      this.placeCdUntil = now + 80;
      this.fx.sound('dig', 0.5);
    }
  }

  cycleBlock(): void {
    const have = Object.keys(BLOCK_MAT).filter((k) => (this.items[k] ?? 0) > 0);
    if (have.length === 0) { this.selectedBlock = null; return; }
    const i = this.selectedBlock ? have.indexOf(this.selectedBlock) : -1;
    this.selectedBlock = have[(i + 1) % have.length];
    this.fx.sound('ui', 0.5);
  }

  drink(kind: 'hp' | 'mp', now: number): void {
    if ((this.items[kind] ?? 0) <= 0) { this.fx.sound('ui'); return; }
    this.items[kind] = (this.items[kind] ?? 0) - 1;
    const t = this.player.torsoBody.position;
    if (kind === 'hp') { this.player.coreHealth = Math.min(this.player.maxCore, this.player.coreHealth + 60); this.flash('+60 HP', now); }
    else { this.mana = Math.min(this.maxMana, this.mana + 40); this.flash('+40 mana', now); }
    this.fx.confetti(t.x, t.y);
    this.fx.sound('parry');
  }

  throwBomb(sx: number, sy: number, now: number): void {
    if ((this.items.bomb ?? 0) <= 0 || now < this.bombCdUntil) { if ((this.items.bomb ?? 0) <= 0) this.fx.sound('ui'); return; }
    this.items.bomb = (this.items.bomb ?? 0) - 1;
    this.bombCdUntil = now + 500;
    const w = this.screenToWorld(sx, sy);
    const mined = this.grid.digPx(w.x, w.y, this.grid.cell * 3.2); // blow a crater (and keep the rubble)
    for (const [m, n] of mined) this.inventory.set(m, (this.inventory.get(m) ?? 0) + n);
    this.aoeDamage(w.x, w.y, 160, 60, 18, 'heat');
    this.fx.impact(w.x, w.y, 60, '#ff7a18');
    this.fx.shake(18);
    this.fx.sound('boom');
  }

  /** Convert internal-canvas (screen) coords to world coords through the camera. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - CFG.view.width / 2) / this.zoom + this.camera.x,
      y: (sy - CFG.view.height / 2) / this.zoom + this.camera.y,
    };
  }

  // ---- aimed elemental spells (RMB cast toward the cursor) -----------------

  currentSpell(): SpellDef {
    return SPELLS[this.spellIndex];
  }

  cycleSpell(): void {
    this.spellIndex = (this.spellIndex + 1) % SPELLS.length;
    this.flash(`Spell: ${this.currentSpell().name}`, this.simNow);
    this.fx.sound('ui', 0.6);
  }

  /** Fire the selected spell from your hand toward the cursor (held RMB streams). */
  castSpell(sx: number, sy: number, now: number): void {
    if (this.player.koed || this.skillTreeOpen || this.crafting || now < this.spellCdUntil) return;
    const sp = this.currentSpell();
    if (this.mana < sp.mana) { if (now > this.spellCdUntil) this.fx.sound('ui', 0.5); this.spellCdUntil = now + 200; return; }
    this.mana -= sp.mana;
    this.spellCdUntil = now + 250; // cast rate
    const hand = this.player.handPos();
    const target = this.screenToWorld(sx, sy);
    let dx = target.x - hand.x, dy = target.y - hand.y;
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    this.player.facing = dx >= 0 ? 1 : -1;
    const mul = passives(this.char.learned).spell;
    this.projectiles.push({ x: hand.x, y: hand.y, vx: dx * sp.speed, vy: dy * sp.speed, spell: sp, damage: sp.dmg * mul, life: 1200, trail: [] });
    this.fx.impact(hand.x, hand.y, 6, sp.color);
    this.fx.sound('zap', 0.8);
  }

  private updateProjectiles(now: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.trail.push({ x: pr.x, y: pr.y });
      if (pr.trail.length > 6) pr.trail.shift();
      pr.x += pr.vx; pr.y += pr.vy; pr.life -= CFG.sim.fixedDt;
      let dead = pr.life <= 0;
      if (!dead && this.grid.isSolidPx(pr.x, pr.y)) { this.fx.impact(pr.x, pr.y, 14, pr.spell.color); dead = true; }
      if (!dead) {
        for (const m of this.monsters) {
          if (m.koed) continue;
          const c = m.torsoBody.position;
          if (Math.hypot(c.x - pr.x, c.y - pr.y) > pr.spell.radius + 24) continue;
          const applied = m.damagePart('torso', pr.damage, now, pr.spell.type);
          if (pr.spell.stagger > 0) m.stagger(now, pr.spell.stagger);
          if (pr.spell.aoe > 0) this.aoeDamage(pr.x, pr.y, pr.spell.aoe, pr.damage * 0.5, 5, 'heat');
          if (applied > 0) { this.fx.blood(c.x, c.y, applied); this.lifestealFrom(applied); }
          this.fx.impact(pr.x, pr.y, 18, pr.spell.color);
          this.fx.sound('hit', 0.6);
          dead = true;
          break;
        }
      }
      if (dead) this.projectiles.splice(i, 1);
    }
  }

  /** Recompute player stats from crafted gear + skill-tree passives. */
  private applyPlayerStats(): void {
    const p = passives(this.char.learned);
    const newMax = CFG.health.core + this.gearHp + p.hp;
    const ratio = this.player.maxCore > 0 ? this.player.coreHealth / this.player.maxCore : 1;
    this.player.maxCore = newMax;
    this.player.coreHealth = Math.min(newMax, Math.max(this.player.coreHealth, newMax * ratio));
    this.player.damageMul = 1 + this.weaponDmgBonus + p.dmg;
    this.player.speedMul = 1 + this.gearSpeed + p.speed;
    this.player.defenseMul = 1 - this.gearDef;
    this.maxMana = 30 + this.char.level * 2 + p.mana;
    this.mana = Math.min(this.mana, this.maxMana);
  }

  // ---- skill tree / levels ------------------------------------------------

  addXP(amount: number): void {
    this.char.xp += amount;
    while (this.char.xp >= xpForCharLevel(this.char.level)) {
      this.char.xp -= xpForCharLevel(this.char.level);
      this.char.level++;
      this.char.skillPoints += 3;
      this.applyPlayerStats();
      this.player.coreHealth = this.player.maxCore;
      this.mana = this.maxMana;
      this.fx.sound('ko');
      this.flash(`LEVEL ${this.char.level}! +3 skill points`, this.simNow);
    }
  }

  learnSkill(id: string): boolean {
    const s = SKILL_BY_ID[id];
    if (!s || !canLearn(s, this.char)) { this.fx.sound('ui'); return false; }
    this.char.learned[id] = (this.char.learned[id] ?? 0) + 1;
    this.char.skillPoints--;
    this.questStats.skillsSpent++;
    this.applyPlayerStats();
    this.equipSlots();
    this.fx.sound('parry');
    return true;
  }

  private equipSlots(): void {
    this.slots = SKILLS.filter((s) => s.kind === 'active' && (this.char.learned[s.id] ?? 0) > 0).map((s) => s.id).slice(0, 4);
  }

  // ---- quests / onboarding ------------------------------------------------

  /** The objective the player is currently on, or null once they're all done. */
  currentQuest(): QuestStage | null {
    return this.questIndex < QUESTS.length ? QUESTS[this.questIndex] : null;
  }

  /** Progress (0..target) toward the current objective. */
  questProgress(): number {
    const q = this.currentQuest();
    return q ? Math.min(questValue(q.metric, this.questStats), q.target) : 0;
  }

  private updateQuests(now: number): void {
    // Roll the live tallies the metrics read from.
    const px = this.player.torsoBody.position.x;
    if (!this.player.koed) this.questStats.moved += Math.abs(px - this.prevPlayerX);
    this.prevPlayerX = px;
    this.questStats.kills = this.kills;
    const depth = this.depth();
    this.questStats.maxDepth = Math.max(this.questStats.maxDepth, depth);

    // Descent milestones: each new depth band raises the stakes (and pays a bonus).
    const band = (depth / 20) | 0;
    if (band > this.deepestBand) {
      this.deepestBand = band;
      const bonus = band * 6;
      this.loot += bonus;
      this.fx.sound('spawn', 0.9);
      this.fx.shake(8);
      this.flash(`▼ DEPTH ${band * 20} — danger & riches rise  (+${bonus} loot)`, now);
    }

    const q = this.currentQuest();
    if (!q) return;
    if (questValue(q.metric, this.questStats) >= q.target) {
      this.questIndex++;
      this.addXP(q.rewardXp);
      this.loot += q.rewardLoot;
      const next = this.currentQuest();
      this.fx.confetti(px, this.player.torsoBody.position.y - 40);
      this.fx.sound('ko');
      this.flash(next ? `OBJECTIVE DONE! +${q.rewardXp} XP  ·  Next: ${next.title}` : 'ALL OBJECTIVES DONE — the world is yours!', now);
    }
  }

  skillCooldown(id: string, now: number): number {
    return Math.max(0, (this.skillCdUntil[id] ?? 0) - now);
  }

  useSkill(slot: number, now: number): void {
    const id = this.slots[slot];
    if (!id || this.player.koed || this.skillTreeOpen) return;
    const s = SKILL_BY_ID[id];
    if (now < (this.skillCdUntil[id] ?? 0) || this.mana < (s.manaCost ?? 0)) { this.fx.sound('ui'); return; }
    this.mana -= s.manaCost ?? 0;
    this.skillCdUntil[id] = now + (s.cooldownMs ?? 0);
    this.castSkill(id, now);
  }

  private castSkill(id: string, now: number): void {
    const lvl = this.char.learned[id] ?? 1;
    const p = passives(this.char.learned);
    const t = this.player.torsoBody.position;
    const dir = this.player.facing;
    if (id === 'power') { this.aoeDamage(t.x, t.y, 110, (14 + lvl * 6) * p.spell, 8, 'phys'); this.fx.impact(t.x, t.y, 26, '#ffd0a0'); this.fx.sound('heavy'); }
    else if (id === 'whirl') { this.aoeDamage(t.x, t.y, 160, (18 + lvl * 7) * p.spell, 16, 'phys'); this.fx.impact(t.x, t.y, 34, '#ffffff'); this.fx.shake(14); this.fx.sound('boom'); }
    else if (id === 'firebolt') { this.coneDamage(t.x, t.y, dir, 200, (12 + lvl * 7) * p.spell, 6, 'heat'); for (let i = 0; i < 3; i++) this.fx.impact(t.x + dir * (60 + i * 50), t.y, 16, '#ff7a18'); this.fx.sound('zap'); }
    else if (id === 'frost') { this.aoeDamage(t.x, t.y, 150, (8 + lvl * 5) * p.spell, 4, 'heat'); this.fx.impact(t.x, t.y, 24, '#bfe9ff'); this.fx.sound('zap'); }
    else if (id === 'bolt') { this.chainBolt(t.x, t.y, (16 + lvl * 8) * p.spell, 3); this.fx.sound('zap'); }
    else if (id === 'mend') { const heal = 30 + lvl * 30; this.player.coreHealth = Math.min(this.player.maxCore, this.player.coreHealth + heal); this.fx.confetti(t.x, t.y); this.fx.sound('parry'); this.flash(`+${heal} HP`, now); }
  }

  private aoeDamage(x: number, y: number, r: number, dmg: number, knock: number, type: 'phys' | 'heat'): void {
    for (const m of this.monsters) {
      const c = m.torsoBody.position;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d > r) continue;
      const applied = m.damagePart('torso', dmg, this.simNow, type);
      if (knock > 0) { const inv = 1 / (d || 1); Body.setVelocity(m.torsoBody, { x: m.torsoBody.velocity.x + (c.x - x) * inv * knock, y: m.torsoBody.velocity.y - 4 }); }
      if (applied > 0) { this.fx.blood(c.x, c.y, applied); this.lifestealFrom(applied); }
    }
  }

  private coneDamage(x: number, y: number, dir: number, len: number, dmg: number, knock: number, type: 'phys' | 'heat'): void {
    for (const m of this.monsters) {
      const c = m.torsoBody.position;
      if (Math.sign(c.x - x) !== dir) continue;
      if (Math.abs(c.x - x) > len || Math.abs(c.y - y) > 90) continue;
      const applied = m.damagePart('torso', dmg, this.simNow, type);
      Body.setVelocity(m.torsoBody, { x: m.torsoBody.velocity.x + dir * knock, y: m.torsoBody.velocity.y - 3 });
      if (applied > 0) { this.fx.blood(c.x, c.y, applied); this.lifestealFrom(applied); }
    }
  }

  private chainBolt(x: number, y: number, dmg: number, n: number): void {
    const sorted = [...this.monsters].sort((a, b) => Math.hypot(a.torsoBody.position.x - x, a.torsoBody.position.y - y) - Math.hypot(b.torsoBody.position.x - x, b.torsoBody.position.y - y));
    for (const m of sorted.slice(0, n)) {
      const c = m.torsoBody.position;
      const applied = m.damagePart('torso', dmg, this.simNow, 'shock');
      m.stagger(this.simNow, 250);
      if (applied > 0) { this.fx.impact(c.x, c.y, 18, '#bfe9ff'); this.fx.blood(c.x, c.y, applied); this.lifestealFrom(applied); }
    }
  }

  private lifestealFrom(applied: number): void {
    const ls = passives(this.char.learned).lifesteal;
    if (ls > 0) this.player.coreHealth = Math.min(this.player.maxCore, this.player.coreHealth + applied * ls);
  }

  /** Depth below the surface in tiles (for the HUD). */
  depth(): number {
    const surfaceY = this.grid.rows * 0.32 * this.grid.cell;
    return Math.max(0, Math.round((this.player.torsoBody.position.y - surfaceY) / this.grid.cell));
  }
}
