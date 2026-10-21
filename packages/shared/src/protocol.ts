import { FIGHTER_STATES, type Contact, type Fighter } from './fighter.ts';
import type { Match, MatchPhase, SimEvent, Winner } from './match.ts';
import type { MapId } from './maps.ts';
import { MOVE_IDS, type MoveId, type WeaponId } from './weapons.ts';

export const PROTOCOL_VERSION = 2;
export const DEFAULT_SERVER_PORT = 2567;
export const SNAPSHOT_EVERY = 2;
export const VOTE_MS = 10_000;
export const LOAD_TIMEOUT_MS = 20_000;
export const REMATCH_WAIT_MS = 30_000;
/** Per fighter; the server allows twice this for both: the opponent's full ring entrance and the closing beat of yours. */
export const ENTRANCE_MS = 8_000;

export interface PlayerInfo {
  name: string;
  avatar: string | null;
  title: string;
}

export type ClientMessage =
  | { t: 'hello'; v: number; player: PlayerInfo }
  | { t: 'queue' }
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'vote'; map?: MapId | 'random'; weapon?: WeaponId }
  | { t: 'progress'; value: number }
  | { t: 'skip' }
  | { t: 'input'; seq: number; mx: number; my: number; held: number; counts: number[] }
  | { t: 'rematch' }
  | { t: 'ping'; ts: number };

export type RoomPhase = 'waiting' | 'vote' | 'load' | 'entrance' | 'match' | 'results';

export interface RoomState {
  roomId: string;
  code: string;
  isPrivate: boolean;
  phase: RoomPhase;
  players: (PlayerInfo | null)[];
  you: 0 | 1;
  /** Server time (ms) when the current timed phase ends, if any. */
  endsAt: number;
  map: MapId | null;
  weapons: (WeaponId | null)[];
  /** 'random' is a real vote for a random map, shown on the Random tile. */
  votes: { map: (MapId | 'random' | null)[]; weapon: (WeaponId | null)[] };
  progress: number[];
  rematch: boolean[];
  winner: Winner;
}

export type ServerMessage =
  | { t: 'welcome'; id: string; serverTime: number }
  | { t: 'queued' }
  | { t: 'room'; room: RoomState; serverTime: number }
  | { t: 'snap'; s: MatchSnapshot; ev: SimEvent[]; ack: number }
  | { t: 'left'; who: 0 | 1 }
  /** The room is gone (a public room after its pair split up); go back to practice. */
  | { t: 'closed' }
  | { t: 'pong'; ts: number; serverTime: number }
  | { t: 'error'; message: string };

export interface MatchSnapshot {
  tick: number;
  phase: MatchPhase;
  phaseFrame: number;
  round: number;
  timer: number;
  hitstop: number;
  roundWinner: Winner;
  winner: Winner;
  f: [number[], number[]];
}

const MOVES: (MoveId | null)[] = [null, ...MOVE_IDS];
const CONTACTS: (Contact | null)[] = [null, 'hit', 'block', 'parried'];

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function encodeFighter(f: Fighter): number[] {
  return [
    round3(f.x), round3(f.y), round3(f.z), round3(f.vy), round3(f.kx), round3(f.kz), round3(f.facing),
    f.hp, round3(f.posture), f.postureDelay,
    FIGHTER_STATES.indexOf(f.state), f.stateFrame, f.stateLen,
    MOVES.indexOf(f.move), CONTACTS.indexOf(f.moveContact), f.moveDone ? 1 : 0, f.moveHits,
    round3(f.dodgeX), round3(f.dodgeZ), f.dodgeCharges, f.dodgeRecharge, f.dashWindow, f.critCooldown,
    f.comboCount, f.guardBreakBonus ? 1 : 0, f.buffer, f.bufferAge, f.rollDir, f.roundsWon,
    round3(f.moveX), round3(f.moveY),
  ];
}

export function decodeFighterInto(f: Fighter, a: readonly number[]): void {
  let i = 0;
  const n = () => a[i++] ?? 0;
  f.x = n(); f.y = n(); f.z = n(); f.vy = n(); f.kx = n(); f.kz = n(); f.facing = n();
  f.hp = n(); f.posture = n(); f.postureDelay = n();
  f.state = FIGHTER_STATES[n()] ?? 'idle'; f.stateFrame = n(); f.stateLen = n();
  f.move = MOVES[n()] ?? null; f.moveContact = CONTACTS[n()] ?? null; f.moveDone = n() === 1; f.moveHits = n();
  f.dodgeX = n(); f.dodgeZ = n(); f.dodgeCharges = n(); f.dodgeRecharge = n(); f.dashWindow = n(); f.critCooldown = n();
  f.comboCount = n(); f.guardBreakBonus = n() === 1; f.buffer = n(); f.bufferAge = n(); f.rollDir = n();
  f.roundsWon = n(); f.moveX = n(); f.moveY = n();
}

export function snapshotMatch(m: Match): MatchSnapshot {
  return {
    tick: m.tick,
    phase: m.phase,
    phaseFrame: m.phaseFrame,
    round: m.round,
    timer: m.timer,
    hitstop: m.hitstop,
    roundWinner: m.roundWinner,
    winner: m.winner,
    f: [encodeFighter(m.fighters[0]), encodeFighter(m.fighters[1])],
  };
}

export function applySnapshot(m: Match, s: MatchSnapshot): void {
  m.tick = s.tick;
  m.phase = s.phase;
  m.phaseFrame = s.phaseFrame;
  m.round = s.round;
  m.timer = s.timer;
  m.hitstop = s.hitstop;
  m.roundWinner = s.roundWinner;
  m.winner = s.winner;
  decodeFighterInto(m.fighters[0], s.f[0]);
  decodeFighterInto(m.fighters[1], s.f[1]);
}

export function makeRoomCode(rand: () => number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(rand() * alphabet.length)];
  return code;
}
