/** WebSocket message shapes. All messages are JSON objects with a `t` discriminator. */
import { AttackKey, CharacterId } from './characters';
import { Outcome } from './combat';
import { Fighter, FighterState, InputAction } from './fighter';
import { round2 } from './math';
import type { Progress } from './progress';

export const PROTOCOL_VERSION = 6;

export type QueueMode = 'ranked' | 'practice';
export type MatchMode = 'ranked' | 'practice' | 'casual' | 'tutorial';
export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type MatchPhase = 'intro' | 'countdown' | 'fight' | 'roundEnd' | 'matchEnd';

/** A player's record, rating and what they own (see progress.ts). */
export interface ProfileView extends Progress {
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
  /** when the special is charged (server ms); drives the special meter */
  sr?: number;
  /** where the current zone attack is aimed (x, z): the ground it marks */
  am?: [number, number];
}

export interface CombatEvent {
  k: Outcome | 'feint' | 'lava' | 'fall' | 'execute';
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
  /** q: client sequence number, echoed in a 'reject' if the input never takes effect */
  | { t: 'act'; a: InputAction; vt: number; dx?: number; dz?: number; r?: number; q?: number }
  | { t: 'char'; id: CharacterId }
  | { t: 'queue'; mode: QueueMode; diff?: BotDifficulty }
  | { t: 'unqueue' }
  | { t: 'challenge'; target: string }
  | { t: 'challengeReply'; from: string; accept: boolean }
  | { t: 'chat'; text: string }
  | { t: 'ping'; c: number }
  /** answer to a server 'sping' (the server measures latency itself) */
  | { t: 'spong'; s: number }
  | { t: 'forfeit' }
  | { t: 'leaderboard' }
  | { t: 'fell' }
  /** a pick on the map and fighter select before a match ('random' leaves the arena to chance) */
  | { t: 'vote'; map?: string; char?: CharacterId }
  /** buy a fighter or an arena with coins, or (free) take the free fighter */
  | { t: 'unlock'; kind: 'char' | 'map'; id: string; free?: boolean }
  /** an ad was watched to the end: the one after a match, or one from the shop */
  | { t: 'ad'; kind: 'match' | 'bonus' }
  /** start the tutorial, or skip (or leave) it */
  | { t: 'tutorial'; a: 'start' | 'skip' }
  /** a private lobby: open one (you get its code), join one by its code, or go back to the public grounds */
  | { t: 'room'; a: 'create' | 'leave' }
  | { t: 'room'; a: 'join'; code: string };

/**
 * The tutorial's steps, in order: strike into the sensei's guard; block until your own guard
 * breaks (and pay for it); deflect his blows until his guard breaks; finish him with a deathblow;
 * dodge his perilous attack; done.
 */
/** The lessons, then a real duel with the sensei (a result, then back to the lobby). */
export type TutorialStep = 'strike' | 'block' | 'deflect' | 'execute' | 'perilous' | 'duel';
export const TUTORIAL_STEPS: readonly TutorialStep[] = ['strike', 'block', 'deflect', 'execute', 'perilous', 'duel'];
/** feedback on the last try: a deflect pressed too early (held into a block) or too late (hit) */
export type TutorialNote = 'early' | 'late' | 'good' | 'broken' | 'again';

/** One side of the map and fighter select. */
export interface SelectSide {
  name: string;
  bot: boolean;
  /** the fighter they play unless they pick another */
  char: CharacterId;
}

/** The map and fighter select before a match, sent when it opens and on every vote. */
export interface SelectView {
  mode: MatchMode;
  endsAt: number;
  you: 0 | 1;
  sides: [SelectSide, SelectSide];
  /** arena ids, in menu order */
  maps: string[];
  votes: { map: [string | null, string | null]; char: [CharacterId | null, CharacterId | null] };
}

/** A dueling ring in the lobby, and the duel in it if there is one. */
export interface RingView {
  /** index into the map's rings */
  i: number;
  /** open: anyone can walk in. countdown/fight: sealed around the two duelists. over: the result, before it opens */
  state: 'open' | 'countdown' | 'fight' | 'over';
  a?: string;
  b?: string;
  /** the duelists' names */
  an?: string;
  bn?: string;
  /** when this state ends (server ms) */
  until?: number;
  /** who won ('' for a draw), once it's over */
  w?: string;
}

export type ServerMsg =
  | { t: 'welcome'; id: string; token: string; profile: ProfileView; online: number; serverTime: number }
  | { t: 'pong'; c: number; s: number }
  | { t: 'sping'; s: number }
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
  | { t: 'reject'; a: InputAction; q?: number }
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
      /** coins earned, and what the ad that plays next pays when it's watched to the end */
      coins?: number;
      ad?: number;
    }
  | { t: 'profile'; profile: ProfileView }
  | { t: 'leaderboard'; entries: LeaderboardEntry[]; you: number | null; total: number }
  /** ring: the duel would be fought in this lobby ring, where you both stand */
  | { t: 'challenge'; from: string; name: string; char: CharacterId; expires: number; ring?: number }
  | { t: 'notice'; text: string; kind?: 'info' | 'warn' | 'good' }
  | { t: 'chat'; name: string; text: string; sys?: boolean }
  | { t: 'feed'; killer: string; victim: string; how: string }
  | { t: 'online'; n: number }
  /** which lobby you're in (public ones numbered from 1; a private one has its code) and how full it is */
  | { t: 'lobby'; n: number; count: number; cap: number; code?: string }
  | { t: 'rings'; r: RingView[] }
  | ({ t: 'select' } & SelectView)
  /** the select closed without a match (the other side left) */
  | { t: 'selectCancel'; reason: string }
  /** coins just came in */
  | { t: 'coins'; gained: number; why: 'match' | 'matchAd' | 'ad' | 'tutorial' }
  /** a fighter or arena is yours now */
  | { t: 'unlocked'; kind: 'char' | 'map'; id: string; free: boolean }
  /** where the tutorial is: the step, how far through it (n of need), and a note on the last try */
  | { t: 'tutorial'; step: TutorialStep; n: number; need: number; note?: TutorialNote };

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
  if (f.specialReadyAt > 0) s.sr = Math.round(f.specialReadyAt);
  if (f.state === 'attack' && f.attackKey) {
    s.a = f.attackKey;
    s.aw = f.atkWindup;
    if (f.aim) s.am = [round2(f.aim.x), round2(f.aim.z)];
  }
  return s;
}
