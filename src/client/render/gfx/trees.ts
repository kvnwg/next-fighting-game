/**
 * Voxel trees. Each kind is grown from a seed: a trunk that curves, branches that fork, and
 * foliage carved out of noise so the crown is lumpy and lacy rather than a ball. Leaves carry the
 * "leafy" flag (light shines through them when backlit) and the whole crown sways, more toward the
 * tips; trunks stay planted. A handful of variants per kind are built once and instanced.
 */
import * as THREE from 'three';
import { litMaterial, swayDepthMaterial } from './materials';
import { fbm3, hash3, rng } from './noise';
import { VoxelVolume, hex, meshVoxels, mixHex } from './voxel';

export type TreeKind = 'sakura' | 'pine' | 'snowPine' | 'bamboo' | 'maple' | 'deadTree' | 'bush' | 'flowerBush' | 'willow';

type V3 = [number, number, number];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Pick from a palette by a 0..1 value, with a little hash noise so bands break up. */
function pick(pal: number[], t: number, n: number): number {
  const i = Math.max(0, Math.min(pal.length - 1, Math.floor((t + (n - 0.5) * 0.35) * pal.length)));
  return pal[i];
}

interface Crown {
  c: V3;
  r: number;
  /** vertical squash */
  sy: number;
}

/** Foliage: lumpy, noise-carved ellipsoids, shaded light on top and deep underneath. */
function foliage(vol: VoxelVolume, crowns: Crown[], pal: number[], seed: number, opts: { lacy?: number; speckle?: { color: number; p: number }[]; noise?: number } = {}): void {
  const lacy = opts.lacy ?? 0.55;
  const nf = opts.noise ?? 1.6;
  for (const k of crowns) {
    const [cx, cy, cz] = k.c;
    const r = k.r;
    vol.fill({ min: [cx - r * 1.25, cy - r * k.sy * 1.25, cz - r * 1.25], max: [cx + r * 1.25, cy + r * k.sy * 1.25, cz + r * 1.25] }, (px, py, pz, x, y, z) => {
      const dx = (px - cx) / r;
      const dy = (py - cy) / (r * k.sy);
      const dz = (pz - cz) / r;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const n = fbm3(px * nf, py * nf, pz * nf, 3, seed);
      if (1 - d + (n - 0.5) * lacy * 1.6 <= 0) return null;
      const h = hash3(x, y, z, seed + 11);
      for (const s of opts.speckle ?? []) if (h < s.p) return s.color;
      // light on top and toward the outside, deep underneath and inside
      const t = 0.48 + dy * 0.5 + (d - 0.55) * 0.35;
      return pick(pal, t, hash3(x, y, z, seed + 5));
    }, 1);
  }
}

// ------------------------------------------------------------------------------------------ kinds

const BARK_DARK = [hex('#3a2820'), hex('#46302a'), hex('#523a2c')];

function bark(vol: VoxelVolume, a: V3, b: V3, r0: number, r1: number, pal: number[], seed: number): void {
  vol.tube(a, b, r0, r1, (px, py, pz) => {
    // vertical bark grain
    const g = hash3(Math.floor(px * 9), Math.floor(py * 2.5), Math.floor(pz * 9), seed);
    return pal[Math.floor(g * pal.length)];
  });
}

function sakura(seed: number, v: number): THREE.BufferGeometry {
  const R = rng(seed);
  const H = 2.5 + R() * 0.9;
  const reach = 3.6;
  const n = Math.ceil((reach * 2) / v) + 2;
  const vol = VoxelVolume.cubic(n, Math.ceil((H + 3.6) / v), n, v);
  const lean = R() * Math.PI * 2;
  const la = 0.25 + R() * 0.3;
  const p1: V3 = [Math.cos(lean) * la * 0.35, H * 0.5, Math.sin(lean) * la * 0.35];
  const p2: V3 = [Math.cos(lean) * la, H, Math.sin(lean) * la];
  bark(vol, [0, 0, 0], p1, 0.34, 0.25, BARK_DARK, seed);
  bark(vol, p1, p2, 0.25, 0.17, BARK_DARK, seed);
  // root flare
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + R();
    bark(vol, [0, 0.35, 0], [Math.cos(a) * (0.6 + R() * 0.3), 0, Math.sin(a) * (0.6 + R() * 0.3)], 0.15, 0.07, BARK_DARK, seed);
  }
  const crowns: Crown[] = [{ c: [p2[0], H + 0.9, p2[2]], r: 1.35 + R() * 0.3, sy: 0.72 }];
  const nb = 4 + Math.floor(R() * 3);
  for (let i = 0; i < nb; i++) {
    const t = 0.55 + R() * 0.45;
    const s: V3 = [p1[0] + (p2[0] - p1[0]) * t, H * 0.5 + H * 0.5 * t, p1[2] + (p2[2] - p1[2]) * t];
    const a = lean + (i / nb) * Math.PI * 2 + (R() - 0.5) * 0.7;
    const el = 0.35 + R() * 0.5;
    const L = 1.4 + R() * 0.9;
    const e: V3 = [s[0] + Math.cos(a) * Math.cos(el) * L, s[1] + Math.sin(el) * L, s[2] + Math.sin(a) * Math.cos(el) * L];
    bark(vol, s, e, 0.14, 0.06, BARK_DARK, seed + i);
    crowns.push({ c: [e[0], e[1] + 0.25, e[2]], r: 1.05 + R() * 0.45, sy: 0.7 });
    // a fork off the branch
    const m: V3 = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2, (s[2] + e[2]) / 2];
    const a2 = a + (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.4);
    const L2 = 0.8 + R() * 0.6;
    const e2: V3 = [m[0] + Math.cos(a2) * L2, m[1] + 0.35 + R() * 0.3, m[2] + Math.sin(a2) * L2];
    bark(vol, m, e2, 0.08, 0.04, BARK_DARK, seed + i * 3);
    crowns.push({ c: [e2[0], e2[1] + 0.15, e2[2]], r: 0.75 + R() * 0.35, sy: 0.75 });
  }
  const pal = [hex('#c24a7c'), hex('#dc6496'), hex('#ec82ad'), hex('#f59cc0'), hex('#fbb6d1'), hex('#ffcfe0'), hex('#ffe6ef')];
  foliage(vol, crowns, pal, seed, { lacy: 0.75, noise: 2.1, speckle: [{ color: hex('#fff6fa'), p: 0.04 }, { color: hex('#b23c6c'), p: 0.04 }] });
  // a few blossom strands hanging under the crown
  for (let i = 0; i < 14; i++) {
    const k = crowns[1 + Math.floor(R() * (crowns.length - 1))];
    const a = R() * Math.PI * 2;
    const rr = k.r * (0.4 + R() * 0.5);
    const x = k.c[0] + Math.cos(a) * rr;
    const z = k.c[2] + Math.sin(a) * rr;
    const top = k.c[1] - k.r * k.sy * 0.55;
    const len = 0.3 + R() * 0.6;
    for (let y = top; y > top - len; y -= v) {
      const [cx, cy, cz] = vol.cellOf(x, y, z);
      vol.add(cx, cy, cz, R() < 0.5 ? pal[3] : pal[4], 1);
    }
  }
  return meshVoxels(vol, {
    jitter: 0.07,
    seed,
    sway: (px, py, pz) => smooth(H * 0.45, H + 2.2, py) * 0.11 + Math.hypot(px, pz) * 0.018 * smooth(H * 0.5, H, py),
  });
}

function maple(seed: number, v: number): THREE.BufferGeometry {
  const R = rng(seed);
  const H = 2.2 + R() * 0.8;
  const reach = 3.0;
  const n = Math.ceil((reach * 2) / v) + 2;
  const vol = VoxelVolume.cubic(n, Math.ceil((H + 3.4) / v), n, v);
  const lean = R() * Math.PI * 2;
  const top: V3 = [Math.cos(lean) * 0.3, H, Math.sin(lean) * 0.3];
  bark(vol, [0, 0, 0], top, 0.26, 0.15, BARK_DARK, seed);
  const crowns: Crown[] = [{ c: [top[0], H + 1.0, top[2]], r: 1.5, sy: 0.75 }];
  for (let i = 0; i < 5; i++) {
    const a = lean + (i / 5) * Math.PI * 2 + (R() - 0.5) * 0.6;
    const L = 1.1 + R() * 0.6;
    const s: V3 = [top[0] * 0.7, H * (0.7 + R() * 0.3), top[2] * 0.7];
    const e: V3 = [s[0] + Math.cos(a) * L, s[1] + 0.6 + R() * 0.4, s[2] + Math.sin(a) * L];
    bark(vol, s, e, 0.1, 0.05, BARK_DARK, seed + i);
    crowns.push({ c: e, r: 0.95 + R() * 0.35, sy: 0.78 });
  }
  const pal = [hex('#8e1f1c'), hex('#a8281f'), hex('#c4372a'), hex('#d84a2c'), hex('#e8642e'), hex('#f2852f'), hex('#f8a83a')];
  foliage(vol, crowns, pal, seed, { lacy: 0.5, speckle: [{ color: hex('#ffc14a'), p: 0.04 }] });
  return meshVoxels(vol, { jitter: 0.08, seed, sway: (px, py, pz) => smooth(H * 0.5, H + 2, py) * 0.09 + Math.hypot(px, pz) * 0.015 * smooth(H * 0.5, H, py) });
}

function pine(seed: number, v: number, snowy: boolean): THREE.BufferGeometry {
  const R = rng(seed);
  const H = 5.6 + R() * 2.6;
  const base = 2.2 + R() * 0.4;
  const n = Math.ceil((base * 2 + 0.6) / v) + 2;
  const vol = VoxelVolume.cubic(n, Math.ceil((H + 1.2) / v), n, v);
  const trunk = [hex('#4a3a30'), hex('#3e3029'), hex('#574436')];
  bark(vol, [0, 0, 0], [0, H, 0], 0.22, 0.08, trunk, seed);
  const needles = [hex('#173a22'), hex('#1e4628'), hex('#24512e'), hex('#2c5c34'), hex('#35683b'), hex('#447a45')];
  const tiers = 6 + Math.floor(R() * 3);
  const y0 = 1.3 + R() * 0.4;
  for (let k = 0; k < tiers; k++) {
    const f = k / tiers;
    const y = y0 + f * (H - y0 - 0.4);
    const rad = base * Math.pow(1 - f, 0.85) + 0.3;
    const rot = R() * Math.PI * 2;
    vol.fill({ min: [-rad - 0.3, y - 1.0, -rad - 0.3], max: [rad + 0.3, y + 0.45, rad + 0.3] }, (px, py, pz, x, yy, z) => {
      const d = Math.hypot(px, pz);
      // ragged edge: branch tips poke out between notches
      const ang = Math.atan2(pz, px) + rot;
      const notch = 0.82 + 0.18 * Math.sin(ang * 7) + (hash3(x, 0, z, seed + k) - 0.5) * 0.25;
      if (d > rad * notch) return null;
      const droop = 0.55 * (d / rad) ** 2;
      const lo = y - 0.12 - droop - (1 - d / rad) * 0.35;
      const hi = y + 0.3 - droop;
      if (py < lo || py > hi) return null;
      const t = (py - lo) / (hi - lo) * 0.6 + (d / rad) * 0.4;
      return pick(needles, t, hash3(x, yy, z, seed));
    }, 0.6);
  }
  vol.tube([0, H - 0.5, 0], [0, H + 0.7, 0], 0.22, 0.05, needles[3]);
  if (snowy) {
    const snow = [hex('#e7eef6'), hex('#f3f7fb'), hex('#dbe5ef')];
    for (let y = vol.ny - 2; y >= 0; y--) {
      for (let z = 0; z < vol.nz; z++) {
        for (let x = 0; x < vol.nx; x++) {
          if (!vol.has(x, y, z) || vol.has(x, y + 1, z)) continue;
          if (hash3(x, y, z, seed + 99) < 0.82) vol.set(x, y, z, snow[Math.floor(hash3(x, y, z, seed + 3) * 3)], 0.1);
        }
      }
    }
  }
  return meshVoxels(vol, { jitter: 0.06, seed, sway: (px, py, pz) => (py / (H + 0.7)) ** 2 * 0.08 + Math.hypot(px, pz) * 0.012 });
}

function bamboo(seed: number, v: number): THREE.BufferGeometry {
  const R = rng(seed);
  const stalks = 5 + Math.floor(R() * 4);
  const maxH = 9.5;
  const n = Math.ceil(4.2 / v);
  const vol = VoxelVolume.cubic(n, Math.ceil((maxH + 0.8) / v), n, v);
  const greens = [hex('#5f8f34'), hex('#6c9c3c'), hex('#7aa846'), hex('#8db350'), hex('#a3b85c')];
  const leaves = [hex('#3f6f22'), hex('#4c7f2a'), hex('#5c8f32'), hex('#6fa23c'), hex('#86b84c')];
  for (let i = 0; i < stalks; i++) {
    const a = R() * Math.PI * 2;
    const rr = R() * 0.75;
    const bx = Math.cos(a) * rr;
    const bz = Math.sin(a) * rr;
    const h = 6 + R() * 3.4;
    const tx = bx + Math.cos(a) * (0.25 + R() * 0.45);
    const tz = bz + Math.sin(a) * (0.25 + R() * 0.45);
    const shade = greens[Math.floor(R() * greens.length)];
    const nodeEvery = 0.5 + R() * 0.15;
    const r = v * 0.62;
    vol.tube([bx, 0, bz], [tx, h, tz], r, r * 0.8, (_px, py) => (py % nodeEvery < v * 1.1 ? mixHex(shade, 0x2f4f1c, 0.45) : shade));
    // leaf sprays on the upper part
    for (let y = h * 0.45; y < h; y += 0.32 + R() * 0.25) {
      const t = y / h;
      const sx = bx + (tx - bx) * t;
      const sz = bz + (tz - bz) * t;
      const sprays = 2 + Math.floor(R() * 3);
      for (let k = 0; k < sprays; k++) {
        const la = R() * Math.PI * 2;
        const len = 0.35 + R() * 0.45;
        const col = leaves[Math.floor(R() * leaves.length)];
        for (let s = 0; s <= len; s += v * 0.8) {
          const droop = (s / len) ** 2 * 0.28;
          const [cx, cy, cz] = vol.cellOf(sx + Math.cos(la) * (s + 0.06), y + s * 0.35 - droop, sz + Math.sin(la) * (s + 0.06));
          vol.add(cx, cy, cz, col, 1);
        }
      }
    }
  }
  return meshVoxels(vol, { jitter: 0.05, seed, sway: (_px, py) => (py / maxH) ** 1.6 * 0.5 });
}

function deadTree(seed: number, v: number): THREE.BufferGeometry {
  const R = rng(seed);
  const H = 2.6 + R() * 0.8;
  const n = Math.ceil(5 / v);
  const vol = VoxelVolume.cubic(n, Math.ceil((H + 1.6) / v), n, v);
  const wood = [hex('#4f4640'), hex('#5c524a'), hex('#453d38')];
  const lean = R() * Math.PI * 2;
  const mid: V3 = [Math.cos(lean) * 0.25, H * 0.55, Math.sin(lean) * 0.25];
  const top: V3 = [Math.cos(lean + 0.8) * 0.35, H, Math.sin(lean + 0.8) * 0.35];
  bark(vol, [0, 0, 0], mid, 0.24, 0.17, wood, seed);
  bark(vol, mid, top, 0.17, 0.08, wood, seed);
  for (let i = 0; i < 6; i++) {
    const t = 0.45 + R() * 0.55;
    const s: V3 = [mid[0] + (top[0] - mid[0]) * t, H * (0.5 + t * 0.5), mid[2] + (top[2] - mid[2]) * t];
    const a = R() * Math.PI * 2;
    const L = 0.6 + R() * 0.9;
    const e: V3 = [s[0] + Math.cos(a) * L, s[1] + 0.3 + R() * 0.6, s[2] + Math.sin(a) * L];
    bark(vol, s, e, 0.08, 0.035, wood, seed + i);
    const a2 = a + (R() - 0.5) * 1.4;
    bark(vol, e, [e[0] + Math.cos(a2) * 0.45, e[1] + 0.3, e[2] + Math.sin(a2) * 0.45], 0.04, 0.03, wood, seed + i * 7);
  }
  // snow resting on every upward face
  const snow = [hex('#eef3f8'), hex('#f8fbfd'), hex('#dfe8f1')];
  for (let y = vol.ny - 1; y >= 0; y--) {
    for (let z = 0; z < vol.nz; z++) {
      for (let x = 0; x < vol.nx; x++) {
        if (vol.has(x, y, z) && !vol.has(x, y + 1, z) && hash3(x, y, z, seed) < 0.75) vol.set(x, y + 1, z, snow[Math.floor(hash3(x, y, z, 4) * 3)]);
      }
    }
  }
  return meshVoxels(vol, { jitter: 0.06, seed, sway: (_px, py) => smooth(H * 0.6, H + 1.4, py) * 0.04 });
}

function bush(seed: number, v: number, flowers: boolean): THREE.BufferGeometry {
  const R = rng(seed);
  const n = Math.ceil(2.6 / v);
  const vol = VoxelVolume.cubic(n, Math.ceil(1.5 / v), n, v);
  const pal = [hex('#1f4a22'), hex('#2a5a2a'), hex('#356a31'), hex('#43793a'), hex('#558a44')];
  const crowns: Crown[] = [];
  const k = 3 + Math.floor(R() * 2);
  for (let i = 0; i < k; i++) {
    const a = R() * Math.PI * 2;
    const r = R() * 0.35;
    crowns.push({ c: [Math.cos(a) * r, 0.45 + R() * 0.15, Math.sin(a) * r], r: 0.45 + R() * 0.25, sy: 0.85 });
  }
  const bloom = [hex('#f06fa8'), hex('#ff9ccb'), hex('#ffffff'), hex('#e8384c')][Math.floor(R() * 4)];
  foliage(vol, crowns, pal, seed, { lacy: 0.35, noise: 2.4, speckle: flowers ? [{ color: bloom, p: 0.09 }] : [] });
  return meshVoxels(vol, { jitter: 0.08, seed, sway: (_px, py) => py * 0.04 });
}

/** Weeping willow: a short trunk and long curtains of leaves. */
function willow(seed: number, v: number): THREE.BufferGeometry {
  const R = rng(seed);
  const H = 3 + R() * 0.6;
  const n = Math.ceil(6.4 / v);
  const vol = VoxelVolume.cubic(n, Math.ceil((H + 1.6) / v), n, v);
  bark(vol, [0, 0, 0], [0.2, H, 0.1], 0.3, 0.18, BARK_DARK, seed);
  const pal = [hex('#4a7a2e'), hex('#5a8c36'), hex('#6e9e40'), hex('#86b24e'), hex('#9cc25c')];
  foliage(vol, [{ c: [0.2, H + 0.4, 0.1], r: 1.9, sy: 0.45 }], pal, seed, { lacy: 0.45 });
  for (let i = 0; i < 70; i++) {
    const a = R() * Math.PI * 2;
    const rr = 1.0 + R() * 1.6;
    const x = Math.cos(a) * rr + 0.2;
    const z = Math.sin(a) * rr + 0.1;
    const top = H + 0.4 - (rr / 2.6) ** 2 * 0.6;
    const len = 1.2 + R() * 1.6;
    const col = pal[Math.floor(R() * pal.length)];
    for (let y = top; y > top - len && y > 0.2; y -= v) {
      const [cx, cy, cz] = vol.cellOf(x, y, z);
      vol.add(cx, cy, cz, col, 1);
    }
  }
  return meshVoxels(vol, { jitter: 0.06, seed, sway: (px, py, pz) => smooth(0, 1, Math.hypot(px, pz) / 2.6) * (1 - py / (H + 1.6)) * 0.35 + smooth(H * 0.6, H + 1, py) * 0.06 });
}

// ------------------------------------------------------------------------------------------ cache

const cache = new Map<string, THREE.BufferGeometry>();

/** A tree's geometry: `variant` picks one of a few seeds, `detail` scales the voxel size (1 = finest). */
export function treeGeometry(kind: TreeKind, variant: number, detail = 1): THREE.BufferGeometry {
  const key = `${kind}:${variant}:${detail}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const seed = 1000 + variant * 7919 + kind.length * 31;
  const k = 1 / Math.max(0.4, detail);
  let g: THREE.BufferGeometry;
  switch (kind) {
    case 'sakura':
      g = sakura(seed, 0.17 * k);
      break;
    case 'maple':
      g = maple(seed, 0.17 * k);
      break;
    case 'pine':
      g = pine(seed, 0.2 * k, false);
      break;
    case 'snowPine':
      g = pine(seed, 0.2 * k, true);
      break;
    case 'bamboo':
      g = bamboo(seed, 0.12 * Math.min(k, 1.4));
      break;
    case 'deadTree':
      g = deadTree(seed, 0.14 * k);
      break;
    case 'bush':
      g = bush(seed, 0.14 * k, false);
      break;
    case 'flowerBush':
      g = bush(seed, 0.14 * k, true);
      break;
    case 'willow':
      g = willow(seed, 0.17 * k);
      break;
  }
  g.userData.cached = true;
  cache.set(key, g);
  return g;
}

let sharedMat: THREE.MeshLambertMaterial | null = null;
let sharedDepth: THREE.MeshDepthMaterial | null = null;

/** The material every tree shares: vertex colours, occlusion, sway and backlit leaves. */
export function treeMaterial(): THREE.MeshLambertMaterial {
  sharedMat ??= litMaterial({ vertexColors: true, ao: true, sway: true, leaf: true });
  return sharedMat;
}

export function treeDepthMaterial(): THREE.MeshDepthMaterial {
  sharedDepth ??= swayDepthMaterial();
  return sharedDepth;
}

export interface TreePlacement {
  kind: TreeKind;
  x: number;
  y?: number;
  z: number;
  rot?: number;
  s?: number;
  variant?: number;
}

/** Instanced trees, one draw call per kind and variant, casting swaying shadows. */
export function buildTrees(list: TreePlacement[], detail = 1, opts: { shadows?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const groups = new Map<string, TreePlacement[]>();
  for (const t of list) {
    const variant = t.variant ?? Math.floor(hash3(Math.round(t.x * 10), 0, Math.round(t.z * 10), 7) * 3);
    const key = `${t.kind}:${variant}`;
    const arr = groups.get(key) ?? [];
    arr.push({ ...t, variant });
    groups.set(key, arr);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [key, arr] of groups) {
    const [kind, variant] = key.split(':');
    const geo = treeGeometry(kind as TreeKind, Number(variant), detail);
    const mesh = new THREE.InstancedMesh(geo, treeMaterial(), arr.length);
    arr.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot ?? hash3(Math.round(t.x * 10), 1, Math.round(t.z * 10), 3) * Math.PI * 2);
      const s = t.s ?? 1;
      m.compose(new THREE.Vector3(t.x, t.y ?? 0, t.z), q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = opts.shadows ?? true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = treeDepthMaterial();
    mesh.computeBoundingSphere();
    g.add(mesh);
  }
  return g;
}
