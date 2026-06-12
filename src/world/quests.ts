// Onboarding + objective chain for the open world. Each stage gives the player a
// clear next goal, foregrounds the ONE control they need for it, and pays out on
// completion — turning the sandbox of systems into a guided, rewarding loop.

export type QuestMetric =
  | 'move' // distance walked (px)
  | 'mineAny' // tiles mined
  | 'craftAny' // anything crafted
  | 'kills' // monsters slain
  | 'learnSkill' // skill points spent
  | 'mineOre' // ore tiles mined
  | 'depth'; // deepest tile reached

export interface QuestStage {
  id: string;
  title: string;
  hint: string; // the single control to teach for this step
  metric: QuestMetric;
  target: number;
  rewardXp: number;
  rewardLoot: number;
}

export const QUESTS: QuestStage[] = [
  { id: 'move', title: 'Find your feet — go explore', hint: 'A / D walk  ·  W jump (press again to double-jump)', metric: 'move', target: 1000, rewardXp: 20, rewardLoot: 5 },
  { id: 'mine', title: 'Gather materials', hint: 'Hold LMB to swing — smash trees, dirt & stone', metric: 'mineAny', target: 14, rewardXp: 25, rewardLoot: 8 },
  { id: 'craft', title: 'Craft your first gear', hint: 'Press E — craft a Pickaxe or a weapon', metric: 'craftAny', target: 1, rewardXp: 35, rewardLoot: 12 },
  { id: 'fight', title: 'Cull the monsters', hint: 'LMB attack  ·  double-tap A/D to dodge-roll', metric: 'kills', target: 3, rewardXp: 45, rewardLoot: 18 },
  { id: 'skill', title: 'Grow stronger', hint: 'Press K — open the Skill Tree, spend a point', metric: 'learnSkill', target: 1, rewardXp: 35, rewardLoot: 12 },
  { id: 'ore', title: 'Dig for ore', hint: 'Mine downward — golden ore hides in the stone', metric: 'mineOre', target: 6, rewardXp: 50, rewardLoot: 25 },
  { id: 'descend', title: 'Descend into the depths', hint: 'Tunnel straight down — danger & treasure grow', metric: 'depth', target: 35, rewardXp: 80, rewardLoot: 40 },
];

/** Running tally the World keeps; quest progress is read from this. */
export interface QuestStats {
  moved: number;
  mined: number;
  minedOre: number;
  crafted: number;
  skillsSpent: number;
  kills: number;
  maxDepth: number;
}

export function newQuestStats(): QuestStats {
  return { moved: 0, mined: 0, minedOre: 0, crafted: 0, skillsSpent: 0, kills: 0, maxDepth: 0 };
}

export function questValue(metric: QuestMetric, s: QuestStats): number {
  switch (metric) {
    case 'move': return s.moved;
    case 'mineAny': return s.mined;
    case 'mineOre': return s.minedOre;
    case 'craftAny': return s.crafted;
    case 'kills': return s.kills;
    case 'learnSkill': return s.skillsSpent;
    case 'depth': return s.maxDepth;
  }
}
