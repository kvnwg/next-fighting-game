/**
 * The voxel fighters (characters/<name>/model.js) fitted to the game's rig: which model each
 * character wears, which of its bones are carried weapons, and how each weapon sits in the hand.
 * The rig's proportions come from the model's own bone pivots, so every fighter keeps its shape.
 */
import * as THREE from 'three';
import type { CharacterId } from '../../../shared/characters';
import type { Vec3, VoxelBone, VoxelModel } from '../../../../characters/voxel-model';
import { buildAssassin, buildAssassinDaggers } from '../../../../characters/assassin/model.js';
import { buildDuelist, buildDuelistRapier } from '../../../../characters/duelist/model.js';
import { buildKnight, buildKnightArms } from '../../../../characters/knight/model.js';
import { buildLancer, buildLancerSpear } from '../../../../characters/lancer/model.js';
import { buildMonk } from '../../../../characters/monk/model.js';
import { buildRonin, buildRoninKatana } from '../../../../characters/ronin/model.js';
import { buildWarden, buildWardenHammer } from '../../../../characters/warden/model.js';
import { buildWraith, buildWraithScythe } from '../../../../characters/wraith/model.js';
import { VOXEL, meshBones } from './mesh';

/**
 * A held item cut from a voxel model. The game's weapon frame has the grip at the origin, the
 * weapon pointing along +Z and its cutting edge along +Y; `axis` and `edge` say which voxel
 * directions become those.
 */
export interface PropSpec {
  build: () => VoxelModel;
  /** Bones of the prop model to use (default: all). */
  bones?: string[];
  /** Grip point, in the prop model's voxel coordinates. */
  grip: Vec3;
  axis: Vec3;
  edge: Vec3;
  /** Size relative to the model, so each weapon reaches as far as its move ranges expect. */
  scale: number;
  /** Trail anchors in the prop's voxel coordinates. */
  base: Vec3;
  tip: Vec3;
  /** Prop bones shown only during heavy swings and specials (the spear's lightning). */
  charged?: string[];
}

export interface VoxelFighterSpec {
  build: () => VoxelModel;
  /** Body bones not drawn on the body: carried weapons, which are drawn in the hands instead. */
  hide?: string[];
  main: PropSpec;
  off?: PropSpec;
}

const UP: Vec3 = [0, 1, 0];
const DOWN: Vec3 = [0, -1, 0];

/** Fists: the monk's own hands, knuckles forward, carried as his weapons. */
const fist = (side: 'L' | 'R'): PropSpec => {
  const s = side === 'L' ? 1 : -1;
  return {
    build: buildMonk,
    bones: [`hand${side}`],
    grip: [s * 32.5, 57.5, 0],
    axis: [s, 0, 0],
    edge: UP,
    scale: 1,
    base: [s * 31, 57.5, 0],
    tip: [s * 35, 57.5, 0],
  };
};

export const VOXEL_FIGHTERS: Record<CharacterId, VoxelFighterSpec> = {
  ronin: {
    build: buildRonin,
    hide: ['katana'],
    main: { build: buildRoninKatana, grip: [0.5, 6, 0.5], axis: UP, edge: [0, 0, 1], scale: 1.5, base: [0.5, 11, 0.5], tip: [0.5, 41, 0.5] },
  },
  juggernaut: {
    build: buildWarden,
    // held near the pommel like the animated hammer (head 1.07 m out, 0.36 m of haft behind the hand), so a
    // shoulder carry doesn't run the haft down through his body
    main: { build: buildWardenHammer, grip: [0, 66.5, 0], axis: DOWN, edge: [0, 0, 1], scale: 0.82, base: [0, 16, 0], tip: [0, 0, 0] },
  },
  duelist: {
    build: buildDuelist,
    hide: ['rapier'],
    main: { build: buildDuelistRapier, grip: [0.5, 5.5, 0.5], axis: UP, edge: [1, 0, 0], scale: 1.1, base: [0.5, 9, 0.5], tip: [0.5, 53, 0.5] },
  },
  lancer: {
    build: buildLancer,
    main: { build: buildLancerSpear, grip: [0, 38, 0], axis: UP, edge: [0, 0, 1], scale: 1.08, base: [0, 92, 0], tip: [0, 117, 0], charged: ['lightning'] },
  },
  shade: {
    build: buildAssassin,
    hide: ['daggerThigh', 'daggerBack'],
    main: { build: buildAssassinDaggers, bones: ['daggerR'], grip: [-5.5, 5, 0], axis: UP, edge: [1, 0, 0], scale: 1.3, base: [-5.5, 8, 0], tip: [-5.5, 20, 0] },
    off: { build: buildAssassinDaggers, bones: ['daggerL'], grip: [5.5, 5, 0], axis: UP, edge: [1, 0, 0], scale: 1.3, base: [5.5, 8, 0], tip: [5.5, 20, 0] },
  },
  reaper: {
    build: buildWraith,
    main: { build: buildWraithScythe, grip: [0, 66, 0], axis: DOWN, edge: [0, 0, 1], scale: 0.7, base: [-4, 17, 0], tip: [-64, 3, 0] },
  },
  monk: {
    build: buildMonk,
    hide: ['handL', 'handR'],
    main: fist('R'),
    off: fist('L'),
  },
  paladin: {
    build: buildKnight,
    main: { build: buildKnightArms, bones: ['greatsword'], grip: [-16.5, 10, 0.5], axis: UP, edge: [1, 0, 0], scale: 0.9, base: [-16.5, 14, 0.5], tip: [-16.5, 63, 0.5] },
    // the shield's handle at its middle, its face forward (+Z) and its top up
    off: { build: buildKnightArms, bones: ['shield'], grip: [9.5, 15.3, 0], axis: [0, 0, 1], edge: UP, scale: 1, base: [9.5, 2, 0], tip: [9.5, 29, 0] },
  },
};

// ------------------------------------------------------------------ models

const cache = new Map<() => VoxelModel, { model: VoxelModel; bones: Map<string, VoxelBone>; geoms: Map<string, THREE.BufferGeometry> }>();

/** A model with its bones meshed, built once per model and shared by every fighter wearing it. */
export function voxelModel(build: () => VoxelModel) {
  let c = cache.get(build);
  if (!c) {
    const model = build();
    c = { model, bones: new Map(model.bones.map((b) => [b.name, b])), geoms: meshBones(model) };
    cache.set(build, c);
  }
  return c;
}

const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

/** Voxel coordinates of a prop to the game's weapon frame (grip at the origin, along +Z, edge +Y). */
export function propFrame(p: PropSpec): (v: Vec3) => THREE.Vector3 {
  const z = v3(p.axis).normalize();
  const y = v3(p.edge).addScaledVector(z, -v3(p.edge).dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const g = v3(p.grip);
  const k = VOXEL * p.scale;
  return (v) => {
    const d = v3(v).sub(g);
    return new THREE.Vector3(d.dot(x) * k, d.dot(y) * k, d.dot(z) * k);
  };
}

/** The rotation taking voxel directions into the weapon frame (see propFrame). */
export function propRotation(p: PropSpec): THREE.Quaternion {
  const z = v3(p.axis).normalize();
  const y = v3(p.edge).addScaledVector(z, -v3(p.edge).dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  // rows x, y, z: the matrix maps a voxel direction to weapon coordinates
  const m = new THREE.Matrix4().set(x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

// ------------------------------------------------------------------ rig proportions

/** Where the hand closes, a few voxels past the wrist pivot. */
const GRIP_OFFSET = 3;
/** A shin without a foot bone ends at an ankle this many voxels off the ground. */
const BARE_ANKLE = 3.5;

export interface RigDims {
  hipsY: number;
  torso: THREE.Vector3;
  head: THREE.Vector3;
  shoulderR: THREE.Vector3;
  shoulderL: THREE.Vector3;
  upperArm: number;
  forearm: number;
  hipR: THREE.Vector3;
  hipL: THREE.Vector3;
  thigh: number;
  shin: number;
  ankle: number;
  hasLegs: boolean;
  hasFeet: boolean;
  /** Standing height, headwear included, carried weapons not. */
  height: number;
  /** the head itself (no hat brims) as an ellipsoid, torso-relative: weapons and hands are kept out of it */
  headCenter: THREE.Vector3;
  headHalf: THREE.Vector3;
}

/** The rig's joints and limb lengths, from the model's bone pivots (all in meters). */
export function rigDims(model: VoxelModel): RigDims {
  const bones = new Map(model.bones.map((b) => [b.name, b]));
  const at = (name: string) => v3(bones.get(name)!.pivot).multiplyScalar(VOXEL);
  const pelvis = at('pelvis');
  const torso = at('torso');
  const head = at('head');
  const shoulder = at('upperArmR');
  const elbow = at('forearmR');
  const wrist = at('handR');
  const hasLegs = bones.has('thighR');
  const hasFeet = bones.has('footR');
  let thigh = 0.43;
  let shin = 0.42;
  let ankle = 0.05;
  let hipR = new THREE.Vector3(-0.12, -0.02, 0);
  if (hasLegs) {
    const hip = at('thighR');
    const knee = at('shinR');
    const foot = hasFeet ? at('footR') : new THREE.Vector3(knee.x, BARE_ANKLE * VOXEL, knee.z);
    thigh = hip.distanceTo(knee);
    shin = knee.distanceTo(foot);
    ankle = foot.y;
    hipR = hip.clone().sub(pelvis);
  }
  // the top of the head and whatever it wears (hat, hood, helm crest), not weapons slung on the back
  const onHead = (name: string): boolean => {
    for (let b = bones.get(name); b; b = b.parent ? bones.get(b.parent) : undefined) if (b.name === 'head') return true;
    return false;
  };
  let top = 0;
  for (const v of model.voxels) if (onHead(v.bone) || v.bone === 'torso') top = Math.max(top, v.y + 1);
  const shoulderR = shoulder.clone().sub(torso);
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const v of model.voxels) {
    if (v.bone !== 'head') continue;
    lo.min(_hv.set(v.x, v.y, v.z));
    hi.max(_hv.set(v.x + 1, v.y + 1, v.z + 1));
  }
  const headSize = hi.clone().sub(lo).multiplyScalar(VOXEL);
  const headCenter = lo.clone().add(hi).multiplyScalar(VOXEL / 2).sub(torso);
  return {
    hipsY: pelvis.y,
    torso: torso.clone().sub(pelvis),
    head: head.clone().sub(torso),
    shoulderR,
    shoulderL: shoulderR.clone().setX(-shoulderR.x),
    upperArm: shoulder.distanceTo(elbow),
    forearm: elbow.distanceTo(wrist) + GRIP_OFFSET * VOXEL,
    hipR,
    hipL: hipR.clone().setX(-hipR.x),
    thigh,
    shin,
    ankle,
    hasLegs,
    hasFeet,
    height: top * VOXEL,
    headCenter,
    headHalf: headSize.multiplyScalar(0.5),
  };
}
const _hv = new THREE.Vector3();

/** Where each body bone hangs on the rig; bones not listed ride on their nearest listed ancestor. */
export type RigSlot = 'hips' | 'torso' | 'head' | 'armR.upper' | 'armR.lower' | 'armR.end' | 'armL.upper' | 'armL.lower' | 'armL.end' | 'legR.upper' | 'legR.lower' | 'legR.end' | 'legL.upper' | 'legL.lower' | 'legL.end';

export const BONE_SLOTS: Record<string, RigSlot> = {
  pelvis: 'hips',
  torso: 'torso',
  head: 'head',
  upperArmR: 'armR.upper',
  forearmR: 'armR.lower',
  handR: 'armR.end',
  upperArmL: 'armL.upper',
  forearmL: 'armL.lower',
  handL: 'armL.end',
  thighR: 'legR.upper',
  shinR: 'legR.lower',
  footR: 'legR.end',
  thighL: 'legL.upper',
  shinL: 'legL.lower',
  footL: 'legL.end',
};

/** The bone whose pivot a slot's group sits on. */
export const SLOT_BONE = Object.fromEntries(Object.entries(BONE_SLOTS).map(([b, s]) => [s, b])) as Record<RigSlot, string>;

/** The direction a limb bone runs in the rest pose (to its child joint), which the rig turns to -Y. */
export function restDirection(model: VoxelModel, bone: string): THREE.Vector3 | null {
  const bones = new Map(model.bones.map((b) => [b.name, b]));
  const next: Record<string, string> = {
    upperArmR: 'forearmR',
    forearmR: 'handR',
    upperArmL: 'forearmL',
    forearmL: 'handL',
    thighR: 'shinR',
    thighL: 'shinL',
    shinR: 'footR',
    shinL: 'footL',
  };
  const b = bones.get(bone);
  if (!b) return null;
  if (bone.startsWith('hand')) return new THREE.Vector3(bone.endsWith('R') ? -1 : 1, 0, 0);
  const n = next[bone];
  if (!n) return null;
  const child = bones.get(n);
  // shins without a foot bone run straight down to the ground
  if (!child) return bone.startsWith('shin') ? new THREE.Vector3(0, -1, 0) : null;
  return v3(child.pivot).sub(v3(b.pivot)).normalize();
}
