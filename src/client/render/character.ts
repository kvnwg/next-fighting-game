/**
 * Blocky placeholder fighters with fully procedural animation. Every pose is computed each frame
 * from the combat state (attack phase, guard, stagger...), so animations always line up exactly
 * with the gameplay timings the server uses.
 */
import * as THREE from 'three';
import { AttackAnim, AttackDef, CHARACTERS, CharacterDef, CharacterId, WeaponKind } from '../../shared/characters';
import { FighterState } from '../../shared/fighter';
import { clamp, easeInCubic, easeInOut, easeOutCubic } from '../../shared/math';
import { toonRamp } from './textures';
import { WeaponParts, buildWeapon } from './weapons';

type V3 = [number, number, number];
const JOINTS = ['hips', 'torso', 'head', 'armR', 'elbowR', 'handR', 'armL', 'elbowL', 'handL', 'legR', 'kneeR', 'legL', 'kneeL'] as const;
type Joint = (typeof JOINTS)[number];

export interface Pose {
  hipY?: number;
  joints: Partial<Record<Joint, V3>>;
}

export interface AnimInput {
  state: FighterState;
  /** ms since the state began */
  elapsed: number;
  /** state duration for timed states */
  dur: number;
  attack: AttackDef | null;
  windup: number;
  /** horizontal speed m/s, and its direction relative to facing (forward=+1) */
  speed: number;
  moveForward: number;
  moveSide: number;
  airborne: boolean;
  blockHeld: boolean;
  buff: boolean;
}

const ZERO: V3 = [0, 0, 0];

function P(hipY: number, joints: Partial<Record<Joint, V3>>): Pose {
  return { hipY, joints };
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = { hipY: (a.hipY ?? 0) + ((b.hipY ?? 0) - (a.hipY ?? 0)) * t, joints: {} };
  for (const j of JOINTS) {
    const va = a.joints[j] ?? ZERO;
    const vb = b.joints[j] ?? ZERO;
    if (va === ZERO && vb === ZERO) continue;
    out.joints[j] = [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, va[2] + (vb[2] - va[2]) * t];
  }
  return out;
}

function addPose(base: Pose, add: Partial<Record<Joint, V3>>, hipY = 0): Pose {
  const out: Pose = { hipY: (base.hipY ?? 0) + hipY, joints: { ...base.joints } };
  for (const [j, v] of Object.entries(add) as [Joint, V3][]) {
    const b = out.joints[j] ?? ZERO;
    out.joints[j] = [b[0] + v[0], b[1] + v[1], b[2] + v[2]];
  }
  return out;
}

function mirror(p: Pose): Pose {
  const swap: Record<string, Joint> = { armR: 'armL', armL: 'armR', elbowR: 'elbowL', elbowL: 'elbowR', handR: 'handL', handL: 'handR', legR: 'legL', legL: 'legR', kneeR: 'kneeL', kneeL: 'kneeR' };
  const out: Pose = { hipY: p.hipY, joints: {} };
  for (const [j, v] of Object.entries(p.joints) as [Joint, V3][]) {
    out.joints[(swap[j] ?? j) as Joint] = [v[0], -v[1], -v[2]];
  }
  return out;
}

// ------------------------------------------------------------------------------- guard poses

type Style = 'twoHand' | 'oneHand' | 'heavy' | 'polearm' | 'dual' | 'fists' | 'shield';

function styleOf(kind: WeaponKind): Style {
  switch (kind) {
    case 'katana':
      return 'twoHand';
    case 'greathammer':
      return 'heavy';
    case 'rapier':
      return 'oneHand';
    case 'spear':
    case 'scythe':
      return 'polearm';
    case 'daggers':
      return 'dual';
    case 'gauntlets':
      return 'fists';
    case 'swordShield':
      return 'shield';
  }
}

const GUARD: Record<Style, Pose> = {
  twoHand: P(-0.04, {
    torso: [0.08, -0.25, 0],
    armR: [-0.75, 0, 0.3],
    elbowR: [-0.9, 0, 0],
    handR: [0.95, 0, 0],
    armL: [-0.75, 0, -0.3],
    elbowL: [-0.95, 0, 0],
    legR: [0.25, 0, 0],
    kneeR: [0.35, 0, 0],
    legL: [-0.3, 0, 0],
    kneeL: [0.3, 0, 0],
  }),
  heavy: P(-0.06, {
    torso: [0.1, -0.35, 0],
    armR: [-1.1, 0, 0.4],
    elbowR: [-1.4, 0, 0],
    handR: [1.8, 0, 0],
    armL: [-0.6, 0, -0.1],
    elbowL: [-1.2, 0, 0],
    legR: [0.3, 0, -0.08],
    kneeR: [0.35, 0, 0],
    legL: [-0.3, 0, 0.08],
    kneeL: [0.35, 0, 0],
  }),
  oneHand: P(-0.03, {
    torso: [0.05, -0.5, 0],
    armR: [-1.15, 0.2, 0.15],
    elbowR: [-0.3, 0, 0],
    handR: [0.75, 0, 0],
    armL: [0.4, 0, 0.5],
    elbowL: [-1.4, 0, 0],
    legR: [-0.35, 0, 0],
    kneeR: [0.3, 0, 0],
    legL: [0.3, 0, 0],
    kneeL: [0.3, 0, 0],
  }),
  polearm: P(-0.08, {
    torso: [0.1, -0.55, 0],
    armR: [-0.4, 0, 0.3],
    elbowR: [-1.0, 0, 0],
    handR: [1.15, 0, 0],
    armL: [-1.0, 0.3, -0.1],
    elbowL: [-0.4, 0, 0],
    handL: [0.4, 0, 0],
    legR: [0.35, 0, -0.1],
    kneeR: [0.4, 0, 0],
    legL: [-0.4, 0, 0.1],
    kneeL: [0.4, 0, 0],
  }),
  dual: P(-0.12, {
    torso: [0.25, -0.1, 0],
    armR: [-0.7, 0, 0.25],
    elbowR: [-1.2, 0, 0],
    handR: [1.0, 0, 0],
    armL: [-0.9, 0, -0.25],
    elbowL: [-1.2, 0, 0],
    handL: [1.0, 0, 0],
    legR: [0.35, 0, -0.12],
    kneeR: [0.55, 0, 0],
    legL: [-0.45, 0, 0.12],
    kneeL: [0.5, 0, 0],
  }),
  fists: P(-0.08, {
    torso: [0.15, -0.3, 0],
    armR: [-0.55, 0, 0.35],
    elbowR: [-1.9, 0, 0],
    handR: [0.2, 0, 0],
    armL: [-0.8, 0, -0.3],
    elbowL: [-1.7, 0, 0],
    handL: [0.2, 0, 0],
    legR: [0.3, 0, -0.1],
    kneeR: [0.45, 0, 0],
    legL: [-0.35, 0, 0.1],
    kneeL: [0.4, 0, 0],
  }),
  shield: P(-0.05, {
    torso: [0.08, -0.2, 0],
    armR: [-0.6, 0, -0.1],
    elbowR: [-0.8, 0, 0],
    handR: [0.4, 0, 0],
    armL: [-1.0, 0, -0.25],
    elbowL: [-1.1, 0, 0],
    handL: [0, 0, 0],
    legR: [0.3, 0, 0],
    kneeR: [0.35, 0, 0],
    legL: [-0.3, 0, 0],
    kneeL: [0.3, 0, 0],
  }),
};

const BLOCK: Record<Style, Pose> = {
  twoHand: P(-0.1, { torso: [0.1, -0.15, 0], armR: [-1.55, 0, 0.6], elbowR: [-0.7, 0, 0], handR: [0.1, 1.4, 0], armL: [-1.4, 0, -0.5], elbowL: [-0.8, 0, 0], legR: [0.3, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.35, 0, 0], kneeL: [0.45, 0, 0] }),
  heavy: P(-0.12, { torso: [0.15, -0.1, 0], armR: [-1.3, 0, 0.7], elbowR: [-1.0, 0, 0], handR: [0.2, 1.5, 0], armL: [-1.2, 0, -0.5], elbowL: [-1.1, 0, 0], legR: [0.35, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.35, 0, 0], kneeL: [0.5, 0, 0] }),
  oneHand: P(-0.08, { torso: [0.05, -0.35, 0], armR: [-1.5, 0, 0.5], elbowR: [-0.6, 0, 0], handR: [0.3, 1.3, 0], armL: [0.4, 0, 0.5], elbowL: [-1.4, 0, 0], legR: [-0.3, 0, 0], kneeR: [0.4, 0, 0], legL: [0.35, 0, 0], kneeL: [0.4, 0, 0] }),
  polearm: P(-0.12, { torso: [0.1, -0.1, 0], armR: [-1.3, 0, 0.3], elbowR: [-0.9, 0, 0], handR: [0.1, 1.5, 0], armL: [-1.3, 0, -0.3], elbowL: [-0.9, 0, 0], handL: [0.1, -1.5, 0], legR: [0.35, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.35, 0, 0], kneeL: [0.5, 0, 0] }),
  dual: P(-0.15, { torso: [0.2, 0, 0], armR: [-1.6, 0, 0.55], elbowR: [-1.0, 0, 0], handR: [0.4, 0.9, 0], armL: [-1.6, 0, -0.55], elbowL: [-1.0, 0, 0], handL: [0.4, -0.9, 0], legR: [0.35, 0, 0], kneeR: [0.55, 0, 0], legL: [-0.4, 0, 0], kneeL: [0.5, 0, 0] }),
  fists: P(-0.12, { torso: [0.2, 0, 0], armR: [-1.2, 0, 0.5], elbowR: [-2.0, 0, 0], handR: [0, 0, 0], armL: [-1.25, 0, -0.5], elbowL: [-2.0, 0, 0], handL: [0, 0, 0], legR: [0.3, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.35, 0, 0], kneeL: [0.5, 0, 0] }),
  shield: P(-0.12, { torso: [0.12, 0.25, 0], armR: [-0.7, 0, -0.1], elbowR: [-1.0, 0, 0], handR: [0.6, 0, 0], armL: [-1.45, 0, -0.1], elbowL: [-1.4, 0, 0], handL: [0, 0, 0], legR: [0.35, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.35, 0, 0], kneeL: [0.5, 0, 0] }),
};

// ------------------------------------------------------------------------------- attack keyframes

interface AttackKeys {
  windup: Pose;
  strike: Pose;
  /** whole-body spin (radians) over the active frames */
  spin?: number;
}

function attackKeys(anim: AttackAnim, style: Style): AttackKeys {
  const two = style === 'twoHand' || style === 'heavy' || style === 'polearm';
  // a second hand on the grip follows the main arm
  const both = (p: Pose): Pose => {
    if (!two) return p;
    const r = p.joints.armR ?? ZERO;
    const e = p.joints.elbowR ?? ZERO;
    return { hipY: p.hipY, joints: { ...p.joints, armL: [r[0] + 0.1, r[1], r[2] - 0.75], elbowL: [e[0] - 0.2, 0, 0] } };
  };
  switch (anim) {
    case 'slashR':
      return {
        windup: both(P(-0.08, { torso: [0, -0.9, 0], armR: [-2.0, 0, -1.0], elbowR: [-0.6, 0, 0], handR: [0.3, 0, -1.2], legR: [0.35, 0, 0], kneeR: [0.4, 0, 0], legL: [-0.4, 0, 0], kneeL: [0.3, 0, 0] })),
        strike: both(P(-0.14, { torso: [0.25, 0.9, 0], armR: [-1.45, 0, 1.0], elbowR: [-0.1, 0, 0], handR: [0.2, 0, 0.8], legR: [0.45, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.6, 0, 0], kneeL: [0.3, 0, 0] })),
      };
    case 'slashL':
      return {
        windup: both(P(-0.08, { torso: [0, 0.8, 0], armR: [-1.9, 0, 1.0], elbowR: [-0.9, 0, 0], handR: [0.3, 0, 1.0], legR: [0.35, 0, 0], kneeR: [0.4, 0, 0], legL: [-0.4, 0, 0], kneeL: [0.3, 0, 0] })),
        strike: both(P(-0.14, { torso: [0.25, -0.9, 0], armR: [-1.4, 0, -1.1], elbowR: [-0.1, 0, 0], handR: [0.2, 0, -0.9], legR: [0.45, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.6, 0, 0], kneeL: [0.3, 0, 0] })),
      };
    case 'overhead':
      return {
        windup: both(P(0, { torso: [-0.25, -0.2, 0], head: [-0.15, 0, 0], armR: [-2.95, 0, 0.2], elbowR: [-0.9, 0, 0], handR: [0.6, 0, 0], legR: [0.2, 0, 0], legL: [-0.2, 0, 0] })),
        strike: both(P(-0.22, { torso: [0.5, 0, 0], head: [0.1, 0, 0], armR: [-1.1, 0, 0.35], elbowR: [-0.1, 0, 0], handR: [0.1, 0, 0], legR: [0.55, 0, 0], kneeR: [0.6, 0, 0], legL: [-0.75, 0, 0], kneeL: [0.4, 0, 0] })),
      };
    case 'slam':
      return {
        windup: both(P(0.02, { torso: [-0.35, -0.3, 0], head: [-0.2, 0, 0], armR: [-3.1, 0, 0.3], elbowR: [-1.1, 0, 0], handR: [0.9, 0, 0], legR: [0.15, 0, 0], legL: [-0.15, 0, 0] })),
        strike: both(P(-0.38, { torso: [0.75, 0, 0], head: [0.2, 0, 0], armR: [-1.0, 0, 0.3], elbowR: [0, 0, 0], handR: [0.4, 0, 0], legR: [0.7, 0, 0], kneeR: [1.0, 0, 0], legL: [-0.9, 0, 0], kneeL: [0.6, 0, 0] })),
      };
    case 'thrust':
      return {
        windup: both(P(-0.1, { torso: [0, -0.7, 0], armR: [-0.9, 0, -0.1], elbowR: [-1.6, 0, 0], handR: [1.5, 0, 0], legR: [0.4, 0, 0], kneeR: [0.45, 0, 0], legL: [-0.3, 0, 0], kneeL: [0.4, 0, 0] })),
        strike: both(P(-0.2, { torso: [0.4, 0.35, 0], armR: [-1.6, 0, 0.25], elbowR: [0, 0, 0], handR: [0, 0, 0], legR: [0.6, 0, 0], kneeR: [0.4, 0, 0], legL: [-0.95, 0, 0], kneeL: [0.6, 0, 0] })),
      };
    case 'sweep':
      return {
        windup: both(P(-0.35, { torso: [0.3, -1.2, 0], armR: [-0.7, 0, -1.3], elbowR: [-0.3, 0, 0], handR: [0.7, 0, -1.0], legR: [0.6, 0, -0.2], kneeR: [1.0, 0, 0], legL: [-0.6, 0, 0.2], kneeL: [0.8, 0, 0] })),
        strike: both(P(-0.4, { torso: [0.3, 1.3, 0], armR: [-0.9, 0, 1.2], elbowR: [0, 0, 0], handR: [0.8, 0, 1.0], legR: [0.6, 0, -0.2], kneeR: [1.0, 0, 0], legL: [-0.6, 0, 0.2], kneeL: [0.8, 0, 0] })),
      };
    case 'spin':
      return {
        windup: both(P(-0.25, { torso: [0.2, -1.1, 0], armR: [-1.3, 0, -1.2], elbowR: [-0.2, 0, 0], handR: [0.6, 0, -1.1], legR: [0.5, 0, 0], kneeR: [0.7, 0, 0], legL: [-0.5, 0, 0], kneeL: [0.6, 0, 0] })),
        strike: both(P(-0.25, { torso: [0.2, 0.4, 0], armR: [-1.5, 0, -1.4], elbowR: [0, 0, 0], handR: [0.4, 0, -1.2], legR: [0.5, 0, 0], kneeR: [0.7, 0, 0], legL: [-0.5, 0, 0], kneeL: [0.6, 0, 0] })),
        spin: Math.PI * 2,
      };
    case 'uppercut':
      return {
        windup: P(-0.28, { torso: [0.4, -0.5, 0], armR: [0.4, 0, -0.2], elbowR: [-1.4, 0, 0], handR: [0.4, 0, 0], armL: [-0.9, 0, -0.3], elbowL: [-1.5, 0, 0], legR: [0.5, 0, 0], kneeR: [0.9, 0, 0], legL: [-0.5, 0, 0], kneeL: [0.8, 0, 0] }),
        strike: P(0.04, { torso: [-0.2, 0.4, 0], armR: [-2.7, 0, 0.3], elbowR: [-0.6, 0, 0], handR: [0.2, 0, 0], armL: [0.2, 0, -0.3], elbowL: [-1.2, 0, 0], legR: [0.2, 0, 0], legL: [-0.4, 0, 0], kneeL: [0.2, 0, 0] }),
      };
    case 'punchR':
      return {
        windup: P(-0.12, { torso: [0.1, -0.7, 0], armR: [0.3, 0, -0.3], elbowR: [-2.1, 0, 0], armL: [-1.0, 0, -0.3], elbowL: [-1.8, 0, 0], legR: [0.35, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.4, 0, 0], kneeL: [0.4, 0, 0] }),
        strike: P(-0.15, { torso: [0.25, 0.6, 0], armR: [-1.6, 0, 0.3], elbowR: [-0.05, 0, 0], armL: [-0.4, 0, -0.3], elbowL: [-1.9, 0, 0], legR: [0.5, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.6, 0, 0], kneeL: [0.4, 0, 0] }),
      };
    case 'punchL': {
      const k = attackKeys('punchR', style);
      return { windup: mirror(k.windup), strike: mirror(k.strike) };
    }
    case 'bash':
      return {
        windup: P(-0.1, { torso: [0, -0.6, 0], armL: [-0.5, 0, -0.6], elbowL: [-1.5, 0, 0], armR: [-0.4, 0, -0.2], elbowR: [-0.9, 0, 0], legR: [0.35, 0, 0], kneeR: [0.4, 0, 0], legL: [-0.3, 0, 0], kneeL: [0.4, 0, 0] }),
        strike: P(-0.18, { torso: [0.35, 0.6, 0], armL: [-1.55, 0, 0.2], elbowL: [-0.4, 0, 0], armR: [-0.3, 0, -0.3], elbowR: [-0.8, 0, 0], legR: [0.55, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.75, 0, 0], kneeL: [0.4, 0, 0] }),
      };
    case 'charge':
      return {
        windup: P(-0.2, { torso: [0.55, 0.3, 0], armL: [-1.45, 0, -0.1], elbowL: [-1.4, 0, 0], armR: [-0.3, 0, -0.2], elbowR: [-0.8, 0, 0], legR: [0.5, 0, 0], kneeR: [0.7, 0, 0], legL: [-0.5, 0, 0], kneeL: [0.5, 0, 0] }),
        strike: P(-0.2, { torso: [0.65, 0.3, 0], armL: [-1.55, 0, -0.1], elbowL: [-1.2, 0, 0], armR: [-0.3, 0, -0.2], elbowR: [-0.8, 0, 0], legR: [-0.7, 0, 0], kneeR: [0.3, 0, 0], legL: [0.6, 0, 0], kneeL: [0.8, 0, 0] }),
      };
    case 'dualSlash':
      return {
        windup: P(-0.12, { torso: [-0.05, 0, 0], armR: [-2.4, 0, 0.6], elbowR: [-0.5, 0, 0], handR: [0.5, 0, 0], armL: [-2.4, 0, -0.6], elbowL: [-0.5, 0, 0], handL: [0.5, 0, 0], legR: [0.35, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.4, 0, 0], kneeL: [0.4, 0, 0] }),
        strike: P(-0.25, { torso: [0.45, 0, 0], armR: [-0.7, 0, -1.0], elbowR: [-0.1, 0, 0], handR: [0.3, 0, 0], armL: [-0.7, 0, 1.0], elbowL: [-0.1, 0, 0], handL: [0.3, 0, 0], legR: [0.5, 0, 0], kneeR: [0.6, 0, 0], legL: [-0.6, 0, 0], kneeL: [0.4, 0, 0] }),
      };
    case 'grab':
      return {
        windup: P(-0.2, { torso: [0.2, 0, 0], armR: [-0.6, 0, -1.0], elbowR: [-0.6, 0, 0], armL: [-0.6, 0, 1.0], elbowL: [-0.6, 0, 0], legR: [0.4, 0, 0], kneeR: [0.6, 0, 0], legL: [-0.4, 0, 0], kneeL: [0.5, 0, 0] }),
        strike: P(-0.25, { torso: [0.55, 0, 0], armR: [-1.5, 0, 0.35], elbowR: [-0.3, 0, 0], armL: [-1.5, 0, -0.35], elbowL: [-0.3, 0, 0], legR: [0.6, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.8, 0, 0], kneeL: [0.4, 0, 0] }),
      };
    case 'hook':
      return {
        windup: both(P(-0.05, { torso: [-0.15, -0.8, 0], armR: [-2.6, 0, -0.5], elbowR: [-0.6, 0, 0], handR: [0.5, 0, 0], legR: [0.3, 0, 0], legL: [-0.3, 0, 0] })),
        strike: both(P(-0.15, { torso: [0.35, 0.5, 0], armR: [-1.5, 0, 0.3], elbowR: [0, 0, 0], handR: [0, 0, 0], legR: [0.5, 0, 0], kneeR: [0.4, 0, 0], legL: [-0.7, 0, 0], kneeL: [0.4, 0, 0] })),
      };
  }
}

// ------------------------------------------------------------------------------- the model

export class CharacterModel {
  readonly root = new THREE.Group();
  readonly char: CharacterDef;
  private readonly body = new THREE.Group();
  private readonly j: Record<Joint, THREE.Group>;
  private readonly style: Style;
  readonly weapon: WeaponParts;
  private readonly materials: THREE.MeshToonMaterial[] = [];
  private cur: Pose = { hipY: 0, joints: {} };
  private walkPhase = 0;
  private flashT = 0;
  private flashColor = new THREE.Color('#ffffff');
  private breath = Math.random() * 10;
  private spin = 0;
  private readonly hips0 = 0.92;
  readonly scale: number;

  constructor(charId: CharacterId) {
    this.char = CHARACTERS[charId];
    this.style = styleOf(this.char.weaponKind);
    const pal = this.char.palette;
    const mat = (color: string, emissive?: string) => {
      const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() });
      if (emissive) {
        m.emissive = new THREE.Color(emissive);
        m.userData.baseEmissive = emissive;
      } else m.userData.baseEmissive = '#000000';
      this.materials.push(m);
      return m;
    };
    const skin = mat(pal.skin);
    const prim = mat(pal.primary);
    const sec = mat(pal.secondary);
    const acc = mat(pal.accent);
    const hair = mat(pal.hair);
    const dark = mat('#1d1b22');

    const g = (parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group => {
      const o = new THREE.Group();
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    this.root.add(this.body);
    const hips = g(this.body, 0, this.hips0, 0);
    const torso = g(hips, 0, 0.06, 0);
    const head = g(torso, 0, 0.6, 0);
    const armR = g(torso, -0.33, 0.5, 0);
    const elbowR = g(armR, 0, -0.29, 0);
    const handR = g(elbowR, 0, -0.27, 0);
    const armL = g(torso, 0.33, 0.5, 0);
    const elbowL = g(armL, 0, -0.29, 0);
    const handL = g(elbowL, 0, -0.27, 0);
    const legR = g(hips, -0.12, -0.02, 0);
    const kneeR = g(legR, 0, -0.43, 0);
    const legL = g(hips, 0.12, -0.02, 0);
    const kneeL = g(legL, 0, -0.43, 0);
    this.j = { hips, torso, head, armR, elbowR, handR, armL, elbowL, handL, legR, kneeR, legL, kneeL };

    // body
    box(sec, 0.42, 0.18, 0.27, 0, 0, 0, hips);
    box(prim, 0.5, 0.5, 0.3, 0, 0.3, 0, torso);
    box(acc, 0.52, 0.08, 0.32, 0, 0.08, 0, torso); // belt / sash
    box(skin, 0.36, 0.36, 0.34, 0, 0.2, 0, head);
    box(dark, 0.06, 0.06, 0.02, -0.08, 0.22, 0.175, head);
    box(dark, 0.06, 0.06, 0.02, 0.08, 0.22, 0.175, head);
    for (const [arm, elbow, hand] of [
      [armR, elbowR, handR],
      [armL, elbowL, handL],
    ]) {
      box(prim, 0.16, 0.3, 0.16, 0, -0.13, 0, arm);
      box(skin, 0.14, 0.27, 0.14, 0, -0.13, 0, elbow);
      hand.userData.fist = box(skin, 0.13, 0.13, 0.13, 0, -0.02, 0.01, hand);
    }
    for (const [leg, knee] of [
      [legR, kneeR],
      [legL, kneeL],
    ]) {
      box(sec, 0.18, 0.43, 0.2, 0, -0.21, 0, leg);
      box(sec, 0.17, 0.42, 0.19, 0, -0.2, 0, knee);
      box(dark, 0.19, 0.08, 0.28, 0, -0.42, 0.04, knee);
    }
    this.headgear(head, torso, { prim, sec, acc, hair, dark, skin, mat }, box);

    // weapon in hand: grip at the fist, pointing along the forearm's forward axis
    this.weapon = buildWeapon(this.char, mat);
    const wR = g(handR, 0, -0.03, 0.02);
    wR.add(this.weapon.main);
    if (this.weapon.off) {
      const wL = g(handL, 0, -0.03, 0.02);
      if (this.char.weaponKind === 'swordShield') {
        wL.rotation.set(0, 0, 0);
        wL.position.set(0.1, 0.12, 0);
        wL.rotation.y = Math.PI / 2;
      }
      wL.add(this.weapon.off);
    }
    if (this.weapon.hideHands) {
      (handR.userData.fist as THREE.Mesh).visible = false;
      (handL.userData.fist as THREE.Mesh).visible = false;
    }

    this.scale = this.char.id === 'juggernaut' ? 1.15 : this.char.id === 'shade' ? 0.95 : 1;
    this.root.scale.setScalar(this.scale);
  }

  /** Distinguishing headwear per placeholder character. Replace freely. */
  private headgear(
    head: THREE.Group,
    torso: THREE.Group,
    m: { prim: THREE.Material; sec: THREE.Material; acc: THREE.Material; hair: THREE.Material; dark: THREE.Material; skin: THREE.Material; mat: (c: string, e?: string) => THREE.MeshToonMaterial },
    box: (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, p: THREE.Object3D) => THREE.Mesh,
  ): void {
    switch (this.char.id) {
      case 'ronin': {
        box(m.hair, 0.38, 0.1, 0.36, 0, 0.38, -0.01, head);
        const straw = m.mat('#c9a860');
        box(straw, 0.8, 0.05, 0.8, 0, 0.44, 0, head);
        box(straw, 0.5, 0.06, 0.5, 0, 0.49, 0, head);
        box(straw, 0.22, 0.06, 0.22, 0, 0.54, 0, head);
        box(m.acc, 0.4, 0.1, 0.36, 0, 0.0, 0, head); // scarf
        box(m.acc, 0.1, 0.35, 0.06, 0.12, -0.15, -0.18, torso);
        break;
      }
      case 'juggernaut': {
        const iron = m.mat('#7c848c');
        box(iron, 0.42, 0.24, 0.4, 0, 0.3, 0, head);
        box(m.dark, 0.3, 0.05, 0.02, 0, 0.22, 0.2, head);
        box(m.mat('#e8e0c8'), 0.08, 0.22, 0.08, -0.25, 0.42, 0, head);
        box(m.mat('#e8e0c8'), 0.08, 0.22, 0.08, 0.25, 0.42, 0, head);
        box(iron, 0.26, 0.16, 0.3, -0.36, 0.55, 0, torso);
        box(iron, 0.26, 0.16, 0.3, 0.36, 0.55, 0, torso);
        box(m.hair, 0.3, 0.12, 0.05, 0, 0.06, 0.18, head); // beard
        break;
      }
      case 'duelist': {
        box(m.hair, 0.38, 0.12, 0.38, 0, 0.36, -0.02, head);
        box(m.hair, 0.38, 0.22, 0.08, 0, 0.18, -0.18, head);
        const hat = m.mat('#2a1a26');
        box(hat, 0.56, 0.05, 0.46, 0, 0.42, 0, head);
        box(hat, 0.34, 0.14, 0.32, 0, 0.5, 0, head);
        box(m.mat('#f4f0e6'), 0.04, 0.32, 0.04, 0.15, 0.62, -0.06, head);
        const cape = box(m.prim, 0.5, 0.65, 0.04, 0, 0.2, -0.18, torso);
        cape.rotation.x = 0.1;
        break;
      }
      case 'lancer': {
        const helm = m.mat('#b9c2c8');
        box(helm, 0.4, 0.2, 0.4, 0, 0.32, 0, head);
        box(helm, 0.06, 0.18, 0.06, 0, 0.12, 0.19, head);
        box(m.acc, 0.06, 0.14, 0.42, 0, 0.48, -0.02, head);
        box(m.acc, 0.06, 0.08, 0.2, 0, 0.42, -0.26, head);
        break;
      }
      case 'shade': {
        box(m.prim, 0.42, 0.44, 0.4, 0, 0.24, -0.02, head); // hood
        box(m.dark, 0.32, 0.12, 0.04, 0, 0.1, 0.2, head); // mask
        box(m.mat('#e9e6ff', '#7a5cff'), 0.07, 0.04, 0.02, -0.08, 0.22, 0.19, head);
        box(m.mat('#e9e6ff', '#7a5cff'), 0.07, 0.04, 0.02, 0.08, 0.22, 0.19, head);
        box(m.acc, 0.1, 0.3, 0.05, -0.1, -0.05, -0.2, head);
        break;
      }
      case 'reaper': {
        box(m.prim, 0.44, 0.46, 0.42, 0, 0.24, -0.02, head);
        box(m.dark, 0.3, 0.28, 0.04, 0, 0.2, 0.2, head);
        const glow = m.mat('#7cffb2', '#3cff8a');
        box(glow, 0.06, 0.05, 0.02, -0.07, 0.22, 0.22, head);
        box(glow, 0.06, 0.05, 0.02, 0.07, 0.22, 0.22, head);
        const robe = box(m.prim, 0.54, 0.5, 0.34, 0, -0.22, 0, torso);
        robe.castShadow = true;
        break;
      }
      case 'monk': {
        box(m.acc, 0.38, 0.06, 0.36, 0, 0.34, 0, head); // headband
        const beads = m.mat('#5a2a16');
        for (let i = 0; i < 6; i++) box(beads, 0.07, 0.07, 0.07, -0.18 + i * 0.07, 0.48 - Math.abs(i - 2.5) * 0.06, 0.17, torso);
        box(m.skin, 0.2, 0.2, 0.32, -0.27, 0.45, 0, torso); // bare shoulder
        break;
      }
      case 'paladin': {
        const steel = m.mat('#d4d9df');
        box(steel, 0.42, 0.42, 0.4, 0, 0.21, 0, head);
        box(m.dark, 0.3, 0.05, 0.02, 0, 0.22, 0.21, head);
        box(m.dark, 0.05, 0.16, 0.02, 0, 0.12, 0.21, head);
        box(m.acc, 0.06, 0.18, 0.36, 0, 0.5, -0.02, head);
        box(steel, 0.24, 0.12, 0.3, -0.34, 0.55, 0, torso);
        box(steel, 0.24, 0.12, 0.3, 0.34, 0.55, 0, torso);
        box(m.sec, 0.4, 0.4, 0.04, 0, 0.3, 0.16, torso); // tabard
        break;
      }
    }
  }

  get rightHand(): THREE.Group {
    return this.j.handR;
  }

  flash(color: string, strength = 1): void {
    this.flashColor.set(color);
    this.flashT = strength;
  }

  setVisible(v: boolean): void {
    this.body.visible = v;
  }

  /** Compute the target pose for this frame. */
  private target(a: AnimInput, dt: number): { pose: Pose; rate: number } {
    const guard = GUARD[this.style];
    let pose = guard;
    let rate = 18;

    // locomotion layer
    const moving = a.speed > 0.4 && !a.airborne;
    this.walkPhase += dt * (moving ? 2.4 + a.speed * 1.1 : 0);
    if (moving) {
      const amp = clamp(a.speed / 6.5, 0.3, 1.1) * 0.7;
      const s = Math.sin(this.walkPhase);
      const c = Math.cos(this.walkPhase);
      const dir = a.moveForward < -0.3 ? -1 : 1;
      pose = addPose(
        pose,
        {
          legR: [s * amp * dir, 0, 0],
          kneeR: [Math.max(0, -c) * amp * 1.2, 0, 0],
          legL: [-s * amp * dir, 0, 0],
          kneeL: [Math.max(0, c) * amp * 1.2, 0, 0],
          torso: [0.05 * amp, s * 0.08, 0],
        },
        Math.abs(c) * 0.04 - 0.02,
      );
    } else if (!a.airborne) {
      this.breath += dt;
      pose = addPose(pose, { torso: [Math.sin(this.breath * 2) * 0.02, 0, 0] }, Math.sin(this.breath * 2) * 0.012);
    }
    if (a.airborne) pose = addPose(pose, { legR: [-0.6, 0, 0], kneeR: [1.0, 0, 0], legL: [-0.2, 0, 0], kneeL: [0.6, 0, 0] }, 0.05);

    this.spin = 0;
    const e = a.elapsed;
    switch (a.state) {
      case 'block':
      case 'blockstun': {
        pose = this.overlayUpper(pose, BLOCK[this.style]);
        if (a.state === 'blockstun') pose = addPose(pose, { torso: [-0.25 * (1 - e / Math.max(1, a.dur)), 0, 0] });
        rate = 28;
        break;
      }
      case 'attack': {
        if (!a.attack) break;
        const k = attackKeys(a.attack.anim, this.style);
        const w = Math.max(1, a.windup);
        const act = Math.max(1, a.attack.active);
        const rec = Math.max(1, a.attack.recovery);
        if (e < w) {
          pose = lerpPose(pose, k.windup, easeOutCubic(e / w));
          rate = 30;
        } else if (e < w + act) {
          const t = easeInCubic((e - w) / act) * 0.6 + ((e - w) / act) * 0.4;
          pose = lerpPose(k.windup, k.strike, t);
          if (k.spin) this.spin = k.spin * t;
          rate = 80;
        } else {
          const t = easeInOut((e - w - act) / rec);
          pose = lerpPose(k.strike, pose, t);
          if (k.spin) this.spin = k.spin;
          rate = 25;
        }
        break;
      }
      case 'stagger': {
        const t = clamp(e / Math.max(1, a.dur), 0, 1);
        const amt = Math.sin(t * Math.PI) * 1.2 + 0.2;
        pose = addPose(pose, { torso: [-0.45 * amt, 0.2 * amt, 0], head: [-0.3 * amt, 0, 0], armR: [0.3 * amt, 0, -0.4 * amt], armL: [0.3 * amt, 0, 0.4 * amt] }, -0.05 * amt);
        rate = 30;
        break;
      }
      case 'deflected': {
        const t = clamp(e / Math.max(1, a.dur), 0, 1);
        const amt = 1 - easeInOut(t);
        pose = lerpPose(pose, P(-0.06, { torso: [-0.55, -0.3, 0], head: [-0.35, 0, 0], armR: [-2.7, 0, -0.7], elbowR: [-0.2, 0, 0], handR: [0.4, 0, 0], armL: [0.5, 0, 0.7], legR: [0.55, 0, 0], kneeR: [0.3, 0, 0], legL: [-0.2, 0, 0] }), amt);
        rate = 40;
        break;
      }
      case 'broken': {
        const kneel = P(-0.42, { torso: [0.55, 0, 0], head: [0.45, 0, 0], armR: [0.1, 0, -0.15], elbowR: [-0.3, 0, 0], handR: [1.3, 0, 0], armL: [0.1, 0, 0.15], elbowL: [-0.2, 0, 0], legL: [-1.45, 0, 0], kneeL: [1.45, 0, 0], legR: [0.1, 0, 0], kneeR: [1.55, 0, 0] });
        pose = addPose(kneel, { torso: [Math.sin(e / 120) * 0.05, Math.sin(e / 300) * 0.15, 0] });
        rate = 14;
        break;
      }
      case 'knockdown':
      case 'dead': {
        const lie = P(-0.78, { hips: [-1.45, 0, 0], torso: [0.1, 0, 0], head: [-0.2, 0, 0], armR: [-2.6, 0, -0.4], armL: [-2.6, 0, 0.4], legR: [-0.15, 0, 0], kneeR: [0.2, 0, 0], legL: [0.15, 0, 0], kneeL: [0.35, 0, 0] });
        if (a.state === 'knockdown' && a.dur - e < 350) {
          pose = lerpPose(lie, guard, 1 - (a.dur - e) / 350);
        } else pose = lie;
        rate = 10;
        break;
      }
      case 'dodge': {
        const t = clamp(e / Math.max(1, a.dur), 0, 1);
        const amt = Math.sin(t * Math.PI);
        pose = addPose(pose, { torso: [0.35 * amt * a.moveForward, 0, -0.35 * amt * a.moveSide], legR: [-0.3 * amt, 0, 0], kneeR: [0.6 * amt, 0, 0], legL: [0.3 * amt, 0, 0], kneeL: [0.6 * amt, 0, 0] }, -0.22 * amt);
        rate = 30;
        break;
      }
      case 'stance': {
        if (this.char.ability.kind === 'counter') {
          pose = P(-0.2, { torso: [0, 0, 0], armR: [-1.1, 0, 0.4], elbowR: [-0.7, 0, 0], handR: [0, 0, 0], armL: [-1.3, 0, -0.4], elbowL: [-0.5, 0, 0], handL: [0, 0, 0], legR: [0.5, 0, -0.3], kneeR: [0.7, 0, 0], legL: [-0.5, 0, 0.3], kneeL: [0.7, 0, 0] });
        } else {
          // iai: hand on hilt at the hip, blade sheathed behind
          pose = P(-0.2, { torso: [0.35, -0.5, 0], head: [-0.2, 0.4, 0], armR: [-0.3, 0, 0.55], elbowR: [-1.2, 0, 0], handR: [2.6, 0, 0], armL: [-0.2, 0, 0.3], elbowL: [-1.1, 0, 0], legR: [0.6, 0, 0], kneeR: [0.7, 0, 0], legL: [-0.65, 0, 0], kneeL: [0.6, 0, 0] });
        }
        rate = 20;
        break;
      }
      default:
        break;
    }
    return { pose, rate };
  }

  /** Use the upper body of `upper` over the legs of `base`. */
  private overlayUpper(base: Pose, upper: Pose): Pose {
    const out: Pose = { hipY: Math.min(base.hipY ?? 0, upper.hipY ?? 0), joints: { ...base.joints } };
    for (const j of ['torso', 'head', 'armR', 'elbowR', 'handR', 'armL', 'elbowL', 'handL'] as Joint[]) {
      if (upper.joints[j]) out.joints[j] = upper.joints[j];
    }
    const moving = (base.joints.legR?.[0] ?? 0) !== (GUARD[this.style].joints.legR?.[0] ?? 0);
    if (!moving) {
      for (const j of ['legR', 'kneeR', 'legL', 'kneeL'] as Joint[]) if (upper.joints[j]) out.joints[j] = upper.joints[j];
    }
    return out;
  }

  update(a: AnimInput, dt: number): void {
    const { pose, rate } = this.target(a, dt);
    const k = 1 - Math.exp(-rate * dt);
    this.cur = lerpPose(this.cur, pose, k);
    for (const j of JOINTS) {
      const v = this.cur.joints[j] ?? ZERO;
      this.j[j].rotation.set(v[0], v[1], v[2]);
    }
    this.j.hips.position.y = this.hips0 + (this.cur.hipY ?? 0);
    this.j.hips.rotation.y += this.spin;

    // hit flash / buff glow
    this.flashT = Math.max(0, this.flashT - dt * 8);
    const glow = a.buff ? 0.35 + Math.sin(performance.now() / 90) * 0.15 : 0;
    for (const m of this.materials) {
      if (this.flashT > 0) {
        m.emissive.copy(this.flashColor).multiplyScalar(this.flashT);
      } else if (glow > 0) {
        m.emissive.setRGB(glow, glow * 0.15, 0);
      } else {
        m.emissive.set(m.userData.baseEmissive as string);
      }
    }
  }

  weaponTips(base: THREE.Vector3, tip: THREE.Vector3, off?: { base: THREE.Vector3; tip: THREE.Vector3 }): boolean {
    this.weapon.base.getWorldPosition(base);
    this.weapon.tip.getWorldPosition(tip);
    if (off && this.weapon.offBase && this.weapon.offTip) {
      this.weapon.offBase.getWorldPosition(off.base);
      this.weapon.offTip.getWorldPosition(off.tip);
      return true;
    }
    return false;
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
