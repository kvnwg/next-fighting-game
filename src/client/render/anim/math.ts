/** Small vector helpers for the animation system: two-bone IK, weapon orientation and arc paths. */
import * as THREE from 'three';

export type V3 = [number, number, number];

export const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
export const nv = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).normalize();

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/** Quaternion whose local axes are (x, y, z). The three must be orthonormal and right-handed. */
export function basisQuat(x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}

/**
 * Orient a weapon: its local +Z points along `dir`, and its cutting edge (local y, x or -x) faces
 * `edge` (usually the direction the weapon is travelling).
 */
export function orientWeapon(dir: THREE.Vector3, edge: THREE.Vector3, axis: 'y' | 'x' | '-x', out: THREE.Quaternion): THREE.Quaternion {
  _z.copy(dir).normalize();
  _n.copy(edge).addScaledVector(_z, -edge.dot(_z));
  if (_n.lengthSq() < 1e-6) {
    _n.set(0, 1, 0).addScaledVector(_z, -_z.y);
    if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0);
  }
  _n.normalize();
  if (axis === 'y') {
    _y.copy(_n);
    _x.crossVectors(_y, _z);
  } else {
    _x.copy(_n);
    if (axis === '-x') _x.negate();
    _y.crossVectors(_z, _x);
  }
  return basisQuat(_x, _y, _z, out);
}

/**
 * Analytic two-bone IK (shoulder-elbow-hand, hip-knee-ankle). Bones hang along local -Y and hinge
 * about local X. Writes the upper bone's rotation in parent space and the lower bone's rotation
 * relative to the upper bone.
 */
export function solveTwoBone(
  root: THREE.Vector3,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  l1: number,
  l2: number,
  outUpper: THREE.Quaternion,
  outLower: THREE.Quaternion,
): void {
  _a.subVectors(target, root);
  let dist = _a.length();
  if (dist < 1e-5) _a.set(0, -1, 0);
  const dirT = _a.normalize();
  dist = Math.min(Math.max(dist, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-4);
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const angle = Math.acos(Math.min(1, Math.max(-1, cosA)));
  _n.crossVectors(dirT, pole);
  if (_n.lengthSq() < 1e-8) _n.crossVectors(dirT, Math.abs(dirT.x) < 0.9 ? _x.set(1, 0, 0) : _x.set(0, 0, 1));
  _n.normalize();
  const upperDir = _b.copy(dirT).applyAxisAngle(_n, angle);
  // elbow position, then the forearm points at the (reach-clamped) target
  const jx = root.x + upperDir.x * l1;
  const jy = root.y + upperDir.y * l1;
  const jz = root.z + upperDir.z * l1;
  const tx = root.x + dirT.x * dist;
  const ty = root.y + dirT.y * dist;
  const tz = root.z + dirT.z * dist;
  // hinge axis: flipped so that a forward pole gives a forward-facing lower bone (knees, feet)
  _x.copy(_n).negate();
  _y.copy(upperDir).negate();
  _z.crossVectors(_x, _y);
  basisQuat(_x, _y, _z, outUpper);
  _y.set(jx - tx, jy - ty, jz - tz).normalize();
  _z.crossVectors(_x, _y);
  basisQuat(_x, _y, _z, _q);
  outLower.copy(outUpper).invert().multiply(_q);
}

/** A path of directions on the unit sphere, walked at constant angular speed. Extrapolates past 0 and 1. */
export class Arc {
  private readonly dirs: THREE.Vector3[];
  private readonly axes: THREE.Vector3[] = [];
  private readonly angles: number[] = [];
  readonly total: number;

  constructor(dirs: THREE.Vector3[]) {
    this.dirs = dirs.map((d) => d.clone().normalize());
    let total = 0;
    for (let i = 0; i < this.dirs.length - 1; i++) {
      const a = this.dirs[i];
      const b = this.dirs[i + 1];
      const axis = new THREE.Vector3().crossVectors(a, b);
      const ang = a.angleTo(b);
      if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0);
      this.axes.push(axis.normalize());
      this.angles.push(ang);
      total += ang;
    }
    this.total = Math.max(total, 1e-4);
  }

  /** How far along the path (0..1) the i-th authored direction sits. */
  fraction(i: number): number {
    let acc = 0;
    for (let k = 0; k < Math.min(i, this.angles.length); k++) acc += this.angles[k];
    return acc / this.total;
  }

  /** Direction at s (0..1 along the path), and optionally the travel direction (tangent). */
  at(s: number, out: THREE.Vector3, tangent?: THREE.Vector3): THREE.Vector3 {
    let target = s * this.total;
    let i = 0;
    while (i < this.angles.length - 1 && target > this.angles[i]) {
      target -= this.angles[i];
      i++;
    }
    // target may be negative (anticipation) or past the end (overshoot): extrapolate the segment
    out.copy(this.dirs[i]).applyAxisAngle(this.axes[i], target);
    if (tangent) tangent.crossVectors(this.axes[i], out).normalize();
    return out;
  }
}

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
export const easeOut = (t: number, p = 3) => 1 - Math.pow(1 - clamp01(t), p);
export const easeIn = (t: number, p = 2) => Math.pow(clamp01(t), p);
export const easeInOut = (t: number) => {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};
/** 0 -> peak 1 at t=1 -> decays: a punchy impulse shape. */
export const kick = (t: number) => (t <= 0 ? 0 : t * Math.exp(1 - t));
