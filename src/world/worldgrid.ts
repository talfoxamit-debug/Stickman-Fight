// A large static terrain world (Terraria-style): biomes, caves, ore, trees, chests,
// and a deep lava sea. Solid tiles you stand on and dig through.

import { Mat } from '../powder/materials';

const SOLID = new Set<Mat>([Mat.Dirt, Mat.Grass, Mat.Stone, Mat.Ore, Mat.Wood, Mat.Metal, Mat.Sand, Mat.Snow]);

export function isSolidMat(m: Mat): boolean {
  return SOLID.has(m);
}

export type Biome = 'snow' | 'forest' | 'desert' | 'volcanic';
export interface Chest { x: number; y: number; looted: boolean }

export class WorldGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly tiles: Uint8Array;
  readonly widthPx: number;
  readonly heightPx: number;
  chests: Chest[] = [];
  spawnX = 0;
  spawnY = 0;

  constructor(cols = 360, rows = 200, cell = 44) {
    this.cols = cols;
    this.rows = rows;
    this.cell = cell;
    this.widthPx = cols * cell;
    this.heightPx = rows * cell;
    this.tiles = new Uint8Array(cols * rows);
    this.generate();
  }

  private idx(x: number, y: number): number { return y * this.cols + x; }

  at(x: number, y: number): Mat {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return y >= this.rows ? Mat.Stone : Mat.Empty;
    return this.tiles[this.idx(x, y)] as Mat;
  }
  matAtPx(px: number, py: number): Mat { return this.at((px / this.cell) | 0, (py / this.cell) | 0); }
  isSolidPx(px: number, py: number): boolean { return isSolidMat(this.matAtPx(px, py)); }

  biomeAt(col: number): Biome {
    const f = col / this.cols;
    if (f < 0.16) return 'snow';
    if (f < 0.42) return 'forest';
    if (f < 0.62) return 'desert';
    if (f < 0.82) return 'forest';
    return 'volcanic';
  }
  biomeAtPx(px: number): Biome { return this.biomeAt((px / this.cell) | 0); }

  // ---- generation ---------------------------------------------------------

  private generate(): void {
    const { cols, rows } = this;
    const baseSurface = Math.floor(rows * 0.3);
    const p1 = Math.random() * 10, p2 = Math.random() * 10, p3 = Math.random() * 10;
    const surfAt = (c: number) => Math.round(baseSurface + 14 * Math.sin(c * 0.018 + p1) + 6 * Math.sin(c * 0.05 + p2) + 3 * Math.sin(c * 0.13 + p3));
    const surf = (b: Biome) => (b === 'snow' ? Mat.Snow : b === 'desert' ? Mat.Sand : b === 'volcanic' ? Mat.Stone : Mat.Grass);
    const sub = (b: Biome) => (b === 'snow' ? Mat.Snow : b === 'desert' ? Mat.Sand : b === 'volcanic' ? Mat.Stone : Mat.Dirt);

    for (let x = 0; x < cols; x++) {
      const b = this.biomeAt(x);
      const s = surfAt(x);
      for (let y = 0; y < rows; y++) {
        let m: Mat = Mat.Empty;
        if (y === s) m = surf(b);
        else if (y > s && y <= s + 4) m = sub(b);
        else if (y > s + 4) m = Mat.Stone;
        this.tiles[this.idx(x, y)] = m;
      }
    }

    // Caves.
    for (let x = 0; x < cols; x++) {
      const s = surfAt(x);
      for (let y = s + 6; y < rows - 2; y++) {
        const f = Math.sin(x * 0.07 + y * 0.06) + Math.cos(x * 0.043 - y * 0.05) + 0.6 * Math.sin(x * 0.11 + y * 0.09 + 2.1);
        if (f > 1.15) this.tiles[this.idx(x, y)] = Mat.Empty;
      }
    }

    // Deep lava sea + volcanic lava pockets.
    for (let x = 0; x < cols; x++) {
      for (let y = rows - 4; y < rows; y++) this.tiles[this.idx(x, y)] = Mat.Lava;
      if (this.biomeAt(x) === 'volcanic') {
        for (let y = (rows * 0.6) | 0; y < rows - 4; y++) {
          if (this.at(x, y) === Mat.Empty && Math.random() < 0.06) this.tiles[this.idx(x, y)] = Mat.Lava;
        }
      }
    }

    // Ore veins (denser deeper / in volcanic).
    const veins = Math.floor((cols * rows) / 1100);
    for (let i = 0; i < veins; i++) {
      const cx = (Math.random() * cols) | 0;
      const cy = (surfAt(cx) + 12 + Math.random() * (rows - surfAt(cx) - 18)) | 0;
      let x = cx, y = cy;
      for (let k = 0, n = 3 + ((Math.random() * 6) | 0); k < n; k++) {
        if (this.at(x, y) === Mat.Stone) this.tiles[this.idx(x, y)] = Mat.Ore;
        x = Math.max(0, Math.min(cols - 1, x + ((Math.random() * 3) | 0) - 1));
        y = Math.max(0, Math.min(rows - 1, y + ((Math.random() * 3) | 0) - 1));
      }
    }

    // Trees (forest + snow).
    for (let x = 4; x < cols - 4; x += 6 + ((Math.random() * 18) | 0)) {
      const b = this.biomeAt(x);
      if (b !== 'forest' && b !== 'snow') continue;
      const s = surfAt(x);
      const h = 4 + ((Math.random() * 4) | 0);
      for (let t = 1; t <= h; t++) if (s - t >= 0) this.tiles[this.idx(x, s - t)] = Mat.Wood;
      const top = s - h;
      for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
        const lx = x + dx, ly = top + dy;
        if (lx >= 0 && lx < cols && ly >= 0 && this.at(lx, ly) === Mat.Empty && dx * dx + dy * dy <= 6) {
          this.tiles[this.idx(lx, ly)] = b === 'snow' ? Mat.Snow : Mat.Leaves;
        }
      }
    }

    // Treasure chests on cave floors.
    for (let x = 8; x < cols - 8; x += 8 + ((Math.random() * 14) | 0)) {
      const s = surfAt(x);
      for (let y = s + 10; y < rows - 6; y++) {
        if (this.at(x, y) === Mat.Empty && isSolidMat(this.at(x, y + 1)) && Math.random() < 0.6) {
          this.chests.push({ x: x * this.cell + this.cell / 2, y: y * this.cell + this.cell / 2, looted: false });
          break;
        }
      }
    }

    // Clean spawn pocket in a forest band.
    const sx = (cols * 0.3) | 0;
    for (let dx = -3; dx <= 3; dx++) {
      const cx = sx + dx;
      if (cx < 0 || cx >= cols) continue;
      const s = surfAt(cx);
      for (let dy = -12; dy < 0; dy++) if (s + dy >= 0) this.tiles[this.idx(cx, s + dy)] = Mat.Empty;
    }
    this.spawnX = sx * this.cell + this.cell / 2;
    this.spawnY = (surfAt(sx) - 5) * this.cell;
  }

  // ---- interaction --------------------------------------------------------

  groundBelowPx(px: number, fromPy: number): number {
    const x = (px / this.cell) | 0;
    let y = Math.max(0, (fromPy / this.cell) | 0);
    for (; y < this.rows; y++) if (isSolidMat(this.at(x, y))) return y * this.cell;
    return this.heightPx;
  }

  digPx(px: number, py: number, radiusPx: number): Map<Mat, number> {
    const out = new Map<Mat, number>();
    const cx = px / this.cell, cy = py / this.cell, rc = radiusPx / this.cell;
    const x0 = Math.max(0, Math.floor(cx - rc)), x1 = Math.min(this.cols - 1, Math.ceil(cx + rc));
    const y0 = Math.max(0, Math.floor(cy - rc)), y1 = Math.min(this.rows - 1, Math.ceil(cy + rc));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > rc * rc) continue;
      const i = this.idx(x, y);
      const m = this.tiles[i] as Mat;
      if (m === Mat.Empty || m === Mat.Lava) continue;
      if (m !== Mat.Leaves) out.set(m, (out.get(m) ?? 0) + 1);
      this.tiles[i] = Mat.Empty;
    }
    return out;
  }
}
