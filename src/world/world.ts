// Terraria-style open-world mode: a big diggable terrain you explore with a camera.

import Matter from 'matter-js';
import { CFG } from '../config';
import { clamp } from '../core/util';
import type { PlayerInput } from '../core/input';
import { Fighter, type Evolution } from '../physics/fighter';
import { WorldGrid } from './worldgrid';
import { Mat } from '../powder/materials';

const { Engine, Composite, Body } = Matter;

export class World {
  engine: Matter.Engine;
  grid: WorldGrid;
  player: Fighter;
  monsters: Fighter[] = [];
  camera = { x: 0, y: 0 }; // focus point (world coords) the camera centers on
  zoom = 0.55; // zoomed out so the character is small in a vast world
  inventory = new Map<Mat, number>();
  lastMined: Mat | null = null;

  private digCdUntil = 0;

  constructor(public playerEvo: Evolution = 'none') {
    this.engine = Engine.create();
    this.engine.gravity.y = CFG.sim.gravityY;
    this.grid = new WorldGrid();
    this.player = new Fighter(this.engine.world, {
      id: 0, x: this.grid.spawnX, facing: 1,
      color: '#22e3ff', accent: '#aef9ff', name: 'YOU', weaponIndex: 0,
    });
    this.player.evolution = this.playerEvo;
    this.player.groundSampler = (x, y) => this.grid.groundBelowPx(x, y);
    // Drop the player onto the spawn surface.
    Body.setPosition(this.player.torsoBody, { x: this.grid.spawnX, y: this.grid.spawnY });
    this.centerCamera();
  }

  private centerCamera(): void {
    const halfW = CFG.view.width / (2 * this.zoom);
    const halfH = CFG.view.height / (2 * this.zoom);
    const px = this.player.torsoBody.position.x, py = this.player.torsoBody.position.y;
    this.camera.x = this.grid.widthPx > 2 * halfW ? clamp(px, halfW, this.grid.widthPx - halfW) : this.grid.widthPx / 2;
    this.camera.y = this.grid.heightPx > 2 * halfH ? clamp(py, halfH, this.grid.heightPx - halfH) : this.grid.heightPx / 2;
  }

  step(now: number, input: PlayerInput): void {
    this.player.applyControl(now, input);
    Engine.update(this.engine, CFG.sim.fixedDt);
    this.blockWalls(this.player);
    this.handleDig(now, input);
    this.clampSpeeds();
    this.centerCamera();
  }

  /** Ride gentle slopes (stand-support does the lifting); block only true cliffs
   *  taller than a step. Lets the ragdoll walk over chunky terrain without sticking. */
  private blockWalls(f: Fighter): void {
    const t = f.torsoBody;
    const dir = Math.sign(t.velocity.x);
    if (dir === 0) return;
    const hw = 16;
    const frontX = t.position.x + dir * hw;
    const curGround = this.grid.groundBelowPx(t.position.x, t.position.y);
    const frontGround = this.grid.groundBelowPx(frontX, t.position.y);
    const stepUp = curGround - frontGround; // >0 means the ground ahead is higher
    const maxStep = this.grid.cell * 1.6; // can climb up to ~1.5 tiles automatically
    if (stepUp > maxStep) {
      // A wall/cliff: stop and nudge back to its edge.
      Body.setVelocity(t, { x: 0, y: t.velocity.y });
      const edge = (Math.round(frontX / this.grid.cell) * this.grid.cell) - dir * hw;
      Body.setPosition(t, { x: edge, y: t.position.y });
    }
  }

  private handleDig(now: number, input: PlayerInput): void {
    if (!input.attack || now < this.digCdUntil) return;
    this.digCdUntil = now + 110;
    const p = this.player.torsoBody.position;
    let tx = p.x + this.player.facing * this.grid.cell * 1.6;
    let ty = p.y + 16;
    if (input.aimX != null && input.aimY != null) {
      // Screen -> world through the zoom.
      const wx = this.camera.x + (input.aimX - CFG.view.width / 2) / this.zoom;
      const wy = this.camera.y + (input.aimY - CFG.view.height / 2) / this.zoom;
      const dx = wx - p.x, dy = wy - p.y, d = Math.hypot(dx, dy) || 1;
      const reach = this.grid.cell * 3.5;
      if (d > reach) { tx = p.x + (dx / d) * reach; ty = p.y + (dy / d) * reach; }
      else { tx = wx; ty = wy; }
    }
    const mined = this.grid.digPx(tx, ty, this.grid.cell * (this.player.evolution === 'burrower' ? 2.4 : 1.4));
    for (const [m, n] of mined) {
      this.inventory.set(m, (this.inventory.get(m) ?? 0) + n);
      this.lastMined = m;
    }
  }

  private clampSpeeds(): void {
    const maxV = CFG.sim.maxLinearSpeed, maxW = CFG.sim.maxAngularSpeed;
    for (const b of Composite.allBodies(this.engine.world)) {
      const sp = Math.hypot(b.velocity.x, b.velocity.y);
      if (sp > maxV) Body.setVelocity(b, { x: (b.velocity.x / sp) * maxV, y: (b.velocity.y / sp) * maxV });
      if (Math.abs(b.angularVelocity) > maxW) Body.setAngularVelocity(b, Math.sign(b.angularVelocity) * maxW);
    }
  }
}
