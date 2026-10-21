export type WeaponId = 'naginata' | 'bo' | 'katana';
export type WeaponClass = 'blade' | 'blunt';
export type MoveId = 'L1' | 'L2' | 'L3' | 'L4' | 'H' | 'C' | 'P';
export type MoveKind = 'light' | 'heavy' | 'critical' | 'plunge';
export type MoveAnim = 'slashR' | 'slashL' | 'thrust' | 'spin' | 'overhead' | 'rising' | 'plunge';

export interface CancelRule {
  into: MoveId | 'dodge';
  /** Move frames (0 = first startup frame), inclusive. */
  from: number;
  to: number;
  requires?: 'contact' | 'hit';
}

export interface MoveData {
  id: MoveId;
  kind: MoveKind;
  anim: MoveAnim;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  posture: number;
  hitstun: number;
  blockstun: number;
  range: number;
  /** Width of the hit arc in degrees, centered on the facing direction. */
  arc: number;
  /** Forward root motion during the active frames, in meters. */
  lunge: number;
  knockback: number;
  knockdown: boolean;
  unblockable: boolean;
  /** Frames of white glow before the first active frame (0 = none). */
  glow: number;
  hitstop: number;
  cancels: CancelRule[];
}

export interface WeaponData {
  id: WeaponId;
  name: string;
  weaponClass: WeaponClass;
  /** Short description for the vote screen. */
  blurb: string;
  moves: Record<MoveId, MoveData>;
}

export const LIGHT_CHAIN: readonly MoveId[] = ['L1', 'L2', 'L3', 'L4'];

interface Tuning {
  lightSpeed: number;
  heavySpeed: number;
  recovery: number;
  reach: number;
  damage: number;
  posture: number;
}

type Base = Omit<MoveData, 'cancels'>;

const BASE: Record<MoveId, Base> = {
  L1: { id: 'L1', kind: 'light', anim: 'slashR', startup: 8, active: 3, recovery: 12, damage: 6, posture: 8, hitstun: 18, blockstun: 10, range: 3.0, arc: 110, lunge: 0.6, knockback: 0.3, knockdown: false, unblockable: false, glow: 0, hitstop: 4 },
  L2: { id: 'L2', kind: 'light', anim: 'slashL', startup: 8, active: 3, recovery: 12, damage: 6, posture: 8, hitstun: 18, blockstun: 10, range: 3.0, arc: 110, lunge: 0.6, knockback: 0.3, knockdown: false, unblockable: false, glow: 0, hitstop: 4 },
  L3: { id: 'L3', kind: 'light', anim: 'thrust', startup: 9, active: 3, recovery: 13, damage: 7, posture: 9, hitstun: 18, blockstun: 10, range: 3.3, arc: 40, lunge: 0.9, knockback: 0.4, knockdown: false, unblockable: false, glow: 0, hitstop: 4 },
  L4: { id: 'L4', kind: 'light', anim: 'spin', startup: 12, active: 4, recovery: 20, damage: 9, posture: 14, hitstun: 24, blockstun: 14, range: 3.0, arc: 200, lunge: 0.7, knockback: 3.0, knockdown: true, unblockable: false, glow: 0, hitstop: 10 },
  H: { id: 'H', kind: 'heavy', anim: 'overhead', startup: 22, active: 4, recovery: 24, damage: 15, posture: 25, hitstun: 24, blockstun: 16, range: 3.2, arc: 90, lunge: 1.0, knockback: 1.2, knockdown: false, unblockable: false, glow: 0, hitstop: 8 },
  C: { id: 'C', kind: 'critical', anim: 'rising', startup: 30, active: 5, recovery: 30, damage: 18, posture: 30, hitstun: 28, blockstun: 0, range: 3.4, arc: 120, lunge: 1.4, knockback: 1.6, knockdown: false, unblockable: true, glow: 16, hitstop: 10 },
  P: { id: 'P', kind: 'plunge', anim: 'plunge', startup: 12, active: 4, recovery: 24, damage: 11, posture: 18, hitstun: 22, blockstun: 14, range: 2.4, arc: 360, lunge: 0, knockback: 0.8, knockdown: false, unblockable: false, glow: 0, hitstop: 8 },
};

function tune(base: Base, t: Tuning): Base {
  const isLight = base.kind === 'light';
  const isHeavy = base.kind === 'heavy' || base.kind === 'critical';
  const speed = isLight ? t.lightSpeed : isHeavy ? t.heavySpeed : 0;
  return {
    ...base,
    startup: Math.max(5, base.startup + speed),
    recovery: Math.max(8, base.recovery + t.recovery),
    range: +(base.range + t.reach).toFixed(2),
    damage: Math.round(base.damage * t.damage),
    posture: Math.round(base.posture * t.posture),
  };
}

function withCancels(m: Base): MoveData {
  const endActive = m.startup + m.active;
  const cancels: CancelRule[] = [];
  const chainIndex = LIGHT_CHAIN.indexOf(m.id);
  if (chainIndex >= 0 && chainIndex < LIGHT_CHAIN.length - 1) {
    // Chains open 2 frames into recovery: hitstun covers the gap, blockstun doesn't,
    // so a blocked string leaves the defender a parry window between hits.
    cancels.push({ into: LIGHT_CHAIN[chainIndex + 1]!, from: endActive + 2, to: endActive + 10, requires: 'contact' });
    cancels.push({ into: 'H', from: endActive, to: endActive + 6, requires: 'hit' });
  }
  if (m.kind !== 'critical') {
    const dodgeFrom = m.kind === 'plunge' ? endActive + 6 : endActive;
    cancels.push({ into: 'dodge', from: dodgeFrom, to: endActive + 12 });
  }
  return { ...m, cancels };
}

function buildWeapon(id: WeaponId, name: string, weaponClass: WeaponClass, blurb: string, t: Tuning): WeaponData {
  const moves = {} as Record<MoveId, MoveData>;
  for (const key of Object.keys(BASE) as MoveId[]) {
    moves[key] = withCancels(tune(BASE[key], t));
  }
  return { id, name, weaponClass, blurb, moves };
}

export const WEAPONS: Record<WeaponId, WeaponData> = {
  naginata: buildWeapon('naginata', 'Naginata', 'blade', 'Long reach, sweeping arcs', {
    lightSpeed: 0, heavySpeed: 0, recovery: 0, reach: 0, damage: 1, posture: 1,
  }),
  bo: buildWeapon('bo', 'Bo Staff', 'blunt', 'Fast strikes that crush guards', {
    lightSpeed: -1, heavySpeed: -2, recovery: 0, reach: -0.4, damage: 0.9, posture: 1.25,
  }),
  katana: buildWeapon('katana', 'Katana', 'blade', 'Quickest blade, short reach', {
    lightSpeed: -2, heavySpeed: -3, recovery: -2, reach: -0.8, damage: 0.95, posture: 0.9,
  }),
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export function moveTotal(m: MoveData): number {
  return m.startup + m.active + m.recovery;
}

export type MovePhase = 'startup' | 'active' | 'recovery';

export function movePhase(m: MoveData, frame: number): MovePhase {
  if (frame < m.startup) return 'startup';
  if (frame < m.startup + m.active) return 'active';
  return 'recovery';
}
