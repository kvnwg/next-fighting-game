import {
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { WeaponId } from '@nfg/shared';
import type { VoxelBone, VoxelModel } from '../../../../../characters/voxel-model';
import { makeFighterMaterial, makeFighterUniforms, type FighterUniforms } from '../materials.ts';
import { P, type Pose } from '../poses.ts';
import { VOXEL_FIGHTERS, type PropSpec } from './fighters.ts';
import { VOXEL, meshBones } from './mesh.ts';

// The pose tables are authored for the original procedural rig. These are its
// proportions, used to map pose targets onto each voxel fighter's own body.
const POSE_SHOULDER_Y = 0.5;
const POSE_ARM = 0.6;
const POSE_HIP = 0.86;
/** Hands grip this far past the wrist pivot, in voxels. */
const GRIP_OFFSET = 3;

interface Built {
  model: VoxelModel;
  bones: Map<string, VoxelBone>;
  geoms: Map<string, BufferGeometry>;
}

const modelCache = new Map<() => VoxelModel, Built>();
function built(build: () => VoxelModel, bones?: string[]): Built {
  let b = modelCache.get(build);
  if (!b) {
    const model = build();
    b = { model, bones: new Map(model.bones.map((x) => [x.name, x])), geoms: meshBones(model) };
    modelCache.set(build, b);
  }
  if (!bones) return b;
  return { ...b, geoms: new Map([...b.geoms].filter(([k]) => bones.includes(k))) };
}

const vec = (p: readonly number[]) => new Vector3(p[0], p[1], p[2]);
const UP = new Vector3(0, 1, 0);
const v1 = new Vector3();
const v2 = new Vector3();
const vDir = new Vector3();
const vPole = new Vector3();
const mid = new Vector3();
const end = new Vector3();
const target = new Vector3();
const hip = new Vector3();
const q1 = new Quaternion();
const q2 = new Quaternion();
const qInv = new Quaternion();
const IDENTITY = new Quaternion();
const basis = new Matrix4();
const bx = new Vector3();
const by = new Vector3();
const bz = new Vector3();

/** Two-bone IK without stretch (voxel limbs are rigid): writes the joint into `m`, the reached end into `e`. */
function solve(a: Vector3, t: Vector3, la: number, lb: number, poleDir: Vector3, m: Vector3, e: Vector3): void {
  const dir = vDir.subVectors(t, a);
  let d = dir.length();
  if (d < 1e-4) {
    dir.set(0, -1, 0);
    d = 1e-4;
  }
  dir.divideScalar(d);
  const dd = Math.min(d, (la + lb) * 0.999, Math.max(d, Math.abs(la - lb) + 1e-3));
  const cosA = Math.min(1, Math.max(-1, (la * la + dd * dd - lb * lb) / (2 * la * dd)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const perp = vPole.copy(poleDir).addScaledVector(dir, -poleDir.dot(dir));
  if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
  perp.normalize();
  m.copy(a).addScaledVector(dir, la * cosA).addScaledVector(perp, la * sinA);
  e.copy(a).addScaledVector(dir, dd);
}

/** Rotation turning a bone's rest direction onto `dir`, expressed in the parent's space. */
function aim(out: Quaternion, rest: Vector3, dir: Vector3, parentWorld: Quaternion): Quaternion {
  q1.setFromUnitVectors(rest, v1.copy(dir).normalize());
  return out.copy(qInv.copy(parentWorld).invert()).multiply(q1);
}

interface Limb {
  upper: Group;
  lower: Group;
  end?: Group;
  /** Joint positions in the parent space of `upper`, at rest. */
  root: Vector3;
  restUpper: Vector3;
  restLower: Vector3;
  lenUpper: number;
  lenLower: number;
  pole: Vector3;
}

const TRUNK = new Set(['pelvis', 'torso']);
/** Weapons some bodies carry (a sheathed blade, a prop held for the character sheet). */
const CARRIED = /hammer|scythe|spear|katana|rapier|dagger|sword|shield|lightning/i;

function bodySize(model: VoxelModel): { height: number; halfWidth: number } {
  let top = 0;
  let side = 0;
  for (const v of model.voxels) {
    if (!CARRIED.test(v.bone)) top = Math.max(top, v.y + 1);
    if (TRUNK.has(v.bone)) side = Math.max(side, Math.abs(v.x + 0.5));
  }
  // Arms and pauldrons hang a little wider than the trunk in a fighting stance.
  return { height: top * VOXEL, halfWidth: Math.max(0.25, side * VOXEL * 1.3) };
}

export interface VoxelRigOptions {
  ghost?: Material;
}

/**
 * A voxel fighter driven by the same pose vectors as the procedural rig: IK places
 * hands and feet for the fighter's own proportions, then each rigid voxel bone is
 * turned to match. The held weapon is a voxel prop placed at the right hand.
 */
export class VoxelRig {
  readonly root = new Group();
  readonly uniforms: FighterUniforms;
  readonly bladeBase = new Object3D();
  readonly bladeTip = new Object3D();
  /** Standing height and the half-width of the torso and shoulders, in meters (for camera framing). */
  readonly size: { height: number; halfWidth: number };
  private readonly groups = new Map<string, Group>();
  private readonly arms: Limb[] = [];
  private readonly legs: Limb[] = [];
  private readonly weaponPivot = new Group();
  private readonly offhandPivot = new Group();
  private readonly shoulderMid: Vector3;
  private readonly armScale: number;
  private readonly hipScale: number;
  private readonly gripLeft: number | null;
  private readonly offhand: 'hand' | 'forearm' | null;
  private readonly charged: Mesh[] = [];
  /** Body bones hidden in a fight (a sheathed blade), shown again by `setSheathed`. */
  private readonly sheathed: Mesh[] = [];
  private readonly pelvisRest: Vector3;
  private readonly materials: { mat: Material; opacity: number }[] = [];
  private fade = 1;

  constructor(
    readonly weapon: WeaponId,
    opts: VoxelRigOptions = {},
  ) {
    const spec = VOXEL_FIGHTERS[weapon];
    this.uniforms = makeFighterUniforms();
    const own = <M extends Material>(m: M, opacity = 1): M => {
      this.materials.push({ mat: m, opacity });
      return m;
    };
    const solidMat = opts.ghost ?? own(makeFighterMaterial(0xffffff, this.uniforms, { vertexColors: true, roughness: 0.82 }));
    const matFor = (bone: VoxelBone): Material => {
      if (opts.ghost) return opts.ghost;
      const opacity = bone.opacity ?? 1;
      if (bone.emissive) return own(new MeshBasicMaterial({ vertexColors: true, transparent: opacity < 1, opacity, toneMapped: false }), opacity);
      if (opacity < 1) return own(makeFighterMaterial(0xffffff, this.uniforms, { vertexColors: true, opacity, roughness: 0.9 }), opacity);
      return solidMat;
    };

    // ---- body bones, parented as in the model ----
    const body = built(spec.build);
    const hidden = new Set(spec.hide ?? []);
    for (const bone of body.model.bones) {
      const g = new Group();
      g.name = bone.name;
      const geo = body.geoms.get(bone.name);
      if (geo && !(hidden.has(bone.name) && opts.ghost)) {
        const mesh = new Mesh(geo, matFor(bone));
        mesh.frustumCulled = false;
        if ((bone.opacity ?? 1) < 1) mesh.renderOrder = 1;
        if (hidden.has(bone.name)) {
          mesh.visible = false;
          this.sheathed.push(mesh);
        }
        g.add(mesh);
      }
      this.groups.set(bone.name, g);
    }
    for (const bone of body.model.bones) {
      const g = this.groups.get(bone.name)!;
      const parent = bone.parent ? body.bones.get(bone.parent)! : null;
      const pp = parent ? parent.pivot : [0, 0, 0];
      g.position.set((bone.pivot[0] - pp[0]!) * VOXEL, (bone.pivot[1] - pp[1]!) * VOXEL, (bone.pivot[2] - pp[2]!) * VOXEL);
      (parent ? this.groups.get(parent.name)! : this.root).add(g);
    }
    this.size = bodySize(body.model);
    const pivot = (name: string) => vec(body.bones.get(name)!.pivot).multiplyScalar(VOXEL);
    const torso = pivot('torso');
    this.pelvisRest = pivot('pelvis');

    // ---- arms (index 0 is the fighter's left, +x; index 1 the right, which holds the weapon) ----
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const shoulder = pivot(`upperArm${side}`);
      const elbow = pivot(`forearm${side}`);
      const wrist = pivot(`hand${side}`);
      const grip = wrist.clone().add(new Vector3(s * GRIP_OFFSET * VOXEL, 0, 0));
      this.arms.push({
        upper: this.groups.get(`upperArm${side}`)!,
        lower: this.groups.get(`forearm${side}`)!,
        end: this.groups.get(`hand${side}`),
        root: shoulder.clone().sub(torso),
        restUpper: elbow.clone().sub(shoulder).normalize(),
        restLower: grip.clone().sub(elbow).normalize(),
        lenUpper: elbow.distanceTo(shoulder),
        lenLower: grip.distanceTo(elbow),
        pole: new Vector3(s * 0.7, -1, -0.6).normalize(),
      });
    }
    const armLen = this.arms[0]!.lenUpper + this.arms[0]!.lenLower;
    this.armScale = armLen / POSE_ARM;
    this.shoulderMid = this.arms[0]!.root.clone().add(this.arms[1]!.root).multiplyScalar(0.5);

    // ---- legs, when the fighter has them (the wraith floats) ----
    this.hipScale = this.pelvisRest.y / POSE_HIP;
    for (const side of ['L', 'R']) {
      if (!body.bones.has(`thigh${side}`)) continue;
      const s = side === 'L' ? 1 : -1;
      const hipJ = pivot(`thigh${side}`);
      const knee = pivot(`shin${side}`);
      const foot = body.bones.has(`foot${side}`) ? pivot(`foot${side}`) : new Vector3(knee.x, 3.5 * VOXEL, knee.z);
      this.legs.push({
        upper: this.groups.get(`thigh${side}`)!,
        lower: this.groups.get(`shin${side}`)!,
        end: this.groups.get(`foot${side}`),
        root: hipJ.clone().sub(this.pelvisRest),
        restUpper: knee.clone().sub(hipJ).normalize(),
        restLower: foot.clone().sub(knee).normalize(),
        lenUpper: knee.distanceTo(hipJ),
        lenLower: foot.distanceTo(knee),
        pole: new Vector3(s * 0.25, 0, 1).normalize(),
      });
    }

    // ---- weapon and offhand props ----
    this.gripLeft = spec.gripLeft;
    const torsoGroup = this.groups.get('torso')!;
    if (spec.weapon) this.weaponPivot.add(this.prop(spec.weapon, matFor));
    this.bladeBase.position.y = spec.bladeBase;
    this.bladeTip.position.y = spec.bladeTip;
    this.weaponPivot.add(this.bladeBase, this.bladeTip);
    torsoGroup.add(this.weaponPivot);
    this.offhand = spec.offhand?.on ?? null;
    if (spec.offhand) {
      this.offhandPivot.add(this.prop(spec.offhand, matFor));
      torsoGroup.add(this.offhandPivot);
    }
  }

  /** A prop group with its grip at the origin and its striking end along +y. */
  private prop(p: PropSpec, matFor: (b: VoxelBone) => Material): Group {
    const b = built(p.build, p.bones);
    const inner = new Group();
    for (const [name, geo] of b.geoms) {
      const bone = b.bones.get(name)!;
      const mesh = new Mesh(geo, matFor(bone));
      mesh.frustumCulled = false;
      if (p.charged?.includes(name)) {
        mesh.visible = false;
        this.charged.push(mesh);
      }
      mesh.position.set((bone.pivot[0] - p.grip[0]) * VOXEL, (bone.pivot[1] - p.grip[1]) * VOXEL, (bone.pivot[2] - p.grip[2]) * VOXEL);
      inner.add(mesh);
    }
    const g = new Group();
    g.quaternion.setFromUnitVectors(vec(p.axis).normalize(), UP);
    if (p.roll) g.quaternion.premultiply(q2.setFromAxisAngle(UP, p.roll));
    g.add(inner);
    return g;
  }

  /** Maps a hand target from the pose tables' torso space onto this fighter's torso. */
  private mapHand(out: Vector3, x: number, y: number, z: number): Vector3 {
    return out.set(x, y - POSE_SHOULDER_Y, z).multiplyScalar(this.armScale).add(this.shoulderMid);
  }

  /** Positions every bone from a pose vector. Root position and facing are set by the caller. */
  applyPose(p: Pose): void {
    const pelvis = this.groups.get('pelvis')!;
    const k = this.hipScale;
    pelvis.position.set(p[P.side]! * k, p[P.hipY]! * k, p[P.fwd]! * k);
    pelvis.rotation.set(p[P.bodyPitch]!, p[P.bodyYaw]!, p[P.roll]!, 'YXZ');
    const torso = this.groups.get('torso')!;
    torso.rotation.order = 'YXZ';
    torso.rotation.set(p[P.lean]!, p[P.twist]!, p[P.tilt]!);
    this.groups.get('head')?.rotation.set(p[P.headPitch]!, p[P.headYaw]!, 0);

    // ---- arms: the right hand drives the weapon, the left takes the second grip or a guard ----
    const wdir = v2.set(p[P.wdx]!, p[P.wdy]!, p[P.wdz]!);
    if (wdir.lengthSq() < 1e-6) wdir.set(0, 1, 0);
    wdir.normalize();
    const right = this.arms[1]!;
    this.mapHand(target, p[P.wpx]!, p[P.wpy]!, p[P.wpz]!);
    solve(right.root, target, right.lenUpper, right.lenLower, right.pole, mid, end);
    this.aimLimb(right, mid, end, IDENTITY);
    this.weaponPivot.position.copy(end);
    q1.setFromUnitVectors(UP, wdir);
    q2.setFromAxisAngle(wdir, p[P.wroll]!);
    this.weaponPivot.quaternion.multiplyQuaternions(q2, q1);

    const left = this.arms[0]!;
    const reach = (left.lenUpper + left.lenLower) * 1.05;
    if (this.gripLeft !== null) target.copy(wdir).multiplyScalar(this.gripLeft).add(end);
    if (this.gripLeft === null || target.distanceTo(left.root) > reach) {
      // One-handed: the free hand rides up in front of the chest.
      target.set(left.root.x - 0.02, left.root.y - 0.42 * this.armScale, left.root.z + 0.26 * this.armScale);
    }
    solve(left.root, target, left.lenUpper, left.lenLower, left.pole, mid, end);
    this.aimLimb(left, mid, end, IDENTITY);
    if (this.offhand === 'hand') {
      this.offhandPivot.position.copy(end);
      this.offhandPivot.quaternion.setFromUnitVectors(UP, v1.set(0.15, 0.75, 0.65).normalize());
    } else if (this.offhand === 'forearm') {
      // A shield strapped halfway down the forearm, its face turned forward and a little outward.
      by.subVectors(end, mid).normalize();
      bz.set(0.35, 0, 1).normalize().addScaledVector(by, -by.dot(bz)).normalize();
      bx.crossVectors(by, bz);
      this.offhandPivot.quaternion.setFromRotationMatrix(basis.makeBasis(bx, by, bz));
      this.offhandPivot.position.lerpVectors(mid, end, 0.5).addScaledVector(bz, 0.07);
    }

    // Pauldrons follow the upper arm part of the way, so they sit on the shoulder.
    for (const [side, arm] of [['L', left], ['R', right]] as const) {
      this.groups.get(`pauldron${side}`)?.quaternion.slerpQuaternions(IDENTITY, arm.upper.quaternion, 0.4);
    }

    // ---- legs: feet are placed in root space ----
    if (this.legs.length) {
      pelvis.updateMatrix();
      const pq = pelvis.quaternion;
      for (let i = 0; i < this.legs.length; i++) {
        const leg = this.legs[i]!;
        hip.copy(leg.root).applyMatrix4(pelvis.matrix);
        const base = i === 0 ? P.flx : P.frx;
        target.set(p[base]! * k, p[base + 1]! * k + this.footHeight(leg), p[base + 2]! * k);
        const kneePole = v1.copy(leg.pole).applyQuaternion(pq);
        solve(hip, target, leg.lenUpper, leg.lenLower, kneePole, mid, end);
        this.aimLimb(leg, mid, end, pq, hip);
        if (leg.end) {
          // Keep feet flat: undo everything above them except the fighter's facing.
          leg.end.quaternion.copy(pq).multiply(leg.upper.quaternion).multiply(leg.lower.quaternion).invert();
        }
      }
    }
  }

  private footHeight(leg: Limb): number {
    return Math.max(0, this.pelvisRest.y - leg.lenUpper * Math.abs(leg.restUpper.y) - leg.lenLower * Math.abs(leg.restLower.y));
  }

  /**
   * Turns a limb's two bones so they run root → joint → end. Positions are in the space of
   * the upper bone's parent, unless `from` (the root in another space) and the parent's
   * rotation are given, as for legs solved in root space.
   */
  private aimLimb(limb: Limb, joint: Vector3, tip: Vector3, parentQ: Quaternion, from?: Vector3): void {
    const start = from ?? limb.root;
    aim(limb.upper.quaternion, limb.restUpper, v1.subVectors(joint, start), parentQ);
    q2.copy(parentQ).multiply(limb.upper.quaternion);
    aim(limb.lower.quaternion, limb.restLower, v1.subVectors(tip, joint), q2);
  }

  /** Puts a drawn blade back in its sheath (entrances): the body's sheathed bones show and the held props hide. */
  setSheathed(on: boolean): void {
    if (this.sheathed.length === 0) return;
    for (const m of this.sheathed) m.visible = on;
    this.weaponPivot.visible = !on;
    this.offhandPivot.visible = !on;
  }

  /** See-through when below 1, so your own fighter never hides the opponent. */
  setFade(k: number): void {
    if (Math.abs(k - this.fade) < 0.005) return;
    const was = this.fade < 1;
    this.fade = k;
    for (const { mat, opacity } of this.materials) {
      mat.opacity = opacity * k;
      const see = k < 1 || opacity < 1;
      if (was !== k < 1) {
        mat.transparent = see;
        mat.depthWrite = !see;
        mat.needsUpdate = true;
      }
    }
  }

  /** Shows charged prop parts (lightning), flickering; `on` false hides them. */
  setCharged(on: boolean, time: number): void {
    for (const [i, m] of this.charged.entries()) m.visible = on && Math.sin(time * 47 + i * 2.1) > -0.35;
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
