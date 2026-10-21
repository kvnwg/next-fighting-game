/**
 * Voxel versions of every map prop. Footprints match the gameplay colliders in shared/physics.ts.
 * Each prop is built once per kind, variant and style into up to four parts (lit stone and wood,
 * cloth that sways, glowing voxels that are their own light, and glassy crystal) and placed as
 * instances, so a field of forty lanterns costs a handful of draw calls.
 */
import * as THREE from 'three';
import { PropKind } from '../../../shared/maps';
import { fbm3, hash3, rng } from './noise';
import { VoxelVolume, ColorInput, hex, meshVoxels, mixHex, shadeHex } from './voxel';

export type PropStyle = 'plain' | 'moss' | 'snow' | 'ash' | 'spirit';

export interface PropParts {
  solid?: THREE.BufferGeometry;
  sway?: THREE.BufferGeometry;
  glow?: THREE.BufferGeometry;
  glass?: THREE.BufferGeometry;
  /** point lights to add at night (local space) */
  lights?: { x: number; y: number; z: number; color: string; intensity: number; distance: number }[];
  /** animated fire (local space) */
  flames?: { x: number; y: number; z: number; size: number }[];
}

type V3 = [number, number, number];

const STONE = [hex('#8f8c84'), hex('#9a978e'), hex('#a5a299'), hex('#86837b')];
const DARK_STONE = [hex('#5b5a58'), hex('#666461'), hex('#52504e')];
const MOSS = [hex('#4f6e2e'), hex('#5c7d34'), hex('#6b8c3c'), hex('#435f28')];
const SNOW = [hex('#eef3f8'), hex('#f8fbfd'), hex('#e2eaf2')];
const VERMILION = [hex('#c8352b'), hex('#d13d31'), hex('#b82f26')];
const BLACK = [hex('#262022'), hex('#2e2729'), hex('#1f1a1c')];
const WOOD = [hex('#7a5638'), hex('#86603f'), hex('#6c4a30')];
const DARK_WOOD = [hex('#4a3020'), hex('#553826'), hex('#3f281b')];

const pickH = (pal: number[], x: number, y: number, z: number, seed = 0) => pal[Math.floor(hash3(x, y, z, seed) * pal.length)];

/** Weather on top: moss or snow on upward faces, soot for ash. */
function weather(vol: VoxelVolume, style: PropStyle, seed: number, amount = 0.6): void {
  if (style === 'plain') return;
  if (style === 'spirit') style = 'moss';
  for (let y = vol.ny - 1; y >= 0; y--) {
    for (let z = 0; z < vol.nz; z++) {
      for (let x = 0; x < vol.nx; x++) {
        const c = vol.get(x, y, z);
        if (c < 0 || vol.has(x, y + 1, z)) continue;
        const n = fbm3(x * 0.25, y * 0.25, z * 0.25, 2, seed);
        if (n < 1 - amount) continue;
        if (style === 'moss') vol.set(x, y, z, pickH(MOSS, x, y, z, seed));
        else if (style === 'snow') vol.set(x, y, z, pickH(SNOW, x, y, z, seed));
        else vol.set(x, y, z, shadeHex(c, 0.55));
      }
    }
  }
}

/** Moss creeping down the sides (ruins). */
function creep(vol: VoxelVolume, seed: number, amount = 0.25): void {
  for (let y = 0; y < vol.ny; y++) {
    for (let z = 0; z < vol.nz; z++) {
      for (let x = 0; x < vol.nx; x++) {
        if (!vol.has(x, y, z)) continue;
        const exposed = !vol.has(x + 1, y, z) || !vol.has(x - 1, y, z) || !vol.has(x, y, z + 1) || !vol.has(x, y, z - 1);
        if (!exposed) continue;
        const n = fbm3(x * 0.18, y * 0.12, z * 0.18, 3, seed + 5);
        if (n > 1 - amount * (1 - y / vol.ny * 0.6)) vol.set(x, y, z, pickH(MOSS, x, y, z, seed));
      }
    }
  }
}

function stoneFn(pal: number[], seed: number, blocks?: { h: number; w: number }) {
  return (x: number, y: number, z: number): ColorInput => {
    let c = pickH(pal, x, y, z, seed);
    if (blocks) {
      // mortar lines between courses of blocks
      const course = Math.floor(y / blocks.h);
      const off = course % 2 ? Math.floor(blocks.w / 2) : 0;
      if (y % blocks.h === 0 || (x + z + off) % blocks.w === 0) c = shadeHex(c, 0.72);
    }
    return c;
  };
}

function mesh(vol: VoxelVolume, seed: number, jitter = 0.06): THREE.BufferGeometry {
  return meshVoxels(vol, { jitter, seed });
}

// ----------------------------------------------------------------------------------------- props

function lantern(style: PropStyle, seed: number): PropParts {
  const v = 0.08;
  const vol = VoxelVolume.cubic(10, 24, 10, v);
  const glow = VoxelVolume.cubic(10, 24, 10, v);
  const s = stoneFn(STONE, seed);
  vol.box([-0.36, 0, -0.36], [0.36, 0.16, 0.36], s);
  vol.box([-0.28, 0.16, -0.28], [0.28, 0.24, 0.28], s);
  vol.box([-0.12, 0.24, -0.12], [0.12, 0.88, 0.12], s);
  vol.box([-0.28, 0.88, -0.28], [0.28, 1.04, 0.28], s);
  // fire box: corner posts with glowing paper between
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) vol.box([x * 0.2 - 0.04, 1.04, z * 0.2 - 0.04], [x * 0.2 + 0.04, 1.4, z * 0.2 + 0.04], s);
  const spirit = style === 'spirit';
  glow.box([-0.17, 1.06, -0.17], [0.17, 1.38, 0.17], spirit ? '#6fd4ff' : '#ffb653');
  vol.box([-0.4, 1.4, -0.4], [0.4, 1.5, 0.4], s);
  vol.box([-0.3, 1.5, -0.3], [0.3, 1.58, 0.3], s);
  vol.box([-0.18, 1.58, -0.18], [0.18, 1.66, 0.18], s);
  // upturned roof corners
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) vol.box([x * 0.36 - 0.04, 1.5, z * 0.36 - 0.04], [x * 0.36 + 0.04, 1.58, z * 0.36 + 0.04], s);
  vol.ball(0, 1.74, 0, 0.09, s(0, 0, 0));
  weather(vol, style, seed, 0.5);
  return { solid: mesh(vol, seed), glow: meshVoxels(glow, { jitter: 0.1, seed }), lights: [{ x: 0, y: 1.22, z: 0, color: spirit ? '#8fd8ff' : '#ffbf7a', intensity: 3.2, distance: 9 }] };
}

function torii(style: PropStyle, seed: number): PropParts {
  const v = 0.1;
  const vol = VoxelVolume.cubic(62, 46, 8, v);
  const red = (x: number, y: number, z: number) => pickH(VERMILION, x, y, z, seed);
  const black = (x: number, y: number, z: number) => pickH(BLACK, x, y, z, seed);
  for (const sx of [-2, 2]) {
    vol.tube([sx, 0, 0], [sx * 0.97, 4.0, 0], 0.21, 0.17, (px, py, pz) => red(Math.floor(px * 10), Math.floor(py * 10), Math.floor(pz * 10)));
    vol.box([sx - 0.27, 0, -0.27], [sx + 0.27, 0.32, 0.27], black);
  }
  vol.box([-2.55, 3.22, -0.12], [2.55, 3.46, 0.12], red);
  vol.box([-0.12, 3.46, -0.1], [0.12, 3.82, 0.1], red);
  vol.box([-2.75, 3.82, -0.17], [2.75, 4.02, 0.17], red);
  vol.box([-2.95, 4.02, -0.22], [2.95, 4.3, 0.22], black);
  // the lintel's ends sweep up
  vol.box([-3.05, 4.1, -0.22], [-2.55, 4.4, 0.22], black);
  vol.box([2.55, 4.1, -0.22], [3.05, 4.4, 0.22], black);
  vol.box([-3.1, 4.3, -0.22], [-2.85, 4.5, 0.22], black);
  vol.box([2.85, 4.3, -0.22], [3.1, 4.5, 0.22], black);
  // plaque
  vol.box([-0.26, 3.5, 0.1], [0.26, 3.8, 0.16], '#1d1a1a');
  vol.box([-0.18, 3.56, 0.16], [0.18, 3.74, 0.18], '#d9b24a');
  weather(vol, style, seed, 0.45);
  return { solid: mesh(vol, seed, 0.05) };
}

function shrine(style: PropStyle, seed: number): PropParts {
  const v = 0.12;
  const vol = VoxelVolume.cubic(46, 42, 40, v);
  const glow = VoxelVolume.cubic(46, 42, 40, v);
  const stone = stoneFn(STONE, seed, { h: 3, w: 5 });
  const wood = (x: number, y: number, z: number) => pickH(WOOD, x, y, z, seed);
  const pillar = (x: number, y: number, z: number) => pickH([hex('#8c2e22'), hex('#9a3326'), hex('#7c281e')], x, y, z, seed);
  const roof = (x: number, y: number, z: number) => pickH([hex('#3c4a4c'), hex('#455456'), hex('#34403f')], x, y, z, seed);
  vol.box([-2.4, 0, -2.0], [2.4, 0.42, 2.0], stone);
  // steps up to the deck
  vol.box([-0.9, 0, 2.0], [0.9, 0.28, 2.36], stone);
  vol.box([-2.15, 0.42, -1.75], [2.15, 0.54, 1.75], wood);
  for (const [x, z] of [[-1.95, -1.55], [1.95, -1.55], [-1.95, 1.55], [1.95, 1.55], [-0.65, 1.55], [0.65, 1.55]]) vol.box([x - 0.12, 0.54, z - 0.12], [x + 0.12, 2.75, z + 0.12], pillar);
  // walls: back and sides solid, front open between the inner pillars with a dark interior
  vol.box([-1.9, 0.54, -1.55], [1.9, 2.6, -1.4], wood);
  vol.box([-1.95, 0.54, -1.5], [-1.8, 2.6, 1.5], wood);
  vol.box([1.8, 0.54, -1.5], [1.95, 2.6, 1.5], wood);
  vol.box([-1.85, 0.54, 1.38], [-0.7, 2.6, 1.5], (x, y, z) => ((y + x) % 4 === 0 ? shadeHex(wood(x, y, z), 0.6) : wood(x, y, z)));
  vol.box([0.7, 0.54, 1.38], [1.85, 2.6, 1.5], (x, y, z) => ((y + x) % 4 === 0 ? shadeHex(wood(x, y, z), 0.6) : wood(x, y, z)));
  vol.box([-0.6, 0.54, 1.2], [0.6, 2.4, 1.3], '#1a120e');
  // beams
  vol.box([-2.1, 2.6, -1.7], [2.1, 2.84, 1.7], pillar);
  // roof: stepped, with deep eaves and a ridge
  for (let k = 0; k < 9; k++) {
    const y = 2.84 + k * v;
    const hw = 2.85 - k * 0.2;
    const hd = 2.45 - k * 0.27;
    if (hd < 0.2) break;
    vol.box([-hw, y, -hd], [hw, y + v, hd], roof);
  }
  vol.box([-2.95, 2.84, -2.5], [2.95, 2.96, 2.5], roof);
  vol.box([-2.3, 3.9, -0.16], [2.3, 4.08, 0.16], '#2a3030');
  // crossed gable boards (chigi) at each end
  for (const sx of [-1, 1]) {
    vol.tube([sx * 2.1, 3.9, -0.3], [sx * 2.4, 4.5, 0.3], 0.06, 0.06, '#2a3030');
    vol.tube([sx * 2.1, 3.9, 0.3], [sx * 2.4, 4.5, -0.3], 0.06, 0.06, '#2a3030');
  }
  // straw rope with paper streamers over the door, and the offering box
  vol.tube([-0.85, 2.45, 1.62], [0.85, 2.45, 1.62], 0.08, 0.08, '#d8c48a');
  for (const x of [-0.5, 0, 0.5]) vol.box([x - 0.06, 2.0, 1.6], [x + 0.06, 2.4, 1.66], '#f6f4ee');
  vol.box([-0.5, 0.54, 1.62], [0.5, 0.95, 1.95], (_x, y) => (y % 2 ? DARK_WOOD[0] : DARK_WOOD[1]));
  // hanging lanterns at the front corners
  for (const sx of [-1.95, 1.95]) {
    vol.box([sx - 0.02, 2.2, 1.7], [sx + 0.02, 2.6, 1.74], '#2a2222');
    glow.box([sx - 0.13, 1.85, 1.6], [sx + 0.13, 2.2, 1.86], '#ffb24a');
  }
  weather(vol, style, seed, 0.4);
  return {
    solid: mesh(vol, seed, 0.05),
    glow: meshVoxels(glow, { jitter: 0.1, seed }),
    lights: [{ x: 0, y: 2.0, z: 2.0, color: '#ffb470', intensity: 3, distance: 10 }],
  };
}

function pillar(style: PropStyle, seed: number, broken: boolean): PropParts {
  const R = rng(seed);
  const v = 0.12;
  const vol = VoxelVolume.cubic(16, 42, 16, v);
  const pal = style === 'ash' ? DARK_STONE : STONE;
  const s = stoneFn(pal, seed, { h: 4, w: 7 });
  vol.box([-0.72, 0, -0.72], [0.72, 0.36, 0.72], s);
  const h = broken ? 1.4 + R() * 1.4 : 4.2;
  vol.fill({ min: [-0.62, 0.36, -0.62], max: [0.62, 0.36 + h, 0.62] }, (px, py, pz, x, y, z) => {
    if (Math.hypot(px, pz) > 0.6) return null;
    // fluting: shallow grooves around the shaft
    const a = Math.atan2(pz, px);
    if (Math.hypot(px, pz) > 0.52 && Math.cos(a * 10) > 0.75) return null;
    if (broken) {
      const top = 0.36 + h - fbm3(px * 3, 0, pz * 3, 2, seed) * 0.9;
      if (py > top) return null;
    }
    return s(x, y, z);
  });
  if (!broken) {
    vol.box([-0.72, 0.36 + h, -0.72], [0.72, 0.6 + h, 0.72], s);
    vol.box([-0.58, 0.6 + h, -0.58], [0.58, 0.72 + h, 0.58], s);
  } else {
    // rubble at the foot
    for (let i = 0; i < 4; i++) {
      const a = R() * Math.PI * 2;
      vol.ball(Math.cos(a) * 0.62, 0.42, Math.sin(a) * 0.62, 0.14 + R() * 0.1, s(1, 2, 3));
    }
  }
  if (style === 'moss' || style === 'spirit') creep(vol, seed, 0.3);
  weather(vol, style, seed, 0.65);
  return { solid: mesh(vol, seed, 0.05) };
}

function rock(style: PropStyle, seed: number): PropParts {
  const v = 0.12;
  const vol = VoxelVolume.cubic(20, 12, 18, v);
  const R = rng(seed);
  const pal = style === 'ash' ? [hex('#2c2626'), hex('#353030'), hex('#241f1f'), hex('#3c3434')] : style === 'snow' ? [hex('#7d8794'), hex('#8a95a2'), hex('#6f7985')] : [hex('#7a7b80'), hex('#85868b'), hex('#6c6d72'), hex('#909196')];
  const sx = 1.05 + R() * 0.15;
  const sz = 0.92 + R() * 0.12;
  vol.fill({ min: [-1.2, 0, -1.1], max: [1.2, 1.3, 1.1] }, (px, py, pz, x, y, z) => {
    const d = Math.hypot(px / sx, (py - 0.15) / 0.95, pz / sz);
    const n = fbm3(px * 1.4, py * 1.4, pz * 1.4, 3, seed);
    if (d + (n - 0.5) * 0.55 > 1) return null;
    // strata: faint horizontal bands
    const band = Math.floor(py * 4 + n * 2) % 3 === 0 ? 0.88 : 1;
    return shadeHex(pickH(pal, x, y, z, seed), band);
  });
  weather(vol, style, seed, style === 'snow' ? 0.85 : 0.5);
  return { solid: mesh(vol, seed, 0.07) };
}

function brazier(seed: number): PropParts {
  const v = 0.08;
  const vol = VoxelVolume.cubic(14, 18, 14, v);
  const glow = VoxelVolume.cubic(14, 18, 14, v);
  const iron = (x: number, y: number, z: number) => pickH([hex('#3a3434'), hex('#443d3c'), hex('#2f2a2a')], x, y, z, seed);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    vol.tube([Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32], [Math.cos(a) * 0.18, 0.85, Math.sin(a) * 0.18], 0.05, 0.04, iron(i, 0, 0));
  }
  vol.fill({ min: [-0.56, 0.8, -0.56], max: [0.56, 1.2, 0.56] }, (px, py, pz, x, y, z) => {
    const r = 0.28 + (py - 0.8) * 0.75;
    const d = Math.hypot(px, pz);
    return d < r && d > r - 0.12 ? iron(x, y, z) : d < r && py < 0.88 ? iron(x, y, z) : null;
  });
  glow.fill({ min: [-0.45, 0.86, -0.45], max: [0.45, 1.08, 0.45] }, (px, py, pz, x, y, z) => {
    const d = Math.hypot(px, pz);
    return d < 0.24 + (py - 0.8) * 0.7 ? pickH([hex('#ff6a1a'), hex('#ff8a2a'), hex('#e0400a'), hex('#ffb040')], x, y, z, seed) : null;
  });
  return { solid: mesh(vol, seed), glow: meshVoxels(glow, { jitter: 0.15, seed }), flames: [{ x: 0, y: 1.1, z: 0, size: 0.5 }], lights: [{ x: 0, y: 1.6, z: 0, color: '#ff8a3a', intensity: 7, distance: 11 }] };
}

function banner(seed: number): PropParts {
  const v = 0.06;
  const vol = VoxelVolume.cubic(16, 56, 6, v);
  const cloth = VoxelVolume.cubic(16, 56, 6, v);
  const pole = (x: number, y: number, z: number) => pickH(DARK_WOOD, x, y, z, seed);
  vol.box([-0.42, 0, -0.06], [-0.3, 3.2, 0.06], pole);
  vol.box([-0.42, 3.0, -0.04], [0.48, 3.08, 0.04], pole);
  vol.ball(-0.36, 3.26, 0, 0.07, '#d9b24a');
  const red = [hex('#b8323a'), hex('#c23a41'), hex('#a92c33')];
  cloth.box([-0.28, 1.25, -0.03], [0.46, 2.98, 0.03], (x, y, z) => {
    // a gold crest in the middle
    const cx = x - 9;
    const cy = y - 38;
    if (cx * cx + cy * cy < 18 && cx * cx + cy * cy > 6) return '#e8c44a';
    return pickH(red, x, y, z, seed);
  });
  return {
    solid: mesh(vol, seed),
    sway: meshVoxels(cloth, { jitter: 0.05, seed, sway: (px, py) => Math.max(0, px + 0.3) * 0.22 + Math.max(0, 3 - py) * 0.05 }),
  };
}

function crystal(seed: number): PropParts {
  const R = rng(seed);
  const v = 0.1;
  const vol = VoxelVolume.cubic(18, 34, 18, v);
  const ice = [hex('#9fd6ff'), hex('#b8e4ff'), hex('#86c4f2'), hex('#d4f0ff')];
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI * 2;
    const r = i === 0 ? 0 : 0.3 + R() * 0.35;
    const h = (i === 0 ? 2.6 : 1.1 + R() * 1.4) * (0.9 + R() * 0.2);
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const tx = bx * 1.6 + (R() - 0.5) * 0.3;
    const tz = bz * 1.6 + (R() - 0.5) * 0.3;
    const w = i === 0 ? 0.3 : 0.18 + R() * 0.08;
    vol.fill({ min: [Math.min(bx, tx) - w, 0, Math.min(bz, tz) - w], max: [Math.max(bx, tx) + w, h, Math.max(bz, tz) + w] }, (px, py, pz, x, y, z) => {
      const t = py / h;
      const cx = bx + (tx - bx) * t;
      const cz = bz + (tz - bz) * t;
      const rr = w * (t < 0.75 ? 1 : (1 - t) / 0.25);
      return Math.abs(px - cx) + Math.abs(pz - cz) < rr * 1.25 ? pickH(ice, x, y, z, seed) : null;
    });
  }
  return { glass: meshVoxels(vol, { jitter: 0.08, seed }), lights: [{ x: 0, y: 1.2, z: 0, color: '#8fd0ff', intensity: 2, distance: 7 }] };
}

function ruinWall(style: PropStyle, seed: number): PropParts {
  const v = 0.12;
  const vol = VoxelVolume.cubic(44, 28, 9, v);
  const s = stoneFn(style === 'ash' ? DARK_STONE : STONE, seed, { h: 3, w: 6 });
  vol.fill({ min: [-2.55, 0, -0.5], max: [2.55, 3.2, 0.5] }, (px, py, pz, x, y, z) => {
    const top = 1.3 + fbm3(px * 0.6, 0, 0, 3, seed) * 2.2 + (hash3(Math.floor(px * 2), 0, 0, seed) - 0.5) * 0.4;
    if (py > top || Math.abs(pz) > 0.45) return null;
    return s(x, y, z);
  });
  // tumbled blocks at the base
  const R = rng(seed);
  for (let i = 0; i < 5; i++) vol.box([-2.4 + R() * 4.4, 0, 0.45], [-2.4 + R() * 4.4 + 0.36, 0.24, 0.81], s);
  creep(vol, seed, style === 'moss' || style === 'spirit' ? 0.35 : 0.15);
  weather(vol, style, seed, 0.7);
  return { solid: mesh(vol, seed, 0.05) };
}

function statue(style: PropStyle, seed: number): PropParts {
  const v = 0.1;
  const vol = VoxelVolume.cubic(22, 40, 22, v);
  const s = stoneFn(style === 'ash' ? DARK_STONE : [hex('#b3afa4'), hex('#bdb9ae'), hex('#a8a499')], seed, { h: 3, w: 5 });
  vol.box([-0.95, 0, -0.95], [0.95, 0.5, 0.95], s);
  vol.box([-0.8, 0.5, -0.8], [0.8, 0.8, 0.8], s);
  // a seated guardian: legs, robe, torso, helmeted head, both hands on a sword's pommel
  vol.box([-0.55, 0.8, -0.35], [0.55, 1.3, 0.45], s);
  vol.box([-0.42, 1.3, -0.25], [0.42, 2.15, 0.25], s);
  vol.box([-0.6, 1.95, -0.28], [0.6, 2.2, 0.28], s);
  vol.box([-0.22, 2.2, -0.2], [0.22, 2.62, 0.2], s);
  vol.box([-0.32, 2.5, -0.3], [0.32, 2.66, 0.3], s);
  vol.box([-0.08, 2.66, -0.08], [0.08, 2.96, 0.08], s);
  vol.box([-0.3, 2.62, 0.1], [-0.2, 2.86, 0.2], s);
  vol.box([0.2, 2.62, 0.1], [0.3, 2.86, 0.2], s);
  vol.box([-0.5, 1.5, 0.2], [-0.32, 1.95, 0.42], s);
  vol.box([0.32, 1.5, 0.2], [0.5, 1.95, 0.42], s);
  vol.box([-0.36, 1.45, 0.38], [0.36, 1.6, 0.52], s);
  vol.box([-0.05, 0.8, 0.46], [0.05, 1.5, 0.56], hex('#cfd6dc'));
  if (style === 'moss' || style === 'spirit') creep(vol, seed, 0.3);
  weather(vol, style, seed, 0.55);
  return { solid: mesh(vol, seed, 0.05) };
}

function anvil(seed: number): PropParts {
  const v = 0.07;
  const vol = VoxelVolume.cubic(28, 20, 14, v);
  const glow = VoxelVolume.cubic(28, 20, 14, v);
  const iron = (x: number, y: number, z: number) => pickH([hex('#4a4a52'), hex('#55555e'), hex('#3e3e46')], x, y, z, seed);
  vol.fill({ min: [-0.5, 0, -0.42], max: [0.5, 0.55, 0.42] }, (px, _py, pz, x, y, z) => (Math.hypot(px / 0.5, pz / 0.42) < 1 ? pickH(DARK_WOOD, x, y, z, seed) : null));
  vol.box([-0.24, 0.55, -0.18], [0.24, 0.8, 0.18], iron);
  vol.box([-0.6, 0.8, -0.26], [0.55, 1.04, 0.26], iron);
  vol.tube([-0.6, 0.94, 0], [-0.92, 0.98, 0], 0.11, 0.03, iron(0, 0, 0));
  glow.box([0.0, 1.04, -0.06], [0.42, 1.12, 0.06], '#ff8a3a');
  return { solid: mesh(vol, seed), glow: meshVoxels(glow, { jitter: 0.1, seed }) };
}

function crate(seed: number): PropParts {
  const v = 0.07;
  const vol = VoxelVolume.cubic(16, 16, 16, v);
  vol.box([-0.55, 0, -0.55], [0.55, 1.1, 0.55], (x, y, z) => {
    const plank = Math.floor(y / 3) % 2 ? WOOD[0] : WOOD[2];
    let c = mixHex(plank, pickH(WOOD, x, y, z, seed), 0.4);
    const edge = (x <= 1 || x >= 14 ? 1 : 0) + (y <= 1 || y >= 14 ? 1 : 0) + (z <= 1 || z >= 14 ? 1 : 0);
    if (edge >= 2) c = hex('#3c3434');
    return c;
  });
  return { solid: mesh(vol, seed) };
}

function fence(seed: number): PropParts {
  const v = 0.06;
  const vol = VoxelVolume.cubic(5, 20, 36, v);
  const w = (x: number, y: number, z: number) => pickH(WOOD, x, y, z, seed);
  vol.box([-0.08, 0, -1.04], [0.08, 1.12, -0.88], w);
  vol.box([-0.08, 0, 0.88], [0.08, 1.12, 1.04], w);
  vol.box([-0.05, 0.76, -1.0], [0.05, 0.86, 1.0], w);
  vol.box([-0.05, 0.4, -1.0], [0.05, 0.5, 1.0], w);
  return { solid: mesh(vol, seed) };
}

function bridgePost(seed: number): PropParts {
  const v = 0.05;
  const vol = VoxelVolume.cubic(8, 26, 8, v);
  vol.box([-0.13, 0, -0.13], [0.13, 1.0, 0.13], (x, y, z) => pickH(DARK_WOOD, x, y, z, seed));
  vol.box([-0.16, 1.0, -0.16], [0.16, 1.1, 0.16], (x, y, z) => pickH(VERMILION, x, y, z, seed));
  vol.ball(0, 1.2, 0, 0.09, '#d9b24a');
  vol.box([-0.02, 1.26, -0.02], [0.02, 1.32, 0.02], '#d9b24a');
  return { solid: mesh(vol, seed) };
}

function well(style: PropStyle, seed: number): PropParts {
  const v = 0.1;
  const vol = VoxelVolume.cubic(24, 30, 24, v);
  const s = stoneFn(STONE, seed, { h: 2, w: 4 });
  vol.fill({ min: [-1.1, 0, -1.1], max: [1.1, 0.9, 1.1] }, (px, _py, pz, x, y, z) => {
    const d = Math.hypot(px, pz);
    return d < 1.05 && d > 0.78 ? s(x, y, z) : null;
  });
  vol.fill({ min: [-0.8, 0, -0.8], max: [0.8, 0.55, 0.8] }, (px, _py, pz) => (Math.hypot(px, pz) <= 0.8 ? '#1e3a52' : null));
  const w = (x: number, y: number, z: number) => pickH(DARK_WOOD, x, y, z, seed);
  vol.box([-0.98, 0.9, -0.08], [-0.82, 2.2, 0.08], w);
  vol.box([0.82, 0.9, -0.08], [0.98, 2.2, 0.08], w);
  vol.box([-1.0, 1.9, -0.05], [1.0, 2.0, 0.05], w);
  const roof = (x: number, y: number, z: number) => pickH([hex('#6e3a2a'), hex('#7a4230'), hex('#5f3224')], x, y, z, seed);
  for (let k = 0; k < 5; k++) vol.box([-1.3 + k * 0.08, 2.2 + k * 0.1, -0.85 + k * 0.17], [1.3 - k * 0.08, 2.3 + k * 0.1, 0.85 - k * 0.17], roof);
  vol.box([-0.03, 1.2, -0.03], [0.03, 1.9, 0.03], '#c9b48a');
  vol.box([-0.14, 1.0, -0.14], [0.14, 1.22, 0.14], w);
  weather(vol, style, seed, 0.5);
  return { solid: mesh(vol, seed, 0.05) };
}

function rankBoard(seed: number): PropParts {
  const v = 0.08;
  const vol = VoxelVolume.cubic(46, 46, 8, v);
  const w = (x: number, y: number, z: number) => pickH(DARK_WOOD, x, y, z, seed);
  vol.box([-1.62, 0, -0.1], [-1.42, 3.2, 0.1], w);
  vol.box([1.42, 0, -0.1], [1.62, 3.2, 0.1], w);
  vol.box([-1.6, 0.72, -0.08], [1.6, 0.8, 0.0], w);
  vol.box([-1.6, 3.04, -0.08], [1.6, 3.2, 0.0], w);
  for (let k = 0; k < 3; k++) vol.box([-1.8 + k * 0.1, 3.2 + k * 0.08, -0.28 + k * 0.05], [1.8 - k * 0.1, 3.28 + k * 0.08, 0.28 - k * 0.05], (x, y, z) => pickH([hex('#3c4a4c'), hex('#455456')], x, y, z, seed));
  return { solid: mesh(vol, seed) };
}

// ------------------------------------------------------------------------------ scenery pieces

/** A five-storey pagoda: tiers of walls under wide roofs with upturned corners, and a spire. */
function pagoda(seed: number): PropParts {
  const v = 0.2;
  const vol = VoxelVolume.cubic(46, 82, 46, v);
  const glow = VoxelVolume.cubic(46, 82, 46, v);
  const wall = (x: number, y: number, z: number) => pickH([hex('#e9e2d4'), hex('#ded6c6'), hex('#f0eadf')], x, y, z, seed);
  const red = (x: number, y: number, z: number) => pickH(VERMILION, x, y, z, seed);
  const roof = (x: number, y: number, z: number) => pickH([hex('#3a3f48'), hex('#434954'), hex('#32363e')], x, y, z, seed);
  const s = stoneFn(STONE, seed, { h: 2, w: 4 });
  vol.box([-4.2, 0, -4.2], [4.2, 0.8, 4.2], s);
  let y = 0.8;
  for (let k = 0; k < 5; k++) {
    const hw = 2.8 - k * 0.38;
    const h = 2.0 - k * 0.12;
    // the storey: red corner posts and rails around white walls
    vol.box([-hw, y, -hw], [hw, y + h, hw], wall);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) vol.box([sx * hw - 0.2, y, sz * hw - 0.2], [sx * hw + 0.2, y + h, sz * hw + 0.2], red);
    vol.box([-hw - 0.05, y + h - 0.3, -hw - 0.05], [hw + 0.05, y + h, hw + 0.05], red);
    // a lit window on each face of the lower storeys
    if (k < 3) for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) glow.box([dx * hw - 0.3 + (dx ? 0 : 0), y + 0.6, dz * hw - 0.3], [dx * hw + 0.3, y + 1.2, dz * hw + 0.3], '#ffbe6a');
    y += h;
    // the roof: three steps out to deep eaves, corners swept up
    const eave = hw + 1.5;
    for (let r = 0; r < 3; r++) vol.box([-eave + r * 0.45, y + r * 0.2, -eave + r * 0.45], [eave - r * 0.45, y + r * 0.2 + 0.2, eave - r * 0.45], roof);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) vol.box([sx * eave - 0.3, y + 0.2, sz * eave - 0.3], [sx * eave + 0.3, y + 0.6, sz * eave + 0.3], roof);
    y += 0.7;
  }
  // spire with rings
  vol.box([-0.25, y, -0.25], [0.25, y + 3.2, 0.25], '#8a7a4a');
  for (let r = 0; r < 6; r++) vol.box([-0.45, y + 0.6 + r * 0.42, -0.45], [0.45, y + 0.74 + r * 0.42, 0.45], '#b89a4a');
  vol.ball(0, y + 3.4, 0, 0.3, '#d9b24a');
  return { solid: mesh(vol, seed, 0.04), glow: meshVoxels(glow, { jitter: 0.1, seed }), lights: [{ x: 0, y: 3, z: 3.5, color: '#ffb470', intensity: 3, distance: 12 }] };
}

/** A red arched bridge (taikobashi) over a pond, `span` metres long along z. */
function archBridge(seed: number): PropParts {
  const v = 0.1;
  const span = 6;
  const vol = VoxelVolume.cubic(22, 26, 64, v);
  const wood = (x: number, y: number, z: number) => pickH(VERMILION, x, y, z, seed);
  const deck = (x: number, y: number, z: number) => pickH(WOOD, x, y, z, seed);
  for (let z = -span / 2; z <= span / 2; z += v) {
    const t = z / (span / 2);
    const yy = 0.95 * (1 - t * t) + 0.05;
    vol.box([-0.85, yy, z], [0.85, yy + 0.14, z + v], deck);
    // rails and posts
    for (const sx of [-0.85, 0.85]) {
      vol.box([sx - 0.06, yy + 0.7, z], [sx + 0.06, yy + 0.8, z + v], wood);
      if (Math.abs((z + span / 2) % 1.0) < v) vol.box([sx - 0.07, yy - 0.2, z], [sx + 0.07, yy + 0.95, z + v * 1.5], wood);
    }
    // the arch underneath
    vol.box([-0.8, yy - 0.25, z], [-0.6, yy, z + v], wood);
    vol.box([0.6, yy - 0.25, z], [0.8, yy, z + v], wood);
  }
  for (const sz of [-span / 2, span / 2]) for (const sx of [-0.85, 0.85]) vol.ball(sx, 0.95 + 0.06, sz, 0.11, '#d9b24a');
  return { solid: mesh(vol, seed, 0.05) };
}

/** Lily pads with a few pink flowers, floating flat. */
function lilyPads(seed: number): PropParts {
  const R = rng(seed);
  const v = 0.08;
  const vol = VoxelVolume.cubic(50, 3, 50, v);
  const greens = [hex('#3f7a34'), hex('#4a8a3c'), hex('#356a2c')];
  for (let i = 0; i < 14; i++) {
    const cx = (R() - 0.5) * 3.4;
    const cz = (R() - 0.5) * 3.4;
    const r = 0.18 + R() * 0.16;
    const notch = R() * Math.PI * 2;
    vol.fill({ min: [cx - r, 0, cz - r], max: [cx + r, v * 0.9, cz + r] }, (px, _py, pz, x, y, z) => {
      const d = Math.hypot(px - cx, pz - cz);
      const a = Math.atan2(pz - cz, px - cx);
      if (d > r || Math.abs(Math.atan2(Math.sin(a - notch), Math.cos(a - notch))) < 0.3) return null;
      return pickH(greens, x, y, z, seed);
    });
    if (R() < 0.35) vol.box([cx - 0.06, v, cz - 0.06], [cx + 0.06, v * 2.5, cz + 0.06], R() < 0.5 ? '#f6a9c4' : '#fff1f6');
  }
  return { solid: mesh(vol, seed, 0.08) };
}

/** Stepping stones in a gentle curve. */
function steppingStones(seed: number): PropParts {
  const R = rng(seed);
  const v = 0.1;
  const vol = VoxelVolume.cubic(30, 3, 70, v);
  for (let i = 0; i < 9; i++) {
    const z = -3.2 + i * 0.8;
    const x = Math.sin(i * 0.7) * 0.6;
    const r = 0.28 + R() * 0.08;
    vol.fill({ min: [x - r, 0, z - r], max: [x + r, 0.12, z + r] }, (px, _py, pz, xx, y, zz) => (Math.hypot(px - x, (pz - z) * 1.2) < r ? pickH(STONE, xx, y, zz, seed) : null));
  }
  return { solid: mesh(vol, seed, 0.06) };
}

/** A big flat-topped rock for the edges of a pond or a garden. */
function gardenRock(seed: number): PropParts {
  return rock('moss', seed);
}

/** A ruined arch: two columns and a half-fallen arch, draped in moss and hanging vines. */
function arch(seed: number): PropParts {
  const R = rng(seed);
  const v = 0.15;
  const vol = VoxelVolume.cubic(40, 46, 10, v);
  const s = stoneFn([hex('#6f7480'), hex('#7a7f8a'), hex('#646974'), hex('#858a94')], seed, { h: 3, w: 5 });
  for (const sx of [-1.9, 1.9]) vol.box([sx - 0.45, 0, -0.45], [sx + 0.45, 4.6, 0.45], s);
  // the arch: a ring of blocks between the column tops, broken through on one side
  vol.fill({ min: [-2.4, 4.2, -0.45], max: [2.4, 6.6, 0.45] }, (px, py, _pz, x, y, z) => {
    const d = Math.hypot(px, py - 4.4);
    if (d > 2.35 || d < 1.5) return null;
    if (px > 0.6 && py > 5.2 + R() * 0.3) return null;
    return s(x, y, z);
  });
  creep(vol, seed, 0.4);
  weather(vol, 'moss', seed, 0.8);
  // vines hanging from the arch
  for (let i = 0; i < 26; i++) {
    const x = -2.3 + R() * 4.6;
    const z = (R() - 0.5) * 0.9;
    let top = -1;
    for (let y = vol.ny - 1; y >= 0; y--) {
      const [cx, , cz] = vol.cellOf(x, 0, z);
      if (vol.has(cx, y, cz)) {
        top = y;
        break;
      }
    }
    if (top < 8) continue;
    const len = 4 + Math.floor(R() * 14);
    const [cx, , cz] = vol.cellOf(x, 0, z);
    for (let y = top - 1; y > top - len && y > 0; y--) vol.add(cx, y, cz, pickH(MOSS, cx, y, cz, seed), 0.6);
  }
  return { solid: mesh(vol, seed, 0.06) };
}

/** A stone altar with a chest whose seams glow spirit-blue. */
function altar(seed: number): PropParts {
  const v = 0.08;
  const vol = VoxelVolume.cubic(16, 16, 12, v);
  const glow = VoxelVolume.cubic(16, 16, 12, v);
  const s = stoneFn([hex('#6f7480'), hex('#7a7f8a'), hex('#646974')], seed);
  vol.box([-0.6, 0, -0.42], [0.6, 0.4, 0.42], s);
  vol.box([-0.42, 0.4, -0.3], [0.42, 0.8, 0.3], (x, y, z) => pickH(DARK_WOOD, x, y, z, seed));
  vol.box([-0.44, 0.8, -0.32], [0.44, 0.9, 0.32], (x, y, z) => pickH([hex('#7a6a3a'), hex('#8a7a44')], x, y, z, seed));
  glow.box([-0.36, 0.78, 0.29], [0.36, 0.82, 0.33], '#7fe0ff');
  glow.box([-0.06, 0.55, 0.3], [0.06, 0.7, 0.34], '#7fe0ff');
  weather(vol, 'moss', seed, 0.5);
  return { solid: mesh(vol, seed), glow: meshVoxels(glow, { jitter: 0.1, seed }), lights: [{ x: 0, y: 1.0, z: 0.4, color: '#7fd8ff', intensity: 6, distance: 9 }] };
}

/** Reeds and cattails at the water's edge. */
function reeds(seed: number): PropParts {
  const R = rng(seed);
  const v = 0.05;
  const vol = VoxelVolume.cubic(30, 34, 30, v);
  const greens = [hex('#4f7a34'), hex('#5f8a3c'), hex('#6f9a44'), hex('#7a8a3a')];
  for (let i = 0; i < 22; i++) {
    const x = (R() - 0.5) * 1.3;
    const z = (R() - 0.5) * 1.3;
    const h = 0.7 + R() * 0.9;
    const lean = (R() - 0.5) * 0.2;
    const col = greens[Math.floor(R() * greens.length)];
    for (let y = 0; y < h; y += v) {
      const [cx, cy, cz] = vol.cellOf(x + lean * (y / h) ** 2, y, z);
      vol.add(cx, cy, cz, col, 0.6);
    }
    if (R() < 0.4) vol.box([x + lean - 0.04, h - 0.25, z - 0.04], [x + lean + 0.04, h, z + 0.04], '#6a4a2a');
  }
  return { sway: meshVoxels(vol, { jitter: 0.06, seed, sway: (_px, py) => py * 0.12 }) };
}

// ----------------------------------------------------------------------------------------- cache

const cache = new Map<string, PropParts>();

/** Geometry parts for a prop kind (trees and bushes come from trees.ts instead). */
export function propParts(kind: PropKind, style: PropStyle = 'plain', variant = 0): PropParts | null {
  const key = `${kind}:${style}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const seed = 500 + variant * 977 + kind.length * 13;
  let p: PropParts | null = null;
  switch (kind) {
    case 'lantern':
      p = lantern(style, seed);
      break;
    case 'torii':
      p = torii(style, seed);
      break;
    case 'shrine':
      p = shrine(style, seed);
      break;
    case 'pillar':
      p = pillar(style, seed, false);
      break;
    case 'brokenPillar':
      p = pillar(style, seed, true);
      break;
    case 'rock':
      p = rock(style, seed);
      break;
    case 'brazier':
      p = brazier(seed);
      break;
    case 'banner':
      p = banner(seed);
      break;
    case 'crystal':
      p = crystal(seed);
      break;
    case 'ruinWall':
      p = ruinWall(style, seed);
      break;
    case 'statue':
      p = statue(style, seed);
      break;
    case 'anvil':
      p = anvil(seed);
      break;
    case 'crate':
      p = crate(seed);
      break;
    case 'fence':
      p = fence(seed);
      break;
    case 'bridgePost':
      p = bridgePost(seed);
      break;
    case 'well':
      p = well(style, seed);
      break;
    case 'rankBoard':
      p = rankBoard(seed);
      break;
    default:
      p = null;
  }
  if (p) {
    for (const g of [p.solid, p.sway, p.glow, p.glass]) if (g) g.userData.cached = true;
    cache.set(key, p);
  }
  return p;
}

export type SceneryKind = 'pagoda' | 'archBridge' | 'lilyPads' | 'steppingStones' | 'gardenRock' | 'arch' | 'altar' | 'reeds';

const sceneryCache = new Map<string, PropParts>();

/** Larger set pieces that only appear as scenery (not gameplay props). */
export function sceneryParts(kind: SceneryKind, variant = 0): PropParts {
  const key = `${kind}:${variant}`;
  const hit = sceneryCache.get(key);
  if (hit) return hit;
  const seed = 900 + variant * 131 + kind.length * 7;
  const builders: Record<SceneryKind, (s: number) => PropParts> = { pagoda, archBridge, lilyPads, steppingStones, gardenRock, arch, altar, reeds };
  const p = builders[kind](seed);
  for (const g of [p.solid, p.sway, p.glow, p.glass]) if (g) g.userData.cached = true;
  sceneryCache.set(key, p);
  return p;
}

/** How many distinct builds a kind has (broken pillars and rocks vary; the rest look the same). */
export function propVariants(kind: PropKind): number {
  return kind === 'rock' || kind === 'brokenPillar' || kind === 'crystal' ? 3 : 1;
}

export type { V3 };
