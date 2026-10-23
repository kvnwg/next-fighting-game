/**
 * The Proving Grounds, late on a clear afternoon. A tiled shrine plaza in a meadow of long grass
 * that the wind rolls across in waves, earth paths out to the training yard and the duelling rings,
 * a fence line, rolling grass and groves beyond it, forested foothills, and lone snow peaks in the
 * haze under white blocky clouds.
 */
import * as THREE from 'three';
import { Shape } from '../../../shared/maps';
import { fbm2, hash3 } from '../gfx/noise';
import { Heightfield, hex, mixHex, mountainRing, onShapes, peaks, pick, scatter, shadeHex, terrain, voxelFloor } from './kit';
import { BuildContext, MapRecipe } from './look';

/** the ground under the grass: deep where it's thick, brighter in the open */
const MEADOW = [hex('#3f6a26'), hex('#5c8c32'), hex('#86a84a')];
const DIRT = [hex('#8a6a46'), hex('#7c5e3e'), hex('#96764e')];
const TILE = [hex('#d6cfc2'), hex('#cdc5b6'), hex('#dcd6ca'), hex('#c9c0b0')];
const SAND = [hex('#dcc9a0'), hex('#d4c096'), hex('#e3d1aa')];
const ROCK = [hex('#7c7a80'), hex('#868489'), hex('#706e75')];

export const lobbyRecipe: MapRecipe = {
  propStyle: 'moss',
  look: {
    // a clear late afternoon: deep blue overhead, warm at the horizon, a low sun raking the grass
    sky: { zenith: '#3274d4', horizon: '#e4eef4', band: '#ffecc8', bandAmount: 0.3, below: '#c8d6e4', glow: 1.0 },
    light: { dir: [0.62, 0.5, 0.48], color: '#ffe9c8', intensity: 3.3 },
    hemi: { sky: '#a6c4ee', ground: '#5d6e3c', intensity: 1.25 },
    fog: { color: '#cddff0', sun: '#ffe6bc', density: 0.0019, falloff: 0.012, glow: 5 },
    grade: { exposure: 1.03, contrast: 1.07, saturation: 1.14, gain: '#fff7ea', lift: '#0e1428', rays: 0.5, rayColor: '#ffe8c4', bloom: 0.42 },
    wind: { dir: [0.8, 0.6], strength: 1, gust: 0.85 },
    rim: { color: '#fff1d8', strength: 0.6 },
    clouds: [{ y: 150, cell: 14, thick: 10, cover: 0.32, half: 46, top: '#ffffff', side: '#f4ecdf', bottom: '#aebdd2', speed: 2, layers: 3 }],
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

    // ---------------------------------------------------------- the land: a flat meadow inside the fence,
    // rolling grass beyond it, then a ring of forested foothills, then the mountains in the haze
    const rolling = (x: number, z: number) => {
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (d < 72) return 0;
      return Math.min(1, (d - 72) / 16) * (0.4 + fbm2(x * 0.03, z * 0.03, 3, 6) * 2.6);
    };
    const foothill = (x: number, z: number) => {
      const r = Math.hypot(x, z);
      if (r < 125) return 0;
      return Math.pow((r - 125) / 110, 1.5) * 16 * (0.45 + fbm2(x * 0.011, z * 0.011, 3, 13) * 1.2);
    };
    const heightAt = (x: number, z: number) => Math.round((rolling(x, z) + foothill(x, z)) / 0.5) * 0.5;
    const ground = (x: number, z: number, i: number, j: number, h: number) => {
      const r = hash3(i, h, j, 7);
      // no checkerboard: the colour drifts smoothly in big patches, with only a whisper per block
      const m = fbm2(x * 0.045, z * 0.045, 3, 9);
      const c = mixHex(MEADOW[0], MEADOW[1], Math.max(0, Math.min(1, m * 1.6 - 0.3)));
      if (h > 8 && fbm2(x * 0.05, z * 0.05, 2, 19) < 0.26) return shadeHex(pick(DIRT, r), 0.95);
      // up the hills the grass is sunnier and drier
      return shadeHex(mixHex(c, MEADOW[2], Math.min(0.6, h * 0.02)), 0.97 + r * 0.06);
    };
    const field = (half: number, cell: number, hole: number) => {
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
          if (Math.max(Math.abs(x), Math.abs(z)) < hole) return NaN;
          if (onShapes(paved, x, z)) return NaN;
          return Math.round((rolling(x, z) + foothill(x, z)) / 0.5);
        },
        top: (i, j, h) => ground(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell, i, j, h),
        side: (i, j, l, below) => (below === 0 ? shadeHex(MEADOW[0], 0.85) : pick(DIRT, hash3(i, l, j, 11))),
        floor: -1,
      };
      return terrain(hf, 32);
    };
    ctx.group.add(field(112, q.level === 'low' ? 2 : 1, 0));
    ctx.group.add(field(240, q.level === 'low' ? 6 : 4, 112));
    // lone snow peaks standing over the forest, and a low blue range between them
    ctx.group.add(
      peaks({
        count: q.level === 'low' ? 7 : 10,
        inner: 360,
        outer: 500,
        height: [80, 150],
        spread: [0.8, 1.1],
        base: -6,
        cell: q.level === 'low' ? 12 : 8,
        step: 4,
        rock: [hex('#6c7a92'), hex('#75839b'), hex('#66738a')],
        snow: [hex('#f7f9fd'), hex('#eaf0f8'), hex('#e2eaf4')],
        snowLine: 70,
        seed: 82,
      }),
    );
    ctx.group.add(
      mountainRing({
        inner: 330,
        outer: 760,
        cell: q.level === 'low' ? 20 : 14,
        step: 6,
        height: 110,
        base: 0,
        rock: [hex('#7f8fa8'), hex('#8796ae'), hex('#7a89a2')],
        snow: [hex('#f2f6fb')],
        snowLine: 0.8,
        grass: [hex('#6a8466')],
        seed: 81,
      }),
    );

    // ---------------------------------------------------------- the fence line, groves beyond it, the forest on the hills
    const fence: { kind: 'fence'; x: number; z: number; rot: number }[] = [];
    for (let t = -69; t <= 69; t += 2) {
      if (Math.abs(t) < 3) continue;
      fence.push({ kind: 'fence', x: t, z: -70.4, rot: Math.PI / 2 }, { kind: 'fence', x: t, z: 70.4, rot: Math.PI / 2 }, { kind: 'fence', x: -70.4, z: t, rot: 0 }, { kind: 'fence', x: 70.4, z: t, rot: 0 });
    }
    ctx.props(fence);
    // groves in the rolling grass: clumps, with clear meadow between them
    const groves = scatter(Math.round(70 * q.scenery), { x0: -112, z0: -112, x1: 112, z1: 112 }, (x, z) => Math.max(Math.abs(x), Math.abs(z)) > 76 && fbm2(x * 0.04, z * 0.04, 2, 23) > 0.52, 4, 101, ctx.taken);
    // the forest thickening up the foothills
    const forest = scatter(
      Math.round(320 * q.scenery),
      { x0: -235, z0: -235, x1: 235, z1: 235 },
      (x, z) => {
        const r = Math.hypot(x, z);
        return r > 118 && r < 232 && hash3(Math.floor(x), 0, Math.floor(z), 29) < 0.35 + (r - 118) / 160;
      },
      6.5,
      102,
      ctx.taken,
    );
    ctx.trees(
      [...groves, ...forest].map((p, i) => ({ kind: (i % 7 === 0 && Math.hypot(p.x, p.z) < 150 ? 'sakura' : 'pine') as 'pine' | 'sakura', x: p.x, z: p.z, y: heightAt(p.x, p.z), s: 1.15 + hash3(i, 0, 0, 3) * 0.75 })),
      { shadows: false, detail: 0.7 },
    );

    // ---------------------------------------------------------- the meadow grass, and the air over it
    const plazaR = 15;
    // what stands in the meadow, bucketed by 4 m so the mask doesn't test every prop at every texel
    const bucket = new Map<string, { x: number; z: number; r: number }[]>();
    for (const t of ctx.taken) {
      if (Math.max(Math.abs(t.x), Math.abs(t.z)) > 73) continue;
      const k = t.r * 0.55;
      for (let bx = Math.floor((t.x - k) / 4); bx <= Math.floor((t.x + k) / 4); bx++)
        for (let bz = Math.floor((t.z - k) / 4); bz <= Math.floor((t.z + k) / 4); bz++) {
          const key = `${bx},${bz}`;
          bucket.set(key, [...(bucket.get(key) ?? []), t]);
        }
    }
    ctx.meadow({
      bounds: { x0: -71, z0: -71, x1: 71, z1: 71 },
      density: (x, z) => {
        if (Math.hypot(x, z) < plazaR + 0.8) return 0;
        if (onShapes(paved, x, z, 0.35)) return 0;
        // thinning to the paths' and paving's edges, not a hard line
        const nearPave = onShapes(paved, x, z, 1.1) ? 0.55 : 1;
        for (const t of bucket.get(`${Math.floor(x / 4)},${Math.floor(z / 4)}`) ?? []) if (Math.hypot(t.x - x, t.z - z) < t.r * 0.55) return 0;
        const m = fbm2(x * 0.07, z * 0.07, 3, 12);
        return Math.min(1, (0.62 + m * 0.6) * nearPave);
      },
      dry: (x, z) => Math.max(0, fbm2(x * 0.025, z * 0.025, 3, 31) * 1.8 - 0.75),
      flowers: (x, z) => Math.max(0, fbm2(x * 0.05, z * 0.05, 2, 37) * 2.2 - 1.05),
      root: '#3a6224',
      tip: '#8cc152',
      dryTip: '#c9c46a',
      bloom: ['#f5d24a', '#ffffff', '#f49ac0', '#a98ee8'],
      height: 0.5,
    });
    ctx.particles({ kind: 'dust', count: 360, center: new THREE.Vector3(0, 3, 0), size: new THREE.Vector3(40, 6, 40), scale: 0.025, colors: ['#fff8d8', '#fff2c0'], seed: 42 });
    ctx.particles({ kind: 'petals', count: 260, center: new THREE.Vector3(0, 6, 0), size: new THREE.Vector3(40, 12, 40), scale: 0.07, colors: ['#f7a8c6', '#fbbdd2', '#fff0f5'], seed: 43 });
  },
};
