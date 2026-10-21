/**
 * Turns combat state into a pose every frame.
 *
 * Attacks run on the gameplay clock so they always line up with the server's hit timing:
 *   windup:   blend from wherever we were into the move's opening pose, then travel (or coil) to
 *             the chamber, the last moment before the strike
 *   swing:    accelerate along the weapon path so it crosses each hit's mark exactly when that hit
 *             resolves, then follow through
 *   recovery: settle (or play the move's flourish), then flow back to guard
 * Every new state blends from the current pose, so combos chain from where the last cut ended.
 */
import * as THREE from 'three';
import { AttackDef, CharacterDef } from '../../../shared/characters';
import { FighterState } from '../../../shared/fighter';
import { BodyKey, BodyPose, FxCue, Motion, MoveDef, Pose, Rot, Style, TrailStyle, WeaponXf, bodyToTorso } from './author';
import { clamp01, easeIn, easeInOut, easeOut, kick, orientWeapon, smooth } from './math';
import { STYLES, moveFor } from './styles';

export type DodgeKind = 'roll' | 'leap' | 'vanish';

export interface AnimInput {
  state: FighterState;
  /** ms since the state began (on the gameplay clock) */
  elapsed: number;
  /** state duration for timed states */
  dur: number;
  attack: AttackDef | null;
  windup: number;
  /** attack key (l0, h, sp...) for per-move variations */
  key?: string;
  /** changes whenever a new attack starts */
  serial?: number;
  /** horizontal speed m/s, and its direction relative to facing */
  speed: number;
  moveForward: number;
  moveSide: number;
  airborne: boolean;
  blockHeld: boolean;
  buff: boolean;
  /** what kind of dodge this is (abilities reuse the dodge state) */
  dodgeKind?: DodgeKind;
}

/** A pose with every optional part filled in, ready to blend and to drive the rig. */
export interface ResolvedPose {
  body: BodyPose;
  main: WeaponXf;
  off: WeaponXf | null;
  /** where the left hand goes when it holds nothing */
  free: THREE.Vector3;
}

export interface KickTarget {
  foot: 'L' | 'R';
  /** foot position in the root frame */
  pos: THREE.Vector3;
  /** 0..1 how much the foot follows the kick instead of its stance */
  w: number;
}

export interface AnimFrame {
  pose: ResolvedPose;
  /** whole-body yaw (spins), pitch (flips) and roll (cartwheels), radians */
  spin: number;
  flip: number;
  roll: number;
  /** 0..1 blend into lying on the ground */
  lying: number;
  /** ankle targets in the fighter's root frame */
  feet: { L: THREE.Vector3; R: THREE.Vector3 };
  kick: KickTarget | null;
  swingMain: boolean;
  swingOff: boolean;
  /** the kicking foot is mid-strike (drives a trail) */
  swingKick: boolean;
  /** effect cues that fired this frame */
  fx: FxCue[];
  /** leave an afterimage this frame */
  ghost: boolean;
  /** trail look for the current move */
  trail: TrailStyle | null;
  /** where the current move is along its s axis (NaN outside moves; for tools) */
  s: number;
}

export type Reaction = 'deflect' | 'blocked' | 'hit' | 'roar';

const REST_LEFT = new THREE.Vector3(0.3, 0.12, 0.08);
/** seconds a style's roar takes */
const ROAR_TIME = 1.05;
const ZERO_ROT: Rot = { spin: 0, flip: 0, roll: 0, hop: 0 };

// ------------------------------------------------------------------------------------ pose ops

function cloneXf(x: WeaponXf): WeaponXf {
  return { pos: x.pos.clone(), quat: x.quat.clone(), grip2: x.grip2, hold2: x.hold2 };
}

function lerpBody(a: BodyPose, b: BodyPose, t: number): BodyPose {
  const l = (x: number, y: number) => x + (y - x) * t;
  return {
    crouch: l(a.crouch, b.crouch),
    lean: l(a.lean, b.lean),
    twist: l(a.twist, b.twist),
    side: l(a.side, b.side),
    hipTwist: l(a.hipTwist, b.hipTwist),
    headPitch: l(a.headPitch, b.headPitch),
    front: t < 0.5 ? a.front : b.front,
    step: l(a.step, b.step),
    back: l(a.back, b.back),
    width: l(a.width, b.width),
    lift: l(a.lift, b.lift),
  };
}

function lerpXf(a: WeaponXf, b: WeaponXf, t: number): WeaponXf {
  return {
    pos: a.pos.clone().lerp(b.pos, t),
    quat: a.quat.clone().slerp(b.quat, t),
    grip2: a.grip2 + (b.grip2 - a.grip2) * t,
    hold2: a.hold2 + (b.hold2 - a.hold2) * t,
  };
}

function resolve(p: Pose): ResolvedPose {
  return { body: { ...p.body }, main: cloneXf(p.main), off: p.off ? cloneXf(p.off) : null, free: (p.free ?? REST_LEFT).clone() };
}

function lerpResolved(a: ResolvedPose, b: ResolvedPose, t: number): ResolvedPose {
  return {
    body: lerpBody(a.body, b.body, t),
    main: lerpXf(a.main, b.main, t),
    off: a.off && b.off ? lerpXf(a.off, b.off, t) : cloneOff(t < 0.5 ? a.off : b.off),
    free: a.free.clone().lerp(b.free, t),
  };
}

function cloneOff(x: WeaponXf | null): WeaponXf | null {
  return x ? cloneXf(x) : null;
}

function cloneResolved(p: ResolvedPose): ResolvedPose {
  return lerpResolved(p, p, 0);
}

const _dir = new THREE.Vector3();
const _grip = new THREE.Vector3();

/** Hand targets (torso space) for a pose: the right hand on the grip, the left on the second grip, its item or free. */
export function handTargets(p: ResolvedPose, rh: THREE.Vector3, lh: THREE.Vector3): void {
  rh.copy(p.main.pos);
  lh.copy(p.off ? p.off.pos : p.free);
  if (p.main.hold2 > 0.001) {
    _dir.set(0, 0, 1).applyQuaternion(p.main.quat);
    _grip.copy(p.main.pos).addScaledVector(_dir, p.main.grip2);
    lh.lerp(_grip, p.main.hold2);
  }
}

const _q = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Tilt a held weapon about the torso's left-right axis (negative tips the point up and back). */
function tilt(x: WeaponXf, angle: number): void {
  _q.setFromAxisAngle(X_AXIS, angle);
  x.quat.premultiply(_q);
}

/** Move everything held (weapon, off item, free hand) together. */
function shiftHands(p: ResolvedPose, d: THREE.Vector3, k = 1): void {
  p.main.pos.addScaledVector(d, k);
  p.free.addScaledVector(d, k);
  if (p.off) p.off.pos.addScaledVector(d, k);
}

// ------------------------------------------------------------------------------------ keys

const BODY_CHANNELS = ['crouch', 'lean', 'twist', 'side', 'hipTwist', 'headPitch', 'step', 'back', 'width', 'lift'] as const;
const ROT_CHANNELS = ['spin', 'flip', 'roll', 'hop'] as const;

/** Cubic Hermite through the keys: smooth, and easing in and out at the first and last key. */
function hermite(keys: BodyKey[], i: number, t: number, get: (k: BodyKey) => number): number {
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const d = k2.s - k1.s;
  const p1 = get(k1);
  const p2 = get(k2);
  const m1 = i > 0 ? ((p2 - get(keys[i - 1])) / (k2.s - keys[i - 1].s)) * d : 0;
  const m2 = i + 2 < keys.length ? ((get(keys[i + 2]) - p1) / (keys[i + 2].s - k1.s)) * d : 0;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
}

function evalKeys(keys: BodyKey[], s: number): { body: BodyPose; rot: Rot } {
  if (keys.length === 1 || s <= keys[0].s) return { body: { ...keys[0].b }, rot: { ...keys[0].r } };
  const last = keys[keys.length - 1];
  if (s >= last.s) return { body: { ...last.b }, rot: { ...last.r } };
  let i = 0;
  while (i < keys.length - 2 && s >= keys[i + 1].s) i++;
  const t = (s - keys[i].s) / Math.max(1e-6, keys[i + 1].s - keys[i].s);
  const body = { ...keys[i].b };
  for (const c of BODY_CHANNELS) body[c] = hermite(keys, i, t, (k) => k.b[c]);
  body.front = t < 0.5 ? keys[i].b.front : keys[i + 1].b.front;
  const rot = { ...ZERO_ROT };
  for (const c of ROT_CHANNELS) rot[c] = hermite(keys, i, t, (k) => k.r[c]);
  return { body, rot };
}

// ------------------------------------------------------------------------------------ motions

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _e = new THREE.Vector3();

function evalMotion(m: Motion, s: number, axis: Style['axis'], body: BodyPose, hold: WeaponXf | null): WeaponXf | null {
  switch (m.kind) {
    case 'hold':
      return hold ? cloneXf(hold) : null;
    case 'seq': {
      const parts = m.parts;
      let i = 0;
      while (i < parts.length - 1 && s >= parts[i].to) i++;
      const local = (p: (typeof parts)[number]) => (s - p.from) / Math.max(1e-6, p.to - p.from);
      const cur = evalMotion(parts[i].m, local(parts[i]), axis, body, hold);
      // crossfade with the neighbouring part near a boundary so the weapon never jumps
      const b = m.blend;
      if (b > 0 && cur) {
        if (i > 0 && s < parts[i].from + b) {
          const prev = evalMotion(parts[i - 1].m, local(parts[i - 1]), axis, body, hold);
          if (prev) return lerpXf(prev, cur, smooth((s - (parts[i].from - b)) / (2 * b)));
        }
        if (i < parts.length - 1 && s > parts[i].to - b) {
          const next = evalMotion(parts[i + 1].m, local(parts[i + 1]), axis, body, hold);
          if (next) return lerpXf(cur, next, smooth((s - (parts[i].to - b)) / (2 * b)));
        }
      }
      return cur;
    }
    case 'arc':
    case 'line': {
      let grip2: number;
      if (m.kind === 'arc') {
        m.arc.at(s, _d, _t);
        _p.copy(m.pivot);
        if (m.pivot1) _p.lerp(m.pivot1, clamp01(s));
        _p.addScaledVector(_d, m.r);
        if (m.edgeSign === 0) _e.set(0, 1, 0);
        else _e.copy(_t).multiplyScalar(m.edgeSign);
        grip2 = m.grip2;
      } else {
        _p.copy(m.from).lerp(m.to, s);
        _d.copy(m.d0).lerp(m.d1, clamp01(s)).normalize();
        _e.copy(m.edge);
        grip2 = m.grip2a + (m.grip2b - m.grip2a) * clamp01(s);
      }
      if (m.body) {
        // authored relative to the hips: undo the torso's turn and lean
        bodyToTorso(_p, body.twist, body.lean);
        bodyToTorso(_d, body.twist, body.lean);
        bodyToTorso(_e, body.twist, body.lean);
      }
      const two = Number.isFinite(grip2);
      const quat = orientWeapon(_d, _e, axis, new THREE.Quaternion());
      if (m.roll) quat.multiply(_q.setFromAxisAngle(Z_AXIS, m.roll * Math.PI * 2 * clamp01(s)));
      return { pos: _p.clone(), quat, grip2: two ? grip2 : 0, hold2: two ? 1 : 0 };
    }
  }
}

// ------------------------------------------------------------------------------------ animator

interface MoveFrame {
  pose: ResolvedPose;
  rot: Rot;
  kick: KickTarget | null;
}

export class Animator {
  readonly style: Style;
  private current: ResolvedPose;
  private snapshot: ResolvedPose;
  private snapRot: Rot = { ...ZERO_ROT };
  private curRot: Rot = { ...ZERO_ROT };
  private stateKey = '';
  private lastElapsed = 0;
  private walkPhase = 0;
  private walkWeight = 0;
  private breath = Math.random() * 10;
  private reactions: { kind: Reaction; t: number }[] = [];
  private feet = { L: new THREE.Vector3(0.13, 0.05, 0.2), R: new THREE.Vector3(-0.13, 0.05, -0.18) };
  /** effect cues: the furthest s this move has reached, so each cue fires once */
  private fxMaxS = -Infinity;
  /** seconds into the style's roar (-1: not roaring), and how far its cues have fired */
  private roarT = -1;
  private roarFxS = -Infinity;

  constructor(readonly char: CharacterDef) {
    this.style = STYLES[char.weaponKind];
    this.current = resolve(this.style.guard);
    this.snapshot = cloneResolved(this.current);
  }

  react(kind: Reaction): void {
    if (kind === 'roar' && this.style.roar) {
      this.roarT = 0;
      this.roarFxS = -Infinity;
      return;
    }
    this.reactions.push({ kind, t: 0 });
    if (this.reactions.length > 6) this.reactions.shift();
  }

  update(a: AnimInput, dt: number): AnimFrame {
    const key = `${a.state}|${a.serial ?? 0}|${a.key ?? ''}|${a.dodgeKind ?? ''}`;
    if (key !== this.stateKey || a.elapsed < this.lastElapsed - 30) {
      this.stateKey = key;
      this.snapshot = cloneResolved(this.current);
      this.snapRot = { ...this.curRot };
      this.fxMaxS = -Infinity;
    }
    this.lastElapsed = a.elapsed;

    const out: AnimFrame = {
      pose: this.current,
      spin: 0,
      flip: 0,
      roll: 0,
      lying: 0,
      feet: this.feet,
      kick: null,
      swingMain: false,
      swingOff: false,
      swingKick: false,
      fx: [],
      ghost: false,
      trail: null,
      s: NaN,
    };
    let rot: Rot = { ...ZERO_ROT };

    if (a.state === 'attack' && a.attack) {
      const r = this.attackPose(a, a.attack, out);
      out.pose = r.pose;
      rot = r.rot;
      out.kick = r.kick;
    } else if (a.state === 'dodge' && a.dodgeKind && a.dodgeKind !== 'roll' && (a.dodgeKind === 'leap' ? this.style.leap : this.style.vanish)) {
      const def = (a.dodgeKind === 'leap' ? this.style.leap : this.style.vanish)!;
      const r = this.abilityPose(a, def, out);
      out.pose = r.pose;
      rot = r.rot;
    } else {
      const { target, tau } = this.statePose(a);
      const k = easeOut(a.elapsed / tau, 3);
      out.pose = lerpResolved(this.snapshot, target, k);
      // whatever spin or flip the last move ended on unwinds to the nearest whole turn
      for (const c of ROT_CHANNELS) rot[c] = this.snapRot[c] + (settleTurn(this.snapRot[c], c) - this.snapRot[c]) * k;
      if (a.state === 'dead' || a.state === 'knockdown') {
        // a falling drop, and for knockdowns a push back up at the end
        out.lying = easeIn(a.elapsed / 380, 2);
        if (a.state === 'knockdown' && a.dur - a.elapsed < 380) out.lying = Math.min(out.lying, smooth((a.dur - a.elapsed) / 380));
      }
    }

    if (this.roarT >= 0) rot = this.roarOverlay(a, out, rot, dt);

    this.current = cloneResolved(out.pose);
    this.curRot = { ...rot };
    out.pose.body.lift += rot.hop;
    out.spin = rot.spin * Math.PI * 2;
    out.flip = rot.flip * Math.PI * 2;
    out.roll = rot.roll * Math.PI * 2;
    this.locomotion(a, out.pose, dt);
    this.applyReactions(out.pose, dt);
    out.feet = this.footTargets(a, out.pose.body, dt, out.lying);
    return out;
  }

  // ---------------------------------------------------------------- moves

  private movePose(def: MoveDef, s: number): MoveFrame {
    const st = this.style;
    const { body, rot } = evalKeys(def.keys, s + def.bodyLead);
    const main = evalMotion(def.main, s, st.axis, body, st.guard.main)!;
    const off = def.off ? evalMotion(def.off, s, st.offAxis, body, st.guard.off) : st.guard.off ? cloneXf(st.guard.off) : null;
    const free = def.free ? evalMotion(def.free, s, st.axis, body, null)!.pos : (st.guard.free ?? REST_LEFT).clone();
    let kickT: KickTarget | null = null;
    if (def.kick) {
      const k = def.kick;
      const w = smooth((s - (k.from - 0.18)) / 0.18) * (1 - smooth((s - k.to) / 0.25));
      if (w > 0) {
        const local = (s - k.from) / Math.max(1e-6, k.to - k.from);
        const xf = evalMotion(k.path, Math.min(1.05, Math.max(-0.05, local)), st.axis, body, null);
        if (xf) kickT = { foot: k.foot, pos: xf.pos.clone(), w };
      }
    }
    return { pose: { body, main, off, free }, rot, kick: kickT };
  }

  /** Fire the cues between the furthest s reached so far and s. */
  private cues(def: MoveDef, s: number, out: AnimFrame): void {
    out.s = s;
    if (this.fxMaxS === -Infinity) this.fxMaxS = Math.min(def.sStart, def.sChamber) - 1e-3;
    if (s <= this.fxMaxS) return;
    for (const c of def.fx) if (c.s > this.fxMaxS && c.s <= s) out.fx.push(c);
    this.fxMaxS = s;
  }

  private attackPose(a: AnimInput, atk: AttackDef, out: AnimFrame): MoveFrame {
    const def = moveFor(this.style, atk.anim, a.key ?? '');
    out.trail = def.trail;
    const w = Math.max(1, a.windup);
    const total = w + atk.active + atk.recovery;
    const n = def.impacts.length;
    // one visual strike per hit, spread over the active frames the way the server spreads hits
    const hitT = def.impacts.map((_, i) => w + (i * atk.active) / n);
    // the swing starts a little before the first hit and follows through after the last
    const lead = Math.min(130, Math.max(45, w * 0.42));
    const t0 = w - lead;
    const tail = Math.min(150, Math.max(70, (atk.active / n) * 0.5 + 50));
    const t1 = Math.min(total * 0.94, w + atk.active + tail);
    const e = a.elapsed;
    const swingsMain = def.main.kind !== 'hold';
    const swingsOff = !!def.off && def.off.kind !== 'hold';

    if (def.flow > 0 && e < hitT[0]) {
      // a continuous windup: one accelerating motion from the opening pose into the hit
      const k = e / Math.max(1, hitT[0]);
      const s = def.sStart + (def.impacts[0] - def.sStart) * Math.pow(k, def.flow);
      this.cues(def, s, out);
      const f = this.movePose(def, s);
      const bw = easeOut(e / Math.max(1, t0) / def.blendIn, 3);
      out.swingMain = swingsMain && s >= def.sChamber;
      out.swingOff = swingsOff && s >= def.sChamber;
      out.ghost = !!def.ghosts && s >= def.ghosts[0] && s <= def.ghosts[1];
      return { pose: lerpResolved(this.snapshot, f.pose, bw), rot: lerpRot(this.snapRot, f.rot, bw), kick: f.kick };
    }
    if (e < t0) {
      // windup: blend in to the opening pose, then travel (or coil) to the chamber
      const k = e / Math.max(1, t0);
      const s = def.sStart + (def.sChamber - def.sStart) * smooth((k - def.travel) / (1 - def.travel));
      this.cues(def, s, out);
      const f = this.movePose(def, s);
      const bw = easeOut(k / def.blendIn, 3);
      return { pose: lerpResolved(this.snapshot, f.pose, bw), rot: lerpRot(this.snapRot, f.rot, bw), kick: f.kick };
    }
    if (e < t1) {
      let s: number;
      if (e < hitT[0]) {
        const q = (e - t0) / Math.max(1, hitT[0] - t0);
        s = def.sChamber + (def.impacts[0] - def.sChamber) * q * q; // accelerating into the hit
      } else if (e < hitT[n - 1]) {
        let i = 0;
        while (i < n - 2 && e >= hitT[i + 1]) i++;
        const q = (e - hitT[i]) / Math.max(1, hitT[i + 1] - hitT[i]);
        s = def.impacts[i] + (def.impacts[i + 1] - def.impacts[i]) * q;
      } else {
        const q = (e - hitT[n - 1]) / Math.max(1, t1 - hitT[n - 1]);
        s = def.impacts[n - 1] + (def.sEnd - def.impacts[n - 1]) * (1 - Math.pow(1 - clamp01(q), 2.4)); // decelerating follow-through
      }
      this.cues(def, s, out);
      const f = this.movePose(def, s);
      out.swingMain = swingsMain;
      out.swingOff = swingsOff;
      out.swingKick = !!f.kick && f.kick.w > 0.5;
      out.ghost = !!def.ghosts && s >= def.ghosts[0] && s <= def.ghosts[1];
      return f;
    }
    // recovery: settle out of the follow-through (or play the flourish), then flow back to guard
    const k = (e - t1) / Math.max(1, total - t1);
    const s = def.sEnd + (def.sRest - def.sEnd) * (def.settle >= 0.45 ? easeInOut(k / def.settle) : easeOut(k / def.settle, 2));
    this.cues(def, s, out);
    const f = this.movePose(def, s);
    const guardFrom = Math.max(0.18, def.settle * 0.75);
    const gw = easeInOut((k - guardFrom) / (1 - guardFrom));
    const guard = this.guardPose(a);
    const rot = { ...f.rot };
    for (const c of ROT_CHANNELS) rot[c] = f.rot[c] + (settleTurn(f.rot[c], c) - f.rot[c]) * gw;
    return { pose: lerpResolved(f.pose, guard, gw), rot, kick: f.kick && { ...f.kick, w: f.kick.w * (1 - gw) } };
  }

  /** Leap and vanish abilities: the dodge state plays a whole move over its duration. */
  private abilityPose(a: AnimInput, def: MoveDef, out: AnimFrame): MoveFrame {
    const dur = Math.max(1, a.dur);
    const k = clamp01(a.elapsed / dur);
    const s = def.sStart + (def.sRest - def.sStart) * k;
    this.cues(def, s, out);
    out.ghost = !!def.ghosts && s >= def.ghosts[0] && s <= def.ghosts[1];
    out.trail = def.trail;
    const f = this.movePose(def, s);
    const bin = easeOut(k / 0.2, 2);
    const bout = easeInOut((k - 0.8) / 0.2);
    const guard = this.guardPose(a);
    const pose = lerpResolved(lerpResolved(this.snapshot, f.pose, bin), guard, bout);
    const rot = lerpRot(this.snapRot, f.rot, bin);
    for (const c of ROT_CHANNELS) rot[c] += (settleTurn(rot[c], c) - rot[c]) * bout;
    return { pose, rot, kick: null };
  }

  /** The style's roar plays over the neutral pose (it never interrupts a move). */
  private roarOverlay(a: AnimInput, out: AnimFrame, rot: Rot, dt: number): Rot {
    const def = this.style.roar!;
    this.roarT += dt;
    const k = this.roarT / ROAR_TIME;
    if (k >= 1 || a.state !== 'idle') {
      this.roarT = -1;
      return rot;
    }
    const s = def.sStart + (def.sRest - def.sStart) * k;
    if (this.roarFxS === -Infinity) this.roarFxS = def.sStart - 1e-3;
    for (const c of def.fx) if (c.s > this.roarFxS && c.s <= s) out.fx.push(c);
    this.roarFxS = s;
    const f = this.movePose(def, s);
    const w = easeOut(k / 0.15, 2) * (1 - easeInOut((k - 0.75) / 0.25));
    out.pose = lerpResolved(out.pose, f.pose, w);
    return lerpRot(rot, f.rot, w);
  }

  // ---------------------------------------------------------------- other states

  private guardPose(a: AnimInput): ResolvedPose {
    const p = resolve(this.style.guard);
    if (a.airborne) shiftHands(p, UP, 0.08);
    return p;
  }

  private statePose(a: AnimInput): { target: ResolvedPose; tau: number } {
    const st = this.style;
    const e = a.elapsed;
    const dur = Math.max(1, a.dur);
    const t = e / dur;
    switch (a.state) {
      case 'block':
        return { target: resolve(st.block), tau: 90 };
      case 'blockstun': {
        // the guard is driven back by the impact, then recovers
        const p = resolve(st.block);
        const k = kick(e / 55);
        shiftHands(p, BACK, 0.09 * k);
        tilt(p.main, -0.12 * k);
        p.body.lean -= 0.16 * k;
        p.body.crouch -= 0.03 * k;
        return { target: p, tau: 40 };
      }
      case 'stagger': {
        const p = this.guardPose(a);
        const k = t < 0.18 ? easeOut(t / 0.18) : 1 - easeInOut((t - 0.18) / 0.82);
        tilt(p.main, 0.55 * k);
        shiftHands(p, _t.set(0, -0.1, -0.06), k);
        p.body.lean -= 0.38 * k;
        p.body.crouch -= 0.1 * k;
        p.body.headPitch -= 0.35 * k;
        p.body.back += 0.12 * k;
        return { target: p, tau: 50 };
      }
      case 'deflected': {
        // flung back by the deflect: weapon thrown up behind the shoulder, body rocked back
        const p = this.guardPose(a);
        const k = t < 0.14 ? easeOut(t / 0.14) : t < 0.6 ? 1 : 1 - easeInOut((t - 0.6) / 0.4);
        const wob = Math.sin(e / 38) * 0.06 * (t < 0.6 ? 1 - t : 0);
        tilt(p.main, (-1.5 + wob) * k);
        p.main.pos.addScaledVector(_t.set(-0.04, 0.24, -0.14), k);
        p.free.addScaledVector(_t.set(0.06, 0.1, -0.1), k);
        if (p.off) {
          tilt(p.off, -0.5 * k);
          p.off.pos.addScaledVector(_t.set(0.05, 0.05, -0.12), k);
        }
        p.body.lean -= 0.45 * k;
        p.body.twist -= 0.22 * k;
        p.body.headPitch -= 0.3 * k;
        p.body.step -= 0.08 * k;
        p.body.back += 0.14 * k;
        return { target: p, tau: 40 };
      }
      case 'broken': {
        // dropped to one knee, weapon point on the ground, swaying
        const p = this.guardPose(a);
        tilt(p.main, 0.95);
        shiftHands(p, _t.set(0, -0.18, 0.06));
        if (p.off) tilt(p.off, 0.6);
        p.body.crouch = -0.44;
        p.body.lean = 0.48 + Math.sin(e / 160) * 0.04;
        p.body.headPitch = 0.45;
        p.body.twist += Math.sin(e / 420) * 0.12;
        p.body.step = 0.32;
        p.body.back = 0.34;
        return { target: p, tau: 160 };
      }
      case 'knockdown':
      case 'dead': {
        // flat on the back: arms flung out, the weapon dropped flat beside the body
        const p = this.guardPose(a);
        p.main.pos.set(-0.55, 0.32, -0.04);
        orientWeapon(_d.set(-0.4, -0.9, 0), _e.set(0, 0, 1), st.axis, p.main.quat);
        p.main.hold2 = 0;
        p.free.set(0.55, 0.36, -0.02);
        if (p.off) {
          p.off.pos.set(0.52, 0.3, 0.02);
          orientWeapon(_d.set(0, 0, 1), _e.set(0, 1, 0), st.offAxis, p.off.quat);
        }
        p.body.lean = 0.1;
        p.body.crouch = -0.05;
        p.body.headPitch = -0.2;
        return { target: p, tau: 220 };
      }
      case 'dodge': {
        const p = this.guardPose(a);
        const k = Math.sin(Math.PI * clamp01(t));
        const tuck = (v: THREE.Vector3) => {
          v.z *= 1 - 0.35 * k;
          v.y -= 0.05 * k;
        };
        tuck(p.main.pos);
        tuck(p.free);
        if (p.off) tuck(p.off.pos);
        p.body.crouch -= 0.24 * k;
        p.body.lean += 0.32 * k * a.moveForward;
        p.body.side -= 0.32 * k * a.moveSide;
        return { target: p, tau: 50 };
      }
      case 'stance': {
        const p = resolve(st.stance ?? st.guard);
        p.body.lean += Math.sin(e / 300) * 0.015;
        return { target: p, tau: 140 };
      }
      default:
        return { target: this.guardPose(a), tau: 150 };
    }
  }

  // ---------------------------------------------------------------- layers

  private locomotion(a: AnimInput, pose: ResolvedPose, dt: number): void {
    const b = pose.body;
    const moving = !a.airborne && a.speed > 0.35 && a.state !== 'dead' && a.state !== 'knockdown' && a.state !== 'broken';
    this.walkWeight += ((moving ? smooth(a.speed / 2.2) : 0) - this.walkWeight) * Math.min(1, dt * 10);
    // a planted foot covers one stride during the stance part of the cycle, so feet don't slide
    const g = gait(a.speed);
    if (moving) this.walkPhase = (this.walkPhase + (a.speed * dt * g.stance) / g.stride) % 1;
    const w = this.walkWeight;
    if (w > 0.01) {
      const ph = this.walkPhase * Math.PI * 2;
      // lowest as the feet pass, highest mid-stride
      b.lift += (Math.abs(Math.cos(ph)) * 0.045 - 0.03) * w;
      b.lean += 0.22 * a.moveForward * w * Math.min(1, a.speed / 6);
      b.side -= 0.07 * a.moveSide * w;
      b.twist += Math.sin(ph) * 0.07 * w;
      b.hipTwist -= Math.sin(ph) * 0.1 * w;
      // the weapon bobs with the step
      shiftHands(pose, UP, Math.sin(ph * 2) * 0.012 * w);
    }
    // breathing
    this.breath += dt;
    const br = Math.sin(this.breath * 1.9) * (1 - w);
    b.lean += br * 0.012;
    b.lift += br * 0.008;
    shiftHands(pose, UP, br * 0.008);
  }

  private applyReactions(pose: ResolvedPose, dt: number): void {
    for (let i = this.reactions.length - 1; i >= 0; i--) {
      const r = this.reactions[i];
      r.t += dt;
      const life = r.kind === 'roar' ? 0.95 : 0.35;
      if (r.t > life) {
        this.reactions.splice(i, 1);
        continue;
      }
      const b = pose.body;
      switch (r.kind) {
        case 'deflect': {
          // a crisp flick of the blade as it turns the strike aside
          const k = kick(r.t / 0.05);
          tilt(pose.main, -0.5 * k);
          shiftHands(pose, UP, 0.05 * k);
          b.twist += 0.12 * k;
          break;
        }
        case 'blocked': {
          // the weapon bounces off the guard
          const k = kick(r.t / 0.06);
          tilt(pose.main, -0.3 * k);
          shiftHands(pose, BACK, 0.05 * k);
          b.lean -= 0.08 * k;
          break;
        }
        case 'hit': {
          const k = kick(r.t / 0.05);
          b.lean -= 0.22 * k;
          b.headPitch -= 0.35 * k;
          b.crouch -= 0.04 * k;
          shiftHands(pose, BACK, 0.04 * k);
          break;
        }
        case 'roar': {
          // weapon raised to the sky
          const k = r.t < 0.15 ? easeOut(r.t / 0.15) : r.t < 0.6 ? 1 : 1 - easeInOut((r.t - 0.6) / 0.35);
          const q = orientWeapon(_t.set(0, 1, 0.15), _e.set(0, 0, 1), this.style.axis, _q);
          pose.main.pos.lerp(_p.set(-0.08, 0.78, 0.06), k);
          pose.main.quat.slerp(q, k);
          pose.free.lerp(_p.set(0.42, 0.5, 0.1), k);
          if (pose.off) pose.off.pos.lerp(_p.set(0.42, 0.5, 0.15), k);
          b.lean -= 0.25 * k;
          b.headPitch -= 0.5 * k;
          b.crouch -= 0.08 * k;
          break;
        }
      }
    }
  }

  /** Where each ankle goes, in the fighter's root frame: a planted stance, a stepping walk cycle or a tuck. */
  private footTargets(a: AnimInput, b: BodyPose, dt: number, lying: number): AnimFrame['feet'] {
    const lead = b.front;
    const stance = {
      L: new THREE.Vector3(b.width, 0.05, lead === 'L' ? b.step : -b.back),
      R: new THREE.Vector3(-b.width, 0.05, lead === 'R' ? b.step : -b.back),
    };
    const w = this.walkWeight;
    if (w > 0.01) {
      const dirX = a.moveSide;
      const dirZ = a.moveForward;
      const len = Math.hypot(dirX, dirZ) || 1;
      const { stride, stance: st, lift } = gait(a.speed);
      for (const [foot, off] of [['L', 0], ['R', 0.5]] as const) {
        const p = (this.walkPhase + off) % 1;
        let along: number;
        let up = 0;
        if (p < st) along = stride / 2 - stride * (p / st);
        else {
          const q = (p - st) / (1 - st);
          along = -stride / 2 + stride * easeInOut(q);
          up = Math.sin(Math.PI * q) * lift;
        }
        const target = new THREE.Vector3((foot === 'L' ? 0.13 : -0.13) + (dirX / len) * along, 0.05 + up, (dirZ / len) * along);
        stance[foot].lerp(target, w);
      }
    }
    if (a.airborne && lying < 0.5) {
      stance.L.set(0.13, 0.42, lead === 'L' ? 0.18 : -0.05);
      stance.R.set(-0.13, 0.36, lead === 'R' ? 0.18 : -0.05);
    }
    // hops tuck the legs up a little with the jump
    if (b.lift > 0.06) {
      const k = smooth((b.lift - 0.06) / 0.3);
      stance.L.y += 0.25 * k;
      stance.R.y += 0.18 * k;
    }
    const k = Math.min(1, dt * 24);
    this.feet.L.lerp(stance.L, k);
    this.feet.R.lerp(stance.R, k);
    return this.feet;
  }
}

function lerpRot(a: Rot, b: Rot, t: number): Rot {
  return { spin: a.spin + (b.spin - a.spin) * t, flip: a.flip + (b.flip - a.flip) * t, roll: a.roll + (b.roll - a.roll) * t, hop: a.hop + (b.hop - a.hop) * t };
}

/** Where a rotation channel comes to rest: whole turns for spins and flips, the ground for hops. */
function settleTurn(v: number, c: keyof Rot): number {
  return c === 'hop' ? 0 : Math.round(v);
}

const UP = new THREE.Vector3(0, 1, 0);
const BACK = new THREE.Vector3(0, 0, -1);

/** Stride length, the share of the cycle a foot is planted (less when running) and step height. */
function gait(speed: number): { stride: number; stance: number; lift: number } {
  return { stride: Math.min(0.72, 0.2 + speed * 0.08), stance: 0.6 - 0.28 * smooth((speed - 2) / 4), lift: 0.08 + speed * 0.022 };
}
