/** Server-side wrappers: a connected human (Player) and a simulated fighter (ServerFighter). */
import type { WebSocket } from 'ws';
import { CharacterId } from '../shared/characters';
import { HIT_CONFIRM_SLACK_MS, MAX_LAG_COMP_MS } from '../shared/config';
import { Fighter, DefenseEvent } from '../shared/fighter';
import { BotDifficulty, QueueMode, RosterEntry, ServerMsg } from '../shared/protocol';
import type { BotBrain } from './bot';
import type { Instance } from './instance';
import { Profile } from './store';

export class ServerFighter extends Fighter {
  name: string;
  owner: Player | null = null;
  brain: BotBrain | null = null;
  dummy: 'passive' | 'sparring' | undefined;

  /** Defensive timeline used for lag-compensated hit resolution. */
  log: DefenseEvent[] = [];
  /** Which defenders the current attack already hit (and how many times, for multi-hit attacks). */
  hitRecord = new Map<string, number>();
  hitSerial = -1;

  /** Position epoch: bumped on every server-side teleport so stale client positions are ignored. */
  epoch = 0;
  lastMoveAt = 0;
  /** Extra movement distance tolerated after the server shoved the fighter. */
  moveAllowance = 0;

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
  readonly ws: WebSocket;
  profile: Profile;
  charId: CharacterId;
  fighter: ServerFighter | null = null;
  instance: Instance | null = null;
  rtt = 80;
  queue: { mode: QueueMode; since: number; diff?: BotDifficulty } | null = null;
  lastChatAt = 0;
  msgWindowStart = 0;
  msgCount = 0;
  closed = false;

  constructor(ws: WebSocket, profile: Profile, charId: CharacterId) {
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
