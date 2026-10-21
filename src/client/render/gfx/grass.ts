/**
 * Grass and flowers: pixel-art tufts on crossed quads, Minecraft style, instanced in chunks so the
 * camera only draws what it can see. They sway with the wind, catch the light when backlit, fade to
 * shadow at their roots, and bend aside where a fighter walks through.
 */
import * as THREE from 'three';
import { litMaterial } from './materials';
import { hash3, rng } from './noise';

const CELL_W = 16;
const CELL_H = 24;
/** sprites in the atlas: short grass, tall grass, flower A, flower B */
const SPRITES = 4;

function atlas(blades: string[], flowers: string[], seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL_W * SPRITES;
  c.height = CELL_H;
  const g = c.getContext('2d')!;
  const R = rng(seed);
  const blade = (ox: number, x: number, h: number, lean: number, col: string) => {
    for (let y = 0; y < h; y++) {
      const px = Math.round(x + lean * (y / h) * (y / h) * 3);
      g.fillStyle = y < h * 0.3 ? shade(col, 0.75) : y > h * 0.8 ? shade(col, 1.18) : col;
      g.fillRect(ox + Math.max(0, Math.min(CELL_W - 1, px)), CELL_H - 1 - y, 1, 1);
    }
  };
  // short grass
  for (let i = 0; i < 9; i++) blade(0, 1 + R() * 13, 7 + R() * 9, R() * 2 - 1, blades[Math.floor(R() * blades.length)]);
  // tall grass
  for (let i = 0; i < 8; i++) blade(CELL_W, 1 + R() * 13, 13 + R() * 10, R() * 2.4 - 1.2, blades[Math.floor(R() * blades.length)]);
  // two flowers: a stem with leaves and a blossom of pixels
  for (let k = 0; k < 2; k++) {
    const ox = CELL_W * (2 + k);
    for (let i = 0; i < 4; i++) blade(ox, 2 + R() * 11, 5 + R() * 6, R() * 2 - 1, blades[Math.floor(R() * blades.length)]);
    const col = flowers.length ? flowers[k % flowers.length] : blades[0];
    for (let f = 0; f < 2; f++) {
      const fx = 4 + Math.floor(R() * 8);
      const fh = 12 + Math.floor(R() * 7);
      blade(ox, fx, fh, 0, blades[0]);
      const by = CELL_H - 1 - fh;
      g.fillStyle = col;
      g.fillRect(ox + fx - 1, by - 1, 3, 2);
      g.fillRect(ox + fx, by - 2, 1, 4);
      g.fillStyle = shade(col, 1.25);
      g.fillRect(ox + fx, by - 1, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  return t;
}

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  const s = c.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  const f = (v: number) => Math.round(Math.max(0, Math.min(1, v * k)) * 255);
  return `rgb(${f(s.r)},${f(s.g)},${f(s.b)})`;
}

/** Two crossed quads standing on the ground, with sway, leafiness and root shading per vertex. */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const vox: number[] = [];
  const ao: number[] = [];
  const idx: number[] = [];
  const w = 0.5;
  const h = 0.62;
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const dx = (Math.cos(a) * w) / 2;
    const dz = (Math.sin(a) * w) / 2;
    const base = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, h, dz, -dx, h, -dz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
    vox.push(0, 0.5, 0, 0.5, 0.11, 0.5, 0.11, 0.5);
    ao.push(0.55, 0.55, 1, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aVox', new THREE.Float32BufferAttribute(vox, 2));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  g.setIndex(idx);
  return g;
}

export interface GrassOptions {
  /** how thick the grass grows at (x, z), 0..1 */
  density: (x: number, z: number) => number;
  /** ground height at (x, z) */
  height?: (x: number, z: number) => number;
  bounds: { x0: number; z0: number; x1: number; z1: number };
  /** tufts per square metre where density is 1 */
  perM2: number;
  blades: string[];
  flowers?: string[];
  /** share of tufts that are flowers, and that are tall grass */
  flowerShare?: number;
  tallShare?: number;
  /** overall size */
  size?: number;
  seed?: number;
}

const CHUNK = 18;

export function buildGrass(o: GrassOptions, quality: number): THREE.Group {
  const group = new THREE.Group();
  const perM2 = o.perM2 * quality;
  if (perM2 <= 0.01) return group;
  const tex = atlas(o.blades, o.flowers ?? [], o.seed ?? 1);
  const mat = litMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, sway: true, leaf: true, ao: true, push: true, atlas: SPRITES });
  const geo = tuftGeometry();
  const step = 1 / Math.sqrt(perM2);
  const R = rng(o.seed ?? 1);
  const flowerShare = o.flowers?.length ? o.flowerShare ?? 0.08 : 0;
  const tallShare = o.tallShare ?? 0.25;
  const size = o.size ?? 1;
  const chunks = new Map<string, { m: THREE.Matrix4[]; sprite: number[]; tint: THREE.Color[] }>();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  for (let z = o.bounds.z0; z < o.bounds.z1; z += step) {
    for (let x = o.bounds.x0; x < o.bounds.x1; x += step) {
      const px = x + R() * step;
      const pz = z + R() * step;
      const d = o.density(px, pz);
      if (d <= 0 || R() > d) continue;
      const roll = R();
      const sprite = roll < flowerShare ? 2 + (R() < 0.5 ? 0 : 1) : roll < flowerShare + tallShare ? 1 : 0;
      const s = size * (0.75 + R() * 0.55) * (0.6 + d * 0.4);
      q.setFromAxisAngle(up, R() * Math.PI);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(px, o.height ? o.height(px, pz) : 0, pz), q, new THREE.Vector3(s, s * (0.8 + R() * 0.4), s));
      const key = `${Math.floor(px / CHUNK)},${Math.floor(pz / CHUNK)}`;
      let ch = chunks.get(key);
      if (!ch) chunks.set(key, (ch = { m: [], sprite: [], tint: [] }));
      ch.m.push(m);
      ch.sprite.push(sprite);
      // patchy colour: neighbouring tufts share a tint, drifting across the field
      const patch = hash3(Math.floor(px / 3), 0, Math.floor(pz / 3), 9);
      tint.setHSL(0, 0, 0.82 + patch * 0.3);
      ch.tint.push(tint.clone());
    }
  }
  for (const ch of chunks.values()) {
    const g = geo.clone();
    g.setAttribute('aSprite', new THREE.InstancedBufferAttribute(new Float32Array(ch.sprite), 1));
    const mesh = new THREE.InstancedMesh(g, mat, ch.m.length);
    ch.m.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, ch.tint[i]);
    });
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
