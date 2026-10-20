/**
 * Movesets: how each weapon is held and swung.
 *
 * Everything is authored weapon-first. A swing is the path the weapon travels (an arc of blade
 * directions around a pivot, or a straight line for thrusts and punches) plus how the body coils
 * and uncoils; the arms then reach for the grip with IK. Coordinates are in the torso's frame:
 * +x is the fighter's LEFT, -x their right, +y up, +z forward, origin at the waist. Shoulders sit
 * at (-0.33, 0.5, 0) and (0.33, 0.5, 0) and an arm reaches about 0.58.
 */
import * as THREE from 'three';
import { AttackAnim, WeaponKind } from '../../../shared/characters';
import { Arc, V3, orientWeapon } from './math';

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
  | { kind: 'arc'; arc: Arc; pivot: THREE.Vector3; pivot1: THREE.Vector3 | null; r: number; grip2: number; body: boolean; edgeSign: number }
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
    }
  | { kind: 'hold' };

export interface MoveDef {
  body0: BodyPose;
  body1: BodyPose;
  main: Motion;
  off?: Motion;
  /** free hand path for one-handed weapons */
  free?: [THREE.Vector3, THREE.Vector3];
  /** whole-body turns during the swing (spins) */
  spin?: number;
  /** extra hop height at mid-swing */
  hop?: number;
  /** how far along the path the weapon is when the hit lands (default 0.45) */
  impact?: number;
}

export interface Style {
  axis: EdgeAxis;
  offAxis: EdgeAxis;
  guard: Pose;
  block: Pose;
  /** ability stance (Iai sheath, counter stance) */
  stance?: Pose;
  moves: Partial<Record<AttackAnim, MoveDef>>;
  /** variations per attack key (e.g. the third light aims low) */
  variant?: (anim: AttackAnim, key: string, def: MoveDef) => MoveDef;
}

// ------------------------------------------------------------------------------------ builders

const V = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
const N = (a: V3) => V(a).normalize();

/** Rotate a body-space vector into torso space for a torso turned by `twist` and pitched by `lean`. */
export function bodyToTorso(vec: THREE.Vector3, twist: number, lean = 0): THREE.Vector3 {
  vec.applyAxisAngle(UP, -twist);
  return lean ? vec.applyAxisAngle(RIGHT, -lean) : vec;
}
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

function B(o: Partial<BodyPose>): BodyPose {
  return { crouch: -0.06, lean: 0.06, twist: 0, side: 0, hipTwist: 0, headPitch: 0, front: 'R', step: 0.2, back: 0.18, width: 0.13, lift: 0, ...o };
}

/** A held weapon (grip2 NaN = one-handed). `twist`: author in body space and convert for a torso turned that far. */
function X(pos: V3, dir: V3, edge: V3, axis: EdgeAxis, grip2 = NaN, twist = 0): WeaponXf {
  const p = bodyToTorso(V(pos), twist);
  const d = bodyToTorso(N(dir), twist);
  const e = bodyToTorso(N(edge), twist);
  const two = Number.isFinite(grip2);
  return { pos: p, quat: orientWeapon(d, e, axis, new THREE.Quaternion()), grip2: two ? grip2 : 0, hold2: two ? 1 : 0 };
}

function P(body: BodyPose, main: WeaponXf, off: WeaponXf | null = null, free: V3 | null = null, twist = 0): Pose {
  return { body, main, off, free: free ? bodyToTorso(V(free), twist) : null };
}

/**
 * Swing along an arc of directions around a pivot (which may drift to `pivot1` over the swing).
 * The grip sits `r` along the blade direction from the pivot (negative: the pivot is up the shaft,
 * between the hands). The edge leads (edgeSign -1 trails, 0 keeps it up).
 */
function arc(pivot: V3, r: number, dirs: V3[], grip2 = NaN, opts: { body?: boolean; edgeSign?: number; pivot1?: V3 } = {}): Motion {
  return { kind: 'arc', arc: new Arc(dirs.map(N)), pivot: V(pivot), pivot1: opts.pivot1 ? V(opts.pivot1) : null, r, grip2, body: !!opts.body, edgeSign: opts.edgeSign ?? 1 };
}

/** Straight-line motion (thrusts, punches, bashes). */
function line(from: V3, to: V3, d0: V3, d1: V3, edge: V3, grip2a = NaN, grip2b = grip2a, body = false): Motion {
  return { kind: 'line', from: V(from), to: V(to), d0: N(d0), d1: N(d1), edge: N(edge), grip2a, grip2b, body };
}

const HOLD: Motion = { kind: 'hold' };

// ------------------------------------------------------------------------------------ katana

/** The scabbard (torso space): runs back and down from the left hip; the Iai grip sits just outside its mouth. */
const IAI_GRIP: V3 = [-0.06, 0.16, 0.32];
export const KATANA_SHEATH: V3 = [0.5, -0.42, -0.76];
export const KATANA_SHEATH_MOUTH: V3 = (() => {
  const d = N(KATANA_SHEATH);
  return [IAI_GRIP[0] + d.x * 0.19, IAI_GRIP[1] + d.y * 0.19, IAI_GRIP[2] + d.z * 0.19];
})();

const katanaBody = B({ front: 'R', step: 0.22, back: 0.2, width: 0.12, crouch: -0.07, lean: 0.06, twist: -0.12 });

const katana: Style = {
  axis: 'y',
  offAxis: 'y',
  guard: P(katanaBody, X([-0.03, 0.17, 0.33], [0.02, 0.5, 1], [0, -1, 0.3], 'y', -0.13)),
  block: P(B({ ...katanaBody, crouch: -0.12, lean: 0.0 }), X([0.1, 0.56, 0.33], [-1, 0.18, 0.12], [0, 1, 0.4], 'y', -0.13)),
  // iai: blade in the scabbard (see KATANA_SHEATH), right hand on the hilt, left hand on the saya
  stance: P(
    B({ ...katanaBody, crouch: -0.24, lean: 0.32, twist: 0.25, step: 0.32, back: 0.3 }),
    X(IAI_GRIP, KATANA_SHEATH, [0, 1, 0], 'y'),
    null,
    [0.08, 0.09, 0.16],
  ),
  moves: {
    // kesa-giri: high right shoulder down through to low left
    slashR: {
      body0: B({ ...katanaBody, twist: -0.55, lean: -0.02, crouch: -0.05 }),
      body1: B({ ...katanaBody, twist: 0.5, lean: 0.32, crouch: -0.18, step: 0.4, back: 0.26 }),
      main: arc([-0.05, 0.36, 0.16], 0.24, [[-0.75, 0.62, -0.15], [-0.35, 0.45, 0.8], [0.15, 0.05, 1], [0.7, -0.45, 0.5]], -0.13),
    },
    slashL: {
      body0: B({ ...katanaBody, twist: 0.5, lean: -0.02 }),
      body1: B({ ...katanaBody, twist: -0.5, lean: 0.3, crouch: -0.17, step: 0.38, back: 0.26 }),
      main: arc([-0.02, 0.36, 0.16], 0.24, [[0.75, 0.6, -0.1], [0.35, 0.4, 0.85], [-0.15, 0.0, 1], [-0.75, -0.4, 0.45]], -0.13),
    },
    overhead: {
      body0: B({ ...katanaBody, lean: -0.22, twist: -0.1, crouch: -0.02 }),
      body1: B({ ...katanaBody, lean: 0.46, twist: 0.05, crouch: -0.24, step: 0.44, back: 0.3 }),
      main: arc([-0.02, 0.42, 0.12], 0.26, [[0.05, 0.75, -0.65], [0, 1, 0.15], [0, 0.35, 1], [0, -0.55, 0.85]], -0.13),
    },
    thrust: {
      body0: B({ ...katanaBody, crouch: -0.24, lean: 0.12, twist: -0.35, step: 0.16, back: 0.36 }),
      body1: B({ ...katanaBody, crouch: -0.26, lean: 0.36, twist: 0.08, step: 0.56, back: 0.46 }),
      main: line([-0.08, 0.22, -0.02], [-0.02, 0.3, 0.42], [0.02, 0.1, 1], [0, 0.04, 1], [0, -1, 0], -0.13),
    },
    // iai: out of the scabbard in one horizontal stroke, one-handed
    draw: {
      body0: B({ ...katanaBody, crouch: -0.24, lean: 0.32, twist: 0.25, step: 0.32, back: 0.3 }),
      body1: B({ ...katanaBody, crouch: -0.26, lean: 0.36, twist: -0.6, step: 0.5, back: 0.34 }),
      main: arc([-0.167, 0.2, 0.421], 0.15, [[0.9, 0, -0.4], [0.7, 0.05, 0.7], [0, 0.08, 1], [-0.8, 0.12, 0.55]], NaN, { pivot1: [-0.297, 0.322, 0.276] }),
      free: [V([0.08, 0.09, 0.16]), V([0.32, 0.2, -0.1])],
      impact: 0.6,
    },
  },
};

// ------------------------------------------------------------------------------------ greathammer

const hammerBody = B({ front: 'L', step: 0.26, back: 0.26, width: 0.17, crouch: -0.11, lean: 0.1, twist: -0.22 });

const greathammer: Style = {
  axis: 'x',
  offAxis: 'x',
  // resting over the right shoulder
  guard: P(hammerBody, X([0.07, 0.41, 0.13], [-0.35, 0.85, -0.25], [-1, 0, 0.2], 'x', -0.35)),
  block: P(B({ ...hammerBody, crouch: -0.16 }), X([0.15, 0.5, 0.32], [-1, 0.15, 0.05], [0, 1, 0.3], 'x', -0.3)),
  moves: {
    slashR: {
      body0: B({ ...hammerBody, twist: -0.75, lean: 0.0, crouch: -0.08 }),
      body1: B({ ...hammerBody, twist: 0.6, lean: 0.42, crouch: -0.24, step: 0.46 }),
      main: arc([0.0, 0.35, 0.12], 0.22, [[-0.55, 0.75, -0.4], [-0.3, 0.45, 0.85], [0.2, 0.0, 1], [0.75, -0.35, 0.55]], -0.33),
    },
    slam: {
      body0: B({ ...hammerBody, lean: -0.32, crouch: 0.02, twist: -0.15, lift: 0.04 }),
      body1: B({ ...hammerBody, lean: 0.62, crouch: -0.34, twist: 0.05, step: 0.5, back: 0.36 }),
      main: arc([0, 0.45, 0.12], 0.24, [[0, 0.5, -0.85], [0, 1, 0], [0, 0.4, 1], [0, -0.7, 0.75]], -0.33),
      hop: 0.06,
    },
    sweep: {
      body0: B({ ...hammerBody, crouch: -0.34, twist: -0.95, lean: 0.36 }),
      body1: B({ ...hammerBody, crouch: -0.38, twist: 0.75, lean: 0.46, step: 0.5 }),
      main: arc([0, 0.15, 0.15], 0.22, [[-0.9, -0.2, -0.45], [-0.3, -0.35, 0.9], [0.4, -0.35, 0.85], [0.95, -0.25, 0.1]], -0.33),
    },
  },
};

// ------------------------------------------------------------------------------------ rapier

const RT = -0.7; // fencing stance: right side forward
const rapierBody = B({ front: 'R', step: 0.36, back: 0.32, width: 0.08, crouch: -0.15, lean: 0.05, twist: RT, hipTwist: -0.25 });

const rapier: Style = {
  axis: 'y',
  offAxis: 'y',
  guard: P(rapierBody, X([-0.22, 0.3, 0.46], [0.02, 0.2, 1], [0, -1, 0], 'y', NaN, RT), null, [0.42, 0.66, -0.18]),
  block: P(B({ ...rapierBody, crouch: -0.2 }), X([-0.12, 0.42, 0.42], [0.35, 1, 0.25], [1, 0, 0.3], 'y', NaN, RT), null, [0.42, 0.62, -0.2]),
  moves: {
    // the fencing lunge: arm extends first, then the front foot drives forward
    thrust: {
      body0: B({ ...rapierBody, crouch: -0.12, step: 0.3, back: 0.28 }),
      body1: B({ ...rapierBody, crouch: -0.34, lean: 0.3, twist: RT - 0.2, step: 0.78, back: 0.48 }),
      main: line([-0.2, 0.35, 0.12], [-0.08, 0.38, 0.6], [0.05, 0.12, 1], [0, 0.03, 1], [0, -1, 0], NaN, NaN, true),
      free: [V([0.42, 0.66, -0.18]), V([0.45, 0.16, -0.34])],
    },
    slashR: {
      body0: B({ ...rapierBody, twist: RT - 0.2 }),
      body1: B({ ...rapierBody, twist: RT + 0.5, lean: 0.25, crouch: -0.22, step: 0.5 }),
      main: arc([-0.3, 0.48, 0.02], 0.5, [[-0.6, 0.65, 0.2], [0.0, 0.3, 1], [0.6, -0.2, 0.75]]),
      free: [V([0.42, 0.66, -0.18]), V([0.42, 0.5, -0.3])],
    },
  },
  variant(anim, key, def) {
    if (anim !== 'thrust' || def.main.kind !== 'line') return def;
    // vary the line of attack through the chain so lights don't all look alike
    const m = { ...def.main, to: def.main.to.clone(), d1: def.main.d1.clone() };
    if (key === 'l1') m.to.y -= 0.16;
    if (key === 'l2') m.to.y += 0.1;
    if (key === 'l3' || key === 'h' || key === 'sp') m.to.z += 0.06;
    m.d1.copy(m.to).sub(m.from).normalize().lerp(def.main.d1, 0.5).normalize();
    return { ...def, main: m };
  },
};

// ------------------------------------------------------------------------------------ spear

const ST = -0.7; // left side forward, spear along the body line
const spearBody = B({ front: 'L', step: 0.33, back: 0.3, width: 0.14, crouch: -0.13, lean: 0.08, twist: ST });

const spear: Style = {
  axis: 'x',
  offAxis: 'x',
  guard: P(spearBody, X([-0.22, 0.2, -0.05], [0.05, 0.12, 1], [1, 0, 0], 'x', 0.55, ST)),
  block: P(B({ ...spearBody, crouch: -0.18, twist: -0.3 }), X([-0.3, 0.46, 0.3], [1, 0.08, 0.05], [0, 1, 0.3], 'x', 0.58, -0.3)),
  moves: {
    // the shaft slides through the front hand as the rear hand drives it
    thrust: {
      body0: B({ ...spearBody, twist: ST - 0.08, lean: 0.06, step: 0.3 }),
      body1: B({ ...spearBody, twist: ST + 0.15, lean: 0.32, crouch: -0.2, step: 0.46 }),
      main: line([-0.25, 0.2, -0.16], [-0.12, 0.26, 0.34], [0.03, 0.1, 1], [0.0, 0.06, 1], [1, 0, 0], 0.6, 0.28, true),
    },
    slashR: {
      body0: B({ ...spearBody, twist: -0.85 }),
      body1: B({ ...spearBody, twist: 0.55, lean: 0.3, crouch: -0.2, step: 0.42 }),
      main: arc([0.12, 0.33, 0.18], -0.16, [[-0.75, 0.15, 0.55], [0, 0.02, 1], [0.75, -0.12, 0.55]], 0.3),
    },
    spin: {
      body0: B({ ...spearBody, crouch: -0.3, lean: 0.3, twist: -0.4 }),
      body1: B({ ...spearBody, crouch: -0.32, lean: 0.32, twist: -0.4 }),
      main: line([-0.12, 0.2, 0.2], [-0.12, 0.2, 0.22], [-0.85, 0.08, 0.5], [-0.85, 0.02, 0.5], [0, 1, 0], 0.4, 0.4, true),
      spin: -1,
    },
  },
};

// ------------------------------------------------------------------------------------ scythe

const scytheBody = B({ front: 'L', step: 0.26, back: 0.26, width: 0.16, crouch: -0.11, lean: 0.1, twist: -0.28 });

const scythe: Style = {
  axis: '-x',
  offAxis: '-x',
  guard: P(scytheBody, X([-0.18, 0.1, 0.22], [0.3, 0.85, 0.45], [0.2, -0.2, 1], '-x', 0.45)),
  block: P(B({ ...scytheBody, crouch: -0.16 }), X([-0.15, 0.25, 0.32], [0.25, 1, 0.1], [0.3, 0, 1], '-x', 0.42)),
  moves: {
    // reaping cuts rotate the shaft about a point between the hands, blade tip leading
    slashR: {
      body0: B({ ...scytheBody, twist: -0.7, lean: 0.02 }),
      body1: B({ ...scytheBody, twist: 0.6, lean: 0.36, crouch: -0.2, step: 0.4 }),
      main: arc([-0.03, 0.33, 0.25], -0.2, [[-0.85, 0.35, -0.4], [-0.45, 0.25, 0.85], [0.35, 0.05, 0.95], [0.85, -0.05, 0.35]], 0.4),
    },
    slashL: {
      body0: B({ ...scytheBody, twist: 0.55, lean: 0.02 }),
      body1: B({ ...scytheBody, twist: -0.7, lean: 0.34, crouch: -0.2, step: 0.4 }),
      main: arc([0.0, 0.33, 0.25], -0.2, [[0.85, 0.35, -0.3], [0.45, 0.25, 0.85], [-0.35, 0.05, 0.95], [-0.85, -0.05, 0.35]], 0.4),
    },
    overhead: {
      body0: B({ ...scytheBody, lean: -0.25, crouch: -0.04 }),
      body1: B({ ...scytheBody, lean: 0.5, crouch: -0.26, step: 0.42 }),
      main: arc([-0.02, 0.4, 0.2], -0.12, [[0, 0.6, -0.8], [0, 1, 0.1], [0, 0.3, 1], [0, -0.45, 0.9]], 0.35),
    },
    spin: {
      body0: B({ ...scytheBody, crouch: -0.24, lean: 0.25, twist: -0.3 }),
      body1: B({ ...scytheBody, crouch: -0.26, lean: 0.28, twist: -0.3 }),
      main: line([-0.15, 0.22, 0.22], [-0.15, 0.2, 0.24], [-0.85, 0.15, 0.45], [-0.85, 0.1, 0.45], [0, 0, 1], 0.4, 0.4, true),
      spin: -1,
    },
    sweep: {
      body0: B({ ...scytheBody, crouch: -0.32, twist: -0.85, lean: 0.4 }),
      body1: B({ ...scytheBody, crouch: -0.36, twist: 0.7, lean: 0.45, step: 0.48 }),
      main: arc([0, 0.16, 0.25], -0.18, [[-0.9, -0.15, -0.4], [-0.35, -0.3, 0.9], [0.4, -0.3, 0.85], [0.95, -0.2, 0.1]], 0.4),
    },
    // flung overhand toward the target
    hook: {
      body0: B({ ...scytheBody, lean: -0.3, twist: -0.45, crouch: -0.02 }),
      body1: B({ ...scytheBody, lean: 0.4, twist: 0.25, crouch: -0.18, step: 0.4 }),
      main: arc([-0.08, 0.45, 0.15], -0.1, [[-0.2, 0.55, -0.8], [-0.1, 1, 0.1], [0, 0.25, 1], [0.05, -0.2, 1]], 0.35),
    },
  },
};

// ------------------------------------------------------------------------------------ daggers

const daggerBody = B({ front: 'L', step: 0.26, back: 0.3, width: 0.16, crouch: -0.2, lean: 0.24, twist: -0.1 });
const R_SHOULDER: V3 = [-0.3, 0.48, 0.0];
const L_SHOULDER: V3 = [0.3, 0.48, 0.0];

const daggers: Style = {
  axis: 'y',
  offAxis: 'y',
  guard: P(daggerBody, X([-0.22, 0.28, 0.3], [0.15, 0.35, 1], [0, -1, 0.2], 'y'), X([0.2, 0.35, 0.36], [-0.15, 0.3, 1], [0, -1, 0.2], 'y')),
  block: P(B({ ...daggerBody, crouch: -0.24 }), X([-0.08, 0.6, 0.32], [0.8, 0.55, 0.1], [0, 0, 1], 'y'), X([0.08, 0.6, 0.34], [-0.8, 0.55, 0.1], [0, 0, 1], 'y')),
  moves: {
    slashR: {
      body0: B({ ...daggerBody, twist: -0.45 }),
      body1: B({ ...daggerBody, twist: 0.38, lean: 0.34, crouch: -0.26, step: 0.36 }),
      main: arc(R_SHOULDER, 0.5, [[-0.6, 0.6, 0.3], [-0.1, 0.25, 1], [0.55, -0.2, 0.8]]),
      off: HOLD,
    },
    slashL: {
      body0: B({ ...daggerBody, twist: 0.4 }),
      body1: B({ ...daggerBody, twist: -0.35, lean: 0.34, crouch: -0.26, step: 0.36 }),
      main: HOLD,
      off: arc(L_SHOULDER, 0.5, [[0.6, 0.6, 0.3], [0.1, 0.25, 1], [-0.55, -0.2, 0.8]]),
    },
    // both blades at once in an X
    dualSlash: {
      body0: B({ ...daggerBody, lean: -0.05, crouch: -0.12 }),
      body1: B({ ...daggerBody, lean: 0.4, crouch: -0.28, step: 0.4 }),
      main: arc(R_SHOULDER, 0.48, [[-0.45, 0.8, 0.35], [0.0, 0.3, 1], [0.5, -0.35, 0.75]]),
      off: arc(L_SHOULDER, 0.48, [[0.45, 0.8, 0.35], [0.0, 0.3, 1], [-0.5, -0.35, 0.75]]),
    },
    // coiled low, then a long lunging stab; the off blade guards the face
    thrust: {
      body0: B({ ...daggerBody, twist: -0.6, crouch: -0.28, lean: 0.2 }),
      body1: B({ ...daggerBody, twist: 0.25, lean: 0.42, crouch: -0.34, step: 0.62, back: 0.42 }),
      main: line([-0.3, 0.3, -0.08], [-0.06, 0.42, 0.62], [0.1, 0.1, 1], [0, 0.03, 1], [0, -1, 0], NaN, NaN, true),
      off: line([0.25, 0.4, 0.3], [0.18, 0.62, 0.18], [-0.1, 0.4, 1], [-0.6, 0.6, 0.3], [0, -1, 0]),
    },
    grab: {
      body0: B({ ...daggerBody, lean: 0.0, crouch: -0.14 }),
      body1: B({ ...daggerBody, lean: 0.42, crouch: -0.28, step: 0.48 }),
      main: line([-0.45, 0.45, 0.12], [-0.09, 0.52, 0.46], [-0.4, -0.3, 1], [0.2, -0.3, 1], [0, 0, -1]),
      off: line([0.45, 0.45, 0.12], [0.09, 0.52, 0.46], [0.4, -0.3, 1], [-0.2, -0.3, 1], [0, 0, -1]),
    },
  },
};

// ------------------------------------------------------------------------------------ gauntlets

const monkBody = B({ front: 'L', step: 0.22, back: 0.24, width: 0.17, crouch: -0.12, lean: 0.12, twist: -0.3 });
const FIST_EDGE: V3 = [0, 1, 0];

const gauntlets: Style = {
  axis: 'y',
  offAxis: 'y',
  guard: P(monkBody, X([-0.12, 0.62, 0.26], [0.1, 0.3, 1], FIST_EDGE, 'y'), X([0.14, 0.65, 0.36], [-0.1, 0.3, 1], FIST_EDGE, 'y')),
  block: P(B({ ...monkBody, crouch: -0.16, lean: 0.2 }), X([-0.06, 0.72, 0.28], [0.1, 1, 0.25], [0, 0, -1], 'y'), X([0.08, 0.75, 0.3], [-0.1, 1, 0.25], [0, 0, -1], 'y')),
  stance: P(B({ ...monkBody, crouch: -0.2, lean: 0.05, twist: 0, width: 0.22 }), X([-0.15, 0.5, 0.42], [0, 0.4, 1], FIST_EDGE, 'y'), X([0.15, 0.55, 0.38], [0, 0.4, 1], FIST_EDGE, 'y')),
  moves: {
    punchR: {
      body0: B({ ...monkBody, twist: -0.48 }),
      body1: B({ ...monkBody, twist: 0.38, lean: 0.3, step: 0.32 }),
      main: line([-0.18, 0.6, 0.12], [-0.06, 0.6, 0.52], [0.1, 0.15, 1], [0.15, 0.05, 1], FIST_EDGE),
      off: HOLD,
    },
    punchL: {
      body0: B({ ...monkBody, twist: 0.2 }),
      body1: B({ ...monkBody, twist: -0.65, lean: 0.3, step: 0.3 }),
      main: HOLD,
      off: line([0.18, 0.62, 0.18], [0.06, 0.62, 0.55], [-0.1, 0.15, 1], [-0.15, 0.05, 1], FIST_EDGE),
    },
    uppercut: {
      body0: B({ ...monkBody, crouch: -0.32, lean: 0.32, twist: -0.4 }),
      body1: B({ ...monkBody, crouch: -0.02, lean: -0.12, twist: 0.25, step: 0.3 }),
      main: line([-0.18, 0.15, 0.22], [-0.05, 0.78, 0.38], [0.05, 0.6, 1], [0, 1, 0.3], [0, 0, -1]),
      off: HOLD,
    },
    grab: {
      body0: B({ ...monkBody, lean: 0.0, crouch: -0.14, twist: 0 }),
      body1: B({ ...monkBody, lean: 0.42, crouch: -0.26, twist: 0, step: 0.45 }),
      main: line([-0.45, 0.5, 0.12], [-0.1, 0.5, 0.48], [-0.5, 0.2, 1], [0.3, 0.1, 1], FIST_EDGE),
      off: line([0.45, 0.5, 0.12], [0.1, 0.5, 0.48], [0.5, 0.2, 1], [-0.3, 0.1, 1], FIST_EDGE),
    },
  },
  variant(anim, key, def) {
    if (anim !== 'punchR') return def;
    if (key === 'l2') {
      // the hook: a flat arc around the shoulder instead of a straight line
      return { ...def, main: arc([-0.3, 0.55, 0.05], 0.45, [[-0.9, 0.1, 0.3], [-0.3, 0.1, 1], [0.5, 0.05, 0.85]], NaN, { edgeSign: 0 }) };
    }
    if (key === 'h') {
      // Mountain Breaker: wound all the way back, driven through with a step
      return {
        ...def,
        body0: B({ ...monkBody, twist: -0.85, crouch: -0.2, lean: 0.05 }),
        body1: B({ ...monkBody, twist: 0.45, lean: 0.38, crouch: -0.22, step: 0.5, back: 0.32 }),
        main: line([-0.26, 0.5, -0.1], [-0.05, 0.58, 0.54], [0.2, 0.1, 1], [0.12, 0.02, 1], FIST_EDGE),
      };
    }
    return def;
  },
};

// ------------------------------------------------------------------------------------ sword & shield

const paladinBody = B({ front: 'L', step: 0.25, back: 0.22, width: 0.15, crouch: -0.1, lean: 0.08, twist: 0.12 });
const SHIELD_UP: V3 = [0, 1, 0];

const swordShield: Style = {
  axis: 'y',
  offAxis: 'y',
  guard: P(paladinBody, X([-0.3, 0.2, 0.28], [0.1, 0.65, 1], [0, -0.5, 1], 'y'), X([0.12, 0.35, 0.4], [-0.15, 0.05, 1], SHIELD_UP, 'y')),
  block: P(B({ ...paladinBody, crouch: -0.17, lean: 0.14, twist: 0.25 }), X([-0.32, 0.32, 0.05], [0.1, 1, 0.3], [0, 0, 1], 'y'), X([0.04, 0.48, 0.42], [-0.05, 0.1, 1], SHIELD_UP, 'y')),
  moves: {
    slashR: {
      body0: B({ ...paladinBody, twist: -0.45 }),
      body1: B({ ...paladinBody, twist: 0.45, lean: 0.3, crouch: -0.18, step: 0.38 }),
      main: arc(R_SHOULDER, 0.48, [[-0.65, 0.65, -0.2], [-0.15, 0.3, 1], [0.6, -0.3, 0.75]]),
      off: HOLD,
    },
    slashL: {
      body0: B({ ...paladinBody, twist: 0.45 }),
      body1: B({ ...paladinBody, twist: -0.45, lean: 0.28, crouch: -0.18, step: 0.36 }),
      main: arc(R_SHOULDER, 0.48, [[0.55, 0.55, 0.6], [0.0, 0.2, 1], [-0.75, -0.15, 0.6]]),
      off: HOLD,
    },
    overhead: {
      body0: B({ ...paladinBody, lean: -0.22, twist: -0.1 }),
      body1: B({ ...paladinBody, lean: 0.46, crouch: -0.24, step: 0.42 }),
      main: arc([-0.28, 0.5, 0.0], 0.48, [[-0.1, 0.8, -0.6], [-0.05, 1, 0.2], [0.05, 0.3, 1], [0.1, -0.45, 0.9]]),
      off: HOLD,
    },
    thrust: {
      body0: B({ ...paladinBody, crouch: -0.2, twist: -0.25, lean: 0.12 }),
      body1: B({ ...paladinBody, crouch: -0.26, twist: 0.2, lean: 0.36, step: 0.52, back: 0.4 }),
      main: line([-0.3, 0.32, 0.05], [-0.12, 0.38, 0.5], [0.08, 0.1, 1], [0, 0.04, 1], [0, -1, 0]),
      off: line([0.15, 0.35, 0.36], [0.2, 0.32, 0.22], [-0.15, 0.05, 1], [-0.3, 0.05, 1], SHIELD_UP),
    },
    bash: {
      body0: B({ ...paladinBody, twist: -0.32, lean: 0.05 }),
      body1: B({ ...paladinBody, twist: 0.48, lean: 0.38, crouch: -0.2, step: 0.45 }),
      main: line([-0.32, 0.28, 0.12], [-0.34, 0.22, 0.0], [0.1, 0.8, 0.6], [0.1, 0.9, 0.3], [0, 0, 1]),
      off: line([0.22, 0.36, 0.16], [0.08, 0.42, 0.52], [-0.3, 0.05, 1], [-0.05, 0.05, 1], SHIELD_UP),
    },
    charge: {
      body0: B({ ...paladinBody, lean: 0.5, crouch: -0.22, twist: 0.3, step: 0.3, back: 0.32 }),
      body1: B({ ...paladinBody, lean: 0.58, crouch: -0.22, twist: 0.3, step: 0.42, back: 0.4 }),
      main: line([-0.34, 0.25, 0.0], [-0.34, 0.25, 0.0], [0.1, 0.8, 0.5], [0.1, 0.8, 0.5], [0, 0, 1]),
      off: line([0.06, 0.38, 0.42], [0.05, 0.4, 0.46], [-0.1, 0.05, 1], [-0.1, 0.05, 1], SHIELD_UP),
    },
  },
};

export const STYLES: Record<WeaponKind, Style> = {
  katana,
  greathammer,
  rapier,
  spear,
  daggers,
  scythe,
  gauntlets,
  swordShield,
};

/** Closest authored move for an animation this weapon doesn't define itself. */
const FALLBACK: Record<AttackAnim, AttackAnim[]> = {
  slashR: ['slashR', 'dualSlash', 'punchR', 'thrust'],
  slashL: ['slashL', 'slashR', 'punchL', 'thrust'],
  overhead: ['overhead', 'slam', 'slashR'],
  slam: ['slam', 'overhead', 'slashR'],
  thrust: ['thrust', 'punchR', 'slashR'],
  sweep: ['sweep', 'spin', 'slashR'],
  spin: ['spin', 'sweep', 'slashR'],
  uppercut: ['uppercut', 'overhead', 'slashL'],
  grab: ['grab', 'thrust', 'punchR'],
  punchR: ['punchR', 'thrust', 'slashR'],
  punchL: ['punchL', 'slashL', 'thrust'],
  bash: ['bash', 'thrust', 'slashL'],
  dualSlash: ['dualSlash', 'slashR'],
  charge: ['charge', 'thrust'],
  hook: ['hook', 'overhead', 'slashR'],
  draw: ['draw', 'slashL', 'slashR'],
};

export function moveFor(style: Style, anim: AttackAnim, key: string): MoveDef {
  for (const a of FALLBACK[anim]) {
    const def = style.moves[a];
    if (def) return style.variant ? style.variant(anim, key, def) : def;
  }
  return Object.values(style.moves)[0]!;
}
