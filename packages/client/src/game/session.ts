import {
  BUTTON_COUNT,
  Bot,
  Match,
  NO_INPUT,
  SNAPSHOT_EVERY,
  TICK_MS,
  applySnapshot,
  isGlowing,
  isInvulnerable,
  type BotLevel,
  type Fighter,
  type InputFrame,
  type MatchSnapshot,
  type Side,
  type SimEvent,
  type WeaponId,
} from '@nfg/shared';
import type { InputManager } from '../input/input.ts';
import type { NetClient } from '../net/client.ts';
import type { FighterRenderState } from '../render/fighter-visual.ts';

const TICK = TICK_MS / 1000;

interface Pos {
  x: number;
  y: number;
  z: number;
  facing: number;
}

function posOf(f: Fighter): Pos {
  return { x: f.x, y: f.y, z: f.z, facing: f.facing };
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  d = ((((d + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

function toRender(f: Fighter, prev: Pos, t: number, frameAdvance: number): FighterRenderState {
  return {
    x: prev.x + (f.x - prev.x) * t,
    y: prev.y + (f.y - prev.y) * t,
    z: prev.z + (f.z - prev.z) * t,
    facing: lerpAngle(prev.facing, f.facing, t),
    weapon: f.weapon,
    state: f.state,
    frame: f.stateFrame + frameAdvance,
    move: f.move,
    moveX: f.moveX,
    moveY: f.moveY,
    dodgeX: f.dodgeX,
    dodgeZ: f.dodgeZ,
    rollDir: f.rollDir,
    glowing: isGlowing(f),
    invulnerable: isInvulnerable(f),
    parryWindow: f.state === 'parry',
  };
}

export interface Session {
  readonly match: Match;
  readonly you: Side;
  readonly ping: number | null;
  /** Advances by real seconds and returns what happened. */
  advance(dt: number): SimEvent[];
  renderState(side: Side): FighterRenderState;
  dispose(): void;
}

/** Runs the simulation in the browser against a bot (practice dummy or bot match). */
export class LocalSession implements Session {
  readonly match: Match;
  readonly you: Side = 0;
  readonly ping = null;
  private readonly bot: Bot;
  private acc = 0;
  private prev: [Pos, Pos];

  constructor(
    cfg: { weapons: [WeaponId, WeaponId]; practice: boolean; bot: BotLevel; seed: number },
    private readonly input: InputManager,
    private readonly inputEnabled: () => boolean,
  ) {
    this.match = new Match({ weapons: cfg.weapons, practice: cfg.practice });
    this.bot = new Bot(1, cfg.bot, cfg.seed);
    this.prev = [posOf(this.match.fighters[0]), posOf(this.match.fighters[1])];
  }

  advance(dt: number): SimEvent[] {
    this.acc += Math.min(dt, 0.25);
    const events: SimEvent[] = [];
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.prev = [posOf(this.match.fighters[0]), posOf(this.match.fighters[1])];
      let mine: InputFrame = NO_INPUT;
      if (this.inputEnabled()) mine = this.input.sample();
      else this.input.flush();
      const theirs = this.bot.think(this.match);
      events.push(...this.match.step([mine, theirs]));
    }
    return events;
  }

  renderState(side: Side): FighterRenderState {
    const t = this.acc / TICK;
    return toRender(this.match.fighters[side], this.prev[side], t, this.match.hitstop > 0 ? 0 : t);
  }

  dispose(): void {}
}

/** Mirrors the server's authoritative match and streams our inputs to it. */
export class OnlineSession implements Session {
  readonly match: Match;
  private acc = 0;
  private seq = 0;
  /** Presses made while gameplay input was live; menus never touch these. */
  private readonly counts = new Array<number>(BUTTON_COUNT).fill(0);
  private prev: [Pos, Pos];
  private snapAt = performance.now();
  private pending: SimEvent[] = [];
  private readonly unsubscribe: () => void;

  constructor(
    private readonly net: NetClient,
    readonly you: Side,
    weapons: [WeaponId, WeaponId],
    private readonly input: InputManager,
    private readonly inputEnabled: () => boolean,
  ) {
    this.match = new Match({ weapons });
    this.prev = [posOf(this.match.fighters[0]), posOf(this.match.fighters[1])];
    this.unsubscribe = net.onMessage((m) => {
      if (m.t === 'snap') this.onSnapshot(m.s, m.ev);
    });
  }

  get ping(): number | null {
    return this.net.rtt;
  }

  private onSnapshot(s: MatchSnapshot, ev: SimEvent[]): void {
    this.prev = [posOf(this.match.fighters[0]), posOf(this.match.fighters[1])];
    applySnapshot(this.match, s);
    this.snapAt = performance.now();
    this.pending.push(...ev);
  }

  advance(dt: number): SimEvent[] {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= TICK) {
      this.acc -= TICK;
      let i: InputFrame = NO_INPUT;
      if (this.inputEnabled()) i = this.input.sample();
      else this.input.flush();
      for (let b = 0; b < BUTTON_COUNT; b++) if (i.pressed & (1 << b)) this.counts[b]!++;
      this.net.send({ t: 'input', seq: ++this.seq, mx: i.moveX, my: i.moveY, held: i.held, counts: [...this.counts] });
    }
    const events = this.pending;
    this.pending = [];
    return events;
  }

  renderState(side: Side): FighterRenderState {
    const interval = SNAPSHOT_EVERY * TICK_MS;
    const since = performance.now() - this.snapAt;
    const t = Math.min(1, since / interval);
    // Advance animation frames between snapshots, but never far past what the server has confirmed.
    const advance = this.match.hitstop > 0 ? 0 : Math.min(since / TICK_MS, SNAPSHOT_EVERY * 1.5);
    return toRender(this.match.fighters[side], this.prev[side], t, advance);
  }

  dispose(): void {
    this.unsubscribe();
  }
}
