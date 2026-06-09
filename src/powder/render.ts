// Renders the powder grid to an offscreen ImageData, scaled up under the fighters.

import { PowderGrid } from './grid';
import { Mat, MATERIALS, Cat, PALETTE } from './materials';

function alphaFor(m: Mat): number {
  const cat = MATERIALS[m].cat;
  if (cat === Cat.Gas) return 120;
  if (cat === Cat.Liquid) return m === Mat.Lava ? 255 : 205;
  return 255;
}

export class PowderRenderer {
  private off: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private img: ImageData;

  constructor(grid: PowderGrid) {
    this.off = document.createElement('canvas');
    this.off.width = grid.cols;
    this.off.height = grid.rows;
    this.octx = this.off.getContext('2d')!;
    this.img = this.octx.createImageData(grid.cols, grid.rows);
  }

  draw(ctx: CanvasRenderingContext2D, grid: PowderGrid, viewW: number, viewH: number): void {
    const data = this.img.data;
    const mat = grid.mat;
    const n = grid.cols * grid.rows;
    for (let i = 0; i < n; i++) {
      const m = mat[i];
      const o = i * 4;
      if (m === Mat.Empty) { data[o + 3] = 0; continue; }
      const p = m * 3;
      let r = PALETTE[p], g = PALETTE[p + 1], b = PALETTE[p + 2];
      if (m === Mat.Fire || m === Mat.Ember || m === Mat.Lava) {
        const f = (Math.random() * 50) | 0;
        g = Math.min(255, g + f - 10);
      } else if ((m === Mat.Water || m === Mat.Metal) && grid.aux[i] > 0) {
        // Live electricity: flicker bright electric white-blue.
        const f = (Math.random() * 90) | 0;
        r = 150 + (f >> 1); g = 220; b = 255;
      }
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = alphaFor(m as Mat);
    }
    this.octx.putImageData(this.img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, grid.cols, grid.rows, 0, 0, viewW, viewH);
    ctx.imageSmoothingEnabled = true;
  }
}
