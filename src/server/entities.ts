/** Server-side wrappers: a connected human (Player) and a simulated fighter (ServerFighter). */
import { CharacterId } from '../shared/characters';
import { HIT_CONFIRM_SLACK_MS, INTEREST, MAX_LAG_COMP_MS } from '../shared/config';
import { PLACEMENT_MATCHES } from '../shared/ranks';
import { Fighter, DefenseEvent } from '../shared/fighter';
import { BotDifficulty, QueueMode, RosterEntry, ServerMsg } from '../shared/protocol';
import type { Brain } from './bot';
import type { Instance } from './instance';
import { Profile } from './store';

/** The subset of a WebSocket the server uses (satisfied by `ws`, and by the in-browser offline socket). */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', cb: (data: unknown) => void): unknown;
  on(event: 'close' | 'error', cb: () => void): unknown;
}

export class ServerFighter extends Fighter {
  name: string;
  owner: Player | null = null;
  brain: Brain | null = null;
  dummy: 'passive' | 'sparring' | undefined;
  /** Rating of an AI opponent in a rated (offline ranked) match. */
  rating: number | undefined;

  /** Defensive timeline used for lag-compensated hit resolution. */
  log: DefenseEvent[] = [];
  /** Which defenders the current attack already hit (and how many times, for multi-hit attacks). */
  hitRecord = new Map<string, number>();
  hitSerial = -1;

  /** Position epoch: bumped on every server-side teleport so stale client positions are ignored. */
  epoch = 0;
  lastMoveAt = 0;
  /** Extra movement distance tolerated after shoves, dashes and lunges the server knows about. */
  moveAllowance = 0;
  /** Token bucket for ordinary movement: refills at the state's max speed, caps short bursts. */
  moveBudget = 3;
  /** Last time the server accepted a jump or leap (allows reported height above the floor). */
  lastAirAt = -Infinity;
  /** Set when a hit interrupted this fighter's attack: later hits from that attack are void. */
  interrupt: { serial: number; t: number } | null = null;
  /** A knockback slide in progress (server-moved fighters; players replay their own). */
  knock: { dx: number; dz: number; t0: number; dur: number; done: number } | null = null;
  /** which far-snapshot turn this fighter goes out on (see Instance.sendByInterest) */
  readonly slot = Math.floor(Math.random() * INTEREST.farEvery);

  respawnAt = 0;
  spawnProtectedUntil = 0;
  lastSig = '';
  lastHazardFx = 0;
  lastAttackerId: string | null = null;

  /** Bot locomotion intent. */
  moveX = 0;
  moveZ = 0;
  wantYaw: number | null = null;

  constructor(id: string, name: string, charId: CharacterId) {
    super(id, charId);
    this.name = name;
  }

  isHuman(): boolean {
    return this.owner !== null;
  }

  roster(): RosterEntry {
    const e: RosterEntry = { id: this.id, name: this.name, char: this.char.id };
    if (this.owner) {
      e.mmr = this.owner.profile.mmr;
      e.placements = this.owner.profile.placements;
    } else {
      e.bot = true;
      if (this.dummy) e.dummy = this.dummy;
      if (this.rating !== undefined) {
        e.mmr = this.rating;
        e.placements = PLACEMENT_MATCHES;
      }
    }
    return e;
  }

  /** How long to wait before finalising a hit on this fighter, so their in-flight defensive inputs can arrive. */
  hitGrace(): number {
    if (!this.owner) return 0;
    return Math.min(MAX_LAG_COMP_MS, this.owner.oneWay() + HIT_CONFIRM_SLACK_MS);
  }
}

export class Player {
  readonly id: string;
  readonly ws: SocketLike;
  profile: Profile;
  charId: CharacterId;
  fighter: ServerFighter | null = null;
  instance: Instance | null = null;
  /** Round-trip time measured by the server (never trusted from the client). */
  rtt = 100;
  lastPingS = 0;
  queue: { mode: QueueMode; since: number; diff?: BotDifficulty } | null = null;
  lastChatAt = 0;
  msgWindowStart = 0;
  msgCount = 0;
  closed = false;
  /** the last match's ad pays if it's watched before this (server ms) */
  matchAdUntil = 0;
  /** when an ad last paid out (server ms) */
  lastAdAt = -Infinity;

  constructor(ws: SocketLike, profile: Profile, charId: CharacterId) {
    this.id = profile.id;
    this.ws = ws;
    this.profile = profile;
    this.charId = charId;
  }

  get name(): string {
    return this.profile.name;
  }

  oneWay(): number {
    return Math.max(0, Math.min(MAX_LAG_COMP_MS, this.rtt / 2));
  }

  send(msg: ServerMsg): void {
    if (this.closed || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(msg));
  }

  sendRaw(data: string): void {
    if (this.closed || this.ws.readyState !== 1) return;
    this.ws.send(data);
  }
}
