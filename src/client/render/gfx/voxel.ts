/**
 * Voxel volumes and their meshes. A volume is a dense grid of coloured cells. Meshing keeps only the
 * faces that touch air and bakes ambient occlusion into every corner (the "smooth lighting" look:
 * a corner tucked between blocks goes dark). Each voxel's colour is jittered a little so surfaces
 * read as built from blocks. Wind sway comes from a function of position, evaluated per vertex, so
 * neighbouring voxels move together and never crack apart.
 */
import * as THREE from 'three';
import { hash3 } from './noise';

export type ColorInput = number | string | THREE.Color;

const colorCache = new Map<string, number>();

/** An sRGB colour as 0xRRGGBB. */
export function hex(c: ColorInput): number {
  if (typeof c === 'number') return c;
  if (c instanceof THREE.Color) return c.getHex();
  const hit = colorCache.get(c);
  if (hit !== undefined) return hit;
  const v = new THREE.Color(c).getHex();
  colorCache.set(c, v);
  return v;
}

/** Mix two 0xRRGGBB colours in sRGB. */
export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Scale a 0xRRGGBB colour's brightness. */
export function shadeHex(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

export class VoxelVolume {
  /** 0 = empty, else 0xRRGGBB | 1 << 24 */
  private readonly cells: Uint32Array;
  /** how leafy each voxel is (light through it when backlit), 0..255 */
  private readonly leafs: Uint8Array;
  /** emissive voxels (lantern paper, embers), 0..255 */
  private readonly glows: Uint8Array;
  count = 0;

  /**
   * @param scale size of one voxel along x, y, z (metres)
   * @param origin where cell (0, 0, 0)'s lower corner sits, in the mesh's local space
   */
  constructor(
    readonly nx: number,
    readonly ny: number,
    readonly nz: number,
    readonly scale: [number, number, number],
    readonly origin: [number, number, number] = [-(nx * scale[0]) / 2, 0, -(nz * scale[2]) / 2],
  ) {
    const n = nx * ny * nz;
    this.cells = new Uint32Array(n);
    this.leafs = new Uint8Array(n);
    this.glows = new Uint8Array(n);
  }

  /** A volume of cubic voxels centred on x/z, standing on y = 0. */
  static cubic(nx: number, ny: number, nz: number, size: number): VoxelVolume {
    return new VoxelVolume(nx, ny, nz, [size, size, size]);
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz;
  }

  private index(x: number, y: number, z: number): number {
    return x + this.nx * (z + this.nz * y);
  }

  set(x: number, y: number, z: number, color: ColorInput, leaf = 0, glow = 0): void {
    if (!this.inside(x, y, z)) return;
    const i = this.index(x, y, z);
    if (!this.cells[i]) this.count++;
    this.cells[i] = (hex(color) & 0xffffff) | (1 << 24);
    this.leafs[i] = Math.round(Math.max(0, Math.min(1, leaf)) * 255);
    this.glows[i] = Math.round(Math.max(0, Math.min(1, glow)) * 255);
  }

  /** Set only where empty. */
  add(x: number, y: number, z: number, color: ColorInput, leaf = 0, glow = 0): void {
    if (!this.has(x, y, z)) this.set(x, y, z, color, leaf, glow);
  }

  clear(x: number, y: number, z: number): void {
    if (!this.inside(x, y, z)) return;
    const i = this.index(x, y, z);
    if (this.cells[i]) this.count--;
    this.cells[i] = 0;
  }

  has(x: number, y: number, z: number): boolean {
    return this.inside(x, y, z) && this.cells[this.index(x, y, z)] !== 0;
  }

  /** 0xRRGGBB, or -1 when empty. */
  get(x: number, y: number, z: number): number {
    if (!this.inside(x, y, z)) return -1;
    const c = this.cells[this.index(x, y, z)];
    return c ? c & 0xffffff : -1;
  }

  leaf(x: number, y: number, z: number): number {
    return this.leafs[this.index(x, y, z)] / 255;
  }

  glow(x: number, y: number, z: number): number {
    return this.glows[this.index(x, y, z)] / 255;
  }

  /** Cell coordinates of a local-space point. */
  cellOf(px: number, py: number, pz: number): [number, number, number] {
    return [Math.floor((px - this.origin[0]) / this.scale[0]), Math.floor((py - this.origin[1]) / this.scale[1]), Math.floor((pz - this.origin[2]) / this.scale[2])];
  }

  /** Local-space centre of a cell. */
  centre(x: number, y: number, z: number): [number, number, number] {
    return [this.origin[0] + (x + 0.5) * this.scale[0], this.origin[1] + (y + 0.5) * this.scale[1], this.origin[2] + (z + 0.5) * this.scale[2]];
  }

  /** Fill every cell whose centre (local space) satisfies `fn`, which returns a colour or null. */
  fill(bounds: { min: [number, number, number]; max: [number, number, number] }, fn: (px: number, py: number, pz: number, x: number, y: number, z: number) => ColorInput | null, leaf = 0, glow = 0): void {
    const a = this.cellOf(...bounds.min);
    const b = this.cellOf(...bounds.max);
    for (let y = Math.max(0, a[1]); y <= Math.min(this.ny - 1, b[1]); y++) {
      for (let z = Math.max(0, a[2]); z <= Math.min(this.nz - 1, b[2]); z++) {
        for (let x = Math.max(0, a[0]); x <= Math.min(this.nx - 1, b[0]); x++) {
          const [px, py, pz] = this.centre(x, y, z);
          const c = fn(px, py, pz, x, y, z);
          if (c !== null) this.set(x, y, z, c, leaf, glow);
        }
      }
    }
  }

  /** A solid box in local space. */
  box(min: [number, number, number], max: [number, number, number], color: ColorInput | ((x: number, y: number, z: number) => ColorInput), leaf = 0, glow = 0): void {
    const fn = typeof color === 'function' ? color : () => color;
    this.fill({ min, max: [max[0] - 1e-4, max[1] - 1e-4, max[2] - 1e-4] }, (_px, _py, _pz, x, y, z) => fn(x, y, z), leaf, glow);
  }

  /** A ball in local space. */
  ball(cx: number, cy: number, cz: number, r: number, color: ColorInput | ((px: number, py: number, pz: number) => ColorInput | null), leaf = 0, glow = 0): void {
    const fn = typeof color === 'function' ? color : () => color;
    this.fill(
      { min: [cx - r, cy - r, cz - r], max: [cx + r, cy + r, cz + r] },
      (px, py, pz) => ((px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2 <= r * r ? fn(px, py, pz) : null),
      leaf,
      glow,
    );
  }

  /** A thick segment (tapering from r0 to r1) in local space: trunks, branches, poles. */
  tube(a: [number, number, number], b: [number, number, number], r0: number, r1: number, color: ColorInput | ((px: number, py: number, pz: number, t: number) => ColorInput)): void {
    const fn = typeof color === 'function' ? color : () => color;
    const r = Math.max(r0, r1);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len2 = dx * dx + dy * dy + dz * dz || 1e-6;
    this.fill(
      { min: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r], max: [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r] },
      (px, py, pz) => {
        const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / len2));
        const qx = a[0] + dx * t - px;
        const qy = a[1] + dy * t - py;
        const qz = a[2] + dz * t - pz;
        const rr = r0 + (r1 - r0) * t;
        return qx * qx + qy * qy + qz * qz <= rr * rr ? fn(px, py, pz, t) : null;
      },
    );
  }
}

export interface MeshOptions {
  /** colour variation per voxel, as a fraction of brightness */
  jitter?: number;
  seed?: number;
  /** wind: how far a vertex at this local position may move (metres); omit for rigid meshes */
  sway?: (px: number, py: number, pz: number) => number;
  /** darkness of the four occlusion levels, from most tucked-in to open */
  ao?: [number, number, number, number];
  /** skip faces on the volume's outer boundary in these directions (e.g. 'y-' for a floor slab) */
  skip?: ('x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-')[];
  /** only mesh voxels in this cell range (the rest still hide faces and cast occlusion): chunk padding */
  region?: { x0: number; x1: number; z0: number; z1: number };
}

// face corners (offsets from the voxel's lower corner), counter-clockwise seen from outside
const FACES: { n: [number, number, number]; u: number; v: number; corners: [number, number, number][]; key: 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-' }[] = [
  { n: [1, 0, 0], u: 1, v: 2, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], key: 'x+' },
  { n: [-1, 0, 0], u: 1, v: 2, corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], key: 'x-' },
  { n: [0, 1, 0], u: 0, v: 2, corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], key: 'y+' },
  { n: [0, -1, 0], u: 0, v: 2, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], key: 'y-' },
  { n: [0, 0, 1], u: 0, v: 1, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], key: 'z+' },
  { n: [0, 0, -1], u: 0, v: 1, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], key: 'z-' },
];

/** For each face and corner: the three cells (relative to the voxel) whose presence shades that corner. */
const AO_OFFSETS: number[][][] = FACES.map((f) =>
  f.corners.map((corner) => {
    const du = [0, 0, 0];
    const dv = [0, 0, 0];
    du[f.u] = corner[f.u] ? 1 : -1;
    dv[f.v] = corner[f.v] ? 1 : -1;
    const n = f.n;
    return [n[0] + du[0], n[1] + du[1], n[2] + du[2], n[0] + dv[0], n[1] + dv[1], n[2] + dv[2], n[0] + du[0] + dv[0], n[1] + du[1] + dv[1], n[2] + du[2] + dv[2]];
  }),
);

const linCache = new Map<number, [number, number, number]>();
const _c = new THREE.Color();

function linear(h: number): [number, number, number] {
  const hit = linCache.get(h);
  if (hit) return hit;
  _c.setHex(h);
  const v: [number, number, number] = [_c.r, _c.g, _c.b];
  linCache.set(h, v);
  return v;
}

/**
 * Mesh a volume. Attributes: position, normal, color (linear), aAO (0..1 brightness), and aVox
 * (x = sway in metres, y = leafiness) when the volume has sway or leaves.
 */
export function meshVoxels(vol: VoxelVolume, opts: MeshOptions = {}): THREE.BufferGeometry {
  const jitter = opts.jitter ?? 0.06;
  const seed = opts.seed ?? 0;
  const aoLevels = opts.ao ?? [0.42, 0.62, 0.82, 1];
  const skip = new Set(opts.skip ?? []);
  const [sx, sy, sz] = vol.scale;
  const [ox, oy, oz] = vol.origin;
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const ao: number[] = [];
  const vox: number[] = [];
  const idx: number[] = [];
  let anyVox = false;
  const solid = (x: number, y: number, z: number) => vol.has(x, y, z);
  const aoq = [0, 0, 0, 0];

  const rx0 = opts.region?.x0 ?? 0;
  const rx1 = opts.region?.x1 ?? vol.nx;
  const rz0 = opts.region?.z0 ?? 0;
  const rz1 = opts.region?.z1 ?? vol.nz;
  for (let y = 0; y < vol.ny; y++) {
    for (let z = rz0; z < rz1; z++) {
      for (let x = rx0; x < rx1; x++) {
        const c = vol.get(x, y, z);
        if (c < 0) continue;
        // per-voxel colour jitter: brightness with a slight warm/cool drift
        const j = (hash3(x, y, z, seed) - 0.5) * 2 * jitter;
        const jh = (hash3(x, y, z, seed + 7) - 0.5) * jitter * 0.5;
        const base = linear(c);
        const r = Math.max(0, base[0] * (1 + j + jh));
        const g = Math.max(0, base[1] * (1 + j));
        const b = Math.max(0, base[2] * (1 + j - jh));
        const leaf = vol.leaf(x, y, z);
        const glow = vol.glow(x, y, z);
        for (let fi = 0; fi < 6; fi++) {
          const f = FACES[fi];
          const nx = x + f.n[0];
          const ny = y + f.n[1];
          const nz = z + f.n[2];
          if (solid(nx, ny, nz)) continue;
          if (skip.has(f.key) && !vol.inside(nx, ny, nz)) continue;
          const start = pos.length / 3;
          for (let k = 0; k < 4; k++) {
            const corner = f.corners[k];
            // occlusion: the two edge neighbours and the diagonal one, in the layer outside the face
            const o = AO_OFFSETS[fi][k];
            const s1 = solid(x + o[0], y + o[1], z + o[2]) ? 1 : 0;
            const s2 = solid(x + o[3], y + o[4], z + o[5]) ? 1 : 0;
            const s3 = solid(x + o[6], y + o[7], z + o[8]) ? 1 : 0;
            const level = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
            aoq[k] = level;
            const px = ox + (x + corner[0]) * sx;
            const py = oy + (y + corner[1]) * sy;
            const pz = oz + (z + corner[2]) * sz;
            pos.push(px, py, pz);
            nor.push(f.n[0], f.n[1], f.n[2]);
            // glowing voxels carry their light in the colour (above 1 = blooms); the material adds no more
            const gl = 1 + glow * 5;
            col.push(r * gl, g * gl, b * gl);
            ao.push(glow > 0 ? 1 : aoLevels[level]);
            const w = opts.sway ? opts.sway(px, py, pz) : 0;
            if (w > 0 || leaf > 0) anyVox = true;
            vox.push(w, leaf);
          }
          // split the quad along the brighter diagonal so occlusion gradients don't fold
          if (aoq[0] + aoq[2] < aoq[1] + aoq[3]) idx.push(start + 1, start + 2, start + 3, start + 1, start + 3, start);
          else idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  if (anyVox) geo.setAttribute('aVox', new THREE.Float32BufferAttribute(vox, 2));
  geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** Merge geometries that share the voxel attributes into one (missing aVox counts as rigid). */
export function mergeVoxelGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = geos.reduce((n, g) => n + g.attributes.position.count, 0);
  const anyVox = geos.some((g) => g.attributes.aVox);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const ao = new Float32Array(total);
  const vox = anyVox ? new Float32Array(total * 2) : null;
  const idx: number[] = [];
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    col.set(g.attributes.color.array as Float32Array, o * 3);
    ao.set(g.attributes.aAO.array as Float32Array, o);
    if (vox && g.attributes.aVox) vox.set(g.attributes.aVox.array as Float32Array, o * 2);
    const gi = g.index!.array;
    for (let i = 0; i < gi.length; i++) idx.push(gi[i] + o);
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  if (vox) geo.setAttribute('aVox', new THREE.BufferAttribute(vox, 2));
  geo.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** Transform a voxel geometry in place (position and normal). */
export function transformVoxelGeometry(geo: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  geo.applyMatrix4(m);
  return geo;
}
