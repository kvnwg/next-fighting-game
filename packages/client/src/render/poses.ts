import { GETUP_FRAMES, WEAPONS, type FighterState, type MoveAnim, type MoveData, type MoveId, type WeaponId } from '@nfg/shared';

/** Indices into a pose vector. Positions are meters, angles radians. */
export const P = {
  hipY: 0,
  lean: 1,
  twist: 2,
  tilt: 3,
  bodyYaw: 4,
  bodyPitch: 5,
  fwd: 6,
  side: 7,
  // Right hand / weapon pivot position and shaft direction, in torso space (+x is the fighter's left).
  wpx: 8,
  wpy: 9,
  wpz: 10,
  wdx: 11,
  wdy: 12,
  wdz: 13,
  wroll: 14,
  // Foot targets in root space (ground is y = 0).
  flx: 15,
  fly: 16,
  flz: 17,
  frx: 18,
  fry: 19,
  frz: 20,
  headPitch: 21,
  headYaw: 22,
  roll: 23,
} as const;

export const POSE_SIZE = 24;
export type Pose = Float32Array;
type Spec = Partial<Record<keyof typeof P, number>>;

const STANCE_SPEC: Required<Spec> = {
  hipY: 0.86, lean: 0.12, twist: -0.3, tilt: 0, bodyYaw: 0, bodyPitch: 0, fwd: 0, side: 0,
  wpx: -0.14, wpy: 0.1, wpz: 0.3, wdx: 0.42, wdy: 0.62, wdz: 0.62, wroll: 0,
  flx: 0.2, fly: 0, flz: 0.26, frx: -0.24, fry: 0, frz: -0.22,
  headPitch: 0.05, headYaw: 0.3, roll: 0,
};

export type PoseSpec = Spec;

export function make(spec: Spec, base: Spec = STANCE_SPEC): Pose {
  const merged = { ...base, ...spec } as Required<Spec>;
  const out = new Float32Array(POSE_SIZE);
  for (const [k, i] of Object.entries(P)) out[i] = merged[k as keyof typeof P];
  return out;
}

const WIDE = { flx: 0.27, flz: 0.3, frx: -0.28, frz: -0.28 };

export const POSES = {
  stance: make({}),
  guard: make({ hipY: 0.82, lean: 0.05, twist: -0.05, wpx: -0.3, wpy: 0.42, wpz: 0.34, wdx: 1, wdy: 0.16, wdz: 0.05, headYaw: 0.05, flx: 0.24, flz: 0.18, frx: -0.26, frz: -0.28 }),
  parry: make({ hipY: 0.8, lean: 0.2, twist: 0, wpx: -0.24, wpy: 0.52, wpz: 0.46, wdx: 0.85, wdy: 0.5, wdz: 0.2, headYaw: 0, flx: 0.24, flz: 0.24, frx: -0.26, frz: -0.3 }),
  parryWhiff: make({ hipY: 0.76, lean: 0.38, twist: 0.2, wpx: -0.12, wpy: 0.62, wpz: 0.62, wdx: 0.7, wdy: 0.62, wdz: 0.35, headPitch: 0.1, flz: 0.42 }),
  hit: make({ hipY: 0.84, lean: -0.35, twist: 0.25, fwd: -0.08, headPitch: -0.35, headYaw: 0, wpx: -0.3, wpy: 0.05, wpz: 0.25, wdx: 0.35, wdy: 0.35, wdz: 0.85 }),
  stagger: make({ hipY: 0.78, lean: -0.45, twist: 0.4, fwd: -0.15, headPitch: -0.35, wpx: -0.5, wpy: 0.75, wpz: -0.15, wdx: -0.35, wdy: 0.85, wdz: -0.4, flx: 0.3, flz: 0.1, frx: -0.15, frz: -0.45 }),
  guardbreak: make({ hipY: 0.7, lean: 0.5, twist: 0.5, headPitch: 0.45, headYaw: 0, wpx: -0.55, wpy: 0.25, wpz: 0.05, wdx: -0.85, wdy: 0.3, wdz: 0.3, flx: 0.28, flz: 0.2, frx: -0.18, frz: -0.35 }),
  dodge: make({ hipY: 0.66, lean: 0.35, twist: -0.1, wpx: -0.2, wpy: 0.18, wpz: 0.28, wdx: 0.6, wdy: 0.5, wdz: 0.5, ...WIDE }),
  jump: make({ hipY: 0.95, lean: 0.05, flx: 0.2, fly: 0.34, flz: 0.12, frx: -0.2, fry: 0.24, frz: -0.12 }),
  down: make({ hipY: 0.2, bodyPitch: -1.45, lean: 0, twist: 0, headPitch: -0.2, headYaw: 0, wpx: -0.35, wpy: 0.15, wpz: 0.25, wdx: 0.9, wdy: 0.1, wdz: 0.3, flx: 0.22, fly: 0.08, flz: 0.95, frx: -0.2, fry: 0.08, frz: 0.9 }),
  kneel: make({ hipY: 0.5, bodyPitch: -0.15, lean: 0.5, headPitch: 0.1, flx: 0.24, flz: 0.32, frx: -0.18, frz: -0.42, wpx: -0.4, wpy: 0.0, wpz: 0.3, wdx: -0.3, wdy: 0.6, wdz: 0.7 }),
  victory: make({ hipY: 0.92, lean: -0.1, twist: -0.2, wpx: -0.18, wpy: 1.0, wpz: 0.12, wdx: 0.1, wdy: 1, wdz: 0.08, headPitch: -0.15 }),
  landing: make({ hipY: 0.42, lean: 0.65, twist: -0.2, wpx: -0.48, wpy: -0.08, wpz: 0.25, wdx: -0.65, wdy: -0.15, wdz: 0.75, flx: 0.25, flz: 0.32, frx: -0.18, frz: -0.42, headPitch: -0.2 }),
};

interface AttackKeys {
  windup: Pose;
  strike: Pose;
  follow: Pose;
  /** Halfway back from the follow-through, computed once. */
  settle?: Pose;
}

const ATTACKS: Record<MoveAnim, AttackKeys> = {
  slashR: {
    windup: make({ hipY: 0.8, lean: 0.15, twist: -1.0, tilt: 0.08, wpx: -0.42, wpy: 0.32, wpz: -0.02, wdx: -0.75, wdy: 0.25, wdz: -0.6, wroll: 0.3, headYaw: 0.9, ...WIDE }),
    strike: make({ hipY: 0.8, lean: 0.25, twist: 0.3, wpx: -0.05, wpy: 0.36, wpz: 0.52, wdx: 0.25, wdy: 0.12, wdz: 1, headYaw: -0.2, ...WIDE }),
    follow: make({ hipY: 0.78, lean: 0.3, twist: 0.95, wpx: 0.22, wpy: 0.3, wpz: 0.38, wdx: 0.95, wdy: 0.05, wdz: -0.15, wroll: -0.2, headYaw: -0.8, ...WIDE }),
  },
  slashL: {
    windup: make({ hipY: 0.8, lean: 0.15, twist: 0.85, wpx: 0.12, wpy: 0.42, wpz: 0.12, wdx: 0.8, wdy: 0.3, wdz: -0.5, wroll: -0.3, headYaw: -0.8, ...WIDE }),
    strike: make({ hipY: 0.8, lean: 0.25, twist: -0.2, wpx: -0.12, wpy: 0.38, wpz: 0.5, wdx: -0.3, wdy: 0.12, wdz: 1, headYaw: 0.2, ...WIDE }),
    follow: make({ hipY: 0.78, lean: 0.3, twist: -0.95, wpx: -0.48, wpy: 0.3, wpz: 0.22, wdx: -0.95, wdy: 0.08, wdz: -0.2, wroll: 0.2, headYaw: 0.8, ...WIDE }),
  },
  thrust: {
    windup: make({ hipY: 0.84, lean: 0, twist: -0.7, wpx: -0.22, wpy: 0.32, wpz: -0.22, wdx: 0.08, wdy: 0.06, wdz: 1, headYaw: 0.6, flx: 0.18, flz: 0.42, frx: -0.2, frz: -0.4 }),
    strike: make({ hipY: 0.76, lean: 0.45, twist: 0.15, fwd: 0.25, wpx: -0.04, wpy: 0.4, wpz: 0.62, wdx: 0.03, wdy: 0.04, wdz: 1, headYaw: -0.1, flx: 0.18, flz: 0.55, frx: -0.2, frz: -0.45 }),
    follow: make({ hipY: 0.76, lean: 0.45, twist: 0.15, fwd: 0.3, wpx: -0.04, wpy: 0.38, wpz: 0.6, wdx: 0.05, wdy: 0.02, wdz: 1, headYaw: -0.1, flx: 0.18, flz: 0.55, frx: -0.2, frz: -0.45 }),
  },
  spin: {
    windup: make({ hipY: 0.66, lean: 0.3, twist: -0.9, wpx: -0.4, wpy: 0.22, wpz: -0.08, wdx: -0.9, wdy: 0.05, wdz: -0.4, headYaw: 0.8, ...WIDE }),
    strike: make({ hipY: 0.72, lean: 0.2, twist: 0, bodyYaw: Math.PI, wpx: -0.42, wpy: 0.35, wpz: 0.28, wdx: -1, wdy: 0.05, wdz: 0.25, headYaw: 0, ...WIDE }),
    follow: make({ hipY: 0.74, lean: 0.25, twist: 0.3, bodyYaw: Math.PI * 2, wpx: -0.4, wpy: 0.32, wpz: 0.3, wdx: -1, wdy: 0.08, wdz: 0.3, headYaw: -0.2, ...WIDE }),
  },
  overhead: {
    windup: make({ hipY: 0.92, lean: -0.3, twist: -0.15, wpx: -0.1, wpy: 0.9, wpz: -0.05, wdx: 0.12, wdy: 0.45, wdz: -0.88, headPitch: -0.15, headYaw: 0.1, flx: 0.2, flz: 0.3, frx: -0.22, frz: -0.3 }),
    strike: make({ hipY: 0.8, lean: 0.35, twist: 0, wpx: 0, wpy: 0.5, wpz: 0.55, wdx: 0.05, wdy: 0.25, wdz: 1, headYaw: 0, ...WIDE }),
    follow: make({ hipY: 0.68, lean: 0.55, twist: 0, wpx: 0, wpy: 0.08, wpz: 0.55, wdx: 0, wdy: -0.75, wdz: 0.65, headPitch: 0.2, headYaw: 0, ...WIDE }),
  },
  rising: {
    windup: make({ hipY: 0.6, lean: 0.4, twist: -0.85, wpx: -0.36, wpy: -0.05, wpz: -0.12, wdx: -0.3, wdy: -0.45, wdz: -0.85, headPitch: -0.2, headYaw: 0.8, flx: 0.3, flz: 0.38, frx: -0.3, frz: -0.38 }),
    strike: make({ hipY: 0.95, lean: -0.1, twist: 0.1, fwd: 0.15, wpx: 0, wpy: 0.72, wpz: 0.48, wdx: 0.08, wdy: 0.95, wdz: 0.25, headPitch: -0.2, headYaw: 0 }),
    follow: make({ hipY: 0.95, lean: -0.2, twist: 0.1, fwd: 0.15, wpx: 0.05, wpy: 0.95, wpz: 0.15, wdx: 0.1, wdy: 0.85, wdz: -0.5, headPitch: -0.25, headYaw: 0 }),
  },
  plunge: {
    windup: make({ hipY: 0.95, lean: -0.1, wpx: 0, wpy: 0.85, wpz: 0.15, wdx: 0.05, wdy: 0.95, wdz: 0.2, flx: 0.2, fly: 0.3, flz: 0.15, frx: -0.2, fry: 0.2, frz: -0.05 }),
    strike: make({ hipY: 0.55, lean: 0.55, wpx: 0, wpy: 0.1, wpz: 0.5, wdx: 0, wdy: -1, wdz: 0.15, headPitch: 0.15, flx: 0.25, flz: 0.3, frx: -0.25, frz: -0.35 }),
    follow: make({ hipY: 0.55, lean: 0.55, wpx: 0, wpy: 0.1, wpz: 0.5, wdx: 0, wdy: -1, wdz: 0.15, headPitch: 0.15, flx: 0.25, flz: 0.3, frx: -0.25, frz: -0.35 }),
  },
  lungeSlash: {
    // A draw from the hip: crouched with the blade low and forward, then a cut across as the body passes.
    windup: make({ hipY: 0.7, lean: 0.35, twist: 0.6, wpx: 0.25, wpy: 0.15, wpz: 0.1, wdx: -0.3, wdy: 0.1, wdz: 1, headYaw: -0.2, flx: 0.22, flz: 0.45, frx: -0.22, frz: -0.45 }),
    strike: make({ hipY: 0.72, lean: 0.45, twist: -0.4, fwd: 0.35, wpx: -0.2, wpy: 0.38, wpz: 0.55, wdx: -0.95, wdy: 0.08, wdz: 0.3, headYaw: 0.1, flx: 0.2, flz: 0.6, frx: -0.2, frz: -0.55 }),
    follow: make({ hipY: 0.72, lean: 0.4, twist: -0.9, fwd: 0.4, wpx: -0.5, wpy: 0.35, wpz: 0.2, wdx: -0.85, wdy: 0.2, wdz: -0.5, headYaw: 0.6, flx: 0.2, flz: 0.6, frx: -0.2, frz: -0.55 }),
  },
  dashThrust: {
    windup: make({ hipY: 0.74, lean: 0.15, twist: -0.8, wpx: -0.26, wpy: 0.3, wpz: -0.3, wdx: 0.06, wdy: 0.05, wdz: 1, headYaw: 0.7, flx: 0.2, flz: 0.5, frx: -0.2, frz: -0.5 }),
    strike: make({ hipY: 0.66, lean: 0.65, twist: 0.2, fwd: 0.45, wpx: -0.03, wpy: 0.38, wpz: 0.72, wdx: 0.02, wdy: 0.03, wdz: 1, headYaw: -0.1, flx: 0.2, flz: 0.75, frx: -0.22, frz: -0.6 }),
    follow: make({ hipY: 0.68, lean: 0.6, twist: 0.2, fwd: 0.5, wpx: -0.03, wpy: 0.36, wpz: 0.7, wdx: 0.04, wdy: 0.02, wdz: 1, headYaw: -0.1, flx: 0.2, flz: 0.75, frx: -0.22, frz: -0.6 }),
  },
  counter: {
    // Held across the body like a guard, then a snap cut the instant the counter fires.
    windup: make({ hipY: 0.78, lean: 0, twist: 0.35, wpx: 0.15, wpy: 0.45, wpz: 0.3, wdx: -0.95, wdy: 0.25, wdz: 0.15, headYaw: 0, flx: 0.24, flz: 0.18, frx: -0.26, frz: -0.3 }),
    strike: make({ hipY: 0.78, lean: 0.3, twist: -0.5, wpx: -0.1, wpy: 0.4, wpz: 0.55, wdx: -0.6, wdy: 0.15, wdz: 0.8, headYaw: 0.2, ...WIDE }),
    follow: make({ hipY: 0.76, lean: 0.3, twist: -1.0, wpx: -0.48, wpy: 0.32, wpz: 0.25, wdx: -0.95, wdy: 0.1, wdz: -0.25, headYaw: 0.8, ...WIDE }),
  },
  shieldGuard: {
    windup: make({ hipY: 0.76, lean: 0.1, twist: 0.6, wpx: -0.3, wpy: 0.3, wpz: 0.0, wdx: -0.2, wdy: 0.6, wdz: -0.75, headYaw: -0.3, flx: 0.24, flz: 0.3, frx: -0.26, frz: -0.3 }),
    strike: make({ hipY: 0.76, lean: 0.4, twist: -0.3, fwd: 0.2, wpx: -0.05, wpy: 0.4, wpz: 0.62, wdx: 0.05, wdy: 0.1, wdz: 1, headYaw: 0, flx: 0.2, flz: 0.45, frx: -0.22, frz: -0.42 }),
    follow: make({ hipY: 0.76, lean: 0.4, twist: -0.3, fwd: 0.25, wpx: -0.05, wpy: 0.38, wpz: 0.6, wdx: 0.05, wdy: 0.05, wdz: 1, headYaw: 0, flx: 0.2, flz: 0.45, frx: -0.22, frz: -0.42 }),
  },
  airSlash: {
    windup: make({ hipY: 0.95, lean: -0.2, wpx: -0.1, wpy: 0.95, wpz: 0.0, wdx: 0.1, wdy: 0.5, wdz: -0.85, headPitch: -0.1, flx: 0.2, fly: 0.34, flz: 0.12, frx: -0.2, fry: 0.24, frz: -0.12 }),
    strike: make({ hipY: 0.95, lean: 0.4, wpx: 0, wpy: 0.45, wpz: 0.55, wdx: 0.05, wdy: -0.1, wdz: 1, headPitch: 0.15, flx: 0.2, fly: 0.34, flz: 0.12, frx: -0.2, fry: 0.24, frz: -0.12 }),
    follow: make({ hipY: 0.95, lean: 0.55, wpx: 0, wpy: 0.15, wpz: 0.5, wdx: 0, wdy: -0.8, wdz: 0.6, headPitch: 0.2, flx: 0.2, fly: 0.3, flz: 0.12, frx: -0.2, fry: 0.2, frz: -0.12 }),
  },
  airSpin: {
    windup: make({ hipY: 0.95, lean: 0.2, twist: -0.9, wpx: -0.42, wpy: 0.3, wpz: -0.05, wdx: -0.9, wdy: 0.05, wdz: -0.4, headYaw: 0.8, flx: 0.2, fly: 0.4, flz: 0.15, frx: -0.2, fry: 0.3, frz: -0.1 }),
    strike: make({ hipY: 0.95, lean: 0.15, bodyYaw: Math.PI, wpx: -0.45, wpy: 0.35, wpz: 0.28, wdx: -1, wdy: 0.05, wdz: 0.25, flx: 0.25, fly: 0.45, flz: 0.2, frx: -0.25, fry: 0.35, frz: -0.2 }),
    follow: make({ hipY: 0.95, lean: 0.2, bodyYaw: Math.PI * 2, wpx: -0.42, wpy: 0.32, wpz: 0.3, wdx: -1, wdy: 0.08, wdz: 0.3, flx: 0.2, fly: 0.34, flz: 0.12, frx: -0.2, fry: 0.24, frz: -0.12 }),
  },
  slam: {
    // A huge overhead that drives into the floor.
    windup: make({ hipY: 0.94, lean: -0.4, twist: -0.1, wpx: -0.05, wpy: 1.05, wpz: -0.1, wdx: 0.1, wdy: 0.35, wdz: -0.93, headPitch: -0.2, flx: 0.24, flz: 0.32, frx: -0.24, frz: -0.32 }),
    strike: make({ hipY: 0.64, lean: 0.7, wpx: 0, wpy: 0.2, wpz: 0.6, wdx: 0, wdy: -0.45, wdz: 0.9, headPitch: 0.25, flx: 0.3, flz: 0.4, frx: -0.3, frz: -0.38 }),
    follow: make({ hipY: 0.6, lean: 0.75, wpx: 0, wpy: 0.05, wpz: 0.6, wdx: 0, wdy: -0.7, wdz: 0.7, headPitch: 0.3, flx: 0.3, flz: 0.4, frx: -0.3, frz: -0.38 }),
  },
  sweep: {
    windup: make({ hipY: 0.66, lean: 0.35, twist: -1.1, wpx: -0.45, wpy: 0.12, wpz: -0.05, wdx: -0.85, wdy: -0.15, wdz: -0.5, headYaw: 0.9, flx: 0.3, flz: 0.35, frx: -0.3, frz: -0.35 }),
    strike: make({ hipY: 0.64, lean: 0.4, twist: 0.1, wpx: -0.1, wpy: 0.12, wpz: 0.55, wdx: 0.1, wdy: -0.25, wdz: 1, headYaw: 0, flx: 0.3, flz: 0.35, frx: -0.3, frz: -0.35 }),
    follow: make({ hipY: 0.64, lean: 0.4, twist: 1.0, wpx: 0.3, wpy: 0.15, wpz: 0.3, wdx: 0.95, wdy: -0.15, wdz: -0.2, headYaw: -0.8, flx: 0.3, flz: 0.35, frx: -0.3, frz: -0.35 }),
  },
  uppercut: {
    windup: make({ hipY: 0.6, lean: 0.45, twist: -0.6, wpx: -0.25, wpy: 0.0, wpz: 0.1, wdx: -0.1, wdy: -0.3, wdz: 0.95, headPitch: 0.1, headYaw: 0.4, flx: 0.28, flz: 0.35, frx: -0.28, frz: -0.35 }),
    strike: make({ hipY: 0.98, lean: -0.1, twist: 0.2, fwd: 0.2, wpx: -0.05, wpy: 0.85, wpz: 0.45, wdx: 0.05, wdy: 0.9, wdz: 0.4, headPitch: -0.25, headYaw: 0, flx: 0.2, flz: 0.3, frx: -0.2, fry: 0.15, frz: -0.3 }),
    follow: make({ hipY: 0.98, lean: -0.2, twist: 0.2, fwd: 0.2, wpx: 0, wpy: 1.0, wpz: 0.25, wdx: 0.05, wdy: 0.95, wdz: -0.2, headPitch: -0.3, headYaw: 0 }),
  },
  backflip: {
    windup: make({ hipY: 0.62, lean: 0.25, wpx: -0.25, wpy: 0.2, wpz: 0.3, wdx: 0.4, wdy: 0.6, wdz: 0.6, flx: 0.24, flz: 0.1, frx: -0.24, frz: -0.1 }),
    strike: make({ hipY: 1.05, bodyPitch: -1.2, lean: -0.2, wpx: -0.3, wpy: 0.3, wpz: 0.1, wdx: 0.4, wdy: 0.7, wdz: 0.5, headPitch: 0.2, flx: 0.18, fly: 0.7, flz: 0.55, frx: -0.18, fry: 0.95, frz: 0.7 }),
    follow: make({ hipY: 0.8, bodyPitch: -0.3, lean: 0.2, wpx: -0.25, wpy: 0.2, wpz: 0.3, wdx: 0.4, wdy: 0.6, wdz: 0.6, flx: 0.24, flz: 0.1, frx: -0.24, frz: -0.25 }),
  },
  flurry: {
    // The per-hit whip through the active frames comes from attackPose.
    windup: make({ hipY: 0.74, lean: 0.3, twist: -0.6, wpx: -0.3, wpy: 0.3, wpz: 0.2, wdx: -0.4, wdy: 0.3, wdz: 0.85, headYaw: 0.4, ...WIDE }),
    strike: make({ hipY: 0.74, lean: 0.45, twist: 0, fwd: 0.2, wpx: -0.08, wpy: 0.36, wpz: 0.55, wdx: 0.1, wdy: 0.1, wdz: 1, headYaw: 0, ...WIDE }),
    follow: make({ hipY: 0.74, lean: 0.45, twist: 0.5, fwd: 0.25, wpx: 0.1, wpy: 0.32, wpz: 0.45, wdx: 0.7, wdy: 0.1, wdz: 0.7, headYaw: -0.3, ...WIDE }),
  },
  punch: {
    windup: make({ hipY: 0.8, lean: 0.1, twist: -0.55, wpx: -0.22, wpy: 0.36, wpz: 0.08, wdx: 0, wdy: 0.3, wdz: 0.95, headYaw: 0.4, flx: 0.22, flz: 0.32, frx: -0.24, frz: -0.3 }),
    strike: make({ hipY: 0.78, lean: 0.3, twist: 0.45, fwd: 0.12, wpx: -0.02, wpy: 0.44, wpz: 0.7, wdx: 0, wdy: 0.15, wdz: 1, headYaw: -0.2, flx: 0.22, flz: 0.4, frx: -0.24, frz: -0.32 }),
    follow: make({ hipY: 0.78, lean: 0.3, twist: 0.45, fwd: 0.12, wpx: -0.04, wpy: 0.42, wpz: 0.66, wdx: 0, wdy: 0.2, wdz: 1, headYaw: -0.2, flx: 0.22, flz: 0.4, frx: -0.24, frz: -0.32 }),
  },
  palm: {
    windup: make({ hipY: 0.74, lean: -0.05, twist: -0.75, wpx: -0.3, wpy: 0.28, wpz: -0.05, wdx: 0, wdy: 0.95, wdz: 0.2, headYaw: 0.5, flx: 0.28, flz: 0.42, frx: -0.28, frz: -0.38 }),
    strike: make({ hipY: 0.7, lean: 0.45, twist: 0.35, fwd: 0.25, wpx: 0, wpy: 0.36, wpz: 0.75, wdx: 0, wdy: 0.95, wdz: 0.25, headYaw: -0.1, flx: 0.28, flz: 0.55, frx: -0.28, frz: -0.42 }),
    follow: make({ hipY: 0.7, lean: 0.45, twist: 0.35, fwd: 0.28, wpx: 0, wpy: 0.34, wpz: 0.72, wdx: 0, wdy: 0.95, wdz: 0.25, headYaw: -0.1, flx: 0.28, flz: 0.55, frx: -0.28, frz: -0.42 }),
  },
  kick: {
    windup: make({ hipY: 0.84, lean: -0.1, twist: -0.2, frx: -0.18, fry: 0.4, frz: 0.05, flx: 0.2, flz: 0.1 }),
    strike: make({ hipY: 0.84, lean: -0.3, twist: 0.1, fwd: 0.1, frx: -0.1, fry: 0.55, frz: 0.8, flx: 0.2, flz: -0.05, headPitch: 0.1 }),
    follow: make({ hipY: 0.84, lean: -0.3, twist: 0.1, fwd: 0.1, frx: -0.1, fry: 0.5, frz: 0.75, flx: 0.2, flz: -0.05, headPitch: 0.1 }),
  },
  roundhouse: {
    windup: make({ hipY: 0.84, lean: 0.1, twist: -0.6, frx: -0.25, fry: 0.2, frz: -0.2, headYaw: 0.6 }),
    strike: make({ hipY: 0.88, lean: -0.25, bodyYaw: Math.PI, frx: -0.65, fry: 0.7, frz: 0.25, flx: 0.15, flz: 0.05, headYaw: 0 }),
    follow: make({ hipY: 0.86, lean: -0.1, bodyYaw: Math.PI * 2, frx: -0.3, fry: 0.2, frz: -0.2, flx: 0.2, flz: 0.2 }),
  },
  shieldBash: {
    // Leading shoulder first: the body drives forward with the weapon held back.
    windup: make({ hipY: 0.76, lean: 0.15, twist: 0.7, wpx: -0.38, wpy: 0.3, wpz: -0.12, wdx: -0.2, wdy: 0.7, wdz: -0.6, headYaw: -0.4, flx: 0.24, flz: 0.42, frx: -0.24, frz: -0.38 }),
    strike: make({ hipY: 0.74, lean: 0.55, twist: 0.35, fwd: 0.42, wpx: -0.36, wpy: 0.32, wpz: -0.05, wdx: -0.2, wdy: 0.7, wdz: -0.6, headYaw: -0.2, flx: 0.24, flz: 0.62, frx: -0.24, frz: -0.45 }),
    follow: make({ hipY: 0.74, lean: 0.5, twist: 0.3, fwd: 0.45, wpx: -0.36, wpy: 0.32, wpz: -0.05, wdx: -0.2, wdy: 0.7, wdz: -0.6, headYaw: -0.2, flx: 0.24, flz: 0.62, frx: -0.24, frz: -0.45 }),
  },
  reap: {
    // A long scything arc from the far left, across the front, to behind the right shoulder.
    windup: make({ hipY: 0.78, lean: 0.1, twist: 1.1, wpx: 0.35, wpy: 0.4, wpz: 0.05, wdx: 0.9, wdy: 0.15, wdz: -0.4, wroll: -0.3, headYaw: -0.8, ...WIDE }),
    strike: make({ hipY: 0.76, lean: 0.3, twist: -0.2, wpx: -0.05, wpy: 0.38, wpz: 0.5, wdx: -0.2, wdy: 0.05, wdz: 1, headYaw: 0.2, ...WIDE }),
    follow: make({ hipY: 0.74, lean: 0.3, twist: -1.2, wpx: -0.5, wpy: 0.32, wpz: 0.1, wdx: -1, wdy: 0.08, wdz: -0.3, wroll: 0.3, headYaw: 0.9, ...WIDE }),
  },
  hook: {
    // Reach out past the target, then haul the blade back toward the body.
    windup: make({ hipY: 0.82, lean: 0.05, twist: -0.4, wpx: -0.2, wpy: 0.4, wpz: 0.15, wdx: 0.1, wdy: 0.35, wdz: 0.95, headYaw: 0.3, flx: 0.2, flz: 0.35, frx: -0.22, frz: -0.35 }),
    strike: make({ hipY: 0.78, lean: 0.45, twist: 0.1, fwd: 0.2, wpx: -0.05, wpy: 0.42, wpz: 0.7, wdx: 0.05, wdy: 0.2, wdz: 1, headYaw: 0, flx: 0.2, flz: 0.5, frx: -0.22, frz: -0.4 }),
    follow: make({ hipY: 0.8, lean: -0.1, twist: 0.3, fwd: -0.1, wpx: -0.1, wpy: 0.4, wpz: 0.2, wdx: 0.3, wdy: 0.35, wdz: 0.85, headYaw: -0.2, flx: 0.2, flz: 0.2, frx: -0.22, frz: -0.45 }),
  },
};

for (const k of Object.values(ATTACKS)) {
  const settle = new Float32Array(POSE_SIZE);
  for (let i = 0; i < POSE_SIZE; i++) settle[i] = k.follow[i]! + (POSES.stance[i]! - k.follow[i]!) * 0.35;
  k.settle = settle;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInQuad = (t: number) => t * t;
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
type Ease = (t: number) => number;

export function lerpPose(out: Pose, a: Pose, b: Pose, t: number): Pose {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i]! + (b[i]! - a[i]!) * t;
  return out;
}

/** Samples keyframes [frame, pose, ease into this key] at a fractional frame. */
function sampleKeys(out: Pose, keys: [number, Pose, Ease][], frame: number): Pose {
  if (frame <= keys[0]![0]) return out.set(keys[0]![1]), out;
  for (let i = 1; i < keys.length; i++) {
    const [f1, p1, ease] = keys[i]!;
    const [f0, p0] = keys[i - 1]!;
    if (frame <= f1) {
      const t = f1 === f0 ? 1 : (frame - f0) / (f1 - f0);
      return lerpPose(out, p0, p1, ease(Math.min(1, Math.max(0, t))));
    }
  }
  out.set(keys[keys.length - 1]![1]);
  return out;
}

function attackPose(out: Pose, m: MoveData, frame: number): Pose {
  const k = ATTACKS[m.anim];
  const s = m.startup;
  const a = m.active;
  const r = m.recovery;
  // Over-pulled wind-up held for the last ~quarter of startup: the hold is what the eye catches.
  const hold = Math.max(2, Math.round(s * 0.28));
  sampleKeys(
    out,
    [
      [0, POSES.stance, easeOutCubic],
      [Math.max(1, s - hold), k.windup, easeOutCubic],
      [s, k.windup, easeOutCubic],
      [s + a * 0.5, k.strike, easeInQuad],
      [s + a, k.follow, easeOutQuad],
      [s + a + r * 0.5, k.settle!, easeOutQuad],
      [s + a + r, POSES.stance, easeInOut],
    ],
    frame,
  );
  if (m.hits > 1 && frame >= s && frame < s + a) {
    // Multi-hit moves whip back and forth once per hit through the active frames.
    const w = Math.sin(((frame - s) / a) * m.hits * Math.PI);
    out[P.twist]! += w * 0.45;
    out[P.wpx]! += w * 0.15;
  }
  return out;
}

export interface FighterView {
  weapon: WeaponId;
  state: FighterState;
  /** Fractional frame within the current state. */
  frame: number;
  move: MoveId | null;
  /** Movement intent in the fighter's frame (x right, y forward). */
  moveX: number;
  moveY: number;
  /** Dodge direction in the fighter's frame. */
  dodgeX: number;
  dodgeY: number;
  rollDir: number;
  y: number;
  /** Seconds, for idle motion. */
  time: number;
  /** Stride phase in radians, advanced by distance walked. */
  walkPhase: number;
  /** Overrides used by cinematics. */
  special?: 'landing' | 'victory' | 'kneel' | null;
  pose?: Pose | null;
}

/** Computes the target pose for a fighter's current sim state. */
export function computePose(v: FighterView, out: Pose): Pose {
  if (v.pose) {
    out.set(v.pose);
    return out;
  }
  if (v.special) {
    out.set(POSES[v.special]);
    return out;
  }
  const f = v.frame;
  switch (v.state) {
    case 'attack': {
      const m = v.move ? WEAPONS[v.weapon].moves[v.move] : null;
      if (m) attackPose(out, m, f);
      else out.set(POSES.stance);
      break;
    }
    case 'block':
    case 'blockRelease':
      out.set(POSES.guard);
      if (v.state === 'blockRelease') lerpPose(out, POSES.guard, POSES.stance, Math.min(1, f / 4));
      break;
    case 'blockstun':
      lerpPose(out, POSES.guard, POSES.parryWhiff, Math.max(0, 0.25 - f * 0.03));
      out[P.lean]! -= 0.12 * Math.max(0, 1 - f / 8);
      out[P.fwd]! -= 0.08 * Math.max(0, 1 - f / 8);
      break;
    case 'parry':
      lerpPose(out, POSES.guard, POSES.parry, easeOutCubic(Math.min(1, f / 3)));
      break;
    case 'parryWhiff':
      out.set(POSES.parryWhiff);
      break;
    case 'hitstun':
      sampleKeys(out, [[0, POSES.stance, easeOutCubic], [3, POSES.hit, easeOutCubic], [14, POSES.stance, easeInOut]], f);
      break;
    case 'stagger':
      sampleKeys(out, [[0, POSES.stance, easeOutCubic], [4, POSES.stagger, easeOutCubic], [20, POSES.stance, easeInOut]], f);
      break;
    case 'guardbreak':
      sampleKeys(out, [[0, POSES.hit, easeOutCubic], [6, POSES.guardbreak, easeOutCubic], [40, POSES.guardbreak, easeInOut], [45, POSES.stance, easeInOut]], f);
      out[P.roll]! += Math.sin(f * 0.35) * 0.08;
      break;
    case 'dodge': {
      out.set(POSES.dodge);
      // Lean and roll into the dodge direction.
      out[P.lean]! = 0.15 + v.dodgeY * 0.25;
      out[P.roll]! = -v.dodgeX * 0.35;
      out[P.side]! = -v.dodgeX * 0.05;
      break;
    }
    case 'jump':
      out.set(POSES.jump);
      break;
    case 'knockdown':
      sampleKeys(out, [[0, POSES.hit, easeOutCubic], [10, POSES.down, easeOutQuad]], f);
      break;
    case 'getup':
      sampleKeys(out, [[0, POSES.down, easeOutCubic], [GETUP_FRAMES * 0.45, POSES.kneel, easeOutCubic], [GETUP_FRAMES, POSES.stance, easeInOut]], f);
      if (v.rollDir) out[P.roll]! += v.rollDir * Math.sin((Math.min(f, 14) / 14) * Math.PI) * 0.6;
      break;
    case 'ko':
      sampleKeys(out, [[0, POSES.hit, easeOutCubic], [14, POSES.down, easeOutQuad]], f);
      break;
    default:
      out.set(POSES.stance);
  }

  if (v.state === 'idle' || v.state === 'block' || v.state === 'blockRelease') addWalk(out, v);
  if (v.state === 'idle') {
    // Breathing.
    out[P.lean]! += Math.sin(v.time * 2.2) * 0.015;
    out[P.wpy]! += Math.sin(v.time * 2.2 + 0.6) * 0.012;
  }
  return out;
}

function addWalk(out: Pose, v: FighterView): void {
  const amount = Math.min(1, Math.hypot(v.moveX, v.moveY));
  if (amount < 0.05) return;
  const s = Math.sin(v.walkPhase);
  const c = Math.cos(v.walkPhase);
  const dx = v.moveX / (amount || 1);
  const dy = v.moveY / (amount || 1);
  const stride = 0.24 * amount;
  // Feet swing along the movement direction (x right = -x in root space for the fighter).
  out[P.flx]! += -dx * s * stride;
  out[P.flz]! += dy * s * stride;
  out[P.frx]! -= -dx * s * stride;
  out[P.frz]! -= dy * s * stride;
  out[P.fly]! += Math.max(0, c) * 0.13 * amount;
  out[P.fry]! += Math.max(0, -c) * 0.13 * amount;
  out[P.hipY]! -= Math.abs(Math.sin(v.walkPhase * 2)) * 0.03 * amount;
  out[P.lean]! += dy * 0.06 * amount;
}

/** Shortest-path angle interpolation for the body yaw channel. */
export function smoothPose(current: Pose, target: Pose, t: number): void {
  for (let i = 0; i < POSE_SIZE; i++) {
    if (i === P.bodyYaw) {
      let d = target[i]! - current[i]!;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      current[i] = current[i]! + d * t;
    } else {
      current[i] = current[i]! + (target[i]! - current[i]!) * t;
    }
  }
}
