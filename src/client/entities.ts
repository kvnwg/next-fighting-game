/**
 * Client-side fighter: the visual model plus either a locally predicted simulation (you) or an
 * interpolated replica of server state (everyone else).
 */
import * as THREE from 'three';
import { AttackDef, CHARACTERS, CharacterId, getAttack, isHeavyKey } from '../shared/characters';
import { INTERP_DELAY_MS } from '../shared/config';
import { Fighter, FighterState } from '../shared/fighter';
import { angleDiff, forward } from '../shared/math';
import { FighterSnap, RosterEntry } from '../shared/protocol';
import type { DodgeKind } from './render/anim/animator';
import type { FxAnchor, FxCue } from './render/anim/author';
import { AnimInput, CharacterModel } from './render/character';
import { ENTRANCES } from './entrances';
import { WeaponTrail, makeGlyph } from './render/effects';

/** An effect cue from a move, resolved to a world position (and the fighter's facing). */
export interface FxEvent {
  cue: FxCue;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  fighter: ClientFighter;
}

/** Kick trail anchors in the ankle's frame: heel to toe. */
const KICK_BASE = new THREE.Vector3(0, 0.03, -0.06);
const KICK_TIP = new THREE.Vector3(0, -0.02, 0.2);

function forward3(yaw: number): THREE.Vector3 {
  const f = forward(yaw);
  return new THREE.Vector3(f.x, 0, f.z);
}

interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  r: number;
}

export class ClientFighter {
  roster: RosterEntry;
  model: CharacterModel;
  readonly trail: WeaponTrail;
  offTrail: WeaponTrail | null;
  /** follows the kicking foot (martial-arts kicks) */
  readonly kickTrail: WeaponTrail;
  /** effect cues fired by the current move, waiting for the game loop */
  fxQueue: FxEvent[] = [];
  /** the ring entrance window on the server clock (ms), while the match intro films this fighter */
  entrance: { start: number; dur: number } | null = null;
  /** who this fighter keeps their eyes on (the game sets it each frame; null: no one) */
  lookAt: THREE.Vector3 | null = null;
  /** being executed: who by (set from the execution's start event) */
  execBy: CharacterId | null = null;
  readonly glyph: THREE.Sprite;
  readonly isLocal: boolean;

  /** Latest authoritative combat state from the server. */
  s: FighterState = 'idle';
  ss = 0;
  sd = 0;
  a: string | undefined;
  aw = 0;
  hp = 100;
  po = 0;
  b = false;
  flags = 0;
  serial = 0;
  /** server time the special is charged */
  specialReadyAt = 0;
  private lastStateServerTime = -Infinity;

  /** rendered transform */
  pos = new THREE.Vector3();
  yaw = 0;
  private buf: Sample[] = [];
  private prevPos = new THREE.Vector3();
  speed = 0;
  moveF = 0;
  moveS = 0;
  airborne = false;

  /** local prediction (only for the player you control) */
  sim: Fighter | null = null;

  lastPerilousSerial = -1;
  lastSwingSerial = -1;
  lastCueSerial = -1;
  lastStateKey = '';
  private tmpBase = new THREE.Vector3();
  /** which way the weapon tip was last travelling fast (impact sparks fly that way) */
  readonly swingDir = new THREE.Vector3(0, 0, 1);
  private lastTip = new THREE.Vector3();
  private tipValid = false;
  /** how fast the weapon tip moved last frame (m/s): a fast tip keeps the swoosh going between moves */
  private tipSpeed = 0;
  private tmpTip = new THREE.Vector3();
  private tmpPos = new THREE.Vector3();
  private tmpQuat = new THREE.Quaternion();
  private tmpScale = new THREE.Vector3();
  /** hit-stop: the animation holds still for a moment on impact, then catches back up */
  private freezeMs = 0;
  /** how hard the struck fighter shudders through the hitstop (m), and the hitstop's full length */
  private shudder = 0;
  private freezeTotal = 1;
  private lagMs = 0;
  private lagKey = '';

  constructor(
    roster: RosterEntry,
    isLocal: boolean,
    readonly scene: THREE.Scene,
  ) {
    this.roster = roster;
    this.isLocal = isLocal;
    this.model = new CharacterModel(roster.char);
    this.trail = new WeaponTrail('#ffffff');
    this.offTrail = this.model.trailOff ? new WeaponTrail('#ffffff') : null;
    this.kickTrail = new WeaponTrail('#ffffff');
    this.glyph = makeGlyph('危', '#ffffff', '#c41a1a');
    this.glyph.visible = false;
    scene.add(this.model.root, this.trail.mesh, this.kickTrail.mesh, this.glyph);
    if (this.offTrail) scene.add(this.offTrail.mesh);
    this.hp = CHARACTERS[roster.char].stats.hp;
    if (isLocal) this.sim = new Fighter(roster.id, roster.char);
  }

  get id(): string {
    return this.roster.id;
  }

  get char() {
    return CHARACTERS[this.roster.char];
  }

  /** Swap character model (lobby character change). */
  setRoster(r: RosterEntry): void {
    const changed = r.char !== this.roster.char;
    this.roster = r;
    if (!changed) return;
    this.scene.remove(this.model.root);
    this.model.dispose();
    this.model = new CharacterModel(r.char);
    this.scene.add(this.model.root);
    if (!!this.offTrail !== !!this.model.trailOff) {
      if (this.offTrail) {
        this.scene.remove(this.offTrail.mesh);
        this.offTrail.dispose();
        this.offTrail = null;
      } else {
        this.offTrail = new WeaponTrail('#ffffff');
        this.scene.add(this.offTrail.mesh);
      }
    }
    if (this.sim) {
      // the server keeps cooldowns across a swap; mirror that
      const ready = { special: this.sim.specialReadyAt, ability: this.sim.abilityReadyAt };
      this.sim.setCharacter(r.char);
      this.sim.specialReadyAt = ready.special;
      this.sim.abilityReadyAt = ready.ability;
    }
  }

  applySnap(f: FighterSnap, serverTime: number, positional: boolean): void {
    if (positional && !this.isLocal) {
      this.buf.push({ t: serverTime, x: f.x, y: f.y, z: f.z, r: f.r });
      if (this.buf.length > 30) this.buf.shift();
    }
    if (serverTime < this.lastStateServerTime) return;
    this.lastStateServerTime = serverTime;
    this.s = f.s;
    this.ss = f.ss;
    this.sd = f.sd;
    this.a = f.a;
    this.aw = f.aw ?? 0;
    this.hp = f.hp;
    this.po = f.po;
    this.b = f.b === 1;
    this.flags = f.f;
    this.serial = f.n;
    this.specialReadyAt = f.sr ?? 0;
    // the server can only push our special further out (respawns, round starts); our own
    // predicted uses already move it forward locally
    if (this.sim && f.sr !== undefined && f.sr > this.sim.specialReadyAt + 50) this.sim.specialReadyAt = f.sr;
  }

  /** Freeze this fighter's animation briefly (impact feel). */
  /** Freeze on an impact; the one who took the blow shudders in place while time stands still. */
  hitstop(ms: number, shudder = 0): void {
    if (ms >= this.freezeMs) this.freezeTotal = Math.max(1, ms);
    this.freezeMs = Math.max(this.freezeMs, ms);
    this.shudder = Math.max(this.freezeMs > 0 && this.shudder > 0 ? this.shudder : 0, shudder);
  }

  teleportTo(x: number, y: number, z: number, yaw?: number): void {
    this.trail.reset();
    this.offTrail?.reset();
    this.pos.set(x, y, z);
    this.prevPos.copy(this.pos);
    if (yaw !== undefined) this.yaw = yaw;
    this.buf = [];
  }

  /** Remote fighters: interpolate between buffered snapshots. */
  interpolate(serverNow: number): void {
    if (this.isLocal || this.buf.length === 0) return;
    const t = serverNow - INTERP_DELAY_MS;
    let i = this.buf.length - 1;
    while (i > 0 && this.buf[i - 1].t > t) i--;
    const b = this.buf[i];
    const a = this.buf[i - 1];
    if (!a || t >= b.t) {
      // past the newest sample: hold (tiny extrapolation would add jitter at 20Hz)
      this.pos.set(b.x, b.y, b.z);
      this.yaw = b.r;
    } else if (Math.hypot(b.x - a.x, b.z - a.z) > 8) {
      // respawn / blink: jump instead of sliding across the map
      this.pos.set(b.x, b.y, b.z);
      this.yaw = b.r;
    } else {
      const k = Math.max(0, Math.min(1, (t - a.t) / Math.max(1, b.t - a.t)));
      this.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      this.yaw = a.r + angleDiff(a.r, b.r) * k;
    }
    while (this.buf.length > 2 && this.buf[1].t < t - 200) this.buf.shift();
  }

  /** The combat state to animate (local prediction for you, server state otherwise). */
  view(serverNow: number): {
    state: FighterState;
    elapsed: number;
    dur: number;
    attack: AttackDef | null;
    windup: number;
    serial: number;
    key: string | undefined;
    dodgeKind: DodgeKind | undefined;
  } {
    const ab = this.char.ability;
    if (this.sim) {
      const s = this.sim;
      const dur = s.state === 'dodge' ? s.dodgeDur : s.stateDur;
      let dodgeKind: DodgeKind | undefined;
      if (s.state === 'dodge') dodgeKind = s.dodgeDist === 0 ? 'vanish' : ab.kind === 'leap' && s.dodgeDur === ab.duration ? 'leap' : 'roll';
      return {
        state: s.state,
        elapsed: serverNow - s.stateStart,
        dur,
        attack: s.attack,
        windup: s.atkWindup,
        serial: s.attackSerial,
        key: s.attackKey ?? undefined,
        dodgeKind,
      };
    }
    const atk = this.s === 'attack' && this.a ? getAttack(this.char, this.a as never) : null;
    let dur = this.sd;
    if (this.s === 'dodge' && !dur) dur = 380;
    // abilities reuse the dodge state; their durations tell them apart
    let dodgeKind: DodgeKind | undefined;
    if (this.s === 'dodge') dodgeKind = ab.kind === 'leap' && dur === ab.duration ? 'leap' : ab.kind === 'teleport' && this.dodgeIsVanish() ? 'vanish' : 'roll';
    return { state: this.s, elapsed: serverNow - this.ss, dur, attack: atk, windup: this.aw || atk?.windup || 0, serial: this.serial, key: this.a, dodgeKind };
  }

  updateVisual(dt: number, serverNow: number, buffActive: boolean): void {
    // the head tracks whoever they're fighting
    this.model.lookYaw = this.lookAt ? angleDiff(this.yaw, Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z)) : null;
    // movement analysis for the walk cycle
    const dx = this.pos.x - this.prevPos.x;
    const dz = this.pos.z - this.prevPos.z;
    const sp = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    this.speed += (sp - this.speed) * Math.min(1, dt * 12);
    if (sp > 0.2) {
      const f = forward(this.yaw);
      const nx = dx / (sp * dt);
      const nz = dz / (sp * dt);
      this.moveF = nx * f.x + nz * f.z;
      this.moveS = nx * f.z - nz * f.x;
    }
    this.airborne = this.pos.y > 0.15;
    this.prevPos.copy(this.pos);

    const v = this.view(serverNow);
    // hit-stop lag, reset whenever the state changes
    const lagKey = `${v.state}|${v.serial}`;
    if (lagKey !== this.lagKey) {
      this.lagKey = lagKey;
      this.lagMs = 0;
    }
    if (this.freezeMs > 0) {
      this.freezeMs -= dt * 1000;
      this.lagMs += dt * 1000;
    } else this.lagMs = Math.max(0, this.lagMs - dt * 1000 * 0.5);
    const input: AnimInput = {
      state: v.state,
      elapsed: Math.max(0, v.elapsed - this.lagMs),
      dur: v.dur,
      attack: v.attack,
      windup: v.windup,
      key: v.key,
      serial: v.serial,
      speed: v.state === 'dodge' ? 0 : this.speed,
      moveForward: this.moveF,
      moveSide: this.moveS,
      airborne: this.airborne,
      blockHeld: this.b,
      buff: buffActive,
      dodgeKind: v.dodgeKind,
      execBy: v.state === 'executed' ? (this.execBy ?? undefined) : undefined,
      yaw: this.yaw,
    };
    const ent = this.entrance;
    // s along the ring entrance while it plays (NaN otherwise); before it they haven't arrived yet
    let entS = NaN;
    if (ent && v.state === 'idle' && serverNow >= ent.start && serverNow < ent.start + ent.dur) {
      Object.assign(input, { entrance: true, elapsed: serverNow - ent.start, dur: ent.dur, speed: 0 });
      entS = (serverNow - ent.start) / ent.dur;
    } else if (ent && serverNow >= ent.start + ent.dur) this.entrance = null;
    const waiting = !!ent && serverNow < ent.start;
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    if (this.freezeMs > 0 && this.shudder > 0) {
      // a sideways judder that dies away as the hitstop ends
      const k = this.shudder * this.model.scale * Math.min(1, this.freezeMs / this.freezeTotal);
      const f = forward(this.yaw);
      const j = (Math.random() * 2 - 1) * k;
      this.model.root.position.x += f.z * j + (Math.random() - 0.5) * k * 0.5;
      this.model.root.position.z += -f.x * j + (Math.random() - 0.5) * k * 0.5;
    } else if (this.freezeMs <= 0) this.shudder = 0;
    this.model.update(input, this.freezeMs > 0 ? dt * 0.1 : dt);
    // shadow step / dead fade
    this.model.setVisible(!waiting && !(v.state === 'dodge' && this.char.ability.kind === 'teleport' && v.elapsed < 250 && !v.attack && this.dodgeIsVanish()));

    // weapon trails follow the swing, coloured by the character and how big the move is
    const atk = v.attack;
    const m = this.model;
    const frame = m.frame;
    const live =
      (!!atk && v.state === 'attack' && !atk.noHitbox) ||
      (v.state === 'dodge' && !!frame?.trail) ||
      ENTRANCES[this.roster.char].trails.some(([a, b]) => entS >= a && entS <= b);
    const tc = m.animator.style.trail;
    const big = isHeavyKey(v.key) || v.key === 'ab' || v.key === 'ia' || v.key === 'ct' || !Number.isNaN(entS);
    const color = frame?.trail?.color ?? (atk?.perilous ? tc.special : big ? tc.heavy : tc.light);
    // long enough to read as a ribbon through the whole arc of the swing
    const life = frame?.trail?.life ?? (atk?.perilous ? 0.34 : big ? 0.32 : 0.24);
    const glow = frame?.trail?.glow ?? (atk?.perilous ? 0.85 : big ? 0.55 : 0.25);
    // big swings smear the whole crescent from the hand out; lights a band near the tip
    const fill = atk?.perilous || big ? 0.95 : 0.5;
    for (const t of [this.trail, this.offTrail, this.kickTrail]) {
      t?.setColor(color);
      t?.setStyle(life, glow, fill);
    }
    // through a chain the swoosh doesn't stop between moves: while the weapon is still whipping
    // round (recovery flowing into the next windup) it keeps drawing
    const flowing = v.state === 'attack' && this.tipSpeed > 7;
    m.weaponXf('main', this.tmpPos, this.tmpQuat, this.tmpScale);
    this.trail.update(dt, (live && m.swingMain) || flowing, this.tmpPos, this.tmpQuat, this.tmpScale.x, m.trailMain.base, m.trailMain.tip);
    if (this.offTrail && m.trailOff && m.weaponXf('off', this.tmpPos, this.tmpQuat, this.tmpScale)) {
      this.offTrail.update(dt, live && m.swingOff, this.tmpPos, this.tmpQuat, this.tmpScale.x, m.trailOff.base, m.trailOff.tip);
    }
    const kick = frame?.kick;
    m.footXf(kick?.foot ?? 'R', this.tmpPos, this.tmpQuat, this.tmpScale);
    this.kickTrail.update(dt, live && !!frame?.swingKick, this.tmpPos, this.tmpQuat, this.tmpScale.x, KICK_BASE, KICK_TIP);

    // how the weapon is moving right now
    this.weaponTip(this.tmpTip);
    if (this.tipValid && dt > 0) {
      const vel = this.tmpPos.subVectors(this.tmpTip, this.lastTip).divideScalar(dt);
      const sp = vel.length();
      this.tipSpeed = sp;
      if (sp > 2.5) this.swingDir.lerp(vel.divideScalar(sp), 0.6).normalize();
    }
    this.lastTip.copy(this.tmpTip);
    this.tipValid = true;

    // effect cues from the move, resolved to where they happen
    if (frame) for (const cue of frame.fx) this.fxQueue.push({ cue, pos: this.anchor(cue.at, new THREE.Vector3()), dir: forward3(this.yaw), fighter: this });

    // perilous glyph during the windup
    const perilous = v.state === 'attack' && !!atk?.perilous && v.elapsed < v.windup + atk.active;
    this.glyph.visible = perilous;
    if (perilous) {
      this.glyph.position.set(this.pos.x, this.pos.y + 2.5 * this.model.scale, this.pos.z);
      const pulse = 0.65 + Math.sin(serverNow / 50) * 0.08;
      this.glyph.scale.setScalar(pulse);
    }
  }

  /** World position of an effect anchor on this fighter. */
  anchor(at: FxAnchor, out: THREE.Vector3): THREE.Vector3 {
    const m = this.model;
    switch (at) {
      case 'tip':
        return this.weaponTip(out);
      case 'main':
        m.weaponXf('main', out, this.tmpQuat, this.tmpScale);
        return out;
      case 'off':
        if (!m.weaponXf('off', out, this.tmpQuat, this.tmpScale)) out.set(this.pos.x, this.pos.y + 1.2, this.pos.z);
        return out;
      case 'offTip': {
        const off = { base: new THREE.Vector3(), tip: new THREE.Vector3() };
        if (m.weaponTips(this.tmpBase, out, off)) return out.copy(off.tip);
        return this.weaponTip(out);
      }
      case 'kick':
        m.footXf(m.frame?.kick?.foot ?? 'R', out, this.tmpQuat, this.tmpScale);
        return out;
      case 'feet':
        return out.set(this.pos.x, Math.max(0, this.pos.y) + 0.05, this.pos.z);
      case 'root':
        return out.set(this.pos.x, this.pos.y + 1.0 * m.scale, this.pos.z);
      case 'front': {
        const f = forward(this.yaw);
        return out.set(this.pos.x + f.x * 1.4, this.pos.y + 0.05, this.pos.z + f.z * 1.4);
      }
    }
  }

  /** 0..1 special meter (full = the special is ready). */
  specialCharge(serverNow: number): number {
    const ready = this.sim ? this.sim.specialReadyAt : this.specialReadyAt;
    const cd = this.char.special.cooldown;
    return cd > 0 ? Math.max(0, Math.min(1, 1 - (ready - serverNow) / cd)) : 1;
  }

  private dodgeIsVanish(): boolean {
    if (this.sim) return this.sim.dodgeDist === 0;
    return this.speed < 1;
  }

  weaponTip(out: THREE.Vector3): THREE.Vector3 {
    this.model.weaponTips(this.tmpBase, out);
    return out;
  }

  dispose(): void {
    this.scene.remove(this.model.root, this.trail.mesh, this.kickTrail.mesh, this.glyph);
    this.kickTrail.dispose();
    if (this.offTrail) {
      this.scene.remove(this.offTrail.mesh);
      this.offTrail.dispose();
    }
    this.model.dispose();
    this.trail.dispose();
  }
}
