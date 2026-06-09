import Matter from 'matter-js';
import type { BodyMeta } from '../types';

const { Bodies, Body } = Matter;

export interface WeaponDef {
  name: string;
  /** length along the held axis (px) and thickness */
  len: number;
  thick: number;
  density: number;
  /** silly, on-theme look */
  color: string;
  glow: string;
  shape: 'sword' | 'mace' | 'baguette' | 'discoflail';
}

// A couple of deliberately silly starter weapons (art direction: festival nonsense).
export const WEAPON_DEFS: WeaponDef[] = [
  { name: 'Neon Saber', len: 78, thick: 9, density: 0.0014, color: '#00f0ff', glow: '#00f0ff', shape: 'sword' },
  { name: 'Disco Mace', len: 64, thick: 16, density: 0.0026, color: '#ff37c8', glow: '#ff37c8', shape: 'discoflail' },
  { name: 'Doom Baguette', len: 84, thick: 12, density: 0.0018, color: '#ffcf4d', glow: '#ffae00', shape: 'baguette' },
];

export interface Weapon {
  body: Matter.Body;
  def: WeaponDef;
  ownerId: number; // fighter id currently owning it, or -1 if loose
}

export function createWeapon(
  defIndex: number,
  x: number,
  y: number,
  group: number,
  ownerId: number,
): Weapon {
  const def = WEAPON_DEFS[defIndex % WEAPON_DEFS.length];
  // Built as a vertical bar; the grip end is the bottom, the business end is the top.
  const body = Bodies.rectangle(x, y, def.thick, def.len, {
    density: def.density,
    friction: 0.4,
    frictionAir: 0.006,
    chamfer: { radius: Math.min(def.thick, def.len) * 0.25 },
    collisionFilter: { group },
    label: `weapon:${def.name}`,
  });
  Body.setAngle(body, 0);
  const meta: BodyMeta = { fighterId: ownerId, kind: 'weapon' };
  (body as unknown as { meta: BodyMeta }).meta = meta;
  return { body, def, ownerId };
}

export function setWeaponOwner(weapon: Weapon, ownerId: number, group: number): void {
  weapon.ownerId = ownerId;
  weapon.body.collisionFilter.group = group;
  (weapon.body as unknown as { meta: BodyMeta }).meta.fighterId = ownerId;
}
