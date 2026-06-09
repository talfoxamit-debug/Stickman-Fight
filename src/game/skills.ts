// MapleStory/MU-style skill tree: 3 branches of active + passive skills you level up
// by spending skill points earned on level-up. Node layout drives the tree UI + clicks.

export type SkillBranch = 'might' | 'sorcery' | 'survival';
export type SkillKind = 'passive' | 'active';

export interface SkillDef {
  id: string;
  name: string;
  branch: SkillBranch;
  kind: SkillKind;
  max: number;
  tier: number; // row in the tree (0 = top)
  reqLevel: number; // character level required to start
  reqSkill?: string; // prerequisite skill id (must have >=1)
  desc: string;
  // actives:
  cooldownMs?: number;
  manaCost?: number;
}

export const SKILLS: SkillDef[] = [
  // MIGHT (red) — melee power
  { id: 'vigor', name: 'Vigor', branch: 'might', kind: 'passive', max: 5, tier: 0, reqLevel: 1, desc: '+25 max HP / lvl' },
  { id: 'fury', name: 'Fury', branch: 'might', kind: 'passive', max: 5, tier: 1, reqLevel: 2, desc: '+8% damage / lvl' },
  { id: 'power', name: 'Power Strike', branch: 'might', kind: 'active', max: 5, tier: 2, reqLevel: 3, desc: 'AoE slam around you', cooldownMs: 3500, manaCost: 10 },
  { id: 'whirl', name: 'Whirlwind', branch: 'might', kind: 'active', max: 3, tier: 3, reqLevel: 6, reqSkill: 'power', desc: 'Big spin: AoE + launch', cooldownMs: 8000, manaCost: 22 },

  // SORCERY (cyan) — chemistry magic
  { id: 'arcane', name: 'Arcane', branch: 'sorcery', kind: 'passive', max: 5, tier: 0, reqLevel: 1, desc: '+15 max mana, +10% spell / lvl' },
  { id: 'firebolt', name: 'Firebolt', branch: 'sorcery', kind: 'active', max: 5, tier: 1, reqLevel: 2, desc: 'Blast of fire ahead', cooldownMs: 2600, manaCost: 9 },
  { id: 'frost', name: 'Frost Nova', branch: 'sorcery', kind: 'active', max: 4, tier: 2, reqLevel: 4, desc: 'Freeze + hit nearby', cooldownMs: 6000, manaCost: 16 },
  { id: 'bolt', name: 'Chain Bolt', branch: 'sorcery', kind: 'active', max: 4, tier: 3, reqLevel: 7, reqSkill: 'arcane', desc: 'Lightning to nearest foes', cooldownMs: 4500, manaCost: 18 },

  // SURVIVAL (green) — utility
  { id: 'swift', name: 'Swiftness', branch: 'survival', kind: 'passive', max: 5, tier: 0, reqLevel: 1, desc: '+7% move speed / lvl' },
  { id: 'regen', name: 'Regeneration', branch: 'survival', kind: 'passive', max: 5, tier: 1, reqLevel: 2, desc: 'Heal over time / lvl' },
  { id: 'mend', name: 'Mend', branch: 'survival', kind: 'active', max: 3, tier: 2, reqLevel: 4, desc: 'Heal yourself', cooldownMs: 9000, manaCost: 18 },
  { id: 'leech', name: 'Lifesteal', branch: 'survival', kind: 'passive', max: 3, tier: 3, reqLevel: 6, reqSkill: 'regen', desc: 'Heal % of damage dealt' },
];

export const BRANCHES: { id: SkillBranch; name: string; color: string }[] = [
  { id: 'might', name: 'MIGHT', color: '#ff6b6b' },
  { id: 'sorcery', name: 'SORCERY', color: '#39d6ff' },
  { id: 'survival', name: 'SURVIVAL', color: '#7cff5a' },
];

/** Tree node screen position for the UI + click hit-testing (1280x720 canvas). */
export function skillNodePos(s: SkillDef): { x: number; y: number } {
  const col = s.branch === 'might' ? 0 : s.branch === 'sorcery' ? 1 : 2;
  return { x: 300 + col * 340, y: 250 + s.tier * 92 };
}

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export interface CharState {
  level: number;
  xp: number;
  skillPoints: number;
  learned: Record<string, number>;
}

export function xpForCharLevel(level: number): number {
  return 60 + level * 45;
}

/** Aggregate passive bonuses from learned skills. */
export function passives(learned: Record<string, number>) {
  const l = (id: string) => learned[id] ?? 0;
  return {
    hp: l('vigor') * 25,
    dmg: l('fury') * 0.08,
    speed: l('swift') * 0.07,
    mana: l('arcane') * 15,
    spell: 1 + l('arcane') * 0.1,
    regenPerSec: l('regen') * 1.4,
    lifesteal: l('leech') * 0.06,
  };
}

export function canLearn(s: SkillDef, char: CharState): boolean {
  if (char.skillPoints <= 0) return false;
  if ((char.learned[s.id] ?? 0) >= s.max) return false;
  if (char.level < s.reqLevel) return false;
  if (s.reqSkill && (char.learned[s.reqSkill] ?? 0) < 1) return false;
  return true;
}
