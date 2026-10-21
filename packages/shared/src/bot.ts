import { PARRY_WINDOW } from './constants.ts';
import type { FighterState } from './fighter.ts';
import { BTN, type InputFrame } from './input.ts';
import type { Match, Side } from './match.ts';
import { Rng } from './rng.ts';
import { HEAVY_CHAIN, LIGHT_CHAIN, WEAPONS, type MoveId } from './weapons.ts';

/** Moves with long enough recovery that blocking one leaves a punish. */
const PUNISHABLE: readonly MoveId[] = ['L3', 'H1', 'H2', 'H3', 'DH', 'BH'];

export type BotLevel = 'dummy' | 'easy' | 'normal' | 'hard';

interface Profile {
  /** Ticks between something happening and the bot reacting to it. */
  reaction: number;
  parry: number;
  block: number;
  dodge: number;
  /** Rough attacks per second when in range. */
  aggression: number;
  chain: number;
  heavy: number;
  crit: number;
}

const PROFILES: Record<Exclude<BotLevel, 'dummy'>, Profile> = {
  easy: { reaction: 22, parry: 0.12, block: 0.35, dodge: 0.2, aggression: 0.6, chain: 0.45, heavy: 0.2, crit: 0.05 },
  normal: { reaction: 15, parry: 0.32, block: 0.5, dodge: 0.45, aggression: 1.0, chain: 0.7, heavy: 0.25, crit: 0.1 },
  hard: { reaction: 11, parry: 0.55, block: 0.55, dodge: 0.65, aggression: 1.4, chain: 0.85, heavy: 0.3, crit: 0.14 },
};

interface Seen {
  state: FighterState;
  frame: number;
  move: MoveId | null;
}

/** A simple reactive opponent. It only sees the other fighter `reaction` ticks late. */
export class Bot {
  private readonly rng: Rng;
  private readonly seen: Seen[] = [];
  private holds = new Map<number, number>();
  private nextAttack = 0;
  private strafe = 0;
  private strafeUntil = 0;
  private decidedAttack = '';
  private decidedChain = '';
  private blockUntil = 0;
  private nextDummyCrit = 300;
  private gapDecided = -1;
  private guardDecideAt = 0;
  private swingSeen = '';
  private openingSeen = '';
  private punishing = false;

  constructor(
    readonly side: Side,
    readonly level: BotLevel,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  think(match: Match): InputFrame {
    const me = match.fighters[this.side];
    const op = match.fighters[this.side === 0 ? 1 : 0];
    const tick = match.tick;
    this.seen.push({ state: op.state, frame: op.stateFrame, move: op.move });
    if (this.seen.length > 40) this.seen.shift();

    let pressed = 0;
    let moveX = 0;
    let moveY = 0;
    const press = (btn: number, holdTicks = 0) => {
      pressed |= btn;
      if (holdTicks > 0) this.hold(btn, tick + holdTicks);
    };

    const dist = Math.hypot(op.x - me.x, op.z - me.z);
    const free = me.state === 'idle' || me.state === 'block' || me.state === 'blockRelease';

    if (match.phase === 'fight') {
      if (this.level === 'dummy') {
        this.thinkDummy(match, dist, press);
      } else {
        const p = PROFILES[this.level];
        const view = this.seen[Math.max(0, this.seen.length - 1 - p.reaction)]!;
        const busy =
          this.punish(match, p, view, dist, press) || this.defend(match, p, view, dist, press) || this.guard(match, p, view, dist, press);
        if (!busy) {
          [moveX, moveY] = this.position(tick, dist, Math.max(1.2, WEAPONS[me.weapon].moves.L1.range - 0.4));
          this.attack(match, p, view, dist, free, press);
        }
        if (me.state === 'knockdown' && me.stateFrame > 50) moveX = this.rng.pick([-1, 0, 1]);
      }
    }

    let held = pressed;
    for (const [btn, until] of this.holds) {
      if (until > tick) held |= btn;
      else this.holds.delete(btn);
    }
    return { moveX, moveY, held, pressed };
  }

  /** Holds a button without a fresh press, e.g. blocking without opening a parry window. */
  private hold(btn: number, until: number): void {
    this.holds.set(btn, Math.max(until, this.holds.get(btn) ?? 0));
  }

  private thinkDummy(match: Match, dist: number, press: (btn: number, hold?: number) => void): void {
    const me = match.fighters[this.side];
    const tick = match.tick;
    // After a few clean hits the dummy turtles up, so you can see posture break.
    if (me.comboCount >= 3) this.blockUntil = tick + 150;
    if (this.blockUntil > tick) this.hold(BTN.PARRY, tick + 2);
    // Every few seconds it throws a slow critical so you can practice parrying the glow.
    if (tick >= this.nextDummyCrit && dist < 4.5 && me.state === 'idle' && me.critCooldown === 0) {
      press(BTN.HEAVY, 24);
      this.nextDummyCrit = tick + 420;
    }
  }

  private defend(
    match: Match,
    p: Profile,
    view: Seen,
    dist: number,
    press: (btn: number, hold?: number) => void,
  ): boolean {
    const me = match.fighters[this.side];
    const op = match.fighters[this.side === 0 ? 1 : 0];
    if (view.state !== 'attack' || !view.move) return false;
    const m = WEAPONS[op.weapon].moves[view.move];
    const id = `${view.move}@${match.tick - view.frame}`;
    if (this.decidedAttack === id) return this.blockUntil > match.tick;
    if (dist > m.range + m.lunge + 0.8) return false;

    const toActive = m.startup - view.frame - p.reaction;
    if (toActive < -m.active) return false;
    const canAct = me.state === 'idle' || me.state === 'block' || me.state === 'blockRelease';
    if (!canAct) return false;
    this.decidedAttack = id;

    const roll = this.rng.next();
    if (toActive >= 0 && toActive <= PARRY_WINDOW - 2 && roll < p.parry) {
      // Parry, then keep holding so a mistimed parry still blocks.
      press(BTN.PARRY, m.unblockable ? 0 : toActive + m.active + 8);
      return true;
    }
    if (m.unblockable || me.posture > 75) {
      if (toActive >= 2 && roll < p.parry + p.dodge) {
        press(BTN.DODGE);
        return true;
      }
      return false;
    }
    if (roll < p.parry + p.block) {
      this.blockUntil = match.tick + Math.max(6, toActive + m.active + 8);
      this.hold(BTN.PARRY, this.blockUntil);
      return true;
    }
    return false;
  }

  /**
   * Openings the bot made itself need no seeing: a stagger from its parry, a guard break, or the
   * long recovery of a heavy or string finisher it just blocked (known from frame data, the way a
   * player knows a blocked heavy is punishable). Whiffed parries and get-ups have to be seen.
   */
  private punish(match: Match, p: Profile, view: Seen, dist: number, press: (btn: number, hold?: number) => void): boolean {
    const me = match.fighters[this.side];
    const op = match.fighters[this.side === 0 ? 1 : 0];
    if (dist > WEAPONS[me.weapon].moves.L1.range + 0.4) return false;
    const canSoon = me.state === 'idle' || me.state === 'block' || me.state === 'blockRelease' || me.state === 'blockstun';
    if (!canSoon) return false;
    let opening = false;
    if (op.state === 'attack') {
      // Mid-swing is only an opening if it's a heavy or finisher we just blocked, with time to spare.
      const m = op.move ? WEAPONS[op.weapon].moves[op.move] : null;
      if (m && op.moveContact === 'block' && op.move && PUNISHABLE.includes(op.move)) {
        const left = m.startup + m.active + m.recovery - op.stateFrame;
        const myLeft = me.state === 'blockstun' ? me.stateLen - me.stateFrame : 0;
        opening = left - myLeft > WEAPONS[me.weapon].moves.L1.startup;
      }
    } else {
      opening = op.state === 'stagger' || op.state === 'guardbreak' || view.state === 'parryWhiff' || view.state === 'getup';
    }
    if (!opening) return false;
    // One decision per opening, so a bot that lets one go doesn't re-roll every tick.
    const id = `${op.state}${op.move ?? ''}@${match.tick - op.stateFrame}`;
    if (id !== this.openingSeen) {
      this.openingSeen = id;
      this.punishing = this.rng.chance(0.35 + p.parry);
    }
    if (!this.punishing) return false;
    this.holds.delete(BTN.PARRY);
    this.blockUntil = 0;
    press(op.state === 'guardbreak' ? BTN.HEAVY : BTN.LIGHT);
    this.nextAttack = match.tick + 20;
    return true;
  }

  /**
   * Lights start faster than any reaction, so defending them is reading, not reacting: raise guard
   * up close now and then, and parry into the gap a blocked string leaves before its next hit.
   */
  private guard(match: Match, p: Profile, view: Seen, dist: number, press: (btn: number, hold?: number) => void): boolean {
    const me = match.fighters[this.side];
    const op = match.fighters[this.side === 0 ? 1 : 0];
    const tick = match.tick;

    if (me.state === 'blockstun') {
      const started = tick - me.stateFrame;
      if (me.stateLen - me.stateFrame <= 3 && this.gapDecided !== started) {
        this.gapDecided = started;
        const chaining = view.state === 'attack' && !!view.move && LIGHT_CHAIN.includes(view.move) && view.move !== 'L3';
        if (chaining && this.rng.chance(p.parry * 1.2)) {
          // Buffered through the last frames of blockstun; holding on means a misread still blocks.
          press(BTN.PARRY, 16);
          this.blockUntil = tick + 16;
        } else if (this.rng.chance(p.block)) {
          this.blockUntil = tick + 14;
          this.hold(BTN.PARRY, this.blockUntil);
        }
      }
      return true;
    }

    const reach = WEAPONS[op.weapon].moves.L1.range + 0.5;
    const free = me.state === 'idle' || me.state === 'block' || me.state === 'blockRelease';
    // A swing already underway is too late to react to, but the rest of its string isn't.
    const swing = view.state === 'attack' && view.move ? `${view.move}@${tick - view.frame}` : '';
    if (free && swing && swing !== this.swingSeen && dist < reach + 0.5) {
      this.swingSeen = swing;
      if (this.rng.chance(p.block)) {
        this.blockUntil = Math.max(this.blockUntil, tick + 24);
        this.hold(BTN.PARRY, this.blockUntil);
      }
    }
    if (free && dist < reach && tick >= this.guardDecideAt && tick >= this.blockUntil) {
      this.guardDecideAt = tick + this.rng.int(18, 40);
      if (this.rng.chance(p.block * 0.45)) {
        this.blockUntil = tick + this.rng.int(16, 34);
        this.hold(BTN.PARRY, this.blockUntil);
      }
    }
    return this.blockUntil > tick && me.state !== 'attack';
  }

  private position(tick: number, dist: number, want: number): [number, number] {
    if (tick >= this.strafeUntil) {
      this.strafe = this.rng.pick([-1, -0.6, 0, 0, 0.6, 1]);
      this.strafeUntil = tick + this.rng.int(40, 110);
    }
    let moveY = 0;
    if (dist > want + 0.4) moveY = 1;
    else if (dist < want - 1.2) moveY = -0.7;
    return [this.strafe * (dist < want + 1.5 ? 0.6 : 0.3), moveY];
  }

  private attack(
    match: Match,
    p: Profile,
    view: Seen,
    dist: number,
    free: boolean,
    press: (btn: number, hold?: number) => void,
  ): void {
    const me = match.fighters[this.side];
    const moves = WEAPONS[me.weapon].moves;
    const tick = match.tick;

    // Keep a string going once it connects.
    const inLight = !!me.move && LIGHT_CHAIN.includes(me.move);
    const inHeavy = !!me.move && HEAVY_CHAIN.includes(me.move);
    if (me.state === 'attack' && me.move && (inLight || inHeavy) && me.moveContact) {
      const id = `${me.move}@${tick - me.stateFrame}`;
      const m = moves[me.move];
      if (this.decidedChain !== id && me.stateFrame >= m.startup + m.active) {
        this.decidedChain = id;
        if (inLight && this.rng.chance(p.chain)) {
          press(me.moveContact === 'hit' && me.move === 'L2' && this.rng.chance(p.heavy) ? BTN.HEAVY : BTN.LIGHT);
        } else if (inHeavy && me.moveContact === 'hit' && this.rng.chance(p.chain * 0.6)) {
          press(BTN.HEAVY);
        }
      }
      return;
    }

    if (!free || dist > moves.L1.range + 0.2) return;
    // Starting a swing into one already coming loses the trade.
    if (view.state === 'attack' && view.move && view.frame < WEAPONS[match.fighters[this.side === 0 ? 1 : 0].weapon].moves[view.move].startup + 2) return;
    if (tick < this.nextAttack) return;
    this.nextAttack = tick + Math.round(this.rng.range(30, 75) / p.aggression);

    const opBlocking = view.state === 'block' || view.state === 'blockstun';
    const roll = this.rng.next();
    if (me.critCooldown === 0 && roll < p.crit) press(BTN.HEAVY, 22);
    else if (roll < p.crit + p.heavy + (opBlocking ? 0.25 : 0)) press(BTN.HEAVY);
    else press(BTN.LIGHT);
  }
}
