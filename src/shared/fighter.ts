/**
 * The fighter combat state machine. The server runs it authoritatively for every fighter; the
 * client runs a copy for the local player so inputs feel instant (server corrections win).
 */
import { CANCELS, CancelInto, moveClass } from './cancels';
import { AbilityDef, AttackDef, AttackKey, CHARACTERS, CharacterDef, CharacterId, getAttack, isHeavyKey, lightKey } from './characters';
import { COMBAT, GRAVITY, JUMP_VELOCITY } from './config';
import { forward } from './math';

/** States a deflect press cuts straight out of into guard. */
const GUARD_ANYTIME = new Set<string>(['idle', 'stance', 'attack', 'dodge', 'stagger', 'deflected']);

export type FighterState =
  | 'idle'
  | 'attack'
  | 'block'
  | 'blockstun'
  | 'dodge'
  | 'stagger'
  | 'deflected'
  | 'broken'
  | 'knockdown'
  | 'stance'
  /** executing a posture-broken opponent, and being executed (both locked, see COMBAT.executeTime) */
  | 'execute'
  | 'executed'
  | 'dead';

/** States imposed by the server (being hit, deflected, broken...). Clients always adopt these. */
export const FORCED_STATES: ReadonlySet<FighterState> = new Set<FighterState>([
  'stagger',
  'blockstun',
  'deflected',
  'broken',
  'knockdown',
  'execute',
  'executed',
  'dead',
]);

export type InputAction = 'light' | 'heavy' | 'blockDown' | 'blockUp' | 'dodge' | 'jump' | 'special' | 'ability';
export const INPUT_ACTIONS: readonly InputAction[] = ['light', 'heavy', 'blockDown', 'blockUp', 'dodge', 'jump', 'special', 'ability'];

export type AttackPhase = 'windup' | 'active' | 'recovery';

/** Defensive timeline entries, consumed by the server's lag-compensated hit resolution. */
export type DefenseEvent =
  | { type: 'guardOn'; t: number; parryUntil: number }
  | { type: 'guardOff'; t: number }
  | { type: 'dodge'; t: number; dx: number; dz: number; iframes: number }
  | { type: 'jump'; t: number };

export type FighterEvent =
  | DefenseEvent
  | { type: 'attack'; t: number; key: AttackKey }
  | { type: 'feint'; t: number }
  | { type: 'ability'; t: number; kind: AbilityDef['kind'] };

export interface InputOptions {
  /** Client sequence number, echoed back if the input is rejected. */
  tag?: number;
  /** When the input actually happened (lag-compensated). Defaults to now. */
  pressTime?: number;
  /** Desired dodge direction in world space; for attacks, the direction the fighter is walking. */
  dx?: number;
  dz?: number;
}

/** States that hold off posture recovery. */
const POSTURE_BUSY: ReadonlySet<FighterState> = new Set<FighterState>(['attack', 'dodge', 'stagger', 'blockstun', 'deflected', 'knockdown', 'execute', 'executed']);

export class Fighter {
  readonly id: string;
  char: CharacterDef;

  hp: number;
  posture = 0;

  state: FighterState = 'idle';
  stateStart = 0;
  stateDur = 0;

  attack: AttackDef | null = null;
  attackKey: AttackKey | null = null;
  atkWindup = 0;
  comboIndex = -1;
  /** Increments for every attack started; lets the server track which targets an attack already hit. */
  attackSerial = 0;
  /** the attackSerial of the last attack that made contact (hit, armour, block, guard break) */
  contactSerial = -1;

  blockHeld = false;
  guardActive = false;
  parryUntil = -Infinity;
  lastBlockPress = -Infinity;
  lastPressDeflected = false;
  spamCount = 0;

  dodgeReady: number[];
  dodgeDx = 0;
  dodgeDz = 0;
  dodgeDist = 0;
  dodgeDur = 0;
  /** The current dodge is a plain dodge toward where the fighter faces (it flows into dash attacks). */
  dodgeForward = false;
  /** A light or heavy pressed before this lands as a dash attack (just after a forward dodge). */
  dashUntil = -Infinity;
  lastJump = -Infinity;

  specialReadyAt = 0;
  abilityReadyAt = 0;
  feintReadyAt = 0;

  lastPostureDamageAt = -Infinity;
  /** Last moment the fighter was attacking, dodging or reeling (holds off posture recovery). */
  lastBusyAt = -Infinity;
  lastDamageAt = -Infinity;
  buffUntil = 0;
  riposteUntil = 0;
  invulnUntil = 0;

  // kinematics (authoritative on the owning client for players, on the server for bots)
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  vy = 0;
  onGround = true;
  /** a guard released inside its deflect window stays up until then (see releaseBlock) */
  guardLingerUntil = -Infinity;

  buffered: { action: InputAction; until: number; opts: InputOptions } | null = null;
  /** Set when a buffered input timed out without ever taking effect. */
  bufferExpired: { action: InputAction; tag?: number } | null = null;
  events: FighterEvent[] = [];
  private lastUpdate = -1;

  constructor(id: string, charId: CharacterId) {
    this.id = id;
    this.char = CHARACTERS[charId];
    this.hp = this.char.stats.hp;
    this.dodgeReady = new Array(this.char.passive.mods.dodgeCharges ?? 1).fill(0);
  }

  get maxHp(): number {
    return this.char.stats.hp;
  }

  get maxPosture(): number {
    return this.char.stats.posture;
  }

  get mods() {
    return this.char.passive.mods;
  }

  setCharacter(charId: CharacterId): void {
    this.char = CHARACTERS[charId];
    this.dodgeReady = new Array(this.char.passive.mods.dodgeCharges ?? 1).fill(0);
    this.resetVitals();
  }

  resetVitals(): void {
    this.hp = this.maxHp;
    this.posture = 0;
    this.buffUntil = 0;
    this.riposteUntil = 0;
    this.specialReadyAt = 0;
    this.abilityReadyAt = 0;
    this.feintReadyAt = 0;
    this.dodgeReady.fill(0);
    this.buffered = null;
    this.blockHeld = false;
    this.attack = null;
    this.attackKey = null;
    this.state = 'idle';
    this.stateDur = 0;
    this.guardActive = false;
    this.vy = 0;
  }

  // ------------------------------------------------------------------ queries

  elapsed(now: number): number {
    return now - this.stateStart;
  }

  attackPhase(now: number): AttackPhase | null {
    if (this.state !== 'attack' || !this.attack) return null;
    const e = now - this.stateStart;
    if (e < this.atkWindup) return 'windup';
    if (e < this.atkWindup + this.attack.active) return 'active';
    return 'recovery';
  }

  /**
   * May the current attack be cut short into `into` right now? See shared/cancels.ts. The feint
   * (guard in a heavy's windup) is separate: canFeint.
   */
  canCancel(into: CancelInto, now: number): boolean {
    const t = this.cancelOpensAt(into);
    return t !== null && now >= t;
  }

  /** When the current attack's cancel window into `into` opens (null: it has none, or not yet earned). */
  cancelOpensAt(into: CancelInto): number | null {
    if (this.state !== 'attack' || !this.attack || !this.attackKey) return null;
    const w = CANCELS[moveClass(this.attackKey, this.char)][into];
    if (!w) return null;
    if (w.onContact && this.contactSerial !== this.attackSerial) return null;
    const a = this.attack;
    const start = w.phase === 'windup' ? 0 : w.phase === 'active' ? this.atkWindup : this.atkWindup + a.active;
    const len = w.phase === 'windup' ? this.atkWindup : w.phase === 'active' ? a.active : a.recovery;
    return this.stateStart + start + len * (w.from ?? 0);
  }

  attackTotal(): number {
    return this.attack ? this.atkWindup + this.attack.active + this.attack.recovery : 0;
  }

  isGuarding(): boolean {
    return this.state === 'block' || (this.state === 'blockstun' && this.blockHeld);
  }

  isAlive(): boolean {
    return this.state !== 'dead';
  }

  isLightKey(key: AttackKey | null): boolean {
    return !!key && key[0] === 'l';
  }

  buffActive(now: number): boolean {
    return this.char.ability.kind === 'buff' && this.buffUntil > now;
  }

  hasHyperArmor(now: number): boolean {
    if (this.state !== 'attack' || !this.attack || this.attack.noHitbox) return false;
    if (now < this.stateStart) return false; // the attack hadn't started yet at that moment
    if (this.attackPhase(now) === 'recovery') return false;
    if (this.attack.hyperArmor) return true;
    if (isHeavyKey(this.attackKey) && this.mods.heavyHyperArmor) return true;
    const ab = this.char.ability;
    return ab.kind === 'buff' && ab.hyperArmor && this.buffUntil > now;
  }

  damageMult(now: number): number {
    const ab = this.char.ability;
    return ab.kind === 'buff' && this.buffUntil > now ? ab.damageMult : 1;
  }

  dodgeChargesReady(now: number): number {
    return this.dodgeReady.filter((t) => t <= now).length;
  }

  /** Multiplier on walk speed in the current state. */
  moveSpeedMult(now: number): number {
    switch (this.state) {
      case 'idle':
        return 1;
      case 'block':
        return 0.6;
      case 'stance':
        return this.char.ability.kind === 'counter' ? 0.15 : 0.35;
      case 'attack': {
        // you keep moving through a swing (Dueling Grounds never roots you), just slower
        const p = this.attackPhase(now);
        return p === 'windup' ? 0.55 : p === 'active' ? 0.35 : 0.45;
      }
      default:
        return 0;
    }
  }

  /** Max turn speed (rad/s): attacks commit you to a direction once they start. */
  turnRate(now: number): number {
    switch (this.state) {
      case 'idle':
      case 'block':
        return 16;
      case 'stance':
        return 9;
      case 'attack': {
        const p = this.attackPhase(now);
        return p === 'windup' ? 7 : p === 'active' ? 1.5 : 3;
      }
      default:
        return 0;
    }
  }

  /**
   * An attack thrown in the air, as Dueling Grounds does it: the fighter hangs near the top of the
   * jump through the windup, then slams straight down so they land as the blow comes out. Call it
   * just before the physics step (which then applies gravity).
   */
  airControl(now: number, dt: number): void {
    if (this.onGround || this.state !== 'attack' || (this.attackKey !== 'jl' && this.attackKey !== 'jh')) return;
    const e = now - this.stateStart;
    if (e < this.atkWindup * COMBAT.airSlamFrom) {
      // the rise dies away and gravity is all but cancelled
      this.vy *= Math.exp(-dt * 14);
      this.vy += GRAVITY * dt * 0.92;
    } else {
      // down, fast enough to land by the end of the windup
      const left = Math.max(0.04, (this.atkWindup - e) / 1000);
      this.vy = Math.min(this.vy, -Math.min(COMBAT.airSlamMax, Math.max(COMBAT.airSlamSpeed, this.y / left)));
    }
  }

  /** Forward lunge speed (m/s) from the current attack, if any; negative for attacks that give ground. */
  lungeSpeed(now: number): number {
    if (this.state !== 'attack' || !this.attack?.lunge) return 0;
    const start = this.atkWindup * 0.55;
    const end = this.atkWindup + this.attack.active;
    const e = now - this.stateStart;
    if (e < start || e > end) return 0;
    return this.attack.lunge / ((end - start) / 1000);
  }

  /** Dodge velocity (world space, m/s). Ease-out profile that integrates to dodgeDist. */
  dodgeVelocity(now: number): { x: number; z: number } {
    if (this.state !== 'dodge' || this.dodgeDist <= 0) return { x: 0, z: 0 };
    const t = (now - this.stateStart) / this.dodgeDur;
    if (t >= 1) return { x: 0, z: 0 };
    const speed = (this.dodgeDist / (this.dodgeDur / 1000)) * 2 * (1 - t);
    return { x: this.dodgeDx * speed, z: this.dodgeDz * speed };
  }

  // ------------------------------------------------------------------ transitions

  private emit(e: FighterEvent): void {
    this.events.push(e);
  }

  private syncGuard(logTime: number): void {
    const g = this.isGuarding();
    if (g === this.guardActive) return;
    this.guardActive = g;
    this.emit(g ? { type: 'guardOn', t: logTime, parryUntil: this.parryUntil } : { type: 'guardOff', t: logTime });
  }

  setState(s: FighterState, now: number, dur = 0, logTime = now): void {
    this.state = s;
    this.stateStart = now;
    this.stateDur = dur;
    if (s !== 'attack') {
      this.attack = null;
      this.attackKey = null;
      this.comboIndex = -1;
    }
    this.syncGuard(logTime);
  }

  /** Server-imposed state (hit stun, deflected, broken...). Cancels whatever was happening. */
  force(s: FighterState, now: number, dur = 0): void {
    this.buffered = null;
    this.setState(s, now, dur);
  }

  private toNeutral(now: number): void {
    this.setState(this.blockHeld ? 'block' : 'idle', now);
  }

  startAttack(key: AttackKey, now: number): void {
    const atk = getAttack(this.char, key);
    if (!atk) return;
    let scale = 1;
    const rip = this.mods.riposteWindupMult;
    if (rip && this.riposteUntil > now) {
      scale = rip;
      this.riposteUntil = 0;
    }
    this.setState('attack', now);
    this.attack = atk;
    this.attackKey = key;
    this.atkWindup = Math.round(atk.windup * scale);
    this.comboIndex = this.isLightKey(key) ? Number(key.slice(1)) : -1;
    this.attackSerial++;
    this.emit({ type: 'attack', t: now, key });
  }

  addPosture(amount: number, now: number): boolean {
    this.posture = Math.min(this.maxPosture, this.posture + amount);
    this.lastPostureDamageAt = now;
    return this.posture >= this.maxPosture;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  // ------------------------------------------------------------------ inputs

  /** Apply an input. Returns true if it took effect. Failed attack/dodge inputs are buffered briefly. */
  input(action: InputAction, now: number, opts: InputOptions = {}): boolean {
    const ok = this.tryInput(action, now, opts);
    if (!ok && (action === 'light' || action === 'heavy' || action === 'special' || action === 'ability' || action === 'dodge')) {
      this.buffered = { action, until: now + COMBAT.inputBuffer, opts };
    } else if (ok && action !== 'blockDown' && action !== 'blockUp' && action !== 'jump') {
      this.buffered = null;
    }
    return ok;
  }

  private tryInput(action: InputAction, now: number, opts: InputOptions): boolean {
    // an execution plays out to the end, for both of them
    if (this.state === 'execute' || this.state === 'executed') return false;
    switch (action) {
      case 'light':
        return this.pressLight(now, opts);
      case 'heavy':
        return this.pressHeavy(now, opts);
      case 'blockDown':
        return this.pressBlock(now, opts.pressTime ?? now);
      case 'blockUp':
        return this.releaseBlock(now, opts.pressTime ?? now);
      case 'dodge':
        return this.pressDodge(now, opts.dx ?? 0, opts.dz ?? 0, opts.pressTime ?? now);
      case 'jump':
        return this.pressJump(now, opts.pressTime ?? now);
      case 'special':
        return this.pressSpecial(now);
      case 'ability':
        return this.pressAbility(now);
    }
  }

  private get neutral(): boolean {
    return this.state === 'idle' || this.state === 'block';
  }

  pressLight(now: number, opts: InputOptions = {}): boolean {
    if (this.state === 'stance' && this.char.ability.kind === 'stance') {
      this.startAttack('ia', now);
      return true;
    }
    const v = this.variant(now, opts, 'jl', 'dl', 'bl');
    if (v) {
      this.startAttack(v, now);
      return true;
    }
    if (this.neutral) {
      this.startAttack('l0', now);
      return true;
    }
    if (this.canCancel('light', now)) {
      // the string carries on; out of a dash light it picks up at the second hit
      const next = this.attackKey === 'dl' || this.attackKey === 'dh' ? 1 : this.comboIndex + 1;
      if (next < this.char.lights.length) {
        this.startAttack(lightKey(next), now);
        return true;
      }
    }
    return false;
  }

  /** Heavies chain like lights: a press in the recovery of the first or second heavy throws the next one. */
  pressHeavy(now: number, opts: InputOptions = {}): boolean {
    const v = this.variant(now, opts, 'jh', 'dh', 'bh');
    if (v) {
      this.startAttack(v, now);
      return true;
    }
    if (this.neutral) {
      this.startAttack('h', now);
      return true;
    }
    if (!this.canCancel('heavy', now)) return false;
    const k = this.attackKey;
    // the heavy chain goes on, an air light drops into the plunge, anything else opens with a heavy
    this.startAttack(k === 'h' ? 'h1' : k === 'h1' ? 'h2' : k === 'jl' ? 'jh' : 'h', now);
    return true;
  }

  /**
   * Which situational attack a press becomes, if any: in the air, out of (or just after) a forward
   * dodge, or while walking away from where the fighter faces. Air and backstep attacks start from
   * neutral like any attack; a dash attack may cut the end of the dodge short.
   */
  private variant(now: number, opts: InputOptions, air: AttackKey, dash: AttackKey, back: AttackKey): AttackKey | null {
    const neutral = this.neutral;
    if (!this.onGround) return neutral ? air : null;
    const dashing = this.state === 'dodge' && this.dodgeForward && now - this.stateStart >= this.dodgeDur * COMBAT.dashCancelFrom;
    if (dashing || (neutral && now <= this.dashUntil)) {
      this.dashUntil = -Infinity;
      return dash;
    }
    if (!neutral) return null;
    const mx = opts.dx ?? 0;
    const mz = opts.dz ?? 0;
    const len = Math.hypot(mx, mz);
    if (len > 0.3) {
      const f = forward(this.yaw);
      if ((mx * f.x + mz * f.z) / len < -COMBAT.backstepDot) return back;
    }
    return null;
  }

  pressSpecial(now: number): boolean {
    if (now < this.specialReadyAt || !(this.neutral || this.canCancel('special', now))) return false;
    this.specialReadyAt = now + this.char.special.cooldown;
    this.startAttack('sp', now);
    return true;
  }

  canFeint(now: number): boolean {
    if (this.state !== 'attack' || !this.attack || this.attackPhase(now) !== 'windup') return false;
    if (now < this.feintReadyAt) return false;
    if (this.attack.feintable) return true;
    return !!this.mods.lightFeint && this.isLightKey(this.attackKey);
  }

  /**
   * Earliest moment the current state allowed a defensive input. Lag-compensated press times are
   * never allowed to predate it, so you can't backdate a guard or dodge to before a stagger began
   * or before your own attack recovery let you cancel.
   */
  private legalSince(kind: 'guard' | 'evade', now: number): number {
    // a deflect press is never held back: it cuts into whatever the fighter is doing (except the
    // moment just after being hit)
    if (kind === 'guard' && this.state === 'stagger') return this.guardLockEnd();
    if (kind === 'guard' && GUARD_ANYTIME.has(this.state)) return this.stateStart;
    switch (this.state) {
      case 'stagger':
        return this.stateStart + COMBAT.staggerDefendAfter;
      case 'deflected':
        return this.stateStart + this.stateDur * COMBAT.deflectedDefendFrac;
      case 'attack': {
        if (!this.attack) return this.stateStart;
        if (kind === 'guard' && this.attackPhase(now) === 'windup') return this.stateStart; // feint
        return this.cancelOpensAt(kind === 'guard' ? 'guard' : 'dodge') ?? now;
      }
      default:
        return this.stateStart;
    }
  }

  /**
   * Hit, there's a moment you can't deflect: short after a light, longer after a heavy (told apart
   * by the stagger's length, which the client is sent too).
   */
  guardLockEnd(): number {
    if (this.state !== 'stagger') return -Infinity;
    return this.stateStart + (this.stateDur > COMBAT.staggerTime ? COMBAT.hitGuardLockHeavy : COMBAT.hitGuardLockLight);
  }

  private clampPress(kind: 'guard' | 'evade', now: number, pressTime: number): number {
    return Math.min(now, Math.max(pressTime, this.legalSince(kind, now)));
  }

  pressBlock(now: number, pressTime = now): boolean {
    // just hit: no deflecting yet. Held, the guard comes up (as a plain block) once it can
    if (now < this.guardLockEnd()) {
      this.blockHeld = true;
      return false;
    }
    pressTime = this.clampPress('guard', now, pressTime);
    this.blockHeld = true;
    const since = pressTime - this.lastBlockPress;
    this.spamCount = since < COMBAT.parrySpamWindow && !this.lastPressDeflected ? Math.min(this.spamCount + 1, 4) : 0;
    this.lastBlockPress = pressTime;
    this.lastPressDeflected = false;
    const window = (COMBAT.parryWindow + (this.mods.parryWindowBonus ?? 0)) * Math.pow(COMBAT.parrySpamFactor, this.spamCount);
    this.parryUntil = pressTime + window;

    // Deflecting is instant: the press raises the guard right away out of anything the fighter can
    // act from (their own attack at any point, a dodge, a stagger, being deflected), so the
    // window always opens when the button goes down.
    switch (this.state) {
      case 'block':
      case 'blockstun':
        // already guarding: a fresh press re-opens the deflect window
        this.emit({ type: 'guardOn', t: pressTime, parryUntil: this.parryUntil });
        return true;
      case 'attack':
        // pulled out of a windup it reads as a feint
        if (this.attackPhase(now) === 'windup' && this.canFeint(now)) {
          this.feintReadyAt = now + COMBAT.feintCooldown;
          this.emit({ type: 'feint', t: now });
        }
        this.setState('block', now, 0, pressTime);
        return true;
      default:
        if (!GUARD_ANYTIME.has(this.state)) return false;
        this.setState('block', now, 0, pressTime);
        return true;
    }
  }

  releaseBlock(now: number, pressTime = now): boolean {
    this.blockHeld = false;
    // let go inside the deflect window and it still plays out: the guard drops when it ends, so
    // a quick tap deflects as well as a hold does
    if (this.state === 'block' && pressTime < this.parryUntil) {
      this.guardLingerUntil = this.parryUntil;
      return true;
    }
    if (this.state === 'block') this.setState('idle', now, 0, pressTime);
    else this.syncGuard(pressTime);
    return true;
  }

  private canEvade(now: number): boolean {
    const e = now - this.stateStart;
    switch (this.state) {
      case 'idle':
      case 'block':
      case 'stance':
        return true;
      case 'attack':
        return this.canCancel('dodge', now);
      case 'stagger':
        return e >= COMBAT.staggerDefendAfter;
      case 'deflected':
        return e >= this.stateDur * COMBAT.deflectedDefendFrac;
      default:
        return false;
    }
  }

  pressDodge(now: number, dx: number, dz: number, pressTime = now): boolean {
    if (!this.canEvade(now)) return false;
    pressTime = this.clampPress('evade', now, pressTime);
    const charge = this.dodgeReady.findIndex((t) => t <= now);
    if (charge < 0) return false;
    this.dodgeReady[charge] = now + COMBAT.dodgeCooldown;
    let len = Math.hypot(dx, dz);
    if (len < 0.01) {
      const f = forward(this.yaw);
      dx = -f.x;
      dz = -f.z;
      len = 1;
    }
    const f = forward(this.yaw);
    const ahead = (dx * f.x + dz * f.z) / len > COMBAT.dashDot;
    this.beginDodge(now, dx / len, dz / len, COMBAT.dodgeDistance, COMBAT.dodgeTime, ahead ? COMBAT.dashIframes : COMBAT.dodgeIframes, pressTime);
    this.dodgeForward = ahead;
    return true;
  }

  private beginDodge(now: number, dx: number, dz: number, dist: number, dur: number, iframes: number, pressTime: number): void {
    this.setState('dodge', now, dur, pressTime);
    this.dodgeForward = false;
    this.dodgeDx = dx;
    this.dodgeDz = dz;
    this.dodgeDist = dist;
    this.dodgeDur = dur;
    this.emit({ type: 'dodge', t: pressTime, dx, dz, iframes });
  }

  pressJump(now: number, pressTime = now): boolean {
    if (!this.onGround || now - this.lastJump < COMBAT.jumpCooldown) return false;
    if (this.state !== 'idle' && this.state !== 'block' && this.state !== 'stance' && !this.canCancel('jump', now)) return false;
    pressTime = this.clampPress('evade', now, pressTime);
    this.lastJump = now;
    this.vy = JUMP_VELOCITY;
    this.onGround = false;
    this.emit({ type: 'jump', t: pressTime });
    return true;
  }

  pressAbility(now: number): boolean {
    if (now < this.abilityReadyAt) return false;
    const ab = this.char.ability;
    const neutral = this.state === 'idle' || this.state === 'block';
    switch (ab.kind) {
      case 'stance':
      case 'counter':
        if (!neutral) return false;
        this.setState('stance', now, ab.duration);
        break;
      case 'buff':
        if (!neutral && this.state !== 'attack') return false;
        this.buffUntil = now + ab.duration;
        break;
      case 'attack':
        // an attacking ability sits with the special in the cancel table
        if (!this.neutral && !this.canCancel('special', now)) return false;
        this.startAttack('ab', now);
        break;
      case 'leap': {
        if (!this.canEvade(now)) return false;
        const f = forward(this.yaw);
        this.beginDodge(now, -f.x, -f.z, ab.distance, ab.duration, ab.iframes, now);
        this.emit({ type: 'jump', t: now });
        if (this.onGround) {
          // a real hop (visual for players, physical for bots)
          this.vy = JUMP_VELOCITY * 0.75;
          this.onGround = false;
        }
        break;
      }
      case 'teleport':
        if (!neutral) return false;
        // The server repositions the fighter; the vanish itself is a short invulnerable dodge.
        this.beginDodge(now, 0, 0, 0, 300, 300, now);
        break;
    }
    this.abilityReadyAt = now + ab.cooldown;
    this.emit({ type: 'ability', t: now, kind: ab.kind });
    return true;
  }

  // ------------------------------------------------------------------ simulation

  update(now: number): void {
    const dt = this.lastUpdate < 0 ? 0 : Math.min(0.1, Math.max(0, (now - this.lastUpdate) / 1000));
    this.lastUpdate = now;
    const e = now - this.stateStart;

    switch (this.state) {
      case 'attack':
        if (e >= this.attackTotal()) this.toNeutral(now);
        break;
      case 'dodge':
        if (e >= this.dodgeDur) {
          if (this.dodgeForward) this.dashUntil = now + COMBAT.dashWindow;
          this.toNeutral(now);
        }
        break;
      case 'stance':
      case 'stagger':
      case 'blockstun':
      case 'deflected':
      case 'knockdown':
        if (e >= this.stateDur) this.toNeutral(now);
        break;
      case 'execute':
        if (e >= this.stateDur) this.toNeutral(now);
        break;
      case 'executed':
        // survived it: floored, with the guard back whole
        if (e >= this.stateDur) {
          this.posture = 0;
          this.invulnUntil = now + COMBAT.knockdownTime;
          this.setState('knockdown', now, COMBAT.knockdownTime);
        }
        break;
      case 'broken':
        if (e >= this.stateDur) {
          this.posture = this.maxPosture * COMBAT.brokenRecoverPosture;
          this.toNeutral(now);
        }
        break;
      default:
        break;
    }

    // a released guard held up for the rest of its deflect window comes down when it ends
    if (this.state === 'block' && !this.blockHeld && now >= this.guardLingerUntil) this.setState('idle', now, 0, Math.min(now, this.guardLingerUntil));

    // Holding guard re-raises it as soon as the current state allows.
    if (this.blockHeld) {
      const e2 = now - this.stateStart;
      if (
        this.state === 'idle' ||
        (this.state === 'stagger' && now >= this.guardLockEnd()) ||
        (this.state === 'deflected' && e2 >= this.stateDur * COMBAT.deflectedDefendFrac)
      ) {
        this.setState('block', now);
      }
    }

    if (this.buffered) {
      if (now > this.buffered.until) {
        this.bufferExpired = { action: this.buffered.action, tag: this.buffered.opts.tag };
        this.buffered = null;
      } else if (this.tryInput(this.buffered.action, now, this.buffered.opts)) this.buffered = null;
    }

    // Posture recovers when you have not taken posture damage for a while and have stopped attacking,
    // dodging and reeling; faster while guarding, slower when your health is low.
    if (POSTURE_BUSY.has(this.state)) this.lastBusyAt = now;
    if (
      this.posture > 0 &&
      now - this.lastPostureDamageAt > COMBAT.postureRegenDelay &&
      now - this.lastBusyAt > COMBAT.postureCalmDelay &&
      this.state !== 'broken' &&
      this.state !== 'dead'
    ) {
      // out of the fight for a moment, it comes back fast and evenly, as in Dueling Grounds
      // (most of the bar in about a second)
      const guard = this.isGuarding() ? COMBAT.guardRegenMult : 1;
      const rate = this.maxPosture * COMBAT.postureRegenFrac * this.char.stats.postureRegen * guard;
      this.posture = Math.max(0, this.posture - rate * dt);
    }
  }

  drainEvents(): FighterEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
