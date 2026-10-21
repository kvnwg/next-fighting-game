import * as C from './constants.ts';
import {
  createFighter,
  forwardOf,
  resetForRound,
  rightOf,
  yawTowards,
  type Fighter,
  type FighterState,
} from './fighter.ts';
import { BTN, NO_INPUT, clampMove, type InputFrame } from './input.ts';
import {
  HEAVY_CHAIN,
  LIGHT_CHAIN,
  WEAPONS,
  inRange,
  moveTotal,
  type CancelRule,
  type MoveData,
  type MoveId,
  type MoveKind,
  type WeaponClass,
  type WeaponId,
} from './weapons.ts';

export type MatchPhase = 'intro' | 'fight' | 'roundEnd' | 'matchEnd';
export type Side = 0 | 1;
export type Winner = -1 | 0 | 1;

interface Point {
  x: number;
  y: number;
  z: number;
}

export type SimEvent =
  | { type: 'roundIntro'; round: number }
  | { type: 'fight'; round: number }
  | { type: 'roundEnd'; round: number; winner: Winner; reason: 'ko' | 'time' }
  | { type: 'matchEnd'; winner: Winner }
  | { type: 'telegraph'; who: Side; move: MoveId }
  | { type: 'swing'; who: Side; move: MoveId; kind: MoveKind }
  | ({ type: 'hit'; attacker: Side; victim: Side; move: MoveId; kind: MoveKind; weaponClass: WeaponClass; damage: number; knockdown: boolean; bonus: boolean; ko: boolean } & Point)
  | ({ type: 'block'; attacker: Side; victim: Side; move: MoveId; weaponClass: WeaponClass } & Point)
  | ({ type: 'parry'; attacker: Side; victim: Side; move: MoveId } & Point)
  | ({ type: 'guardbreak'; attacker: Side; victim: Side; damage: number } & Point)
  | { type: 'parryStart'; who: Side }
  | { type: 'parryWhiff'; who: Side }
  | { type: 'dodge'; who: Side }
  | { type: 'jump'; who: Side }
  | { type: 'land'; who: Side }
  | { type: 'getup'; who: Side }
  | { type: 'ko'; who: Side };

export interface MatchConfig {
  weapons: [WeaponId, WeaponId];
  /** Practice: no rounds, no timer, nobody can be knocked out. */
  practice?: boolean;
}

/** Button priority when several go down on the same tick. */
const PRIORITY = [BTN.DODGE, BTN.PARRY, BTN.SPECIAL, BTN.ABILITY, BTN.HEAVY, BTN.LIGHT, BTN.JUMP];
const MAX_ROUNDS = 5;
/** States that hold off posture recovery: attacking, dodging and reeling from a hit. */
const POSTURE_BUSY = new Set<FighterState>(['attack', 'dodge', 'hitstun', 'blockstun', 'stagger', 'parryWhiff']);
const KNOCKBACK_DECAY = 0.85;
const KNOCKBACK_SPEED = 9;
const DODGE_WEIGHT_SUM = (C.DODGE_MOVE_FRAMES * (C.DODGE_MOVE_FRAMES + 1)) / 2;

type Outcome = 'hit' | 'block' | 'parry' | 'counter' | 'armor';

interface PendingHit {
  attacker: Fighter;
  victim: Fighter;
  move: MoveData;
  outcome: Outcome;
}

export function moveOf(f: Fighter): MoveData | null {
  return f.move ? WEAPONS[f.weapon].moves[f.move] : null;
}

export function isInvulnerable(f: Fighter): boolean {
  switch (f.state) {
    case 'dodge':
      return f.stateFrame >= C.DODGE_IFRAME_START && f.stateFrame <= C.DODGE_IFRAME_END;
    case 'getup':
      return f.stateFrame < C.WAKE_INVULN || (f.rollDir !== 0 && f.stateFrame < 14);
    case 'knockdown':
    case 'ko':
      return true;
    default:
      return false;
  }
}

/** True while a critical attack is showing its white glow. */
export function isGlowing(f: Fighter): boolean {
  const m = moveOf(f);
  if (!m || f.state !== 'attack' || m.glow === 0) return false;
  return f.stateFrame >= m.startup - m.glow && f.stateFrame < m.startup + m.active;
}

export function comboScale(comboCount: number): number {
  return Math.max(C.COMBO_SCALING_FLOOR, 1 - C.COMBO_SCALING_STEP * comboCount);
}

export class Match {
  readonly practice: boolean;
  readonly fighters: [Fighter, Fighter];
  tick = 0;
  phase: MatchPhase;
  phaseFrame = 0;
  round = 1;
  timer = C.ROUND_TIME;
  hitstop = 0;
  roundWinner: Winner = -1;
  winner: Winner = -1;
  private events: SimEvent[] = [];

  constructor(cfg: MatchConfig) {
    this.practice = cfg.practice ?? false;
    this.fighters = [createFighter(0, cfg.weapons[0]), createFighter(1, cfg.weapons[1])];
    this.phase = this.practice ? 'fight' : 'intro';
  }

  /** Advances one 60 Hz tick and returns what happened during it. */
  step(inputs: readonly [InputFrame, InputFrame]): SimEvent[] {
    this.events = [];
    this.tick++;
    switch (this.phase) {
      case 'intro':
        if (this.phaseFrame === 0) this.emit({ type: 'roundIntro', round: this.round });
        this.phaseFrame++;
        this.simulate([NO_INPUT, NO_INPUT]);
        if (this.phaseFrame >= C.ROUND_INTRO_FRAMES) {
          this.phase = 'fight';
          this.phaseFrame = 0;
          this.emit({ type: 'fight', round: this.round });
        }
        break;
      case 'fight':
        this.phaseFrame++;
        this.simulate(inputs);
        if (!this.practice && this.hitstop === 0) this.timer = Math.max(0, this.timer - 1);
        this.checkRoundEnd();
        break;
      case 'roundEnd':
        this.phaseFrame++;
        this.simulate([NO_INPUT, NO_INPUT]);
        if (this.phaseFrame >= C.ROUND_END_FRAMES) this.finishRound();
        break;
      case 'matchEnd':
        this.phaseFrame++;
        this.simulate([NO_INPUT, NO_INPUT]);
        break;
    }
    return this.events;
  }

  private emit(e: SimEvent): void {
    this.events.push(e);
  }

  private simulate(inputs: readonly [InputFrame, InputFrame]): void {
    const [a, b] = this.fighters;
    this.bufferPresses(a, inputs[0]);
    this.bufferPresses(b, inputs[1]);
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }
    this.updateFighter(a, b, inputs[0]);
    this.updateFighter(b, a, inputs[1]);
    this.separate();
    this.resolveHits();
  }

  private bufferPresses(f: Fighter, input: InputFrame): void {
    if (!input.pressed) return;
    for (const btn of PRIORITY) {
      if (input.pressed & btn) {
        f.buffer = btn;
        f.bufferAge = 0;
        return;
      }
    }
  }

  private enter(f: Fighter, state: FighterState, len = 0): void {
    if (f.state === 'guardbreak' && state !== 'guardbreak') {
      // However the stagger ends (timeout or a punish), the guard comes back partly rebuilt.
      f.posture = C.GUARD_BREAK_POSTURE_RESET;
      f.guardBreakBonus = false;
    }
    f.state = state;
    f.stateFrame = 0;
    f.stateLen = len;
    if (state !== 'attack') {
      f.move = null;
      f.moveContact = null;
      f.moveDone = false;
      f.moveHits = 0;
    }
  }

  private updateFighter(f: Fighter, o: Fighter, input: InputFrame): void {
    this.tickTimers(f);

    f.stateFrame++;
    if (f.stateLen > 0 && f.stateFrame >= f.stateLen) this.onStateEnd(f, input);
    if (f.state === 'block' && !(input.held & BTN.PARRY)) this.enter(f, 'blockRelease', C.BLOCK_RELEASE_RECOVERY);

    if (f.state === 'attack') this.updateAttack(f, input);
    this.consumeBuffer(f, o, input);

    if (f.state !== 'hitstun' && f.state !== 'knockdown' && f.state !== 'guardbreak') f.comboCount = 0;

    this.move(f, o, input);
    this.updateFacing(f, o);
    this.applyVertical(f);
    this.clampToArena(f);
  }

  private tickTimers(f: Fighter): void {
    if (f.dodgeCharges < C.DODGE_CHARGES && --f.dodgeRecharge <= 0) {
      f.dodgeCharges++;
      f.dodgeRecharge = C.DODGE_RECHARGE;
    }
    if (f.critCooldown > 0) f.critCooldown--;
    if (f.dashWindow > 0) f.dashWindow--;
    if (f.buffer && ++f.bufferAge > C.INPUT_BUFFER) f.buffer = 0;

    if (f.state === 'guardbreak') return;
    if (POSTURE_BUSY.has(f.state)) {
      f.postureDelay = Math.max(f.postureDelay, C.POSTURE_CALM_DELAY);
    } else if (f.postureDelay > 0) {
      f.postureDelay--;
    } else if (f.posture > 0) {
      const scale = f.state === 'idle' ? C.POSTURE_REGEN_IDLE_SCALE : 1;
      f.posture = Math.max(0, f.posture - C.POSTURE_REGEN * scale);
    }
  }

  private onStateEnd(f: Fighter, input: InputFrame): void {
    const guarding = (input.held & BTN.PARRY) !== 0;
    switch (f.state) {
      case 'parry':
        if (guarding) {
          this.enter(f, 'block');
        } else {
          this.enter(f, 'parryWhiff', C.PARRY_WHIFF_RECOVERY);
          this.emit({ type: 'parryWhiff', who: f.id });
        }
        break;
      case 'blockstun':
        this.enter(f, guarding ? 'block' : 'idle');
        break;
      case 'knockdown':
        this.enter(f, 'getup', C.GETUP_FRAMES);
        f.rollDir = Math.abs(input.moveX) > 0.5 ? Math.sign(input.moveX) : 0;
        this.emit({ type: 'getup', who: f.id });
        break;
      case 'hitstun':
        // A launched fighter stays in hitstun until they land.
        if (f.y > 0.05) f.stateLen++;
        else this.enter(f, 'idle');
        break;
      default:
        // An air attack that finishes before landing falls the rest of the way.
        this.enter(f, f.y > 0.05 ? 'jump' : 'idle');
    }
  }

  private updateAttack(f: Fighter, input: InputFrame): void {
    let m = moveOf(f)!;
    // Holding HEAVY past the charge point turns it into a critical.
    if (m.id === 'H1' && f.stateFrame === C.CRIT_HOLD_FRAMES && input.held & BTN.HEAVY && f.critCooldown === 0) {
      f.move = 'C';
      m = moveOf(f)!;
      f.stateLen = moveTotal(m);
      f.critCooldown = C.CRIT_COOLDOWN;
    }
    if (m.glow > 0 && f.stateFrame === m.startup - m.glow) this.emit({ type: 'telegraph', who: f.id, move: m.id });
    if (f.stateFrame === m.startup) this.emit({ type: 'swing', who: f.id, move: m.id, kind: m.kind });
  }

  private consumeBuffer(f: Fighter, o: Fighter, input: InputFrame): void {
    if (f.buffer && this.perform(f, o, f.buffer, input)) {
      f.buffer = 0;
      return;
    }
    // Holding guard without a fresh press blocks, but never opens a parry window.
    if (f.state === 'idle' && input.held & BTN.PARRY) this.enter(f, 'block');
  }

  private perform(f: Fighter, o: Fighter, btn: number, input: InputFrame): boolean {
    const free = f.state === 'idle' || f.state === 'block' || f.state === 'blockRelease';
    switch (btn) {
      case BTN.LIGHT:
      case BTN.HEAVY: {
        const light = btn === BTN.LIGHT;
        if (f.state === 'jump') return light ? this.startAirAttack(f, o) : this.startPlunge(f, o);
        // Pressed in succession, each button walks its own chain.
        const next = this.nextInChain(f, light ? LIGHT_CHAIN : HEAVY_CHAIN);
        if (next) return this.startAttack(f, o, next);
        const dashing = f.dashWindow > 0 && (free || (f.state === 'dodge' && f.stateFrame >= C.DASH_CANCEL_FROM));
        if (dashing) {
          f.dashWindow = 0;
          return this.startAttack(f, o, light ? 'DL' : 'DH');
        }
        if (light) return free ? this.startAttack(f, o, input.moveY <= -C.BACK_ATTACK_THRESHOLD ? 'BL' : 'L1') : false;
        if (free && input.moveY <= -C.BACK_ATTACK_THRESHOLD) return this.startAttack(f, o, 'BH');
        return free || this.cancelOpen(f, 'H1') ? this.startAttack(f, o, 'H1') : false;
      }
      case BTN.PARRY:
        if (!free) return false;
        this.enter(f, 'parry', C.PARRY_WINDOW);
        this.emit({ type: 'parryStart', who: f.id });
        return true;
      case BTN.DODGE:
        if (f.dodgeCharges <= 0 || !(free || this.cancelOpen(f, 'dodge'))) return false;
        this.startDodge(f, input);
        return true;
      case BTN.JUMP:
        if (f.state !== 'idle' || f.y > 0) return false;
        this.enter(f, 'jump');
        f.vy = C.JUMP_VELOCITY;
        this.emit({ type: 'jump', who: f.id });
        return true;
      default:
        return false;
    }
  }

  private cancelRule(f: Fighter, into: MoveId | 'dodge'): CancelRule | undefined {
    const m = moveOf(f);
    if (!m || f.state !== 'attack') return undefined;
    return m.cancels.find(
      (r) =>
        r.into === into &&
        f.stateFrame >= r.from &&
        f.stateFrame <= r.to &&
        (!r.requires ||
          (r.requires === 'hit' ? f.moveContact === 'hit' : f.moveContact === 'hit' || f.moveContact === 'block')),
    );
  }

  private cancelOpen(f: Fighter, into: MoveId | 'dodge'): boolean {
    return this.cancelRule(f, into) !== undefined;
  }

  private nextInChain(f: Fighter, chain: readonly MoveId[]): MoveId | null {
    if (!f.move) return null;
    const i = chain.indexOf(f.move);
    if (i < 0 || i >= chain.length - 1) return null;
    const next = chain[i + 1]!;
    return this.cancelOpen(f, next) ? next : null;
  }

  private startAttack(f: Fighter, o: Fighter, id: MoveId): boolean {
    this.enter(f, 'attack', moveTotal(WEAPONS[f.weapon].moves[id]));
    f.move = id;
    f.moveContact = null;
    f.moveDone = false;
    f.moveHits = 0;
    f.facing = yawTowards(f.x, f.z, o.x, o.z);
    return true;
  }

  private startPlunge(f: Fighter, o: Fighter): boolean {
    if (f.y < 0.3) return false;
    this.startAttack(f, o, 'JH');
    f.vy = 0;
    return true;
  }

  /** A light in the air: the fighter keeps falling while it swings. */
  private startAirAttack(f: Fighter, o: Fighter): boolean {
    if (f.y < 0.3) return false;
    this.startAttack(f, o, 'JL');
    f.vy = Math.max(f.vy, 1.2);
    return true;
  }

  private startDodge(f: Fighter, input: InputFrame): void {
    let [mx, my] = clampMove(input.moveX, input.moveY);
    if (mx === 0 && my === 0) my = -1;
    const [fx, fz] = forwardOf(f.facing);
    const [rx, rz] = rightOf(f.facing);
    const dx = fx * my + rx * mx;
    const dz = fz * my + rz * mx;
    const len = Math.hypot(dx, dz) || 1;
    f.dodgeX = dx / len;
    f.dodgeZ = dz / len;
    // Dodging toward the opponent sets up a dash attack.
    f.dashWindow = my / Math.max(1e-6, Math.hypot(mx, my)) > 0.5 ? C.DODGE_FRAMES + C.DASH_ATTACK_WINDOW : 0;
    if (f.dodgeCharges === C.DODGE_CHARGES) f.dodgeRecharge = C.DODGE_RECHARGE;
    f.dodgeCharges--;
    this.enter(f, 'dodge', C.DODGE_FRAMES);
    this.emit({ type: 'dodge', who: f.id });
  }

  private move(f: Fighter, o: Fighter, input: InputFrame): void {
    const [fx, fz] = forwardOf(f.facing);
    const [rx, rz] = rightOf(f.facing);

    let scale = 0;
    if (f.state === 'idle') scale = 1;
    else if (f.state === 'block' || f.state === 'blockRelease') scale = C.BLOCK_SPEED_SCALE;
    else if (f.state === 'jump') scale = C.AIR_CONTROL;

    if (scale > 0) {
      const [mx, my] = clampMove(input.moveX, input.moveY);
      const forward = my * (my > 0 ? C.WALK_SPEED : C.BACK_SPEED) * scale;
      const side = mx * C.STRAFE_SPEED * scale;
      f.x += (fx * forward + rx * side) * C.DT;
      f.z += (fz * forward + rz * side) * C.DT;
      f.moveX = mx;
      f.moveY = my;
    } else {
      f.moveX = 0;
      f.moveY = 0;
    }

    if (f.state === 'attack') {
      const m = moveOf(f)!;
      const inActive = f.stateFrame >= m.startup && f.stateFrame < m.startup + m.active;
      const gap = Math.hypot(o.x - f.x, o.z - f.z);
      if (inActive && m.lunge > 0 && gap > C.MIN_SEPARATION + 0.15) {
        const step = Math.min(m.lunge / m.active, gap - C.MIN_SEPARATION - 0.15);
        f.x += fx * step;
        f.z += fz * step;
      } else if (m.lunge < 0 && f.stateFrame < m.startup + m.active) {
        // Retreating attacks back off through their startup and active frames.
        const step = m.lunge / (m.startup + m.active);
        f.x += fx * step;
        f.z += fz * step;
      }
    } else if (f.state === 'dodge' && f.stateFrame < C.DODGE_MOVE_FRAMES) {
      const step = (C.DODGE_DISTANCE * (C.DODGE_MOVE_FRAMES - f.stateFrame)) / DODGE_WEIGHT_SUM;
      f.x += f.dodgeX * step;
      f.z += f.dodgeZ * step;
    } else if (f.state === 'getup' && f.rollDir !== 0 && f.stateFrame < 14) {
      f.x += rx * f.rollDir * (C.GETUP_ROLL_DISTANCE / 14);
      f.z += rz * f.rollDir * (C.GETUP_ROLL_DISTANCE / 14);
    }

    if (f.kx !== 0 || f.kz !== 0) {
      f.x += f.kx * C.DT;
      f.z += f.kz * C.DT;
      f.kx *= KNOCKBACK_DECAY;
      f.kz *= KNOCKBACK_DECAY;
      if (Math.hypot(f.kx, f.kz) < 0.05) f.kx = f.kz = 0;
    }
  }

  private updateFacing(f: Fighter, o: Fighter): void {
    if (f.state === 'dodge' || f.state === 'knockdown' || f.state === 'ko') return;
    if (f.state === 'attack') {
      const m = moveOf(f)!;
      // Attacks stop tracking just before they come out, so late dodges work.
      if (f.stateFrame > m.startup - 4) return;
    }
    f.facing = yawTowards(f.x, f.z, o.x, o.z);
  }

  private applyVertical(f: Fighter): void {
    const plunging = f.state === 'attack' && moveOf(f)!.lands;
    if (plunging) {
      const m = moveOf(f)!;
      if (f.stateFrame < 4) {
        f.vy = 0;
        return;
      }
      if (f.y > 0) f.vy = -16;
      if (f.stateFrame >= m.startup && f.y > 0) f.y = 0;
    }
    if (f.y <= 0 && f.vy === 0) return;
    if (!plunging) f.vy -= C.GRAVITY * C.DT;
    f.y += f.vy * C.DT;
    if (f.y <= 0) {
      f.y = 0;
      f.vy = 0;
      if (f.state === 'jump') {
        this.enter(f, 'idle');
        this.emit({ type: 'land', who: f.id });
      } else if (f.state === 'attack') {
        this.emit({ type: 'land', who: f.id });
      }
    }
  }

  private clampToArena(f: Fighter): void {
    const r = Math.hypot(f.x, f.z);
    const max = C.ARENA_RADIUS - C.FIGHTER_RADIUS;
    if (r > max) {
      f.x *= max / r;
      f.z *= max / r;
    }
  }

  private separate(): void {
    const [a, b] = this.fighters;
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    let d = Math.hypot(dx, dz);
    if (d >= C.MIN_SEPARATION) return;
    if (d < 1e-6) {
      [dx, dz] = forwardOf(a.facing);
      d = 1;
    }
    const push = (C.MIN_SEPARATION - d) / 2;
    a.x -= (dx / d) * push;
    a.z -= (dz / d) * push;
    b.x += (dx / d) * push;
    b.z += (dz / d) * push;
    this.clampToArena(a);
    this.clampToArena(b);
  }

  private inReach(a: Fighter, b: Fighter, m: MoveData): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d > m.range + C.FIGHTER_RADIUS) return false;
    if (m.arc >= 360 || d < 1e-6) return true;
    const [fx, fz] = forwardOf(a.facing);
    return (fx * dx + fz * dz) / d >= Math.cos(((m.arc / 2) * Math.PI) / 180);
  }

  private resolveHits(): void {
    const pending: PendingHit[] = [];
    for (const attacker of this.fighters) {
      const victim = this.fighters[attacker.id === 0 ? 1 : 0];
      const m = moveOf(attacker);
      if (!m || attacker.state !== 'attack' || attacker.moveDone) continue;
      // Multi-hit moves spread their hits evenly over the active frames.
      const nextHitAt = m.startup + Math.floor((attacker.moveHits * m.active) / m.hits);
      if (attacker.stateFrame < nextHitAt || attacker.stateFrame >= m.startup + m.active) continue;
      if (m.lands && attacker.y > 0.05) continue;
      if (isInvulnerable(victim)) continue;
      if (m.kind === 'light' && victim.y - attacker.y > C.LIGHT_HEIGHT_LIMIT) continue;
      if (!this.inReach(attacker, victim, m)) continue;
      // Outcomes are decided from the state before this tick's contacts, so trades work.
      const vm = victim.state === 'attack' ? moveOf(victim) : null;
      let outcome: Outcome =
        victim.state === 'parry'
          ? 'parry'
          : victim.state === 'block' || victim.state === 'blockstun'
            ? 'block'
            : 'hit';
      if (vm && outcome === 'hit' && !m.unblockable) {
        if (inRange(vm.guard, victim.stateFrame) && !victim.moveContact) outcome = 'counter';
        else if (inRange(vm.armor, victim.stateFrame)) outcome = 'armor';
      }
      pending.push({ attacker, victim, move: m, outcome });
    }
    for (const p of pending) this.applyContact(p);
  }

  private contactPoint(a: Fighter, b: Fighter): Point {
    return { x: (a.x + b.x) / 2, y: 1.15 + (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  }

  private applyContact({ attacker: a, victim: b, move: m, outcome }: PendingHit): void {
    const at = this.contactPoint(a, b);
    a.moveHits++;
    a.moveDone = a.moveHits >= m.hits;
    const last = a.moveDone;
    const share = 1 / m.hits;
    const weaponClass = WEAPONS[a.weapon].weaponClass;

    if (outcome === 'counter') {
      // A guard counter deflects the attack and fires its own strike straight away.
      a.moveDone = true;
      a.moveContact = 'parried';
      this.enter(a, 'stagger', C.COUNTER_STAGGER);
      const vm = moveOf(b)!;
      b.moveContact = 'block';
      b.stateFrame = Math.max(b.stateFrame, vm.startup - 1);
      this.hitstop = Math.max(this.hitstop, C.HITSTOP.parry);
      this.emit({ type: 'parry', attacker: a.id, victim: b.id, move: m.id, ...at });
      return;
    }

    if (outcome === 'parry') {
      a.moveDone = true;
      a.moveContact = 'parried';
      this.enter(a, 'stagger', C.PARRY_STAGGER);
      this.enter(b, 'idle');
      this.hitstop = Math.max(this.hitstop, C.HITSTOP.parry);
      this.emit({ type: 'parry', attacker: a.id, victim: b.id, move: m.id, ...at });
      this.addPosture(a, b, C.PARRY_POSTURE_DAMAGE, at);
      return;
    }

    if (outcome === 'block' && !m.unblockable) {
      a.moveContact = 'block';
      this.push(a, b, (m.knockback * 0.5 + 0.2) * (last ? 1 : 0.3));
      this.hitstop = Math.max(this.hitstop, C.HITSTOP.block);
      if (!this.addPosture(b, a, m.posture * share * (m.crush ? 1.5 : 1), at)) {
        this.enter(b, 'blockstun', m.blockstun);
        this.emit({ type: 'block', attacker: a.id, victim: b.id, move: m.id, weaponClass, ...at });
      }
      return;
    }

    a.moveContact = 'hit';
    const bonus = b.guardBreakBonus;
    const damage = Math.max(1, Math.round(m.damage * share * comboScale(b.comboCount) * (bonus ? C.GUARD_BREAK_BONUS : 1)));
    b.guardBreakBonus = false;
    b.comboCount++;
    b.hp = Math.max(0, b.hp - damage);
    const armored = outcome === 'armor' && b.hp > 0;
    let breaks = false;
    if (b.state !== 'guardbreak') {
      b.posture = Math.min(armored ? C.MAX_POSTURE - 1 : C.MAX_POSTURE, b.posture + m.posture * share * C.HIT_POSTURE_SCALE);
      b.postureDelay = C.POSTURE_REGEN_DELAY;
      breaks = b.posture >= C.MAX_POSTURE;
    }
    if (!armored) this.push(a, b, (last ? m.knockback : 0.15) * (m.pull && last ? -0.6 : 1));

    if (outcome === 'block') {
      // An unblockable attack shatters the guard and still lands in full.
      this.guardBreak(a, b, at, damage);
    }

    let ko = false;
    if (b.hp <= 0) {
      if (this.practice) {
        b.hp = C.MAX_HP;
        this.enter(b, 'knockdown', C.KNOCKDOWN_FRAMES);
      } else {
        ko = true;
        this.enter(b, 'ko');
      }
    } else if (outcome === 'block' || armored) {
      // guard break already set the state, or armor soaks the flinch
    } else if (m.knockdown && last) {
      this.enter(b, 'knockdown', C.KNOCKDOWN_FRAMES);
    } else if (breaks) {
      // Worn down by clean hits: the guard shatters instead of a flinch.
      this.guardBreak(a, b, at, damage);
    } else {
      this.enter(b, 'hitstun', last ? m.hitstun : Math.max(m.hitstun, 14));
      if (last && m.launch > 0) b.vy = Math.max(b.vy, m.launch);
    }

    const stop = !last
      ? 3
      : (m.knockdown || ko) ? C.HITSTOP.knockdown : m.kind === 'light' ? C.HITSTOP.light : C.HITSTOP.heavy;
    this.hitstop = Math.max(this.hitstop, stop);
    this.emit({
      type: 'hit',
      attacker: a.id,
      victim: b.id,
      move: m.id,
      kind: m.kind,
      weaponClass,
      damage,
      knockdown: (m.knockdown && last && !armored) || ko,
      bonus,
      ko,
      ...at,
    });
    if (ko) this.emit({ type: 'ko', who: b.id });
  }

  /** Adds posture damage to `f`; returns true if that broke their guard. */
  private addPosture(f: Fighter, from: Fighter, amount: number, at: Point): boolean {
    f.posture = Math.min(C.MAX_POSTURE, f.posture + amount);
    f.postureDelay = C.POSTURE_REGEN_DELAY;
    if (f.posture < C.MAX_POSTURE) return false;
    this.guardBreak(from, f, at, 0);
    return true;
  }

  private guardBreak(a: Fighter, b: Fighter, at: Point, damage: number): void {
    this.enter(b, 'guardbreak', C.GUARD_BREAK_STAGGER);
    b.posture = C.MAX_POSTURE;
    b.guardBreakBonus = damage === 0;
    this.hitstop = Math.max(this.hitstop, C.HITSTOP.guardBreak);
    this.emit({ type: 'guardbreak', attacker: a.id, victim: b.id, damage, ...at });
  }

  private push(a: Fighter, b: Fighter, distance: number): void {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz) || 1;
    b.kx = (dx / d) * distance * KNOCKBACK_SPEED;
    b.kz = (dz / d) * distance * KNOCKBACK_SPEED;
  }

  private checkRoundEnd(): void {
    if (this.practice || this.phase !== 'fight') return;
    const [a, b] = this.fighters;
    const aKo = a.state === 'ko';
    const bKo = b.state === 'ko';
    let reason: 'ko' | 'time' | null = null;
    let winner: Winner = -1;
    if (aKo || bKo) {
      reason = 'ko';
      winner = aKo && bKo ? -1 : aKo ? 1 : 0;
    } else if (this.timer <= 0) {
      reason = 'time';
      winner = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1;
    }
    if (!reason) return;
    if (winner !== -1) this.fighters[winner].roundsWon++;
    this.roundWinner = winner;
    this.phase = 'roundEnd';
    this.phaseFrame = 0;
    this.emit({ type: 'roundEnd', round: this.round, winner, reason });
  }

  private finishRound(): void {
    const [a, b] = this.fighters;
    const decided = a.roundsWon >= C.ROUNDS_TO_WIN || b.roundsWon >= C.ROUNDS_TO_WIN;
    if (decided || this.round >= MAX_ROUNDS) {
      this.winner = a.roundsWon === b.roundsWon ? -1 : a.roundsWon > b.roundsWon ? 0 : 1;
      this.phase = 'matchEnd';
      this.phaseFrame = 0;
      this.emit({ type: 'matchEnd', winner: this.winner });
      return;
    }
    this.round++;
    resetForRound(a);
    resetForRound(b);
    this.timer = C.ROUND_TIME;
    this.hitstop = 0;
    this.roundWinner = -1;
    this.phase = 'intro';
    this.phaseFrame = 0;
  }
}
