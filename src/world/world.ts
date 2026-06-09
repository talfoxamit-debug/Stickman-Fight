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
  camera = { x: 0, y: 0 };
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
    const vw = CFG.view.width, vh = CFG.view.height;
    this.camera.x = clamp(this.player.torsoBody.position.x - vw / 2, 0, Math.max(0, this.grid.widthPx - vw));
    this.camera.y = clamp(this.player.torsoBody.position.y - vh / 2, 0, Math.max(0, this.grid.heightPx - vh));
  }

  step(now: number, input: PlayerInput): void {
    this.player.applyControl(now, input);
    Engine.update(this.engine, CFG.sim.fixedDt);
    this.blockWalls(this.player);
    this.handleDig(now, input);
    this.clampSpeeds();
    this.centerCamera();
  }

  /** Stop a fighter from walking into solid terrain (the surface/cave is handled by
   *  the ground-sampler stand support; this blocks horizontal penetration). */
  private blockWalls(f: Fighter): void {
    const t = f.torsoBody;
    const hw = 13;
    for (const oy of [-12, 8, 22]) {
      if (t.velocity.x > 0 && this.grid.isSolidPx(t.position.x + hw, t.position.y + oy)) {
        Body.setVelocity(t, { x: 0, y: t.velocity.y });
        Body.setPosition(t, { x: ((t.position.x + hw) / this.grid.cell | 0) * this.grid.cell - hw, y: t.position.y });
        break;
      }
      if (t.velocity.x < 0 && this.grid.isSolidPx(t.position.x - hw, t.position.y + oy)) {
        Body.setVelocity(t, { x: 0, y: t.velocity.y });
        Body.setPosition(t, { x: (((t.position.x - hw) / this.grid.cell | 0) + 1) * this.grid.cell + hw, y: t.position.y });
        break;
      }
    }
  }

  private handleDig(now: number, input: PlayerInput): void {
    if (!input.attack || now < this.digCdUntil) return;
    this.digCdUntil = now + 110;
    const p = this.player.torsoBody.position;
    let tx = p.x + this.player.facing * 42;
    let ty = p.y + 16;
    if (input.aimX != null && input.aimY != null) {
      const wx = this.camera.x + input.aimX, wy = this.camera.y + input.aimY;
      const dx = wx - p.x, dy = wy - p.y, d = Math.hypot(dx, dy) || 1;
      const reach = 78;
      if (d > reach) { tx = p.x + (dx / d) * reach; ty = p.y + (dy / d) * reach; }
      else { tx = wx; ty = wy; }
    }
    const mined = this.grid.digPx(tx, ty, this.player.evolution === 'burrower' ? 22 : 14);
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
