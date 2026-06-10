// Minecraft-style crafting: combine mined materials (by recipe) into real gear —
// pickaxes that dig bigger & faster, weapons (incl. chemistry sprayers), armor,
// potions, and placeable blocks. Each recipe shows a 3x3 grid like Minecraft.

import { Mat } from '../powder/materials';

export type CraftCategory = 'tool' | 'weapon' | 'armor' | 'potion' | 'block';

export interface Recipe {
  id: string;
  name: string;
  category: CraftCategory;
  desc: string;
  ingredients: [Mat, number][];
  shape: number[]; // 9 cells, Mat value or 0 = empty (the cosmetic 3x3 grid)
  // ---- result wiring (only the fields relevant to the category are set) ----
  weaponIndex?: number; // weapon: WEAPON_DEFS index to equip
  dmgBonus?: number; // weapon: bonus damage multiplier while equipped
  digTier?: number; // tool: pickaxe power (bigger + faster mining)
  hpBonus?: number; // armor: +max HP
  defBonus?: number; // armor: damage reduction (0..1)
  speedBonus?: number; // armor: +move speed
  give?: string; // potion/block: item id granted
  stack?: number; // potion/block: count granted per craft
  permanent?: boolean; // tool/armor: craft once, then it's "owned"
}

// Shorthand for shape authoring.
const _ = 0;
const W = Mat.Wood, S = Mat.Stone, O = Mat.Ore, M = Mat.Metal;
const G = Mat.Grass, D = Mat.Dirt, N = Mat.Snow, A = Mat.Sand;

export const RECIPES: Recipe[] = [
  // ---- TOOLS: pickaxes make digging fast + wide (the point of mining) -------
  { id: 'stone_pick', name: 'Stone Pickaxe', category: 'tool', desc: 'Dig faster & wider (tier 1)',
    ingredients: [[S, 3], [W, 2]], shape: [S, S, S, _, W, _, _, W, _], digTier: 1, permanent: true },
  { id: 'iron_pick', name: 'Iron Pickaxe', category: 'tool', desc: 'Dig much faster & wider (tier 2)',
    ingredients: [[O, 3], [W, 2]], shape: [O, O, O, _, W, _, _, W, _], digTier: 2, permanent: true },
  { id: 'mega_drill', name: 'Mega Drill', category: 'tool', desc: 'Carve huge tunnels (tier 3)',
    ingredients: [[O, 4], [M, 2], [W, 2]], shape: [O, M, O, O, W, O, _, W, _], digTier: 3, permanent: true },

  // ---- WEAPONS: equip a real weapon (incl. chemistry emitters) --------------
  { id: 'saber', name: 'Neon Saber', category: 'weapon', desc: 'Fast slashing blade (+10% dmg)',
    ingredients: [[O, 2], [W, 1]], shape: [_, O, _, _, O, _, _, W, _], weaponIndex: 0, dmgBonus: 0.1 },
  { id: 'mace', name: 'Disco Mace', category: 'weapon', desc: 'Heavy smasher (+18% dmg)',
    ingredients: [[S, 3], [O, 2], [W, 1]], shape: [S, O, S, O, S, O, _, W, _], weaponIndex: 1, dmgBonus: 0.18 },
  { id: 'flamer', name: 'Flamethrower', category: 'weapon', desc: 'Sprays Fire — burn & ignite',
    ingredients: [[M, 2], [O, 2], [S, 1]], shape: [M, M, _, O, O, _, _, S, _], weaponIndex: 3, dmgBonus: 0.05 },
  { id: 'acid', name: 'Acid Sprayer', category: 'weapon', desc: 'Sprays Acid — melts foes',
    ingredients: [[M, 2], [O, 2], [G, 2]], shape: [M, M, _, O, O, _, G, G, _], weaponIndex: 4, dmgBonus: 0.05 },
  { id: 'cryo', name: 'Cryo Sprayer', category: 'weapon', desc: 'Sprays Ice — chill & slow',
    ingredients: [[M, 2], [O, 1], [N, 3]], shape: [N, N, N, M, O, M, _, _, _], weaponIndex: 6, dmgBonus: 0.05 },
  { id: 'spark', name: 'Spark Gun', category: 'weapon', desc: 'Sprays Sparks — shock',
    ingredients: [[M, 3], [O, 2]], shape: [M, M, M, _, O, O, _, _, _], weaponIndex: 7, dmgBonus: 0.05 },

  // ---- ARMOR: permanent HP / defense / speed gear --------------------------
  { id: 'vest', name: 'Festival Vest', category: 'armor', desc: '+30 max HP, 8% defense',
    ingredients: [[G, 5], [D, 3]], shape: [G, _, G, G, G, G, D, D, D], hpBonus: 30, defBonus: 0.08, permanent: true },
  { id: 'stoneplate', name: 'Stone Plate', category: 'armor', desc: '+60 max HP, 16% defense',
    ingredients: [[S, 8]], shape: [S, _, S, S, S, S, S, S, S], hpBonus: 60, defBonus: 0.16, permanent: true },
  { id: 'ironplate', name: 'Iron Plate', category: 'armor', desc: '+90 max HP, 24% defense',
    ingredients: [[O, 6], [M, 3]], shape: [O, _, O, O, M, O, O, M, O], hpBonus: 90, defBonus: 0.24, permanent: true },
  { id: 'boots', name: 'Swift Sandals', category: 'armor', desc: '+18% move speed',
    ingredients: [[N, 3], [G, 2], [W, 2]], shape: [_, _, _, N, G, N, W, _, W], speedBonus: 0.18, permanent: true },

  // ---- POTIONS: consumables you stack + use --------------------------------
  { id: 'healpot', name: 'Health Potion', category: 'potion', desc: 'Drink [H]: heal 60 HP · makes 2',
    ingredients: [[G, 3], [O, 1]], shape: [_, G, _, _, G, _, _, O, _], give: 'hp', stack: 2 },
  { id: 'manapot', name: 'Mana Potion', category: 'potion', desc: 'Drink [J]: +40 mana · makes 2',
    ingredients: [[N, 3], [O, 1]], shape: [_, N, _, _, N, _, _, O, _], give: 'mp', stack: 2 },
  { id: 'bomb', name: 'Bomb', category: 'potion', desc: 'Throw [B]: blast + blow a crater · makes 3',
    ingredients: [[O, 3], [A, 2], [M, 1]], shape: [_, O, _, A, M, A, A, O, A], give: 'bomb', stack: 3 },

  // ---- BLOCKS: place to build (hold Q at the cursor) ------------------------
  { id: 'stonebricks', name: 'Stone Bricks', category: 'block', desc: 'Place [hold Q]: walls & towers · makes 12',
    ingredients: [[S, 4]], shape: [S, S, S, S, _, S, S, S, S], give: 'stone', stack: 12 },
  { id: 'woodplanks', name: 'Wood Planks', category: 'block', desc: 'Place [hold Q]: bridges & platforms · makes 12',
    ingredients: [[W, 3]], shape: [W, W, W, W, _, W, W, W, W], give: 'wood', stack: 12 },
  { id: 'lantern', name: 'Glow Block', category: 'block', desc: 'Place [hold Q]: shiny metal block · makes 6',
    ingredients: [[M, 2], [O, 2]], shape: [_, M, _, M, O, M, _, M, _], give: 'metal', stack: 6 },
];

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export const CRAFT_CATEGORIES: { id: CraftCategory; name: string; color: string }[] = [
  { id: 'tool', name: 'TOOLS', color: '#ffcf4d' },
  { id: 'weapon', name: 'WEAPONS', color: '#ff6b6b' },
  { id: 'armor', name: 'ARMOR', color: '#39d6ff' },
  { id: 'potion', name: 'POTIONS', color: '#c98bff' },
  { id: 'block', name: 'BLOCKS', color: '#7cff5a' },
];

/** Block item id -> material it places. */
export const BLOCK_MAT: Record<string, Mat> = { stone: Mat.Stone, wood: Mat.Wood, metal: Mat.Metal };

export function recipesIn(cat: CraftCategory): Recipe[] {
  return RECIPES.filter((r) => r.category === cat);
}

export function hasIngredients(r: Recipe, inv: Map<Mat, number>): boolean {
  for (const [m, n] of r.ingredients) if ((inv.get(m) ?? 0) < n) return false;
  return true;
}

// ---- UI geometry (1280x720 canvas) — shared by renderer + click hit-testing.
export function craftTabRect(i: number): { x: number; y: number; w: number; h: number } {
  const w = 200, gap: number = 12;
  const total = CRAFT_CATEGORIES.length * w + (CRAFT_CATEGORIES.length - 1) * gap;
  const x0 = 1280 / 2 - total / 2;
  return { x: x0 + i * (w + gap), y: 118, w, h: 44 };
}

export function craftRowRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: 1280 / 2 - 460, y: 184 + i * 80, w: 920, h: 70 };
}
