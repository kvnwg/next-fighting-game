/**
 * Dev tool: open /?viewer to see every character cycling through its animations, or
 * /?viewer&anim=block&t=0.5 to freeze a specific pose (used for screenshot checks).
 * /?viewer&char=ronin&anim=l0&strip=6 lays one character out at six moments of a move, and
 * &chain=l0,l1,l2 plays a combo back to back (each attack chaining from where the last ended).
 */
import * as THREE from 'three';
import { AttackKey, CHARACTER_IDS, CharacterId, getAttack } from '../shared/characters';
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

  const strip = Number(params.get('strip') ?? 0);
  if (strip > 1) {
    showStrip(r, params, strip);
    return;
  }
  const only = params.get('char') as CharacterId | null;
  const ids = only && CHARACTER_IDS.includes(only) ? [only] : CHARACTER_IDS;
  const models = ids.map((id, i) => {
    const m = new CharacterModel(id);
    m.root.position.set((i - (ids.length - 1) / 2) * 2.2, 0, 0);
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
    { state: 'attack', key: 'l2', dur: 0 },
    { state: 'attack', key: 'l3', dur: 0 },
    { state: 'attack', key: 'h', dur: 0 },
    { state: 'attack', key: 'sp', dur: 0 },
    { state: 'attack', key: 'ab', dur: 0 },
    { state: 'attack', key: 'ia', dur: 0 },
    { state: 'attack', key: 'ct', dur: 0 },
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
        state: entry.key && !atk ? 'idle' : entry.state,
        elapsed,
        dur: entry.dur,
        attack: atk,
        windup: atk?.windup ?? 0,
        key: entry.key,
        serial: idx,
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
    const atks = models.map((m) => (entry.key ? getAttack(m.char, entry.key as never) : null)).filter((x) => !!x);
    const total = atks.length ? Math.max(...atks.map((x) => x.windup + x.active + x.recovery)) + 300 : entry.key ? 0 : entry.dur;
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

const IDLE: AnimInput = { state: 'idle', elapsed: 0, dur: 0, attack: null, windup: 0, speed: 0, moveForward: 1, moveSide: 0, airborne: false, blockHeld: false, buff: false };

/** One character frozen at several moments of a move (or a chain of moves), side by side. */
function showStrip(r: PixelRenderer, params: URLSearchParams, n: number): void {
  const id = (params.get('char') ?? 'ronin') as CharacterId;
  const chain = (params.get('chain') ?? params.get('anim') ?? 'l0').split(',');
  const scene = r.scene;

  // the timeline: each attack in the chain starts when the previous one's active frames end + gap;
  // non-attack entries (block, stagger, stance...) hold that state for a typical duration
  const STATE_MS: Partial<Record<FighterState, number>> = { idle: 600, block: 800, blockstun: 300, stagger: 400, deflected: 600, broken: 1500, dodge: 380, stance: 900, dead: 1200, knockdown: 1400 };
  const probe = new CharacterModel(id);
  const steps: { key: string; start: number; dur: number; atk: ReturnType<typeof getAttack> }[] = [];
  let t = 0;
  for (const k of chain) {
    const atk = k in STATE_MS ? null : getAttack(probe.char, k as AttackKey);
    if (!atk && !(k in STATE_MS)) continue;
    const dur = atk ? atk.windup + atk.active + atk.recovery : STATE_MS[k as FighterState]!;
    steps.push({ key: k, start: t, dur, atk });
    t += atk && chain.length > 1 ? atk.windup + atk.active + Math.min(atk.recovery, 120) : dur;
  }
  probe.dispose();
  const last = steps[steps.length - 1];
  const end = last ? last.start + last.dur : 1000;
  const from = Number(params.get('from') ?? 0) * end;
  const to = Number(params.get('to') ?? 1) * end;
  const gap = Number(params.get('gap') ?? 1.5);
  const yaw = Number(params.get('yaw') ?? 0.9);
  const walk = Number(params.get('walk') ?? 0);

  // a long lens so the frames read flat, side by side
  const cam = r.camera;
  cam.fov = Number(params.get('fov') ?? 16);
  cam.updateProjectionMatrix();
  const halfW = (n * gap) / 2 + 0.4;
  const dist = Number(params.get('dist') ?? halfW / (Math.tan((cam.fov * Math.PI) / 360) * cam.aspect));
  const cy = Number(params.get('cy') ?? 1.9);
  cam.position.set(Number(params.get('cx') ?? 0), cy, dist);
  cam.lookAt(Number(params.get('cx') ?? 0), 0.95, 0);
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:8px;top:8px;color:#fff;font:14px monospace;text-shadow:0 1px 0 #000;white-space:pre';
  document.body.appendChild(label);
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const target = from + ((to - from) * i) / (n - 1);
    times.push(target);
    const m = new CharacterModel(id);
    m.root.position.set((i - (n - 1) / 2) * gap, 0, 0);
    // every frame seen from the same angle despite the perspective
    m.root.rotation.y = yaw + Math.atan2(-m.root.position.x, dist);
    scene.add(m.root);
    for (let j = 0; j < 30; j++) m.update(IDLE, 0.05);
    // play the timeline up to this moment in 10ms steps (the animator is stateful)
    for (let tt = 0; tt <= target; tt += 10) {
      let cur = steps[0];
      for (const s of steps) if (tt >= s.start) cur = s;
      const e = tt - cur.start;
      const serial = steps.indexOf(cur) + 1;
      let input: AnimInput;
      if (e >= cur.dur) input = { ...IDLE, elapsed: e - cur.dur };
      else if (cur.atk) input = { ...IDLE, state: 'attack', elapsed: e, dur: cur.dur, attack: cur.atk, windup: cur.atk.windup, key: cur.key, serial };
      else input = { ...IDLE, state: cur.key as FighterState, elapsed: e, dur: cur.dur, serial };
      if (walk) Object.assign(input, { speed: walk, moveForward: 1, moveSide: 0 });
      m.update(input, 0.01);
    }
  }
  label.textContent = `${id} ${chain.join(',')}  ` + times.map((x) => Math.round(x)).join(' / ') + ' ms';
  const loop = () => {
    r.render();
    requestAnimationFrame(loop);
  };
  loop();
}

/** /?viewer&map=forge — orbit a map with two fighters squaring off at the spawns. */
function showMap(r: PixelRenderer, mapId: string, params: URLSearchParams): void {
  const map = MAPS[mapId];
  const view = new MapView(map, r.scene);
  r.sunDir.copy(view.sunDir);
  r.setRim(view.rimColor);
  const fx = new Effects(r.scene);
  fx.setWeather(map.theme.weather);
  const chars = ['ronin', 'reaper'] as const;
  map.spawns.slice(0, 2).forEach((s, i) => {
    const m = new CharacterModel(chars[i]);
    const k = map.kind === 'lobby' ? 1 : 0.55;
    m.root.position.set(s.x * k, 0, s.z * k);
    m.root.rotation.y = s.yaw;
    r.scene.add(m.root);
    for (let j = 0; j < 30; j++) m.update(IDLE, 0.05);
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
