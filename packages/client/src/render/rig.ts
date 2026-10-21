import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { WeaponId } from '@nfg/shared';
import { makeFighterMaterial, makeFighterUniforms, type FighterUniforms } from './materials.ts';
import { P, type Pose } from './poses.ts';

export interface FighterLook {
  shirt: number;
  pants: number;
  skin: number;
  accent: number;
  hair: number;
}

export const LOOKS: FighterLook[] = [
  { shirt: 0xf2cf2a, pants: 0xf1eee6, skin: 0xe2b48a, accent: 0x23304d, hair: 0x2a1b12 },
  { shirt: 0xd8478d, pants: 0x8a62d1, skin: 0xb98361, accent: 0xf3eef8, hair: 0x4a2f6e },
];

interface WeaponSpec {
  /** Left-hand grip, in meters along the shaft from the right hand. */
  gripLeft: number;
  bladeBase: number;
  bladeTip: number;
}

// The original placeholder weapons; voxel fighters (voxel/rig.ts) carry their own.
export const WEAPON_SPECS: Record<string, WeaponSpec> = {
  naginata: { gripLeft: 0.42, bladeBase: 1.15, bladeTip: 1.72 },
  bo: { gripLeft: 0.42, bladeBase: 0.45, bladeTip: 0.95 },
  katana: { gripLeft: -0.13, bladeBase: 0.16, bladeTip: 0.98 },
};

const UP = new Vector3(0, 1, 0);
const SHOULDER_Y = 0.5;
const SHOULDER_X = 0.24;
const UPPER_ARM = 0.3;
const FOREARM = 0.3;
const THIGH = 0.45;
const SHIN = 0.45;
const HIP_X = 0.11;

const geoCache = new Map<string, BufferGeometry>();
function cached<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

function limb(radius: number, length: number, mat: Material): Mesh {
  // Built along +y with its base at the origin, so it can be placed by endpoints.
  const geo = cached(`limb-${radius}-${length}`, () => {
    const g = new CapsuleGeometry(radius, length - radius * 2, 3, 8);
    g.translate(0, length / 2, 0);
    return g;
  });
  return new Mesh(geo, mat);
}

function box(w: number, h: number, d: number, mat: Material): Mesh {
  return new Mesh(cached(`box-${w}-${h}-${d}`, () => new BoxGeometry(w, h, d)), mat);
}

function buildWeapon(id: string, mats: { wood: Material; steel: Material; wrap: Material; trim: Material }): Group {
  const g = new Group();
  const cyl = (r: number, y0: number, y1: number, m: Material) => {
    const mesh = new Mesh(cached(`cyl-${r}-${(y1 - y0).toFixed(3)}`, () => new CylinderGeometry(r, r, y1 - y0, 8)), m);
    mesh.position.y = (y0 + y1) / 2;
    g.add(mesh);
    return mesh;
  };
  if (id === 'naginata') {
    cyl(0.024, -0.75, 1.12, mats.wood);
    cyl(0.032, -0.78, -0.7, mats.trim);
    cyl(0.05, 1.1, 1.14, mats.trim);
    const blade = box(0.012, 0.6, 0.07, mats.steel);
    blade.position.set(0, 1.43, 0.012);
    blade.rotation.x = 0.08;
    g.add(blade);
    const tip = box(0.011, 0.14, 0.05, mats.steel);
    tip.position.set(0, 1.75, 0.045);
    tip.rotation.x = 0.35;
    g.add(tip);
  } else if (id === 'bo') {
    cyl(0.028, -0.95, 0.95, mats.wood);
    cyl(0.033, 0.82, 0.97, mats.trim);
    cyl(0.033, -0.97, -0.82, mats.trim);
    cyl(0.031, -0.05, 0.05, mats.wrap);
  } else {
    cyl(0.019, -0.14, 0.12, mats.wrap);
    cyl(0.045, 0.12, 0.15, mats.trim);
    const blade = box(0.009, 0.82, 0.032, mats.steel);
    blade.position.set(0, 0.56, 0.006);
    blade.rotation.x = 0.03;
    g.add(blade);
  }
  return g;
}

const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();
const pole = new Vector3();
const tMid = new Vector3();
const tEnd = new Vector3();
const tTarget = new Vector3();
const tHip = new Vector3();
const q1 = new Quaternion();
const q2 = new Quaternion();

/** Two-bone IK: from joint `a` toward `target`, bending toward `poleDir`. Writes the elbow/knee into `mid`, end into `end`. */
function solveTwoBone(a: Vector3, target: Vector3, la: number, lb: number, poleDir: Vector3, mid: Vector3, end: Vector3): void {
  const dir = v1.subVectors(target, a);
  let d = dir.length();
  if (d < 1e-4) {
    dir.set(0, -1, 0);
    d = 1e-4;
  }
  dir.divideScalar(d);
  // Allow a little cartoon stretch instead of letting hands detach from the grip.
  const reach = la + lb;
  const stretch = d > reach ? Math.min(d / reach, 1.18) : 1;
  const A = la * stretch;
  const B = lb * stretch;
  const dd = Math.min(d, (A + B) * 0.9999);
  const cosA = Math.min(1, Math.max(-1, (A * A + dd * dd - B * B) / (2 * A * dd)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const perp = pole.copy(poleDir).addScaledVector(dir, -poleDir.dot(dir));
  if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
  perp.normalize();
  mid.copy(a).addScaledVector(dir, A * cosA).addScaledVector(perp, A * sinA);
  end.copy(a).addScaledVector(dir, dd);
}

function placeSegment(mesh: Mesh, from: Vector3, to: Vector3, nominal: number): void {
  const dir = v3.subVectors(to, from);
  const len = dir.length();
  mesh.position.copy(from);
  if (len > 1e-5) mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
  mesh.scale.set(1, len / nominal, 1);
}

export interface RigOptions {
  /** Ghost rigs (afterimages) use one flat material for everything. */
  ghost?: Material;
}

export class FighterRig {
  readonly root = new Group();
  readonly uniforms: FighterUniforms;
  readonly bladeBase = new Object3D();
  readonly bladeTip = new Object3D();
  private readonly body = new Group();
  private readonly torso = new Group();
  private readonly head = new Group();
  private readonly weaponPivot = new Group();
  private readonly arms: { shoulder: Vector3; upper: Mesh; fore: Mesh; hand: Mesh; pole: Vector3 }[] = [];
  private readonly legs: { hipLocal: Vector3; thigh: Mesh; shin: Mesh; foot: Mesh; pole: Vector3 }[] = [];
  private readonly spec: WeaponSpec;

  constructor(
    readonly weapon: WeaponId,
    look: FighterLook,
    opts: RigOptions = {},
  ) {
    this.uniforms = makeFighterUniforms();
    this.spec = WEAPON_SPECS[weapon] ?? WEAPON_SPECS.katana!;
    const m = (color: number, extra?: { roughness?: number; metalness?: number }) =>
      opts.ghost ?? makeFighterMaterial(color, this.uniforms, extra);
    const shirt = m(look.shirt);
    const pants = m(look.pants);
    const skin = m(look.skin);
    const accent = m(look.accent);
    const hair = m(look.hair);
    const dark = m(0x1b1b22);
    const wood = m(0x5a2f22, { roughness: 0.6 });
    const steel = m(0xdfe6ee, { roughness: 0.25, metalness: 0.85 });
    const wrap = m(0x24222e);
    const trim = m(0xb88a3e, { roughness: 0.4, metalness: 0.6 });

    this.root.add(this.body);
    const pelvis = box(0.34, 0.2, 0.22, pants);
    this.body.add(pelvis);
    this.torso.position.y = 0.08;
    this.torso.rotation.order = 'YXZ';
    this.body.add(this.torso);
    const chest = box(0.44, 0.5, 0.25, shirt);
    chest.position.y = 0.3;
    this.torso.add(chest);
    const belt = box(0.46, 0.07, 0.27, accent);
    belt.position.y = 0.06;
    this.torso.add(belt);

    this.head.position.y = 0.62;
    this.torso.add(this.head);
    const headMesh = box(0.27, 0.28, 0.27, skin);
    headMesh.position.y = 0.12;
    this.head.add(headMesh);
    // Deeper than the head so no face of it is coplanar with the head's (that z-fights).
    const hairMesh = box(0.29, 0.1, 0.3, hair);
    hairMesh.position.set(0, 0.25, -0.008);
    this.head.add(hairMesh);
    const band = box(0.285, 0.045, 0.285, accent);
    band.position.y = 0.19;
    this.head.add(band);
    for (const side of [-1, 1]) {
      const eye = box(0.035, 0.05, 0.02, dark);
      eye.position.set(side * 0.06, 0.13, 0.136);
      this.head.add(eye);
    }

    this.weaponPivot.add(buildWeapon(weapon, { wood, steel, wrap, trim }));
    this.bladeBase.position.y = this.spec.bladeBase;
    this.bladeTip.position.y = this.spec.bladeTip;
    this.weaponPivot.add(this.bladeBase, this.bladeTip);
    this.torso.add(this.weaponPivot);

    for (const side of [1, -1]) {
      const upper = limb(0.06, UPPER_ARM, shirt);
      const fore = limb(0.052, FOREARM, skin);
      const hand = new Mesh(cached('hand', () => new SphereGeometry(0.06, 8, 6)), skin);
      this.torso.add(upper, fore, hand);
      this.arms.push({
        shoulder: new Vector3(side * SHOULDER_X, SHOULDER_Y, 0),
        upper,
        fore,
        hand,
        pole: new Vector3(side * 0.7, -1, -0.6).normalize(),
      });
    }
    for (const side of [1, -1]) {
      const thigh = limb(0.08, THIGH, pants);
      const shin = limb(0.068, SHIN, pants);
      const foot = box(0.11, 0.07, 0.22, dark);
      this.root.add(thigh, shin, foot);
      this.legs.push({
        hipLocal: new Vector3(side * HIP_X, -0.06, 0),
        thigh,
        shin,
        foot,
        pole: new Vector3(side * 0.25, 0, 1).normalize(),
      });
    }
    this.root.traverse((o) => {
      if (o instanceof Mesh) o.frustumCulled = false;
    });
  }

  /** Positions every part from a pose vector. Root position and facing are set by the caller. */
  applyPose(p: Pose): void {
    this.body.position.set(p[P.side]!, p[P.hipY]!, p[P.fwd]!);
    this.body.rotation.set(p[P.bodyPitch]!, p[P.bodyYaw]!, p[P.roll]!, 'YXZ');
    this.torso.rotation.set(p[P.lean]!, p[P.twist]!, p[P.tilt]!);
    this.head.rotation.set(p[P.headPitch]!, p[P.headYaw]!, 0);

    this.weaponPivot.position.set(p[P.wpx]!, p[P.wpy]!, p[P.wpz]!);
    const wdir = v2.set(p[P.wdx]!, p[P.wdy]!, p[P.wdz]!);
    if (wdir.lengthSq() < 1e-6) wdir.set(0, 1, 0);
    wdir.normalize();
    q1.setFromUnitVectors(UP, wdir);
    q2.setFromAxisAngle(wdir, p[P.wroll]!);
    this.weaponPivot.quaternion.multiplyQuaternions(q2, q1);

    const mid = tMid;
    const end = tEnd;
    const target = tTarget;
    // Right hand holds the weapon pivot; the left hand reaches for the second grip.
    const right = this.arms[1]!;
    target.copy(this.weaponPivot.position);
    solveTwoBone(right.shoulder, target, UPPER_ARM, FOREARM, right.pole, mid, end);
    placeSegment(right.upper, right.shoulder, mid, UPPER_ARM);
    placeSegment(right.fore, mid, end, FOREARM);
    right.hand.position.copy(end);

    const left = this.arms[0]!;
    target.copy(wdir).multiplyScalar(this.spec.gripLeft).add(this.weaponPivot.position);
    // Let go one-handed when the grip is out of reach (wide swings), like a real fighter would.
    if (target.distanceTo(left.shoulder) > (UPPER_ARM + FOREARM) * 1.15) {
      target.set(left.shoulder.x + 0.12, left.shoulder.y - 0.42, left.shoulder.z + 0.18);
    }
    solveTwoBone(left.shoulder, target, UPPER_ARM, FOREARM, left.pole, mid, end);
    placeSegment(left.upper, left.shoulder, mid, UPPER_ARM);
    placeSegment(left.fore, mid, end, FOREARM);
    left.hand.position.copy(end);

    this.body.updateMatrix();
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i]!;
      const hip = tHip.copy(leg.hipLocal).applyMatrix4(this.body.matrix);
      const base = i === 0 ? P.flx : P.frx;
      target.set(p[base]!, p[base + 1]! + 0.05, p[base + 2]!);
      const kneePole = v2.copy(leg.pole).applyQuaternion(this.body.quaternion);
      solveTwoBone(hip, target, THIGH, SHIN, kneePole, mid, end);
      placeSegment(leg.thigh, hip, mid, THIGH);
      placeSegment(leg.shin, mid, end, SHIN);
      leg.foot.position.set(end.x, Math.max(0.035, end.y - 0.02), end.z + 0.05);
      leg.foot.rotation.set(p[P.bodyPitch]! * 0.5, p[P.bodyYaw]! * 0.3, 0);
    }
  }

  setRim(strength: number, r = 1, g = 1, b = 1): void {
    this.uniforms.uRim.value = strength;
    this.uniforms.uRimColor.value.setRGB(r, g, b);
  }

  setTint(strength: number, r: number, g: number, b: number): void {
    this.uniforms.uTint.value = strength;
    this.uniforms.uTintColor.value.setRGB(r, g, b);
  }
}

export function makeGhostMaterial(color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false });
}
