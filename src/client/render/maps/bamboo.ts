/**
 * Moonlit Grove. A clearing in a bamboo forest under a crescent moon: moss and fallen leaves, a
 * cobbled path running through and on into the trees, lit by stone lanterns, a stream with a little
 * plank bridge, a roadside shrine with its stone guardians, and fireflies everywhere.
 */
import * as THREE from 'three';
import { fbm2, hash3 } from '../gfx/noise';
import { Heightfield, hex, mountainRing, pick, scatter, terrain, voxelFloor } from './kit';
import { BuildContext, MapRecipe } from './look';

const MOSS = [hex('#2f4f2c'), hex('#365c33'), hex('#28452a'), hex('#3d6838'), hex('#2a4a30')];
const DIRT = [hex('#3e3428'), hex('#46392c'), hex('#362e24')];
const COBBLE = [hex('#7a7c80'), hex('#868a8e'), hex('#6c6f74'), hex('#919498')];
const LEAF = [hex('#9a9a4a'), hex('#a8a052'), hex('#7a8a3a')];

const MOON_DISC: [number, number, number] = [0.3, 0.42, -0.86];
const STREAM_Z = 24;

export const bambooRecipe: MapRecipe = {
  propStyle: 'moss',
  look: {
    sky: { zenith: '#070d26', horizon: '#1d2a52', band: '#26386a', bandAmount: 0.5, below: '#0c1222', night: true, glow: 0.8, discSize: 0.045 },
    light: { dir: [0.38, 0.8, -0.46], color: '#a9bfff', intensity: 3.3 },
    disc: MOON_DISC,
    hemi: { sky: '#4a64a0', ground: '#222c24', intensity: 2.5 },
    fog: { color: '#1a2c46', sun: '#3e5a92', density: 0.009, falloff: 0.07, glow: 8 },
    grade: { exposure: 1.75, contrast: 1.04, saturation: 1.1, gain: '#d8e4ff', lift: '#12243a', rays: 0.45, rayColor: '#a0b8ff', bloom: 0.85, bloomThreshold: 0.85 },
    wind: { dir: [0.7, 0.7], strength: 0.8, gust: 0.8 },
    rim: { color: '#a8c4ff', strength: 0.85 },
    lit: true,
    shadowExtent: 30,
  },
  build(ctx: BuildContext) {
    const { map, quality: q } = ctx;
    const onPath = (x: number, z: number) => Math.abs(x + Math.sin(z * 0.12) * 0.4) < 1.6;
    // ---------------------------------------------------------- the clearing
    ctx.group.add(
      voxelFloor(map.floor, {
        cell: 0.25,
        layer: 0.08,
        depth: 3,
        jitter: 0.04,
        at: (x, z) => {
          const cx = Math.floor(x / 0.25);
          const cz = Math.floor(z / 0.25);
          const h = hash3(cx, 0, cz, 1);
          if (Math.abs(x) < 1.6) {
            // cobbles: rounded stones with dark gaps between
            const sx = Math.floor((x + 1.6) / 0.5);
            const sz = Math.floor((z + (sx % 2) * 0.25) / 0.5);
            const gap = hash3(sx, 1, sz, 2) < 0.18 || (((x + 1.6) % 0.5) < 0.12 && hash3(cx, 3, cz, 4) < 0.6);
            return gap ? { color: pick(DIRT, h), drop: 1 } : { color: pick(COBBLE, hash3(sx, 2, sz, 5)) };
          }
          if (hash3(cx, 5, cz, 6) < 0.06) return { color: pick(LEAF, h) };
          return { color: fbm2(x * 0.15, z * 0.15, 3, 2) < 0.36 ? pick(DIRT, h) : pick(MOSS, h) };
        },
      }),
    );

    // ---------------------------------------------------------- the forest floor beyond
    const ground = (x: number, z: number) => {
      const d = Math.max(Math.abs(x), Math.abs(z));
      const roll = (fbm2(x * 0.04, z * 0.04, 3, 3) - 0.4) * 4 * Math.min(1, Math.max(0, (d - 20) / 20));
      const stream = Math.abs(z - STREAM_Z - Math.sin(x * 0.08) * 2) < 2.2 ? -0.8 : 0;
      return Math.max(-0.6, roll) + stream;
    };
    const step = q.level === 'low' ? 1 : 0.5;
    const n = Math.round(120 / step);
    const hf: Heightfield = {
      x0: -60,
      z0: -60,
      nx: n,
      nz: n,
      cell: step,
      step: 0.25,
      height: (i, j) => {
        const x = -60 + (i + 0.5) * step;
        const z = -60 + (j + 0.5) * step;
        if (Math.abs(x) < 17.1 && Math.abs(z) < 17.1) return NaN;
        return Math.round(ground(x, z) / 0.25);
      },
      top: (i, j, h) => {
        const x = -60 + (i + 0.5) * step;
        const z = -60 + (j + 0.5) * step;
        const r = hash3(i, h, j, 2);
        if (onPath(x, z) && Math.abs(z) < 60 && h >= 0) return pick(COBBLE, r);
        if (h < -1) return pick(DIRT, r);
        return r < 0.05 ? pick(LEAF, r * 20) : pick(MOSS, r);
      },
      side: (i, j, l) => pick(DIRT, hash3(i, l, j, 3)),
      floor: -6,
    };
    ctx.group.add(terrain(hf, 40));
    ctx.water({ shape: { type: 'rect', x: 0, z: STREAM_Z, w: 120, d: 4.6 }, y: -0.45, deep: '#081420', shallow: '#12283a', ripple: 0.07, opacity: 0.9 });
    ctx.group.add(mountainRing({ inner: 120, outer: 480, cell: q.level === 'low' ? 16 : 10, step: 5, height: 80, base: -1, rock: [hex('#141c30'), hex('#18213a'), hex('#111827')], seed: 71 }));

    // ---------------------------------------------------------- bamboo, deep and dense
    const outside = (x: number, z: number) => (Math.abs(x) > 17.6 || Math.abs(z) > 17.6) && !onPath(x, z) && Math.abs(z - STREAM_Z) > 3.4;
    const wall = scatter(Math.round(34 * q.scenery + 8), { x0: -26, z0: -26, x1: 26, z1: 26 }, (x, z) => outside(x, z) && Math.max(Math.abs(x), Math.abs(z)) < 25, 2.3, 91, ctx.taken);
    const deep = scatter(Math.round(52 * q.scenery), { x0: -58, z0: -58, x1: 58, z1: 58 }, (x, z) => outside(x, z) && Math.max(Math.abs(x), Math.abs(z)) >= 25, 3.6, 92, ctx.taken);
    ctx.trees(wall.map((p, i) => ({ kind: 'bamboo' as const, x: p.x, z: p.z, y: Math.round(ground(p.x, p.z) / 0.25) * 0.25, s: 0.9 + hash3(i, 0, 0, 5) * 0.4 })));
    ctx.trees(deep.map((p, i) => ({ kind: 'bamboo' as const, x: p.x, z: p.z, y: Math.round(ground(p.x, p.z) / 0.25) * 0.25, s: 1 + hash3(i, 1, 0, 5) * 0.4 })), { shadows: false, detail: 0.7 });
    const ferns = scatter(Math.round(30 * q.scenery), { x0: -40, z0: -40, x1: 40, z1: 40 }, (x, z) => outside(x, z), 2.5, 93, ctx.taken);
    ctx.trees(ferns.map((p) => ({ kind: 'bush' as const, x: p.x, z: p.z, y: Math.round(ground(p.x, p.z) / 0.25) * 0.25, s: 0.7 })));

    // ---------------------------------------------------------- lanterns along the path, the shrine, the bridge
    const lanterns = [-46, -38, -30, -22, 22, 30, 38, 46].flatMap((z) => [
      { kind: 'lantern' as const, x: -2.4, z, y: Math.round(ground(-2.4, z) / 0.25) * 0.25 },
      { kind: 'lantern' as const, x: 2.4, z: z + 3, y: Math.round(ground(2.4, z + 3) / 0.25) * 0.25 },
    ]);
    ctx.props([
      ...lanterns.filter((l) => Math.abs(l.z - STREAM_Z) > 3),
      { kind: 'archBridge', x: 0, z: STREAM_Z, y: -0.4, rot: 0 },
      { kind: 'shrine', x: -9, z: -26, rot: 0.5, s: 0.55 },
      { kind: 'statue', x: -6.5, z: -24, rot: 0.4, s: 0.35 },
      { kind: 'statue', x: -7.6, z: -23, rot: 0.6, s: 0.32 },
      { kind: 'statue', x: -5.4, z: -24.6, rot: 0.3, s: 0.3 },
      { kind: 'reeds', x: 8, z: STREAM_Z + 2.1, y: -0.45 },
      { kind: 'reeds', x: -12, z: STREAM_Z - 2.2, y: -0.45 },
      { kind: 'reeds', x: 21, z: STREAM_Z + 1.8, y: -0.45 },
      { kind: 'gardenRock', x: 6, z: STREAM_Z - 2.6, s: 0.7 },
      { kind: 'gardenRock', x: -5, z: STREAM_Z + 2.9, s: 0.6 },
    ]);
    ctx.taken.push({ x: -8, z: -25, r: 4 });

    // ---------------------------------------------------------- undergrowth and air
    ctx.grass({
      bounds: { x0: -45, z0: -45, x1: 45, z1: 45 },
      perM2: 3.5,
      density: (x, z) => {
        if (Math.abs(x) < 1.8 || onPath(x, z)) return 0;
        if (Math.abs(z - STREAM_Z) < 2.6) return 0;
        const inside = Math.abs(x) < 17 && Math.abs(z) < 17;
        const m = fbm2(x * 0.15, z * 0.15, 3, 2);
        return inside ? (m > 0.45 ? 0.35 : 0.08) : 0.7;
      },
      height: (x, z) => (Math.abs(x) < 17 && Math.abs(z) < 17 ? 0 : Math.round(ground(x, z) / 0.25) * 0.25),
      blades: ['#2e5a2a', '#3a6a32', '#24502a', '#4a7a3a'],
      flowers: ['#b8d8ff', '#ffffff'],
      flowerShare: 0.04,
      tallShare: 0.45,
      seed: 31,
    });
    ctx.particles({ kind: 'fireflies', count: 320, center: new THREE.Vector3(0, 1.6, 0), size: new THREE.Vector3(56, 3, 56), scale: 0.05, colors: ['#d8ff8a', '#b8ff9a', '#fff59a'], intensity: 7, seed: 33 });
    ctx.particles({ kind: 'leaves', count: 380, center: new THREE.Vector3(0, 6, 0), size: new THREE.Vector3(40, 12, 40), scale: 0.07, colors: ['#9aa04a', '#7a9a3a', '#b8a852', '#6a8a34'], seed: 34 });
  },
};
