// Persistent survival/RPG progression (localStorage, with a headless-safe fallback).

export interface SurvivalMeta {
  level: number;
  xp: number;
  stash: number; // banked loot from successful extractions
  bestWave: number;
}

const KEY = 'sf_survival_v1';
const DEFAULT: SurvivalMeta = { level: 1, xp: 0, stash: 0, bestWave: 0 };

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
    return { ...DEFAULT, ...JSON.parse(raw) };
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
