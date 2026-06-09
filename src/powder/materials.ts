// Material definitions for the falling-sand / chemistry engine (Dust2-inspired).

export enum Mat {
  Empty = 0,
  Sand,
  Water,
  Oil,
  Fire,
  Ember,
  Smoke,
  Steam,
  Stone,
  Wood,
  Lava,
  Acid,
  Ice,
  Gunpowder,
  Plant,
  Metal,
  Spark,
  Dirt,
  Grass,
  Ore,
  Leaves,
  Snow,
  Chest,
}

export const MAT_COUNT = Mat.Chest + 1;

export enum Cat {
  Empty,
  Powder, // falls + piles
  Liquid, // falls + flows + levels
  Gas, // rises + fades
  Solid, // static terrain
  Energy, // fire / ember
}

export interface MatDef {
  name: string;
  cat: Cat;
  rgb: [number, number, number];
  density: number; // for liquid/powder layering (lighter floats)
  flammable: boolean;
}

export const MATERIALS: Record<Mat, MatDef> = {
  [Mat.Empty]: { name: 'Eraser', cat: Cat.Empty, rgb: [0, 0, 0], density: 0, flammable: false },
  [Mat.Sand]: { name: 'Sand', cat: Cat.Powder, rgb: [206, 184, 108], density: 1.6, flammable: false },
  [Mat.Water]: { name: 'Water', cat: Cat.Liquid, rgb: [54, 130, 224], density: 1.0, flammable: false },
  [Mat.Oil]: { name: 'Oil', cat: Cat.Liquid, rgb: [86, 64, 44], density: 0.8, flammable: true },
  [Mat.Fire]: { name: 'Fire', cat: Cat.Energy, rgb: [255, 130, 36], density: 0.1, flammable: false },
  [Mat.Ember]: { name: 'Ember', cat: Cat.Energy, rgb: [255, 96, 24], density: 0.5, flammable: false },
  [Mat.Smoke]: { name: 'Smoke', cat: Cat.Gas, rgb: [62, 62, 74], density: 0.2, flammable: false },
  [Mat.Steam]: { name: 'Steam', cat: Cat.Gas, rgb: [200, 212, 224], density: 0.2, flammable: false },
  [Mat.Stone]: { name: 'Stone', cat: Cat.Solid, rgb: [112, 110, 124], density: 3, flammable: false },
  [Mat.Wood]: { name: 'Wood', cat: Cat.Solid, rgb: [122, 82, 44], density: 3, flammable: true },
  [Mat.Lava]: { name: 'Lava', cat: Cat.Liquid, rgb: [255, 96, 22], density: 2.2, flammable: false },
  [Mat.Acid]: { name: 'Acid', cat: Cat.Liquid, rgb: [126, 240, 70], density: 1.05, flammable: false },
  [Mat.Ice]: { name: 'Ice', cat: Cat.Solid, rgb: [164, 222, 240], density: 3, flammable: false },
  [Mat.Gunpowder]: { name: 'Gunpowder', cat: Cat.Powder, rgb: [74, 74, 80], density: 1.3, flammable: true },
  [Mat.Plant]: { name: 'Plant', cat: Cat.Solid, rgb: [64, 184, 76], density: 3, flammable: true },
  [Mat.Metal]: { name: 'Metal', cat: Cat.Solid, rgb: [150, 158, 172], density: 4, flammable: false },
  [Mat.Spark]: { name: 'Spark', cat: Cat.Energy, rgb: [180, 230, 255], density: 0.1, flammable: false },
  [Mat.Dirt]: { name: 'Dirt', cat: Cat.Solid, rgb: [134, 96, 58], density: 3, flammable: false },
  [Mat.Grass]: { name: 'Grass', cat: Cat.Solid, rgb: [86, 176, 72], density: 3, flammable: true },
  [Mat.Ore]: { name: 'Ore', cat: Cat.Solid, rgb: [196, 176, 96], density: 4, flammable: false },
  [Mat.Leaves]: { name: 'Leaves', cat: Cat.Solid, rgb: [60, 150, 64], density: 1, flammable: true },
  [Mat.Snow]: { name: 'Snow', cat: Cat.Solid, rgb: [226, 236, 248], density: 2, flammable: false },
  [Mat.Chest]: { name: 'Chest', cat: Cat.Solid, rgb: [210, 170, 70], density: 3, flammable: false },
};

/** Brush palette (order = on-screen selection order, keys 1..9,0). */
export const PAINTABLE: Mat[] = [
  Mat.Sand, Mat.Water, Mat.Oil, Mat.Fire, Mat.Lava,
  Mat.Acid, Mat.Gunpowder, Mat.Metal, Mat.Spark, Mat.Empty,
];

export function isLiquid(m: Mat): boolean {
  return MATERIALS[m].cat === Cat.Liquid;
}
export function isGas(m: Mat): boolean {
  return MATERIALS[m].cat === Cat.Gas;
}
export function isFlammable(m: Mat): boolean {
  return MATERIALS[m].flammable;
}
export function density(m: Mat): number {
  return MATERIALS[m].density;
}

/** Flat RGB palette (length MAT_COUNT*3) for fast ImageData rendering. */
export const PALETTE: Uint8Array = (() => {
  const p = new Uint8Array(MAT_COUNT * 3);
  for (let m = 0; m < MAT_COUNT; m++) {
    const c = MATERIALS[m as Mat].rgb;
    p[m * 3] = c[0];
    p[m * 3 + 1] = c[1];
    p[m * 3 + 2] = c[2];
  }
  return p;
})();
