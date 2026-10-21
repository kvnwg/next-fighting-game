/**
 * Sakura Courtyard, at golden hour. A temple courtyard of worn stone tiles around a raked-sand
 * circle, petals drifting into the corners; white plaster walls under dark tile roofs; outside, a
 * grove of cherry trees on rolling hills, a koi pond under a red arched bridge, a pagoda against
 * the low sun, and far mountains with a gap where the sun goes down.
 */
import * as THREE from 'three';
import { fbm2, hash3 } from '../gfx/noise';
import { VoxelVolume, meshVoxels } from '../gfx/voxel';
import { Heightfield, hex, mountainRing, pick, scatter, shadeHex, terrain, voxelFloor, worldMaterial } from './kit';
import { BuildContext, MapRecipe } from './look';

const SAND = [hex('#d9cbb0'), hex('#e2d5bb'), hex('#d1c2a6'), hex('#e8dcc4')];
const TILE = [hex('#bcaf9f'), hex('#c3b6a6'), hex('#b5a898'), hex('#b9ac9c'), hex('#c7bbab')];
const FLAG = [hex('#9b968c'), hex('#a7a296'), hex('#8f8a80'), hex('#b0aa9e')];
const GROUT = [hex('#8a8076'), hex('#7d746a')];
const MOSS = [hex('#5c7a34'), hex('#6b8a3c'), hex('#4f6c2c')];
const PETAL = [hex('#f6a9c4'), hex('#fbbdd2'), hex('#f093b4'), hex('#ffd2e1')];
const GRASS = [hex('#6e9c3e'), hex('#78a646'), hex('#628f37'), hex('#83b04e'), hex('#5a8634')];
const DIRT = [hex('#7a5a3c'), hex('#6c4f34'), hex('#85644a')];
const ROCK = [hex('#7c7a80'), hex('#868489'), hex('#706e75')];
const GRAVEL = [hex('#c2b9aa'), hex('#b5ac9d'), hex('#cbc3b5')];

const SUN: [number, number, number] = [-0.78, 0.3, 0.46];
const POND = { x: 26, z: 8, hw: 7, hd: 2.6 };

/**
 * White plaster walls under a tiled roof (tsuiji-bei), voxelized as a true ring in chunks, with a
 * roofed gate where the path leaves for the shrine.
 */
function courtyardWall(r: number, gate: { at: number; width: number }): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wall';
  const v = 0.14;
  const plaster = [hex('#ece4d2'), hex('#e4dbc7'), hex('#f1eadb')];
  const stone = [hex('#8c877d'), hex('#97928a'), hex('#827d74')];
  const roof = [hex('#4f5664'), hex('#596070'), hex('#474d5a')];
  const outer = r + 0.55;
  const span = Math.ceil((outer * 2) / v);
  const CH = 60;
  for (let cz = 0; cz < span; cz += CH) {
    for (let cx = 0; cx < span; cx += CH) {
      const ox = -outer + cx * v - v;
      const oz = -outer + cz * v - v;
      const n = CH + 2;
      const vol = new VoxelVolume(n, Math.ceil(2.2 / v), n, [v, v, v], [ox, 0, oz]);
      let any = false;
      for (let z = 0; z < n; z++) {
        for (let x = 0; x < n; x++) {
          const px = ox + (x + 0.5) * v;
          const pz = oz + (z + 0.5) * v;
          const d = Math.hypot(px, pz) - r;
          if (Math.abs(d) > 0.52) continue;
          const a = Math.atan2(px, pz);
          const off = Math.abs(Math.atan2(Math.sin(a - gate.at), Math.cos(a - gate.at)));
          if (off * r < gate.width / 2) continue;
          any = true;
          const ad = Math.abs(d);
          for (let y = 0; y < Math.ceil(2.2 / v); y++) {
            const py = (y + 0.5) * v;
            let c: number | null = null;
            if (py < 0.3 && ad < 0.28) c = pick(stone, hash3(x + cx, y, z + cz, 2));
            else if (py < 1.7 && ad < 0.22) c = Math.abs(py - 0.95) < v / 2 || Math.abs(py - 1.45) < v / 2 ? hex('#d8cdb6') : pick(plaster, hash3(x + cx, y, z + cz, 3));
            else if (py >= 1.7 && py < 1.8 && ad < 0.26) c = hex('#3a2a20');
            else if (py >= 1.8 && py < 1.9 && ad < 0.5) c = pick(roof, hash3(x + cx, y, z + cz, 4));
            else if (py >= 1.9 && py < 2.0 && ad < 0.36) c = pick(roof, hash3(x + cx, y, z + cz, 5));
            else if (py >= 2.0 && py < 2.12 && ad < 0.16) c = hex('#3c414c');
            if (c !== null) vol.set(x, y, z, c);
          }
        }
      }
      if (!any) continue;
      const m = new THREE.Mesh(meshVoxels(vol, { jitter: 0.03, seed: cx + cz, region: { x0: 1, x1: n - 1, z0: 1, z1: n - 1 } }), worldMaterial());
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
  }
  // gate posts and a small roof over the gap
  const vol = new VoxelVolume(64, 34, 14, [v, v, v], [-3.2, 0, -0.7]);
  const wood = [hex('#3a2a20'), hex('#44322a')];
  for (const sx of [-1, 1]) vol.box([sx * 2.45 - 0.22, 0, -0.22], [sx * 2.45 + 0.22, 2.8, 0.22], (x, y, z) => pick(wood, hash3(x, y, z, 1)));
  vol.box([-2.7, 2.6, -0.2], [2.7, 2.8, 0.2], (x, y, z) => pick(wood, hash3(x, y, z, 2)));
  for (let k = 0; k < 4; k++) vol.box([-3.1 + k * 0.15, 2.8 + k * 0.1, -0.65 + k * 0.14], [3.1 - k * 0.15, 2.9 + k * 0.1, 0.65 - k * 0.14], (x, y, z) => pick(roof, hash3(x, y, z, 3)));
  const gm = new THREE.Mesh(meshVoxels(vol, { jitter: 0.04, seed: 3 }), worldMaterial());
  gm.position.set(Math.sin(gate.at) * r, 0, Math.cos(gate.at) * r);
  gm.rotation.y = gate.at;
  gm.castShadow = true;
  gm.receiveShadow = true;
  g.add(gm);
  return g;
}

const inPond = (x: number, z: number, pad = 0) => ((x - POND.x) / (POND.hw + pad)) ** 4 + ((z - POND.z) / (POND.hd + pad)) ** 4 < 1;
const onPath = (x: number, z: number) => Math.abs(x) < 1.7 && z < -16 && z > -31;
const shrineYard = (x: number, z: number) => Math.abs(x) < 5 && z < -20.5 && z > -31;
const PAGODA = { x: SUN[0] / Math.hypot(SUN[0], SUN[2]) * 40, z: SUN[2] / Math.hypot(SUN[0], SUN[2]) * 40 };
const nearPagoda = (x: number, z: number) => Math.hypot(x - PAGODA.x, z - PAGODA.z) < 6.5;

/** Ground height around the courtyard (metres). */
function groundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (onPath(x, z) || shrineYard(x, z)) return 0;
  if (inPond(x, z)) return -0.75;
  if (nearPagoda(x, z)) return 1.0;
  const hills = (fbm2(x * 0.035, z * 0.035, 4, 21) - 0.38) * 9;
  const rise = Math.max(0, Math.min(1, (r - 21) / 26));
  let h = Math.max(0, hills) * rise * rise + rise * 1.5;
  // ease up to the pagoda's mound
  const dp = Math.hypot(x - PAGODA.x, z - PAGODA.z);
  if (dp < 11) h = h + (1.0 - h) * (1 - (dp - 6.5) / 4.5) * (dp > 6.5 ? 1 : 0);
  // a low bank around the pond
  if (inPond(x, z, 1.6)) h = Math.min(h, 0.25);
  return h;
}

export const sakuraRecipe: MapRecipe = {
  propStyle: 'moss',
  look: {
    sky: { zenith: '#6c84c8', horizon: '#ffcf9c', band: '#ffab9a', bandAmount: 0.65, below: '#e8b8a0', glow: 1.15 },
    light: { dir: SUN, color: '#ffc488', intensity: 3.1 },
    hemi: { sky: '#b3bde0', ground: '#9a7a66', intensity: 1.35 },
    fog: { color: '#f2cfc4', sun: '#ffd9a0', density: 0.0065, falloff: 0.035, glow: 5 },
    grade: { exposure: 1.05, contrast: 1.06, saturation: 1.16, gain: '#fff1e2', lift: '#1c1630', rays: 0.6, rayColor: '#ffd6a0', bloom: 0.55 },
    wind: { dir: [1, 0.35], strength: 0.9, gust: 0.7 },
    rim: { color: '#ffd8a8', strength: 0.75 },
    clouds: [{ y: 125, cell: 14, thick: 5, cover: 0.36, half: 40, top: '#ffe6cc', side: '#f6bca8', bottom: '#c08ca6', speed: 1.6, layers: 2 }],
    lit: true,
    shadowExtent: 30,
  },
  build(ctx: BuildContext) {
    const { map, quality: q } = ctx;
    const sakuras = map.props.filter((p) => p.kind === 'sakura');
    const petalNear = (x: number, z: number) => {
      let d = 0;
      for (const s of sakuras) d += Math.exp(-((x - s.x) ** 2 + (z - s.z) ** 2) / 14);
      return d;
    };

    // ---------------------------------------------------------- the courtyard floor
    ctx.group.add(
      voxelFloor(map.floor, {
        cell: 0.25,
        layer: 0.08,
        depth: 3,
        jitter: 0.025,
        at: (x, z) => {
          const r = Math.hypot(x, z);
          const cx = Math.floor(x / 0.25);
          const cz = Math.floor(z / 0.25);
          const h = hash3(cx, 0, cz, 1);
          const petals = petalNear(x, z) * 0.22 + Math.max(0, (r - 13.5) / 2.5) * 0.18;
          if (r < 6) {
            // raked sand: faint concentric lines around the middle
            const groove = r > 0.7 && r % 0.75 < 0.25;
            if (!groove && hash3(cx, 3, cz, 9) < petals * 0.5) return { color: pick(PETAL, h) };
            return { color: groove ? shadeHex(pick(SAND, h), 0.93) : pick(SAND, h) };
          }
          if (r < 6.5) return { color: pick(FLAG, h), drop: 0 };
          if (Math.abs(x) < 1.75 && z < -6.4) {
            // the flagstone path to the gate
            const gx = (((x + 1.75) % 0.875) + 0.875) % 0.875 < 0.13;
            const gz = (((z % 0.62) + 0.62) % 0.62) < 0.13;
            if (gx || gz) return { color: pick(GROUT, h), drop: 1 };
            return { color: pick(FLAG, hash3(Math.floor((x + 1.75) / 0.875), 1, Math.floor(z / 0.62), 3)) };
          }
          // big old flagstones in staggered rows: a faint seam between them, the odd one sunken,
          // moss creeping along some seams
          const tz = Math.floor(cz / 6);
          const shift = tz % 2 ? 3 : 0;
          const tx = Math.floor((cx + shift) / 6);
          const seam = (((cx + shift) % 6) + 6) % 6 === 0 || ((cz % 6) + 6) % 6 === 0;
          const tile = pick(TILE, hash3(tx, 2, tz, 7));
          const sunk = hash3(tx, 3, tz, 8) < 0.07 ? 1 : 0;
          if (hash3(cx, 5, cz, 6) < petals) return { color: pick(PETAL, h), drop: sunk };
          if (seam) return { color: h < 0.12 ? pick(MOSS, hash3(cx, 1, cz, 4)) : shadeHex(tile, 0.86), drop: sunk };
          return { color: shadeHex(tile, 0.95 + h * 0.08), drop: sunk };
        },
      }),
    );
    ctx.group.add(courtyardWall(16.75, { at: Math.PI, width: 4.6 }));

    // ---------------------------------------------------------- terrain around it
    const fine = q.level === 'low' ? 1 : 0.5;
    const near: Heightfield = {
      x0: -48,
      z0: -48,
      nx: Math.round(96 / fine),
      nz: Math.round(96 / fine),
      cell: fine,
      step: 0.25,
      height: (i, j) => {
        const x = -48 + (i + 0.5) * fine;
        const z = -48 + (j + 0.5) * fine;
        const r = Math.hypot(x, z);
        if (r < 17.05 || r > 47) return NaN;
        return Math.round(groundHeight(x, z) / 0.25);
      },
      top: (i, j, h) => {
        const x = -48 + (i + 0.5) * fine;
        const z = -48 + (j + 0.5) * fine;
        const n = hash3(i, h, j, 3);
        if (onPath(x, z)) return pick(FLAG, n);
        if (shrineYard(x, z) || nearPagoda(x, z)) return pick(GRAVEL, n);
        if (inPond(x, z, 0.6)) return pick(ROCK, n);
        if (hash3(i, 7, j, 8) < petalNear(x, z) * 0.12 + 0.03) return pick(PETAL, n);
        const patch = fbm2(x * 0.08, z * 0.08, 2, 4);
        return patch < 0.32 ? pick(DIRT, n) : pick(GRASS, n);
      },
      side: (i, j, l, below) => (below === 0 ? pick(GRASS, hash3(i, l, j, 5)) : below < 4 ? pick(DIRT, hash3(i, l, j, 6)) : pick(ROCK, hash3(i, l, j, 7))),
      floor: -4,
    };
    ctx.group.add(terrain(near, 32));
    const coarse = q.level === 'low' ? 2 : 1;
    const far: Heightfield = {
      x0: -120,
      z0: -120,
      nx: Math.round(240 / coarse),
      nz: Math.round(240 / coarse),
      cell: coarse,
      step: 0.5,
      height: (i, j) => {
        const x = -120 + (i + 0.5) * coarse;
        const z = -120 + (j + 0.5) * coarse;
        const r = Math.hypot(x, z);
        if (r < 46.5 || r > 118) return NaN;
        const base = groundHeight(x, z);
        const lift = Math.max(0, (r - 50) / 60) ** 1.5 * 16;
        return Math.round((base + lift + fbm2(x * 0.02, z * 0.02, 3, 8) * 4 * Math.min(1, (r - 46) / 20)) / 0.5);
      },
      top: (i, j, h) => {
        const n = hash3(i, h, j, 11);
        return h > 26 && n < 0.5 ? pick(ROCK, n) : pick(GRASS, n);
      },
      side: (i, j, l, below) => (below === 0 ? pick(GRASS, hash3(i, l, j, 12)) : pick(DIRT, hash3(i, l, j, 13))),
      floor: -2,
    };
    ctx.group.add(terrain(far, 32));
    const heightAt = (x: number, z: number) => {
      const r = Math.hypot(x, z);
      if (r < 46.5) return Math.round(groundHeight(x, z) / 0.25) * 0.25;
      const lift = Math.max(0, (r - 50) / 60) ** 1.5 * 16;
      return Math.round((groundHeight(x, z) + lift + fbm2(x * 0.02, z * 0.02, 3, 8) * 4 * Math.min(1, (r - 46) / 20)) / 0.5) * 0.5;
    };

    ctx.group.add(
      mountainRing({
        inner: 150,
        outer: 560,
        cell: q.level === 'low' ? 16 : 10,
        step: 5,
        height: 130,
        base: -2,
        rock: [hex('#6f6a7c'), hex('#7a7488'), hex('#665f72')],
        snow: [hex('#efe4ea'), hex('#f6ecef')],
        grass: [hex('#5d6a4e'), hex('#66744f')],
        gapAt: Math.atan2(SUN[0], SUN[2]),
        gapWidth: 0.35,
        seed: 31,
      }),
    );

    // ---------------------------------------------------------- the pond, bridge and garden
    ctx.water({ shape: { type: 'rect', x: POND.x, z: POND.z, w: POND.hw * 2 + 0.6, d: POND.hd * 2 + 0.6 }, y: -0.12, deep: '#1f4448', shallow: '#4a7a6c', ripple: 0.05 });
    ctx.props([
      { kind: 'archBridge', x: POND.x, z: POND.z, rot: 0, y: -0.15 },
      { kind: 'lilyPads', x: POND.x - 4, z: POND.z - 0.5, y: -0.11 },
      { kind: 'lilyPads', x: POND.x + 4.2, z: POND.z + 0.6, y: -0.11, variant: 0 },
      { kind: 'gardenRock', x: POND.x - 7.6, z: POND.z + 2.2, s: 0.9 },
      { kind: 'gardenRock', x: POND.x + 7.4, z: POND.z - 2.6, s: 1.1 },
      { kind: 'gardenRock', x: POND.x + 2.5, z: POND.z + 3.6, s: 0.6 },
      { kind: 'lantern', x: POND.x - 5, z: POND.z + 4, y: heightAt(POND.x - 5, POND.z + 4) },
      { kind: 'lantern', x: POND.x + 5.5, z: POND.z - 4.2, y: heightAt(POND.x + 5.5, POND.z - 4.2) },
      { kind: 'steppingStones', x: 19.5, z: 3.2, rot: 0.9, y: 0.02 },
      { kind: 'pagoda', x: PAGODA.x, z: PAGODA.z, y: 1.0, rot: 0.4 },
      // lanterns lining the way to the shrine
      ...[-20.5, -23.5, -27.5, -30].flatMap((z) => [
        { kind: 'lantern' as const, x: -2.4, z },
        { kind: 'lantern' as const, x: 2.4, z },
      ]),
      { kind: 'lantern', x: PAGODA.x + 5, z: PAGODA.z - 2, y: 1.0 },
      { kind: 'lantern', x: PAGODA.x - 3, z: PAGODA.z + 5, y: 1.0 },
    ]);
    ctx.taken.push({ x: POND.x, z: POND.z, r: 8 }, { x: PAGODA.x, z: PAGODA.z, r: 7 }, { x: 0, z: -25, r: 6 });

    // ---------------------------------------------------------- the grove
    const outside = (x: number, z: number) => {
      const r = Math.hypot(x, z);
      return r > 18.6 && !onPath(x, z) && !shrineYard(x, z) && !inPond(x, z, 1.4) && !nearPagoda(x, z);
    };
    const nearTrees = scatter(Math.round(30 * q.scenery + 8), { x0: -46, z0: -46, x1: 46, z1: 46 }, (x, z) => outside(x, z) && Math.hypot(x, z) < 44, 4.2, 71, ctx.taken);
    const farTrees = scatter(Math.round(70 * q.scenery), { x0: -110, z0: -110, x1: 110, z1: 110 }, (x, z) => Math.hypot(x, z) > 46 && Math.hypot(x, z) < 108, 6, 72, ctx.taken);
    ctx.trees(
      [
        ...nearTrees.map((p, i) => ({ kind: (i % 7 === 3 ? 'pine' : 'sakura') as 'pine' | 'sakura', x: p.x, z: p.z, y: heightAt(p.x, p.z), s: 1.1 + hash3(i, 0, 0, 2) * 0.5 })),
        ...farTrees.map((p, i) => ({ kind: (i % 3 === 0 ? 'pine' : 'sakura') as 'pine' | 'sakura', x: p.x, z: p.z, y: heightAt(p.x, p.z), s: 1.2 + hash3(i, 1, 0, 2) * 0.6 })),
      ],
      { shadows: true },
    );
    const bushes = scatter(Math.round(26 * q.scenery), { x0: -46, z0: -46, x1: 46, z1: 46 }, (x, z) => outside(x, z) && Math.hypot(x, z) < 40, 2.5, 73, ctx.taken);
    ctx.trees(bushes.map((p, i) => ({ kind: i % 3 ? 'flowerBush' : 'bush', x: p.x, z: p.z, y: heightAt(p.x, p.z), s: 0.9 + hash3(i, 2, 0, 1) * 0.5 })), { shadows: true });

    // ---------------------------------------------------------- grass and flowers
    ctx.grass({
      bounds: { x0: -46, z0: -46, x1: 46, z1: 46 },
      perM2: 5,
      density: (x, z) => {
        if (!outside(x, z)) return 0;
        const r = Math.hypot(x, z);
        if (r > 45) return 0;
        const patch = fbm2(x * 0.08, z * 0.08, 2, 4);
        return patch < 0.32 ? 0.15 : 0.55 + patch * 0.6;
      },
      height: heightAt,
      blades: ['#5e8f34', '#6fa03e', '#7fb04a', '#8fbe56', '#4f7d2c'],
      flowers: ['#f7a8c6', '#fff3f6', '#f5d24a', '#c79ae8'],
      flowerShare: 0.1,
      tallShare: 0.3,
      seed: 5,
    });

    // ---------------------------------------------------------- air
    ctx.particles({ kind: 'petals', count: 1800, center: new THREE.Vector3(0, 7, 0), size: new THREE.Vector3(46, 14, 46), scale: 0.075, colors: ['#f7a8c6', '#fbbdd2', '#ffd6e4', '#f190b2', '#fff0f5'], seed: 3 });
    ctx.particles({ kind: 'dust', count: 260, center: new THREE.Vector3(0, 3.5, 0), size: new THREE.Vector3(30, 7, 30), scale: 0.025, colors: ['#fff2d8'], seed: 9 });
  },
};
