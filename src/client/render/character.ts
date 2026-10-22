/**
 * Voxel fighters with fully procedural animation. The Animator decides where the weapon is and how
 * the body moves each frame (from the combat state, so animations always line up with the gameplay
 * timings the server uses); this file builds the rig to the voxel model's own proportions, carries
 * the animator's targets over to them, and fits the limbs with IK: hands reach for the grips, feet
 * stay planted where they're put.
 */
import * as THREE from 'three';
import { CHARACTERS, CharacterDef, CharacterId, isHeavyKey } from '../../shared/characters';
import { AnimFrame, AnimInput, Animator, Reaction } from './anim/animator';
import { smooth, solveTwoBone } from './anim/math';
import { CHAR_LAYER, FX_LAYER } from './renderer';
import { patchMaterial } from './gfx/materials';
import { WeaponParts, buildWeapon } from './weapons';
import type { VoxelBone } from '../../../characters/voxel-model';
import { BONE_SLOTS, PropSpec, RigDims, RigSlot, SLOT_BONE, VOXEL_FIGHTERS, propFrame, propRotation, restDirection, rigDims, voxelModel } from './voxel/fighters';
import { VOXEL } from './voxel/mesh';

export type { AnimFrame, AnimInput, Reaction };

// The animator's poses are authored for a reference body; each fighter's own proportions are
// mapped from these (arm reach about the shoulders, leg length for the stance and the hips).
const POSE_SHOULDER = new THREE.Vector3(0, 0.5, 0);
const POSE_ARM = 0.56;
const POSE_LEG = 0.85;
const POSE_ANKLE = 0.05;
/** the reference body's hip joints, each side of centre */
const POSE_HIP = 0.12;
const POSE_HIPS = 0.92;
const POSE_HEIGHT = 1.95;
// elbows bend out, down and back
const ELBOW_POLE_R = new THREE.Vector3(-0.7, -0.55, -0.45).normalize();
const ELBOW_POLE_L = new THREE.Vector3(0.7, -0.55, -0.45).normalize();
// knees forward and a little out
const KNEE_POLE_R = new THREE.Vector3(-0.18, 0, 1).normalize();
const KNEE_POLE_L = new THREE.Vector3(0.18, 0, 1).normalize();

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _rh = new THREE.Vector3();
const _lh = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _yaw = new THREE.Quaternion();
const _ident = new THREE.Quaternion();
const _down = new THREE.Vector3();
const _acro = new THREE.Quaternion();
const _pivot = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _bodyInv = new THREE.Matrix4();
const _sv = new THREE.Vector3();
const _sp0 = new THREE.Vector3();
const _sp1 = new THREE.Vector3();
const _ss0 = new THREE.Vector3();
const _ss1 = new THREE.Vector3();
const _sq0 = new THREE.Quaternion();
const _sq1 = new THREE.Quaternion();
const _mp = new THREE.Vector3();
const _kick = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _grip = new THREE.Vector3();
const _hh = new THREE.Vector3();
const _hg = new THREE.Vector3();
const _sm = new THREE.Matrix4();
const _sinv = new THREE.Matrix4();
const _srel = new THREE.Matrix4();
// legs tucked to the chest while upside down (body frame)
const TUCK_L = new THREE.Vector3(0.15, 0.55, 0.16);
const TUCK_R = new THREE.Vector3(-0.15, 0.48, 0.02);
const GHOST_LIFE = 0.28;
/** Smear frames: how long a smear copy of the weapon lingers, and how far the tip must travel in one frame to leave them. */
const SMEAR_LIFE = 0.05;
const SMEAR_MIN = 0.24;
const SMEAR_ALPHA = 0.16;

interface Ghost {
  group: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  life: number;
}

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
  end: THREE.Group;
}



/**
 * Cloth and hair that swing instead of riding rigidly on the body: each piece pivots where it
 * hangs from and is pulled toward the way the forces on it point (gravity, the air it moves
 * through, and the lag of its own inertia when the body lurches or turns), through a damped spring.
 * `lift` is how far it may swing out from the body (rad), `side` sideways.
 */
interface ClothSpec {
  /** spring stiffness (1/s^2) and damping ratio */
  k: number;
  zeta: number;
  gravity: number;
  /** how much the air pushes it back as it moves, and how much it lags when the body accelerates */
  drag: number;
  inertia: number;
  lift: number;
  side: number;
  /** a ripple when moving fast (rad at full speed) */
  flutter: number;
  /** hangs all round (a skirt), so it swings as far forward as back */
  around?: boolean;
}

const CLOTH: Record<string, ClothSpec> = {
  // heavy: about 20 degrees back at a run, flaring out in spins and leaps
  cape: { k: 55, zeta: 0.6, gravity: 1, drag: 0.25, inertia: 0.6, lift: 1.0, side: 0.5, flutter: 0.05 },
  cloak: { k: 60, zeta: 0.6, gravity: 1, drag: 0.28, inertia: 0.6, lift: 0.9, side: 0.45, flutter: 0.06 },
  // light: streams out behind at a run
  scarf: { k: 30, zeta: 0.28, gravity: 0.8, drag: 0.9, inertia: 0.9, lift: 1.5, side: 0.8, flutter: 0.14 },
  ribbons: { k: 22, zeta: 0.25, gravity: 0.7, drag: 1, inertia: 1, lift: 1.4, side: 0.9, flutter: 0.2 },
  hair: { k: 110, zeta: 0.75, gravity: 0.5, drag: 0.25, inertia: 0.5, lift: 0.5, side: 0.35, flutter: 0.04 },
  beard: { k: 90, zeta: 0.65, gravity: 0.8, drag: 0.2, inertia: 0.6, lift: 0.6, side: 0.3, flutter: 0.02 },
  beads: { k: 45, zeta: 0.22, gravity: 1, drag: 0.15, inertia: 1, lift: 0.9, side: 0.6, flutter: 0 },
  robeLower: { k: 70, zeta: 0.4, gravity: 0.6, drag: 0.35, inertia: 0.6, lift: 0.35, side: 0.3, flutter: 0.03, around: true },
};

interface Cloth {
  pivot: THREE.Group;
  spec: ClothSpec;
  /** hangs in front of where it pivots (a beard, beads) rather than behind (a cape) */
  front: boolean;
  a: number;
  b: number;
  va: number;
  vb: number;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  acc: THREE.Vector3;
  started: boolean;
  phase: number;
}

const _cp = new THREE.Vector3();
const _cv = new THREE.Vector3();
const _cf = new THREE.Vector3();
const _cq = new THREE.Quaternion();
const _cl1 = new THREE.Vector3();
const _cl2 = new THREE.Vector3();
const _chainM = new THREE.Matrix4();
const _chainA = new THREE.Vector3();
const _chainB = new THREE.Vector3();
const _chainS = new THREE.Vector3(1, 1, 1);
const Z_AXIS_C = new THREE.Vector3(0, 0, 1);
const _chainTwist = new THREE.Quaternion().setFromAxisAngle(Z_AXIS_C, Math.PI / 2);
type SkeletonJoint = 'pelvis' | 'chest' | 'head' | `${'armR' | 'armL' | 'legR' | 'legL'}.${'upper' | 'lower' | 'end'}`;
const SPINE = '#ffd23a';
const RIGHT = '#ff4a5a';
const LEFT = '#4ab0ff';
const SKELETON: [SkeletonJoint, SkeletonJoint, string][] = [
  ['pelvis', 'chest', SPINE], ['chest', 'head', SPINE],
  ['chest', 'armR.upper', RIGHT], ['armR.upper', 'armR.lower', RIGHT], ['armR.lower', 'armR.end', RIGHT],
  ['chest', 'armL.upper', LEFT], ['armL.upper', 'armL.lower', LEFT], ['armL.lower', 'armL.end', LEFT],
  ['pelvis', 'legR.upper', RIGHT], ['legR.upper', 'legR.lower', RIGHT], ['legR.lower', 'legR.end', RIGHT],
  ['pelvis', 'legL.upper', LEFT], ['legL.upper', 'legL.lower', LEFT], ['legL.lower', 'legL.end', LEFT],
];
const _skA = new THREE.Vector3();
const _skB = new THREE.Vector3();
const _skC = new THREE.Color();
const _skM = new THREE.Matrix4();

export class CharacterModel {
  readonly root = new THREE.Group();
  readonly char: CharacterDef;
  readonly weapon: WeaponParts;
  readonly animator: Animator;
  readonly scale: number;
  /** whether each weapon is mid-swing this frame (drives the trails) */
  swingMain = false;
  swingOff = false;
  /** trail anchors in weapon space */
  readonly trailMain: { base: THREE.Vector3; tip: THREE.Vector3 };
  readonly trailOff: { base: THREE.Vector3; tip: THREE.Vector3 } | null;
  private readonly body = new THREE.Group();
  private readonly hips: THREE.Group;
  private readonly torso: THREE.Group;
  private readonly head: THREE.Group;
  private readonly armR: Limb;
  private readonly armL: Limb;
  private readonly legR: Limb;
  private readonly legL: Limb;
  private readonly d: RigDims;
  private readonly armK: number;
  private readonly legK: number;
  /** how much wider this fighter's hips are than the reference body's: the feet move out with them */
  private readonly hipSpread: number;
  private readonly shoulderMid: THREE.Vector3;
  /** prop parts lit only during heavy swings and specials (the spear's lightning) */
  private readonly charged: THREE.Mesh[] = [];
  private readonly mainPivot = new THREE.Group();
  private readonly offPivot = new THREE.Group();
  private readonly materials: THREE.MeshLambertMaterial[] = [];
  private flashT = 0;
  private readonly cloth: Cloth[] = [];
  /** a chain weapon: how far it reaches, how far out it is now (m), and the chain's links */
  private readonly chainLen: number = 0;
  private chainOut = 0;
  private chain: { pts: THREE.Vector3[]; prev: THREE.Vector3[]; seg: number; links: THREE.InstancedMesh; started: boolean } | null = null;
  private clothTime = 0;
  private flashColor = new THREE.Color('#ffffff');
  private ghosts: Ghost[] = [];
  private ghostT = 0;
  /** see-through copies of the weapon filling the gap a fast swing jumps across in one frame */
  private smears: Ghost[] = [];
  private smearPrev = { main: new THREE.Matrix4(), off: new THREE.Matrix4(), tipMain: new THREE.Vector3(), tipOff: new THREE.Vector3(), ok: false };
  smearsEnabled = true;
  /** the last animation frame, for effects that need it (kick trails, cue anchors) */
  frame: AnimFrame | null = null;
  /** afterimages on dashes and flips (the dev strip viewer turns them off) */
  ghostsEnabled = true;
  private dodging = false;

  constructor(charId: CharacterId) {
    this.char = CHARACTERS[charId];
    this.animator = new Animator(this.char);
    const pal = this.char.palette;
    const mat = (color: string, emissive?: string) => {
      // lit like the world, with a rim of light so the silhouette reads against busy scenery
      const m = patchMaterial(new THREE.MeshLambertMaterial({ color }), { rim: true });
      // a little self-light in the outfit's own colour keeps the shadow side from taking on the
      // world's (often warm) light, so fighters keep their identity against the scenery
      const base = emissive ? new THREE.Color(emissive) : new THREE.Color(color).multiplyScalar(0.12);
      m.emissive.copy(base);
      m.userData.baseEmissive = base;
      this.materials.push(m);
      return m;
    };
    const spec = VOXEL_FIGHTERS[charId];
    const body = voxelModel(spec.build);
    const d = (this.d = rigDims(body.model));
    this.armK = (d.upperArm + d.forearm) / POSE_ARM;
    this.legK = d.hasLegs ? (d.thigh + d.shin) / POSE_LEG : d.hipsY / POSE_HIPS;
    this.hipSpread = Math.max(0, Math.abs(d.hipR.x) - POSE_HIP * this.legK);
    this.animator.legScale = this.legK;
    this.shoulderMid = d.shoulderR.clone().add(d.shoulderL).multiplyScalar(0.5);

    const g = (parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group => {
      const o = new THREE.Group();
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };

    this.root.add(this.body);
    const hips = (this.hips = g(this.body, 0, d.hipsY, 0));
    hips.rotation.order = 'YXZ';
    const torso = (this.torso = g(hips, d.torso.x, d.torso.y, d.torso.z));
    torso.rotation.order = 'YXZ';
    const head = (this.head = g(torso, d.head.x, d.head.y, d.head.z));
    head.rotation.order = 'YXZ';
    const limb = (parent: THREE.Object3D, at: THREE.Vector3, l1: number, l2: number): Limb => {
      const upper = g(parent, at.x, at.y, at.z);
      const lower = g(upper, 0, -l1, 0);
      const end = g(lower, 0, -l2, 0);
      return { upper, lower, end };
    };
    this.armR = limb(torso, d.shoulderR, d.upperArm, d.forearm);
    this.armL = limb(torso, d.shoulderL, d.upperArm, d.forearm);
    this.legR = limb(hips, d.hipR, d.thigh, d.shin);
    this.legL = limb(hips, d.hipL, d.thigh, d.shin);

    // ---- the voxel body: each bone on its rig group, limbs turned to hang along -Y like the rig ----
    const slots: Record<RigSlot, THREE.Group> = {
      hips, torso, head,
      'armR.upper': this.armR.upper, 'armR.lower': this.armR.lower, 'armR.end': this.armR.end,
      'armL.upper': this.armL.upper, 'armL.lower': this.armL.lower, 'armL.end': this.armL.end,
      'legR.upper': this.legR.upper, 'legR.lower': this.legR.lower, 'legR.end': this.legR.end,
      'legL.upper': this.legL.upper, 'legL.lower': this.legL.lower, 'legL.end': this.legL.end,
    };
    const voxMat = this.voxelMaterials(pal.primary);
    const bones = body.bones;
    const hidden = new Set(spec.hide ?? []);
    const slotOf = (b: VoxelBone): RigSlot => {
      let cur: VoxelBone | undefined = b;
      while (cur && !BONE_SLOTS[cur.name]) cur = cur.parent ? bones.get(cur.parent) : undefined;
      return cur ? BONE_SLOTS[cur.name] : 'hips';
    };
    const restQ = new Map<RigSlot, THREE.Quaternion>();
    const DOWN = new THREE.Vector3(0, -1, 0);
    for (const slot of Object.keys(slots) as RigSlot[]) {
      const dir = slot.endsWith('.end') && slot.startsWith('leg') ? null : restDirection(body.model, SLOT_BONE[slot]);
      restQ.set(slot, dir ? new THREE.Quaternion().setFromUnitVectors(dir, DOWN) : new THREE.Quaternion());
    }
    for (const bone of body.model.bones) {
      const geo = body.geoms.get(bone.name);
      if (!geo || hidden.has(bone.name)) continue;
      const slot = slotOf(bone);
      const anchor = bones.get(SLOT_BONE[slot]);
      if (!anchor) continue;
      const q = restQ.get(slot)!;
      const mesh = new THREE.Mesh(geo, voxMat(bone));
      mesh.quaternion.copy(q);
      mesh.position.set(bone.pivot[0] - anchor.pivot[0], bone.pivot[1] - anchor.pivot[1], bone.pivot[2] - anchor.pivot[2]).multiplyScalar(VOXEL).applyQuaternion(q);
      // the hand group sits where the fist closes, a little past the wrist pivot
      if (slot.startsWith('arm') && slot.endsWith('.end')) mesh.position.y += 3 * VOXEL;
      mesh.castShadow = true;
      if ((bone.opacity ?? 1) < 1) mesh.renderOrder = 1;
      const cloth = CLOTH[bone.name];
      if (cloth) {
        // hung from a pivot of its own so it can swing about where it hangs
        const pivot = new THREE.Group();
        pivot.position.copy(mesh.position);
        mesh.position.set(0, 0, 0);
        pivot.add(mesh);
        slots[slot].add(pivot);
        geo.computeBoundingBox();
        const centre = geo.boundingBox!.getCenter(new THREE.Vector3()).applyQuaternion(q);
        this.cloth.push({ pivot, spec: cloth, front: centre.z > 0.02, a: 0, b: 0, va: 0, vb: 0, prev: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), started: false, phase: Math.random() * 10 });
      } else slots[slot].add(mesh);
    }

    // weapons are carried by the torso and the hands reach for them: the voxel props, with the
    // placeholder set kept only for what it wears on the body (the katana's scabbard)
    this.weapon = buildWeapon(this.char, mat);
    this.weapon.main = this.prop(spec.main, voxMat);
    this.weapon.base = this.anchor(this.weapon.main, spec.main, spec.main.base);
    this.weapon.tip = this.anchor(this.weapon.main, spec.main, spec.main.tip);
    if (spec.off) {
      this.weapon.off = this.prop(spec.off, voxMat);
      this.weapon.offBase = this.anchor(this.weapon.off, spec.off, spec.off.base);
      this.weapon.offTip = this.anchor(this.weapon.off, spec.off, spec.off.tip);
    }
    if (this.weapon.worn) this.mapTorso(this.weapon.worn.position, this.weapon.worn.position);
    const local = (grp: THREE.Group, base: THREE.Object3D, tip: THREE.Object3D) => {
      grp.updateMatrixWorld(true);
      return { base: base.getWorldPosition(new THREE.Vector3()), tip: tip.getWorldPosition(new THREE.Vector3()) };
    };
    this.trailMain = local(this.weapon.main, this.weapon.base, this.weapon.tip);
    this.trailOff = this.weapon.off && this.weapon.offBase && this.weapon.offTip ? local(this.weapon.off, this.weapon.offBase, this.weapon.offTip) : null;
    torso.add(this.mainPivot);
    this.mainPivot.add(this.weapon.main);
    if (this.weapon.off) {
      torso.add(this.offPivot);
      this.offPivot.add(this.weapon.off);
    }
    if (this.weapon.worn) torso.add(this.weapon.worn);
    if (spec.main.chain) {
      this.chainLen = spec.main.chain;
      // a little longer than its full throw, so it always hangs a little
      const n = 26;
      const seg = (this.chainLen * 1.08 + 0.3) / (n - 1);
      const geo = new THREE.BoxGeometry(0.035, 0.018, seg * 1.25);
      const links = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#4a4c54', metalness: 0.7, roughness: 0.45 }), n - 1);
      links.castShadow = true;
      links.frustumCulled = false;
      this.root.add(links);
      this.chain = { pts: Array.from({ length: n }, () => new THREE.Vector3()), prev: Array.from({ length: n }, () => new THREE.Vector3()), seg, links, started: false };
    }

    // models are built at their real size; `scale` tells the HUD and camera how tall this one is
    this.scale = d.height / POSE_HEIGHT;
    // fighters get the ink outline and rim light in the composite pass
    this.root.traverse((o) => o.layers.enable(CHAR_LAYER));
  }

  /** Materials for voxel bones: lit with vertex colours, see-through where the bone says so, unlit where it glows. */
  private voxelMaterials(tint: string): (bone: VoxelBone) => THREE.Material {
    const base = new THREE.Color(tint).multiplyScalar(0.08);
    const lit = (opacity: number) => {
      const m = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }), { rim: true });
      m.emissive.copy(base);
      m.userData.baseEmissive = base;
      this.materials.push(m);
      return m;
    };
    const solid = lit(1);
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    return (bone) => {
      const opacity = bone.opacity ?? 1;
      if (bone.emissive) return opacity < 1 ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity }) : glow;
      return opacity < 1 ? lit(opacity) : solid;
    };
  }

  /** A held voxel prop in the weapon frame (grip at the origin, along +Z). */
  private prop(p: PropSpec, voxMat: (bone: VoxelBone) => THREE.Material): THREE.Group {
    const src = voxelModel(p.build);
    const frame = propFrame(p);
    const q = propRotation(p);
    const group = new THREE.Group();
    for (const [name, geo] of src.geoms) {
      if (p.bones && !p.bones.includes(name)) continue;
      const bone = src.bones.get(name)!;
      const mesh = new THREE.Mesh(geo, voxMat(bone));
      mesh.position.copy(frame(bone.pivot));
      mesh.quaternion.copy(q);
      mesh.scale.setScalar(p.scale);
      mesh.castShadow = true;
      if (p.charged?.includes(name)) {
        mesh.visible = false;
        this.charged.push(mesh);
      }
      group.add(mesh);
    }
    return group;
  }

  private anchor(parent: THREE.Group, p: PropSpec, at: [number, number, number]): THREE.Object3D {
    const o = new THREE.Object3D();
    o.position.copy(propFrame(p)(at));
    parent.add(o);
    return o;
  }

  /** A torso-space point from the animator's reference body onto this fighter's. */
  private mapTorso(from: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(from).sub(POSE_SHOULDER).multiplyScalar(this.armK).add(this.shoulderMid);
  }

  /** A root-frame foot target from the reference stance onto this fighter's legs. */
  private mapFoot(from: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const k = this.legK;
    return out.set(from.x * k + Math.sign(from.x) * this.hipSpread, (from.y - POSE_ANKLE) * k + this.d.ankle, from.z * k);
  }

  get rightHand(): THREE.Group {
    return this.armR.end;
  }

  flash(color: string, strength = 1): void {
    this.flashColor.set(color);
    this.flashT = strength;
  }

  /** A short additive reaction on top of whatever the fighter is doing. */
  react(kind: Reaction): void {
    this.animator.react(kind);
  }

  /** The chain hangs from the hand to the sickle's ring: a rope of links under gravity, both ends held. */
  private stepChain(dt: number): void {
    const c = this.chain;
    if (!c || dt <= 0) return;
    this.root.updateMatrixWorld(true);
    const a = this.mainPivot.getWorldPosition(_cp);
    const b = this.weapon.main.getWorldPosition(_cv);
    const n = c.pts.length;
    if (!c.started) {
      for (let i = 0; i < n; i++) {
        c.pts[i].lerpVectors(a, b, i / (n - 1)).y -= Math.sin((Math.PI * i) / (n - 1)) * 0.3;
        c.prev[i].copy(c.pts[i]);
      }
      c.started = true;
    }
    const h = Math.min(dt, 1 / 30);
    const g = -9.8 * h * h;
    for (let i = 1; i < n - 1; i++) {
      const p = c.pts[i];
      const vx = (p.x - c.prev[i].x) * 0.985;
      const vy = (p.y - c.prev[i].y) * 0.985;
      const vz = (p.z - c.prev[i].z) * 0.985;
      c.prev[i].copy(p);
      p.set(p.x + vx, p.y + vy + g, p.z + vz);
      // the floor
      if (p.y < 0.02 + this.root.position.y) p.y = 0.02 + this.root.position.y;
    }
    c.pts[0].copy(a);
    c.pts[n - 1].copy(b);
    for (let it = 0; it < 14; it++) {
      for (let i = 0; i < n - 1; i++) {
        const p = c.pts[i];
        const q = c.pts[i + 1];
        _cf.subVectors(q, p);
        const d = _cf.length();
        if (d < 1e-6) continue;
        const corr = (d - c.seg) / d;
        // the ends are held; links between them share the correction
        const wp = i === 0 ? 0 : i + 1 === n - 1 ? 1 : 0.5;
        const wq = i + 1 === n - 1 ? 0 : i === 0 ? 1 : 0.5;
        p.addScaledVector(_cf, corr * wp);
        q.addScaledVector(_cf, -corr * wq);
      }
    }
    // draw each link along its segment, alternate ones turned a quarter
    const m = _chainM;
    for (let i = 0; i < n - 1; i++) {
      const p = this.root.worldToLocal(_chainA.copy(c.pts[i]));
      const q = this.root.worldToLocal(_chainB.copy(c.pts[i + 1]));
      _cf.subVectors(q, p);
      const len = _cf.length();
      _cq.setFromUnitVectors(Z_AXIS_C, len > 1e-6 ? _cf.divideScalar(len) : Z_AXIS_C);
      if (i % 2) _cq.multiply(_chainTwist);
      m.compose(p.add(q).multiplyScalar(0.5), _cq, _chainS);
      c.links.setMatrixAt(i, m);
    }
    c.links.instanceMatrix.needsUpdate = true;
  }

  /** Swing the cloth toward where gravity, the air and its own inertia push it. */
  private stepCloth(dt: number): void {
    if (!this.cloth.length || dt <= 0) return;
    this.clothTime += dt;
    this.root.updateMatrixWorld(true);
    for (const c of this.cloth) {
      const s = c.spec;
      c.pivot.getWorldPosition(_cp);
      if (!c.started) {
        c.prev.copy(_cp);
        c.started = true;
      }
      _cv.subVectors(_cp, c.prev).divideScalar(dt);
      c.prev.copy(_cp);
      // a teleport or respawn is not a gust
      if (_cv.lengthSq() > 30 * 30) _cv.copy(c.vel);
      const acc = _cf.subVectors(_cv, c.vel).divideScalar(dt);
      if (acc.length() > 60) acc.setLength(60);
      c.acc.lerp(acc, Math.min(1, dt * 20));
      c.vel.copy(_cv);
      // the force it hangs along, in the frame it hangs from
      const speed = c.vel.length();
      // only the body's lurches and turns swing it, not the bob of each step: an up-and-down
      // acceleration as big as gravity at every footfall made capes and hair bounce
      _cf.set(-c.acc.x * s.inertia, -9.8 * s.gravity, -c.acc.z * s.inertia).addScaledVector(c.vel, -s.drag * speed);
      c.pivot.parent!.getWorldQuaternion(_cq).invert();
      _cf.applyQuaternion(_cq);
      const down = Math.max(1e-3, -_cf.y);
      // swinging out the back (+a for a cape) or the front, and to the side
      let ta = Math.atan2(-_cf.z, down);
      let tb = Math.atan2(_cf.x, down);
      tb += Math.sin(this.clothTime * 11 + c.phase) * s.flutter * Math.min(1, speed / 4);
      const lo = c.front || s.around ? -s.lift : -0.12;
      const hi = c.front && !s.around ? 0.12 : s.lift;
      ta = Math.min(hi, Math.max(lo, ta));
      tb = Math.min(s.side, Math.max(-s.side, tb));
      // a damped spring toward it, in small steps so a slow frame doesn't blow it up
      const damp = 2 * s.zeta * Math.sqrt(s.k);
      const steps = Math.ceil(dt / (1 / 120));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        c.va += (s.k * (ta - c.a) - damp * c.va) * h;
        c.vb += (s.k * (tb - c.b) - damp * c.vb) * h;
        c.a += c.va * h;
        c.b += c.vb * h;
      }
      // a cape is pushed back by a thigh swinging back into it (the rear leg in a deep lunge)
      if (!c.front && (s === CLOTH.cape || s === CLOTH.cloak)) {
        const parent = c.pivot.parent!;
        let push = -Infinity;
        for (const leg of [this.legL, this.legR]) {
          leg.upper.getWorldPosition(_cl1);
          leg.lower.getWorldPosition(_cl2);
          parent.worldToLocal(_cl1);
          parent.worldToLocal(_cl2);
          _cl2.sub(_cl1);
          push = Math.max(push, Math.atan2(-_cl2.z, Math.max(1e-3, -_cl2.y)) - 0.15);
        }
        if (c.a < push) {
          c.a = Math.min(hi, push);
          c.va = Math.max(0, c.va);
        }
      }
      if (c.a < lo || c.a > hi) {
        c.a = Math.min(hi, Math.max(lo, c.a));
        c.va = 0;
      }
      if (Math.abs(c.b) > s.side) {
        c.b = Math.sign(c.b) * s.side;
        c.vb = 0;
      }
      c.pivot.rotation.set(c.a, 0, c.b);
    }
  }

  /**
   * X-ray (dev viewer): the body turns see-through and the skeleton the animator drives is drawn
   * over it, so you can see where every limb is under the clothes. Spine and head yellow, the right
   * side red, the left side blue; a dot at every joint.
   */
  private skeleton: { lines: THREE.LineSegments; dots: THREE.InstancedMesh } | null = null;
  enableXray(opacity = 0.3): void {
    for (const m of this.materials) {
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = false;
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SKELETON.length * 6), 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SKELETON.length * 6), 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, linewidth: 2 }));
    lines.renderOrder = 10;
    lines.frustumCulled = false;
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035 * this.scale, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true }), 16);
    dots.renderOrder = 11;
    dots.frustumCulled = false;
    this.root.add(lines, dots);
    this.skeleton = { lines, dots };
  }

  private drawSkeleton(): void {
    const sk = this.skeleton;
    if (!sk) return;
    this.root.updateMatrixWorld(true);
    const joint = (name: SkeletonJoint, out: THREE.Vector3) => {
      const g =
        name === 'pelvis' ? this.hips : name === 'chest' ? this.torso : name === 'head' ? this.head
        : (name.startsWith('armR') ? this.armR : name.startsWith('armL') ? this.armL : name.startsWith('legR') ? this.legR : this.legL)[name.endsWith('.upper') ? 'upper' : name.endsWith('.lower') ? 'lower' : 'end'];
      g.getWorldPosition(out);
      // the chest point sits at the shoulders' height, the head point mid-skull
      if (name === 'chest') out.copy(this.shoulderMid).applyMatrix4(this.torso.matrixWorld);
      if (name === 'head') out.copy(_skA.set(0, 0.12 * this.scale, 0)).applyMatrix4(this.head.matrixWorld);
      return this.root.worldToLocal(out);
    };
    const pos = sk.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = sk.lines.geometry.getAttribute('color') as THREE.BufferAttribute;
    SKELETON.forEach(([a, b, c], i) => {
      joint(a, _skA);
      joint(b, _skB);
      pos.setXYZ(i * 2, _skA.x, _skA.y, _skA.z);
      pos.setXYZ(i * 2 + 1, _skB.x, _skB.y, _skB.z);
      _skC.set(c);
      col.setXYZ(i * 2, _skC.r, _skC.g, _skC.b);
      col.setXYZ(i * 2 + 1, _skC.r, _skC.g, _skC.b);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
    const names: SkeletonJoint[] = ['pelvis', 'chest', 'head', 'armR.upper', 'armR.lower', 'armR.end', 'armL.upper', 'armL.lower', 'armL.end', 'legR.upper', 'legR.lower', 'legR.end', 'legL.upper', 'legL.lower', 'legL.end'];
    names.forEach((n, i) => {
      joint(n, _skA);
      sk.dots.setMatrixAt(i, _skM.makeTranslation(_skA.x, _skA.y, _skA.z));
    });
    sk.dots.count = names.length;
    sk.dots.instanceMatrix.needsUpdate = true;
  }

  setVisible(v: boolean): void {
    this.body.visible = v;
    if (this.chain) this.chain.links.visible = v;
  }

  update(a: AnimInput, dt: number): void {
    const f = this.animator.update(a, dt);
    this.frame = f;
    const p = f.pose;
    const b = p.body;
    this.swingMain = f.swingMain;
    this.swingOff = f.swingOff;
    // lightning crackles along the spear through heavy swings and the special
    const charged = a.state === 'attack' && (isHeavyKey(a.key) || a.key === 'sp');
    this.charged.forEach((m, i) => (m.visible = charged && Math.sin(performance.now() / 21 + i * 2.1) > -0.35));

    // body
    const lying = f.lying;
    // crouches and hops scale with the legs; lying, the hips come down to the floor
    const d = this.d;
    this.hips.position.y = d.hipsY * (1 - lying) + (b.crouch * (1 - lying) + b.lift + 0.14 * lying) * this.legK;
    this.hips.rotation.set(-1.45 * lying, b.hipTwist * (1 - lying) + f.spin, 0);
    // flips and cartwheels turn the whole body about the hips; the legs tuck while inverted
    _euler.set(f.flip, 0, f.roll);
    _acro.setFromEuler(_euler);
    _pivot.set(0, this.hips.position.y, 0);
    this.body.quaternion.copy(_acro);
    this.body.position.copy(_pivot).sub(_pivot.clone().applyQuaternion(_acro));
    const tuck = smooth(Math.min(1, (Math.abs(Math.sin(f.flip / 2)) + Math.abs(Math.sin(f.roll / 2))) * 1.7));
    this.torso.rotation.set(b.lean * (1 - lying * 0.8), b.twist - b.hipTwist, b.side);
    this.head.rotation.set(b.headPitch - b.lean * 0.5, -b.twist * 0.75, -b.side * 0.6);

    // weapons (torso space, carried over to this fighter's reach)
    const mainPos = this.mapTorso(p.main.pos, _mp);
    this.mainPivot.position.copy(mainPos);
    this.mainPivot.quaternion.copy(p.main.quat);
    if (this.weapon.off) {
      if (p.off) {
        this.mapTorso(p.off.pos, this.offPivot.position);
        this.offPivot.quaternion.copy(p.off.quat);
      } else {
        this.mapTorso(p.free, this.offPivot.position);
        this.offPivot.quaternion.identity();
      }
    }

    // weapons stop at the ground instead of sinking into it (not mid-flip, where "down" moves)
    // a chain weapon flies out along its line as the blow lands, and is reeled back in after
    if (this.chain) {
      this.chainOut += (f.extend * this.chainLen - this.chainOut) * Math.min(1, dt * 22);
      this.weapon.main.position.z = this.chainOut;
    }
    if (lying < 0.5 && tuck < 0.2) this.keepAboveGround(mainPos, p.main.quat);
    this.mainPivot.quaternion.copy(p.main.quat);

    // arms: right hand to the grip, left to the off item, the free spot or its grip on the shaft;
    // if a hand can't quite reach, the weapon comes to the hand
    this.keepOutOfHead(mainPos);
    this.mainPivot.position.copy(mainPos);
    _rh.copy(mainPos);
    this.mapTorso(p.off ? p.off.pos : p.free, _lh);
    if (p.main.hold2 > 0.001) {
      _dir.set(0, 0, 1).applyQuaternion(p.main.quat);
      _lh.lerp(_grip.copy(mainPos).addScaledVector(_dir, p.main.grip2), p.main.hold2);
    }
    this.reach(this.armR, d.shoulderR, _rh, ELBOW_POLE_R, _v);
    _w.subVectors(_v, _rh);
    if (_w.lengthSq() > 1e-8) {
      this.mainPivot.position.add(_w);
      _lh.addScaledVector(_w, p.main.hold2);
    }
    // and swing past the head rather than through it, from where the hand really holds it (an
    // overhead grip out of reach brings the weapon down to the hand, often into the helm)
    if (!this.chain && this.keepClearOfHead(this.mainPivot.position, p.main.quat)) {
      this.mainPivot.quaternion.copy(p.main.quat);
      if (p.main.hold2 > 0.001) {
        this.mapTorso(p.off ? p.off.pos : p.free, _lh);
        _dir.set(0, 0, 1).applyQuaternion(p.main.quat);
        _lh.lerp(_grip.copy(this.mainPivot.position).addScaledVector(_dir, p.main.grip2), p.main.hold2);
      }
    }
    this.handAlign(this.armR, this.mainPivot.quaternion, 1);
    this.reach(this.armL, d.shoulderL, _lh, ELBOW_POLE_L, _v);
    if (p.off && this.weapon.off && p.main.hold2 < 0.5) {
      _w.subVectors(_v, _lh);
      this.offPivot.position.add(_w);
      this.handAlign(this.armL, this.offPivot.quaternion, 1);
    } else this.handAlign(this.armL, this.mainPivot.quaternion, p.main.hold2);

    // legs: ankles to the foot targets (given in the root frame)
    this.hips.updateMatrix();
    this.body.updateMatrix();
    _m.copy(this.hips.matrix).invert();
    _bodyInv.copy(this.body.matrix).invert();
    const legs = [
      [this.legR, d.hipR, KNEE_POLE_R, f.feet.R, -1],
      [this.legL, d.hipL, KNEE_POLE_L, f.feet.L, 1],
    ] as const;
    // the wraith floats: no legs to place
    for (const [leg, hip, pole, foot, side] of d.hasLegs ? legs : []) {
      this.mapFoot(foot, _v);
      // a kicking foot follows the kick's path
      const kickW = f.kick && f.kick.foot === (side === 1 ? 'L' : 'R') ? f.kick.w : 0;
      if (kickW > 0) _v.lerp(this.mapFoot(f.kick!.pos, _kick), kickW);
      // spins carry the stance around with them; flips carry it into the body's frame
      _v.applyAxisAngle(UP, f.spin).applyMatrix4(_bodyInv);
      if (tuck > 0 && kickW < 0.5) _v.lerp(_kick.copy(side === 1 ? TUCK_L : TUCK_R).multiplyScalar(this.legK), tuck);
      _v.applyMatrix4(_m);
      solveTwoBone(hip, _v, pole, d.thigh, d.shin, leg.upper.quaternion, leg.lower.quaternion);
      // feet flat, rear foot turned out a little
      const rear = (side === 1) === (b.front === 'R');
      _yaw.setFromAxisAngle(UP, f.spin + side * (rear ? 0.45 : 0.12));
      _qa.copy(this.hips.quaternion).invert().multiply(_yaw);
      _qb.copy(leg.upper.quaternion).multiply(leg.lower.quaternion).invert();
      leg.end.quaternion.copy(_qb).multiply(_qa);
      if (lying > 0) {
        // lying: legs straighten out along the body
        leg.upper.quaternion.slerp(_qc.setFromAxisAngle(X_AXIS, side * 0.12 - 0.1), lying);
        leg.lower.quaternion.slerp(_qc.setFromAxisAngle(X_AXIS, 0.25 + side * 0.1), lying);
        leg.end.quaternion.slerp(_ident, lying);
      }
    }

    // dodges leave a cold, glowing trail of afterimages
    this.dodging = a.state === 'dodge' && a.elapsed < Math.max(160, a.dur * 0.8);
    this.updateGhosts(f.ghost || this.dodging, dt);
    this.updateSmears(dt);
    this.stepCloth(dt);
    this.stepChain(dt);
    this.drawSkeleton();

    // hit flash / perilous telegraph / buff glow
    this.flashT = Math.max(0, this.flashT - dt * 8);
    const glow = a.buff ? 0.35 + Math.sin(performance.now() / 90) * 0.15 : 0;
    // an unblockable attack: the whole body pulses red through the windup, brightest as it lands
    const peril = a.state === 'attack' && !!a.attack?.perilous && a.elapsed < a.windup;
    const pk = peril ? 0.12 + 0.32 * (a.elapsed / Math.max(1, a.windup)) + Math.sin(performance.now() / 45) * 0.08 : 0;
    for (const m of this.materials) {
      if (this.flashT > 0) {
        m.emissive.copy(this.flashColor).multiplyScalar(this.flashT);
      } else if (pk > 0) {
        m.emissive.setRGB(pk, pk * 0.1, pk * 0.06);
      } else if (glow > 0) {
        m.emissive.setRGB(glow, glow * 0.15, 0);
      } else {
        m.emissive.copy(m.userData.baseEmissive as THREE.Color);
      }
    }
  }

  /** Leave fading afterimages behind while a move asks for them (dashes, flips, blinks). */
  private updateGhosts(emit: boolean, dt: number): void {
    this.ghostT -= dt;
    if (emit && this.ghostsEnabled && this.ghostT <= 0 && this.root.parent && this.body.visible) {
      this.ghostT = 0.045;
      this.spawnGhost();
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life -= dt;
      g.mat.opacity = Math.max(0, (g.life / GHOST_LIFE) * 0.45);
      if (g.life <= 0) {
        g.group.parent?.remove(g.group);
        g.mat.dispose();
        this.ghosts.splice(i, 1);
      }
    }
  }

  /**
   * Smear frames: when a swing moves the weapon further in one frame than the eye can follow, fill
   * the gap with a few fading copies between where it was and where it is, like the stretched
   * in-between of a hand-drawn swing.
   */
  private updateSmears(dt: number): void {
    for (let i = this.smears.length - 1; i >= 0; i--) {
      const g = this.smears[i];
      g.life -= dt;
      g.mat.opacity = Math.max(0, (g.life / SMEAR_LIFE) * this.smearAlpha);
      if (g.life <= 0) {
        g.group.parent?.remove(g.group);
        g.mat.dispose();
        this.smears.splice(i, 1);
      }
    }
    if (!this.root.parent || !this.body.visible || !this.smearsEnabled) {
      this.smearPrev.ok = false;
      return;
    }
    const prev = this.smearPrev;
    for (const which of ['main', 'off'] as const) {
      const g = which === 'main' ? this.weapon.main : this.weapon.off;
      const tipObj = which === 'main' ? this.weapon.tip : this.weapon.offTip;
      if (!g || !tipObj) continue;
      g.updateWorldMatrix(true, true);
      const tip = tipObj.getWorldPosition(_sv);
      const lastTip = which === 'main' ? prev.tipMain : prev.tipOff;
      const lastM = which === 'main' ? prev.main : prev.off;
      const swinging = which === 'main' ? this.swingMain : this.swingOff;
      const moved = tip.distanceTo(lastTip);
      if (prev.ok && swinging && moved > SMEAR_MIN && moved < 3) this.spawnSmear(g, lastM, Math.min(3, Math.ceil(moved / 0.22)));
      lastTip.copy(tip);
      lastM.copy(g.matrixWorld);
    }
    prev.ok = true;
  }

  private spawnSmear(g: THREE.Object3D, from: THREE.Matrix4, n: number): void {
    while (this.smears.length > 6) {
      const old = this.smears.shift()!;
      old.group.parent?.remove(old.group);
      old.mat.dispose();
    }
    const mat = new THREE.MeshBasicMaterial({ color: this.animator.style.trail.light, transparent: true, opacity: this.smearAlpha, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const group = new THREE.Group();
    from.decompose(_sp0, _sq0, _ss0);
    g.matrixWorld.decompose(_sp1, _sq1, _ss1);
    _sinv.copy(g.matrixWorld).invert();
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      _sm.compose(_sp0.clone().lerp(_sp1, t), _sq0.clone().slerp(_sq1, t), _ss1);
      g.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.visible) return;
        const m = new THREE.Mesh(o.geometry, mat);
        m.matrixAutoUpdate = false;
        // the mesh's place on the weapon, carried to the in-between weapon transform
        m.matrix.multiplyMatrices(_sm, _srel.multiplyMatrices(_sinv, o.matrixWorld));
        m.layers.set(FX_LAYER);
        group.add(m);
      });
    }
    this.root.parent!.add(group);
    this.smears.push({ group, mat, life: SMEAR_LIFE });
  }

  /** A frozen, translucent copy of the fighter as it is right now. */
  private spawnGhost(): void {
    if (this.ghosts.length >= 8) {
      const old = this.ghosts.shift()!;
      old.group.parent?.remove(old.group);
      old.mat.dispose();
    }
    this.root.updateMatrixWorld(true);
    const mat = new THREE.MeshBasicMaterial({
      color: this.ghostColor,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const group = new THREE.Group();
    this.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.visible) return;
      const m = new THREE.Mesh(o.geometry, mat);
      m.matrixAutoUpdate = false;
      m.matrix.copy(o.matrixWorld);
      m.layers.set(FX_LAYER);
      group.add(m);
    });
    this.root.parent!.add(group);
    this.ghosts.push({ group, mat, life: GHOST_LIFE });
  }

  /** Smears of big weapons (the hammer head) cover a lot of screen: keep them fainter. */
  private get smearAlpha(): number {
    return this.char.weaponKind === 'greathammer' ? SMEAR_ALPHA * 0.5 : SMEAR_ALPHA;
  }

  /** Colour of this fighter's afterimages. */
  get ghostColor(): string {
    return this.dodging ? '#bfe6ff' : this.animator.style.trail.heavy;
  }

  /** World transform of a foot (for kick trails). */
  footXf(which: 'L' | 'R', pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3): void {
    const g = (which === 'L' ? this.legL : this.legR).end;
    g.updateWorldMatrix(true, false);
    g.matrixWorld.decompose(pos, quat, scale);
  }

  /**
   * If the weapon's head or tip would end up below the floor, pivot it up about the grip until it
   * rests on the ground (slams thud into the dirt, sweeps skim it).
   */
  /**
   * Turn the weapon about the grip, as little as it takes, so the line from its butt to its tip
   * misses the head. Overhead raises are written for the reference body, and a big helm or a head
   * set forward would otherwise have the haft run straight through it.
   */
  private keepClearOfHead(grip: THREE.Vector3, quat: THREE.Quaternion): boolean {
    const c = this.d.headCenter;
    // distances are measured in the head's own proportions: 1 is its surface (plus the haft's girth)
    const h = _hh.copy(this.d.headHalf).addScalar(0.03);
    _w.subVectors(c, grip);
    const g = _hg.subVectors(grip, c).divide(h);
    if (g.length() < 1) return false;
    const z0 = -0.3;
    const z1 = Math.max(this.trailMain.base.z, this.trailMain.tip.z);
    const miss = (q: THREE.Quaternion) => {
      const dd = _down.set(0, 0, 1).applyQuaternion(q).divide(h);
      const t = Math.min(z1, Math.max(z0, -g.dot(dd) / dd.lengthSq()));
      return _v.copy(g).addScaledVector(dd, t).length();
    };
    if (miss(quat) >= 1) return false;
    _down.set(0, 0, 1).applyQuaternion(quat);
    // turning the weapon about this axis carries it away from the head
    const axis = _dir.crossVectors(_w, _down);
    if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
    const ax = axis.normalize().clone();
    let lo = 0;
    let hi = 1.2;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      _qc.setFromAxisAngle(ax, mid).multiply(quat);
      if (miss(_qc) < 1) lo = mid;
      else hi = mid;
    }
    quat.premultiply(_qc.setFromAxisAngle(ax, hi));
    return true;
  }

  /** Move a torso-space hand target out of the head, if it's inside it. */
  private keepOutOfHead(p: THREE.Vector3): void {
    const h = _hh.copy(this.d.headHalf).addScalar(0.05);
    const g = _hg.subVectors(p, this.d.headCenter).divide(h);
    const l = g.length();
    if (l >= 1) return;
    // straight out the front if it's dead centre
    if (l < 1e-4) g.set(0, 0, 1);
    else g.divideScalar(l);
    p.copy(g.multiply(h)).add(this.d.headCenter);
  }

  private keepAboveGround(grip: THREE.Vector3, quat: THREE.Quaternion): void {
    this.hips.updateMatrix();
    this.torso.updateMatrix();
    _m.multiplyMatrices(this.hips.matrix, this.torso.matrix);
    const e = _m.elements;
    // height (root frame) of a torso-space point
    const height = (v: THREE.Vector3) => e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13];
    const floor = this.char.weaponKind === 'greathammer' ? 0.22 : 0.05;
    const lowest = (q: THREE.Quaternion) => {
      let h = Infinity;
      for (const pt of [this.trailMain.base, this.trailMain.tip]) h = Math.min(h, height(_v.copy(pt).setZ(pt.z + this.chainOut).applyQuaternion(q).add(grip)));
      return h;
    };
    if (lowest(quat) >= floor) return;
    // rotate toward torso-space "up" (the root's +Y seen from the torso)
    _w.set(e[1], e[5], e[9]).normalize();
    _down.set(0, 0, 1).applyQuaternion(quat);
    const axis = _v.crossVectors(_down, _w);
    if (axis.lengthSq() < 1e-8) return;
    axis.normalize();
    const ax = axis.clone();
    let lo = 0;
    let hi = Math.PI * 0.6;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      _qc.setFromAxisAngle(ax, mid).multiply(quat);
      if (lowest(_qc) < floor) lo = mid;
      else hi = mid;
    }
    quat.premultiply(_qc.setFromAxisAngle(ax, hi));
  }

  /** IK an arm to a torso-space target; writes where the hand actually got to. */
  private reach(arm: Limb, shoulder: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, out: THREE.Vector3): void {
    const d = this.d;
    solveTwoBone(shoulder, target, pole, d.upperArm, d.forearm, arm.upper.quaternion, arm.lower.quaternion);
    _qa.copy(arm.upper.quaternion).multiply(arm.lower.quaternion);
    out.copy(_down.set(0, -d.forearm, 0).applyQuaternion(_qa));
    out.add(_down.set(0, -d.upperArm, 0).applyQuaternion(arm.upper.quaternion)).add(shoulder);
  }

  /** Turn the fist to match what it holds (k blends from following the forearm). */
  private handAlign(arm: Limb, held: THREE.Quaternion, k: number): void {
    _qa.copy(arm.upper.quaternion).multiply(arm.lower.quaternion).invert().multiply(held);
    arm.end.quaternion.identity().slerp(_qa, Math.max(0, Math.min(1, k)));
  }

  /** World transform of a weapon (for trails). */
  weaponXf(which: 'main' | 'off', pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3): boolean {
    const g = which === 'main' ? this.weapon.main : this.weapon.off;
    if (!g) return false;
    g.updateWorldMatrix(true, false);
    g.matrixWorld.decompose(pos, quat, scale);
    return true;
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
    for (const g of [...this.ghosts, ...this.smears]) {
      g.group.parent?.remove(g.group);
      g.mat.dispose();
    }
    this.ghosts = [];
    this.smears = [];
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
