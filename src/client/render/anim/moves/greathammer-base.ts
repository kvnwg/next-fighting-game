/** Constants shared by the Warden's two move files (greathammer.ts and greathammer-b.ts). */
import * as THREE from 'three';
import { B, X } from '../author';
import type { BakedClip, BodyKey, BodyPose, MoveDef, Rot, V3, WeaponXf } from '../author';

/** the left hand down by the pommel, behind the right */
export const G2 = -0.33;

/** The stance he waits in: square to the target, the weight down, turned a little to his right. */
export const body = B({ front: 'L', step: 0.26, back: 0.26, width: 0.19, crouch: -0.13, lean: 0.12, twist: -0.12 });

// ------------------------------------------------------------------- the hammer in the world
//
// Every Warden blow is drawn as the hammer's line in the fighter's own frame (the root: +z toward
// the opponent, +x his left, +y up), so a swing goes exactly where it is drawn however hard the
// body under it coils, unwinds and turns; the hands are drawn in torso space, so they stay in
// front of his chest and go round with it. `heave` bakes the two together on the move's s axis.

// the Warden's rig (rigDims): the torso pivot 0.135 above the hips, the shoulders 0.585 above
// that; torso space is scaled by his arms (1.607), crouches and hops by his legs (1.165)
export const ARM_K = 1.607;
export const LEG_K = 1.165;
const TORSO_Y = 0.135;
/** his hip joints' height standing, and how low the hammer may go: the renderer stops the head's
 * axis 0.22 m off the floor, so the face just meets it */
export const HIPS_Y = 1.125;
const FLOOR = 0.25;
const SHOULDER_Y = 0.585;
const TURN = Math.PI * 2;
const DEG = Math.PI / 180;

const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _eu = new THREE.Euler();

/** A direction in his frame: `az` degrees round from straight ahead (+ to his left, 180 behind), `el` up. */
export function aim(az: number, el: number): V3 {
  const a = az * DEG;
  const e = el * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
}

/** Torso space (as authored) to the fighter's root frame, for a body pose and whole-body rotation. */
function torsoFrame(b: BodyPose, r: Rot, out: THREE.Matrix4): THREE.Matrix4 {
  out.makeTranslation(0, (b.crouch + b.lift + r.hop) * LEG_K, 0);
  out.multiply(_m.makeRotationFromEuler(_eu.set(r.flip * TURN, 0, r.roll * TURN, 'XYZ')));
  out.multiply(_m.makeTranslation(0, TORSO_Y, 0));
  out.multiply(_m.makeRotationFromEuler(_eu.set(b.lean, b.twist + r.spin * TURN, b.side, 'YXZ')));
  out.multiply(_m.makeTranslation(0, SHOULDER_Y, 0));
  out.multiply(_m.makeScale(ARM_K, ARM_K, ARM_K));
  return out.multiply(_m.makeTranslation(0, -0.5, 0));
}

/** The striking face pointing straight down past a haft along `dir` (the head resting on the floor). */
function faceDown(dir: THREE.Vector3): THREE.Vector3 {
  const e = new THREE.Vector3(0, -1, 0).addScaledVector(dir, dir.y);
  return e.lengthSq() < 1e-6 ? new THREE.Vector3(0, 0, -1) : e.normalize();
}

/** A held hammer for a still pose: grip in torso space, haft along `dir` in his frame, the face down (or toward `face`). */
export function held(b: BodyPose, at: V3, dir: V3, grip2: number, face?: V3): WeaponXf {
  const inv = new THREE.Matrix4().copy(torsoFrame(b, { spin: 0, flip: 0, roll: 0, hop: 0 }, _r)).invert();
  const d = new THREE.Vector3(...dir).normalize();
  const e = face ? new THREE.Vector3(...face) : faceDown(d);
  e.addScaledVector(d, -e.dot(d)).normalize();
  d.transformDirection(inv);
  e.transformDirection(inv);
  return X(at, [d.x, d.y, d.z], [e.x, e.y, e.z], 'x', grip2);
}

const CHANNELS = ['crouch', 'lean', 'twist', 'side', 'hipTwist', 'headPitch', 'step', 'back', 'width', 'lift'] as const;
const ROTS = ['spin', 'flip', 'roll', 'hop'] as const;

/** Cubic Hermite through keyed values with finite-difference tangents (how the animator eases body keys). */
function herm(ss: number[], s: number, get: (i: number) => number): number {
  const n = ss.length;
  if (n === 1 || s <= ss[0]) return get(0);
  if (s >= ss[n - 1]) return get(n - 1);
  let i = 0;
  while (i < n - 2 && s >= ss[i + 1]) i++;
  const d = ss[i + 1] - ss[i];
  const t = (s - ss[i]) / Math.max(1e-6, d);
  const m1 = i > 0 ? ((get(i + 1) - get(i - 1)) / (ss[i + 1] - ss[i - 1])) * d : 0;
  const m2 = i + 2 < n ? ((get(i + 2) - get(i)) / (ss[i + 2] - ss[i])) * d : 0;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * get(i) + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * get(i + 1) + (t3 - t2) * m2;
}

/** The body keys at s, eased through the way the animator eases them. */
function bodyAt(keys: BodyKey[], s: number): { b: BodyPose; r: Rot } {
  const ss = keys.map((k) => k.s);
  let i = 0;
  while (i < keys.length - 1 && s >= keys[i + 1].s) i++;
  const b = { ...keys[i].b };
  for (const c of CHANNELS) b[c] = herm(ss, s, (j) => keys[j].b[c]);
  const r = { spin: 0, flip: 0, roll: 0, hop: 0 };
  for (const c of ROTS) r[c] = herm(ss, s, (j) => keys[j].r[c]);
  return { b, r };
}

/** One key of a hammer line: at s, the right fist at `at` (torso space) and the haft along `dir` (his frame). */
export interface HKey {
  s: number;
  at: V3;
  dir: V3;
}
export const H = (s: number, at: V3, dir: V3): HKey => ({ s, at, dir });

/**
 * The move with its hammer drawn as `line`: the fist eased through its torso-space keys, the haft
 * through its directions in his frame, re-expressed every few ms in the frame of the torso that
 * the move's own body keys put there. The striking face leads wherever the head is travelling (it
 * has a face at each end, so it never has to roll over) and keeps its last heading when it stops.
 */
export function heave(def: MoveDef, line: HKey[], grip2 = G2, step = 0.004): MoveDef {
  const ss = line.map((k) => k.s);
  const s0 = Math.min(def.sStart, def.sChamber, ss[0]) - 0.05;
  const s1 = Math.max(def.sEnd, def.sRest, ss[ss.length - 1]) + 0.05;
  const n = Math.ceil((s1 - s0) / step) + 1;
  const dirs = line.map((k) => new THREE.Vector3(...k.dir).normalize());
  const world: THREE.Vector3[] = [];
  const grip = new THREE.Vector3();
  const tf = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const s = s0 + ((s1 - s0) * i) / (n - 1);
    const w = new THREE.Vector3(herm(ss, s, (j) => dirs[j].x), herm(ss, s, (j) => dirs[j].y), herm(ss, s, (j) => dirs[j].z)).normalize();
    // laid along the floor rather than through it: the haft tipped up just enough for the head to rest on it
    const k = bodyAt(def.keys, s + def.bodyLead);
    grip.set(herm(ss, s, (j) => line[j].at[0]), herm(ss, s, (j) => line[j].at[1]), herm(ss, s, (j) => line[j].at[2])).applyMatrix4(torsoFrame(k.b, k.r, tf));
    const gy = grip.y + HIPS_Y;
    const lowY = Math.max((FLOOR - gy) / 0.85, (FLOOR - gy) / 1.25);
    if (w.y < lowY && lowY < 0.98 && Math.hypot(w.x, w.z) > 1e-4) {
      const h = Math.sqrt(1 - lowY * lowY) / Math.hypot(w.x, w.z);
      w.set(w.x * h, lowY, w.z * h);
    }
    world.push(w);
  }
  // the face: along the head's travel, kept on the same side from one sample to the next
  const travel: (THREE.Vector3 | null)[] = world.map((d, i) => {
    const v = world[Math.min(n - 1, i + 1)].clone().sub(world[Math.max(0, i - 1)]);
    v.addScaledVector(d, -v.dot(d));
    return v.length() > 0.01 ? v.normalize() : null;
  });
  const first = travel.find((f) => f) ?? faceDown(world[0]);
  const faces: THREE.Vector3[] = [];
  let last: THREE.Vector3 | null = null;
  for (let i = 0; i < n; i++) {
    const d = world[i];
    const ref: THREE.Vector3 = last ?? first;
    const f: THREE.Vector3 = (travel[i] ?? ref).clone();
    if (f.dot(ref) < 0) f.negate();
    // a little lag so the face turns smoothly through the ends of each swing
    if (last) f.lerp(last, 0.6);
    f.addScaledVector(d, -f.dot(d));
    if (f.lengthSq() < 1e-8) f.copy(faceDown(d));
    f.normalize();
    faces.push(f);
    last = f;
  }
  const main: number[] = [];
  const d = new THREE.Vector3();
  const e = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const s = s0 + ((s1 - s0) * i) / (n - 1);
    const k = bodyAt(def.keys, s + def.bodyLead);
    inv.copy(torsoFrame(k.b, k.r, _r)).invert();
    d.copy(world[i]).transformDirection(inv);
    e.copy(faces[i]).transformDirection(inv);
    main.push(herm(ss, s, (j) => line[j].at[0]), herm(ss, s, (j) => line[j].at[1]), herm(ss, s, (j) => line[j].at[2]), d.x, d.y, d.z, e.x, e.y, e.z);
  }
  const clip: BakedClip = { fps: (n - 1) / (s1 - s0), t0: s0, n, body: [], main, free: [] };
  return { ...def, main: { kind: 'baked', clip, hand: 'main', grip2 } };
}
