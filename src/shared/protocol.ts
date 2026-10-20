/** WebSocket message shapes. All messages are JSON objects with a `t` discriminator. */
import { AttackKey, CharacterId } from './characters';
import { Outcome } from './combat';
import { Fighter, FighterState, InputAction } from './fighter';
import { round2 } from './math';

export const PROTOCOL_VERSION = 1;

export type QueueMode = 'ranked' | 'practice';
export type MatchMode = 'ranked' | 'practice' | 'casual';
export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type MatchPhase = 'intro' | 'countdown' | 'fight' | 'roundEnd' | 'matchEnd';

export interface ProfileView {
  id: string;
  name: string;
  mmr: number;
  peak: number;
  wins: number;
  losses: number;
  placements: number;
  streak: number;
  kills: number;
}

export interface RosterEntry {
  id: string;
  name: string;
  char: CharacterId;
  bot?: boolean;
  dummy?: 'passive' | 'sparring';
  mmr?: number;
  placements?: number;
}

/** Dynamic per-fighter state broadcast by the server. */
export interface FighterSnap {
  i: string;
  x: number;
  y: number;
  z: number;
  r: number;
  s: FighterState;
  /** state start (server ms) */
  ss: number;
  /** state duration for timed states */
  sd: number;
  a?: AttackKey;
  /** actual windup of the current attack (riposte can shorten it) */
  aw?: number;
  hp: number;
  po: number;
  /** guard held */
  b: 0 | 1;
  /** 1 = buff (War Cry) active, 2 = in safe zone, 4 = spawn protected */
  f: number;
  /** attack serial; lets clients tell back-to-back identical attacks apart */
  n: number;
}

export interface CombatEvent {
  k: Outcome | 'feint' | 'lava' | 'fall';
  a?: string;
  d: string;
  dmg?: number;
  heal?: number;
  key?: AttackKey;
  x: number;
  y: number;
  z: number;
  /** extra flags: 'backstab', 'tipper', 'broken' (defender posture broke), 'abroken' (attacker broke), 'kill' */
  tags?: string[];
}

export interface LeaderboardEntry {
  name: string;
  mmr: number;
  wins: number;
  losses: number;
  placements: number;
}

export type ClientMsg =
  | { t: 'hello'; v: number; token?: string; name: string; char: CharacterId }
  | { t: 'move'; x: number; y: number; z: number; r: number; g: 0 | 1; e: number }
  | { t: 'act'; a: InputAction; vt: number; dx?: number; dz?: number; r?: number }
  | { t: 'char'; id: CharacterId }
  | { t: 'queue'; mode: QueueMode; diff?: BotDifficulty }
  | { t: 'unqueue' }
  | { t: 'challenge'; target: string }
  | { t: 'challengeReply'; from: string; accept: boolean }
  | { t: 'chat'; text: string }
  | { t: 'ping'; c: number; rtt?: number }
  | { t: 'forfeit' }
  | { t: 'leaderboard' }
  | { t: 'fell' };

export type ServerMsg =
  | { t: 'welcome'; id: string; token: string; profile: ProfileView; online: number; serverTime: number }
  | { t: 'pong'; c: number; s: number }
  | {
      t: 'enter';
      kind: 'lobby' | 'arena';
      map: string;
      x: number;
      z: number;
      yaw: number;
      epoch: number;
      roster: RosterEntry[];
      snap: FighterSnap[];
    }
  | { t: 'roster'; add?: RosterEntry[]; remove?: string[] }
  | { t: 'snap'; s: number; f: FighterSnap[] }
  /** immediate state changes between snapshots (positions not authoritative) */
  | { t: 'st'; s: number; f: FighterSnap[] }
  | { t: 'fx'; e: CombatEvent[] }
  | { t: 'tp'; x: number; z: number; yaw?: number; epoch: number; reason?: string }
  | { t: 'push'; dx: number; dz: number }
  | { t: 'reject'; a: InputAction }
  | { t: 'queue'; mode: QueueMode | null; since: number; searching: number }
  | {
      t: 'match';
      mode: MatchMode;
      phase: MatchPhase;
      round: number;
      scores: [number, number];
      endsAt: number;
      map: string;
      you: 0 | 1;
      players: [RosterEntry, RosterEntry];
      roundWinner?: 0 | 1 | -1;
    }
  | {
      t: 'result';
      mode: MatchMode;
      won: boolean;
      reason: 'ko' | 'forfeit' | 'timeout';
      scores: [number, number];
      before?: { mmr: number; placements: number };
      after?: { mmr: number; placements: number };
      delta?: number;
    }
  | { t: 'profile'; profile: ProfileView }
  | { t: 'leaderboard'; entries: LeaderboardEntry[]; you: number | null; total: number }
  | { t: 'challenge'; from: string; name: string; char: CharacterId; expires: number }
  | { t: 'notice'; text: string; kind?: 'info' | 'warn' | 'good' }
  | { t: 'chat'; name: string; text: string; sys?: boolean }
  | { t: 'feed'; killer: string; victim: string; how: string }
  | { t: 'online'; n: number };

export function fighterSnap(f: Fighter, flags: number): FighterSnap {
  const s: FighterSnap = {
    i: f.id,
    x: round2(f.x),
    y: round2(f.y),
    z: round2(f.z),
    r: round2(f.yaw),
    s: f.state,
    ss: Math.round(f.stateStart),
    sd: Math.round(f.stateDur),
    hp: Math.round(f.hp * 10) / 10,
    po: Math.round(f.posture * 10) / 10,
    b: f.blockHeld ? 1 : 0,
    f: flags,
    n: f.attackSerial,
  };
  if (f.state === 'attack' && f.attackKey) {
    s.a = f.attackKey;
    s.aw = f.atkWindup;
  }
  return s;
}
