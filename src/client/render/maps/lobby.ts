/**
 * The Proving Grounds, on a bright day. A meadow of grass blocks and wildflowers around a tiled
 * shrine plaza, earth paths out to the training yard and the duelling rings, a fence line, forested
 * hills rolling away to blue mountains, and white blocky clouds overhead.
 */
import * as THREE from 'three';
import { Shape } from '../../../shared/maps';
import { fbm2, hash3 } from '../gfx/noise';
import { Heightfield, hex, mountainRing, onShapes, pick, scatter, shadeHex, terrain, voxelFloor } from './kit';
import { BuildContext, MapRecipe } from './look';

const GRASS = [hex('#6aa23e'), hex('#74ac46'), hex('#5f9537'), hex('#7fb84e'), hex('#68a040')];
const DIRT = [hex('#8a6a46'), hex('#7c5e3e'), hex('#96764e')];
const TILE = [hex('#c2b6a6'), hex('#b8ac9c'), hex('#cabfaf'), hex('#bdb1a1')];
const SAND = [hex('#dcc9a0'), hex('#d4c096'), hex('#e3d1aa')];
const FLOWERS = [hex('#f5d24a'), hex('#ffffff'), hex('#f7a8c6'), hex('#b89ae8')];
const ROCK = [hex('#7c7a80'), hex('#868489'), hex('#706e75')];

export const lobbyRecipe: MapRecipe = {
  propStyle: 'moss',
  look: {
    sky: { zenith: '#3a7bd8', horizon: '#cfe6ff', band: '#eaf4ff', bandAmount: 0.3, below: '#b8cce0', glow: 0.8 },
    light: { dir: [0.55, 0.72, 0.42], color: '#fff3dc', intensity: 3.1 },
    hemi: { sky: '#a8c8f2', ground: '#6a7a4a', intensity: 1.3 },
    fog: { color: '#c4daf0', sun: '#fff4dc', density: 0.0032, falloff: 0.014, glow: 6 },
    grade: { exposure: 1.0, contrast: 1.05, saturation: 1.12, gain: '#fffaf2', lift: '#101830', rays: 0.45, rayColor: '#fff0d0', bloom: 0.4 },
    wind: { dir: [0.8, 0.6], strength: 0.9, gust: 0.7 },
    rim: { color: '#fff4e0', strength: 0.55 },
    clouds: [{ y: 120, cell: 14, thick: 12, cover: 0.4, half: 44, top: '#ffffff', side: '#eef3f9', bottom: '#b4c2d6', speed: 2, layers: 3 }],
    shadowExtent: 36,
  },
  build(ctx: BuildContext) {
    const { map, quality: q } = ctx;
    const plaza = map.decals.filter((d) => d.tex === 'tiles').map((d) => d.shape);
    const paths = map.decals.filter((d) => d.tex === 'path').map((d) => d.shape);
    const sand = map.decals.filter((d) => d.tex === 'sand').map((d) => d.shape);
    const paved: Shape[] = [...plaza, ...paths, ...sand];
    // ---------------------------------------------------------- paving: plaza tiles, earth paths, sand
    const tiles = voxelFloor(plaza, {
      cell: 0.25,
      layer: 0.08,
      depth: 2,
      pad: 0.5,
      jitter: 0.025,
      at: (x, z) => {
        const r = Math.hypot(x, z);
        const cx = Math.floor(x / 0.25);
        const cz = Math.floor(z / 0.25);
        // concentric courses of tiles, a darker ring every few metres
        const ring = Math.floor(r / 1.5);
        const a = Math.atan2(x, z);
        const seg = Math.floor((a * r) / 1.5 + ring * 0.5);
        const seam = r % 1.5 < 0.2 || ((a * r) / 1.5 + ring * 0.5) % 1 < 0.12;
        const c = pick(TILE, hash3(ring, seg, 0, 3));
        return { color: seam ? shadeHex(c, 0.84) : r > 14.3 ? shadeHex(c, 0.78) : shadeHex(c, 0.96 + hash3(cx, 0, cz, 1) * 0.06) };
      },
    });
    tiles.position.y = 0.005;
    ctx.group.add(tiles);
    const earth = voxelFloor(paths, {
      cell: 0.5,
      layer: 0.08,
      depth: 2,
      pad: 0.5,
      jitter: 0.05,
      at: (x, z) => {
        const h = hash3(Math.floor(x * 2), 0, Math.floor(z * 2), 4);
        if (onShapes(plaza, x, z, 0.3)) return null;
        return { color: h < 0.15 ? pick(ROCK, h * 6) : pick(DIRT, h) };
      },
    });
    earth.position.y = 0.004;
    ctx.group.add(earth);
    const sandy = voxelFloor(sand, {
      cell: 0.25,
      layer: 0.08,
      depth: 2,
      pad: 0.4,
      jitter: 0.03,
      at: (x, z) => ({ color: pick(SAND, hash3(Math.floor(x * 4), 0, Math.floor(z * 4), 5)) }),
    });
    sandy.position.y = 0.006;
    ctx.group.add(sandy);

    // ---------------------------------------------------------- the meadow and the hills beyond
    const hill = (x: number, z: number) => {
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (d < 71) return 0;
      return Math.max(0, (d - 71) / 30) ** 1.4 * 14 + fbm2(x * 0.02, z * 0.02, 3, 6) * 6 * Math.min(1, (d - 71) / 15);
    };
    const cell = q.level === 'low' ? 2 : 1;
    const half = 150;
    const n = Math.round((half * 2) / cell);
    const hf: Heightfield = {
      x0: -half,
      z0: -half,
      nx: n,
      nz: n,
      cell,
      step: 0.5,
      height: (i, j) => {
        const x = -half + (i + 0.5) * cell;
        const z = -half + (j + 0.5) * cell;
        if (onShapes(paved, x, z)) return NaN;
        return Math.round(hill(x, z) / 0.5);
      },
      top: (i, j, h) => {
        const x = -half + (i + 0.5) * cell;
        const z = -half + (j + 0.5) * cell;
        const r = hash3(i, h, j, 7);
        if (h === 0 && hash3(i, 1, j, 8) < 0.025) return pick(FLOWERS, r);
        return fbm2(x * 0.05, z * 0.05, 2, 9) < 0.3 && h > 0 ? pick(DIRT, r) : pick(GRASS, r);
      },
      side: (i, j, l, below) => (below === 0 ? pick(GRASS, hash3(i, l, j, 10)) : pick(DIRT, hash3(i, l, j, 11))),
      floor: -1,
    };
    ctx.group.add(terrain(hf, 32));
    const heightAt = (x: number, z: number) => Math.round(hill(x, z) / 0.5) * 0.5;
    ctx.group.add(
      mountainRing({
        inner: 200,
        outer: 600,
        cell: q.level === 'low' ? 16 : 10,
        step: 6,
        height: 150,
        base: 0,
        rock: [hex('#6d7a8e'), hex('#77849a'), hex('#647082')],
        snow: [hex('#f4f7fb'), hex('#e8eef6')],
        grass: [hex('#5e7a50'), hex('#668456')],
        seed: 81,
      }),
    );

    // ---------------------------------------------------------- the fence line, and forest beyond it
    const fence: { kind: 'fence'; x: number; z: number; rot: number }[] = [];
    for (let t = -69; t <= 69; t += 2) {
      if (Math.abs(t) < 3) continue;
      fence.push({ kind: 'fence', x: t, z: -70.4, rot: Math.PI / 2 }, { kind: 'fence', x: t, z: 70.4, rot: Math.PI / 2 }, { kind: 'fence', x: -70.4, z: t, rot: 0 }, { kind: 'fence', x: 70.4, z: t, rot: 0 });
    }
    ctx.props(fence);
    const beyond = scatter(Math.round(120 * q.scenery), { x0: -150, z0: -150, x1: 150, z1: 150 }, (x, z) => Math.max(Math.abs(x), Math.abs(z)) > 74 && Math.hypot(x, z) < 160, 6, 101, ctx.taken);
    ctx.trees(
      beyond.map((p, i) => ({ kind: (i % 5 === 0 ? 'sakura' : 'pine') as 'pine' | 'sakura', x: p.x, z: p.z, y: heightAt(p.x, p.z), s: 1.2 + hash3(i, 0, 0, 3) * 0.6 })),
      { shadows: false, detail: 0.75 },
    );

    // ---------------------------------------------------------- meadow grass and air
    ctx.grass({
      bounds: { x0: -70, z0: -70, x1: 70, z1: 70 },
      perM2: 1.7,
      density: (x, z) => {
        if (onShapes(paved, x, z, 0.6)) return 0;
        if (Math.hypot(x, z) < 17) return 0;
        const m = fbm2(x * 0.06, z * 0.06, 3, 12);
        return 0.35 + m * 0.8;
      },
      blades: ['#5e9234', '#6ea23e', '#7fb24a', '#8fc056', '#4f822c'],
      flowers: ['#f5d24a', '#ffffff', '#f7a8c6', '#b89ae8'],
      flowerShare: 0.12,
      tallShare: 0.3,
      seed: 41,
    });
    ctx.particles({ kind: 'dust', count: 360, center: new THREE.Vector3(0, 3, 0), size: new THREE.Vector3(40, 6, 40), scale: 0.025, colors: ['#fff8d8', '#fff2c0'], seed: 42 });
    ctx.particles({ kind: 'petals', count: 500, center: new THREE.Vector3(0, 6, 0), size: new THREE.Vector3(40, 12, 40), scale: 0.07, colors: ['#f7a8c6', '#fbbdd2', '#fff0f5'], seed: 43 });
  },
};
