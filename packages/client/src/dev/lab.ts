// Move Lab (dev only, /lab.html): plays every fighter's moveset on the voxel rig.
// URL params pin a still frame for screenshots: ?fighter=warden,monk&move=H1&frame=20
// (frame may be "strike" for the middle of the active frames).

import {
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { MOVE_IDS, WEAPONS, WEAPON_IDS, moveTotal, type MoveId, type WeaponId } from '@nfg/shared';
import { POSE_SIZE, computePose, type FighterView } from '../render/poses.ts';
import { VoxelRig } from '../render/voxel/rig.ts';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new Scene();
scene.background = new Color(0x2a2536);
scene.add(new HemisphereLight(0xffffff, 0x555066, 1.6), new AmbientLight(0xffffff, 0.35));
const key = new DirectionalLight(0xffffff, 2.4);
key.position.set(3, 6, 5);
scene.add(key);
const floor = new Mesh(new CircleGeometry(30, 48), new MeshStandardMaterial({ color: 0x3a344a }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const camera = new PerspectiveCamera(32, 1, 0.1, 200);

const only = params.get('fighter');
const fighters = only ? (only.split(',') as WeaponId[]) : WEAPON_IDS;
const rigs = fighters.map((id, i) => {
  const rig = new VoxelRig(id);
  rig.root.position.x = (i - (fighters.length - 1) / 2) * 2.6;
  rig.root.rotation.y = Math.PI / 6;
  scene.add(rig.root);
  return { id, rig, pose: new Float32Array(POSE_SIZE) };
});

const width = Math.max(3, fighters.length * 2.6);
camera.position.set(0, 1.5, width * 0.95 + 1.2);
camera.lookAt(0, 1.05, 0);

const pinnedMove = params.get('move') as MoveId | null;
const pinnedFrame = params.get('frame');
let moveIndex = pinnedMove ? MOVE_IDS.indexOf(pinnedMove) : 0;
let frame = 0;
const label = document.getElementById('label')!;

const hud = document.getElementById('hud')!;
hud.innerHTML = `<select id="mv">${MOVE_IDS.map((m) => `<option ${m === MOVE_IDS[moveIndex] ? 'selected' : ''}>${m}</option>`).join('')}</select><button id="slow">Slow</button>`;
const mv = document.getElementById('mv') as HTMLSelectElement;
mv.onchange = () => { moveIndex = MOVE_IDS.indexOf(mv.value as MoveId); frame = 0; };
let slow = false;
document.getElementById('slow')!.onclick = () => { slow = !slow; };

function view(id: WeaponId, move: MoveId, f: number): FighterView {
  return { weapon: id, state: 'attack', frame: f, move, moveX: 0, moveY: 0, dodgeX: 0, dodgeY: 0, rollDir: 0, y: 0, time: f / 60, walkPhase: 0, special: null };
}

function resize(): void {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function frameFor(id: WeaponId, move: MoveId): number {
  const m = WEAPONS[id].moves[move];
  if (pinnedFrame === 'strike') return m.startup + m.active / 2;
  if (pinnedFrame === 'windup') return m.startup - 1;
  return pinnedFrame !== null ? Number(pinnedFrame) : frame;
}

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const move = MOVE_IDS[moveIndex]!;
  if (pinnedFrame === null) frame += dt * 60 * (slow ? 0.25 : 1);
  const longest = Math.max(...rigs.map((r) => moveTotal(WEAPONS[r.id].moves[move])));
  if (pinnedFrame === null && frame > longest + 20) {
    frame = 0;
    if (!pinnedMove) moveIndex = (moveIndex + 1) % MOVE_IDS.length;
    mv.value = MOVE_IDS[moveIndex]!;
  }
  for (const r of rigs) {
    const m = WEAPONS[r.id].moves[move];
    const f = Math.min(frameFor(r.id, move), moveTotal(m));
    computePose(view(r.id, move, f), r.pose);
    r.rig.applyPose(r.pose);
    // Air attacks play off the ground so they read as jumps.
    r.rig.root.position.y = m.air ? (m.lands ? Math.max(0, 1 - f / m.startup) * 1.2 : 0.9) : 0;
  }
  label.textContent = `${move} — ${rigs.map((r) => WEAPONS[r.id].moves[move].name).join(' · ')}`;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
(window as unknown as { __labReady: boolean }).__labReady = true;
