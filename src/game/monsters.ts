// Survival monster archetypes (built on the same ragdoll Fighter).

import type { Evolution } from '../physics/fighter';

export type OnDeath = 'none' | 'explode' | 'fireburst' | 'acidburst';

export interface MonsterArchetype {
  name: string;
  color: string;
  accent: string;
  hpMul: number;
  speedMul?: number;
  evolution?: Evolution;
  weapon?: number | 'melee'; // weapon index, or a random melee weapon
  onDeath?: OnDeath;
  minWave?: number;
}

export const ARCHETYPES: MonsterArchetype[] = [
  { name: 'Shambler', color: '#9be36b', accent: '#d6ffb0', hpMul: 1.0, weapon: 'melee', minWave: 1 },
  { name: 'Runner', color: '#e3d76b', accent: '#fff6b0', hpMul: 0.6, speedMul: 1.5, weapon: 'melee', minWave: 1 },
  { name: 'Bomber', color: '#e36b6b', accent: '#ffb0b0', hpMul: 0.8, onDeath: 'explode', minWave: 2 },
  { name: 'Brute', color: '#8a6be3', accent: '#d0b0ff', hpMul: 2.1, evolution: 'titan', weapon: 'melee', minWave: 3 },
  { name: 'Fire Imp', color: '#ff8c42', accent: '#ffd0a0', hpMul: 0.6, weapon: 3, onDeath: 'fireburst', minWave: 3 },
  { name: 'Acid Wraith', color: '#7ef046', accent: '#d6ffb0', hpMul: 0.7, weapon: 4, onDeath: 'acidburst', minWave: 4 },
  { name: 'Flyer', color: '#6bd7e3', accent: '#b0f0ff', hpMul: 0.6, evolution: 'aviator', weapon: 'melee', minWave: 4 },
];

export function pickArchetype(wave: number): MonsterArchetype {
  const pool = ARCHETYPES.filter((a) => (a.minWave ?? 1) <= wave);
  return pool[(Math.random() * pool.length) | 0] ?? ARCHETYPES[0];
}

// Each biome favours a signature pair of threats (so where you fight matters).
const BIOME_FAVORS: Record<string, string[]> = {
  snow: ['Flyer', 'Runner'],
  forest: ['Shambler', 'Brute'],
  desert: ['Runner', 'Bomber'],
  volcanic: ['Fire Imp', 'Brute'],
};

/** Weighted pick: gated by danger tier, biased toward the local biome's signature foes. */
export function pickArchetypeFor(tier: number, biome: string): MonsterArchetype {
  const pool = ARCHETYPES.filter((a) => (a.minWave ?? 1) <= tier);
  if (pool.length === 0) return ARCHETYPES[0];
  const favors = BIOME_FAVORS[biome] ?? [];
  const weighted: MonsterArchetype[] = [];
  for (const a of pool) {
    weighted.push(a);
    if (favors.includes(a.name)) weighted.push(a, a); // 3x weight for biome signatures
  }
  return weighted[(Math.random() * weighted.length) | 0];
}

