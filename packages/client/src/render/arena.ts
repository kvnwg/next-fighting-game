import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PointLight,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { Rng, type MapId } from '@nfg/shared';
import type { Quality } from '../platform/device.ts';

interface Palette {
  skyTop: number;
  skyHorizon: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  ground: number;
  stone: number;
  stoneLine: number;
  rim: number;
  wood: number;
  lacquer: number;
  roof: number;
  foliage: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sun: number;
  sunIntensity: number;
  sunDir: [number, number, number];
  disc: number;
  discSize: number;
  lantern: number;
  weather: 'none' | 'snow' | 'embers';
}

export const PALETTES: Record<MapId, Palette> = {
  'moon-shrine': {
    skyTop: 0x070d24, skyHorizon: 0x26365e, fog: 0x18223c, fogNear: 22, fogFar: 70,
    ground: 0x111a24, stone: 0x3a465e, stoneLine: 0x27304a, rim: 0xb8c2b2, wood: 0x46201d, lacquer: 0x9a1d24,
    roof: 0x1b1720, foliage: 0x0f2a24, hemiSky: 0x7a8fd0, hemiGround: 0x1a1214, hemi: 1.1,
    sun: 0xbfcdff, sunIntensity: 1.5, sunDir: [-0.5, 0.75, 0.42], disc: 0xf2f5ff, discSize: 5, lantern: 0xff9a3c, weather: 'none',
  },
  'ember-dojo': {
    skyTop: 0x2a1a3e, skyHorizon: 0xf2873d, fog: 0x7a4136, fogNear: 25, fogFar: 85,
    ground: 0x2c1a14, stone: 0x6a564e, stoneLine: 0x4e3e38, rim: 0xdcc69c, wood: 0x5a2a1d, lacquer: 0xb82d22,
    roof: 0x2a1c1a, foliage: 0x2a2416, hemiSky: 0xffb27a, hemiGround: 0x2a1a14, hemi: 1.0,
    sun: 0xffc48c, sunIntensity: 1.8, sunDir: [0.75, 0.32, -0.55], disc: 0xffd9a0, discSize: 9, lantern: 0xffb347, weather: 'embers',
  },
  'snow-court': {
    skyTop: 0x8ea6bf, skyHorizon: 0xe6ecf1, fog: 0xd9e1e8, fogNear: 20, fogFar: 75,
    ground: 0xdfe6ec, stone: 0xaeb8c2, stoneLine: 0x8f9aa6, rim: 0xf2f5f7, wood: 0x6a4838, lacquer: 0x8f2a2c,
    roof: 0x3b3a44, foliage: 0x37503f, hemiSky: 0xf0f4ff, hemiGround: 0x8a8f99, hemi: 1.25,
    sun: 0xffffff, sunIntensity: 1.0, sunDir: [0.3, 0.9, 0.3], disc: 0xffffff, discSize: 0, lantern: 0xffc06e, weather: 'snow',
  },
};

export interface Pillar {
  x: number;
  z: number;
  r: number;
}

export interface Arena {
  group: Group;
  pillars: Pillar[];
  update(dt: number): void;
  dispose(): void;
}

const PILLAR_RING = 10.4;
const RAIL_RING = 11.6;

function skyMaterial(top: number, horizon: number): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new Color(top) }, horizon: { value: new Color(horizon) } },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 horizon; varying vec3 vPos; void main(){ float h = clamp(normalize(vPos).y * 1.6 + 0.05, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.7)), 1.0); }',
  });
}

export function buildArena(scene: Scene, mapId: MapId, quality: Quality): Arena {
  const pal = PALETTES[mapId];
  const group = new Group();
  const rng = new Rng(mapId.length * 977 + 13);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  scene.background = new Color(pal.fog);
  scene.fog = new Fog(pal.fog, pal.fogNear, pal.fogFar);

  const std = (color: number, roughness = 0.85, metalness = 0) => track(new MeshStandardMaterial({ color, roughness, metalness }));
  const mStone = std(pal.stone, 0.95);
  const mLine = std(pal.stoneLine, 0.95);
  const mRim = std(pal.rim, 0.7);
  const mWood = std(pal.wood, 0.8);
  const mLacquer = std(pal.lacquer, 0.55);
  const mRoof = std(pal.roof, 0.9);
  const mGround = std(pal.ground, 1);

  const sky = new Mesh(track(new SphereGeometry(140, 24, 12)), track(skyMaterial(pal.skyTop, pal.skyHorizon)));
  group.add(sky);
  if (pal.discSize > 0) {
    const disc = new Mesh(track(new CircleGeometry(pal.discSize, 32)), track(new MeshBasicMaterial({ color: pal.disc, fog: false })));
    const d = new Vector3(...pal.sunDir).normalize().multiplyScalar(120);
    disc.position.copy(d);
    disc.lookAt(0, 0, 0);
    group.add(disc);
  }

  const ground = new Mesh(track(new CircleGeometry(140, 48)), mGround);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.45;
  group.add(ground);

  // Stone fighting ring, its pale rim (the reference's most readable landmark), and a lower step.
  const platform = new Mesh(track(new CylinderGeometry(8.2, 8.5, 0.4, 72)), mStone);
  platform.position.y = -0.2;
  group.add(platform);
  for (const r of [2.2, 3.8, 5.4, 6.9]) {
    const ring = new Mesh(track(new RingGeometry(r - 0.035, r + 0.035, 72)), mLine);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    group.add(ring);
  }
  for (let i = 0; i < 4; i++) {
    const line = new Mesh(track(new BoxGeometry(0.06, 0.01, 14.6)), mLine);
    line.rotation.y = (i * Math.PI) / 4 + Math.PI / 8;
    line.position.y = 0.004;
    group.add(line);
  }
  const rim = new Mesh(track(new TorusGeometry(8.2, 0.13, 6, 96)), mRim);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.03;
  group.add(rim);
  const step = new Mesh(track(new CylinderGeometry(9.3, 9.5, 0.3, 72)), mLine);
  step.position.y = -0.32;
  group.add(step);
  const deck = new Mesh(track(new RingGeometry(9.3, 12.4, 72)), mWood);
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = -0.3;
  group.add(deck);

  // Railing: instanced posts plus two lacquered rails.
  const posts = 72;
  const postMesh = new InstancedMesh(track(new BoxGeometry(0.12, 0.95, 0.12)), mLacquer, posts);
  const m4 = new Matrix4();
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    m4.makeTranslation(Math.sin(a) * RAIL_RING, 0.18, Math.cos(a) * RAIL_RING);
    postMesh.setMatrixAt(i, m4);
  }
  group.add(postMesh);
  for (const y of [0.62, 0.25]) {
    const rail = new Mesh(track(new TorusGeometry(RAIL_RING, 0.055, 5, 96)), mLacquer);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = y;
    group.add(rail);
  }

  // Pillars and the pagoda roof overhead.
  const pillars: Pillar[] = [];
  const pillarGeo = track(new CylinderGeometry(0.3, 0.34, 6.4, 12));
  const baseGeo = track(new BoxGeometry(0.9, 0.35, 0.9));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.sin(a) * PILLAR_RING;
    const z = Math.cos(a) * PILLAR_RING;
    const p = new Mesh(pillarGeo, mLacquer);
    p.position.set(x, 2.9, z);
    const base = new Mesh(baseGeo, mLine);
    base.position.set(x, -0.15, z);
    group.add(p, base);
    pillars.push({ x, z, r: 0.34 });
  }
  const beam = new Mesh(track(new TorusGeometry(PILLAR_RING, 0.28, 6, 8)), mLacquer);
  beam.rotation.x = Math.PI / 2;
  beam.rotation.z = Math.PI / 8;
  beam.position.y = 6.0;
  group.add(beam);
  const roofGeo = track(new CylinderGeometry(8.6, 14.5, 2.6, 8, 1, true));
  const roof = new Mesh(roofGeo, mRoof);
  // The underside is warm wood with a little lantern light on it, so low entrance shots don't see a black slab.
  const mCeiling = track(new MeshStandardMaterial({ color: pal.wood, roughness: 0.9, emissive: pal.lantern, emissiveIntensity: 0.08, side: BackSide }));
  const ceiling = new Mesh(roofGeo, mCeiling);
  for (const m of [roof, ceiling]) {
    m.rotation.y = Math.PI / 8;
    m.position.y = 7.4;
    group.add(m);
  }

  // Torii gate behind the far side, framed by the opening camera.
  const torii = new Group();
  const legGeo = track(new CylinderGeometry(0.28, 0.32, 5.6, 10));
  for (const x of [-2.4, 2.4]) {
    const leg = new Mesh(legGeo, mLacquer);
    leg.position.set(x, 2.5, 0);
    torii.add(leg);
  }
  const kasagi = new Mesh(track(new BoxGeometry(6.8, 0.4, 0.6)), mRoof);
  kasagi.position.y = 5.45;
  const nuki = new Mesh(track(new BoxGeometry(5.6, 0.3, 0.35)), mLacquer);
  nuki.position.y = 4.4;
  torii.add(kasagi, nuki);
  torii.position.set(0, -0.3, 17.5);
  group.add(torii);

  // Stone lanterns between the pillars, with a warm glow.
  const lanternGlow = track(new MeshBasicMaterial({ color: pal.lantern }));
  const lanternBody = std(0x6b6f78, 0.9);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.sin(a) * 13.4;
    const z = Math.cos(a) * 13.4;
    const body = new Mesh(track(new BoxGeometry(0.5, 1.2, 0.5)), lanternBody);
    body.position.set(x, 0.3, z);
    const light = new Mesh(track(new BoxGeometry(0.34, 0.3, 0.34)), lanternGlow);
    light.position.set(x, 1.05, z);
    const cap = new Mesh(track(new ConeGeometry(0.5, 0.35, 4)), lanternBody);
    cap.position.set(x, 1.38, z);
    cap.rotation.y = Math.PI / 4;
    group.add(body, light, cap);
  }

  // Tree line.
  const trees = 70;
  const treeMesh = new InstancedMesh(track(new ConeGeometry(1.6, 6, 6)), std(pal.foliage, 1), trees);
  for (let i = 0; i < trees; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(20, 48);
    const s = rng.range(0.8, 2.1);
    m4.makeScale(s, s * rng.range(0.9, 1.4), s).setPosition(Math.sin(a) * r, 2.2 * s, Math.cos(a) * r);
    treeMesh.setMatrixAt(i, m4);
  }
  group.add(treeMesh);

  const hemi = new HemisphereLight(pal.hemiSky, pal.hemiGround, pal.hemi);
  const sun = new DirectionalLight(pal.sun, pal.sunIntensity);
  sun.position.set(...pal.sunDir).multiplyScalar(20);
  group.add(hemi, sun);
  if (quality.lights) {
    for (const a of [0.6, 3.7]) {
      const l = new PointLight(pal.lantern, 6, 14, 2);
      l.position.set(Math.sin(a) * 10, 2.2, Math.cos(a) * 10);
      group.add(l);
    }
  }

  // Weather: falling snow or rising embers.
  let weather: Points | null = null;
  if (pal.weather !== 'none') {
    const count = Math.round(260 * quality.particles);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng.range(-16, 16);
      pos[i * 3 + 1] = rng.range(0, 9);
      pos[i * 3 + 2] = rng.range(-16, 16);
    }
    const geo = track(new BufferGeometry());
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    const snow = pal.weather === 'snow';
    const mat = track(
      new PointsMaterial({
        color: snow ? 0xffffff : 0xffa34a,
        size: snow ? 0.08 : 0.06,
        transparent: true,
        opacity: snow ? 0.85 : 0.9,
        depthWrite: false,
        blending: snow ? NormalBlending : AdditiveBlending,
      }),
    );
    weather = new Points(geo, mat);
    group.add(weather);
  }

  scene.add(group);

  let t = 0;
  return {
    group,
    pillars,
    update(dt: number) {
      t += dt;
      if (!weather) return;
      const attr = weather.geometry.getAttribute('position') as BufferAttribute;
      const arr = attr.array as Float32Array;
      const snow = pal.weather === 'snow';
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1]! += (snow ? -0.9 : 0.6) * dt;
        arr[i]! += Math.sin(t * 0.7 + i) * 0.15 * dt;
        if (snow && arr[i + 1]! < 0) arr[i + 1] = 9;
        if (!snow && arr[i + 1]! > 9) arr[i + 1] = 0;
      }
      attr.needsUpdate = true;
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
