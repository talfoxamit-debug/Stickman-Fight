import { CFG } from '../config';
import type { PartName } from '../types';
import type { Fighter } from '../physics/fighter';
import type { Match, GameMode } from '../game/match';
import type { Weapon } from '../physics/weapon';
import type { Fx } from './fx';
import { PowderRenderer } from '../powder/render';
import { ARMOR } from '../physics/armor';
import { xpForLevel, upgradeCost, UPGRADES } from '../game/save';
import type { World } from '../world/world';
import { PALETTE, MAT_COUNT, MATERIALS, Mat } from '../powder/materials';
import { SKILLS, BRANCHES, skillNodePos, SKILL_BY_ID, canLearn } from '../game/skills';
import { CRAFT_CATEGORIES, recipesIn, craftTabRect, craftRowRect } from '../game/crafting';

const MAT_COLORS: string[] = (() => {
  const a: string[] = [];
  for (let m = 0; m < MAT_COUNT; m++) a.push(`rgb(${PALETTE[m * 3]},${PALETTE[m * 3 + 1]},${PALETTE[m * 3 + 2]})`);
  return a;
})();

const B = CFG.body;
const W = CFG.view.width;
const H = CFG.view.height;

// Bump this whenever behaviour changes so you can confirm a fresh build is live.
const VERSION = 'v0.35 · settings page (sound/volume/shake) · [O] to open';

// Per-biome sky tint so each region reads as a distinct place.
const BIOME_TINT: Record<string, string> = {
  snow: '#cfeaff',
  forest: '#8fd98f',
  desert: '#ffd98a',
  volcanic: '#ff6a3a',
};

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
    this.platform(ctx, match.mode);
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

  // ---- Terraria-style world -----------------------------------------------

  drawWorld(world: World, fx: Fx): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Background: sky near the surface, fading to dark cave rock as you descend.
    const surfaceY = world.grid.rows * 0.32 * world.grid.cell;
    const dep = Math.max(0, Math.min(1, (world.camera.y - surfaceY) / (world.grid.heightPx * 0.32)));
    ctx.fillStyle = '#191118'; // dark cave backdrop
    ctx.fillRect(0, 0, W, H);
    if (dep < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - dep;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#6db3e8');
      sky.addColorStop(1, '#274a63');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      if (dep < 0.55) { ctx.globalAlpha = 1 - dep / 0.55; this.worldBackground(ctx, world); }
      ctx.restore();
      // Biome atmosphere: tint the sky so each region reads as a distinct place.
      const tint = BIOME_TINT[world.grid.biomeAtPx(world.camera.x)];
      if (tint && dep < 0.7) {
        ctx.save();
        ctx.globalAlpha = (1 - dep / 0.7) * 0.3;
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(world.zoom, world.zoom);
    ctx.translate(-world.camera.x, -world.camera.y);
    this.terrain(ctx, world);
    this.chests(ctx, world);
    for (const m of world.monsters) this.fighter(ctx, m);
    this.fighter(ctx, world.player);
    for (const m of world.monsters) this.monsterBadge(ctx, world, m);
    this.spells(ctx, world);
    fx.draw(ctx);
    ctx.restore();

    // Underground "torch": a lit radius around the player, darkness beyond.
    if (dep > 0.12) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 70, W / 2, H / 2, 540);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(3,2,8,${Math.min(0.88, 0.45 + dep * 0.5)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    this.worldHud(ctx, world);
    this.questTracker(ctx, world);
    this.skillBar(ctx, world);
    if (world.crafting) this.craftPanel(ctx, world);
    if (world.skillTreeOpen) this.skillTree(ctx, world);
    ctx.textAlign = 'right';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(124,255,90,0.55)';
    ctx.fillText(VERSION, W - 12, H - 34);
  }

  /** Active-skill quickbar (keys 1-4) with cooldown sweeps, bottom-center. */
  private skillBar(ctx: CanvasRenderingContext2D, world: World): void {
    const now = performance.now();
    const n = world.slots.length;
    if (n === 0) return;
    const sz = 50, gap = 10, total = n * sz + (n - 1) * gap;
    let x = W / 2 - total / 2;
    const y = H - 86;
    for (let i = 0; i < n; i++) {
      const s = SKILL_BY_ID[world.slots[i]];
      const cd = world.skillCooldown(s.id, now);
      const br = BRANCHES.find((b) => b.id === s.branch)!;
      ctx.fillStyle = 'rgba(8,6,16,0.8)';
      ctx.fillRect(x, y, sz, sz);
      ctx.strokeStyle = br.color; ctx.lineWidth = 2; ctx.strokeRect(x, y, sz, sz);
      ctx.fillStyle = br.color; ctx.textAlign = 'left'; ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText(`${i + 1}`, x + 4, y + 13);
      ctx.fillStyle = '#fff'; ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(s.name.slice(0, 8), x + 3, y + sz - 5);
      if (cd > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(x, y, sz, sz * (cd / (s.cooldownMs ?? 1)));
      }
      ctx.fillStyle = world.mana >= (s.manaCost ?? 0) ? '#39d6ff' : '#ff6b6b';
      ctx.textAlign = 'right'; ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(`${s.manaCost}`, x + sz - 3, y + 13);
      x += sz + gap;
    }
  }

  private skillTree(ctx: CanvasRenderingContext2D, world: World): void {
    ctx.fillStyle = 'rgba(6,5,12,0.9)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#ff37c8'; ctx.shadowBlur = 20;
    ctx.font = 'bold 32px ui-monospace, monospace';
    ctx.fillText('SKILL TREE', W / 2, 70);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffcf4d'; ctx.font = 'bold 18px ui-monospace, monospace';
    ctx.fillText(`Level ${world.char.level}   ·   skill points: ${world.char.skillPoints}   ·   XP ${world.char.xp}`, W / 2, 110);
    // Branch headers.
    for (let c = 0; c < BRANCHES.length; c++) {
      ctx.fillStyle = BRANCHES[c].color; ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.fillText(BRANCHES[c].name, 300 + c * 340, 180);
    }
    // Prereq lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    for (const s of SKILLS) {
      if (!s.reqSkill) continue;
      const a = skillNodePos(SKILL_BY_ID[s.reqSkill]); const b = skillNodePos(s);
      ctx.beginPath(); ctx.moveTo(a.x, a.y + 26); ctx.lineTo(b.x, b.y - 26); ctx.stroke();
    }
    // Nodes.
    for (const s of SKILLS) {
      const p = skillNodePos(s);
      const lvl = world.char.learned[s.id] ?? 0;
      const br = BRANCHES.find((b) => b.id === s.branch)!;
      const learnable = canLearn(s, world.char);
      ctx.save();
      ctx.fillStyle = lvl > 0 ? br.color : 'rgba(40,40,52,0.95)';
      if (learnable) { ctx.shadowColor = br.color; ctx.shadowBlur = 16; }
      ctx.fillRect(p.x - 130, p.y - 26, 260, 52);
      ctx.restore();
      ctx.strokeStyle = learnable ? '#fff' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = learnable ? 2 : 1;
      ctx.strokeRect(p.x - 130, p.y - 26, 260, 52);
      ctx.textAlign = 'left';
      ctx.fillStyle = lvl > 0 ? '#0c0712' : '#cbd';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillText(`${s.kind === 'active' ? '◆' : '○'} ${s.name}  ${lvl}/${s.max}`, p.x - 122, p.y - 6);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = lvl > 0 ? 'rgba(12,7,18,0.85)' : '#8a86a8';
      ctx.fillText(s.desc, p.x - 122, p.y + 14);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbb8ff'; ctx.font = '14px ui-monospace, monospace';
    ctx.fillText('click a glowing node to spend a point  ·  K to close', W / 2, H - 30);
  }

  /** Minecraft-style crafting: category tabs + recipe rows each with a 3x3 grid. */
  private craftPanel(ctx: CanvasRenderingContext2D, world: World): void {
    ctx.fillStyle = 'rgba(8,6,16,0.92)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#7cff5a'; ctx.shadowBlur = 20;
    ctx.font = 'bold 32px ui-monospace, monospace';
    ctx.fillText('CRAFTING', W / 2, 58); ctx.shadowBlur = 0;

    // Your materials at a glance.
    const matsOrder = [Mat.Wood, Mat.Stone, Mat.Ore, Mat.Metal, Mat.Dirt, Mat.Grass, Mat.Sand, Mat.Snow];
    let mx = W / 2 - 392;
    ctx.font = '12px ui-monospace, monospace';
    for (const m of matsOrder) {
      const n = world.inventory.get(m) ?? 0;
      ctx.fillStyle = MAT_COLORS[m]; ctx.fillRect(mx, 78, 12, 12);
      ctx.fillStyle = n > 0 ? '#fff' : '#666'; ctx.textAlign = 'left';
      ctx.fillText(`${MATERIALS[m].name} ${n}`, mx + 16, 89);
      mx += 99;
    }

    // Category tabs.
    for (let c = 0; c < CRAFT_CATEGORIES.length; c++) {
      const r = craftTabRect(c); const cat = CRAFT_CATEGORIES[c];
      const active = world.craftCategory === cat.id;
      ctx.fillStyle = active ? cat.color : 'rgba(40,40,52,0.9)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = cat.color; ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = active ? '#0c0712' : '#cbd'; ctx.textAlign = 'center';
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillText(cat.name, r.x + r.w / 2, r.y + 28);
    }

    // Recipe rows.
    const list = recipesIn(world.craftCategory);
    for (let i = 0; i < list.length; i++) {
      const rec = list[i]; const r = craftRowRect(i);
      const owned = !!rec.permanent && world.owned.has(rec.id);
      const ok = world.canCraftRecipe(rec);
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = ok ? '#7cff5a' : owned ? '#39d6ff' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = ok ? 2 : 1; ctx.strokeRect(r.x, r.y, r.w, r.h);

      // The iconic 3x3 grid.
      const gx = r.x + 12, gy = r.y + 8, cs = 18;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(gx - 3, gy - 3, cs * 3 + 6, cs * 3 + 6);
      for (let k = 0; k < 9; k++) {
        const cell = rec.shape[k];
        const cxp = gx + (k % 3) * cs, cyp = gy + ((k / 3) | 0) * cs;
        ctx.fillStyle = cell ? MAT_COLORS[cell] : 'rgba(255,255,255,0.05)';
        ctx.fillRect(cxp + 1, cyp + 1, cs - 2, cs - 2);
      }

      const tx = gx + cs * 3 + 16;
      ctx.textAlign = 'left';
      ctx.fillStyle = owned ? '#39d6ff' : '#fff';
      ctx.font = 'bold 17px ui-monospace, monospace';
      ctx.fillText(`[${i + 1}] ${rec.name}${owned ? '   ✓ owned' : ''}`, tx, r.y + 25);
      ctx.fillStyle = '#bdb6d6'; ctx.font = '13px ui-monospace, monospace';
      ctx.fillText(rec.desc, tx, r.y + 45);

      // Ingredient costs (green if you have enough).
      let ix = tx; ctx.font = '12px ui-monospace, monospace';
      for (const [m, n] of rec.ingredients) {
        const have = world.inventory.get(m) ?? 0;
        ctx.fillStyle = have >= n ? '#7cff5a' : '#ff6b6b';
        const label = `${MATERIALS[m].name} ${have}/${n}`;
        ctx.fillText(label, ix, r.y + 63);
        ix += ctx.measureText(label).width + 18;
      }
    }

    ctx.textAlign = 'center'; ctx.fillStyle = '#cbb8ff'; ctx.font = '14px ui-monospace, monospace';
    ctx.fillText('click a tab, then click a recipe (or press its number) to craft  ·  E to close', W / 2, H - 22);
  }

  private terrain(ctx: CanvasRenderingContext2D, world: World): void {
    const g = world.grid;
    const cell = g.cell;
    const halfW = W / (2 * world.zoom) + cell;
    const halfH = H / (2 * world.zoom) + cell;
    const x0 = Math.max(0, Math.floor((world.camera.x - halfW) / cell));
    const x1 = Math.min(g.cols - 1, Math.ceil((world.camera.x + halfW) / cell));
    const y0 = Math.max(0, Math.floor((world.camera.y - halfH) / cell));
    const y1 = Math.min(g.rows - 1, Math.ceil((world.camera.y + halfH) / cell));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const m = g.at(x, y);
        if (m === Mat.Empty) continue;
        ctx.fillStyle = MAT_COLORS[m];
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  /** Parallax sky: sun, drifting clouds, and distant rolling hills for depth. */
  private worldBackground(ctx: CanvasRenderingContext2D, world: World): void {
    const cam = world.camera;
    // Sun.
    this.glowCircle(ctx, W * 0.8, 110, 46, 'rgba(255,240,185,0.95)', 48);
    // Clouds (slow parallax).
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 360 - cam.x * 0.12) % (W + 300) + W + 300) % (W + 300) - 150;
      const cy = 70 + ((i * 53) % 120);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 46, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 34, cy + 6, 34, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 30, cy + 8, 28, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Distant hill silhouettes (two parallax layers).
    const layers = [{ p: 0.25, col: '#2c4c5e', base: H * 0.62, amp: 70 }, { p: 0.45, col: '#34607a', base: H * 0.72, amp: 55 }];
    for (const L of layers) {
      ctx.fillStyle = L.col;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 24) {
        const wx = x + cam.x * L.p;
        ctx.lineTo(x, L.base + Math.sin(wx * 0.004) * L.amp + Math.sin(wx * 0.013) * 18);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }
  }

  private chests(ctx: CanvasRenderingContext2D, world: World): void {
    const cam = world.camera, hw = W / (2 * world.zoom) + 80, hh = H / (2 * world.zoom) + 80;
    const s = world.grid.cell * 0.9;
    for (const c of world.grid.chests) {
      if (Math.abs(c.x - cam.x) > hw || Math.abs(c.y - cam.y) > hh) continue;
      ctx.save();
      if (c.looted) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#6b5a2a'; }
      else { ctx.fillStyle = '#d2aa46'; ctx.shadowColor = '#ffe08a'; ctx.shadowBlur = 18; }
      ctx.fillRect(c.x - s / 2, c.y - s / 2, s, s);
      ctx.fillStyle = '#7a5a1e';
      ctx.fillRect(c.x - s / 2, c.y - 3, s, 6);
      ctx.restore();
    }
  }

  /** Floating HP bar over each monster (+ a crown/aura for elites). */
  private monsterBadge(ctx: CanvasRenderingContext2D, world: World, m: Fighter): void {
    if (m.koed) return;
    const head = m.parts.head;
    const x = head.position.x;
    const y = head.position.y - 30;
    const elite = world.isElite(m);
    const bw = elite ? 58 : 44, bh = elite ? 6 : 4;
    const frac = Math.max(0, m.coreHealth / m.maxCore);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - bw / 2 - 1, y - 1, bw + 2, bh + 2);
    ctx.fillStyle = frac > 0.5 ? '#7cff5a' : frac > 0.25 ? '#ffcf4d' : '#ff5a5a';
    ctx.fillRect(x - bw / 2, y, bw * frac, bh);
    if (elite) {
      ctx.save();
      ctx.fillStyle = '#ffd24a';
      ctx.shadowColor = '#ffe9a0';
      ctx.shadowBlur = 12;
      const cy = y - 16, cw = 24;
      ctx.beginPath();
      ctx.moveTo(x - cw / 2, cy + 10);
      ctx.lineTo(x - cw / 2, cy);
      ctx.lineTo(x - cw / 4, cy + 6);
      ctx.lineTo(x, cy - 3);
      ctx.lineTo(x + cw / 4, cy + 6);
      ctx.lineTo(x + cw / 2, cy);
      ctx.lineTo(x + cw / 2, cy + 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /** Elemental spell projectiles: a glowing bolt with a fading trail. */
  private spells(ctx: CanvasRenderingContext2D, world: World): void {
    for (const p of world.projectiles) {
      ctx.save();
      ctx.strokeStyle = p.spell.color;
      ctx.lineCap = 'round';
      for (let i = 1; i < p.trail.length; i++) {
        ctx.globalAlpha = (i / p.trail.length) * 0.6;
        ctx.lineWidth = (i / p.trail.length) * p.spell.radius * 1.1;
        ctx.beginPath();
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
        ctx.lineTo(p.trail[i].x, p.trail[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.spell.color;
      ctx.shadowColor = p.spell.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.spell.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.spell.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** The current objective, top-center: a goal + the one control it teaches. */
  private questTracker(ctx: CanvasRenderingContext2D, world: World): void {
    const q = world.currentQuest();
    const cx = W / 2, top = 14, pw = 460;
    ctx.textAlign = 'center';
    if (!q) {
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(124,255,90,0.85)';
      ctx.fillText('★ Free play — explore, dig deeper, get stronger', cx, top + 16);
      this.dangerMeter(ctx, world, top + 36);
      return;
    }
    const prog = world.questProgress();
    const frac = Math.max(0, Math.min(1, prog / q.target));
    // Panel.
    ctx.fillStyle = 'rgba(8,6,16,0.66)';
    ctx.fillRect(cx - pw / 2, top, pw, 56);
    ctx.strokeStyle = 'rgba(255,207,77,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(cx - pw / 2, top, pw, 56);
    // Title + count.
    ctx.fillStyle = '#ffcf4d'; ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillText(`◇ ${q.title}   ${Math.floor(prog)}/${q.target}`, cx, top + 19);
    // Progress bar.
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(cx - pw / 2 + 14, top + 27, pw - 28, 7);
    ctx.fillStyle = '#7cff5a'; ctx.fillRect(cx - pw / 2 + 14, top + 27, (pw - 28) * frac, 7);
    // The single control hint for this step.
    ctx.fillStyle = '#bfe9ff'; ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(q.hint, cx, top + 49);
    this.dangerMeter(ctx, world, top + 74);
  }

  /** Rising-stakes readout: a danger meter that climbs with depth + kills. */
  private dangerMeter(ctx: CanvasRenderingContext2D, world: World, y: number): void {
    const tier = world.dangerTier();
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = tier >= 6 ? '#ff5a5a' : tier >= 4 ? '#ffcf4d' : '#9be8ff';
    ctx.fillText(`DANGER ${'▲'.repeat(Math.min(7, tier))}${tier > 7 ? `+${tier - 7}` : ''}`, W / 2, y);
  }

  private worldHud(ctx: CanvasRenderingContext2D, world: World): void {
    // Player vitals + stats (top-left): HP, mana, XP bars.
    const p = world.player;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(12, 12, 280, 190);
    const bar = (y: number, frac: number, col: string) => {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(20, y, 200, 12);
      ctx.fillStyle = col; ctx.fillRect(20, y, 200 * Math.max(0, Math.min(1, frac)), 12);
    };
    const hf = p.coreHealth / p.maxCore;
    bar(22, hf, hf > 0.5 ? '#7cff5a' : hf > 0.25 ? '#ffcf4d' : '#ff5a5a');
    bar(38, world.mana / world.maxMana, '#39d6ff');
    bar(54, world.char.xp / (60 + world.char.level * 45), '#ffcf4d');
    // Thin stamina bar under the XP bar (flashes amber when winded).
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(20, 68, 200, 4);
    ctx.fillStyle = p.winded ? '#ff9a3c' : '#9be8ff';
    ctx.fillRect(20, 68, 200 * Math.max(0, Math.min(1, p.stamina / p.maxStamina)), 4);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`Lv ${world.char.level}   HP ${world.player.coreHealth | 0}/${world.player.maxCore | 0}   MP ${world.mana | 0}/${world.maxMana}`, 20, 80);
    ctx.fillText(`slain ${world.kills} · loot ${world.loot} · depth ${world.depth()}`, 20, 96);
    ctx.fillText(`${world.grid.biomeAtPx(p.torsoBody.position.x)} · evo ${p.evolution} (Z) · K skills · E craft`, 20, 112);
    // Crafted gear & consumables.
    const it = world.items;
    ctx.fillStyle = '#9ad6ff';
    ctx.fillText(`pick T${world.digTier}  ·  ♥${it.hp ?? 0} [H]  ✦${it.mp ?? 0} [J]  ✺${it.bomb ?? 0} [B]`, 20, 128);
    if (world.selectedBlock) {
      ctx.fillStyle = '#7cff5a';
      ctx.fillText(`block: ${world.selectedBlock} x${it[world.selectedBlock] ?? 0}  (hold Q place · R cycle)`, 20, 144);
    } else {
      ctx.fillStyle = '#6f6a86';
      ctx.fillText('craft blocks (E) to build with Q', 20, 144);
    }
    // Aimed spell selector.
    const sp = world.currentSpell();
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = sp.color;
    ctx.fillText(`✷ ${sp.name} spell  ·  aim + hold RMB to cast  ·  C cycle`, 20, 160);
    if (world.char.skillPoints > 0) {
      ctx.fillStyle = '#ffcf4d'; ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText(`★ ${world.char.skillPoints} skill point${world.char.skillPoints > 1 ? 's' : ''} — press K`, 20, 178);
    }

    // Inventory (top-right).
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText('INVENTORY', W - 16, 28);
    let i = 0;
    for (const [m, n] of world.inventory) {
      const y = 50 + i * 20;
      ctx.fillStyle = '#cbd';
      ctx.textAlign = 'right';
      ctx.fillText(`${MATERIALS[m as Mat].name} x${n}`, W - 34, y);
      ctx.fillStyle = MAT_COLORS[m];
      ctx.fillRect(W - 28, y - 11, 13, 13);
      i++;
    }

    // Flash message (kills / death).
    if (world.message) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ff37c8';
      ctx.shadowBlur = 16;
      ctx.font = 'bold 34px ui-monospace, monospace';
      ctx.fillText(world.message, W / 2, 110);
      ctx.shadowBlur = 0;
    }

    ctx.textAlign = 'center';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,210,120,0.85)';
    if (world.currentQuest()) {
      // Full reference while learning the ropes; it fades away once onboarding is done.
      ctx.fillText('FIGHT: tap LMB = light combo · hold LMB = heavy · S = block (time it = PARRY!) · double-tap A/D = dodge-roll · mind your stamina', W / 2, H - 30);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('A/D move · W jump · LMB mine · aim+RMB cast spell (C cycle) · 1-4 skills · hold Q build · H/J potion · B bomb · E craft · K skills · M menu', W / 2, H - 14);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('LMB fight/mine · RMB cast · S block · dodge: 2×A/D · E craft · K skills · B bomb · H/J potion · M menu', W / 2, H - 14);
    }
  }

  // ---- arena --------------------------------------------------------------

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

  private platform(ctx: CanvasRenderingContext2D, mode: GameMode): void {
    const contained = mode !== 'versus'; // PvE: full-width floor + side walls, no pit
    const inset = CFG.arena.wallInset;
    const x = contained ? 0 : inset;
    const y = CFG.arena.floorY;
    const w = contained ? W : W - inset * 2;
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
    // Neon walls: full-height side walls when contained, else low ring-out railings.
    ctx.save();
    ctx.shadowColor = '#ff37c8';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ff37c8';
    if (contained) {
      for (const rx of [0, W]) ctx.fillRect(rx === 0 ? 0 : W - 8, 0, 8, y + h);
    } else {
      const rh = CFG.arena.railHeight;
      for (const rx of [inset, W - inset]) ctx.fillRect(rx - 7, y - rh + 6, 14, rh);
    }
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
    ctx.globalAlpha = 0.18;
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

    // Heavy-charge telegraph: a growing ember at the hand that flares when ready.
    const cr = f.chargeRatio();
    if (cr > 0) {
      const h = f.handPos();
      const ready = cr >= 1;
      ctx.save();
      ctx.globalAlpha = 0.35 + cr * 0.55;
      ctx.fillStyle = ready ? '#fff2a8' : '#ffae00';
      ctx.shadowColor = ready ? '#ffffff' : '#ff8a00';
      ctx.shadowBlur = 10 + cr * 26;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 4 + cr * 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

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
    } else if (f.hurtFlash > 0.02) {
      // Impact flash: the struck figure pops white for a few frames (Dead Cells juice).
      const base = part === 'torso' ? f.color : f.accent;
      ctx.strokeStyle = hexLerp('#ffffff', base, 1 - f.hurtFlash);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 16;
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
    // Skull (pops white on a fresh hit).
    ctx.fillStyle = broken ? '#4b4459' : f.hurtFlash > 0.02 ? hexLerp('#ffffff', f.color, 1 - f.hurtFlash) : f.color;
    ctx.shadowColor = f.hurtFlash > 0.02 ? '#ffffff' : f.color;
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

    // Stamina bar (thin, under HP). Flashes amber when winded.
    const sf = Math.max(0, f.stamina / f.maxStamina);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(bx, 57, bw, 5);
    ctx.fillStyle = f.winded ? '#ff9a3c' : '#39d6ff';
    ctx.fillRect(align === 'left' ? bx : x - bw * sf, 57, bw * sf, 5);

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
