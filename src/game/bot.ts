import type { PlayerInput } from '../core/input';
import type { Fighter } from '../physics/fighter';
import { dist } from '../core/util';
import type { Weapon } from '../physics/weapon';

/**
 * Phase-1/5 AI: approach, attack (light + occasional heavy), grab a weapon if
 * disarmed, and react to incoming attacks by blocking or dodging.
 */
export class Bot {
  private clock = 0;
  private attackCdUntil = 0;
  private grabUntil = 0;
  private nextJumpAt = 0;
  private heavyHoldUntil = 0;
  private blockUntil = 0;
  private reactCdUntil = 0;
  private dodgeFrames = 0;
  private dodgeDir = 0;

  think(me: Fighter, foe: Fighter, loose: Weapon[]): PlayerInput {
    this.clock += 1000 / 60;
    const t = this.clock;
    const input: PlayerInput = { left: false, right: false, jump: false, attack: false, grab: false, block: false, aimX: null, aimY: null };
    if (me.koed) return input;

    const mx = me.torsoBody.position.x;
    const my = me.torsoBody.position.y;

    // Disarmed: fetch the nearest loose weapon.
    if (!me.hasWeapon() && loose.length) {
      let best = loose[0];
      let bestD = Infinity;
      for (const w of loose) {
        const d = dist(mx, my, w.body.position.x, w.body.position.y);
        if (d < bestD) { bestD = d; best = w; }
      }
      const dx = best.body.position.x - mx;
      if (Math.abs(dx) > 30) input[dx > 0 ? 'right' : 'left'] = true;
      else if (t > this.grabUntil) { input.grab = true; this.grabUntil = t + 260; }
      return input;
    }

    const dx = foe.torsoBody.position.x - mx;
    const adx = Math.abs(dx);
    const dy = foe.torsoBody.position.y - my;
    const faceDir = dx > 0 ? 1 : -1;

    // React to an incoming attack: sometimes dodge or guard (but mostly keep trading).
    if (foe.isAttacking() && adx < 135 && t > this.reactCdUntil) {
      this.reactCdUntil = t + 720;
      const r = Math.random();
      if (r < 0.22) { this.dodgeFrames = 3; this.dodgeDir = -faceDir; }
      else if (r < 0.42) this.blockUntil = t + 280;
    }

    // Emit a dodge double-tap (tap / release / tap) away from the foe.
    if (this.dodgeFrames > 0) {
      const dir = this.dodgeDir > 0 ? 'right' : 'left';
      if (this.dodgeFrames !== 2) input[dir] = true;
      this.dodgeFrames--;
      return input;
    }

    if (t < this.blockUntil) { input.block = true; return input; }

    // Spacing.
    if (adx > 80) input[dx > 0 ? 'right' : 'left'] = true;
    else if (adx < 46) input[dx > 0 ? 'left' : 'right'] = true;

    // Hold for a heavy if one was committed.
    if (t < this.heavyHoldUntil) input.attack = true;
    else if (adx < 130 && t > this.attackCdUntil) {
      if (Math.random() < 0.25) { this.heavyHoldUntil = t + 430; this.attackCdUntil = t + 950; input.attack = true; }
      else { input.attack = true; this.attackCdUntil = t + 560; }
    }

    // Hop occasionally or to reach a higher foe.
    if (t > this.nextJumpAt && (dy < -55 || Math.random() < 0.22)) {
      input.jump = true;
      this.nextJumpAt = t + 850;
    }

    return input;
  }
}
