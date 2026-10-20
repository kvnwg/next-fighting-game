/**
 * Client-side fighter: the visual model plus either a locally predicted simulation (you) or an
 * interpolated replica of server state (everyone else).
 */
import * as THREE from 'three';
import { AttackDef, CHARACTERS, getAttack } from '../shared/characters';
import { INTERP_DELAY_MS } from '../shared/config';
import { Fighter, FighterState } from '../shared/fighter';
import { angleDiff, forward } from '../shared/math';
import { FighterSnap, RosterEntry } from '../shared/protocol';
import { AnimInput, CharacterModel } from './render/character';
import { WeaponTrail, makeGlyph } from './render/effects';

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
  readonly offTrail: WeaponTrail | null;
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
  private tmpTip = new THREE.Vector3();
  private tmpOff = { base: new THREE.Vector3(), tip: new THREE.Vector3() };

  constructor(
    roster: RosterEntry,
    isLocal: boolean,
    readonly scene: THREE.Scene,
  ) {
    this.roster = roster;
    this.isLocal = isLocal;
    this.model = new CharacterModel(roster.char);
    this.trail = new WeaponTrail('#ffffff');
    this.offTrail = this.model.weapon.offTip ? new WeaponTrail('#ffffff') : null;
    this.glyph = makeGlyph('危', '#ffffff', '#c41a1a');
    this.glyph.visible = false;
    scene.add(this.model.root, this.trail.mesh, this.glyph);
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
  }

  teleportTo(x: number, y: number, z: number, yaw?: number): void {
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
  view(serverNow: number): { state: FighterState; elapsed: number; dur: number; attack: AttackDef | null; windup: number; serial: number; key: string | undefined } {
    if (this.sim) {
      const s = this.sim;
      return {
        state: s.state,
        elapsed: serverNow - s.stateStart,
        dur: s.state === 'dodge' ? s.dodgeDur : s.stateDur,
        attack: s.attack,
        windup: s.atkWindup,
        serial: s.attackSerial,
        key: s.attackKey ?? undefined,
      };
    }
    const atk = this.s === 'attack' && this.a ? getAttack(this.char, this.a as never) : null;
    let dur = this.sd;
    if (this.s === 'dodge' && !dur) dur = 380;
    return { state: this.s, elapsed: serverNow - this.ss, dur, attack: atk, windup: this.aw || atk?.windup || 0, serial: this.serial, key: this.a };
  }

  updateVisual(dt: number, serverNow: number, buffActive: boolean): void {
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
    const input: AnimInput = {
      state: v.state,
      elapsed: v.elapsed,
      dur: v.dur,
      attack: v.attack,
      windup: v.windup,
      speed: v.state === 'dodge' ? 0 : this.speed,
      moveForward: this.moveF,
      moveSide: this.moveS,
      airborne: this.airborne,
      blockHeld: this.b,
      buff: buffActive,
    };
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    this.model.update(input, dt);
    // shadow step / dead fade
    this.model.setVisible(!(v.state === 'dodge' && this.char.ability.kind === 'teleport' && v.elapsed < 250 && !v.attack && this.dodgeIsVanish()));

    // weapon trails during the swing
    const atk = v.attack;
    const swinging = !!atk && v.state === 'attack' && !atk.noHitbox && v.elapsed > v.windup - 40 && v.elapsed < v.windup + atk.active + 60;
    const color = atk?.perilous ? '#ff4a3a' : v.key === 'h' ? '#ffd27a' : '#ffffff';
    this.trail.setColor(color);
    const hasOff = this.model.weaponTips(this.tmpBase, this.tmpTip, this.offTrail ? this.tmpOff : undefined);
    this.trail.update(dt, swinging, this.tmpBase, this.tmpTip);
    if (this.offTrail && hasOff) {
      this.offTrail.setColor(color);
      const offSwing = swinging && (atk?.anim === 'dualSlash' || atk?.anim === 'punchL' || atk?.anim === 'grab');
      this.offTrail.update(dt, offSwing, this.tmpOff.base, this.tmpOff.tip);
    }

    // perilous glyph during the windup
    const perilous = v.state === 'attack' && !!atk?.perilous && v.elapsed < v.windup + atk.active;
    this.glyph.visible = perilous;
    if (perilous) {
      this.glyph.position.set(this.pos.x, this.pos.y + 2.5 * this.model.scale, this.pos.z);
      const pulse = 0.65 + Math.sin(serverNow / 50) * 0.08;
      this.glyph.scale.setScalar(pulse);
    }
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
    this.scene.remove(this.model.root, this.trail.mesh, this.glyph);
    if (this.offTrail) {
      this.scene.remove(this.offTrail.mesh);
      this.offTrail.dispose();
    }
    this.model.dispose();
    this.trail.dispose();
  }
}
