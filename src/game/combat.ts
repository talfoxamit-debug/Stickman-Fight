// Deterministic melee resolution. While a fighter is in an attack's active window
// we sweep the weapon/fist/foot and reliably hit anyone in range for the move's
// base damage — connection no longer depends on physics-collision luck, which is
// what made fighting feel like random F-mashing. Each swing hits a target once.

import Matter from 'matter-js';
import { CFG } from '../config';
import type { PartName } from '../types';
import type { Fighter } from '../physics/fighter';
import type { FxSink } from './match';

const { Body } = Matter;
const C = CFG.combat;
const B = CFG.body;

// Body order matters: prefer torso/head so clean hits read as solid body blows.
const HURT_PARTS: PartName[] = [
  'torso', 'head',
  'upperArmL', 'upperArmR', 'upperLegL', 'upperLegR',
  'lowerArmL', 'lowerArmR', 'lowerLegL', 'lowerLegR',
];

const PART_RADIUS: Record<PartName, number> = {
  head: B.headRadius + 2,
  torso: 22,
  upperArmL: 9, upperArmR: 9, lowerArmL: 8, lowerArmR: 8,
  upperLegL: 10, upperLegR: 10, lowerLegL: 9, lowerLegR: 9,
};

interface Hit { part: PartName; x: number; y: number }

/** Find the first body of `tgt` that the strike segment touches (sampled along it). */
function sweepHit(seg: { ax: number; ay: number; bx: number; by: number }, tgt: Fighter): Hit | null {
  const SAMPLES = 5;
  for (const part of HURT_PARTS) {
    if (part !== 'torso' && part !== 'head' && tgt.isBroken(part)) continue;
    const b = tgt.parts[part];
    if (!b) continue;
    const r = PART_RADIUS[part] + C.meleeReach;
    const r2 = r * r;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const x = seg.ax + (seg.bx - seg.ax) * t;
      const y = seg.ay + (seg.by - seg.ay) * t;
      if ((x - b.position.x) ** 2 + (y - b.position.y) ** 2 <= r2) {
        return { part, x: b.position.x, y: b.position.y };
      }
    }
  }
  return null;
}

function knockback(tgt: Fighter, fromX: number, fromY: number, knock: number): void {
  if (knock <= 0) return;
  const c = tgt.torsoBody.position;
  let nx = c.x - fromX, ny = c.y - fromY;
  const d = Math.hypot(nx, ny) || 1;
  nx /= d; ny = ny / d - 0.5; // bias up so hits pop the target off the ground a little
  for (const bb of tgt.bodies()) Body.setVelocity(bb, { x: bb.velocity.x + nx * knock, y: bb.velocity.y + ny * knock });
}

/**
 * Resolve every active strike among `fighters` against the others.
 * Returns the number of hit-stop steps the caller should freeze the sim for.
 */
export function resolveMelee(fighters: Fighter[], fx: FxSink, now: number): number {
  let hitstop = 0;
  for (const atk of fighters) {
    if (atk.koed || !atk.isStriking(now)) continue;
    const seg = atk.strikeSegment();
    const info = atk.currentAttackInfo();
    if (!seg || !info) continue;

    for (const tgt of fighters) {
      if (tgt === atk || tgt.koed || tgt.isDodging(now)) continue;
      const hit = sweepHit(seg, tgt);
      if (!hit) continue;
      if (!atk.registerHit(tgt.id)) continue; // one hit per swing per target

      // Defense: a guard from the front chips; a guard within the window parries.
      const fromFront = Math.sign(atk.torsoBody.position.x - tgt.torsoBody.position.x) === tgt.facing;
      if (tgt.isBlocking() && fromFront) {
        if (tgt.blockAge(now) <= C.parryWindowMs) {
          atk.stagger(now, C.parryStunMs);
          const px = tgt.torsoBody.position.x, py = tgt.torsoBody.position.y;
          knockback(atk, px, py, 8);
          fx.impact(px, py - 16, 18, '#ffffff');
          fx.text?.(px, py - 64, 'PARRY!', '#ffffff');
          fx.sound('parry'); fx.shake(11);
          hitstop = Math.max(hitstop, 6);
          continue;
        }
        const chip = info.base * atk.damageMul * C.blockDamageMul;
        tgt.damagePart(hit.part, chip, now);
        fx.impact(hit.x, hit.y, 9, '#bfe9ff');
        fx.sound('block');
        hitstop = Math.max(hitstop, 2);
        continue;
      }

      const applied = tgt.damagePart(hit.part, info.base * atk.damageMul, now);
      if (applied <= 0) continue;
      knockback(tgt, atk.torsoBody.position.x, atk.torsoBody.position.y, info.knock);
      const heavy = info.motion === 'heavy';
      fx.blood(hit.x, hit.y, applied);
      fx.impact(hit.x, hit.y, heavy ? 22 : 12, heavy ? '#ffd27a' : '#fff2a8');
      fx.shake(Math.min(18, heavy ? 14 : 7));
      if (heavy) fx.text?.(hit.x, hit.y - 50, 'CRUSH!', '#ffd27a');
      fx.sound(heavy ? 'heavy' : 'hit');
      hitstop = Math.max(hitstop, info.hitstop);
    }
  }
  return hitstop;
}
