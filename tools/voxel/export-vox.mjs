// Writes the rest pose (T-pose) of <character>/model.js as a MagicaVoxel .vox,
// plus a JSON rig (bones, pivots, per-bone voxels) for engine import.
// usage: node tools/voxel/export-vox.mjs characters/ronin

import { writeFile, mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const charDir = process.argv[2] || 'characters/ronin';
const name = basename(charDir);
const mod = await import(pathToFileURL(resolve(charDir, 'model.js')).href);
const build = Object.values(mod).find((f) => typeof f === 'function' && f.name.startsWith('build'));
const model = build();

const names = Object.keys(model.palette);
if (names.length > 255) throw new Error('palette exceeds 255 colours');
const index = Object.fromEntries(names.map((n, i) => [n, i + 1]));
const { min, max } = model.bounds;
const size = [max[0] - min[0] + 1, max[2] - min[2] + 1, max[1] - min[1] + 1];
if (size.some((s) => s > 256)) throw new Error(`model too large for one .vox chunk: ${size}`);

const chunk = (id, content, children = Buffer.alloc(0)) => {
  const head = Buffer.alloc(12);
  head.write(id, 0, 'ascii');
  head.writeInt32LE(content.length, 4);
  head.writeInt32LE(children.length, 8);
  return Buffer.concat([head, content, children]);
};

const sizeBuf = Buffer.alloc(12);
size.forEach((s, i) => sizeBuf.writeInt32LE(s, i * 4));

// MagicaVoxel is Z-up; the model is Y-up facing +Z, so the character faces -Y
// in MagicaVoxel, which is its default front view.
const xyzi = Buffer.alloc(4 + model.voxels.length * 4);
xyzi.writeInt32LE(model.voxels.length, 0);
model.voxels.forEach((v, i) => {
  xyzi.writeUInt8(v.x - min[0], 4 + i * 4);
  xyzi.writeUInt8(max[2] - v.z, 5 + i * 4);
  xyzi.writeUInt8(v.y - min[1], 6 + i * 4);
  xyzi.writeUInt8(index[v.color], 7 + i * 4);
});

const rgba = Buffer.alloc(256 * 4);
names.forEach((n, i) => {
  const hex = model.palette[n].slice(1);
  for (let c = 0; c < 3; c++) rgba.writeUInt8(parseInt(hex.slice(c * 2, c * 2 + 2), 16), i * 4 + c);
  rgba.writeUInt8(255, i * 4 + 3);
});

const children = Buffer.concat([chunk('SIZE', sizeBuf), chunk('XYZI', xyzi), chunk('RGBA', rgba)]);
const header = Buffer.alloc(8);
header.write('VOX ', 0, 'ascii');
header.writeInt32LE(150, 4);

const outDir = join(charDir, 'export');
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, `${name}_tpose.vox`), Buffer.concat([header, chunk('MAIN', Buffer.alloc(0), children)]));

const rig = {
  name,
  up: 'y',
  forward: '+z',
  palette: model.palette,
  poses: mod.poses ?? {},
  bones: model.bones.map((b) => ({
    ...b,
    voxels: model.voxels.filter((v) => v.bone === b.name).map((v) => [v.x, v.y, v.z, index[v.color] - 1]),
  })),
};
await writeFile(join(outDir, `${name}_rig.json`), JSON.stringify(rig));
console.log(`wrote ${name}_tpose.vox (${size.join('×')}, ${model.voxels.length} voxels) and ${name}_rig.json to ${outDir}`);
