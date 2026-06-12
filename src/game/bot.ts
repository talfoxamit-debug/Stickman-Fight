import type { PlayerInput } from '../core/input';
import type { Fighter } from '../physics/fighter';
import { dist } from '../core/util';
import type { Weapon } from '../physics/weapon';
import { CFG } from '../config';

const EMPTY = (): PlayerInput => ({ left: false, right: false, jump: false, attack: false, grab: false, block: false, aimX: null, aimY: null });
const SC = CFG.combat.stamina.cost;

/**
 * Combat AI that actually uses the modern moveset: it manages stamina (backs off
 * to recover when winded), spaces to its preferred range, reacts to incoming
 * attacks (guard/parry or dodge), and *presses* when the foe is vulnerable
 * (winded or reeling). `skill` (0..1) scales reactions, discipline, and aggression.
 */
export class Bot {
  private attackCdUntil = 0;
  private heavyHoldUntil = 0;
  private blockUntil = 0;
  private reactCdUntil = 0;
  private dodgeFrames = 0;
  private dodgeDir = 0;
  private nextJumpAt = 0;

  constructor(private skill = 0.5) {}

  think(me: Fighter, foe: Fighter, loose: Weapon[], now: number): PlayerInput {
    const input = EMPTY();
    if (me.koed || me.isHitstunned(now)) return input; // can't act while down / reeling

    const mx = me.torsoBody.position.x, my = me.torsoBody.position.y;

    // Disarmed: go fetch the nearest loose weapon.
    if (!me.hasWeapon() && loose.length) {
      let best = loose[0], bestD = Infinity;
      for (const w of loose) { const d = dist(mx, my, w.body.position.x, w.body.position.y); if (d < bestD) { bestD = d; best = w; } }
      const dxw = best.body.position.x - mx;
      if (Math.abs(dxw) > 30) input[dxw > 0 ? 'right' : 'left'] = true;
      else input.grab = true;
      return input;
    }

    const dx = foe.torsoBody.position.x - mx;
    const adx = Math.abs(dx);
    const dy = foe.torsoBody.position.y - my;
    const faceDir = dx > 0 ? 1 : -1;
    const back = faceDir > 0 ? 'left' : 'right';
    const fwd = faceDir > 0 ? 'right' : 'left';

    // Winded / low stamina: disengage and recover (guard if cornered). This is what
    // gives fights a rhythm instead of a mash — openings appear when someone gases out.
    if (me.winded || me.stamina < SC.heavy * 0.6) {
      if (adx < 230) input[back] = true; // create space while stamina refills
      if (adx < 110 && Math.random() < this.skill * 0.55) input.block = true;
      if (now > this.nextJumpAt && Math.random() < 0.08) { input.jump = true; this.nextJumpAt = now + 900; }
      return input;
    }

    // React to an incoming attack: dodge away or raise a (possibly parrying) guard.
    if (foe.isAttacking() && adx < 155 && now > this.reactCdUntil) {
      this.reactCdUntil = now + (920 - this.skill * 420);
      const reactChance = 0.22 + this.skill * 0.55;
      const r = Math.random();
      if (r < reactChance * 0.45 && me.stamina > SC.dodge) { this.dodgeFrames = 3; this.dodgeDir = -faceDir; }
      else if (r < reactChance) this.blockUntil = now + 210; // hold guard; well-timed = parry
    }
    if (this.dodgeFrames > 0) { // emit the double-tap dodge sequence
      if (this.dodgeFrames !== 2) input[this.dodgeDir > 0 ? 'right' : 'left'] = true;
      this.dodgeFrames--;
      return input;
    }
    if (now < this.blockUntil) { input.block = true; return input; }

    // Spacing: hold a tidy strike range — close the gap, or back off if too close.
    const ideal = 72;
    if (adx > ideal + 22) input[fwd] = true;
    else if (adx < ideal - 26) input[back] = true;

    // Offense: press hard when the foe is vulnerable; otherwise measured, spaced hits.
    const foeOpen = foe.winded || foe.isHitstunned(now);
    const inRange = adx < 132 && Math.abs(dy) < 88;
    if (now < this.heavyHoldUntil) {
      input.attack = true; // committing to a charged heavy
    } else if (inRange && now > this.attackCdUntil) {
      const heavyChance = (foeOpen ? 0.42 : 0.16) * (0.5 + this.skill * 0.7);
      if (Math.random() < heavyChance && me.stamina > SC.heavy + 4) {
        this.heavyHoldUntil = now + 360;
        this.attackCdUntil = now + (foeOpen ? 720 : 1050);
        input.attack = true;
      } else if (me.stamina > SC.slash) {
        input.attack = true;
        this.attackCdUntil = now + (foeOpen ? 360 : 640 - this.skill * 140);
      }
    }

    // Hop to reach a higher foe, or occasionally to mix up spacing.
    if (now > this.nextJumpAt && (dy < -60 || (inRange && Math.random() < 0.1))) {
      input.jump = true;
      this.nextJumpAt = now + 850;
    }

    return input;
  }
}
