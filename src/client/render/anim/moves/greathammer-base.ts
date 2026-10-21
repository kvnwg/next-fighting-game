/** Constants shared by the Warden's two move files (greathammer.ts and greathammer-b.ts). */
import * as THREE from 'three';
import { B, HOLD, mv } from '../author';
import type { BakedClip, BodyKey, BodyPose, KeyIn, MoveDef, Motion, Rot, V3 } from '../author';
import { clamp01, orientWeapon, smooth } from '../math';

export const G2 = -0.33; // the left hand rides down by the pommel
// the guard: planted and waiting. The head rests face-down on the ground ahead of him and a little
// to his right; the haft angles up into both hands, low on his right, the left one on the pommel.
// (The rig scales torso space 1.6x for the Warden but not the hammer: 1.23 m to the head's far
// end, which the renderer keeps 0.22 m off the floor so the face just touches it.)
export const GUARD_AT: V3 = [-0.14, 0.14, 0.34];
export const GUARD_DIR: V3 = [-0.1, -0.6, 0.79];
/** the head's striking face down on the floor */
export const GUARD_EDGE: V3 = [0.075, -0.8, -0.59];
export const GUARD_G2 = -0.3;
export const body = B({ front: 'L', step: 0.26, back: 0.26, width: 0.17, crouch: -0.11, lean: 0.1, twist: -0.22 });

// ------------------------------------------------------------------- swinging from the ground up
//
// Hammer paths live in torso space, so they turn, pitch and sink with the torso. Every Warden
// swing is drawn against a quiet body (its "drawn" keys: little twist, the hips square), which
// puts the hammer where it belongs in the world; `swung` then hands that path to the body that
// really throws it (the move's keys: the hips coiling away and unwinding first, the shoulders
// after, the weight sinking back and then crashing onto the front leg) without moving the hammer.
// For every s it finds where the drawn body held the hammer in the world and re-expresses that in
// the frame of the real body, baked into a dense clip on the move's own s axis.

// the Warden's rig (rigDims): the torso pivot 0.135 above the hips, the shoulders 0.585 above
// that; torso space is scaled by his arms (1.607), crouches and hops by his legs (1.165)
export const ARM_K = 1.607;
export const LEG_K = 1.165;
const TORSO_Y = 0.135;
const SHOULDER_Y = 0.585;
const TURN = Math.PI * 2;

const _m = new THREE.Matrix4();
const _a = new THREE.Matrix4();
const _b = new THREE.Matrix4();
const _eu = new THREE.Euler();
const _q = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);
const XA = new THREE.Vector3(1, 0, 0);

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

const CHANNELS = ['crouch', 'lean', 'twist', 'side', 'hipTwist', 'headPitch', 'step', 'back', 'width', 'lift'] as const;
const ROTS = ['spin', 'flip', 'roll', 'hop'] as const;

/** The body keys at s, eased through the way the animator eases them (cubic Hermite). */
function bodyAt(keys: BodyKey[], s: number): { b: BodyPose; r: Rot } {
  if (keys.length === 1 || s <= keys[0].s) return { b: keys[0].b, r: keys[0].r };
  const last = keys[keys.length - 1];
  if (s >= last.s) return { b: last.b, r: last.r };
  let i = 0;
  while (i < keys.length - 2 && s >= keys[i + 1].s) i++;
  const t = (s - keys[i].s) / Math.max(1e-6, keys[i + 1].s - keys[i].s);
  const herm = (get: (k: BodyKey) => number): number => {
    const k1 = keys[i];
    const k2 = keys[i + 1];
    const d = k2.s - k1.s;
    const m1 = i > 0 ? ((get(k2) - get(keys[i - 1])) / (k2.s - keys[i - 1].s)) * d : 0;
    const m2 = i + 2 < keys.length ? ((get(keys[i + 2]) - get(k1)) / (keys[i + 2].s - k1.s)) * d : 0;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * get(k1) + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * get(k2) + (t3 - t2) * m2;
  };
  const b = { ...keys[i].b };
  for (const c of CHANNELS) b[c] = herm((k) => k.b[c]);
  const r = { spin: 0, flip: 0, roll: 0, hop: 0 };
  for (const c of ROTS) r[c] = herm((k) => k.r[c]);
  return { b, r };
}

interface Held {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

/** Where a hammer path holds the grip at s, as the animator plays it (arcs, lines and sequences). */
function heldAt(m: Motion, s: number): Held {
  switch (m.kind) {
    case 'seq': {
      const parts = m.parts;
      let i = 0;
      while (i < parts.length - 1 && s >= parts[i].to) i++;
      const local = (p: (typeof parts)[number]) => (s - p.from) / Math.max(1e-6, p.to - p.from);
      const cur = heldAt(parts[i].m, local(parts[i]));
      const mix = (a: Held, b: Held, t: number): Held => ({ pos: a.pos.lerp(b.pos, t), quat: a.quat.slerp(b.quat, t) });
      const bl = m.blend;
      if (bl > 0 && i > 0 && s < parts[i].from + bl) return mix(heldAt(parts[i - 1].m, local(parts[i - 1])), cur, smooth((s - (parts[i].from - bl)) / (2 * bl)));
      if (bl > 0 && i < parts.length - 1 && s > parts[i].to - bl) return mix(cur, heldAt(parts[i + 1].m, local(parts[i + 1])), smooth((s - (parts[i].to - bl)) / (2 * bl)));
      return cur;
    }
    case 'arc': {
      const d = new THREE.Vector3();
      const t = new THREE.Vector3();
      m.arc.at(s, d, t);
      const pos = m.pivot.clone();
      if (m.pivot1) pos.lerp(m.pivot1, clamp01(s));
      pos.addScaledVector(d, m.r);
      const e = m.edgeSign === 0 ? new THREE.Vector3(0, 1, 0) : t.multiplyScalar(m.edgeSign);
      const quat = orientWeapon(d, e, 'x', new THREE.Quaternion());
      if (m.roll) quat.multiply(_q.setFromAxisAngle(Z, m.roll * TURN * clamp01(s)));
      return { pos, quat };
    }
    case 'line': {
      const pos = m.from.clone().lerp(m.to, s);
      const d = m.d0.clone().lerp(m.d1, clamp01(s)).normalize();
      const quat = orientWeapon(d, m.edge, 'x', new THREE.Quaternion());
      if (m.roll) quat.multiply(_q.setFromAxisAngle(Z, m.roll * TURN * clamp01(s)));
      return { pos, quat };
    }
    default:
      throw new Error('swung: only arcs, lines and sequences of them');
  }
}

/**
 * The move thrown by its own (bigger) body keys, the hammer still travelling the world path it
 * was drawn on against the `drawn` keys. `grip2` is where the left hand rides along the haft.
 * With `from`, the path (a sequence) is kept as drawn up to that s and only the rest is carried.
 */
export function swung(def: MoveDef, drawn: KeyIn[], grip2 = G2, from = NaN, step = 0.005): MoveDef {
  const was = mv({ keys: drawn, main: HOLD }).keys;
  const s0 = Number.isFinite(from) ? from : Math.min(def.sStart, def.sChamber) - 0.05;
  const s1 = Math.max(def.sEnd, def.sRest) + 0.05;
  const n = Math.ceil((s1 - s0) / step) + 1;
  const main: number[] = [];
  const d = new THREE.Vector3();
  const e = new THREE.Vector3();
  const c = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const s = s0 + ((s1 - s0) * i) / (n - 1);
    const h = heldAt(def.main, s);
    const o = bodyAt(was, s + def.bodyLead);
    const k = bodyAt(def.keys, s + def.bodyLead);
    // drawn torso -> root frame -> real torso
    c.copy(torsoFrame(k.b, k.r, _b).invert()).multiply(torsoFrame(o.b, o.r, _a));
    h.pos.applyMatrix4(c);
    d.copy(Z).applyQuaternion(h.quat).transformDirection(c);
    e.copy(XA).applyQuaternion(h.quat).transformDirection(c);
    main.push(h.pos.x, h.pos.y, h.pos.z, d.x, d.y, d.z, e.x, e.y, e.z);
  }
  if (!Number.isFinite(from)) {
    const clip: BakedClip = { fps: (n - 1) / (s1 - s0), t0: s0, n, body: [], main, free: [] };
    return { ...def, main: { kind: 'baked', clip, hand: 'main', grip2 } };
  }
  // the carried part as one more piece of the sequence, on its own 0..1
  if (def.main.kind !== 'seq') throw new Error('swung: `from` needs a sequence');
  const clip: BakedClip = { fps: n - 1, t0: 0, n, body: [], main, free: [] };
  const kept = def.main.parts.filter((p) => p.to <= from + 1e-6);
  const parts = [...kept, { from, to: s1, m: { kind: 'baked', clip, hand: 'main', grip2 } as Motion }];
  return { ...def, main: { kind: 'seq', parts, blend: def.main.blend } };
}
