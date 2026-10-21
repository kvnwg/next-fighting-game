import {
  DODGE_CHARGES,
  DODGE_RECHARGE,
  MAX_HP,
  START_DISTANCE,
} from './constants.ts';
import type { MoveId, WeaponId } from './weapons.ts';

export const FIGHTER_STATES = [
  'idle',
  'jump',
  'attack',
  'parry',
  'block',
  'blockRelease',
  'parryWhiff',
  'blockstun',
  'hitstun',
  'stagger',
  'guardbreak',
  'dodge',
  'knockdown',
  'getup',
  'ko',
] as const;

export type FighterState = (typeof FIGHTER_STATES)[number];

export type Contact = 'hit' | 'block' | 'parried';

export interface Fighter {
  id: 0 | 1;
  weapon: WeaponId;
  x: number;
  y: number;
  z: number;
  vy: number;
  /** Knockback velocity on the ground plane, decays every tick. */
  kx: number;
  kz: number;
  /** Yaw in radians; 0 faces +z. */
  facing: number;
  hp: number;
  posture: number;
  postureDelay: number;
  state: FighterState;
  stateFrame: number;
  /** Length of a timed state in ticks (0 = lasts until something ends it). */
  stateLen: number;
  move: MoveId | null;
  moveContact: Contact | null;
  moveDone: boolean;
  dodgeX: number;
  dodgeZ: number;
  dodgeCharges: number;
  dodgeRecharge: number;
  critCooldown: number;
  /** Hits taken in the current combo, used for damage scaling. */
  comboCount: number;
  guardBreakBonus: boolean;
  buffer: number;
  bufferAge: number;
  rollDir: number;
  roundsWon: number;
  /** Last movement input, kept for walk animations. */
  moveX: number;
  moveY: number;
}

export function startPosition(id: 0 | 1): { x: number; z: number; facing: number } {
  const z = id === 0 ? -START_DISTANCE / 2 : START_DISTANCE / 2;
  return { x: 0, z, facing: id === 0 ? 0 : Math.PI };
}

export function createFighter(id: 0 | 1, weapon: WeaponId): Fighter {
  const start = startPosition(id);
  return {
    id,
    weapon,
    x: start.x,
    y: 0,
    z: start.z,
    vy: 0,
    kx: 0,
    kz: 0,
    facing: start.facing,
    hp: MAX_HP,
    posture: 0,
    postureDelay: 0,
    state: 'idle',
    stateFrame: 0,
    stateLen: 0,
    move: null,
    moveContact: null,
    moveDone: false,
    dodgeX: 0,
    dodgeZ: 0,
    dodgeCharges: DODGE_CHARGES,
    dodgeRecharge: DODGE_RECHARGE,
    critCooldown: 0,
    comboCount: 0,
    guardBreakBonus: false,
    buffer: 0,
    bufferAge: 0,
    rollDir: 0,
    roundsWon: 0,
    moveX: 0,
    moveY: 0,
  };
}

/** Resets a fighter for a new round, keeping identity, weapon and rounds won. */
export function resetForRound(f: Fighter): void {
  const fresh = createFighter(f.id, f.weapon);
  Object.assign(f, fresh, { roundsWon: f.roundsWon });
}

export function forwardOf(facing: number): [number, number] {
  return [Math.sin(facing), Math.cos(facing)];
}

export function rightOf(facing: number): [number, number] {
  return [-Math.cos(facing), Math.sin(facing)];
}

export function yawTowards(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}
