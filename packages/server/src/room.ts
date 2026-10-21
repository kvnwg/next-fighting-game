import {
  MAP_IDS,
  Match,
  PressCounter,
  SNAPSHOT_EVERY,
  TICK_MS,
  WEAPON_IDS,
  snapshotMatch,
  type ClientMessage,
  type InputFrame,
  type MapId,
  type PlayerInfo,
  type RoomPhase,
  type RoomState,
  type ServerMessage,
  type SimEvent,
  type WeaponId,
  type Winner,
} from '@nfg/shared';

/** Ticks to hold on the final KO before switching the room to results. */
const MATCH_END_HOLD = 120;
/** Most ticks simulated in one wake-up before dropping backlog. */
const MAX_CATCHUP = 5;
/** Pause between both players finishing loading and the entrances starting. */
const LOADED_PAUSE_MS = 500;

export interface LatestInput {
  seq: number;
  mx: number;
  my: number;
  held: number;
  counts: number[];
}

export interface Client {
  readonly id: string;
  player: PlayerInfo | null;
  room: Room | null;
  seat: 0 | 1;
  queued: boolean;
  input: LatestInput | null;
  lastSeq: number;
  appliedSeq: number;
  readonly presses: PressCounter;
  send(msg: ServerMessage): void;
}

export interface RoomTimings {
  voteMs: number;
  loadTimeoutMs: number;
  entranceMs: number;
  rematchWaitMs: number;
}

export interface RoomHost {
  readonly timings: RoomTimings;
  onClosed(room: Room): void;
  log(...args: unknown[]): void;
}

type Pair<T> = [T, T];

export class Room {
  phase: RoomPhase = 'waiting';
  readonly seats: Pair<Client | null> = [null, null];
  endsAt = 0;
  map: MapId | null = null;
  weapons: Pair<WeaponId | null> = [null, null];
  votes: { map: Pair<MapId | 'random' | null>; weapon: Pair<WeaponId | null> } = { map: [null, null], weapon: [null, null] };
  progress: Pair<number> = [0, 0];
  rematch: Pair<boolean> = [false, false];
  skips: Pair<boolean> = [false, false];
  winner: Winner = -1;
  match: Match | null = null;
  closed = false;

  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private acc = 0;
  private last = 0;
  private pending: SimEvent[] = [];
  private sinceSnap = 0;

  constructor(
    readonly roomId: string,
    readonly code: string,
    readonly isPrivate: boolean,
    private readonly host: RoomHost,
  ) {}

  get playerCount(): number {
    return (this.seats[0] ? 1 : 0) + (this.seats[1] ? 1 : 0);
  }

  isFull(): boolean {
    return this.playerCount === 2;
  }

  add(client: Client): boolean {
    if (this.closed) return false;
    const seat = this.seats[0] === null ? 0 : this.seats[1] === null ? 1 : -1;
    if (seat === -1) return false;
    this.seats[seat] = client;
    client.room = this;
    client.seat = seat;
    client.queued = false;
    client.input = null;
    client.appliedSeq = 0;
    client.presses.reset();
    this.rematch = [false, false];
    this.host.log(`room ${this.roomId} +${client.player?.name ?? client.id} seat ${seat}`);
    // A friend joining a private room that is still showing an old result starts fresh.
    if (this.isFull() && (this.phase === 'waiting' || this.phase === 'results')) this.startVote();
    else this.broadcastState();
    return true;
  }

  remove(client: Client): void {
    const seat = client.seat;
    if (this.seats[seat] !== client) return;
    this.seats[seat] = null;
    client.room = null;
    this.host.log(`room ${this.roomId} -${client.player?.name ?? client.id} (phase ${this.phase})`);
    const other = this.seats[seat === 0 ? 1 : 0];
    if (!other) {
      this.close();
      return;
    }
    other.send({ t: 'left', who: seat });
    if (this.phase === 'match') {
      // Whoever stays wins; private rooms fall back to waiting once results expire.
      this.toResults(other.seat);
    } else if (this.isPrivate) {
      this.toWaiting();
    } else {
      this.close();
    }
  }

  handle(client: Client, msg: ClientMessage): void {
    const seat = client.seat;
    if (this.seats[seat] !== client) return;
    switch (msg.t) {
      case 'vote':
        if (this.phase !== 'vote') return;
        if (msg.map) this.votes.map[seat] = msg.map;
        if (msg.weapon) this.votes.weapon[seat] = msg.weapon;
        this.broadcastState();
        break;
      case 'progress':
        this.onProgress(seat, msg.value);
        break;
      case 'skip':
        if (this.phase !== 'entrance') return;
        this.skips[seat] = true;
        if (this.skips[0] && this.skips[1]) this.startMatch();
        break;
      case 'rematch':
        this.onRematch(seat);
        break;
      default:
        break;
    }
  }

  stateFor(seat: 0 | 1): RoomState {
    return {
      roomId: this.roomId,
      code: this.code,
      isPrivate: this.isPrivate,
      phase: this.phase,
      players: this.seats.map((c) => c?.player ?? null),
      you: seat,
      endsAt: this.endsAt,
      map: this.map,
      weapons: [...this.weapons],
      votes: { map: [...this.votes.map], weapon: [...this.votes.weapon] },
      progress: [...this.progress],
      rematch: [...this.rematch],
      winner: this.winner,
    };
  }

  broadcastState(): void {
    const serverTime = Date.now();
    for (const c of this.seats) if (c) c.send({ t: 'room', room: this.stateFor(c.seat), serverTime });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearTimers();
    this.stopLoop();
    this.match = null;
    for (let i = 0; i < 2; i++) {
      const c = this.seats[i];
      if (c && c.room === this) {
        c.room = null;
        c.send({ t: 'closed' });
      }
      this.seats[i] = null;
    }
    this.host.log(`room ${this.roomId} closed`);
    this.host.onClosed(this);
  }

  // ---- phases -------------------------------------------------------------

  private setPhase(phase: RoomPhase, durationMs = 0): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    this.phase = phase;
    this.endsAt = durationMs > 0 ? Date.now() + durationMs : 0;
    if (durationMs > 0) this.phaseTimer = setTimeout(() => this.onDeadline(), durationMs);
    this.host.log(`room ${this.roomId} -> ${phase}`);
    this.broadcastState();
  }

  private onDeadline(): void {
    this.phaseTimer = null;
    if (this.closed) return;
    switch (this.phase) {
      case 'vote':
        this.resolveVote();
        this.startLoad();
        break;
      case 'load':
        this.startEntrance();
        break;
      case 'entrance':
        this.startMatch();
        break;
      case 'results':
        if (this.isPrivate) this.toWaiting();
        else this.close();
        break;
      default:
        break;
    }
  }

  private resetRound(): void {
    this.map = null;
    this.weapons = [null, null];
    this.votes = { map: [null, null], weapon: [null, null] };
    this.progress = [0, 0];
    this.rematch = [false, false];
    this.skips = [false, false];
    this.winner = -1;
  }

  private startVote(): void {
    this.clearTimers();
    this.stopLoop();
    this.match = null;
    this.resetRound();
    this.setPhase('vote', this.host.timings.voteMs);
  }

  private resolveVote(): void {
    const voted = this.votes.map.filter((m): m is MapId => m !== null && m !== 'random');
    if (voted.length > 0) {
      const tally = new Map<MapId, number>();
      for (const m of voted) tally.set(m, (tally.get(m) ?? 0) + 1);
      const best = Math.max(...tally.values());
      this.map = pick([...tally].filter(([, n]) => n === best).map(([m]) => m));
    } else {
      this.map = pick(MAP_IDS);
    }
    this.weapons = [this.votes.weapon[0] ?? pick(WEAPON_IDS), this.votes.weapon[1] ?? pick(WEAPON_IDS)];
  }

  private startLoad(): void {
    this.progress = [0, 0];
    this.setPhase('load', this.host.timings.loadTimeoutMs);
  }

  private onProgress(seat: 0 | 1, value: number): void {
    if (this.phase !== 'load') return;
    const prev = this.progress[seat];
    const next = Math.max(prev, value);
    if (next === prev) return;
    this.progress[seat] = next;
    // Throttle broadcasts to meaningful steps; always send completion.
    if (next >= 1 || next - prev >= 0.05 || Math.floor(next * 10) !== Math.floor(prev * 10)) this.broadcastState();
    if (this.progress[0] >= 1 && this.progress[1] >= 1 && !this.loadTimer) {
      this.loadTimer = setTimeout(() => {
        this.loadTimer = null;
        if (this.phase === 'load' && !this.closed) this.startEntrance();
      }, LOADED_PAUSE_MS);
    }
  }

  private startEntrance(): void {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = null;
    this.skips = [false, false];
    this.setPhase('entrance', this.host.timings.entranceMs * 2);
  }

  private startMatch(): void {
    if (this.phase !== 'entrance') return;
    const [w0, w1] = this.weapons;
    this.match = new Match({ weapons: [w0 ?? pick(WEAPON_IDS), w1 ?? pick(WEAPON_IDS)] });
    for (const c of this.seats) {
      if (!c) continue;
      // Presses made before the fight (menus, entrances) must not leak into it.
      c.presses.reset();
      if (c.input) c.presses.consume(c.input.counts);
      c.appliedSeq = c.input?.seq ?? 0;
    }
    this.setPhase('match');
    this.startLoop();
  }

  private toResults(winner: Winner): void {
    this.stopLoop();
    this.winner = winner;
    this.rematch = [false, false];
    this.setPhase('results', this.host.timings.rematchWaitMs);
  }

  private toWaiting(): void {
    this.clearTimers();
    this.stopLoop();
    this.match = null;
    this.resetRound();
    this.setPhase('waiting');
  }

  private onRematch(seat: 0 | 1): void {
    const allowed = this.phase === 'results' || (this.phase === 'waiting' && this.isFull());
    if (!allowed || this.rematch[seat]) return;
    this.rematch[seat] = true;
    if (this.isFull() && this.rematch[0] && this.rematch[1]) this.startVote();
    else this.broadcastState();
  }

  private clearTimers(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.phaseTimer = null;
    this.loadTimer = null;
  }

  // ---- simulation loop ----------------------------------------------------

  private startLoop(): void {
    this.stopLoop();
    this.acc = 0;
    this.last = performance.now();
    this.pending = [];
    this.sinceSnap = 0;
    const loop = () => {
      this.loopTimer = null;
      if (this.phase !== 'match' || !this.match || this.closed) return;
      const now = performance.now();
      this.acc += now - this.last;
      this.last = now;
      let steps = 0;
      while (this.acc >= TICK_MS && steps < MAX_CATCHUP) {
        this.acc -= TICK_MS;
        steps++;
        this.tick();
        if (this.phase !== 'match') return;
      }
      // If the process stalled, drop the backlog instead of fast-forwarding the fight.
      if (this.acc >= TICK_MS) this.acc = 0;
      this.loopTimer = setTimeout(loop, Math.max(1, TICK_MS - this.acc));
    };
    this.loopTimer = setTimeout(loop, TICK_MS);
  }

  private stopLoop(): void {
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = null;
  }

  private inputFor(seat: 0 | 1): InputFrame {
    const c = this.seats[seat];
    if (!c || !c.input) return { moveX: 0, moveY: 0, held: 0, pressed: 0 };
    const pressed = c.presses.consume(c.input.counts);
    c.appliedSeq = c.input.seq;
    return { moveX: c.input.mx, moveY: c.input.my, held: c.input.held, pressed };
  }

  private tick(): void {
    const m = this.match!;
    const events = m.step([this.inputFor(0), this.inputFor(1)]);
    if (events.length > 0) this.pending.push(...events);
    if (++this.sinceSnap >= SNAPSHOT_EVERY) this.sendSnapshot();
    if (m.phase === 'matchEnd' && m.phaseFrame >= MATCH_END_HOLD) {
      if (this.sinceSnap > 0) this.sendSnapshot();
      this.toResults(m.winner);
    }
  }

  private sendSnapshot(): void {
    const s = snapshotMatch(this.match!);
    const ev = this.pending;
    this.pending = [];
    this.sinceSnap = 0;
    for (const c of this.seats) if (c) c.send({ t: 'snap', s, ev, ack: c.appliedSeq });
  }
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}
