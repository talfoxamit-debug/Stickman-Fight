// Persistent survival/RPG progression (localStorage, with a headless-safe fallback).

export type UpgradeKey = 'vitality' | 'power' | 'plating' | 'swiftness';

export interface SurvivalMeta {
  level: number;
  xp: number;
  stash: number; // banked loot from successful extractions
  bestWave: number;
  upgrades: Record<UpgradeKey, number>;
}

export const UPGRADES: { key: UpgradeKey; name: string; desc: string }[] = [
  { key: 'vitality', name: 'Vitality', desc: '+20 max health' },
  { key: 'power', name: 'Power', desc: '+15% attack damage' },
  { key: 'plating', name: 'Plating', desc: '+25% armor' },
  { key: 'swiftness', name: 'Swiftness', desc: '+10% move speed' },
];

export function upgradeCost(level: number): number {
  return 10 + level * 8;
}

const KEY = 'sf_survival_v1';
const DEFAULT: SurvivalMeta = {
  level: 1, xp: 0, stash: 0, bestWave: 0,
  upgrades: { vitality: 0, power: 0, plating: 0, swiftness: 0 },
};

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadMeta(): SurvivalMeta {
  const s = storage();
  if (!s) return { ...DEFAULT };
  try {
    const raw = s.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const p = JSON.parse(raw);
    return { ...DEFAULT, ...p, upgrades: { ...DEFAULT.upgrades, ...(p.upgrades ?? {}) } };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveMeta(m: SurvivalMeta): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function xpForLevel(level: number): number {
  return 40 + level * 30;
}
