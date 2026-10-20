/**
 * Dev tool: open /?viewer to see every character cycling through its animations, or
 * /?viewer&anim=block&t=0.5 to freeze a specific pose (used for screenshot checks).
 */
import * as THREE from 'three';
import { CHARACTER_IDS, getAttack } from '../shared/characters';
import { FighterState } from '../shared/fighter';
import { AnimInput, CharacterModel } from './render/character';
import { MAPS } from '../shared/maps';
import { Effects } from './render/effects';
import { PixelRenderer } from './render/renderer';
import { groundTexture } from './render/textures';
import { MapView } from './render/world';

export function startViewer(root: HTMLElement): void {
  const params = new URLSearchParams(location.search);
  const r = new PixelRenderer(root, Number(params.get('px') ?? 3));
  const mapId = params.get('map');
  if (mapId && MAPS[mapId]) {
    showMap(r, mapId, params);
    return;
  }
  const scene = r.scene;
  scene.background = new THREE.Color('#7fb4e8');
  scene.add(new THREE.HemisphereLight('#cfe4ff', '#55603f', 1.4));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
  sun.position.set(5, 10, 6);
  sun.castShadow = true;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  scene.add(sun);
  const tex = groundTexture('grass');
  tex.repeat.set(10, 5);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const models = CHARACTER_IDS.map((id, i) => {
    const m = new CharacterModel(id);
    m.root.position.set((i - (CHARACTER_IDS.length - 1) / 2) * 2.2, 0, 0);
    m.root.rotation.y = Number(params.get('yaw') ?? 0.5);
    scene.add(m.root);
    return m;
  });
  const cam = r.camera;
  cam.position.set(0, 2.6, Number(params.get('dist') ?? 11));
  cam.lookAt(0, 1, 0);

  const anim = params.get('anim');
  const fixedT = params.get('t');
  const cycle: { state: FighterState; key?: string; dur: number }[] = [
    { state: 'idle', dur: 1200 },
    { state: 'attack', key: 'l0', dur: 0 },
    { state: 'attack', key: 'l1', dur: 0 },
    { state: 'attack', key: 'h', dur: 0 },
    { state: 'attack', key: 'sp', dur: 0 },
    { state: 'block', dur: 1000 },
    { state: 'stagger', dur: 400 },
    { state: 'deflected', dur: 600 },
    { state: 'broken', dur: 1500 },
    { state: 'dodge', dur: 380 },
    { state: 'stance', dur: 1000 },
    { state: 'dead', dur: 1200 },
  ];
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:8px;top:8px;color:#fff;font:16px monospace;text-shadow:0 1px 0 #000';
  root.appendChild(label);

  let idx = 0;
  let stateT = 0;
  let last = performance.now();
  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let entry = cycle[idx];
    if (anim) entry = cycle.find((c) => (c.key ?? c.state) === anim) ?? entry;
    stateT += dt * 1000;
    for (const m of models) {
      const atk = entry.key ? getAttack(m.char, entry.key as never) : null;
      const total = atk ? atk.windup + atk.active + atk.recovery : entry.dur;
      const elapsed = fixedT !== null ? Number(fixedT) * total : stateT;
      const input: AnimInput = {
        state: entry.state,
        elapsed,
        dur: entry.dur,
        attack: atk,
        windup: atk?.windup ?? 0,
        speed: params.has('walk') ? 5 : 0,
        moveForward: 1,
        moveSide: 0,
        airborne: false,
        blockHeld: entry.state === 'block',
        buff: false,
      };
      // settle smoothing quickly when frozen
      for (let i = 0; i < (fixedT !== null ? 20 : 1); i++) m.update(input, dt);
    }
    const anyAtk = entry.key ? getAttack(models[0].char, entry.key as never) : null;
    const total = anyAtk ? anyAtk.windup + anyAtk.active + anyAtk.recovery + 300 : entry.dur;
    if (!anim && stateT > total) {
      stateT = 0;
      idx = (idx + 1) % cycle.length;
    }
    label.textContent = `${entry.key ?? entry.state}`;
    r.render();
    requestAnimationFrame(frame);
  };
  frame();
}

/** /?viewer&map=forge — orbit a map with two fighters squaring off at the spawns. */
function showMap(r: PixelRenderer, mapId: string, params: URLSearchParams): void {
  const map = MAPS[mapId];
  const view = new MapView(map, r.scene);
  const fx = new Effects(r.scene);
  fx.setWeather(map.theme.weather);
  const chars = ['ronin', 'reaper'] as const;
  map.spawns.slice(0, 2).forEach((s, i) => {
    const m = new CharacterModel(chars[i]);
    const k = map.kind === 'lobby' ? 1 : 0.55;
    m.root.position.set(s.x * k, 0, s.z * k);
    m.root.rotation.y = s.yaw;
    r.scene.add(m.root);
    for (let j = 0; j < 30; j++) m.update({ state: 'idle', elapsed: 0, dur: 0, attack: null, windup: 0, speed: 0, moveForward: 1, moveSide: 0, airborne: false, blockHeld: false, buff: false }, 0.05);
  });
  const angle = Number(params.get('a') ?? 0.7);
  const dist = Number(params.get('dist') ?? (map.kind === 'lobby' ? 34 : 24));
  const height = Number(params.get('h') ?? 11);
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    r.camera.position.set(Math.sin(angle) * dist, height, Math.cos(angle) * dist);
    r.camera.lookAt(0, 1, 0);
    view.update(dt, new THREE.Vector3());
    fx.update(dt, r.camera);
    r.render();
    requestAnimationFrame(loop);
  };
  loop();
}
