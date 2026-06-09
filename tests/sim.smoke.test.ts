import { describe, it, expect } from 'vitest';
import { Match, type FxSink } from '../src/game/match';
import { EMPTY_INPUT } from '../src/core/input';

const noopFx: FxSink = { impact() {}, blood() {}, confetti() {}, shake() {} };
const STEP = 1000 / 60;

describe('ragdoll sim — Phase 1 core', () => {
  it('builds two complete fighters each holding a weapon', () => {
    const m = new Match(noopFx);
    expect(m.fighters.length).toBe(2);
    for (const f of m.fighters) {
      expect(Object.keys(f.parts).length).toBe(10);
      expect(f.hasWeapon()).toBe(true);
      expect(f.koed).toBe(false);
    }
  });

  it('steps for ~2s without exploding into NaN', () => {
    const m = new Match(noopFx);
    for (let i = 0; i < 120; i++) m.step(i * STEP, [EMPTY_INPUT, EMPTY_INPUT]);
    for (const f of m.fighters) {
      const p = f.torsoBody.position;
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      // Should not have fallen through the floor / rocketed away.
      expect(p.y).toBeLessThan(900);
    }
  });

  it('breaking the weapon-arm joint detaches the arm and drops the weapon', () => {
    const m = new Match(noopFx);
    const f = m.fighters[0];
    expect(f.hasWeapon()).toBe(true);
    let t = 0;
    for (let i = 0; i < 8 && !f.isBroken('upperArmR'); i++) {
      t += 250; // beat the per-part hit cooldown
      f.damagePart('upperArmR', 999, t);
    }
    expect(f.isBroken('upperArmR')).toBe(true);
    expect(f.hasWeapon()).toBe(false);
    expect(f.justDropped.length).toBeGreaterThan(0);
  });

  it('decapitation (neck break) is an instant KO', () => {
    const m = new Match(noopFx);
    const f = m.fighters[1];
    let t = 0;
    for (let i = 0; i < 8 && !f.koed; i++) {
      t += 250;
      f.damagePart('head', 999, t);
    }
    expect(f.isBroken('head')).toBe(true);
    expect(f.koed).toBe(true);
  });

  it('draining core HP via torso hits is a KO', () => {
    const m = new Match(noopFx);
    const f = m.fighters[0];
    let t = 0;
    for (let i = 0; i < 30 && !f.koed; i++) {
      t += 200;
      f.damagePart('torso', 40, t);
    }
    expect(f.koed).toBe(true);
    expect(f.coreHealth).toBe(0);
  });

  it('throwing the held weapon (grab) makes it a loose pickup', () => {
    const m = new Match(noopFx);
    const f = m.fighters[0];
    // Advance past the round intro so inputs are live.
    let t = 0;
    for (let i = 0; i < 120 && m.state !== 'fight'; i++) {
      t += STEP;
      m.step(t, [EMPTY_INPUT, EMPTY_INPUT]);
    }
    expect(m.state).toBe('fight');
    const grab = { ...EMPTY_INPUT, grab: true };
    t += STEP;
    m.step(t, [grab, EMPTY_INPUT]);
    expect(f.hasWeapon()).toBe(false);
    expect(m.looseWeapons.length).toBeGreaterThan(0);
  });
});
