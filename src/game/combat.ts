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

/** The body of `tgt` the strike segment passes closest to — so the blade bites
 * whatever it actually catches (a side-slash clips the near arm = a real disarm). */
function sweepHit(seg: { ax: number; ay: number; bx: number; by: number }, tgt: Fighter): Hit | null {
  const SAMPLES = 6;
  let best: Hit | null = null;
  let bestD2 = Infinity;
  for (const part of HURT_PARTS) {
    if (part !== 'torso' && part !== 'head' && tgt.isBroken(part)) continue;
    const b = tgt.parts[part];
    if (!b) continue;
    const r = PART_RADIUS[part] + C.meleeReach;
    const r2 = r * r;
    // Keep body blows primary: a limb must be clearly closer than the torso to win
    // (so you mostly hit the body, but catch a reaching limb for a disarm).
    const bias = part === 'torso' || part === 'head' ? 0 : 240;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const x = seg.ax + (seg.bx - seg.ax) * t;
      const y = seg.ay + (seg.by - seg.ay) * t;
      const d2 = (x - b.position.x) ** 2 + (y - b.position.y) ** 2;
      if (d2 <= r2 && d2 + bias < bestD2) { bestD2 = d2 + bias; best = { part, x: b.position.x, y: b.position.y }; }
    }
  }
  return best;
}

function knockback(tgt: Fighter, fromX: number, knock: number, heavy: boolean): void {
  if (knock <= 0) return;
  const c = tgt.torsoBody.position;
  const hx = Math.sign(c.x - fromX) || 1; // away from attacker = the swing direction
  const up = heavy ? 0.85 : 0.4; // heavies launch up & away; lights shove sideways
  for (const bb of tgt.bodies()) Body.setVelocity(bb, { x: bb.velocity.x + hx * knock, y: bb.velocity.y - up * knock });
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
          knockback(atk, px, 8, false);
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

      const heavy = info.motion === 'heavy';
      const finisher = info.finisher;
      const power = heavy || finisher;
      const isLimb = hit.part !== 'torso' && hit.part !== 'head';
      const shape = atk.weapon?.def.shape;
      const bladed = shape === 'sword' || shape === 'baguette'; // edged: cleaves limbs
      const blunt = shape === 'mace' || shape === 'discoflail'; // bludgeons: more knockback

      // Damage: base + edged/heavy limb-cleave + combo finisher + a punish bonus on a
      // reeling or airborne foe (Dead Cells-style crit that rewards follow-ups/juggles).
      let dmg = info.base * atk.damageMul;
      if (isLimb && bladed) dmg *= 1.7;
      if (isLimb && heavy) dmg *= 1.4;
      if (finisher) dmg *= 1.45;
      const punished = tgt.isHitstunned(now) || !tgt.grounded;
      if (punished) dmg *= 1.25;

      // Knockback escalates as the victim wears down (Smash "rage"), so fights build
      // to dramatic launches; blunt weapons + finishers + punishes hit harder still.
      let knock = info.knock * (1 + (1 - tgt.coreHealth / tgt.maxCore) * 0.9);
      if (blunt) knock *= 1.5;
      if (finisher) knock *= 1.5;
      if (punished) knock *= 1.2;

      const wasBroken = tgt.isBroken(hit.part);
      const wasKoed = tgt.koed;
      const applied = tgt.damagePart(hit.part, dmg, now);
      if (applied <= 0) continue;
      knockback(tgt, atk.torsoBody.position.x, knock, power);
      tgt.takeHit(now, applied, atk.torsoBody.position.x); // victim reels (interrupts their move)
      fx.blood(hit.x, hit.y, applied);
      fx.impact(hit.x, hit.y, power ? 20 : 11, bladed ? '#ffffff' : '#ffd27a');
      fx.shake(Math.min(18, power ? 13 : 6));
      fx.sound(power ? 'heavy' : 'hit');
      // Hit-stop scales with the blow (Dead Cells): bigger hits freeze longer.
      hitstop = Math.max(hitstop, Math.min(13, info.hitstop + Math.floor(applied / 6) + (finisher ? 3 : 0)));

      // The finishing blow gets a cinematic freeze + a K.O. pop.
      if (!wasKoed && tgt.koed) {
        hitstop = Math.max(hitstop, 15);
        fx.shake(20);
        fx.text?.(tgt.torsoBody.position.x, tgt.torsoBody.position.y - 56, 'K.O.!', '#ffd200');
      }

      // Dismemberment: this blow severed the limb — big gout + an extra beat.
      if (isLimb && !wasBroken && tgt.isBroken(hit.part)) {
        fx.blood(hit.x, hit.y, 34);
        fx.impact(hit.x, hit.y, 26, '#ff3b4a');
        fx.shake(13);
        fx.text?.(hit.x, hit.y - 48, 'SEVERED!', '#ff5a5a');
        fx.sound('heavy');
        hitstop = Math.max(hitstop, 8);
      }
    }
  }
  return hitstop;
}
