import { describe, it, expect } from 'vitest';
import { PowderGrid } from '../src/powder/grid';
import { Mat } from '../src/powder/materials';
import { Match, type FxSink } from '../src/game/match';
import { EMPTY_INPUT } from '../src/core/input';
import { Bot } from '../src/game/bot';

describe('powder / chemistry', () => {
  it('sand falls under gravity', () => {
    const g = new PowderGrid(240, 240, 6);
    g.paintPx(120, 12, Mat.Sand, 10);
    for (let i = 0; i < 300; i++) g.update();
    let bottom = 0;
    for (let x = 0; x < 240; x += 6) if (g.matAtPx(x, 232) === Mat.Sand) bottom++;
    expect(bottom).toBeGreaterThan(0);
  });

  it('lava + water makes steam (and some stone)', () => {
    const g = new PowderGrid(240, 240, 6);
    g.fillRectPx(0, 180, 240, 210, Mat.Water);
    g.fillRectPx(0, 150, 240, 180, Mat.Lava);
    let steam = 0;
    for (let i = 0; i < 60; i++) g.update();
    for (let y = 0; y < 240; y += 6) for (let x = 0; x < 240; x += 6) if (g.matAtPx(x, y) === Mat.Steam) steam++;
    expect(steam).toBeGreaterThan(0);
  });

  it('fire + gunpowder explodes', () => {
    const g = new PowderGrid(120, 120, 6);
    g.fillRectPx(40, 60, 80, 80, Mat.Gunpowder);
    g.paintPx(60, 60, Mat.Fire, 6);
    let booms = 0;
    for (let i = 0; i < 20; i++) { g.update(); booms += g.explosions.length; g.explosions.length = 0; }
    expect(booms).toBeGreaterThan(0);
  });

  it('a full chemistry match runs without NaN', () => {
    const fx: FxSink = { impact() {}, blood() {}, confetti() {}, shake() {} };
    const m = new Match(fx); m.botEnabled = true; const p1 = new Bot();
    let t = 0;
    for (let i = 0; i < 60 * 12 && m.state !== 'matchover'; i++) {
      t += 1000 / 60;
      const a = m.state === 'fight' ? p1.think(m.fighters[0], m.fighters[1], m.looseWeapons) : EMPTY_INPUT;
      m.step(t, [a, EMPTY_INPUT]);
    }
    for (const f of m.fighters) expect(Number.isFinite(f.torsoBody.position.y)).toBe(true);
  });
});
