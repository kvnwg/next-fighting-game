/**
 * Frozen Summit, in the morning. A wind-scoured peak above a sea of cloud: snow carved into ripples
 * by the wind, an old ring of standing stones, ice crystals, icicles hanging from the rock under
 * the edge. Other peaks break through the clouds all around, a few with snowy pines clinging on.
 */
import * as THREE from 'three';
import { fbm2, hash3, rng } from '../gfx/noise';
import { floatingIsland, hex, islet, mountainRing, peaks, pick, voxelFloor } from './kit';
import { BuildContext, MapRecipe } from './look';

const SNOW = [hex('#eef4fb'), hex('#e4ecf6'), hex('#f6f9fd'), hex('#dde7f2')];
const SHADE = [hex('#c8d6e8'), hex('#d2deee')];
const STONE = [hex('#aab2be'), hex('#b6bec8'), hex('#a0a8b4')];
const ICE = [hex('#bfe0f6'), hex('#cde8fa'), hex('#b2d6f0')];
const ROCK = [hex('#5a6270'), hex('#646c7a'), hex('#525866'), hex('#6e7684')];
const ICICLE = [hex('#cfeaff'), hex('#dff2ff'), hex('#bfe0fa')];

const SUN: [number, number, number] = [0.72, 0.36, 0.58];

export const summitRecipe: MapRecipe = {
  propStyle: 'snow',
  pine: 'snowPine',
  look: {
    sky: { zenith: '#2c66c0', horizon: '#d6e6f6', band: '#ffe0b4', bandAmount: 0.4, below: '#a8b8d4', glow: 1.0 },
    light: { dir: SUN, color: '#fff0da', intensity: 3.3 },
    hemi: { sky: '#a6c2ec', ground: '#8894a8', intensity: 1.35 },
    fog: { color: '#bccfe6', sun: '#fff0d4', density: 0.002, falloff: 0.012, base: -14, glow: 7 },
    grade: { exposure: 0.95, contrast: 1.12, saturation: 1.1, gain: '#f4f8ff', lift: '#0e1630', rays: 0.45, rayColor: '#fff0d0', bloom: 0.4 },
    wind: { dir: [-0.9, 0.4], strength: 1.4, gust: 1.0 },
    rim: { color: '#fff4e0', strength: 0.6 },
    clouds: [
      { y: -24, cell: 9, thick: 5, cover: 0.66, half: 44, top: '#ffffff', side: '#dfe8f4', bottom: '#8fa2c2', speed: 3, layers: 2 },
      { y: 140, cell: 16, thick: 9, cover: 0.25, half: 36, top: '#ffffff', side: '#eef2f8', bottom: '#bccadc', speed: 2, layers: 2 },
    ],
    shadowExtent: 28,
  },
  build(ctx: BuildContext) {
    const { map, quality: q } = ctx;
    // ---------------------------------------------------------- snow, stone and ice
    const dir = Math.atan2(-0.9, 0.4);
    ctx.group.add(
      voxelFloor(map.floor, {
        cell: 0.25,
        layer: 0.08,
        depth: 3,
        jitter: 0.02,
        at: (x, z) => {
          const r = Math.hypot(x, z);
          const cx = Math.floor(x / 0.25);
          const cz = Math.floor(z / 0.25);
          const h = hash3(cx, 0, cz, 1);
          // the ring of old stones, and a worn slab in the middle, both dusted with snow
          if (r < 5) {
            const a = Math.atan2(x, z);
            const stone = (r > 3.9 && Math.cos(a * 9) > 0.2) || r < 1.3;
            return { color: stone && h > 0.3 ? pick(STONE, h) : pick(SNOW, h) };
          }
          // wind-carved ripples across the snow, ice where it has been scoured bare
          const along = x * Math.cos(dir) + z * Math.sin(dir);
          const ripple = Math.sin(along * 3.2 + fbm2(x * 0.3, z * 0.3, 2, 5) * 6) > 0.72;
          const ice = fbm2(x * 0.18, z * 0.18, 3, 7) > 0.66;
          if (ice) return { color: pick(ICE, h) };
          return { color: ripple ? pick(SHADE, h) : pick(SNOW, h) };
        },
      }),
    );
    ctx.group.add(floatingIsland(map.floor, { depth: 18, cell: 0.35, rock: ROCK, soil: [hex('#7a828e'), hex('#8a92a0')], lip: SNOW, vines: ICICLE, seed: 9, pad: 0.6 }));
    // standing stones of the ring, leaning
    const ring: { kind: 'brokenPillar'; x: number; z: number; s: number; rot: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      ring.push({ kind: 'brokenPillar', x: Math.sin(a) * 13.6, z: Math.cos(a) * 13.6, s: 0.55, rot: a });
    }
    ctx.props(ring);
    ctx.props([
      { kind: 'banner', x: 12.9, z: 4.2, rot: 1.9 },
      { kind: 'banner', x: -12.6, z: -5, rot: -1.2 },
      { kind: 'banner', x: 3.5, z: -13, rot: 3.0 },
    ]);

    // ---------------------------------------------------------- the peaks around
    const R = rng(31);
    const spires = [
      { x: 34, y: -6, z: 22, r: 5 },
      { x: -30, y: -2, z: 30, r: 6 },
      { x: -40, y: -10, z: -18, r: 7 },
      { x: 22, y: 4, z: -38, r: 4 },
      { x: 48, y: -12, z: -10, r: 8 },
      { x: -12, y: -14, z: -48, r: 6 },
    ];
    for (const [i, s] of spires.slice(0, Math.max(3, Math.round(spires.length * q.scenery))).entries()) {
      const g = islet(s.r, s.r * 4, { rock: ROCK, soil: [hex('#7a828e')], lip: SNOW, vines: ICICLE, seed: 70 + i, cell: 0.45 });
      g.position.set(s.x, s.y, s.z);
      ctx.group.add(g);
      const n = 1 + Math.floor(R() * 3);
      ctx.trees(
        Array.from({ length: n }, () => ({ kind: 'snowPine' as const, x: s.x + (R() - 0.5) * s.r, z: s.z + (R() - 0.5) * s.r, y: s.y - 0.2, s: 0.8 + R() * 0.5 })),
      );
    }
    // lone peaks breaking through the sea of cloud, and a low range far off on the horizon
    ctx.group.add(
      peaks({
        count: q.level === 'low' ? 9 : 12,
        inner: 210,
        outer: 380,
        height: [40, 125],
        spread: [0.9, 1.3],
        base: -32,
        cell: q.level === 'low' ? 12 : 8,
        step: 4,
        rock: [hex('#4c566a'), hex('#566078'), hex('#454e60'), hex('#5e687c')],
        snow: [hex('#f2f6fb'), hex('#e6eef8'), hex('#dfe8f3')],
        snowLine: 52,
        seed: 61,
      }),
    );
    ctx.group.add(
      mountainRing({
        inner: 370,
        outer: 760,
        cell: q.level === 'low' ? 16 : 12,
        step: 6,
        height: 70,
        base: -40,
        sharp: 2,
        rock: [hex('#56607a'), hex('#5e6882'), hex('#4e5870')],
        snow: [hex('#eef3f9'), hex('#e2eaf4')],
        snowLine: 0.55,
        seed: 62,
      }),
    );

    // ---------------------------------------------------------- weather
    ctx.particles({ kind: 'snow', count: 1700, center: new THREE.Vector3(0, 8, 0), size: new THREE.Vector3(50, 18, 50), scale: 0.045, colors: ['#ffffff', '#eef4ff'], ground: -30, seed: 23 });
    ctx.particles({ kind: 'dust', count: 220, center: new THREE.Vector3(0, 2.5, 0), size: new THREE.Vector3(30, 5, 30), scale: 0.022, colors: ['#e8f4ff'], seed: 24 });
  },
};
