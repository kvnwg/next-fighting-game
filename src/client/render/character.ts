/**
 * Blocky placeholder fighters with fully procedural animation. The Animator decides where the
 * weapon is and how the body moves each frame (from the combat state, so animations always line up
 * with the gameplay timings the server uses); this file builds the rig and fits the limbs to that
 * with IK: hands reach for the grips, feet stay planted where they're put.
 */
import * as THREE from 'three';
import { CHARACTERS, CharacterDef, CharacterId } from '../../shared/characters';
import { AnimFrame, AnimInput, Animator, Reaction, handTargets } from './anim/animator';
import { smooth, solveTwoBone } from './anim/math';
import { CHAR_LAYER, FX_LAYER } from './renderer';
import { charRamp } from './textures';
import { WeaponParts, buildWeapon } from './weapons';

export type { AnimFrame, AnimInput, Reaction };

const UPPER_ARM = 0.29;
const FOREARM = 0.27;
const THIGH = 0.43;
const SHIN = 0.42;
const HIPS_Y = 0.92;
const SHOULDER_R = new THREE.Vector3(-0.33, 0.5, 0);
const SHOULDER_L = new THREE.Vector3(0.33, 0.5, 0);
// elbows bend out, down and back
const ELBOW_POLE_R = new THREE.Vector3(-0.7, -0.55, -0.45).normalize();
const ELBOW_POLE_L = new THREE.Vector3(0.7, -0.55, -0.45).normalize();
const HIP_R = new THREE.Vector3(-0.12, -0.02, 0);
const HIP_L = new THREE.Vector3(0.12, -0.02, 0);
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
  private readonly mainPivot = new THREE.Group();
  private readonly offPivot = new THREE.Group();
  private readonly materials: THREE.MeshToonMaterial[] = [];
  private flashT = 0;
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

  constructor(charId: CharacterId) {
    this.char = CHARACTERS[charId];
    this.animator = new Animator(this.char);
    const pal = this.char.palette;
    const mat = (color: string, emissive?: string) => {
      const m = new THREE.MeshToonMaterial({ color, gradientMap: charRamp() });
      // a little self-light in the outfit's own colour keeps the shadow side from taking on the
      // world's (often warm) light, so fighters keep their identity against the scenery
      const base = emissive ? new THREE.Color(emissive) : new THREE.Color(color).multiplyScalar(0.22);
      m.emissive.copy(base);
      m.userData.baseEmissive = base;
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
    const hips = (this.hips = g(this.body, 0, HIPS_Y, 0));
    hips.rotation.order = 'YXZ';
    const torso = (this.torso = g(hips, 0, 0.06, 0));
    torso.rotation.order = 'YXZ';
    const head = (this.head = g(torso, 0, 0.6, 0));
    head.rotation.order = 'YXZ';
    const limb = (parent: THREE.Object3D, at: THREE.Vector3, l1: number, l2: number): Limb => {
      const upper = g(parent, at.x, at.y, at.z);
      const lower = g(upper, 0, -l1, 0);
      const end = g(lower, 0, -l2, 0);
      return { upper, lower, end };
    };
    this.armR = limb(torso, SHOULDER_R, UPPER_ARM, FOREARM);
    this.armL = limb(torso, SHOULDER_L, UPPER_ARM, FOREARM);
    this.legR = limb(hips, HIP_R, THIGH, SHIN);
    this.legL = limb(hips, HIP_L, THIGH, SHIN);

    // body
    box(sec, 0.42, 0.18, 0.27, 0, 0, 0, hips);
    box(prim, 0.5, 0.5, 0.3, 0, 0.3, 0, torso);
    box(acc, 0.52, 0.08, 0.32, 0, 0.08, 0, torso); // belt / sash
    box(skin, 0.36, 0.36, 0.34, 0, 0.2, 0, head);
    box(dark, 0.06, 0.06, 0.02, -0.08, 0.22, 0.175, head);
    box(dark, 0.06, 0.06, 0.02, 0.08, 0.22, 0.175, head);
    const fists: THREE.Mesh[] = [];
    for (const arm of [this.armR, this.armL]) {
      box(prim, 0.16, 0.3, 0.16, 0, -0.13, 0, arm.upper);
      box(skin, 0.14, 0.27, 0.14, 0, -0.13, 0, arm.lower);
      fists.push(box(skin, 0.13, 0.13, 0.13, 0, 0, 0, arm.end));
    }
    for (const leg of [this.legR, this.legL]) {
      box(sec, 0.18, 0.43, 0.2, 0, -0.21, 0, leg.upper);
      box(sec, 0.17, 0.42, 0.19, 0, -0.2, 0, leg.lower);
      box(dark, 0.19, 0.08, 0.28, 0, 0, 0.04, leg.end); // foot, kept flat on the ground
    }
    this.headgear(head, torso, { prim, sec, acc, hair, dark, skin, mat }, box);

    // weapons are carried by the torso and the hands reach for them
    this.weapon = buildWeapon(this.char, mat);
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
    if (this.weapon.hideHands) for (const f of fists) f.visible = false;

    this.scale = this.char.id === 'juggernaut' ? 1.15 : this.char.id === 'shade' ? 0.95 : 1;
    this.root.scale.setScalar(this.scale);
    // fighters get the ink outline and rim light in the composite pass
    this.root.traverse((o) => o.layers.enable(CHAR_LAYER));
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
        const straw = m.mat('#ead4aa');
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

  setVisible(v: boolean): void {
    this.body.visible = v;
  }

  update(a: AnimInput, dt: number): void {
    const f = this.animator.update(a, dt);
    this.frame = f;
    const p = f.pose;
    const b = p.body;
    this.swingMain = f.swingMain;
    this.swingOff = f.swingOff;

    // body
    const lying = f.lying;
    this.hips.position.y = HIPS_Y + b.crouch * (1 - lying) + b.lift - 0.78 * lying;
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

    // weapons (torso space)
    this.mainPivot.position.copy(p.main.pos);
    this.mainPivot.quaternion.copy(p.main.quat);
    if (this.weapon.off) {
      if (p.off) {
        this.offPivot.position.copy(p.off.pos);
        this.offPivot.quaternion.copy(p.off.quat);
      } else {
        this.offPivot.position.copy(p.free);
        this.offPivot.quaternion.identity();
      }
    }

    // weapons stop at the ground instead of sinking into it (not mid-flip, where "down" moves)
    if (lying < 0.5 && tuck < 0.2) this.keepAboveGround(p.main.pos, p.main.quat);
    this.mainPivot.quaternion.copy(p.main.quat);

    // arms: right hand to the grip; if it can't quite reach, the weapon comes to the hand
    handTargets(p, _rh, _lh);
    this.reach(this.armR, SHOULDER_R, _rh, ELBOW_POLE_R, _v);
    _w.subVectors(_v, _rh);
    if (_w.lengthSq() > 1e-8) {
      this.mainPivot.position.add(_w);
      _lh.addScaledVector(_w, p.main.hold2);
    }
    this.handAlign(this.armR, this.mainPivot.quaternion, 1);
    this.reach(this.armL, SHOULDER_L, _lh, ELBOW_POLE_L, _v);
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
    for (const [leg, hip, pole, foot, side] of [
      [this.legR, HIP_R, KNEE_POLE_R, f.feet.R, -1],
      [this.legL, HIP_L, KNEE_POLE_L, f.feet.L, 1],
    ] as const) {
      _v.copy(foot);
      // a kicking foot follows the kick's path
      const kickW = f.kick && f.kick.foot === (side === 1 ? 'L' : 'R') ? f.kick.w : 0;
      if (kickW > 0) _v.lerp(f.kick!.pos, kickW);
      // spins carry the stance around with them; flips carry it into the body's frame
      _v.applyAxisAngle(UP, f.spin).applyMatrix4(_bodyInv);
      if (tuck > 0 && kickW < 0.5) _v.lerp(side === 1 ? TUCK_L : TUCK_R, tuck);
      _v.applyMatrix4(_m);
      solveTwoBone(hip, _v, pole, THIGH, SHIN, leg.upper.quaternion, leg.lower.quaternion);
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

    this.updateGhosts(f.ghost, dt);
    this.updateSmears(dt);

    // hit flash / buff glow
    this.flashT = Math.max(0, this.flashT - dt * 8);
    const glow = a.buff ? 0.35 + Math.sin(performance.now() / 90) * 0.15 : 0;
    for (const m of this.materials) {
      if (this.flashT > 0) {
        m.emissive.copy(this.flashColor).multiplyScalar(this.flashT);
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
    return this.animator.style.trail.heavy;
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
      for (const pt of [this.trailMain.base, this.trailMain.tip]) h = Math.min(h, height(_v.copy(pt).applyQuaternion(q).add(grip)));
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
    solveTwoBone(shoulder, target, pole, UPPER_ARM, FOREARM, arm.upper.quaternion, arm.lower.quaternion);
    _qa.copy(arm.upper.quaternion).multiply(arm.lower.quaternion);
    out.copy(_down.set(0, -FOREARM, 0).applyQuaternion(_qa));
    out.add(_down.set(0, -UPPER_ARM, 0).applyQuaternion(arm.upper.quaternion)).add(shoulder);
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
