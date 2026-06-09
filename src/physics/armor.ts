// Material-aware armor with real trade-offs (steel conducts shock, rubber insulates…).

import type { PartName } from '../types';

export type DamageType = 'phys' | 'heat' | 'acid' | 'shock' | 'explosive';

export enum ArmorMat {
  Steel,
  Rubber,
  Ceramic,
  Leather,
}

export interface ArmorDef {
  name: string;
  color: string;
  hp: number;
  /** Fraction of incoming damage of each type the armor soaks (0..1). */
  resist: Record<DamageType, number>;
}

export const ARMOR: Record<ArmorMat, ArmorDef> = {
  [ArmorMat.Steel]: {
    name: 'Steel', color: '#9aa2b4', hp: 64,
    resist: { phys: 0.66, heat: 0.3, acid: 0.35, shock: 0.0, explosive: 0.4 }, // conducts shock!
  },
  [ArmorMat.Rubber]: {
    name: 'Rubber', color: '#2c2c34', hp: 42,
    resist: { phys: 0.3, heat: 0.25, acid: 0.3, shock: 0.92, explosive: 0.3 }, // shock-proof
  },
  [ArmorMat.Ceramic]: {
    name: 'Ceramic', color: '#e8d9c0', hp: 34,
    resist: { phys: 0.45, heat: 0.85, acid: 0.5, shock: 0.35, explosive: 0.2 }, // heat-proof, brittle
  },
  [ArmorMat.Leather]: {
    name: 'Leather', color: '#7a4a28', hp: 28,
    resist: { phys: 0.32, heat: 0.2, acid: 0.25, shock: 0.45, explosive: 0.2 },
  },
};

export interface ArmorPiece {
  mat: ArmorMat;
  hp: number;
  max: number;
}

/** Default kit: steel core (shock-vulnerable), rubber arms, leather legs. */
export const DEFAULT_LOADOUT: Partial<Record<PartName, ArmorMat>> = {
  head: ArmorMat.Steel,
  torso: ArmorMat.Steel,
  upperArmL: ArmorMat.Rubber,
  upperArmR: ArmorMat.Rubber,
  upperLegL: ArmorMat.Leather,
  upperLegR: ArmorMat.Leather,
};

export function makeArmor(loadout: Partial<Record<PartName, ArmorMat>>): Partial<Record<PartName, ArmorPiece>> {
  const out: Partial<Record<PartName, ArmorPiece>> = {};
  for (const k of Object.keys(loadout) as PartName[]) {
    const mat = loadout[k]!;
    out[k] = { mat, hp: ARMOR[mat].hp, max: ARMOR[mat].hp };
  }
  return out;
}
