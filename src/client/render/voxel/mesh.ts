import * as THREE from 'three';
import type { VoxelModel } from '../../../../characters/voxel-model';

/** Meters per voxel: every fighter is authored at the same scale (1 voxel ≈ 2.25 cm). */
export const VOXEL = 0.0225;

const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
const AO_LEVELS = [0.55, 0.72, 0.86, 1];

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/**
 * One geometry per bone, in meters, with its origin at the bone's pivot. Faces hidden inside a
 * bone are culled; ambient occlusion is baked into the vertex colours from the whole model, so
 * seams between bones still darken.
 */
export function meshBones(model: VoxelModel, only?: (bone: string) => boolean): Map<string, THREE.BufferGeometry> {
  const all = new Set(model.voxels.map((v) => key(v.x, v.y, v.z)));
  const solid = (x: number, y: number, z: number) => (all.has(key(x, y, z)) ? 1 : 0);
  const colors = new Map(Object.entries(model.palette).map(([k, hex]) => [k, new THREE.Color(hex)]));
  const out = new Map<string, THREE.BufferGeometry>();

  for (const bone of model.bones) {
    if (only && !only(bone.name)) continue;
    const voxels = model.voxels.filter((v) => v.bone === bone.name);
    if (voxels.length === 0) continue;
    const own = new Set(voxels.map((v) => key(v.x, v.y, v.z)));
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const [px, py, pz] = bone.pivot;

    for (const v of voxels) {
      const base = colors.get(v.color)!;
      const jitter = 0.95 + hash3(v.x, v.y, v.z) * 0.08;
      for (const f of FACES) {
        const [nx, ny, nz] = f.n;
        if (own.has(key(v.x + nx, v.y + ny, v.z + nz))) continue;
        const start = pos.length / 3;
        const axis = f.n.findIndex((k) => k !== 0);
        const [a1, a2] = [0, 1, 2].filter((i) => i !== axis) as [number, number];
        const ao = f.c.map((c) => {
          const sa = [...f.n];
          const sb = [...f.n];
          sa[a1] = c[a1]! * 2 - 1;
          sb[a2] = c[a2]! * 2 - 1;
          const corner = [...f.n];
          corner[a1] = sa[a1]!;
          corner[a2] = sb[a2]!;
          const a = solid(v.x + sa[0]!, v.y + sa[1]!, v.z + sa[2]!);
          const b = solid(v.x + sb[0]!, v.y + sb[1]!, v.z + sb[2]!);
          const k = solid(v.x + corner[0]!, v.y + corner[1]!, v.z + corner[2]!);
          return a && b ? 0 : 3 - (a + b + k);
        });
        f.c.forEach((c, i) => {
          pos.push((v.x + c[0] - px) * VOXEL, (v.y + c[1] - py) * VOXEL, (v.z + c[2] - pz) * VOXEL);
          nor.push(nx, ny, nz);
          const k = AO_LEVELS[ao[i]!]! * jitter;
          col.push(base.r * k, base.g * k, base.b * k);
        });
        if (ao[0]! + ao[2]! > ao[1]! + ao[3]!) idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
        else idx.push(start + 1, start + 2, start + 3, start + 1, start + 3, start);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    out.set(bone.name, geo);
  }
  return out;
}
