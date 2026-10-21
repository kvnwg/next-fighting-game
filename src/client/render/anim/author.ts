/**
 * The authoring vocabulary for movesets: poses, weapon paths and timed choreography.
 *
 * Everything is authored weapon-first. A swing is the path the weapon travels (an arc of blade
 * directions around a pivot, a straight line, or a sequence of those) plus how the body moves
 * along the way; the arms then reach for the grip with IK. Coordinates are in the torso's frame:
 * +x is the fighter's LEFT, -x their right, +y up, +z forward, origin at the waist. Shoulders sit
 * at (-0.33, 0.5, 0) and (0.33, 0.5, 0) and an arm reaches about 0.58.
 *
 * A move is laid out along one parameter, s. The hit lands at s = 0.45 by default (a move with
 * several hits lists one s per hit), the follow-through runs to about 1.07, and everything else
 * (body keys, whole-body spins and flips, effect cues, afterimages) is placed on that same axis,
 * so one move reads as a single piece of choreography. The animator maps the gameplay clock onto
 * s so every hit lands exactly when the server resolves it.
 */
import * as THREE from 'three';
import { Arc, V3, orientWeapon } from './math';

export type { V3 };
export type EdgeAxis = 'y' | 'x' | '-x';

export interface BodyPose {
  /** hip height offset (negative crouches) */
  crouch: number;
  /** torso pitch, + leans forward */
  lean: number;
  /** torso yaw, + turns toward the fighter's left */
  twist: number;
  /** torso roll */
  side: number;
  /** hip yaw (turns the legs too) */
  hipTwist: number;
  headPitch: number;
  /** which foot leads */
  front: 'L' | 'R';
  /** lead foot forward / rear foot back / half stance width, meters */
  step: number;
  back: number;
  width: number;
  /** whole-body vertical offset (hops) */
  lift: number;
}

export interface WeaponXf {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  /** two-handed: where the second hand sits along the weapon axis */
  grip2: number;
  /** 1 = the second hand is on the weapon, 0 = it is free (blends between the two) */
  hold2: number;
}

export interface Pose {
  body: BodyPose;
  main: WeaponXf;
  /** off-hand item (shield, second dagger, left gauntlet) */
  off: WeaponXf | null;
  /** free left hand target when nothing is held in it */
  free: THREE.Vector3 | null;
}

export type Motion =
  | { kind: 'arc'; arc: Arc; pivot: THREE.Vector3; pivot1: THREE.Vector3 | null; r: number; grip2: number; body: boolean; edgeSign: number; roll: number }
  | {
      kind: 'line';
      from: THREE.Vector3;
      to: THREE.Vector3;
      d0: THREE.Vector3;
      d1: THREE.Vector3;
      edge: THREE.Vector3;
      grip2a: number;
      grip2b: number;
      body: boolean;
      /** turns of rotation about the weapon's own axis over the line (spiralling thrusts) */
      roll: number;
    }
  | { kind: 'seq'; parts: { from: number; to: number; m: Motion }[]; blend: number }
  | { kind: 'baked'; clip: BakedClip; hand: 'main' | 'free' | 'shield'; grip2: number }
  | { kind: 'hold' };

/**
 * A clip baked from motion data (see moves/baked): per sample, the body channels and both fists'
 * transforms in torso space. A baked motion's s is the clip's own time in seconds.
 */
export interface BakedClip {
  fps: number;
  /** clip time of the first sample */
  t0: number;
  n: number;
  /** per sample: crouch lean twist side hipTwist headPitch step back width lift front(+1 L, -1 R) spin(turns) */
  body: number[];
  /** per sample: fist position, blade direction (out of the thumb side), edge direction (along the knuckles) */
  main: number[];
  free: number[];
}

/** Whole-body motion keyed along s: spin (yaw), flip (forward somersault), roll (cartwheel) in turns, hop in meters. */
export interface Rot {
  spin: number;
  flip: number;
  roll: number;
  hop: number;
}

export interface BodyKey {
  s: number;
  b: BodyPose;
  r: Rot;
}

export type FxKind =
  | 'dust' // a puff at the feet (steps, landings)
  | 'stomp' // a hard plant: dust ring and a small shake
  | 'shockwave' // a ground impact: expanding ring, debris, dust, a big shake
  | 'quake' // dirt thrown up along the sweep
  | 'sparkle' // a glint at the weapon tip
  | 'flashline' // a bright streak along the weapon's line (draw cuts, lunges)
  | 'petals' // cherry petals scattered from the tip
  | 'spiral' // wind spiralling around a thrust
  | 'whirl' // a ring of wind around the fighter
  | 'smoke' // shadow smoke at the feet
  | 'wisps' // soul wisps rising from the blade
  | 'soulfire' // green fire licking along the ground under the blade
  | 'chi' // an orange burst at the striking fist or foot
  | 'holy' // a golden flare and light shafts
  | 'roar' // a red pulse and shockwave from the fighter
  | 'chain' // a spectral chain flung straight ahead (scale = metres)
  | 'shake'; // camera shake only

export type FxAnchor = 'tip' | 'main' | 'off' | 'offTip' | 'kick' | 'feet' | 'root' | 'front';

export interface FxCue {
  s: number;
  kind: FxKind;
  at: FxAnchor;
  scale: number;
  color?: string;
}

export interface TrailStyle {
  color?: string;
  /** seconds each trail point lives (default 0.13) */
  life?: number;
  /** extra brightness 0..1 */
  glow?: number;
}

export interface KickDef {
  foot: 'L' | 'R';
  /** s range during which the foot follows `path` (it eases in before and out after) */
  from: number;
  to: number;
  /** foot position path in the fighter's root frame (+z forward, +y up from the ground) */
  path: Motion;
}

export interface MoveDef {
  keys: BodyKey[];
  main: Motion;
  off?: Motion;
  /** free hand path (position only) for one-handed weapons */
  free?: Motion;
  kick?: KickDef;
  /** s of each hit, one per hit of a multi-hit attack */
  impacts: number[];
  /** windup: the body blends into the pose at sStart, then the weapon travels to sChamber */
  sStart: number;
  sChamber: number;
  /** fraction of the windup spent blending in from the previous pose */
  blendIn: number;
  /** fraction of the windup after which the weapon starts travelling from sStart to sChamber */
  travel: number;
  /** follow-through end, and where recovery settles before flowing back to guard */
  sEnd: number;
  sRest: number;
  /** fraction of the recovery spent travelling from sEnd to sRest (flourishes take longer) */
  settle: number;
  /** the body leads the weapon by this much s (hips and shoulders open before the arms whip) */
  bodyLead: number;
  /**
   * Continuous windup (spins, wind-ups that never stop moving): instead of coiling to a chamber and
   * pausing, s accelerates from sStart straight into the first hit as (t / hit)^flow. The trail
   * lights up once s passes sChamber.
   */
  flow: number;
  fx: FxCue[];
  /**
   * Linear timing (baked clips): s runs straight from sStart to the first hit over the windup, then
   * on to sEnd and sRest, so the clip keeps its own anticipation and follow-through. The trail
   * shows while s is between sChamber and sEnd.
   */
  linear: boolean;
  /** afterimages are left behind while s is in this range */
  ghosts: [number, number] | null;
  trail: TrailStyle | null;
}

export interface Style {
  axis: EdgeAxis;
  offAxis: EdgeAxis;
  guard: Pose;
  block: Pose;
  /** ability stance (Iai sheath, counter stance) */
  stance?: Pose;
  /** moves by attack key (l0..l3, h, sp, ab, ia, ct) */
  moves: Partial<Record<string, MoveDef>>;
  /** a leap ability (the dodge state plays it from s=0 to 1) */
  leap?: MoveDef;
  /** a vanish/blink ability */
  vanish?: MoveDef;
  /** the buff roar */
  roar?: MoveDef;
  /** trail colours: lights, heavies/abilities, perilous specials */
  trail: { light: string; heavy: string; special: string };
  /** spark colours this weapon throws on impact */
  sparks: string[];
}

// ------------------------------------------------------------------------------------ builders

export const V = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
export const N = (a: V3) => V(a).normalize();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

/** Rotate a body-space vector into torso space for a torso turned by `twist` and pitched by `lean`. */
export function bodyToTorso(vec: THREE.Vector3, twist: number, lean = 0): THREE.Vector3 {
  vec.applyAxisAngle(UP, -twist);
  return lean ? vec.applyAxisAngle(RIGHT, -lean) : vec;
}

/** A body pose (unset fields take a relaxed default stance). */
export function B(o: Partial<BodyPose>): BodyPose {
  return { crouch: -0.06, lean: 0.06, twist: 0, side: 0, hipTwist: 0, headPitch: 0, front: 'R', step: 0.2, back: 0.18, width: 0.13, lift: 0, ...o };
}

/** A held weapon (grip2 NaN = one-handed). `twist`: author in body space and convert for a torso turned that far. */
export function X(pos: V3, dir: V3, edge: V3, axis: EdgeAxis, grip2 = NaN, twist = 0): WeaponXf {
  const p = bodyToTorso(V(pos), twist);
  const d = bodyToTorso(N(dir), twist);
  const e = bodyToTorso(N(edge), twist);
  const two = Number.isFinite(grip2);
  return { pos: p, quat: orientWeapon(d, e, axis, new THREE.Quaternion()), grip2: two ? grip2 : 0, hold2: two ? 1 : 0 };
}

export function P(body: BodyPose, main: WeaponXf, off: WeaponXf | null = null, free: V3 | null = null, twist = 0): Pose {
  return { body, main, off, free: free ? bodyToTorso(V(free), twist) : null };
}

/**
 * Swing along an arc of directions around a pivot (which may drift to `pivot1` over the swing).
 * The grip sits `r` along the blade direction from the pivot (negative: the pivot is up the shaft,
 * between the hands). The edge leads (edgeSign -1 trails, 0 keeps it up). `roll` turns the weapon
 * about its own axis over the arc.
 */
export function arc(pivot: V3, r: number, dirs: V3[], grip2 = NaN, opts: { body?: boolean; edgeSign?: number; pivot1?: V3; roll?: number } = {}): Motion {
  return { kind: 'arc', arc: new Arc(dirs.map(N)), pivot: V(pivot), pivot1: opts.pivot1 ? V(opts.pivot1) : null, r, grip2, body: !!opts.body, edgeSign: opts.edgeSign ?? 1, roll: opts.roll ?? 0 };
}

/** Straight-line motion (thrusts, punches, bashes). */
export function line(from: V3, to: V3, d0: V3, d1: V3, edge: V3, grip2a = NaN, grip2b = grip2a, opts: { body?: boolean; roll?: number } = {}): Motion {
  return { kind: 'line', from: V(from), to: V(to), d0: N(d0), d1: N(d1), edge: N(edge), grip2a, grip2b, body: !!opts.body, roll: opts.roll ?? 0 };
}

/** A position-only path through points (free hands, kicks): a polyline walked at even speed. */
export function path(points: V3[]): Motion {
  if (points.length === 2) return line(points[0], points[1], [0, 0, 1], [0, 0, 1], [0, 1, 0]);
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const l = V(points[i]).distanceTo(V(points[i + 1]));
    lens.push(l);
    total += l;
  }
  let acc = 0;
  const parts = lens.map((l, i) => {
    const from = acc / total;
    acc += l;
    return { from, to: acc / total, m: line(points[i], points[i + 1], [0, 0, 1], [0, 0, 1], [0, 1, 0]) };
  });
  return { kind: 'seq', parts, blend: 0.08 };
}

/**
 * Several motions one after another along s. Each part covers [from, to] of the move's s axis
 * (its own 0..1 maps onto that range); neighbouring parts crossfade over `blend` so the weapon
 * never jumps between them.
 */
export function seq(parts: [number, number, Motion][], blend = 0.06): Motion {
  return { kind: 'seq', parts: parts.map(([from, to, m]) => ({ from, to, m })), blend };
}

export const HOLD: Motion = { kind: 'hold' };

/**
 * The s at which a motion reaches one of its authored points: for an arc, the i-th direction; for a
 * line, the fraction `i` (0..1) of the way along it; for a sequence, point `i` of part `part`.
 * Lets a move say "the hit lands when the blade points straight ahead" instead of guessing an s.
 */
export function hitAt(m: Motion, i: number, part = 0): number {
  switch (m.kind) {
    case 'arc':
      return m.arc.fraction(i);
    case 'line':
      return i;
    case 'seq': {
      const p = m.parts[part];
      return p.from + hitAt(p.m, i) * (p.to - p.from);
    }
    default:
      return 0.45;
  }
}

/** A body key as authored: rotations left unset carry over from the previous key. */
export interface KeyIn {
  s: number;
  b: BodyPose;
  r: Partial<Rot>;
}

/** A body key at s, with optional whole-body spin/flip/roll (turns) and hop (m). */
export function K(s: number, b: BodyPose, r: Partial<Rot> = {}): KeyIn {
  return { s, b, r };
}

export function fx(s: number, kind: FxKind, at: FxAnchor = 'tip', scale = 1, color?: string): FxCue {
  return { s, kind, at, scale, color };
}

export interface MoveOpts {
  keys: KeyIn[];
  main: Motion;
  off?: Motion;
  free?: Motion;
  kick?: KickDef;
  impacts?: number[];
  start?: number;
  chamber?: number;
  blendIn?: number;
  travel?: number;
  end?: number;
  rest?: number;
  settle?: number;
  lead?: number;
  flow?: number;
  linear?: boolean;
  fx?: FxCue[];
  ghosts?: [number, number];
  trail?: TrailStyle;
}

/**
 * A move with sensible timing defaults: the windup blends into the start of the path and coils a
 * little past it, the hit lands at s=0.45, and the follow-through overshoots to 1.07 before settling.
 * Rotations carry forward between keys: a key that leaves spin/flip/roll/hop unset keeps the previous
 * key's value, so a single key can start a turn that later keys complete.
 */
export function mv(o: MoveOpts): MoveDef {
  const sorted = o.keys.slice().sort((a, b) => a.s - b.s);
  let last: Rot = { spin: 0, flip: 0, roll: 0, hop: 0 };
  const keys: BodyKey[] = sorted.map((k) => {
    last = { ...last, ...k.r };
    return { s: k.s, b: k.b, r: last };
  });
  return {
    keys,
    main: o.main,
    off: o.off,
    free: o.free,
    kick: o.kick,
    impacts: o.impacts ?? [0.45],
    sStart: o.start ?? 0,
    sChamber: o.chamber ?? -0.08,
    blendIn: o.blendIn ?? 0.75,
    travel: o.travel ?? 0.55,
    sEnd: o.end ?? 1.07,
    sRest: o.rest ?? 1,
    settle: o.settle ?? 0.3,
    bodyLead: o.lead ?? 0.1,
    flow: o.flow ?? 0,
    linear: o.linear ?? false,
    fx: o.fx ?? [],
    ghosts: o.ghosts ?? null,
    trail: o.trail ?? null,
  };
}

/** Points on a circle of directions (for twirls): `turns` revolutions in the plane spanned by u and v. */
export function circle(u: V3, v: V3, turns: number, startDeg = 0, steps = 0): V3[] {
  const a = N(u);
  const b = N(v);
  const n = steps || Math.max(3, Math.ceil(Math.abs(turns) * 8));
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = ((startDeg / 360 + (turns * i) / n) * Math.PI * 2);
    const d = a.clone().multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t));
    out.push([d.x, d.y, d.z]);
  }
  return out;
}

/**
 * Directions on a cone around `axis` (disengages, twirls of the point): `halfDeg` from the axis,
 * walked from `fromDeg` to `toDeg` around it (0 = toward the fighter's left, 90 = up, 180 = right,
 * 270 = down, for an axis pointing forward).
 */
export function cone(axis: V3, halfDeg: number, fromDeg: number, toDeg: number, steps = 0): V3[] {
  const f = N(axis);
  const u = new THREE.Vector3(0, 1, 0).cross(f);
  if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
  u.normalize();
  const v = f.clone().cross(u).normalize();
  const a = (halfDeg * Math.PI) / 180;
  const n = steps || Math.max(2, Math.ceil(Math.abs(toDeg - fromDeg) / 40));
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = ((fromDeg + ((toDeg - fromDeg) * i) / n) * Math.PI) / 180;
    const d = f.clone().multiplyScalar(Math.cos(a)).addScaledVector(u, Math.cos(t) * Math.sin(a)).addScaledVector(v, Math.sin(t) * Math.sin(a));
    out.push([d.x, d.y, d.z]);
  }
  return out;
}

/**
 * A position track keyed along the move's own s axis (free hands, off-hand items): straight lines
 * between the keyed points, held before the first key and after the last.
 */
export function track(keys: [number, V3][], blend = 0.05): Motion {
  const fwd: V3 = [0, 0, 1];
  const up: V3 = [0, 1, 0];
  const first = keys[0];
  const last = keys[keys.length - 1];
  const parts: [number, number, Motion][] = [[first[0] - 10, first[0], line(first[1], first[1], fwd, fwd, up)]];
  for (let i = 0; i < keys.length - 1; i++) parts.push([keys[i][0], keys[i + 1][0], line(keys[i][1], keys[i + 1][1], fwd, fwd, up)]);
  parts.push([last[0], last[0] + 10, line(last[1], last[1], fwd, fwd, up)]);
  return seq(parts, blend);
}

/**
 * A fist from a baked clip as a motion (s = clip seconds): the weapon in the right hand ('main'),
 * the left fist ('free'), or a shield on the left arm, its face out of the back of the hand and its
 * top edge kept upright ('shield').
 */
export function baked(clip: BakedClip, hand: 'main' | 'free' | 'shield' = 'main', grip2 = NaN): Motion {
  return { kind: 'baked', clip, hand, grip2 };
}

/**
 * Body keys from a baked clip between clip times `from` and `to` (every `every`-th sample), with
 * `mod` applied to each pose (to lean a whole move further forward, widen a stance...).
 */
export function bakedKeys(clip: BakedClip, from = -Infinity, to = Infinity, every = 1, mod?: (b: BodyPose, t: number) => void): KeyIn[] {
  const out: KeyIn[] = [];
  for (let i = 0; i < clip.n; i += every) {
    const t = clip.t0 + i / clip.fps;
    if (t < from - 1e-6 || t > to + 1e-6) continue;
    const c = clip.body.slice(i * 12, i * 12 + 12);
    const b = B({ crouch: c[0], lean: c[1], twist: c[2], side: c[3], hipTwist: c[4], headPitch: c[5], step: c[6], back: c[7], width: c[8], lift: c[9], front: c[10] > 0 ? 'L' : 'R' });
    mod?.(b, t);
    out.push(K(t, b, { spin: c[11], hop: 0 }));
  }
  return out;
}

/** A still pose from a baked clip at clip time t (guards, blocks): the body, the weapon, and a shield or free hand. */
export function bakedPose(clip: BakedClip, t: number, axis: EdgeAxis, opts: { grip2?: number; shield?: boolean; offAxis?: EdgeAxis; body?: Partial<BodyPose> } = {}): Pose {
  const i = Math.min(clip.n - 1, Math.max(0, Math.round((t - clip.t0) * clip.fps)));
  const c = clip.body.slice(i * 12, i * 12 + 12);
  const body = B({ crouch: c[0], lean: c[1], twist: c[2], side: c[3], hipTwist: c[4], headPitch: c[5], step: c[6], back: c[7], width: c[8], lift: c[9], front: c[10] > 0 ? 'L' : 'R', ...opts.body });
  const m = clip.main.slice(i * 9, i * 9 + 9);
  const main = X([m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]], axis, opts.grip2 ?? NaN);
  const f = clip.free.slice(i * 9, i * 9 + 9);
  if (opts.shield) {
    // the shield faces out of the back of the left hand, top edge up
    const face = V([f[3], f[4], f[5]]).cross(V([f[6], f[7], f[8]])).normalize();
    return P(body, main, X([f[0], f[1], f[2]], [face.x, face.y, face.z], [0, 1, 0], opts.offAxis ?? 'y'));
  }
  return P(body, main, null, [f[0], f[1], f[2]]);
}
