/**
 * The fighter combat state machine. The server runs it authoritatively for every fighter; the
 * client runs a copy for the local player so inputs feel instant (server corrections win).
 */
import { AbilityDef, AttackDef, AttackKey, CHARACTERS, CharacterDef, CharacterId, getAttack, isHeavyKey, lightKey } from './characters';
import { COMBAT, JUMP_VELOCITY } from './config';
import { forward } from './math';

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
  | 'dead';

/** States imposed by the server (being hit, deflected, broken...). Clients always adopt these. */
export const FORCED_STATES: ReadonlySet<FighterState> = new Set<FighterState>([
  'stagger',
  'blockstun',
  'deflected',
  'broken',
  'knockdown',
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
        return 0.45;
      case 'stance':
        return this.char.ability.kind === 'counter' ? 0.15 : 0.35;
      case 'attack': {
        const p = this.attackPhase(now);
        return p === 'windup' ? 0.3 : p === 'active' ? 0.1 : 0.2;
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

  private inComboWindow(now: number): boolean {
    return this.state === 'attack' && this.isLightKey(this.attackKey) && this.attackPhase(now) === 'recovery';
  }

  private canStartAttack(now: number): boolean {
    return this.state === 'idle' || this.state === 'block' || this.inComboWindow(now);
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
    if (this.state === 'idle' || this.state === 'block') {
      this.startAttack('l0', now);
      return true;
    }
    if (this.inComboWindow(now)) {
      const next = this.comboIndex + 1;
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
    if (this.state === 'attack' && this.attackPhase(now) === 'recovery' && (this.attackKey === 'h' || this.attackKey === 'h1')) {
      this.startAttack(this.attackKey === 'h' ? 'h1' : 'h2', now);
      return true;
    }
    if (!this.canStartAttack(now)) return false;
    this.startAttack('h', now);
    return true;
  }

  /**
   * Which situational attack a press becomes, if any: in the air, out of (or just after) a forward
   * dodge, or while walking away from where the fighter faces. Air and backstep attacks start from
   * neutral like any attack; a dash attack may cut the end of the dodge short.
   */
  private variant(now: number, opts: InputOptions, air: AttackKey, dash: AttackKey, back: AttackKey): AttackKey | null {
    const neutral = this.state === 'idle' || this.state === 'block';
    if (!this.onGround) return neutral || this.inComboWindow(now) ? air : null;
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
    if (now < this.specialReadyAt || !this.canStartAttack(now)) return false;
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
    switch (this.state) {
      case 'stagger':
        return this.stateStart + COMBAT.staggerDefendAfter;
      case 'deflected':
        return this.stateStart + this.stateDur * COMBAT.deflectedDefendFrac;
      case 'attack': {
        if (!this.attack) return this.stateStart;
        const recovery = this.stateStart + this.atkWindup + this.attack.active;
        if (kind === 'guard' && this.attackPhase(now) === 'windup') return this.stateStart; // feint
        return kind === 'guard' ? recovery + this.attack.recovery * COMBAT.recoveryGuardCancel : recovery;
      }
      default:
        return this.stateStart;
    }
  }

  private clampPress(kind: 'guard' | 'evade', now: number, pressTime: number): number {
    return Math.min(now, Math.max(pressTime, this.legalSince(kind, now)));
  }

  pressBlock(now: number, pressTime = now): boolean {
    pressTime = this.clampPress('guard', now, pressTime);
    this.blockHeld = true;
    const since = pressTime - this.lastBlockPress;
    this.spamCount = since < COMBAT.parrySpamWindow && !this.lastPressDeflected ? Math.min(this.spamCount + 1, 4) : 0;
    this.lastBlockPress = pressTime;
    this.lastPressDeflected = false;
    const window = (COMBAT.parryWindow + (this.mods.parryWindowBonus ?? 0)) * Math.pow(COMBAT.parrySpamFactor, this.spamCount);
    this.parryUntil = pressTime + window;

    const e = now - this.stateStart;
    switch (this.state) {
      case 'idle':
      case 'stance':
        this.setState('block', now, 0, pressTime);
        return true;
      case 'block':
      case 'blockstun':
        // already guarding: a fresh press re-opens the deflect window
        this.emit({ type: 'guardOn', t: pressTime, parryUntil: this.parryUntil });
        return true;
      case 'attack': {
        const phase = this.attackPhase(now);
        if (phase === 'windup' && this.canFeint(now)) {
          this.feintReadyAt = now + COMBAT.feintCooldown;
          this.emit({ type: 'feint', t: now });
          this.setState('block', now, 0, pressTime);
          return true;
        }
        if (phase === 'recovery' && this.attack) {
          const rec = e - this.atkWindup - this.attack.active;
          if (rec >= this.attack.recovery * COMBAT.recoveryGuardCancel) {
            this.setState('block', now, 0, pressTime);
            return true;
          }
        }
        return false;
      }
      case 'stagger':
        if (e >= COMBAT.staggerDefendAfter) {
          this.setState('block', now, 0, pressTime);
          return true;
        }
        return false;
      case 'deflected':
        if (e >= this.stateDur * COMBAT.deflectedDefendFrac) {
          this.setState('block', now, 0, pressTime);
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  releaseBlock(now: number, pressTime = now): boolean {
    this.blockHeld = false;
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
        return this.attackPhase(now) === 'recovery';
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
    this.beginDodge(now, dx / len, dz / len, COMBAT.dodgeDistance, COMBAT.dodgeTime, COMBAT.dodgeIframes, pressTime);
    const f = forward(this.yaw);
    this.dodgeForward = (dx * f.x + dz * f.z) / len > COMBAT.dashDot;
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
    if (this.state !== 'idle' && this.state !== 'block' && this.state !== 'stance') return false;
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
        if (!this.canStartAttack(now)) return false;
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
      case 'broken':
        if (e >= this.stateDur) {
          this.posture = this.maxPosture * COMBAT.brokenRecoverPosture;
          this.toNeutral(now);
        }
        break;
      default:
        break;
    }

    // Holding guard re-raises it as soon as the current state allows.
    if (this.blockHeld) {
      const e2 = now - this.stateStart;
      if (
        this.state === 'idle' ||
        (this.state === 'stagger' && e2 >= COMBAT.staggerDefendAfter) ||
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

    // Posture recovers when you have not taken posture damage for a moment; faster while guarding,
    // slower when your health is low.
    if (
      this.posture > 0 &&
      now - this.lastPostureDamageAt > COMBAT.postureRegenDelay &&
      this.state !== 'broken' &&
      this.state !== 'dead'
    ) {
      const hpFactor = 0.35 + 0.65 * (this.hp / this.maxHp);
      const guard = this.isGuarding() ? COMBAT.guardRegenMult : 1;
      const rate = COMBAT.postureRegenRate * this.char.stats.postureRegen * hpFactor * guard;
      this.posture = Math.max(0, this.posture - rate * dt);
    }
  }

  drainEvents(): FighterEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
