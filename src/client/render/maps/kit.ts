/**
 * Building blocks for map scenery: voxel floors for the fighting area, heightfield terrain around
 * it (columns of blocks with grassy tops and earthy sides, shaded where they meet), floating
 * islands under void maps, walls, and a ring of distant blocky mountains.
 */
import * as THREE from 'three';
import { MapDef, Shape, shapeContains } from '../../../shared/maps';
import { litMaterial } from '../gfx/materials';
import { fbm2, hash3, rng } from '../gfx/noise';
import { VoxelVolume, hex, meshVoxels, mixHex, shadeHex } from '../gfx/voxel';

export { hex, mixHex, shadeHex };

let worldMat: THREE.MeshLambertMaterial | null = null;

/** The shared material for static voxel scenery. */
export function worldMaterial(): THREE.MeshLambertMaterial {
  worldMat ??= litMaterial({ vertexColors: true, ao: true });
  return worldMat;
}

export function pick(pal: number[], h: number): number {
  return pal[Math.min(pal.length - 1, Math.floor(h * pal.length))];
}

// --------------------------------------------------------------------------------- heightfields

export interface Heightfield {
  /** world position of cell (0, 0)'s corner */
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** metres per cell, and per height layer */
  cell: number;
  step: number;
  /** column height in layers at cell (i, j); NaN = no column (a hole, e.g. where the arena is) */
  height(i: number, j: number): number;
  /** colour of the column's top face */
  top(i: number, j: number, h: number): number;
  /** colour of a side face, `below` layers under the column's top */
  side(i: number, j: number, layer: number, below: number): number;
  /** how far down the sides go where the neighbour is a hole */
  floor?: number;
}

const _c = new THREE.Color();

/**
 * Mesh a heightfield: a top face per column with corner occlusion from taller neighbours, and side
 * faces down to each lower neighbour, one quad per layer so they can band (grass lip, earth, rock).
 */
export function heightfieldMesh(hf: Heightfield, range?: { i0: number; i1: number; j0: number; j1: number }): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const ao: number[] = [];
  const idx: number[] = [];
  const i0 = range?.i0 ?? 0;
  const i1 = range?.i1 ?? hf.nx;
  const j0 = range?.j0 ?? 0;
  const j1 = range?.j1 ?? hf.nz;
  const H = (i: number, j: number) => hf.height(i, j);
  const AO = [0.5, 0.68, 0.84, 1];
  const quad = (p: number[][], n: number[], c: number, a: number[], jit: number) => {
    const base = pos.length / 3;
    _c.setHex(c);
    for (let k = 0; k < 4; k++) {
      pos.push(p[k][0], p[k][1], p[k][2]);
      nor.push(n[0], n[1], n[2]);
      col.push(_c.r * jit, _c.g * jit, _c.b * jit);
      ao.push(a[k]);
    }
    if (a[0] + a[2] < a[1] + a[3]) idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const s = hf.cell;
  const t = hf.step;
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      const h = H(i, j);
      if (Number.isNaN(h)) continue;
      const x = hf.x0 + i * s;
      const z = hf.z0 + j * s;
      const y = h * t;
      const jit = 1 + (hash3(i, h, j, 17) - 0.5) * 0.12;
      // top face: occlusion at each corner from the three columns around it
      const occ = (di: number, dj: number) => {
        const a = H(i + di, j) > h ? 1 : 0;
        const b = H(i, j + dj) > h ? 1 : 0;
        const c = H(i + di, j + dj) > h ? 1 : 0;
        return AO[a && b ? 0 : 3 - (a + b + c)];
      };
      quad(
        [[x, y, z], [x, y, z + s], [x + s, y, z + s], [x + s, y, z]],
        [0, 1, 0],
        hf.top(i, j, h),
        [occ(-1, -1), occ(-1, 1), occ(1, 1), occ(1, -1)],
        jit,
      );
      // sides
      const sides: [number, number, number[][], number[]][] = [
        [1, 0, [[x + s, 0, z], [x + s, 1, z], [x + s, 1, z + s], [x + s, 0, z + s]], [1, 0, 0]],
        [-1, 0, [[x, 0, z + s], [x, 1, z + s], [x, 1, z], [x, 0, z]], [-1, 0, 0]],
        [0, 1, [[x, 0, z + s], [x + s, 0, z + s], [x + s, 1, z + s], [x, 1, z + s]], [0, 0, 1]],
        [0, -1, [[x + s, 0, z], [x, 0, z], [x, 1, z], [x + s, 1, z]], [0, 0, -1]],
      ];
      for (const [di, dj, corners, n] of sides) {
        let hn = H(i + di, j + dj);
        if (Number.isNaN(hn)) hn = hf.floor ?? h - 2;
        if (hn >= h) continue;
        // a cliff face in up to three bands (the lip, the earth under it, the rock below), each one
        // quad however tall, shading darker toward the ground it stands on
        const bands: [number, number][] = [[h - 1, h]];
        if (h - 1 > hn) bands.push([Math.max(hn, h - 4), h - 1]);
        if (h - 4 > hn) bands.push([hn, h - 4]);
        for (const [la, lb] of bands) {
          const p = corners.map((c) => [c[0], (c[1] ? lb : la) * t, c[2]]);
          const lo = la === hn ? 0.62 : 0.86;
          const hi = lb === h ? 1 : 0.9;
          const a = corners.map((c) => (c[1] ? hi : lo));
          quad(p, n, hf.side(i, j, lb - 1, h - lb), a, jit);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** A heightfield split into chunks, so the camera only draws the ones in view. */
export function terrain(hf: Heightfield, chunk = 24, opts: { shadows?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  g.name = 'terrain';
  for (let j = 0; j < hf.nz; j += chunk) {
    for (let i = 0; i < hf.nx; i += chunk) {
      const geo = heightfieldMesh(hf, { i0: i, i1: Math.min(hf.nx, i + chunk), j0: j, j1: Math.min(hf.nz, j + chunk) });
      if (geo.attributes.position.count === 0) continue;
      const m = new THREE.Mesh(geo, worldMaterial());
      m.receiveShadow = true;
      m.castShadow = opts.shadows ?? false;
      g.add(m);
    }
  }
  return g;
}

// --------------------------------------------------------------------------------------- floors

export interface FloorSpec {
  /** voxel size across and up */
  cell: number;
  layer: number;
  /** how many layers thick the floor is */
  depth: number;
  /** extra margin past the floor shapes */
  pad?: number;
  /** colour variation per voxel */
  jitter?: number;
  /** colour at (x, z), and how many layers the surface sits below y = 0 there (grout, cracks) */
  at(x: number, z: number, i: number, j: number): { color: number; drop?: number; glow?: number } | null;
}

/** The fighting floor as voxels (flat on top at y = 0), chunked for culling. */
export function voxelFloor(shapes: Shape[], spec: FloorSpec): THREE.Group {
  const named = new THREE.Group();
  named.name = 'floor';
  named.add(voxelFloorInner(shapes, spec));
  return named;
}

function voxelFloorInner(shapes: Shape[], spec: FloorSpec): THREE.Group {
  const pad = spec.pad ?? 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of shapes) {
    const hw = s.type === 'circle' ? s.r : s.hw;
    const hd = s.type === 'circle' ? s.r : s.hd;
    minX = Math.min(minX, s.x - hw - pad);
    maxX = Math.max(maxX, s.x + hw + pad);
    minZ = Math.min(minZ, s.z - hd - pad);
    maxZ = Math.max(maxZ, s.z + hd + pad);
  }
  const g = new THREE.Group();
  const CH = 32;
  const nxAll = Math.ceil((maxX - minX) / spec.cell);
  const nzAll = Math.ceil((maxZ - minZ) / spec.cell);
  for (let cj = 0; cj < nzAll; cj += CH) {
    for (let ci = 0; ci < nxAll; ci += CH) {
      const nx = Math.min(CH, nxAll - ci) + 2;
      const nz = Math.min(CH, nzAll - cj) + 2;
      const ox = minX + (ci - 1) * spec.cell;
      const oz = minZ + (cj - 1) * spec.cell;
      const vol = new VoxelVolume(nx, spec.depth, nz, [spec.cell, spec.layer, spec.cell], [ox, -spec.depth * spec.layer, oz]);
      const glow = new VoxelVolume(nx, spec.depth, nz, [spec.cell, spec.layer, spec.cell], [ox, -spec.depth * spec.layer, oz]);
      let any = false;
      for (let z = 0; z < nz; z++) {
        for (let x = 0; x < nx; x++) {
          const px = ox + (x + 0.5) * spec.cell;
          const pz = oz + (z + 0.5) * spec.cell;
          if (!shapes.some((s) => shapeContains(s, px, pz, pad))) continue;
          const c = spec.at(px, pz, ci + x - 1, cj + z - 1);
          if (!c) continue;
          const drop = c.drop ?? 0;
          for (let y = 0; y < spec.depth - drop; y++) vol.set(x, y, z, y === spec.depth - drop - 1 ? c.color : shadeHex(c.color, 0.7));
          if (c.glow) glow.set(x, spec.depth - drop - 1, z, c.color, 0, c.glow);
          any = true;
        }
      }
      if (!any) continue;
      const region = { x0: 1, x1: nx - 1, z0: 1, z1: nz - 1 };
      const geo = meshVoxels(vol, { jitter: spec.jitter ?? 0.05, seed: ci * 31 + cj, region, skip: ['y-'] });
      const m = new THREE.Mesh(geo, worldMaterial());
      m.receiveShadow = true;
      g.add(m);
      if (glow.count > 0) {
        const gm = new THREE.Mesh(meshVoxels(glow, { jitter: 0.1, region }), glowMaterial());
        gm.position.y = 0.002;
        g.add(gm);
      }
    }
  }
  return g;
}

let glowMat: THREE.MeshBasicMaterial | null = null;
/** Unlit, vertex-coloured: for voxels that are their own light (lava, embers, lantern paper). */
export function glowMaterial(): THREE.MeshBasicMaterial {
  glowMat ??= new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return glowMat;
}

/** Is (x, z) on any of the shapes (with margin)? */
export function onShapes(shapes: Shape[], x: number, z: number, pad = 0): boolean {
  return shapes.some((s) => shapeContains(s, x, z, pad));
}

/** Distance from (x, z) to the nearest shape's edge (negative inside). */
export function shapeDistance(shapes: Shape[], x: number, z: number): number {
  let best = Infinity;
  for (const s of shapes) {
    let d: number;
    if (s.type === 'circle') d = Math.hypot(x - s.x, z - s.z) - s.r;
    else {
      const dx = Math.abs(x - s.x) - s.hw;
      const dz = Math.abs(z - s.z) - s.hd;
      d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
    }
    best = Math.min(best, d);
  }
  return best;
}

// -------------------------------------------------------------------------------------- islands

export interface IslandSpec {
  /** how far below the floor the rock reaches at the centre, and how ragged it is */
  depth: number;
  cell: number;
  rock: number[];
  /** the top band under the floor's edge: soil, with grass or snow on the lip */
  soil: number[];
  lip: number[];
  /** roots and vines hanging off the edge */
  vines?: number[];
  seed?: number;
  /** extra rim beyond the floor */
  pad?: number;
}

/** The rock under a floating floor: tapering down to a craggy point, with soil under the lip. */
export function floatingIsland(shapes: Shape[], spec: IslandSpec): THREE.Group {
  const named = new THREE.Group();
  named.name = 'island';
  named.add(floatingIslandInner(shapes, spec));
  return named;
}

function floatingIslandInner(shapes: Shape[], spec: IslandSpec): THREE.Group {
  const pad = spec.pad ?? 0.6;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of shapes) {
    const hw = s.type === 'circle' ? s.r : s.hw;
    const hd = s.type === 'circle' ? s.r : s.hd;
    minX = Math.min(minX, s.x - hw - pad - 1);
    maxX = Math.max(maxX, s.x + hw + pad + 1);
    minZ = Math.min(minZ, s.z - hd - pad - 1);
    maxZ = Math.max(maxZ, s.z + hd + pad + 1);
  }
  const seed = spec.seed ?? 5;
  const c = spec.cell;
  const nx = Math.ceil((maxX - minX) / c);
  const nz = Math.ceil((maxZ - minZ) / c);
  const ny = Math.ceil(spec.depth / c) + 2;
  const vol = new VoxelVolume(nx, ny, nz, [c, c, c], [minX, -ny * c, minZ]);
  // the size of the rock under each point: deepest under the middle of the floor
  let maxIn = 0;
  const inside = (x: number, z: number) => -shapeDistance(shapes, x, z);
  for (let z = 0; z < nz; z += 4) for (let x = 0; x < nx; x += 4) maxIn = Math.max(maxIn, inside(minX + x * c, minZ + z * c));
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const px = minX + (x + 0.5) * c;
      const pz = minZ + (z + 0.5) * c;
      const d = inside(px, pz) + pad;
      if (d < 0) continue;
      const k = Math.min(1, d / Math.max(1, maxIn + pad));
      const crag = fbm2(px * 0.12, pz * 0.12, 3, seed);
      const drop = spec.depth * (0.25 + 0.75 * Math.pow(k, 0.7)) * (0.6 + crag * 0.8) + 0.6;
      const layers = Math.min(ny, Math.max(2, Math.round(drop / c)));
      for (let y = 0; y < layers; y++) {
        const yy = ny - 1 - y;
        const h = hash3(x, yy, z, seed);
        const col = y === 0 ? pick(spec.lip, h) : y < 3 ? pick(spec.soil, h) : pick(spec.rock, h);
        vol.set(x, yy, z, col);
      }
      // roots and vines trailing from the lip
      if (spec.vines && d < 1.2 && hash3(x, 1, z, seed + 3) < 0.12) {
        const len = 2 + Math.floor(hash3(x, 2, z, seed) * 10);
        for (let y = 1; y < len; y++) {
          const yy = ny - 1 - layers - y + 2;
          if (yy < 0) break;
          vol.add(x, yy, z, pick(spec.vines, hash3(x, yy, z, seed)), 0.6);
        }
      }
    }
  }
  const g = new THREE.Group();
  // chunk it in strips so big islands still cull
  const step = 48;
  for (let z0 = 0; z0 < nz; z0 += step) {
    for (let x0 = 0; x0 < nx; x0 += step) {
      const geo = meshVoxels(vol, { jitter: 0.07, seed, region: { x0, x1: Math.min(nx, x0 + step), z0, z1: Math.min(nz, z0 + step) }, skip: ['y+'] });
      if (geo.attributes.position.count === 0) continue;
      const m = new THREE.Mesh(geo, worldMaterial());
      m.receiveShadow = true;
      // the top sits just under the floor surface
      m.position.y = -0.2;
      g.add(m);
    }
  }
  return g;
}

/** A small floating islet (for scenery): a disc of turf over a craggy cone of rock. */
export function islet(r: number, depth: number, spec: { rock: number[]; soil: number[]; lip: number[]; vines?: number[]; seed?: number; cell?: number }): THREE.Group {
  return floatingIsland([{ type: 'circle', x: 0, z: 0, r }], { depth, cell: spec.cell ?? 0.4, rock: spec.rock, soil: spec.soil, lip: spec.lip, vines: spec.vines, seed: spec.seed, pad: 0.2 });
}

// ------------------------------------------------------------------------------------ mountains

export interface MountainSpec {
  inner: number;
  outer: number;
  cell: number;
  step: number;
  /** peak height (metres) at the outer edge */
  height: number;
  base: number;
  rock: number[];
  snow?: number[];
  /** height (fraction of peak) above which snow lies */
  snowLine?: number;
  grass?: number[];
  seed?: number;
  /** a gap in the ring (radians) for a low sun to shine through */
  gapAt?: number;
  gapWidth?: number;
  /** how isolated the peaks are: 2 = ranges, 4 = lone spires */
  sharp?: number;
}

/** A ring of distant, blocky mountains, fading into the haze. */
export function mountainRing(spec: MountainSpec): THREE.Group {
  const n = Math.ceil((spec.outer * 2) / spec.cell);
  const half = (n * spec.cell) / 2;
  const seed = spec.seed ?? 11;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + (i + 0.5) * spec.cell;
      const z = -half + (j + 0.5) * spec.cell;
      const r = Math.hypot(x, z);
      if (r < spec.inner || r > spec.outer) {
        heights[j * n + i] = NaN;
        continue;
      }
      const k = (r - spec.inner) / (spec.outer - spec.inner);
      const ridge = 1 - Math.abs(fbm2(x * 0.006, z * 0.006, 4, seed) * 2 - 1);
      const sharp = spec.sharp ?? 2;
      let h = spec.height * Math.pow(Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.5), 1.4) * (sharp > 2 ? Math.pow(ridge, sharp) * 1.3 : 0.35 + ridge * ridge * 0.95);
      if (spec.gapAt !== undefined) {
        const a = Math.atan2(x, z);
        const off = Math.abs(Math.atan2(Math.sin(a - spec.gapAt), Math.cos(a - spec.gapAt)));
        h *= 0.25 + 0.75 * Math.min(1, off / (spec.gapWidth ?? 0.4));
      }
      heights[j * n + i] = Math.max(0, Math.round(h / spec.step));
    }
  }
  const snowLine = (spec.snowLine ?? 0.65) * spec.height;
  const hf: Heightfield = {
    x0: -half,
    z0: -half,
    nx: n,
    nz: n,
    cell: spec.cell,
    step: spec.step,
    height: (i, j) => (i < 0 || j < 0 || i >= n || j >= n ? NaN : heights[j * n + i]),
    top: (i, j, h) => {
      const y = h * spec.step;
      const r = hash3(i, h, j, seed);
      if (spec.snow && y > snowLine) return pick(spec.snow, r);
      if (spec.grass && y < spec.height * 0.25) return pick(spec.grass, r);
      return pick(spec.rock, r);
    },
    side: (i, j, l) => {
      const y = l * spec.step;
      const r = hash3(i, l, j, seed + 1);
      if (spec.snow && y > snowLine + spec.step) return pick(spec.snow, r * 0.6);
      return pick(spec.rock, r);
    },
    floor: 0,
  };
  const g = terrain(hf, 32);
  g.name = 'mountains';
  g.position.y = spec.base;
  return g;
}

/** Scatter points over an area, rejecting ones the predicate turns down, keeping a minimum spacing. */
export function scatter(count: number, bounds: { x0: number; z0: number; x1: number; z1: number }, ok: (x: number, z: number) => boolean, spacing: number, seed: number, taken: { x: number; z: number; r: number }[] = []): { x: number; z: number }[] {
  const R = rng(seed);
  const out: { x: number; z: number }[] = [];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const x = bounds.x0 + R() * (bounds.x1 - bounds.x0);
    const z = bounds.z0 + R() * (bounds.z1 - bounds.z0);
    if (!ok(x, z)) continue;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + spacing)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < spacing)) continue;
    out.push({ x, z });
  }
  for (const p of out) taken.push({ ...p, r: spacing * 0.5 });
  return out;
}

export type { MapDef };

// ------------------------------------------------------------------------------------ ring walls

export interface RingWallSpec {
  r: number;
  /** wall cross-section: for a point `d` metres from the centre line and `y` metres up, a colour or null */
  at(d: number, y: number, angle: number, x: number, yi: number, z: number): number | null;
  /** half-thickness of the whole cross-section (roofs included) and its height */
  halfWidth: number;
  height: number;
  voxel?: number;
  /** angular gaps (radians) where there's no wall */
  gaps?: { at: number; width: number }[];
  shadows?: boolean;
  seed?: number;
}

/** A wall that follows a circle, voxelized for real (no facets), in chunks. */
export function ringWall(spec: RingWallSpec): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wall';
  const v = spec.voxel ?? 0.1;
  const outer = spec.r + spec.halfWidth + v;
  const span = Math.ceil((outer * 2) / v);
  const ny = Math.ceil(spec.height / v);
  const CH = 60;
  for (let cz = 0; cz < span; cz += CH) {
    for (let cx = 0; cx < span; cx += CH) {
      const ox = -outer + cx * v - v;
      const oz = -outer + cz * v - v;
      const n = CH + 2;
      const vol = new VoxelVolume(n, ny, n, [v, v, v], [ox, 0, oz]);
      let any = false;
      for (let z = 0; z < n; z++) {
        for (let x = 0; x < n; x++) {
          const px = ox + (x + 0.5) * v;
          const pz = oz + (z + 0.5) * v;
          const d = Math.hypot(px, pz) - spec.r;
          if (Math.abs(d) > spec.halfWidth) continue;
          const a = Math.atan2(px, pz);
          if (spec.gaps?.some((gp) => Math.abs(Math.atan2(Math.sin(a - gp.at), Math.cos(a - gp.at))) * spec.r < gp.width / 2)) continue;
          for (let y = 0; y < ny; y++) {
            const c = spec.at(d, (y + 0.5) * v, a, x + cx, y, z + cz);
            if (c !== null) {
              vol.set(x, y, z, c);
              any = true;
            }
          }
        }
      }
      if (!any) continue;
      const m = new THREE.Mesh(meshVoxels(vol, { jitter: 0.04, seed: (spec.seed ?? 0) + cx + cz, region: { x0: 1, x1: n - 1, z0: 1, z1: n - 1 } }), worldMaterial());
      m.castShadow = spec.shadows ?? true;
      m.receiveShadow = true;
      g.add(m);
    }
  }
  return g;
}
