/**
 * Sky Bridge, at dusk. A plank bridge strung between two torii over a sea of cloud, the sun going
 * down right behind the far gate. A round stone platform in the middle rests on its own floating
 * rock. All around, islets drift in the warm air, each with a tree, a lantern or a little shrine,
 * and the far peaks rise out of the clouds.
 */
import * as THREE from 'three';
import { fbm2, hash3, rng } from '../gfx/noise';
import { VoxelVolume, meshVoxels } from '../gfx/voxel';
import { floatingIsland, hex, islet, mountainRing, pick, shadeHex, voxelFloor, worldMaterial } from './kit';
import { BuildContext, MapRecipe } from './look';

const PLANK = [hex('#9a8270'), hex('#8c7564'), hex('#a68c78'), hex('#927a68'), hex('#86705f')];
const GRANITE = [hex('#a29a94'), hex('#aea69f'), hex('#958d87'), hex('#b8b0a8')];
const ROCK = [hex('#5e4a52'), hex('#6a5560'), hex('#54424a'), hex('#73606a')];
const SOIL = [hex('#6a4a3a'), hex('#5c4032'), hex('#7a5644')];
const TURF = [hex('#6a8a44'), hex('#7a9a4c'), hex('#5e7e3c')];
const VINES = [hex('#4a6a34'), hex('#5a7a3c'), hex('#3e5a2c')];

const SUN_DISC: [number, number, number] = [0, 0.035, 1];

/** Beams under the span, rope rails between the posts, and a broken end hanging into the void. */
function bridgeFrame(): THREE.Group {
  const g = new THREE.Group();
  const v = 0.1;
  const vol = new VoxelVolume(72, 30, 460, [v, v, v], [-3.6, -2.6, -23]);
  const wood = [hex('#4a3428'), hex('#553c2e'), hex('#3f2c22')];
  const rope = [hex('#c8b48a'), hex('#b8a47a')];
  const w = (x: number, y: number, z: number) => pick(wood, hash3(x, y, z, 1));
  // long beams under each edge, cross beams, and struts down to nothing
  for (const sx of [-2.9, 2.9]) vol.box([sx - 0.2, -0.65, -22.6], [sx + 0.2, -0.3, 22.6], w);
  for (let z = -22; z <= 22; z += 2) {
    if (Math.abs(z) < 7.5) continue;
    vol.box([-3.3, -0.62, z - 0.12], [3.3, -0.36, z + 0.12], w);
    vol.tube([-2.9, -0.6, z], [0, -2.2, z], 0.08, 0.08, w(1, 2, 3));
    vol.tube([2.9, -0.6, z], [0, -2.2, z], 0.08, 0.08, w(2, 3, 4));
  }
  // rope rails, sagging between the posts
  for (const sx of [-3.05, 3.05]) {
    for (const [z0, z1] of [[-20, -12], [12, 20]]) {
      for (let k = 0; k < 2; k++) {
        const za = z0 + k * 4;
        const zb = za + 4;
        for (let z = za; z <= zb; z += v) {
          const t = (z - za) / (zb - za);
          const y = 0.85 - Math.sin(t * Math.PI) * 0.22;
          const [cx, cy, cz] = vol.cellOf(sx, y, z);
          vol.add(cx, cy, cz, pick(rope, hash3(cx, cy, cz, 2)));
        }
      }
      void z1;
    }
  }
  const m = new THREE.Mesh(meshVoxels(vol, { jitter: 0.05, seed: 3 }), worldMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  // broken planks dangling past each torii
  const R = rng(9);
  for (const end of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const pv = new VoxelVolume(64, 3, 3, [v, v, v], [-3.2, -0.15, -0.15]);
      const len = 1.5 + R() * 4.5;
      pv.box([-3.2 + R() * 1.5, 0, 0], [-3.2 + len, 0.1, 0.25], (x, y, z) => pick(PLANK, hash3(x, y, z, i)));
      const pm = new THREE.Mesh(meshVoxels(pv, { jitter: 0.06, seed: i }), worldMaterial());
      pm.position.set(0, -0.05 - i * 0.02, end * (22.3 + i * 0.28));
      pm.rotation.set(end * (0.15 + R() * 0.5) * (i / 7), 0, (R() - 0.5) * 0.5 * (i / 7));
      pm.castShadow = true;
      g.add(pm);
    }
  }
  return g;
}

export const bridgeRecipe: MapRecipe = {
  propStyle: 'moss',
  look: {
    sky: { zenith: '#232460', horizon: '#ff9a62', band: '#d85a86', bandAmount: 0.85, below: '#4a3266', glow: 1.3, discSize: 0.045 },
    light: { dir: [-0.15, 0.32, 1], color: '#ffae6a', intensity: 2.8 },
    disc: SUN_DISC,
    hemi: { sky: '#8c86d8', ground: '#5a3c5a', intensity: 1.4 },
    fog: { color: '#c8889a', sun: '#ffbe7a', density: 0.0022, falloff: 0.01, base: -10, glow: 5 },
    grade: { exposure: 1.04, contrast: 1.08, saturation: 1.1, gain: '#fff6ee', lift: '#1a1438', rays: 0.9, rayColor: '#ffc88a', bloom: 0.6 },
    wind: { dir: [-1, 0.25], strength: 1.1, gust: 0.8 },
    rim: { color: '#ffc890', strength: 0.85 },
    clouds: [
      { y: -28, cell: 9, thick: 5, cover: 0.62, half: 44, top: '#ffb48e', side: '#d07c96', bottom: '#5a3c72', speed: 2.2, layers: 2 },
      { y: 130, cell: 16, thick: 4, cover: 0.3, half: 36, top: '#ffd0b0', side: '#e8909a', bottom: '#7a5a8a', speed: 1.4, layers: 1 },
    ],
    lit: true,
    shadowExtent: 30,
  },
  build(ctx: BuildContext) {
    const { map, quality: q } = ctx;
    // ---------------------------------------------------------- the span and the platform
    ctx.group.add(
      voxelFloor(map.floor, {
        cell: 0.25,
        layer: 0.08,
        depth: 3,
        jitter: 0.03,
        at: (x, z) => {
          const r = Math.hypot(x, z);
          const cx = Math.floor(x / 0.25);
          const cz = Math.floor(z / 0.25);
          if (r < 7) {
            // a granite disc: rings, and a crest of four petals in the middle
            const a = Math.atan2(x, z);
            const petal = r < 2.6 && Math.abs(Math.sin(a * 2)) * 2.6 > r - 0.2 && r > 0.5;
            const ring = Math.abs(r - 3) < 0.13 || Math.abs(r - 5.4) < 0.13 || Math.abs(r - 6.8) < 0.2;
            const c = pick(GRANITE, hash3(cx, 0, cz, 2));
            return { color: petal ? hex('#a02a26') : ring ? shadeHex(c, 0.78) : c };
          }
          // planks across the span, a seam and nails between them
          const plank = Math.floor(z / 0.25);
          const c = pick(PLANK, hash3(plank, 0, 0, 3));
          const nail = Math.abs(Math.abs(x) - 2.7) < 0.13 && hash3(plank, 1, 0, 4) < 0.5;
          return { color: nail ? hex('#2a2422') : shadeHex(c, 0.96 + hash3(cx, 1, cz, 5) * 0.08), drop: hash3(plank, 2, 0, 6) < 0.04 ? 1 : 0 };
        },
      }),
    );
    ctx.group.add(bridgeFrame());
    ctx.group.add(floatingIsland([{ type: 'circle', x: 0, z: 0, r: 7 }], { depth: 11, cell: 0.35, rock: ROCK, soil: SOIL, lip: TURF, vines: VINES, seed: 3, pad: 0.4 }));

    // ---------------------------------------------------------- islets drifting in the warm air
    const R = rng(77);
    const isles: { x: number; y: number; z: number; r: number; tree?: 'sakura' | 'maple' | 'pine'; lantern?: boolean; torii?: boolean }[] = [
      { x: -16, y: -3, z: 6, r: 3.4, tree: 'maple', lantern: true },
      { x: 18, y: 2, z: -6, r: 4.2, tree: 'sakura', lantern: true },
      { x: 24, y: -6, z: 18, r: 3, lantern: true, torii: true },
      { x: -26, y: 4, z: -16, r: 5, tree: 'sakura' },
      { x: -14, y: 9, z: 28, r: 2.6, lantern: true },
      { x: 34, y: 8, z: -30, r: 6, tree: 'pine' },
      { x: -40, y: -8, z: 34, r: 6.5, tree: 'maple', lantern: true },
      { x: 12, y: -10, z: 40, r: 3.5, tree: 'sakura', lantern: true },
      { x: -8, y: -12, z: -36, r: 4, lantern: true, torii: true },
      { x: 46, y: -4, z: 8, r: 5, tree: 'sakura' },
    ];
    const keep = Math.max(4, Math.round(isles.length * (0.5 + q.scenery * 0.5)));
    for (const [i, s] of isles.slice(0, keep).entries()) {
      const g = islet(s.r, s.r * 1.8, { rock: ROCK, soil: SOIL, lip: TURF, vines: VINES, seed: 10 + i, cell: s.r > 4 ? 0.4 : 0.3 });
      const holder = new THREE.Group();
      holder.position.set(s.x, s.y, s.z);
      holder.add(g);
      ctx.group.add(holder);
      const bob = R() * 6;
      const base = s.y;
      ctx.animate((t) => {
        holder.position.y = base + Math.sin(t * 0.35 + bob) * 0.45;
        holder.rotation.y = Math.sin(t * 0.12 + bob) * 0.04;
      });
      // trees and lanterns ride along with their islet
      if (s.tree) ctx.trees([{ kind: s.tree, x: (R() - 0.5) * s.r * 0.6, z: (R() - 0.5) * s.r * 0.6, y: -0.2, s: 0.8 + s.r * 0.08 }], { into: holder });
      if (s.lantern) ctx.props([{ kind: 'lantern', x: s.r * 0.5, z: -s.r * 0.3, y: -0.2 }], holder);
      if (s.torii) ctx.props([{ kind: 'torii', x: 0, z: 0, y: -0.2, s: 0.55, rot: R() * Math.PI }], holder);
    }
    // the peaks at either end of the bridge, and the range beyond
    for (const end of [-1, 1]) {
      const g = islet(9, 26, { rock: ROCK, soil: SOIL, lip: TURF, vines: VINES, seed: 50 + end, cell: 0.5 });
      g.position.set(end * 4, -5, end * 40);
      ctx.group.add(g);
      ctx.trees([
        { kind: 'sakura', x: end * 4 - 4, z: end * 40 + 2, y: -5.2, s: 1.4 },
        { kind: 'maple', x: end * 4 + 4, z: end * 40 - 3, y: -5.2, s: 1.3 },
        { kind: 'pine', x: end * 4 + 1, z: end * 40 + 5 * end, y: -5.2, s: 1.3 },
      ]);
      ctx.props([{ kind: 'lantern', x: end * 4 - 1, z: end * 40 - 6 * end, y: -5.2 }]);
    }
    ctx.props([{ kind: 'pagoda', x: 4, z: 42, y: -5.2, s: 0.8, rot: Math.PI }]);
    ctx.group.add(
      mountainRing({
        inner: 140,
        outer: 520,
        cell: q.level === 'low' ? 16 : 10,
        step: 6,
        height: 150,
        base: -60,
        rock: [hex('#5a4a6a'), hex('#66547a'), hex('#4e4060')],
        snow: [hex('#f2d8e0'), hex('#ffe4e8')],
        snowLine: 0.72,
        gapAt: Math.atan2(SUN_DISC[0], SUN_DISC[2]),
        gapWidth: 0.4,
        seed: 51,
      }),
    );

    // ---------------------------------------------------------- air
    ctx.particles({ kind: 'petals', count: 900, center: new THREE.Vector3(0, 5, 0), size: new THREE.Vector3(40, 16, 40), scale: 0.075, colors: ['#f7a8c6', '#fbbdd2', '#ffd6e4', '#fff0f5'], ground: -40, seed: 13 });
    ctx.particles({ kind: 'leaves', count: 300, center: new THREE.Vector3(0, 5, 0), size: new THREE.Vector3(40, 16, 40), scale: 0.09, colors: ['#d8452e', '#e8642e', '#f2852f', '#c8352b'], ground: -40, seed: 14 });
    ctx.particles({ kind: 'dust', count: 220, center: new THREE.Vector3(0, 3, 0), size: new THREE.Vector3(26, 6, 26), scale: 0.025, colors: ['#ffe2c0'], seed: 15 });
    void fbm2;
  },
};
