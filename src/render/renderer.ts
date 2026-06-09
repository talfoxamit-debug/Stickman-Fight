import { CFG } from '../config';
import type { PartName } from '../types';
import type { Fighter } from '../physics/fighter';
import type { Match } from '../game/match';
import type { Weapon } from '../physics/weapon';
import type { Fx } from './fx';
import { PowderRenderer } from '../powder/render';
import { ARMOR } from '../physics/armor';
import { xpForLevel, upgradeCost, UPGRADES } from '../game/save';

const B = CFG.body;
const W = CFG.view.width;
const H = CFG.view.height;

// Bump this whenever behaviour changes so you can confirm a fresh build is live.
const VERSION = 'v0.17 · survival prep hub (buy/evolve/deploy)';

/** Blend two #rrggbb colors (t in 0..1). */
function hexLerp(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const m = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  return `rgb(${m(0)},${m(1)},${m(2)})`;
}

const PART_DIMS: Record<PartName, { len: number; thick: number }> = {
  head: { len: B.headRadius * 2, thick: B.headRadius * 2 },
  torso: { len: B.torso.h, thick: B.torso.w },
  upperArmL: { len: B.upperArm.h, thick: B.upperArm.w },
  lowerArmL: { len: B.lowerArm.h, thick: B.lowerArm.w },
  upperArmR: { len: B.upperArm.h, thick: B.upperArm.w },
  lowerArmR: { len: B.lowerArm.h, thick: B.lowerArm.w },
  upperLegL: { len: B.upperLeg.h, thick: B.upperLeg.w },
  lowerLegL: { len: B.lowerLeg.h, thick: B.lowerLeg.w },
  upperLegR: { len: B.upperLeg.h, thick: B.upperLeg.w },
  lowerLegR: { len: B.lowerLeg.h, thick: B.lowerLeg.w },
};

const LIMB_ORDER: PartName[] = [
  'upperLegL', 'lowerLegL', 'upperLegR', 'lowerLegR',
  'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR',
  'torso',
];

export class Renderer {
  private powder?: PowderRenderer;
  constructor(private ctx: CanvasRenderingContext2D) {}

  draw(match: Match, fx: Fx, paused: boolean): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.background(ctx);

    ctx.save();
    ctx.translate(fx.shakeX, fx.shakeY);
    this.platform(ctx);
    this.floatingPlatforms(ctx);
    if (!this.powder) this.powder = new PowderRenderer(match.grid);
    this.powder.draw(ctx, match.grid, CFG.view.width, CFG.view.height);
    for (const w of match.looseWeapons) this.weapon(ctx, w, false);
    for (const f of match.fighters) this.fighter(ctx, f);
    fx.draw(ctx);
    ctx.restore();

    this.hud(ctx, match);
    this.banner(ctx, match, paused);
    if (match.mode === 'survival' && (match.state === 'matchover' || match.state === 'prep')) this.survivalShop(ctx, match);

    // Version stamp, bottom-left (confirms a fresh deploy is live).
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(124,255,90,0.7)';
    ctx.fillText(VERSION, 12, H - 10);
  }

  // ---- world --------------------------------------------------------------

  private background(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0830');
    g.addColorStop(0.55, '#2a0a3e');
    g.addColorStop(1, '#3d0b2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Festival "moon" + glow orbs (stars).
    this.glowCircle(ctx, W * 0.82, 120, 46, 'rgba(255,221,120,0.9)', 60);
    const stars = [[0.18, 90, 8, '#00f0ff'], [0.4, 70, 5, '#ff37c8'], [0.62, 110, 6, '#7cff5a'], [0.3, 130, 4, '#b18bff'], [0.7, 60, 4, '#ffcf4d'], [0.5, 50, 3, '#fff']];
    for (const [fx, y, r, col] of stars as [number, number, number, string][]) this.glowCircle(ctx, W * fx, y, r, col, r * 4);

    // The Effigy (a big burnable-looking neon "man" in the distance).
    this.effigy(ctx, W * 0.5, CFG.arena.floorY - 30, '#ff7a18');
    // Glowing totems flanking the arena.
    this.totem(ctx, 110, CFG.arena.floorY, '#00f0ff');
    this.totem(ctx, W - 110, CFG.arena.floorY, '#ff37c8');

    // Horizon haze.
    const hz = ctx.createLinearGradient(0, CFG.arena.floorY - 120, 0, CFG.arena.floorY);
    hz.addColorStop(0, 'rgba(255,55,200,0)');
    hz.addColorStop(1, 'rgba(255,55,200,0.18)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, CFG.arena.floorY - 120, W, 120);
  }

  private platform(ctx: CanvasRenderingContext2D): void {
    const inset = CFG.arena.wallInset;
    const x = inset;
    const y = CFG.arena.floorY;
    const w = W - inset * 2;
    const h = CFG.arena.floorThickness;
    ctx.fillStyle = '#160a22';
    ctx.fillRect(x, y, w, h);
    // Neon top edge.
    ctx.save();
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 24;
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.restore();
    // Playa dashes.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    for (let i = x + 20; i < x + w; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, y + 16);
      ctx.lineTo(i + 22, y + 16);
      ctx.stroke();
    }
    // Neon edge railings.
    ctx.save();
    ctx.shadowColor = '#ff37c8';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ff37c8';
    const rh = CFG.arena.railHeight;
    for (const rx of [inset, W - inset]) ctx.fillRect(rx - 7, y - rh + 6, 14, rh);
    ctx.restore();
  }

  private floatingPlatforms(ctx: CanvasRenderingContext2D): void {
    for (const p of CFG.arena.platforms) {
      const x = p.x - p.w / 2;
      const top = p.y - p.h / 2;
      ctx.fillStyle = '#180b26';
      ctx.fillRect(x, top, p.w, p.h);
      ctx.save();
      ctx.shadowColor = '#7cff5a';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = '#7cff5a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + p.w, top);
      ctx.stroke();
      ctx.restore();
    }
  }

  private effigy(ctx: CanvasRenderingContext2D, x: number, baseY: number, color: string): void {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    const h = 150;
    ctx.beginPath();
    ctx.moveTo(x, baseY - h); ctx.lineTo(x, baseY - h * 0.35); // body
    ctx.moveTo(x - 40, baseY - h * 0.75); ctx.lineTo(x + 40, baseY - h * 0.75); // arms
    ctx.moveTo(x, baseY - h * 0.35); ctx.lineTo(x - 28, baseY); // legs
    ctx.moveTo(x, baseY - h * 0.35); ctx.lineTo(x + 28, baseY);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, baseY - h - 16, 16, 0, Math.PI * 2); ctx.stroke(); // head
    ctx.restore();
  }

  private totem(ctx: CanvasRenderingContext2D, x: number, baseY: number, color: string): void {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#120820';
    ctx.fillRect(x - 9, baseY - 200, 18, 200);
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) ctx.fillRect(x - 11, baseY - 190 + i * 40, 22, 7);
    ctx.beginPath(); ctx.arc(x, baseY - 208, 11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---- fighter ------------------------------------------------------------

  private fighter(ctx: CanvasRenderingContext2D, f: Fighter): void {
    if (f.evolution === 'aviator') this.wings(ctx, f);
    if (f.evolution === 'mutant') this.mutantAura(ctx, f);
    if (f.evolution === 'beast') this.tail(ctx, f);
    if (f.evolution === 'tinker') this.boosters(ctx, f);
    const ik = f.ikLegs();
    const drawIKL = ik.valid && !f.isBroken('upperLegL') && !f.isBroken('lowerLegL');
    const drawIKR = ik.valid && !f.isBroken('upperLegR') && !f.isBroken('lowerLegR');
    if (drawIKL) this.ikLeg(ctx, f, ik.hip, ik.L, 'L');
    if (drawIKR) this.ikLeg(ctx, f, ik.hip, ik.R, 'R');
    for (const part of LIMB_ORDER) {
      if (part === 'head') continue;
      if (drawIKL && (part === 'upperLegL' || part === 'lowerLegL')) continue;
      if (drawIKR && (part === 'upperLegR' || part === 'lowerLegR')) continue;
      this.segment(ctx, f, part);
    }
    this.head(ctx, f);
    if (f.weapon) this.weapon(ctx, f.weapon, true);
    if (f.evolution === 'burrower') this.claws(ctx, f);

    // Block guard shimmer: a glowing shield arc in front of the fighter.
    if (f.isBlocking()) {
      const t = f.torsoBody;
      ctx.save();
      ctx.strokeStyle = '#bfe9ff';
      ctx.shadowColor = '#7fd4ff';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      const a0 = f.facing === 1 ? -1.1 : Math.PI + 1.1;
      const a1 = f.facing === 1 ? 1.1 : Math.PI - 1.1;
      ctx.arc(t.position.x + f.facing * 16, t.position.y, 34, Math.min(a0, a1), Math.max(a0, a1));
      ctx.stroke();
      ctx.restore();
    }
  }

  private segment(ctx: CanvasRenderingContext2D, f: Fighter, part: PartName): void {
    const body = f.parts[part];
    const dims = PART_DIMS[part];
    const broken = f.isBroken(part);
    const ax = -Math.sin(body.angle);
    const ay = Math.cos(body.angle);
    const half = dims.len / 2 - dims.thick / 2;
    const x1 = body.position.x - ax * half;
    const y1 = body.position.y - ay * half;
    const x2 = body.position.x + ax * half;
    const y2 = body.position.y + ay * half;

    const health = f.limbHealth(part);
    const tscale = f.evolution === 'titan' ? CFG.evolution.titanScale : 1;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = dims.thick * tscale;
    if (broken) {
      // Severed limb: dark, bloodied, no glow.
      ctx.strokeStyle = '#5a1014';
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.85;
    } else {
      // Wounded limbs tint toward blood red as their joint integrity drops.
      const base = part === 'torso' ? f.color : f.accent;
      ctx.strokeStyle = hexLerp(base, '#9a0f16', (1 - health) * 0.85);
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Armor plate over the limb (fades as it wears out).
    const ar = f.armorAt(part);
    if (ar && !broken) {
      ctx.strokeStyle = ARMOR[ar.mat].color;
      ctx.lineWidth = dims.thick + 5;
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.55 + 0.4 * (ar.hp / ar.max);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Wound gashes once a limb is hurt.
    if (!broken && health < 0.8) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#c8121b';
      ctx.lineWidth = 2;
      const gashes = Math.min(3, Math.floor((1 - health) * 4));
      for (let i = 0; i < gashes; i++) {
        const tt = (i + 1) / (gashes + 1);
        const gx = x1 + (x2 - x1) * tt;
        const gy = y1 + (y2 - y1) * tt;
        ctx.beginPath();
        ctx.moveTo(gx - ay * 4, gy + ax * 4);
        ctx.lineTo(gx + ay * 4, gy - ax * 4);
        ctx.stroke();
      }
    }
    // Bleeding stump cap at the severed end.
    if (broken) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#7a0d12';
      ctx.beginPath();
      ctx.arc(x1, y1, dims.thick * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // A silly neon "tutu" at the hips (drawn over the torso bottom).
    if (part === 'torso' && !broken) {
      const hx = body.position.x + Math.sin(body.angle) * (B.torso.h / 2);
      const hy = body.position.y + Math.cos(body.angle) * (B.torso.h / 2);
      ctx.save();
      ctx.fillStyle = f.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(hx - 16, hy);
      ctx.lineTo(hx + 16, hy);
      ctx.lineTo(hx + 9, hy + 12);
      ctx.lineTo(hx, hy + 4);
      ctx.lineTo(hx - 9, hy + 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private wings(ctx: CanvasRenderingContext2D, f: Fighter): void {
    const t = f.torsoBody;
    const flap = Math.sin(Date.now() / 90) * 0.5 + (f.grounded ? 0 : -0.25);
    ctx.save();
    ctx.globalAlpha = 0.82;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(t.position.x, t.position.y - 6);
      ctx.rotate(s * (0.55 + flap));
      ctx.fillStyle = f.accent;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s * 36, -30, s * 54, -4);
      ctx.quadraticCurveTo(s * 40, 8, 0, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private mutantAura(ctx: CanvasRenderingContext2D, f: Fighter): void {
    const t = f.torsoBody.position;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#7ef046';
    ctx.shadowColor = '#7ef046';
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private tail(ctx: CanvasRenderingContext2D, f: Fighter): void {
    const t = f.torsoBody.position;
    const wag = Math.sin(Date.now() / 110) * 9;
    const bx = t.x - f.facing * 26;
    ctx.save();
    ctx.strokeStyle = f.accent;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(t.x, t.y + 16);
    ctx.quadraticCurveTo(t.x - f.facing * 16, t.y + 30 + wag, bx, t.y + 22 + wag);
    ctx.stroke();
    ctx.restore();
  }

  private boosters(ctx: CanvasRenderingContext2D, f: Fighter): void {
    const t = f.torsoBody;
    const px = t.position.x - f.facing * 9;
    const py = t.position.y;
    ctx.save();
    ctx.fillStyle = '#8a8f9c';
    ctx.fillRect(px - 4, py - 6, 8, 18);
    if (t.velocity.y < -1) {
      ctx.fillStyle = '#ffcf4d';
      ctx.shadowColor = '#ff7a18';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(px - 4, py + 12);
      ctx.lineTo(px + 4, py + 12);
      ctx.lineTo(px, py + 22 + Math.random() * 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private claws(ctx: CanvasRenderingContext2D, f: Fighter): void {
    for (const side of ['lowerArmL', 'lowerArmR'] as PartName[]) {
      if (f.isBroken(side)) continue;
      const b = f.parts[side];
      const ax = -Math.sin(b.angle), ay = Math.cos(b.angle);
      const hx = b.position.x + ax * (PART_DIMS[side].len / 2);
      const hy = b.position.y + ay * (PART_DIMS[side].len / 2);
      ctx.save();
      ctx.fillStyle = '#d2d8e2';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + ax * 13 - ay * 4, hy + ay * 13 + ax * 4);
      ctx.lineTo(hx + ax * 13 + ay * 4, hy + ay * 13 - ax * 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private ikLeg(
    ctx: CanvasRenderingContext2D,
    f: Fighter,
    hip: { x: number; y: number },
    pts: { kx: number; ky: number; fx: number; fy: number },
    side: 'L' | 'R',
  ): void {
    const tscale = f.evolution === 'titan' ? CFG.evolution.titanScale : 1;
    const upThick = PART_DIMS.upperLegL.thick * tscale;
    const loThick = PART_DIMS.lowerLegL.thick * tscale;
    this.bone(ctx, hip.x, hip.y, pts.kx, pts.ky, upThick, f.accent, f.color);
    this.bone(ctx, pts.kx, pts.ky, pts.fx, pts.fy, loThick, f.accent, f.color);
    // Armor band on the thigh.
    const ar = f.armorAt(side === 'L' ? 'upperLegL' : 'upperLegR');
    if (ar) {
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.4 * (ar.hp / ar.max);
      this.bone(ctx, hip.x, hip.y, pts.kx, pts.ky, upThick + 5, ARMOR[ar.mat].color, ARMOR[ar.mat].color, 0);
      ctx.restore();
    }
    // Foot.
    ctx.save();
    ctx.fillStyle = f.accent;
    ctx.shadowColor = f.color; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(pts.fx + f.facing * 4, pts.fy + 2, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private bone(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, thick: number, color: string, glow: string, blur = 12): void {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = thick;
    ctx.strokeStyle = color;
    ctx.shadowColor = glow;
    ctx.shadowBlur = blur;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  private head(ctx: CanvasRenderingContext2D, f: Fighter): void {
    const body = f.parts.head;
    const broken = f.isBroken('head');
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    // Skull.
    ctx.fillStyle = broken ? '#4b4459' : f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = broken ? 0 : 16;
    ctx.beginPath();
    ctx.arc(0, 0, B.headRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Helmet.
    const ah = f.armorAt('head');
    if (ah && !broken) {
      ctx.fillStyle = ARMOR[ah.mat].color;
      ctx.globalAlpha = 0.7 + 0.3 * (ah.hp / ah.max);
      ctx.beginPath();
      ctx.arc(0, -2, B.headRadius + 1, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Goggles (eyes).
    ctx.fillStyle = '#0c0712';
    const ex = f.facing * 4;
    ctx.beginPath(); ctx.arc(ex - 4, -2, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 4, -2, 3.2, 0, Math.PI * 2); ctx.fill();
    // Party hat.
    if (!broken) {
      ctx.fillStyle = f.accent;
      ctx.beginPath();
      ctx.moveTo(-9, -B.headRadius + 2);
      ctx.lineTo(9, -B.headRadius + 2);
      ctx.lineTo(0, -B.headRadius - 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, -B.headRadius - 16, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private weapon(ctx: CanvasRenderingContext2D, w: Weapon, held: boolean): void {
    const body = w.body;
    const def = w.def;
    const ax = -Math.sin(body.angle);
    const ay = Math.cos(body.angle);
    const half = def.len / 2;
    const gripX = body.position.x + ax * half; // grip end
    const gripY = body.position.y + ay * half;
    const tipX = body.position.x - ax * half; // business end
    const tipY = body.position.y - ay * half;

    // Swing trail: streak the tip while it's moving fast.
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    w.trail.push({ x: tipX, y: tipY });
    if (w.trail.length > 8) w.trail.shift();
    if (speed > 7 && w.trail.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = def.glow;
      for (let i = 1; i < w.trail.length; i++) {
        ctx.globalAlpha = (i / w.trail.length) * 0.5;
        ctx.lineWidth = (i / w.trail.length) * def.thick * 1.6;
        ctx.beginPath();
        ctx.moveTo(w.trail[i - 1].x, w.trail[i - 1].y);
        ctx.lineTo(w.trail[i].x, w.trail[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = def.thick;
    ctx.strokeStyle = def.color;
    ctx.shadowColor = def.glow;
    ctx.shadowBlur = held ? 18 : 10;
    ctx.globalAlpha = held ? 1 : 0.92;
    ctx.beginPath();
    ctx.moveTo(gripX, gripY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    if (def.shape === 'discoflail') {
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(tipX, tipY, def.thick * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tipX - 8, tipY); ctx.lineTo(tipX + 8, tipY);
      ctx.moveTo(tipX, tipY - 8); ctx.lineTo(tipX, tipY + 8);
      ctx.stroke();
    } else if (def.shape === 'sword') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(gripX - ax * 8, gripY - ay * 8);
      ctx.lineTo(gripX + ay * 9, gripY - ax * 9); // crossguard
      ctx.lineTo(gripX - ay * 9, gripY + ax * 9);
      ctx.stroke();
    } else if (def.shape === 'nozzle') {
      // A muzzle ring + a little tank at the grip.
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(tipX, tipY, def.thick * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2a36';
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(gripX, gripY, def.thick * 0.85, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---- HUD ----------------------------------------------------------------

  private hud(ctx: CanvasRenderingContext2D, match: Match): void {
    this.statusPanel(ctx, match.fighters[0], 24, 'left');
    this.statusPanel(ctx, match.fighters[1], W - 24, 'right');
    ctx.textAlign = 'center';

    if (match.mode === 'survival') {
      ctx.font = 'bold 17px ui-monospace, monospace';
      ctx.fillStyle = '#7cff5a';
      ctx.fillText(`WAVE ${match.wave}  ·  extract @ 6`, W / 2, 28);
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = '#cbb8ff';
      const m = match.meta;
      ctx.fillText(
        `Lv ${m.level}   XP ${m.xp}/${xpForLevel(m.level)}   loot ${match.runResources}   stash ${m.stash}   best W${m.bestWave}`,
        W / 2, 50,
      );
      return;
    }

    const total = CFG.rounds.winsNeeded;
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillStyle = '#cbb8ff';
    ctx.fillText(`ROUND ${match.round}`, W / 2, 30);
    for (let s = 0; s < total; s++) {
      this.pip(ctx, W / 2 - 18, 46, match.scores[0] > s, match.fighters[0].color);
      this.pip(ctx, W / 2 + 18, 46, match.scores[1] > s, match.fighters[1].color);
    }
    if (match.botEnabled) {
      ctx.fillStyle = '#ff9e3d';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText('P2 = BOT', W / 2, 66);
    }
  }

  private survivalShop(ctx: CanvasRenderingContext2D, match: Match): void {
    const m = match.meta;
    const prep = match.state === 'prep';
    ctx.textAlign = 'center';
    if (prep) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px ui-monospace, monospace';
      ctx.fillText('PREPARE FOR DEPLOYMENT', W / 2, H / 2 - 30);
    }
    ctx.fillStyle = '#ffcf4d';
    ctx.font = 'bold 20px ui-monospace, monospace';
    ctx.fillText(`stash: ${m.stash}   ·   Lv ${m.level}   ·   evolution: ${match.fighters[0].evolution}`, W / 2, H / 2 + 14);
    ctx.font = '15px ui-monospace, monospace';
    for (let i = 0; i < UPGRADES.length; i++) {
      const u = UPGRADES[i];
      const lvl = m.upgrades[u.key];
      const cost = upgradeCost(lvl);
      const afford = m.stash >= cost;
      ctx.fillStyle = afford ? '#7cff5a' : '#6a6a7a';
      ctx.fillText(`[${i + 1}] ${u.name} Lv${lvl} — ${u.desc} — ${cost} loot`, W / 2, H / 2 + 46 + i * 26);
    }
    ctx.fillStyle = '#cbb8ff';
    ctx.font = '14px ui-monospace, monospace';
    const hint = prep
      ? 'press 1-4 buy · Z pick evolution · ENTER to DEPLOY · M menu'
      : 'press 1-4 buy · R for a new run · M for menu';
    ctx.fillText(hint, W / 2, H / 2 + 46 + UPGRADES.length * 26 + 12);
  }

  private statusPanel(ctx: CanvasRenderingContext2D, f: Fighter, x: number, align: 'left' | 'right'): void {
    const dir = align === 'left' ? 1 : -1;
    ctx.textAlign = align;
    ctx.font = 'bold 18px ui-monospace, monospace';
    ctx.fillStyle = f.color;
    ctx.fillText(f.name, x, 34);

    // Core HP bar.
    const bw = 220;
    const bx = align === 'left' ? x : x - bw;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, 42, bw, 12);
    const frac = Math.max(0, f.coreHealth / f.maxCore);
    ctx.fillStyle = frac > 0.5 ? '#7cff5a' : frac > 0.25 ? '#ffcf4d' : '#ff5a5a';
    ctx.fillRect(align === 'left' ? bx : x - bw * frac, 42, bw * frac, 12);

    // Limb pips: head, 2 arms, 2 legs.
    const limbs: { p: PartName; label: string }[] = [
      { p: 'head', label: 'H' },
      { p: 'upperArmR', label: 'R' },
      { p: 'upperArmL', label: 'L' },
      { p: 'upperLegR', label: 'r' },
      { p: 'upperLegL', label: 'l' },
    ];
    ctx.font = '11px ui-monospace, monospace';
    for (let i = 0; i < limbs.length; i++) {
      const px = x + dir * (10 + i * 26);
      const ok = !f.isBroken(limbs[i].p);
      this.pip(ctx, px, 70, ok, ok ? f.accent : '#4b4459');
      ctx.fillStyle = ok ? '#0c0712' : '#888';
      ctx.textAlign = 'center';
      ctx.fillText(limbs[i].label, px, 74);
    }
  }

  private pip(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean, color: string): void {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = on ? color : 'rgba(255,255,255,0.12)';
    ctx.fill();
  }

  // ---- banner -------------------------------------------------------------

  private banner(ctx: CanvasRenderingContext2D, match: Match, paused: boolean): void {
    let text = '';
    let sub = '';
    if (paused) {
      text = 'PAUSED';
      sub = 'press P to resume';
    } else if (match.state === 'intro' || match.state === 'roundover') {
      text = match.message;
    } else if (match.state === 'matchover') {
      text = match.message;
      sub = 'press R for a rematch';
    } else {
      return;
    }

    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#ff37c8';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px ui-monospace, monospace';
    ctx.fillText(text, W / 2, H / 2 - 10);
    ctx.restore();
    if (sub) {
      ctx.fillStyle = '#cbb8ff';
      ctx.font = '18px ui-monospace, monospace';
      ctx.fillText(sub, W / 2, H / 2 + 30);
    }
  }

  // ---- helpers ------------------------------------------------------------

  private glowCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, blur: number): void {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
