import type { PlayerInput } from '../core/input';
import type { Fighter } from '../physics/fighter';
import { dist } from '../core/util';
import type { Weapon } from '../physics/weapon';

/**
 * Deliberately simple Phase-1 AI: close the distance, swing in range, hop now and
 * then, and grab a weapon if disarmed. (Full utility AI is Phase 5 — see ROADMAP.)
 */
export class Bot {
  private attackCdUntil = 0;
  private grabUntil = 0;
  private nextJumpAt = 0;
  private clock = 0;

  think(me: Fighter, foe: Fighter, loose: Weapon[]): PlayerInput {
    this.clock += 1000 / 60;
    const t = this.clock;
    const mx = me.torsoBody.position.x;
    const my = me.torsoBody.position.y;
    const input: PlayerInput = { left: false, right: false, jump: false, attack: false, grab: false, block: false, aimX: null, aimY: null };
    if (me.koed) return input;

    // Disarmed: go grab the nearest loose weapon.
    if (!me.hasWeapon() && loose.length) {
      let best = loose[0];
      let bestD = Infinity;
      for (const w of loose) {
        const d = dist(mx, my, w.body.position.x, w.body.position.y);
        if (d < bestD) {
          bestD = d;
          best = w;
        }
      }
      const dx = best.body.position.x - mx;
      if (Math.abs(dx) > 30) input[dx > 0 ? 'right' : 'left'] = true;
      else if (t > this.grabUntil) {
        input.grab = true;
        this.grabUntil = t + 260;
      }
      return input;
    }

    const dx = foe.torsoBody.position.x - mx;
    const adx = Math.abs(dx);
    const dy = foe.torsoBody.position.y - my;

    // Approach / keep spacing.
    if (adx > 78) input[dx > 0 ? 'right' : 'left'] = true;
    else if (adx < 46) input[dx > 0 ? 'left' : 'right'] = true; // don't overlap

    // Swing when roughly in range, with a cooldown so edges register.
    if (adx < 120 && t > this.attackCdUntil) {
      input.attack = true;
      this.attackCdUntil = t + 620;
    }

    // Occasional hop, or hop if the foe is above.
    if (t > this.nextJumpAt && (dy < -50 || Math.random() < 0.25)) {
      input.jump = true;
      this.nextJumpAt = t + 900;
    }

    return input;
  }
}
