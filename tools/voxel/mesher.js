// Turns a built voxel model into a three.js bone hierarchy: one mesh per bone,
// hidden faces culled, per-vertex ambient occlusion baked into vertex colours.

import * as THREE from 'three';
import { hash3 } from './builder.js';

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
const AO_LEVELS = [0.5, 0.68, 0.84, 1];

export function buildRig(model) {
  const all = new Set(model.voxels.map((v) => `${v.x},${v.y},${v.z}`));
  const solid = (x, y, z) => all.has(`${x},${y},${z}`);
  const colors = Object.fromEntries(Object.entries(model.palette).map(([k, hex]) => [k, new THREE.Color(hex)]));

  const byBone = new Map(model.bones.map((b) => [b.name, []]));
  for (const v of model.voxels) byBone.get(v.bone).push(v);

  const groups = {};
  for (const bone of model.bones) {
    const voxels = byBone.get(bone.name);
    const own = new Set(voxels.map((v) => `${v.x},${v.y},${v.z}`));
    const pos = [];
    const nor = [];
    const col = [];
    const idx = [];
    const [px, py, pz] = bone.pivot;

    for (const v of voxels) {
      const base = colors[v.color];
      const jitter = 0.94 + hash3(v.x, v.y, v.z) * 0.1;
      for (const f of FACES) {
        const [nx, ny, nz] = f.n;
        if (own.has(`${v.x + nx},${v.y + ny},${v.z + nz}`)) continue;
        const start = pos.length / 3;
        const axis = f.n.findIndex((k) => k !== 0);
        const [ax1, ax2] = [0, 1, 2].filter((i) => i !== axis);
        const ao = f.c.map((c) => {
          // the two edge neighbours and the corner neighbour in front of this vertex
          const sideA = [...f.n];
          const sideB = [...f.n];
          sideA[ax1] = c[ax1] * 2 - 1;
          sideB[ax2] = c[ax2] * 2 - 1;
          const corner = [...f.n];
          corner[ax1] = sideA[ax1];
          corner[ax2] = sideB[ax2];
          const a = solid(v.x + sideA[0], v.y + sideA[1], v.z + sideA[2]);
          const b = solid(v.x + sideB[0], v.y + sideB[1], v.z + sideB[2]);
          const k = solid(v.x + corner[0], v.y + corner[1], v.z + corner[2]);
          return a && b ? 0 : 3 - (a + b + k);
        });
        f.c.forEach((c, i) => {
          pos.push(v.x + c[0] - px, v.y + c[1] - py, v.z + c[2] - pz);
          nor.push(nx, ny, nz);
          const k = AO_LEVELS[ao[i]] * jitter;
          col.push(base.r * k, base.g * k, base.b * k);
        });
        if (ao[0] + ao[2] > ao[1] + ao[3]) idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
        else idx.push(start + 1, start + 2, start + 3, start + 1, start + 3, start);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    const group = new THREE.Group();
    group.name = bone.name;
    group.add(mesh);
    groups[bone.name] = group;
  }

  const root = new THREE.Group();
  for (const bone of model.bones) {
    const g = groups[bone.name];
    const parent = bone.parent ? model.bones.find((b) => b.name === bone.parent) : null;
    const pp = parent ? parent.pivot : [0, 0, 0];
    g.position.set(bone.pivot[0] - pp[0], bone.pivot[1] - pp[1], bone.pivot[2] - pp[2]);
    (parent ? groups[parent.name] : root).add(g);
  }

  const setPose = (pose = {}) => {
    for (const name of Object.keys(groups)) {
      const r = pose[name] || [0, 0, 0];
      groups[name].rotation.set(...r.map(THREE.MathUtils.degToRad));
    }
  };

  return { root, groups, setPose };
}
