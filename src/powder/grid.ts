// Falling-sand / chemistry cellular automata. Pure (no DOM) so it runs headless.

import { Cat, Mat, MATERIALS, density, isFlammable, isLiquid } from './materials';

export interface Explosion {
  x: number; // world px
  y: number;
  r: number; // radius px
}

const EXPL_CELLS = 8; // explosion radius in cells
const CHARGE = 24; // electric charge lifetime (ticks) carried by water/metal

export class PowderGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly mat: Uint8Array;
  readonly aux: Uint8Array; // life for fire/gas; charge timer for water/metal
  private moved: Uint8Array;
  private frame = 0;
  /** Explosions produced this tick; drained by the Match for body impulses. */
  explosions: Explosion[] = [];

  constructor(widthPx: number, heightPx: number, cell = 6) {
    this.cell = cell;
    this.cols = Math.ceil(widthPx / cell);
    this.rows = Math.ceil(heightPx / cell);
    this.mat = new Uint8Array(this.cols * this.rows);
    this.aux = new Uint8Array(this.cols * this.rows);
    this.moved = new Uint8Array(this.cols * this.rows);
  }

  clear(): void {
    this.mat.fill(0);
    this.aux.fill(0);
  }

  // ---- helpers ------------------------------------------------------------

  private swap(a: number, b: number): void {
    const m = this.mat[a]; this.mat[a] = this.mat[b]; this.mat[b] = m;
    const x = this.aux[a]; this.aux[a] = this.aux[b]; this.aux[b] = x;
    this.moved[a] = 1; this.moved[b] = 1;
  }
  private set(i: number, m: Mat, life = 0): void {
    this.mat[i] = m; this.aux[i] = life; this.moved[i] = 1;
  }
  private hot(i: number): boolean {
    const m = this.mat[i] as Mat;
    return m === Mat.Fire || m === Mat.Ember || m === Mat.Lava;
  }
  private touchesHot(x: number, y: number, i: number): boolean {
    if (y > 0 && this.hot(i - this.cols)) return true;
    if (y < this.rows - 1 && this.hot(i + this.cols)) return true;
    if (x > 0 && this.hot(i - 1)) return true;
    if (x < this.cols - 1 && this.hot(i + 1)) return true;
    return false;
  }

  private static fireLife(): number { return 22 + ((Math.random() * 22) | 0); }
  private static smokeLife(): number { return 40 + ((Math.random() * 60) | 0); }
  private static steamLife(): number { return 50 + ((Math.random() * 70) | 0); }

  // ---- update -------------------------------------------------------------

  update(): void {
    this.moved.fill(0);
    const { cols, rows, mat, moved } = this;
    for (let y = rows - 1; y >= 0; y--) {
      const ltr = ((y + this.frame) & 1) === 0;
      for (let k = 0; k < cols; k++) {
        const x = ltr ? k : cols - 1 - k;
        const i = y * cols + x;
        if (moved[i]) continue;
        const m = mat[i] as Mat;
        if (m === Mat.Empty) continue;
        if (m === Mat.Fire || m === Mat.Ember) this.stepFire(x, y, i, m);
        else if (m === Mat.Spark) this.stepSpark(x, y, i);
        else {
          switch (MATERIALS[m].cat) {
            case Cat.Powder: this.stepPowder(x, y, i, m); break;
            case Cat.Liquid: this.stepLiquid(x, y, i, m); break;
            case Cat.Gas: this.stepGas(x, y, i, m); break;
            case Cat.Solid: this.stepSolid(x, y, i, m); break;
            default: break;
          }
        }
      }
    }
    this.frame++;
  }

  private fallInto(target: Mat, m: Mat): boolean {
    return target === Mat.Empty || (isLiquid(target) && density(m) > density(target));
  }

  private stepPowder(x: number, y: number, i: number, m: Mat): void {
    if (m === Mat.Gunpowder && this.touchesHot(x, y, i)) { this.explode(x, y); return; }
    if (y + 1 >= this.rows) return;
    const b = i + this.cols;
    if (this.fallInto(this.mat[b] as Mat, m)) { this.swap(i, b); return; }
    const d0 = Math.random() < 0.5 ? -1 : 1;
    for (const d of [d0, -d0]) {
      const nx = x + d;
      if (nx < 0 || nx >= this.cols) continue;
      const di = b + d;
      if (this.fallInto(this.mat[di] as Mat, m)) { this.swap(i, di); return; }
    }
  }

  private stepLiquid(x: number, y: number, i: number, m: Mat): void {
    if (m === Mat.Lava) this.lavaReact(x, y, i);
    else if (m === Mat.Acid) { if (this.acidReact(x, y, i)) return; }
    else if (m === Mat.Water) {
      if (this.touchesHot(x, y, i)) { this.set(i, Mat.Steam, PowderGrid.steamLife()); return; }
      this.spreadCharge(x, y, i);
    }
    if (this.mat[i] !== m) return; // a reaction transformed us

    if (y + 1 < this.rows) {
      const b = i + this.cols;
      if (this.fallInto(this.mat[b] as Mat, m)) { this.swap(i, b); return; }
      const d0 = Math.random() < 0.5 ? -1 : 1;
      for (const d of [d0, -d0]) {
        const nx = x + d; if (nx < 0 || nx >= this.cols) continue;
        const di = b + d;
        if (this.fallInto(this.mat[di] as Mat, m)) { this.swap(i, di); return; }
      }
    }
    // Flow sideways to level out.
    const d0 = Math.random() < 0.5 ? -1 : 1;
    for (const d of [d0, -d0]) {
      const nx = x + d; if (nx < 0 || nx >= this.cols) continue;
      const si = i + d;
      if (this.mat[si] === Mat.Empty) { this.swap(i, si); return; }
    }
  }

  private stepGas(x: number, y: number, i: number, m: Mat): void {
    const life = this.aux[i];
    if (life <= 1) {
      if (m === Mat.Steam && Math.random() < 0.25) this.set(i, Mat.Water, 0);
      else this.set(i, Mat.Empty, 0);
      return;
    }
    this.aux[i] = life - 1;
    if (y > 0) {
      const a = i - this.cols;
      if (this.mat[a] === Mat.Empty) { this.swap(i, a); return; }
      const d0 = Math.random() < 0.5 ? -1 : 1;
      for (const d of [d0, -d0]) {
        const nx = x + d; if (nx < 0 || nx >= this.cols) continue;
        const di = a + d;
        if (this.mat[di] === Mat.Empty) { this.swap(i, di); return; }
      }
    }
    const d0 = Math.random() < 0.5 ? -1 : 1;
    for (const d of [d0, -d0]) {
      const nx = x + d; if (nx < 0 || nx >= this.cols) continue;
      const si = i + d;
      if (this.mat[si] === Mat.Empty) { this.swap(i, si); return; }
    }
  }

  private stepSolid(x: number, y: number, i: number, m: Mat): void {
    if ((m === Mat.Wood || m === Mat.Plant) && this.touchesHot(x, y, i) && Math.random() < 0.18) {
      this.set(i, Mat.Fire, PowderGrid.fireLife());
    } else if (m === Mat.Ice && this.touchesHot(x, y, i) && Math.random() < 0.3) {
      this.set(i, Mat.Water, 0);
    } else if (m === Mat.Metal) {
      this.spreadCharge(x, y, i);
    }
  }

  private stepFire(x: number, y: number, i: number, m: Mat): void {
    let life = this.aux[i];
    const cols = this.cols;
    const around = [y > 0 ? i - cols : -1, y < this.rows - 1 ? i + cols : -1, x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1];
    for (const ni of around) {
      if (ni < 0) continue;
      const nm = this.mat[ni] as Mat;
      if (nm === Mat.Water) { this.set(ni, Mat.Steam, PowderGrid.steamLife()); life = 0; }
      else if (nm === Mat.Ice) { this.set(ni, Mat.Water, 0); }
      else if (nm === Mat.Gunpowder) { this.explodeAt(ni); }
      else if (isFlammable(nm) && Math.random() < 0.5) { this.set(ni, Mat.Fire, PowderGrid.fireLife()); }
    }
    if (life <= 1) { this.set(i, Math.random() < 0.55 ? Mat.Smoke : Mat.Empty, PowderGrid.smokeLife()); return; }
    this.aux[i] = life - 1;
    // Linger on fuel so flames actually spread along flammable material.
    for (const ni of around) if (ni >= 0 && isFlammable(this.mat[ni] as Mat)) return;
    if (m === Mat.Fire) {
      if (y > 0) {
        const a = i - cols;
        if (this.mat[a] === Mat.Empty) { this.swap(i, a); return; }
        const d0 = Math.random() < 0.5 ? -1 : 1;
        for (const d of [d0, -d0]) {
          const nx = x + d; if (nx < 0 || nx >= cols) continue;
          if (this.mat[a + d] === Mat.Empty) { this.swap(i, a + d); return; }
        }
      }
    } else if (y + 1 < this.rows && this.mat[i + cols] === Mat.Empty) {
      this.swap(i, i + cols);
    }
  }

  /** A spark charges adjacent conductors (water/metal), ignites fuel, then dies. */
  private stepSpark(x: number, y: number, i: number): void {
    const cols = this.cols;
    const around = [y > 0 ? i - cols : -1, y < this.rows - 1 ? i + cols : -1, x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1];
    for (const ni of around) {
      if (ni < 0) continue;
      const nm = this.mat[ni] as Mat;
      if (nm === Mat.Water || nm === Mat.Metal) { if (this.aux[ni] < CHARGE) this.aux[ni] = CHARGE; }
      else if (nm === Mat.Gunpowder) this.explodeAt(ni);
      else if (isFlammable(nm) && Math.random() < 0.5) this.set(ni, Mat.Fire, PowderGrid.fireLife());
    }
    const life = this.aux[i];
    if (life <= 1) this.set(i, Mat.Empty, 0);
    else this.aux[i] = life - 1;
  }

  /** Electricity travels through connected water/metal (charge stored in aux). */
  private spreadCharge(x: number, y: number, i: number): void {
    const c = this.aux[i];
    if (c <= 0) return;
    this.aux[i] = c - 1;
    const cols = this.cols;
    const around = [y > 0 ? i - cols : -1, y < this.rows - 1 ? i + cols : -1, x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1];
    for (const ni of around) {
      if (ni < 0) continue;
      const nm = this.mat[ni] as Mat;
      if ((nm === Mat.Water || nm === Mat.Metal) && this.aux[ni] < c - 1) this.aux[ni] = c - 1;
    }
  }

  private lavaReact(x: number, y: number, i: number): void {
    const cols = this.cols;
    const around = [y > 0 ? i - cols : -1, y < this.rows - 1 ? i + cols : -1, x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1];
    let cooled = false;
    for (const ni of around) {
      if (ni < 0) continue;
      const nm = this.mat[ni] as Mat;
      if (nm === Mat.Water) { this.set(ni, Mat.Steam, PowderGrid.steamLife()); cooled = true; }
      else if (nm === Mat.Ice) { this.set(ni, Mat.Water, 0); }
      else if (isFlammable(nm) && Math.random() < 0.3) { this.set(ni, Mat.Fire, PowderGrid.fireLife()); }
    }
    if (cooled) { this.set(i, Mat.Stone, 0); return; }
    if (Math.random() < 0.02 && y > 0 && this.mat[i - cols] === Mat.Empty) this.set(i - cols, Mat.Fire, PowderGrid.fireLife());
  }

  private acidReact(x: number, y: number, i: number): boolean {
    const cols = this.cols;
    const around = [y > 0 ? i - cols : -1, y < this.rows - 1 ? i + cols : -1, x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1];
    for (const ni of around) {
      if (ni < 0) continue;
      const nm = this.mat[ni] as Mat;
      if (nm === Mat.Stone || nm === Mat.Wood || nm === Mat.Sand || nm === Mat.Ice || nm === Mat.Gunpowder || nm === Mat.Plant || nm === Mat.Metal) {
        if (Math.random() < 0.22) {
          this.set(ni, Mat.Empty, 0);
          if (Math.random() < 0.4) { this.set(i, Mat.Empty, 0); return true; }
        }
      }
    }
    return false;
  }

  private explodeAt(idx: number): void {
    this.explode(idx % this.cols, (idx / this.cols) | 0);
  }
  private explode(x: number, y: number): void {
    this.explosions.push({ x: x * this.cell + this.cell / 2, y: y * this.cell + this.cell / 2, r: EXPL_CELLS * this.cell });
    const rc = EXPL_CELLS;
    for (let dy = -rc; dy <= rc; dy++) {
      for (let dx = -rc; dx <= rc; dx++) {
        if (dx * dx + dy * dy > rc * rc) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const j = ny * this.cols + nx;
        const jm = this.mat[j] as Mat;
        if (jm === Mat.Stone || jm === Mat.Ice) { if (Math.random() < 0.5) this.set(j, Mat.Empty, 0); }
        else this.set(j, Mat.Fire, PowderGrid.fireLife());
      }
    }
  }

  // ---- external API -------------------------------------------------------

  matAtPx(px: number, py: number): Mat {
    const x = (px / this.cell) | 0;
    const y = (py / this.cell) | 0;
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return Mat.Empty;
    return this.mat[y * this.cols + x] as Mat;
  }

  /** Is the cell at this point live electricity (charged water/metal or a spark)? */
  isChargedPx(px: number, py: number): boolean {
    const x = (px / this.cell) | 0;
    const y = (py / this.cell) | 0;
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    const i = y * this.cols + x;
    const m = this.mat[i] as Mat;
    if (m === Mat.Spark) return true;
    return (m === Mat.Water || m === Mat.Metal) && this.aux[i] > 0;
  }

  paintPx(px: number, py: number, m: Mat, radiusPx: number): void {
    const cx = px / this.cell, cy = py / this.cell, rc = Math.max(0, radiusPx / this.cell);
    const x0 = Math.max(0, Math.floor(cx - rc)), x1 = Math.min(this.cols - 1, Math.ceil(cx + rc));
    const y0 = Math.max(0, Math.floor(cy - rc)), y1 = Math.min(this.rows - 1, Math.ceil(cy + rc));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const ddx = x - cx, ddy = y - cy;
        if (ddx * ddx + ddy * ddy > rc * rc) continue;
        const i = y * this.cols + x;
        if (m === Mat.Empty) { this.mat[i] = Mat.Empty; this.aux[i] = 0; continue; }
        const life = m === Mat.Fire ? PowderGrid.fireLife() : m === Mat.Spark ? 6 : 0;
        this.mat[i] = m;
        this.aux[i] = life;
      }
    }
  }

  fillRectPx(x0: number, y0: number, x1: number, y1: number, m: Mat): void {
    const cx0 = Math.max(0, Math.floor(x0 / this.cell)), cx1 = Math.min(this.cols - 1, Math.ceil(x1 / this.cell));
    const cy0 = Math.max(0, Math.floor(y0 / this.cell)), cy1 = Math.min(this.rows - 1, Math.ceil(y1 / this.cell));
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { const i = y * this.cols + x; this.mat[i] = m; this.aux[i] = 0; }
  }

  /** Bodies displace light materials they move through; `all` tunnels through anything. */
  carvePx(x0: number, y0: number, x1: number, y1: number, all = false): void {
    const cx0 = Math.max(0, Math.floor(x0 / this.cell)), cx1 = Math.min(this.cols - 1, Math.ceil(x1 / this.cell));
    const cy0 = Math.max(0, Math.floor(y0 / this.cell)), cy1 = Math.min(this.rows - 1, Math.ceil(y1 / this.cell));
    for (let y = cy0; y <= cy1; y++) {
      for (let x = cx0; x <= cx1; x++) {
        const i = y * this.cols + x;
        const m = this.mat[i] as Mat;
        if (all || m === Mat.Sand || m === Mat.Smoke || m === Mat.Steam) {
          this.mat[i] = Mat.Empty; this.aux[i] = 0;
        }
      }
    }
  }
}
