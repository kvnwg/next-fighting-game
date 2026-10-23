/**
 * The Ronin of the title screen: his voxel model on a rig of its own, sitting at the edge of the
 * cliff with his legs over the drop and his hands on his knees. His robe pools around him, a long
 * scarf streams off his collar and his hair lifts in the wind, all moved by a cloth shader that
 * shares the world's wind (and gusts harder when the title screen asks it to). He can turn his
 * head to the camera, rise to his feet and set his hand on his sword.
 */
import * as THREE from 'three';
import { buildRonin, palette as RONIN } from '../../../characters/ronin/model.js';
import { bindGlobals } from '../render/gfx/globals';
import { litMaterial } from '../render/gfx/materials';
import { VOXEL } from '../render/voxel/mesh';
import { voxelModel } from '../render/voxel/fighters';

/** How hard the wind tugs at the cloth beyond its usual gusting (0 = calm, 1 = a strong gust). */
export const clothGust = { value: 0 };

const CLOTH_GLSL = /* glsl */ `
uniform float uGust;
// v.x: how free this point is (0 where the cloth is held), v.y: metres along the cloth from there
vec3 clothWind(vec3 wp, vec2 v, float phase) {
  if (v.x <= 0.0) return vec3(0.0);
  vec2 dir = uWind.xy;
  float t = uTime;
  float s = v.y;
  float g = 1.0 + uGust * 1.8 + 0.3 * sin(t * 0.9) * sin(t * 0.37 + 1.0);
  // waves rolling down the cloth, quicker when the wind is up
  float w1 = sin(s * 5.0 - t * (5.0 + uGust * 4.0) + phase);
  float w2 = sin(s * 11.0 - t * (8.5 + uGust * 5.0) + phase * 1.3 + 0.7);
  float w3 = sin(s * 23.0 - t * 14.0 + phase * 2.1);
  vec3 along = vec3(dir.x, 0.0, dir.y);
  vec3 side = vec3(-dir.y, 0.0, dir.x);
  vec3 d = along * (0.12 + 0.06 * w2) * g;
  d.y += (w1 * 0.13 + w2 * 0.05 + w3 * 0.015) * g;
  d += side * (w1 * 0.07 + w3 * 0.02) * g;
  return d * v.x;
}
`;

const clothMats = new Map<string, THREE.MeshLambertMaterial>();

/** The voxel material with the wind swapped for the cloth's travelling waves. */
function clothMaterial(ao: boolean): THREE.MeshLambertMaterial {
  const key = ao ? 'ao' : 'plain';
  const hit = clothMats.get(key);
  if (hit) return hit;
  const m = litMaterial({ vertexColors: true, rim: true, sway: true, ao });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    base.call(m, shader, r);
    bindGlobals(shader.uniforms);
    shader.uniforms.uGust = clothGust;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${CLOTH_GLSL}\nvoid main() {`)
      .replace('voxWorld.xyz += voxWind(voxWorld.xyz, aVox.x, voxPhase);', 'voxWorld.xyz += clothWind(voxWorld.xyz, aVox, voxPhase);');
  };
  m.customProgramCacheKey = () => `title-cloth:${key}`;
  clothMats.set(key, m);
  return m;
}

let bodyMat: THREE.MeshLambertMaterial | null = null;
function bodyMaterial(): THREE.MeshLambertMaterial {
  bodyMat ??= litMaterial({ vertexColors: true, rim: true });
  return bodyMat;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x * VOXEL, y * VOXEL, z * VOXEL);
const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * The robe skirt, re-draped for sitting: the front lies over the thighs, the back pools on the
 * ground behind him, and the hem is free to ripple. Positions are relative to the pelvis pivot.
 */
function drapeSkirt(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = src.clone();
  // the robe as it hangs standing, to blend back to as he rises
  geo.morphAttributes.position = [src.attributes.position.clone()];
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const vox = new Float32Array(pos.count * 2);
  const HIP = 37 - 38; // voxel height (relative to the pelvis pivot) where the skirt starts to fall
  const SEAT = 31 - 38; // the ground under him
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / VOXEL;
    const y = pos.getY(i) / VOXEL;
    const z = pos.getZ(i) / VOXEL;
    const drop = HIP - y;
    if (drop <= 0) continue;
    // front: swing forward over the thighs, about the hip
    const fy = HIP + z * 0.95 + 1.2;
    const fz = drop * 0.98 + 1.5;
    // back and sides: fall to the seat, then spread out over the ground
    const r = Math.hypot(x, z) || 1;
    const under = Math.max(0, SEAT + 0.6 - y);
    const by = Math.max(y, SEAT + 0.6 + (x * 7.3 + z * 3.1 - Math.floor(x * 7.3 + z * 3.1)) * 0.4);
    const bx = x + (x / r) * under * 0.9;
    const bz = z + (z / r) * under * 0.9 - under * 0.25;
    const f = THREE.MathUtils.smoothstep(z, -1, 5.5) * THREE.MathUtils.smoothstep(Math.abs(x), 12, 5);
    pos.setXYZ(i, THREE.MathUtils.lerp(bx, x, f) * VOXEL, THREE.MathUtils.lerp(by, fy, f) * VOXEL, THREE.MathUtils.lerp(bz, fz, f) * VOXEL);
    // the hem lifts and ripples; where it lies on the ground it barely stirs
    const free = clamp01(drop / 16);
    vox[i * 2] = free * free * (0.25 - f * 0.12) * (under > 2 ? 0.5 : 1);
    vox[i * 2 + 1] = drop * VOXEL;
  }
  geo.setAttribute('aVox', new THREE.BufferAttribute(vox, 2));
  geo.computeBoundingSphere();
  return geo;
}

/** Long hair and the loose strands lift in the wind; the cap over the skull stays put. */
function looseHair(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = src.clone();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const vox = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    // hair pivot is at (0, 66, -5)
    const y = pos.getY(i) / VOXEL + 66;
    const x = pos.getX(i) / VOXEL;
    const below = 63 - y;
    const strand = Math.abs(x) > 6 ? 1 : 0;
    const free = clamp01(below / 16) + strand * 0.4;
    vox[i * 2] = Math.min(0.32, free * 0.28);
    vox[i * 2 + 1] = Math.max(0, below) * VOXEL + strand * 0.1;
  }
  geo.setAttribute('aVox', new THREE.BufferAttribute(vox, 2));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * A long scarf from the back of his collar, streaming downwind: one solid strip along a curve in
 * the torso's frame (not loose voxels, which the cloth waves would pull apart into holes), in
 * blocky bands of colour, with a darker trim along its edges and a frayed end. The cloth shader
 * sends waves rolling down it.
 */
function scarfRibbon(windLocal: THREE.Vector3): THREE.BufferGeometry {
  const anchor = new THREE.Vector3(2, 59.5 - 41, -5.5); // torso pivot is (0, 41, 0)
  // off the back of the collar, up over his left shoulder, then away downwind
  const back = new THREE.Vector3(0.85, 0.32, 0.12).normalize();
  const down = new THREE.Vector3(windLocal.x, -0.22, windLocal.z).normalize();
  const steps = 92;
  const pts: THREE.Vector3[] = [];
  const p = anchor.clone();
  for (let k = 0; k <= steps; k++) {
    pts.push(p.clone());
    const t = k / steps;
    const dir = back.clone().lerp(down, ease(clamp01(t * 3.2))).normalize();
    // a lazy S along its length
    dir.y += Math.sin(t * 7) * 0.12;
    p.addScaledVector(dir.normalize(), 1);
  }
  // a frame at each point: across the scarf, and through it
  const frames = pts.map((c, k) => {
    const dir = (pts[k + 1] ?? c).clone().sub(pts[k - 1] ?? c).normalize();
    // the scarf's width leans toward upright, so it shows its face from the side and its waves from behind
    const flat = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
    const side = flat.lerp(up, 0.65).normalize();
    const through = new THREE.Vector3().crossVectors(dir, side).normalize();
    return { c, side, through };
  });
  // crimson for the title: the one warm note on him, against the sunset
  const scarf = new THREE.Color('#8a1c26');
  const trim = new THREE.Color('#5e121a');
  const fray = new THREE.Color(RONIN.coatFold);
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const ao: number[] = [];
  const vox: number[] = [];
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  const T = 0.35; // half its thickness, in voxels
  // one flat quad: corners as [segment, across (-1..1 of the half width), through (-1, 1)]
  const quad = (q: [number, number, number][], color: THREE.Color, shade: number) => {
    const at = q.map(([k, w, d]) => {
      const f = frames[k];
      const half = 3.4 - (k / steps) * 1.4;
      return f.c.clone().addScaledVector(f.side, w * half).addScaledVector(f.through, d * T).multiplyScalar(VOXEL);
    });
    n.crossVectors(at[1].clone().sub(at[0]), at[2].clone().sub(at[0])).normalize();
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(at[i].x, at[i].y, at[i].z);
      nor.push(n.x, n.y, n.z);
      col.push(color.r * shade, color.g * shade, color.b * shade);
      ao.push(1);
      const s = q[i][0] * VOXEL;
      vox.push(Math.pow(clamp01(s / 1.4), 1.2) * 1.15, s);
    }
  };
  // across: a trim band, the face, a trim band
  const bands = [-1, -0.8, 0.8, 1];
  for (let k = 0; k < steps; k++) {
    const t = k / steps;
    // blocky colour, a band per voxel's length, jittered like the rest of him
    const jit = 0.92 + (((k * 7919) % 97) / 97) * 0.16;
    for (let b = 0; b < 3; b++) {
      const edge = b !== 1;
      c.copy(t > 0.9 ? fray : edge && k % 4 < 2 ? trim : scarf);
      const w0 = bands[b];
      const w1 = bands[b + 1];
      // the frayed end: the threads thin out toward the tip
      if (t > 0.93 && edge && k % 3 === 0) continue;
      quad([[k, w0, 1], [k, w1, 1], [k + 1, w1, 1], [k + 1, w0, 1]], c, jit);
      quad([[k, w1, -1], [k, w0, -1], [k + 1, w0, -1], [k + 1, w1, -1]], c, jit * 0.8);
    }
    // its two edges
    c.copy(t > 0.9 ? fray : trim);
    quad([[k, 1, 1], [k, 1, -1], [k + 1, 1, -1], [k + 1, 1, 1]], c, jit * 0.85);
    quad([[k, -1, -1], [k, -1, 1], [k + 1, -1, 1], [k + 1, -1, -1]], c, jit * 0.85);
  }
  // the end, closed off
  c.copy(fray);
  quad([[steps, -1, 1], [steps, 1, 1], [steps, 1, -1], [steps, -1, -1]], c, 0.8);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  geo.setAttribute('aVox', new THREE.Float32BufferAttribute(vox, 2));
  geo.computeBoundingSphere();
  return geo;
}

interface Arm {
  upper: THREE.Object3D;
  fore: THREE.Object3D;
  hand: THREE.Object3D;
  side: 1 | -1;
  a: number;
  b: number;
}

export class TitleRonin {
  readonly root = new THREE.Group();
  private bones = new Map<string, THREE.Group>();
  private arms: Arm[] = [];
  private skirt: THREE.Mesh | null = null;
  private time = 0;
  /** 0 = gazing at the vista, 1 = looking at the camera */
  look = 0;
  /** 0 = sitting at the edge, 1 = standing */
  stand = 0;
  /** 0..1: right hand to the hilt, left thumb on the guard */
  grip = 0;
  /** where the camera is, for looking at it */
  readonly camPos = new THREE.Vector3();
  private readonly seat = new THREE.Vector3(0, -31 * VOXEL, 0.12);
  private readonly risen = new THREE.Vector3(0, 0, -0.55);

  constructor(windDir: THREE.Vector2) {
    const vm = voxelModel(buildRonin);
    const pivots = new Map(vm.model.bones.map((b) => [b.name, b.pivot]));
    for (const b of vm.model.bones) {
      const g = new THREE.Group();
      g.name = b.name;
      const pv = b.pivot;
      const pp = b.parent ? pivots.get(b.parent)! : [0, 0, 0];
      g.position.copy(v(pv[0] - pp[0], pv[1] - pp[1], pv[2] - pp[2]));
      this.bones.set(b.name, g);
    }
    for (const b of vm.model.bones) {
      const g = this.bones.get(b.name)!;
      (b.parent ? this.bones.get(b.parent)! : this.root).add(g);
      const src = vm.geoms.get(b.name);
      if (!src || b.name === 'scarf') continue;
      const cloth = b.name === 'pelvis' || b.name === 'hair';
      const geo = b.name === 'pelvis' ? drapeSkirt(src) : b.name === 'hair' ? looseHair(src) : src;
      const mesh = new THREE.Mesh(geo, cloth ? clothMaterial(false) : bodyMaterial());
      if (b.name === 'pelvis') this.skirt = mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    // the scarf streams downwind; he faces +Z, so the wind is already in his frame
    const ribbon = new THREE.Mesh(scarfRibbon(new THREE.Vector3(windDir.x, 0, windDir.y).normalize()), clothMaterial(true));
    // the waves carry it well outside the bounds it was built in: never cull it, and leave its
    // shadow out (the shadow pass doesn't move with the cloth, so it would lie still under it)
    ribbon.frustumCulled = false;
    // a thin strip: both faces of each quad are drawn, whichever way it twists
    (ribbon.material as THREE.Material).side = THREE.DoubleSide;
    ribbon.castShadow = false;
    this.bones.get('torso')!.add(ribbon);

    for (const [side, s] of [['L', 1], ['R', -1]] as const) {
      const sp = pivots.get(`upperArm${side}`)!;
      const fp = pivots.get(`forearm${side}`)!;
      const hp = pivots.get(`hand${side}`)!;
      this.arms.push({
        upper: this.bones.get(`upperArm${side}`)!,
        fore: this.bones.get(`forearm${side}`)!,
        hand: this.bones.get(`hand${side}`)!,
        side: s,
        a: Math.abs(fp[0] - sp[0]) * VOXEL,
        b: (Math.abs(hp[0] - fp[0]) + 3) * VOXEL,
      });
    }
    this.root.position.copy(this.seat);
    this.update(0);
  }

  private bone(name: string): THREE.Group {
    return this.bones.get(name)!;
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    const st = ease(clamp01(this.stand));
    const sit = 1 - st;
    const breathe = Math.sin(t * 1.15);

    this.root.position.lerpVectors(this.seat, this.risen, st);
    if (this.skirt?.morphTargetInfluences) this.skirt.morphTargetInfluences[0] = st;
    // rising: a little lift as he pushes up off the ground
    this.root.position.y += Math.sin(st * Math.PI) * 0.06;

    this.bone('pelvis').rotation.set(-0.1 * sit + Math.sin(st * Math.PI) * 0.35, 0, 0);
    for (const [side, s] of [['L', 1], ['R', -1]] as const) {
      const swing = sit * (Math.sin(t * 0.8 + (s > 0 ? 0 : 2.1)) * 0.1 * (s > 0 ? 1 : 0.5));
      this.bone(`thigh${side}`).rotation.set(-1.5 * sit - Math.sin(st * Math.PI) * 0.5, 0, s * 0.07 * sit);
      this.bone(`shin${side}`).rotation.set((1.32 + swing) * sit + Math.sin(st * Math.PI) * 0.6, 0, 0);
    }

    // looking: out over the valley, or round at the camera (head first, the torso following)
    const lookT = ease(clamp01(this.look));
    const local = this.root.worldToLocal(this.camPos.clone());
    const yawToCam = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.9, 1.9);
    const idleYaw = Math.sin(t * 0.21) * 0.18 + Math.sin(t * 0.07) * 0.1;
    const yaw = THREE.MathUtils.lerp(idleYaw, yawToCam, lookT);
    const torso = this.bone('torso');
    torso.rotation.set(0.2 * sit + 0.02 + breathe * 0.012, yaw * 0.3, 0);
    this.bone('head').rotation.set(0.14 * sit - lookT * 0.1 + Math.sin(t * 0.33) * 0.03, yaw * 0.7, Math.sin(t * 0.17) * 0.04 * sit);

    // arms: two-bone IK to where the hands rest
    this.root.updateMatrixWorld(true);
    const grip = ease(clamp01(this.grip));
    for (const arm of this.arms) {
      const side = arm.side > 0 ? 'L' : 'R';
      const knee = this.bone(`thigh${side}`).localToWorld(v(arm.side * 0.5, -12, 6.5));
      const rest = this.bone('pelvis').localToWorld(v(arm.side * 14, -9 + breathe * 0.2, 1.5));
      const target = knee.lerp(rest, st);
      if (grip > 0) {
        const katana = this.bone('katana');
        // right hand on the hilt (a cross draw), left thumb against the guard
        const hold = arm.side < 0 ? katana.localToWorld(v(-1.4, 2.4, 6.4)) : katana.localToWorld(v(0.6, -1.4, -3.6));
        target.lerp(hold, grip);
      }
      this.solveArm(arm, target);
    }
  }

  private solveArm(arm: Arm, target: THREE.Vector3): void {
    const s = arm.upper.getWorldPosition(new THREE.Vector3());
    const toT = target.clone().sub(s);
    const d = THREE.MathUtils.clamp(toT.length(), 0.05, (arm.a + arm.b) * 0.995);
    const dir = toT.normalize();
    // elbows out to the side and a little back
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const pole = new THREE.Vector3(arm.side, -0.4, -0.7).applyQuaternion(rootQ);
    const perp = pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const cosA = THREE.MathUtils.clamp((arm.a * arm.a + d * d - arm.b * arm.b) / (2 * arm.a * d), -1, 1);
    const elbow = s.clone().addScaledVector(dir, arm.a * cosA).addScaledVector(perp, arm.a * Math.sqrt(1 - cosA * cosA));
    const handPos = s.clone().addScaledVector(dir, d);
    const restDir = new THREE.Vector3(arm.side, 0, 0).applyQuaternion(rootQ);

    const parentQ = arm.upper.parent!.getWorldQuaternion(new THREE.Quaternion());
    const upperW = new THREE.Quaternion().setFromUnitVectors(restDir, elbow.clone().sub(s).normalize());
    arm.upper.quaternion.copy(parentQ.clone().invert().multiply(upperW));
    const foreW = new THREE.Quaternion().setFromUnitVectors(restDir, handPos.sub(elbow).normalize());
    arm.fore.quaternion.copy(upperW.clone().invert().multiply(foreW));
    // the hand bends a touch, resting flat rather than pointing
    arm.hand.rotation.set(0, 0, -arm.side * 0.35);
    arm.upper.updateMatrixWorld(true);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      // shared body geometry stays cached for the fighters; only the cloth copies go
      if (m.isMesh && m.geometry.attributes.aVox) m.geometry.dispose();
    });
  }
}
