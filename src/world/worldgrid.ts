// A large static terrain world (Terraria-style): surface, dirt, stone, caves, ore, trees.
// Separate from the powder CA — terrain is solid tiles you stand on and dig through.

import { Mat } from '../powder/materials';

const SOLID = new Set<Mat>([Mat.Dirt, Mat.Grass, Mat.Stone, Mat.Ore, Mat.Wood, Mat.Metal]);

export function isSolidMat(m: Mat): boolean {
  return SOLID.has(m);
}

export class WorldGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly tiles: Uint8Array;
  readonly widthPx: number;
  readonly heightPx: number;
  spawnX = 0;
  spawnY = 0;

  constructor(cols = 420, rows = 220, cell = 10) {
    this.cols = cols;
    this.rows = rows;
    this.cell = cell;
    this.widthPx = cols * cell;
    this.heightPx = rows * cell;
    this.tiles = new Uint8Array(cols * rows);
    this.generate();
  }

  private idx(x: number, y: number): number {
    return y * this.cols + x;
  }

  at(x: number, y: number): Mat {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return y >= this.rows ? Mat.Stone : Mat.Empty;
    return this.tiles[this.idx(x, y)] as Mat;
  }

  matAtPx(px: number, py: number): Mat {
    return this.at((px / this.cell) | 0, (py / this.cell) | 0);
  }
  isSolidPx(px: number, py: number): boolean {
    return isSolidMat(this.matAtPx(px, py));
  }

  // ---- generation ---------------------------------------------------------

  private generate(): void {
    const { cols, rows } = this;
    const baseSurface = Math.floor(rows * 0.32);
    // Rolling-hill surface from layered sines.
    const p1 = Math.random() * 10, p2 = Math.random() * 10, p3 = Math.random() * 10;
    const surfAt = (c: number) =>
      Math.round(
        baseSurface +
          14 * Math.sin(c * 0.018 + p1) +
          6 * Math.sin(c * 0.05 + p2) +
          3 * Math.sin(c * 0.13 + p3),
      );

    for (let x = 0; x < cols; x++) {
      const s = surfAt(x);
      for (let y = 0; y < rows; y++) {
        let m: Mat = Mat.Empty;
        if (y === s) m = Mat.Grass;
        else if (y > s && y <= s + 4) m = Mat.Dirt;
        else if (y > s + 4) m = Mat.Stone;
        this.tiles[this.idx(x, y)] = m;
      }
    }

    // Caves: carve air pockets in the stone using overlapping sine fields.
    for (let x = 0; x < cols; x++) {
      const s = surfAt(x);
      for (let y = s + 6; y < rows - 2; y++) {
        const f =
          Math.sin(x * 0.07 + y * 0.06) +
          Math.cos(x * 0.043 - y * 0.05) +
          0.6 * Math.sin(x * 0.11 + y * 0.09 + 2.1);
        if (f > 1.15) this.tiles[this.idx(x, y)] = Mat.Empty;
      }
    }

    // Ore veins scattered through the stone.
    const veins = Math.floor((cols * rows) / 1400);
    for (let i = 0; i < veins; i++) {
      const cx = (Math.random() * cols) | 0;
      const cy = (surfAt(cx) + 12 + Math.random() * (rows - surfAt(cx) - 16)) | 0;
      const n = 3 + ((Math.random() * 6) | 0);
      let x = cx, y = cy;
      for (let k = 0; k < n; k++) {
        if (this.at(x, y) === Mat.Stone) this.tiles[this.idx(x, y)] = Mat.Ore;
        x += ((Math.random() * 3) | 0) - 1;
        y += ((Math.random() * 3) | 0) - 1;
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
      }
    }

    // Trees on the surface.
    for (let x = 4; x < cols - 4; x += 6 + ((Math.random() * 18) | 0)) {
      const s = surfAt(x);
      const h = 4 + ((Math.random() * 4) | 0);
      for (let t = 1; t <= h; t++) if (s - t >= 0) this.tiles[this.idx(x, s - t)] = Mat.Wood;
      const top = s - h;
      for (let dy = -2; dy <= 1; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const lx = x + dx, ly = top + dy;
          if (lx >= 0 && lx < cols && ly >= 0 && this.at(lx, ly) === Mat.Empty && dx * dx + dy * dy <= 6) {
            this.tiles[this.idx(lx, ly)] = Mat.Leaves;
          }
        }
      }
    }

    // Spawn on the surface near the middle.
    const sx = (cols / 2) | 0;
    this.spawnX = sx * this.cell + this.cell / 2;
    this.spawnY = (surfAt(sx) - 8) * this.cell;
  }

  // ---- interaction --------------------------------------------------------

  /** The world-y of the top surface of the first solid at/below (px, fromPy). */
  groundBelowPx(px: number, fromPy: number): number {
    const x = (px / this.cell) | 0;
    let y = Math.max(0, (fromPy / this.cell) | 0);
    for (; y < this.rows; y++) {
      if (isSolidMat(this.at(x, y))) return y * this.cell;
    }
    return this.heightPx;
  }

  /** Dig out solid tiles in a radius; returns what was mined (material -> count). */
  digPx(px: number, py: number, radiusPx: number): Map<Mat, number> {
    const out = new Map<Mat, number>();
    const cx = px / this.cell, cy = py / this.cell, rc = radiusPx / this.cell;
    const x0 = Math.max(0, Math.floor(cx - rc)), x1 = Math.min(this.cols - 1, Math.ceil(cx + rc));
    const y0 = Math.max(0, Math.floor(cy - rc)), y1 = Math.min(this.rows - 1, Math.ceil(cy + rc));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > rc * rc) continue;
        const i = this.idx(x, y);
        const m = this.tiles[i] as Mat;
        if (m !== Mat.Empty && m !== Mat.Leaves) {
          out.set(m, (out.get(m) ?? 0) + 1);
          this.tiles[i] = Mat.Empty;
        } else if (m === Mat.Leaves) {
          this.tiles[i] = Mat.Empty;
        }
      }
    }
    return out;
  }
}
