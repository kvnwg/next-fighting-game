/**
 * Molten Forge. A foundry floor of basalt slabs in a cavern, cracked and glowing where the heat gets
 * through, four lava pools in the corners and a river of lava all around. Rock walls climb into the
 * dark, lava falls pour down them, stalactites hang from the roof, chains sway over the anvils, and
 * embers rise everywhere.
 */
import * as THREE from 'three';
import { fbm2, hash3, rng } from '../gfx/noise';
import { VoxelVolume, meshVoxels } from '../gfx/voxel';
import { G } from '../gfx/globals';
import { litMaterial } from '../gfx/materials';
import { Heightfield, hex, pick, terrain, voxelFloor, worldMaterial } from './kit';
import { BuildContext, MapRecipe } from './look';

const BASALT = [hex('#3e3538'), hex('#473d40'), hex('#372f32'), hex('#504548')];
const SLAB = [hex('#625860'), hex('#6c6168'), hex('#584f56')];
const CRACK = [hex('#ff6a1a'), hex('#ff8a2a'), hex('#e0400a')];
const ROCK = [hex('#2a2022'), hex('#332628'), hex('#241b1d'), hex('#3c2e30')];
const IRON = [hex('#3a3434'), hex('#443d3c'), hex('#2f2a2a')];

const LAVA_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const LAVA_FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uFlow;
varying vec3 vWorldPos;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 cell = floor(vWorldPos.xz / 0.25);
  float t = uTime;
  vec2 p = cell * 0.16 + uFlow * t;
  float n = noise(p) * 0.6 + noise(cell * 0.4 - uFlow.yx * t * 1.3) * 0.4;
  vec3 crust = vec3(0.08, 0.02, 0.018);
  vec3 hot = vec3(5.0, 1.15, 0.16);
  vec3 c = mix(crust, hot, smoothstep(0.34, 0.68, n));
  c += vec3(3.0, 1.6, 0.4) * pow(max(n - 0.55, 0.0) * 2.2, 3.0);
  gl_FragColor = vec4(c, 1.0);
}`;

/** A sheet of lava flowing along `flow` (a river or a fall seen face-on). */
function lavaSheet(w: number, d: number, flow: [number, number]): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({ uniforms: { uTime: G.uTime, uFlow: { value: new THREE.Vector2(...flow) } }, vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  return m;
}

export const forgeRecipe: MapRecipe = {
  propStyle: 'ash',
  look: {
    sky: { zenith: '#000000', horizon: '#000000', none: true },
    light: { dir: [0.3, 1, 0.35], color: '#ffc29a', intensity: 2.6 },
    hemi: { sky: '#f0a880', ground: '#7a3a22', intensity: 2.6 },
    fog: { color: '#5a2414', sun: '#9a3a18', density: 0.006, falloff: 0.001, glow: 2 },
    grade: { exposure: 1.5, contrast: 1.05, saturation: 1.1, gain: '#fff4ec', lift: '#1e0e0a', rays: 0, bloom: 0.95, bloomThreshold: 0.8 },
    wind: { dir: [0.3, 1], strength: 0.4, gust: 0.4 },
    rim: { color: '#ffb080', strength: 0.9 },
    lit: true,
    shadowExtent: 24,
  },
  build(ctx: BuildContext) {
    const { map, quality: q } = ctx;
    const pools = map.hazards.map((h) => h.shape).filter((s) => s.type === 'circle') as { x: number; z: number; r: number }[];
    const heat = (x: number, z: number) => {
      let k = 0;
      for (const p of pools) k = Math.max(k, 1 - (Math.hypot(x - p.x, z - p.z) - p.r) / 4.5);
      return Math.max(k, 1 - (15 - Math.max(Math.abs(x), Math.abs(z))) / 2.5);
    };
    // ---------------------------------------------------------- the foundry floor
    ctx.group.add(
      voxelFloor(map.floor, {
        cell: 0.25,
        layer: 0.08,
        depth: 3,
        jitter: 0.05,
        at: (x, z) => {
          const cx = Math.floor(x / 0.25);
          const cz = Math.floor(z / 0.25);
          const h = hash3(cx, 0, cz, 1);
          for (const p of pools) {
            const d = Math.hypot(x - p.x, z - p.z);
            if (d < p.r - 0.1) return null;
            if (d < p.r + 0.6) return { color: pick(ROCK, h) };
          }
          if (Math.abs(x) < 3) {
            // the worn slab road down the middle, with iron grates
            const grate = Math.abs(z) < 2.2 && Math.abs(x) < 1.6;
            if (grate) return (cx + cz) % 2 === 0 ? { color: pick(IRON, h) } : { color: hex('#ff5a10'), drop: 1, glow: 0.35 };
            const seam = ((cz % 6) + 6) % 6 === 0 || Math.abs(x) > 2.75;
            return { color: seam ? pick(BASALT, h) : pick(SLAB, hash3(Math.floor(cz / 6), 1, Math.floor(x), 2)) };
          }
          // basalt, cracked and glowing where it's hottest
          const crack = Math.abs(fbm2(x * 0.45, z * 0.45, 3, 7) - 0.5) < 0.012 + heat(x, z) * 0.012;
          if (crack && heat(x, z) > 0.15) return { color: pick(CRACK, h), drop: 1, glow: 0.35 + heat(x, z) * 0.4 };
          const tx = Math.floor(cx / 6);
          const tz = Math.floor(cz / 6);
          const seam = ((cx % 6) + 6) % 6 === 0 || ((cz % 6) + 6) % 6 === 0;
          return { color: seam ? pick(ROCK, h) : pick(BASALT, hash3(tx, 2, tz, 3)) };
        },
      }),
    );
    // lava rims: a raised lip of rock around each pool
    for (const p of pools) {
      const v = 0.25;
      const n = Math.ceil(((p.r + 0.8) * 2) / v);
      const vol = new VoxelVolume(n, 2, n, [v, 0.12, v], [p.x - (n * v) / 2, -0.06, p.z - (n * v) / 2]);
      vol.fill({ min: [p.x - p.r - 0.8, 0, p.z - p.r - 0.8], max: [p.x + p.r + 0.8, 0.24, p.z + p.r + 0.8] }, (px, py, pz, x, y, z) => {
        const d = Math.hypot(px - p.x, pz - p.z);
        if (d < p.r - 0.05 || d > p.r + 0.35 + hash3(x, 0, z, 3) * 0.4) return null;
        if (py > 0.12 && hash3(x, y, z, 4) < 0.5) return null;
        return pick(ROCK, hash3(x, y, z, 5));
      });
      const m = new THREE.Mesh(meshVoxels(vol, { jitter: 0.06 }), worldMaterial());
      m.receiveShadow = true;
      ctx.group.add(m);
    }

    // ---------------------------------------------------------- the cavern: lava moat, walls, falls, roof
    const moat = lavaSheet(60, 60, [0.08, 0.05]);
    moat.rotation.x = -Math.PI / 2;
    moat.position.y = -0.7;
    ctx.group.add(moat);
    ctx.light(0, -0.2, 17, '#ff6a20', 10, 14);
    ctx.light(0, -0.2, -17, '#ff6a20', 10, 14);
    const wallH = (x: number, z: number) => {
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (d < 19.5) return NaN;
      const k = Math.min(1, (d - 19.5) / 6);
      return 2 + k * (22 + fbm2(x * 0.08, z * 0.08, 3, 5) * 10) + (fbm2(x * 0.3, z * 0.3, 2, 6) - 0.5) * 3;
    };
    const cell = q.level === 'low' ? 1 : 0.5;
    const span = 60;
    const n = Math.round((span * 2) / cell);
    const hf: Heightfield = {
      x0: -span,
      z0: -span,
      nx: n,
      nz: n,
      cell,
      step: 0.5,
      height: (i, j) => {
        const h = wallH(-span + (i + 0.5) * cell, -span + (j + 0.5) * cell);
        return Number.isNaN(h) ? NaN : Math.round(h / 0.5);
      },
      top: (i, j, h) => pick(ROCK, hash3(i, h, j, 7)),
      side: (i, j, l) => {
        const r = hash3(i, l, j, 8);
        // veins of glowing ore in the walls
        return r < 0.012 ? hex('#ff7a2a') : pick(ROCK, r);
      },
      floor: -2,
    };
    ctx.group.add(terrain(hf, 40, { shadows: false }));
    // the roof, hung with stalactites: the same heightfield trick, upside down
    const roof: Heightfield = {
      x0: -span,
      z0: -span,
      nx: Math.round((span * 2) / 1),
      nz: Math.round((span * 2) / 1),
      cell: 1,
      step: 0.5,
      height: (i, j) => {
        const x = -span + i + 0.5;
        const z = -span + j + 0.5;
        const spike = hash3(i, 0, j, 9) < 0.06 ? 4 + hash3(i, 1, j, 10) * 8 : 0;
        return Math.round((fbm2(x * 0.06, z * 0.06, 3, 11) * 6 + spike) / 0.5);
      },
      top: (i, j, h) => pick(ROCK, hash3(i, h, j, 12)),
      side: (i, j, l) => pick(ROCK, hash3(i, l, j, 13)),
      floor: 0,
    };
    const ceiling = terrain(roof, 40);
    ceiling.scale.y = -1;
    ceiling.position.y = 30;
    ctx.group.add(ceiling);
    // lava falls pouring down the walls into the moat
    const R = rng(5);
    for (const [x, z, rot] of [[0, -21, 0], [21, 6, -Math.PI / 2], [-21, -8, Math.PI / 2], [-9, 21, Math.PI]] as const) {
      const fall = lavaSheet(3 + R() * 2, 26, [0, 0.9]);
      fall.position.set(x, 11, z);
      fall.rotation.y = rot;
      ctx.group.add(fall);
      ctx.light(x * 0.85, 2, z * 0.85, '#ff7a2a', 9, 16);
      ctx.particles({ kind: 'embers', count: 120, center: new THREE.Vector3(x * 0.9, -0.5, z * 0.9), size: new THREE.Vector3(5, 1, 5), scale: 0.07, colors: ['#ffb040', '#ff7a1a', '#ffd27a'], intensity: 5, ground: -0.5, seed: 50 + Math.round(x) });
    }

    // ---------------------------------------------------------- the forge's furniture
    const chains = new VoxelVolume(3, 140, 3, [0.08, 0.08, 0.08], [-0.12, 0, -0.12]);
    for (let y = 0; y < 140; y++) if (y % 3 !== 2) chains.set(y % 6 < 3 ? 1 : 0, y, 1, pick(IRON, hash3(0, y, 0, 3)));
    // hung upside down from the roof, so the free end (local top) sways most
    const chainGeo = meshVoxels(chains, { jitter: 0.06, sway: (_x, py) => py * 0.012 });
    const chainMat = litMaterial({ vertexColors: true, ao: true, sway: true });
    for (const [x, z] of [[1.2, 0.6], [-1.4, -0.4], [6, 4], [-6, -4], [6.5, -3.5]]) {
      const m = new THREE.Mesh(chainGeo, chainMat);
      m.position.set(x, 18.8, z);
      m.scale.y = -1;
      ctx.group.add(m);
    }
    ctx.props([
      { kind: 'anvil', x: 9.5, z: 9, rot: 0.6 },
      { kind: 'anvil', x: -9.8, z: -9.2, rot: -0.8 },
      { kind: 'crate', x: 11, z: -12.6, s: 0.9, rot: 0.3 },
      { kind: 'crate', x: 12.2, z: -12.2, s: 0.7, rot: 0.9 },
      { kind: 'crate', x: -12.4, z: 12.5, s: 0.8, rot: 0.2 },
      { kind: 'pillar', x: 13.5, z: 13.5, s: 1.1 },
      { kind: 'pillar', x: -13.5, z: 13.5, s: 1.1 },
      { kind: 'pillar', x: 13.5, z: -13.5, s: 1.1 },
      { kind: 'pillar', x: -13.5, z: -13.5, s: 1.1 },
      { kind: 'brazier', x: 3, z: 14, s: 0.9 },
      { kind: 'brazier', x: -3, z: -14, s: 0.9 },
    ]);

    // ---------------------------------------------------------- embers and ash
    for (const p of pools) ctx.particles({ kind: 'embers', count: 90, center: new THREE.Vector3(p.x, 0, p.z), size: new THREE.Vector3(p.r * 2, 1, p.r * 2), scale: 0.06, colors: ['#ffb040', '#ff7a1a', '#ffd27a'], intensity: 5, seed: Math.round(p.x * 3 + p.z) });
    ctx.particles({ kind: 'dust', count: 120, center: new THREE.Vector3(0, 4, 0), size: new THREE.Vector3(32, 8, 32), scale: 0.02, colors: ['#5a4a46', '#6a5a54'], seed: 60 });
  },
};
