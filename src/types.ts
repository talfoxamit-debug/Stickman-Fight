// Shared types kept dependency-free to avoid import cycles.

export type PartName =
  | 'head'
  | 'torso'
  | 'upperArmL'
  | 'lowerArmL'
  | 'upperArmR'
  | 'lowerArmR'
  | 'upperLegL'
  | 'lowerLegL'
  | 'upperLegR'
  | 'lowerLegR';

export type Kind = 'limb' | 'core' | 'head' | 'weapon' | 'ground' | 'wall';

/** Stashed on every Matter body via `(body as any).meta` for fast collision lookup. */
export interface BodyMeta {
  fighterId: number; // -1 for neutral (ground / dropped-but-unowned)
  part?: PartName;
  kind: Kind;
}

export function metaOf(body: { meta?: BodyMeta }): BodyMeta | undefined {
  return body.meta;
}
