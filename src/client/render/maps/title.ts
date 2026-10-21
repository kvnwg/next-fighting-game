/**
 * The title screen's vista, never fought on: a grassy promontory jutting out over a deep valley at
 * sunset. Below, a forest of pines and cherries around a lake that mirrors the sky, a river winding
 * off toward a great snow-capped peak, ranges fading into the haze, and mist pooled in the valley.
 * An old cherry leans over the edge, shedding petals into the wind. The Ronin sits at the tip
 * (render/title/ronin.ts) with his legs over the drop, at the origin, looking down +Z.
 */
import * as THREE from 'three';
import { LOBBY_MAP, MapDef } from '../../../shared/maps';
import { fbm2, hash3, rng } from '../gfx/noise';
import { TreePlacement } from '../gfx/trees';
import { Heightfield, hex, mountainRing, pick, terrain } from './kit';
import { BuildContext, MapRecipe } from './look';
import { DETAIL_LAYER } from '../renderer';

/** Client-only map for the title screen: nothing to walk on, nothing to fight. */
export const TITLE_MAP: MapDef = {
  ...LOBBY_MAP,
  id: 'title',
  name: 'The Edge of the World',
  jp: '崖',
  description: '',
  floor: [{ type: 'circle', x: 0, z: 0, r: 2 }],
  props: [],
  decals: [],
  hazards: [],
  spawns: [{ x: 0, z: 0, yaw: 0 }],
  safeZone: undefined,
  dummies: undefined,
};

/** The light comes from a little higher than the disc sits, so the cliff top isn't all in shade. */
const SUN: [number, number, number] = [-0.24, 0.26, 0.93];
/** The sun itself, low over the horizon right of the great peak (as seen from behind him). */
const DISC: [number, number, number] = [-0.33, 0.065, 0.94];

const GRASS = [hex('#6f9a3c'), hex('#7aa645'), hex('#86b04c'), hex('#638c35')];
const GRASS_DRY = [hex('#a59a4c'), hex('#97904a'), hex('#b0a456')];
const ROCK = [hex('#8e7c76'), hex('#9a877e'), hex('#84726c'), hex('#a28e84')];
const ROCK_DARK = [hex('#6a5a5e'), hex('#745f62'), hex('#625256')];
const EARTH = [hex('#6b5040'), hex('#5e4636'), hex('#77594a')];
const FOREST = [hex('#4a6c34'), hex('#52763c'), hex('#43632e'), hex('#5a7e42')];
const MEADOW = [hex('#8aa850'), hex('#96b258'), hex('#7e9c48')];
const SNOW = [hex('#f6f2f4'), hex('#ece6ee'), hex('#fffafa')];
const PEAK_ROCK = [hex('#5a5068'), hex('#645a72'), hex('#50485e')];

/** The promontory's edge: z of the lip at x (the tip is at the origin, just in front of the Ronin). */
const edgeZ = (x: number) => 0.32 - 0.03 * x * x - Math.max(0, Math.abs(x) - 1.2) * 0.35 + (fbm2(x * 0.35, 3.1, 2, 41) - 0.5) * 1.4 * Math.min(1, Math.abs(x) / 3);

/** Height of the plateau's top (metres), or NaN past the edge. */
function plateauY(x: number, z: number): number {
  const e = edgeZ(x);
  if (z > e) return NaN;
  // the seat at the tip is dead flat
  if (Math.abs(x) < 1.6 && z > -2) return 0;
  const back = Math.max(0, -z - 5);
  let y = back * 0.18 + (fbm2(x * 0.09, z * 0.09, 3, 43) - 0.5) * 1.6 * Math.min(1, back / 4 + Math.abs(x) * 0.15);
  // the lip rounds over before the drop
  const toEdge = e - z;
  if (toEdge < 1.2) y -= (1.2 - toEdge) * 0.35;
  return Math.max(-0.6, y);
}

/** The valley floor and its walls (metres). */
const LAKE = { x: 8, z: 168, r: 34 };
const riverX = (z: number) => LAKE.x + Math.sin((z - LAKE.z) * 0.018) * 26 + Math.sin(z * 0.043) * 6;
function valleyY(x: number, z: number): number {
  const n = fbm2(x * 0.01, z * 0.01, 4, 47);
  const w = 95 + Math.max(0, z) * 0.25;
  const d = Math.abs(x - riverX(z) * 0.5) / w;
  let y = -72 + n * 5 + THREE.MathUtils.smoothstep(d, 0.75, 2.4) * (75 + n * 55);
  // beside the promontory the land stays up at the plateau's height: a line of cliffs, set back
  const back = THREE.MathUtils.smoothstep(-z, -6, 30) * THREE.MathUtils.smoothstep(Math.abs(x), 30, 64);
  y = THREE.MathUtils.lerp(y, -1 + n * 8, back);
  // the far end rises toward the great peak
  y += THREE.MathUtils.smoothstep(z, 300, 480) * 30;
  // lake bed and river channel
  if (Math.hypot(x - LAKE.x, (z - LAKE.z) * 0.8) < LAKE.r) y = Math.min(y, -73.5);
  if (z > LAKE.z && z < 380 && Math.abs(x - riverX(z)) < 4.5) y = Math.min(y, -73.5);
  return y;
}

export const titleRecipe: MapRecipe = {
  propStyle: 'moss',
  look: {
    sky: { zenith: '#26357e', horizon: '#ff9e6c', band: '#ff6e5c', bandAmount: 0.85, below: '#7a5272', glow: 0.9, discSize: 0.045 },
    light: { dir: SUN, color: '#ffc896', intensity: 3.2 },
    disc: DISC,
    hemi: { sky: '#b4a8dc', ground: '#7a5a46', intensity: 1.5 },
    fog: { color: '#c8909e', sun: '#ffb886', density: 0.0007, falloff: 0.011, base: -70, glow: 18 },
    grade: { exposure: 0.96, contrast: 1.14, saturation: 1.2, gain: '#fff0e2', lift: '#120a26', rays: 0.4, rayColor: '#ffc896', bloom: 0.42, bloomThreshold: 1.2, vignette: 0.5 },
    // off the cliff, out over the drop: his scarf and the petals stream toward the sunset
    wind: { dir: [0.28, 0.96], strength: 1.25, gust: 1.1 },
    rim: { color: '#ffd8b4', strength: 0.5 },
    // high streaks lit from below by the sunset
    clouds: [{ y: 170, cell: 18, thick: 6, cover: 0.32, half: 36, top: '#ffc8a8', side: '#f09088', bottom: '#7a4a72', speed: 3, layers: 2 }],
    shadowExtent: 14,
  },
  build(ctx: BuildContext) {
    const q = ctx.quality;
    const low = q.level === 'low';

    // ---------------------------------------------------------- the promontory
    const pc = 0.25;
    const pStep = 0.25;
    const P = { x0: -36, z0: -32, x1: 36, z1: 2 };
    const pnx = Math.round((P.x1 - P.x0) / pc);
    const pnz = Math.round((P.z1 - P.z0) / pc);
    const pH = new Float32Array(pnx * pnz);
    for (let j = 0; j < pnz; j++) {
      for (let i = 0; i < pnx; i++) {
        const y = plateauY(P.x0 + (i + 0.5) * pc, P.z0 + (j + 0.5) * pc);
        pH[j * pnx + i] = Number.isNaN(y) ? NaN : Math.round(y / pStep);
      }
    }
    const plateau: Heightfield = {
      x0: P.x0,
      z0: P.z0,
      nx: pnx,
      nz: pnz,
      cell: pc,
      step: pStep,
      height: (i, j) => (i < 0 || j < 0 || i >= pnx || j >= pnz ? NaN : pH[j * pnx + i]),
      top: (i, j, h) => {
        const x = P.x0 + (i + 0.5) * pc;
        const z = P.z0 + (j + 0.5) * pc;
        const r = hash3(i, h, j, 51);
        const toEdge = edgeZ(x) - z;
        if (toEdge < 0.6 + r * 0.8 && !(Math.abs(x) < 1.6 && z > -2)) return pick(ROCK, r);
        if (fbm2(x * 0.2, z * 0.2, 2, 52) > 0.62) return pick(GRASS_DRY, r);
        return pick(GRASS, r);
      },
      side: (i, j, layer, below) => {
        const r = hash3(i, layer, j, 53);
        if (below < 1) return pick(GRASS, r);
        if (below < 5) return pick(EARTH, r);
        // strata across the cliff face
        return Math.floor(layer / 9) % 3 === 0 ? pick(ROCK_DARK, r) : pick(ROCK, r);
      },
      floor: Math.round(-90 / pStep),
    };
    ctx.group.add(terrain(plateau, 32, { shadows: true }));

    // ---------------------------------------------------------- the valley
    const vc = low ? 4 : 3;
    const V = { x0: -260, z0: -60, x1: 260, z1: 440 };
    const vnx = Math.round((V.x1 - V.x0) / vc);
    const vnz = Math.round((V.z1 - V.z0) / vc);
    const vStep = 1;
    const vH = new Float32Array(vnx * vnz);
    for (let j = 0; j < vnz; j++) {
      for (let i = 0; i < vnx; i++) {
        const x = V.x0 + (i + 0.5) * vc;
        const z = V.z0 + (j + 0.5) * vc;
        // under the promontory the plateau's own cliff takes over
        vH[j * vnx + i] = !Number.isNaN(plateauY(x, z)) && x > P.x0 && x < P.x1 && z > P.z0 ? NaN : Math.round(valleyY(x, z) / vStep);
      }
    }
    const valley: Heightfield = {
      x0: V.x0,
      z0: V.z0,
      nx: vnx,
      nz: vnz,
      cell: vc,
      step: vStep,
      height: (i, j) => (i < 0 || j < 0 || i >= vnx || j >= vnz ? NaN : vH[j * vnx + i]),
      top: (i, j, h) => {
        const r = hash3(i, h, j, 55);
        const y = h * vStep;
        const x = V.x0 + (i + 0.5) * vc;
        const z = V.z0 + (j + 0.5) * vc;
        // steep ground is bare rock
        const slope = Math.abs(valleyY(x + vc, z) - valleyY(x - vc, z)) + Math.abs(valleyY(x, z + vc) - valleyY(x, z - vc));
        if (slope > vc * 2.6) return pick(ROCK, r);
        if (y < -71) return pick(MEADOW, r);
        return fbm2(x * 0.03, z * 0.03, 2, 56) > 0.45 ? pick(FOREST, r) : pick(MEADOW, r);
      },
      side: (i, j, layer) => pick(ROCK, hash3(i, layer, j, 57)),
      floor: -100,
    };
    ctx.group.add(terrain(valley, 40, { shadows: false }));

    // the lake and the river leaving it, mirroring the sunset
    ctx.water({ shape: { type: 'circle', x: LAKE.x, z: LAKE.z, r: LAKE.r * 1.3 }, y: -72.6, deep: '#2a2a4a', shallow: '#5a4a68', ripple: 0.03 });
    for (let z = LAKE.z + 24; z < 380; z += 18) {
      ctx.water({ shape: { type: 'rect', x: riverX(z + 9), z: z + 9, w: 9, d: 19 }, y: -72.6, deep: '#2a2a4a', shallow: '#5a4a68', ripple: 0.03 });
    }

    // ---------------------------------------------------------- the great peak, and the ranges
    const fuji = { x: 30, z: 640, r: 420, h: 250 };
    const fc = low ? 10 : 7;
    const fn = Math.ceil((fuji.r * 2) / fc);
    const fH = new Float32Array(fn * fn);
    const fStep = 3;
    for (let j = 0; j < fn; j++) {
      for (let i = 0; i < fn; i++) {
        const x = fuji.x - fuji.r + (i + 0.5) * fc;
        const z = fuji.z - fuji.r + (j + 0.5) * fc;
        const d = Math.hypot(x - fuji.x, z - fuji.z) / fuji.r;
        if (d >= 1) {
          fH[j * fn + i] = NaN;
          continue;
        }
        // concave flanks, a flattened crater rim, gullies down the sides
        const a = Math.atan2(x - fuji.x, z - fuji.z);
        const gully = 1 - Math.abs(Math.sin(a * 11 + fbm2(x * 0.01, z * 0.01, 2, 61) * 3)) * 0.06 * d;
        const h = fuji.h * Math.min(0.94, Math.pow(1 - d, 1.9) * 1.05) * gully;
        fH[j * fn + i] = Math.round(h / fStep);
      }
    }
    const peak: Heightfield = {
      x0: fuji.x - fuji.r,
      z0: fuji.z - fuji.r,
      nx: fn,
      nz: fn,
      cell: fc,
      step: fStep,
      height: (i, j) => (i < 0 || j < 0 || i >= fn || j >= fn ? NaN : fH[j * fn + i]),
      top: (i, j, h) => {
        const r = hash3(i, h, j, 62);
        const x = fuji.x - fuji.r + (i + 0.5) * fc;
        const z = fuji.z - fuji.r + (j + 0.5) * fc;
        // snow streaks reach further down the gullies
        const line = 0.5 + fbm2(x * 0.02, z * 0.02, 2, 63) * 0.18;
        return h * fStep > fuji.h * line ? pick(SNOW, r) : pick(PEAK_ROCK, r);
      },
      side: (i, j, layer) => {
        const r = hash3(i, layer, j, 64);
        return layer * fStep > fuji.h * 0.58 && r < 0.7 ? pick(SNOW, r) : pick(PEAK_ROCK, r);
      },
      floor: 0,
    };
    const fujiMesh = terrain(peak, 32);
    fujiMesh.position.y = -60;
    ctx.group.add(fujiMesh);

    ctx.group.add(
      mountainRing({
        inner: 430,
        outer: 900,
        cell: low ? 16 : 12,
        step: 6,
        height: 120,
        base: -70,
        sharp: 2,
        rock: [hex('#4c4664'), hex('#544e6c'), hex('#46405c')],
        snow: [hex('#f0e8f0'), hex('#e6dcea')],
        snowLine: 0.62,
        seed: 66,
        // keep the great peak clear
        gapAt: Math.atan2(fuji.x, fuji.z),
        gapWidth: 0.35,
      }),
    );

    // ---------------------------------------------------------- trees
    const R = rng(71);
    const forest: TreePlacement[] = [];
    const want = low ? 360 : q.level === 'medium' ? 620 : 900;
    for (let n = 0; forest.length < want && n < want * 8; n++) {
      const x = -190 + R() * 380;
      const z = 20 + R() * 340;
      const y = valleyY(x, z);
      if (y < -73 || y > -40) continue;
      if (Math.hypot(x - LAKE.x, (z - LAKE.z) * 0.8) < LAKE.r + 3) continue;
      if (Math.abs(x - riverX(z)) < 7) continue;
      const dense = fbm2(x * 0.03, z * 0.03, 2, 56);
      if (dense < 0.4 && R() > 0.25) continue;
      const kind = R() < 0.14 ? 'sakura' : 'pine';
      forest.push({ kind, x, z, y: Math.round(y) - 0.2, s: 0.75 + R() * 0.5 });
    }
    // far below and far off: big chunks (few draws), and left out of the lake's reflection
    const woods = new THREE.Group();
    ctx.group.add(woods);
    ctx.trees(forest, { shadows: false, detail: 0.5, chunk: 160, into: woods });
    woods.traverse((o) => o.layers.set(DETAIL_LAYER));

    // the old cherry on the promontory, leaning out over the drop, and pines along the cliff top
    ctx.trees([{ kind: 'grandSakura', x: -3.9, z: -3.2, y: plateauY(-3.9, -3.2) - 0.1, rot: 2.3, s: 0.62, variant: 0 }], { shadows: true });
    const ridge: TreePlacement[] = [];
    for (let i = 0; i < 28; i++) {
      const x = -40 + R() * 80;
      const z = -38 + R() * 30;
      const y = plateauY(x, z);
      if (Number.isNaN(y) || Math.hypot(x, z) < 9 || edgeZ(x) - z < 2) continue;
      ridge.push({ kind: R() < 0.7 ? 'pine' : 'sakura', x, z, y: y - 0.1, s: 0.9 + R() * 0.5 });
    }
    ctx.trees(ridge, { shadows: true });

    // a few rocks near the tip
    ctx.props([
      { kind: 'rock', x: -1.5, z: -2.6, y: plateauY(-1.5, -2.6) - 0.1, rot: 1.2, s: 0.4 },
      { kind: 'rock', x: 3.6, z: -4.4, y: plateauY(3.6, -4.4) - 0.1, rot: 2.6, s: 0.6 },
    ]);

    // ---------------------------------------------------------- grass, petals, motes
    ctx.grass({
      bounds: { x0: -14, z0: -14, x1: 14, z1: 1 },
      perM2: 6,
      height: (x, z) => {
        const y = plateauY(x, z);
        return Number.isNaN(y) ? 0 : Math.round(y / pStep) * pStep;
      },
      density: (x, z) => {
        const y = plateauY(x, z);
        if (Number.isNaN(y) || edgeZ(x) - z < 0.5) return 0;
        // a bare patch where he sits, and short grass where the camera passes
        if (Math.hypot(x, z + 0.4) < 1.1) return 0;
        if (x > 0.5 && x < 4 && z > -5) return 0.15;
        return 0.55 + fbm2(x * 0.3, z * 0.3, 2, 72) * 0.6;
      },
      blades: ['#86ae4c', '#94bc56', '#7aa044', '#a8b85a'],
      flowers: ['#f7f0f4', '#ffd36a', '#f2a6c4'],
      flowerShare: 0.12,
      tallShare: 0.2,
      size: 0.8,
      seed: 73,
    });
    const PETALS = ['#f7a8c6', '#fbbdd2', '#ffd6e4', '#f190b2', '#fff0f5'];
    ctx.particles({ kind: 'petals', count: 600, center: new THREE.Vector3(-4.5, 3, -5.5), size: new THREE.Vector3(9, 6, 8), scale: 0.06, colors: PETALS, ground: 0, seed: 74, anchored: true });
    // petals carried out over the drop, falling until the haze takes them
    ctx.particles({ kind: 'petals', count: 900, center: new THREE.Vector3(0, -6, 16), size: new THREE.Vector3(30, 22, 34), scale: 0.07, colors: PETALS, ground: -90, seed: 75, anchored: true });
    ctx.particles({ kind: 'dust', count: 240, center: new THREE.Vector3(0, 1.6, 0), size: new THREE.Vector3(14, 4, 14), scale: 0.02, colors: ['#ffe2b8'], seed: 76, anchored: true });
  },
};
