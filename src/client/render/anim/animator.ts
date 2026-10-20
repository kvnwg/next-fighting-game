/**
 * Turns combat state into a pose every frame.
 *
 * Attacks run on the gameplay clock so they always line up with the server's hit timing:
 *   windup:   blend from wherever we were into the chamber, then coil a little further back
 *   swing:    accelerate along the weapon path, crossing the middle of the arc as the hit lands
 *   recovery: overshoot, settle, then flow back to guard
 * Every new state blends from the current pose (combos chain from where the last cut ended).
 */
import * as THREE from 'three';
import { AttackDef, CharacterDef } from '../../../shared/characters';
import { FighterState } from '../../../shared/fighter';
import { clamp01, easeIn, easeInOut, easeOut, kick, orientWeapon, smooth } from './math';
import { BodyPose, Motion, MoveDef, Pose, STYLES, Style, WeaponXf, bodyToTorso, moveFor } from './styles';

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
}

/** A pose with every optional part filled in, ready to blend and to drive the rig. */
export interface ResolvedPose {
  body: BodyPose;
  main: WeaponXf;
  off: WeaponXf | null;
  /** where the left hand goes when it holds nothing */
  free: THREE.Vector3;
}

export interface AnimFrame {
  pose: ResolvedPose;
  /** extra whole-body yaw (spin attacks) */
  spin: number;
  /** 0..1 blend into lying on the ground */
  lying: number;
  /** ankle targets in the fighter's root frame */
  feet: { L: THREE.Vector3; R: THREE.Vector3 };
  swingMain: boolean;
  swingOff: boolean;
}

export type Reaction = 'deflect' | 'blocked' | 'hit' | 'roar';

const S_ANTI = -0.08; // how far past the start the weapon coils before the swing
const S_IMPACT = 0.45; // where along the path the weapon is when the hit lands
const S_END = 1.07; // overshoot before settling
const REST_LEFT = new THREE.Vector3(0.3, 0.12, 0.08);

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

// ------------------------------------------------------------------------------------ motions

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _e = new THREE.Vector3();

function evalMotion(m: Motion, s: number, axis: Style['axis'], body: BodyPose, hold: WeaponXf | null): WeaponXf | null {
  if (m.kind === 'hold') return hold ? cloneXf(hold) : null;
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
  return { pos: _p.clone(), quat: orientWeapon(_d, _e, axis, new THREE.Quaternion()), grip2: two ? grip2 : 0, hold2: two ? 1 : 0 };
}

// ------------------------------------------------------------------------------------ animator

export class Animator {
  readonly style: Style;
  private current: ResolvedPose;
  private snapshot: ResolvedPose;
  private stateKey = '';
  private lastElapsed = 0;
  private walkPhase = 0;
  private walkWeight = 0;
  private breath = Math.random() * 10;
  private reactions: { kind: Reaction; t: number }[] = [];
  private feet = { L: new THREE.Vector3(0.13, 0.05, 0.2), R: new THREE.Vector3(-0.13, 0.05, -0.18) };

  constructor(readonly char: CharacterDef) {
    this.style = STYLES[char.weaponKind];
    this.current = resolve(this.style.guard);
    this.snapshot = cloneResolved(this.current);
  }

  react(kind: Reaction): void {
    this.reactions.push({ kind, t: 0 });
    if (this.reactions.length > 6) this.reactions.shift();
  }

  update(a: AnimInput, dt: number): AnimFrame {
    const key = `${a.state}|${a.serial ?? 0}|${a.key ?? ''}`;
    if (key !== this.stateKey || a.elapsed < this.lastElapsed - 30) {
      this.stateKey = key;
      this.snapshot = cloneResolved(this.current);
    }
    this.lastElapsed = a.elapsed;

    let pose: ResolvedPose;
    let spin = 0;
    let swingMain = false;
    let swingOff = false;
    let lying = 0;

    if (a.state === 'attack' && a.attack) {
      const r = this.attackPose(a, a.attack);
      pose = r.pose;
      spin = r.spin;
      swingMain = r.swingMain;
      swingOff = r.swingOff;
    } else {
      const { target, tau } = this.statePose(a);
      pose = lerpResolved(this.snapshot, target, easeOut(a.elapsed / tau, 3));
      if (a.state === 'dead' || a.state === 'knockdown') {
        // a falling drop, and for knockdowns a push back up at the end
        lying = easeIn(a.elapsed / 380, 2);
        if (a.state === 'knockdown' && a.dur - a.elapsed < 380) lying = Math.min(lying, smooth((a.dur - a.elapsed) / 380));
      }
    }

    this.current = cloneResolved(pose);
    this.locomotion(a, pose, dt);
    this.applyReactions(pose, dt);
    const feet = this.footTargets(a, pose.body, dt, lying);
    return { pose, spin, lying, feet, swingMain, swingOff };
  }

  // ---------------------------------------------------------------- attacks

  private movePose(def: MoveDef, s: number, bodyT: number): { pose: ResolvedPose; spin: number } {
    const st = this.style;
    const body = lerpBody(def.body0, def.body1, easeInOut(bodyT));
    if (def.hop) body.lift += def.hop * Math.sin(Math.PI * clamp01(s));
    const main = evalMotion(def.main, s, st.axis, body, st.guard.main)!;
    const off = def.off ? evalMotion(def.off, s, st.offAxis, body, st.guard.off) : st.guard.off ? cloneXf(st.guard.off) : null;
    const free = def.free ? def.free[0].clone().lerp(def.free[1], easeInOut(bodyT)) : (st.guard.free ?? REST_LEFT).clone();
    const spin = (def.spin ?? 0) * Math.PI * 2 * clamp01(s);
    return { pose: { body, main, off, free }, spin };
  }

  private attackPose(a: AnimInput, atk: AttackDef): { pose: ResolvedPose; spin: number; swingMain: boolean; swingOff: boolean } {
    const st = this.style;
    const def = moveFor(st, atk.anim, a.key ?? '');
    const w = Math.max(1, a.windup);
    const total = w + atk.active + atk.recovery;
    // the swing starts a little before the hit window and follows through after it
    const lead = Math.min(130, Math.max(45, w * 0.42));
    const t0 = w - lead;
    const t1 = Math.min(total * 0.94, w + atk.active + Math.min(150, Math.max(70, atk.active * 0.5 + 50)));
    const e = a.elapsed;
    const swingsMain = def.main.kind !== 'hold';
    const swingsOff = !!def.off && def.off.kind !== 'hold';
    const impact = def.impact ?? S_IMPACT;
    // the body leads the weapon a little (hips and shoulders open before the arms whip through)
    const bodyAt = (s: number) => clamp01((s + 0.1) * 1.06);

    if (e < t0) {
      // windup: get to the chamber by 75% of the windup, then coil a little further
      const k = e / Math.max(1, t0);
      const coil = S_ANTI * smooth((k - 0.55) / 0.45);
      const chamber = this.movePose(def, coil, 0);
      return { pose: lerpResolved(this.snapshot, chamber.pose, easeOut(k / 0.75, 3)), spin: 0, swingMain: false, swingOff: false };
    }
    if (e < t1) {
      const u = (e - t0) / Math.max(1, t1 - t0);
      const ui = Math.min(0.7, Math.max(0.2, lead / Math.max(1, t1 - t0)));
      let s: number;
      if (u < ui) {
        const q = u / ui;
        s = S_ANTI + (impact - S_ANTI) * q * q; // accelerating into the hit
      } else {
        const q = (u - ui) / (1 - ui);
        s = impact + (S_END - impact) * (1 - Math.pow(1 - q, 2.4)); // decelerating follow-through
      }
      const r = this.movePose(def, s, bodyAt(s));
      return { pose: r.pose, spin: r.spin, swingMain: swingsMain, swingOff: swingsOff };
    }
    // recovery: settle out of the overshoot, hang a beat, then flow back to guard
    const k = (e - t1) / Math.max(1, total - t1);
    const s = S_END + (1 - S_END) * easeOut(k / 0.3, 2);
    const end = this.movePose(def, s, 1);
    const guard = this.guardPose(a);
    return { pose: lerpResolved(end.pose, guard, easeInOut((k - 0.18) / 0.82)), spin: end.spin, swingMain: false, swingOff: false };
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
    const k = Math.min(1, dt * 24);
    this.feet.L.lerp(stance.L, k);
    this.feet.R.lerp(stance.R, k);
    return this.feet;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const BACK = new THREE.Vector3(0, 0, -1);

/** Stride length, the share of the cycle a foot is planted (less when running) and step height. */
function gait(speed: number): { stride: number; stance: number; lift: number } {
  return { stride: Math.min(0.72, 0.2 + speed * 0.08), stance: 0.6 - 0.28 * smooth((speed - 2) / 4), lift: 0.08 + speed * 0.022 };
}
