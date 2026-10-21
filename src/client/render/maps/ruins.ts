/**
 * Sunken Ruins, under the stars. An old temple floor on a stone plinth in a still lake: slate
 * tiles split by roots and moss, puddles holding the moon, crumbling walls draped in vines. Out on
 * the water, broken arches stand to their knees in the lake, one of them sheltering an altar that
 * glows spirit-blue; willow islets, reeds, and fireflies over the water.
 */
import * as THREE from 'three';
import { fbm2, hash3 } from '../gfx/noise';
import { Heightfield, hex, mountainRing, pick, ringWall, scatter, shadeHex, terrain, voxelFloor } from './kit';
import { BuildContext, MapRecipe } from './look';

const SLATE = [hex('#4c535c'), hex('#565d66'), hex('#454b53'), hex('#5c636c'), hex('#50575f')];
const SEAM = [hex('#363b42'), hex('#3c4148')];
const MOSS = [hex('#3e6a3a'), hex('#4a7a42'), hex('#355c32'), hex('#5a8a48')];
const MOSAIC = [hex('#7a8088'), hex('#868c94'), hex('#6e747c')];
const WALL = [hex('#5d636e'), hex('#676d78'), hex('#555b65'), hex('#70767f')];
const MUD = [hex('#3a3a32'), hex('#43423a'), hex('#33332c')];
const GRASS = [hex('#3e6236'), hex('#46703c'), hex('#365830'), hex('#527a44')];

const MOON: [number, number, number] = [-0.42, 0.62, -0.66];
const LAKE_Y = -1.0;
const PUDDLES = [
  { x: 4.5, z: 3.5, r: 1.5 },
  { x: -6, z: 1.5, r: 1.2 },
  { x: 2, z: -9.5, r: 1.3 },
  { x: -3, z: 11, r: 1.4 },
  { x: 10.5, z: -5, r: 1.1 },
  { x: -11, z: -7.5, r: 1.3 },
];
const ARCHES = [
  { x: -6, z: -26, rot: 0.15, s: 1.15 },
  { x: 22, z: -18, rot: -0.9, s: 1 },
  { x: -25, z: 9, rot: 1.3, s: 0.9 },
];

const inPuddle = (x: number, z: number) => PUDDLES.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * (0.85 + fbm2(x * 1.3, z * 1.3, 2, 9) * 0.35));

export const ruinsRecipe: MapRecipe = {
  propStyle: 'spirit',
  look: {
    sky: { zenith: '#040a1c', horizon: '#173054', band: '#1f416a', bandAmount: 0.5, below: '#0a1424', night: true, glow: 0.9, discSize: 0.05 },
    light: { dir: MOON, color: '#b8c8ff', intensity: 2.9 },
    hemi: { sky: '#4c6694', ground: '#1e2834', intensity: 1.75 },
    fog: { color: '#172a42', sun: '#4a6aa0', density: 0.01, falloff: 0.05, glow: 8 },
    grade: { exposure: 1.32, contrast: 1.06, saturation: 1.12, gain: '#d8e4ff', lift: '#0a1a2c', rays: 0.4, rayColor: '#9fb8ff', bloom: 0.8, bloomThreshold: 0.85 },
    wind: { dir: [0.6, -0.8], strength: 0.45, gust: 0.4 },
    rim: { color: '#9fc0ff', strength: 0.8 },
    clouds: [{ y: 110, cell: 14, thick: 4, cover: 0.2, half: 40, top: '#3a4a6a', side: '#2a3650', bottom: '#1a2236', speed: 1, opacity: 0.85, layers: 1 }],
    lit: true,
    shadowExtent: 30,
  },
  build(ctx: BuildContext) {
    const { map, quality: q } = ctx;
    const mossAt = (x: number, z: number) => {
      let m = fbm2(x * 0.25, z * 0.25, 3, 4) - 0.55;
      for (const d of map.decals) if (d.tex === 'moss' && d.shape.type === 'circle') m += Math.max(0, 1 - Math.hypot(x - d.shape.x, z - d.shape.z) / d.shape.r) * 0.7;
      return m;
    };

    // ---------------------------------------------------------- the temple floor
    ctx.group.add(
      voxelFloor(map.floor, {
        cell: 0.25,
        layer: 0.08,
        depth: 4,
        jitter: 0.03,
        pad: 1.2,
        at: (x, z) => {
          const r = Math.hypot(x, z);
          const cx = Math.floor(x / 0.25);
          const cz = Math.floor(z / 0.25);
          const h = hash3(cx, 0, cz, 1);
          if (inPuddle(x, z)) return { color: pick(MUD, h), drop: 1 };
          // the central mosaic: rings of pale stone
          if (r < 4) {
            const ring = Math.floor(r / 0.75) % 2 === 0;
            return { color: ring ? pick(MOSAIC, h) : pick(SLATE, h) };
          }
          // slate tiles split by roots and moss
          const tx = Math.floor(cx / 5);
          const tz = Math.floor(cz / 5);
          const seam = ((cx % 5) + 5) % 5 === 0 || ((cz % 5) + 5) % 5 === 0;
          const crack = fbm2(x * 0.9, z * 0.9, 2, 6) > 0.7;
          const m = mossAt(x, z);
          if (m > 0.05 && hash3(cx, 2, cz, 3) < m * 1.6) return { color: pick(MOSS, h), drop: 0 };
          if (seam || crack) return { color: m > -0.15 ? pick(MOSS, h) : pick(SEAM, h), drop: crack ? 1 : 0 };
          const tile = pick(SLATE, hash3(tx, 1, tz, 2));
          // a few tiles have tipped and sunk
          return { color: shadeHex(tile, 0.94 + h * 0.1), drop: hash3(tx, 4, tz, 5) < 0.08 ? 1 : 0 };
        },
      }),
    );
    for (const p of PUDDLES) ctx.water({ shape: { type: 'circle', x: p.x, z: p.z, r: p.r * 1.15 }, y: -0.035, deep: '#0c1622', shallow: '#1a2a36', ripple: 0.025, opacity: 0.9 });

    // the plinth's edge, stepping down into the lake
    const plinth = ringWall({
        r: 18.1,
        halfWidth: 1.25,
        height: 1.1,
        voxel: 0.2,
        shadows: false,
        at: (d, y, _a, x, yi, z) => {
          const top = d < -0.4 ? 1.0 : d < 0.4 ? 0.6 : 0.2;
          if (y > top) return null;
          return pick(WALL, hash3(x, yi, z, 3));
        },
      });
    plinth.position.y = LAKE_Y;
    ctx.group.add(plinth);
    // a crumbling wall around the floor, with gaps where it has fallen
    ctx.group.add(
      ringWall({
        r: 17.5,
        halfWidth: 0.36,
        height: 3,
        voxel: 0.16,
        gaps: [
          { at: 0.9, width: 3 },
          { at: 2.6, width: 4.5 },
          { at: -1.7, width: 2.4 },
          { at: Math.PI, width: 3.2 },
        ],
        at: (d, y, a, x, yi, z) => {
          const top = 0.5 + fbm2(a * 6, 0, 3, 11) * 2.6 + (hash3(Math.floor(a * 60), 0, 0, 2) - 0.5) * 0.3;
          if (y > top || Math.abs(d) > 0.34) return null;
          const course = Math.floor(y / 0.36);
          const block = (Math.floor(a * 17.5 / 0.6 + (course % 2) * 0.5) + course) % 2;
          let c = pick(WALL, hash3(x, yi, z, 4));
          if (Math.floor(y * 100) % 36 < 4) c = shadeHex(c, 0.75);
          else if (block) c = shadeHex(c, 0.93);
          // moss on top and in the lee
          if (y > top - 0.25 || fbm2(a * 30, y * 3, 2, 7) > 0.68) c = pick(MOSS, hash3(x, yi, z, 5));
          return c;
        },
      }),
    );

    // ---------------------------------------------------------- the lake and its shores
    const shore = (x: number, z: number) => {
      const r = Math.hypot(x, z);
      const isles = [
        { x: 30, z: 14, r: 6 },
        { x: -18, z: -34, r: 5 },
        { x: 34, z: -30, r: 4.5 },
        { x: -36, z: 26, r: 7 },
      ];
      let h = -2.2 + Math.max(0, (r - 55) / 20) * 3.5 + fbm2(x * 0.05, z * 0.05, 3, 12) * 1.4;
      for (const i of isles) h = Math.max(h, 0.4 + (1 - Math.hypot(x - i.x, z - i.z) / i.r) * 1.2 - 0.6);
      return h;
    };
    const step = q.level === 'low' ? 1 : 0.5;
    const n = Math.round(140 / step);
    const hf: Heightfield = {
      x0: -70,
      z0: -70,
      nx: n,
      nz: n,
      cell: step,
      step: 0.25,
      height: (i, j) => {
        const x = -70 + (i + 0.5) * step;
        const z = -70 + (j + 0.5) * step;
        if (Math.hypot(x, z) < 19.3) return NaN;
        return Math.round((shore(x, z) + LAKE_Y) / 0.25);
      },
      top: (i, j, h) => (h * 0.25 > LAKE_Y + 0.1 ? pick(GRASS, hash3(i, h, j, 2)) : pick(MUD, hash3(i, h, j, 3))),
      side: (i, j, l, below) => (below === 0 && l * 0.25 > LAKE_Y ? pick(GRASS, hash3(i, l, j, 4)) : pick(MUD, hash3(i, l, j, 5))),
      floor: -16,
    };
    ctx.group.add(terrain(hf, 40));
    ctx.water({ shape: { type: 'circle', x: 0, z: 0, r: 75 }, y: LAKE_Y + 0.15, deep: '#06101c', shallow: '#0e1e2c', ripple: 0.03, opacity: 0.94 });
    ctx.group.add(
      mountainRing({
        inner: 120,
        outer: 500,
        cell: q.level === 'low' ? 16 : 10,
        step: 5,
        height: 90,
        base: LAKE_Y,
        rock: [hex('#1a2234'), hex('#1f283c'), hex('#161d2c')],
        grass: [hex('#18261e'), hex('#1c2c22')],
        seed: 41,
      }),
    );

    // ---------------------------------------------------------- ruins in the water
    ctx.props([
      ...ARCHES.map((a) => ({ kind: 'arch' as const, x: a.x, z: a.z, rot: a.rot, s: a.s, y: LAKE_Y - 0.3 })),
      { kind: 'altar', x: ARCHES[0].x, z: ARCHES[0].z + 0.2, y: LAKE_Y + 0.15, rot: ARCHES[0].rot },
      { kind: 'pillar', x: 26, z: 4, y: LAKE_Y - 1.6, s: 1.1, style: 'spirit' },
      { kind: 'brokenPillar', x: -22, z: -14, y: LAKE_Y - 0.6, s: 1.2, style: 'spirit' },
      { kind: 'brokenPillar', x: 12, z: 28, y: LAKE_Y - 0.4, s: 1.0, style: 'spirit' },
      { kind: 'brokenPillar', x: -14, z: 25, y: LAKE_Y - 0.8, s: 1.3, style: 'spirit' },
      { kind: 'statue', x: 30, z: 14, y: 0, rot: -2.2, s: 1.1, style: 'spirit' },
      { kind: 'lantern', x: -36, z: 26, y: 0.4, style: 'spirit' },
      { kind: 'lantern', x: 34, z: -30, y: 0.2, style: 'spirit' },
      // lanterns on the floor's edge, by the statues
      { kind: 'lantern', x: 2.2, z: 15, style: 'spirit' },
      { kind: 'lantern', x: -2.2, z: -15, style: 'spirit' },
      ...scatter(Math.round(14 * q.scenery + 4), { x0: -60, z0: -60, x1: 60, z1: 60 }, (x, z) => Math.hypot(x, z) > 21 && Math.hypot(x, z) < 58 && shore(x, z) < -0.2 && shore(x, z) > -1.6, 3, 81, ctx.taken).map((p) => ({ kind: 'reeds' as const, x: p.x, z: p.z, y: LAKE_Y + 0.05 })),
    ]);
    ctx.trees([
      { kind: 'willow', x: 30, z: 17, y: 0.4, s: 1.2 },
      { kind: 'willow', x: -36, z: 24, y: 0.5, s: 1.4 },
      { kind: 'willow', x: -19, z: -35, y: 0.3, s: 1.1 },
      { kind: 'bush', x: 35, z: -29, y: 0.2 },
      { kind: 'bush', x: -33, z: 29, y: 0.5 },
      ...scatter(Math.round(40 * q.scenery), { x0: -70, z0: -70, x1: 70, z1: 70 }, (x, z) => shore(x, z) > 0.5, 4, 82, ctx.taken).map((p, i) => ({ kind: (i % 3 ? 'pine' : 'willow') as 'pine' | 'willow', x: p.x, z: p.z, y: Math.round((shore(p.x, p.z) + LAKE_Y) / 0.25) * 0.25, s: 1 + hash3(i, 0, 0, 3) * 0.5 })),
    ]);

    // ---------------------------------------------------------- growth in the cracks
    ctx.grass({
      bounds: { x0: -17, z0: -17, x1: 17, z1: 17 },
      perM2: 3,
      density: (x, z) => {
        if (Math.hypot(x, z) > 16.8 || inPuddle(x, z) || Math.hypot(x, z) < 4) return 0;
        const m = mossAt(x, z);
        return m > 0 ? Math.min(1, m * 1.8) : 0.04;
      },
      blades: ['#3a6634', '#467440', '#2f5a2c', '#58844a'],
      flowers: ['#9fd8ff', '#e8f4ff'],
      flowerShare: 0.06,
      tallShare: 0.2,
      seed: 21,
    });
    ctx.grass({
      bounds: { x0: -60, z0: -60, x1: 60, z1: 60 },
      perM2: 3,
      density: (x, z) => (Math.hypot(x, z) > 20 && shore(x, z) > 0.45 ? 0.8 : 0),
      height: (x, z) => Math.round((shore(x, z) + LAKE_Y) / 0.25) * 0.25,
      blades: ['#3a6634', '#467440', '#2f5a2c', '#58844a'],
      tallShare: 0.5,
      seed: 22,
    });

    // ---------------------------------------------------------- the night air
    ctx.particles({ kind: 'fireflies', count: 220, center: new THREE.Vector3(0, 1.8, 0), size: new THREE.Vector3(60, 3, 60), scale: 0.05, colors: ['#b8ffd8', '#9ff0ff', '#d8ffb0'], intensity: 6, seed: 4 });
    ctx.particles({ kind: 'spores', count: 160, center: new THREE.Vector3(0, 2.5, 0), size: new THREE.Vector3(36, 6, 36), scale: 0.03, colors: ['#7fd8ff', '#b8e8ff'], intensity: 3, seed: 5 });
    ctx.particles({ kind: 'leaves', count: 120, center: new THREE.Vector3(0, 6, 0), size: new THREE.Vector3(40, 12, 40), scale: 0.07, colors: ['#4a7a3a', '#5a8a44', '#6e9a4a'], seed: 6 });
  },
};
