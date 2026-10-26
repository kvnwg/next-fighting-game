/**
 * Bakes motion clips from a glTF animation library onto our fighters' rig, as a TS module of
 * BakedClips (see src/client/render/anim/author.ts): per sample, the body pose channels and both
 * fists' transforms in torso space.
 *
 * Made for Quaternius' Universal Animation Library 2 (CC0, https://quaternius.com): its mannequin
 * stands almost exactly our height and faces +z with its left at +x, like ours, so heights and legs
 * carry over 1:1; the hands are carried over relative to the shoulders (ours are broader).
 *
 *   npx tsx scripts/bake-anim.ts <library.glb> <out.ts> Clip[:from-to][=NAME] ...
 *
 * e.g. the sword set used by the Paladin:
 *   npx tsx scripts/bake-anim.ts UAL2_Standard.glb src/client/render/anim/moves/baked/sword.ts \
 *     Idle_Shield_Loop:0-0.1=SHIELD_IDLE Sword_Regular_A=SWORD_A Sword_Regular_B=SWORD_B \
 *     Shield_Dash=SHIELD_DASH Sword_Dash=SWORD_DASH
 */
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const FPS = 30;
const OUR_SHOULDER_R = new THREE.Vector3(-0.33, 0.5, 0);
const OUR_SHOULDER_L = new THREE.Vector3(0.33, 0.5, 0);
const UP = new THREE.Vector3(0, 1, 0);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

interface Frame {
  t: number;
  pos(name: string): THREE.Vector3;
  quat(name: string): THREE.Quaternion;
}

/** Plays a clip on the model and snapshots every joint's world transform. */
function sample(model: THREE.Object3D, clip: THREE.AnimationClip, from: number, to: number): Frame[] {
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const out: Frame[] = [];
  const end = Math.min(to, clip.duration);
  for (let i = 0; ; i++) {
    const t = from + i / FPS;
    if (t > end + 1e-6) break;
    mixer.setTime(Math.min(clip.duration - 1e-4, t));
    model.updateMatrixWorld(true);
    const pos = new Map<string, THREE.Vector3>();
    const quat = new Map<string, THREE.Quaternion>();
    model.traverse((o) => {
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      o.matrixWorld.decompose(p, q, new THREE.Vector3());
      pos.set(o.name, p);
      quat.set(o.name, q);
    });
    out.push({ t, pos: (n) => pos.get(n)!.clone(), quat: (n) => quat.get(n)!.clone() });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(model);
  return out;
}

/** The fist's centre (our grip) and its orientation: blade out of the thumb side, edge along the knuckles. */
function fist(f: Frame, side: 'l' | 'r') {
  const wrist = f.pos(`hand_${side}`);
  const idx = f.pos(`index_01_${side}`);
  const pky = f.pos(`pinky_01_${side}`);
  const knuckles = idx.clone().add(pky).multiplyScalar(0.5);
  return { grip: knuckles.clone().lerp(wrist, 0.3), blade: idx.clone().sub(pky).normalize(), punch: knuckles.clone().sub(wrist).normalize() };
}

function bake(frames: Frame[], rest: Frame) {
  const qChest0 = rest.quat('spine_03').invert();
  const qPelvis0 = rest.quat('pelvis').invert();
  const qHead0 = rest.quat('Head').invert();
  const pelvisY0 = rest.pos('pelvis').y;
  const ankleY0 = rest.pos('foot_l').y;
  let prevYaw = 0;
  let unwrap = 0;
  return frames.map((f, k) => {
    const qc = f.quat('spine_03').multiply(qChest0); // our torso's rotation in the world
    const qp = f.quat('pelvis').multiply(qPelvis0);
    const qh = f.quat('Head').multiply(qHead0);
    // the pelvis' heading, unwrapped so whole turns accumulate
    const pf = new THREE.Vector3(0, 0, 1).applyQuaternion(qp);
    let yaw = Math.atan2(pf.x, pf.z);
    if (k > 0) {
      while (yaw + unwrap - prevYaw > Math.PI) unwrap -= Math.PI * 2;
      while (yaw + unwrap - prevYaw < -Math.PI) unwrap += Math.PI * 2;
    }
    yaw += unwrap;
    prevYaw = yaw;
    // the hips twist up to 0.8 rad; beyond that the whole body turns
    const spin = Math.sign(yaw) * Math.max(0, Math.abs(yaw) - 0.8);
    const hipTwist = yaw - spin;
    // our torso is the hips' turn, then pitch (lean), yaw (twist) and roll (side)
    const rel = new THREE.Quaternion().setFromAxisAngle(UP, hipTwist + spin).invert().multiply(qc);
    const e = new THREE.Euler().setFromQuaternion(rel, 'XYZ');
    const lean = e.x;
    const twist = e.y + hipTwist;
    const side = e.z;
    // our head counter-pitches half the lean
    const he = new THREE.Euler().setFromQuaternion(qc.clone().invert().multiply(qh), 'XYZ');
    const headPitch = he.x + lean * 0.5;
    // feet relative to the pelvis, in the (spun) root frame
    const pel = f.pos('pelvis');
    const unspin = new THREE.Quaternion().setFromAxisAngle(UP, -spin);
    const fl = f.pos('foot_l').sub(pel).applyQuaternion(unspin);
    const fr = f.pos('foot_r').sub(pel).applyQuaternion(unspin);
    const lFront = fl.z >= fr.z;
    const step = lFront ? fl.z : fr.z;
    const back = -(lFront ? fr.z : fl.z);
    const width = Math.min(0.35, Math.max(0.04, (fl.x - fr.x) / 2));
    const lift = Math.max(0, Math.min(f.pos('foot_l').y, f.pos('foot_r').y) - ankleY0 - 0.02);
    const crouch = pel.y - lift - pelvisY0;
    // fists, shoulder-relative, in the chest frame
    const inv = qc.clone().invert();
    const R = fist(f, 'r');
    const L = fist(f, 'l');
    const v = (x: THREE.Vector3) => [x.x, x.y, x.z].map(r3);
    return {
      body: [crouch, lean, twist, side, hipTwist, headPitch, step, back, width, lift, lFront ? 1 : -1, spin / (Math.PI * 2)].map(r3),
      main: [...v(R.grip.sub(f.pos('upperarm_r')).applyQuaternion(inv).add(OUR_SHOULDER_R)), ...v(R.blade.applyQuaternion(inv)), ...v(R.punch.applyQuaternion(inv))],
      free: [...v(L.grip.sub(f.pos('upperarm_l')).applyQuaternion(inv).add(OUR_SHOULDER_L)), ...v(L.blade.applyQuaternion(inv)), ...v(L.punch.applyQuaternion(inv))],
    };
  });
}

const [glb, out, ...specs] = process.argv.slice(2);
if (!glb || !out || !specs.length) {
  console.error('usage: npx tsx scripts/bake-anim.ts <library.glb> <out.ts> Clip[:from-to][=NAME] ...');
  process.exit(1);
}
const buf = fs.readFileSync(glb);
new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (gltf) => {
  const clip = (name: string) => {
    const c = gltf.animations.find((a) => a.name === name);
    if (!c) throw new Error(`no clip ${name}; the library has: ${gltf.animations.map((a) => a.name).join(', ')}`);
    return c;
  };
  // calibration: in the T-pose the chest, pelvis and head face straight ahead
  const rest = sample(gltf.scene, clip('A_TPose'), 0, 0)[0];
  let src = `/**\n * Baked from Quaternius' Universal Animation Library 2 (CC0 1.0, public domain) by\n * scripts/bake-anim.ts: body channels, the right fist (weapon) and the left fist, in our torso space\n * at ${FPS} fps. Regenerate rather than edit by hand.\n */\nimport type { BakedClip } from '../../author';\n\n`;
  for (const spec of specs) {
    const m = spec.match(/^([^:=]+)(?::([\d.]+)-([\d.]+))?(?:=(\w+))?$/);
    if (!m) throw new Error(`bad clip spec ${spec}`);
    const [, name, a, b, alias] = m;
    const frames = sample(gltf.scene, clip(name), a ? Number(a) : 0, b ? Number(b) : Infinity);
    const samples = bake(frames, rest);
    const flat = (k: 'body' | 'main' | 'free') => samples.map((s) => s[k].join(',')).join(',\n    ');
    src += `/** ${name}${a ? ` ${a}-${b}s` : ''} */\nexport const ${alias ?? name.toUpperCase()}: BakedClip = {\n  fps: ${FPS},\n  t0: ${r3(frames[0].t)},\n  n: ${samples.length},\n  body: [\n    ${flat('body')},\n  ],\n  main: [\n    ${flat('main')},\n  ],\n  free: [\n    ${flat('free')},\n  ],\n};\n\n`;
  }
  fs.writeFileSync(out, src);
  console.log(`wrote ${out} (${(src.length / 1024).toFixed(1)}KB)`);
}, (err) => {
  console.error(err);
  process.exit(1);
});
