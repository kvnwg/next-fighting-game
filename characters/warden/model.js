// Warden: hulking juggernaut in rough stone plate with gilded edges over a
// black under-suit, small slit-eyed helm sunk between layered pauldrons, huge
// gauntlets. His warhammer is a separate prop (buildWardenHammer).
// ~102 voxels to the helm top at the shared scale (1 voxel ≈ 2.25 cm).

import { VoxelBuilder, hash3, noise3 } from '../../tools/voxel/builder.js';

export const palette = {
  stoneLight: '#b0b1b2',
  stone: '#8f9093',
  stoneDark: '#707275',
  stoneDeep: '#4e5054',
  gold: '#c2a25e',
  goldDark: '#8c7443',
  suit: '#1c1c20',
  suitHi: '#2a2a30',
  leather: '#2e2a26',
  leatherHi: '#4a443d',
  cloth: '#3b3b3f',
  clothDark: '#2a2a2e',
  iron: '#3d3e42',
  ironHi: '#5a5c61',
  void: '#060607',
};

const SHOULDER_Y = 82;
const sel = (a, b, n = 3) => Math.abs(a) ** n + Math.abs(b) ** n;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// Rough stone: broad low-frequency tone patches.
function stone(p, seed = 0) {
  const k = 0.085;
  const n = noise3(p[0] * k + seed * 3.1, p[1] * k, p[2] * k);
  return n < 0.3 ? 'stoneDark' : n > 0.68 ? 'stoneLight' : 'stone';
}
const bump = (p, amp = 1.4, k = 0.22) => (noise3(p[0] * k + 7, p[1] * k + 3, p[2] * k) - 0.5) * amp;

export function buildWarden() {
  const b = new VoxelBuilder(palette);

  // ---- skeleton -----------------------------------------------------------
  b.bone('pelvis', null, [0, 50, 0]);
  b.bone('torso', 'pelvis', [0, 56, 0]);
  b.bone('head', 'torso', [0, 88, 4]);
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    b.bone(`pauldron${side}`, 'torso', [21 * s, SHOULDER_Y + 4, 0]);
    b.bone(`upperArm${side}`, 'torso', [21 * s, SHOULDER_Y, 0]);
    b.bone(`forearm${side}`, `upperArm${side}`, [41 * s, SHOULDER_Y, 0]);
    b.bone(`hand${side}`, `forearm${side}`, [58 * s, SHOULDER_Y, 0]);
    b.bone(`thigh${side}`, 'pelvis', [12 * s, 50, 0]);
    b.bone(`shin${side}`, `thigh${side}`, [12.5 * s, 29, 0]);
    b.bone(`foot${side}`, `shin${side}`, [12.5 * s, 6, 1]);
  }

  // Plate band around a limb axis. axis 'x' (arms, u = |x|) or 'y' (legs,
  // u = y). The gilded edge sits on the distal end: +u for arms, -u for legs.
  const band = ({ axis, s = 1, c, u0, u1, r0, r1, depth = 2.6, n = 3, cover = () => true, seed = 0, trim = 'gold' }) => {
    const R = Math.max(r0, r1) + 2;
    const min = axis === 'x' ? [s > 0 ? u0 : -u1, c[0] - R, c[1] - R] : [c[0] - R, u0, c[1] - R];
    const max = axis === 'x' ? [s > 0 ? u1 : -u0, c[0] + R, c[1] + R] : [c[0] + R, u1, c[1] + R];
    b.fill(min, max, (p) => {
      const u = axis === 'x' ? Math.abs(p[0]) : p[1];
      const [a, w] = axis === 'x' ? [p[1] - c[0], p[2] - c[1]] : [p[0] - c[0], p[2] - c[1]];
      if (!cover(a, w, p)) return undefined;
      const t = (u - u0) / (u1 - u0);
      const r = lerp(r0, r1, t) + bump(p);
      const rr = sel(a / r, w / r, n);
      if (rr > 1) return undefined;
      if (rr < ((r - depth) / r) ** n) return undefined;
      const edge = axis === 'x' ? u > u1 - 1 : u < u0 + 1;
      return edge && trim ? trim : stone(p, seed);
    });
  };

  // ---- legs ------------------------------------------------------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const cx = 12.5 * s;
    b.use(`thigh${side}`);
    b.fill([cx - 8, 29, -8], [cx + 8, 50, 8], (p) => (sel((p[0] - cx) / 7, p[2] / 7.5, 2.5) <= 1 ? 'suit' : undefined));
    const outerFront = (a, w) => w > -2.5 || a * s > 3;
    band({ axis: 'y', c: [cx, 0.5], u0: 39, u1: 48, r0: 9.8, r1: 8.6, cover: outerFront, seed: 1 });
    band({ axis: 'y', c: [cx, 0.8], u0: 31, u1: 40, r0: 9.3, r1: 8.3, cover: outerFront, seed: 2 });

    b.use(`shin${side}`);
    b.fill([cx - 8, 6, -8], [cx + 8, 29, 8], (p) => (sel((p[0] - cx) / 6.6, p[2] / 6.8, 2.5) <= 1 ? 'suit' : undefined));
    band({ axis: 'y', c: [cx, 0.5], u0: 19, u1: 27, r0: 9.3, r1: 7.9, seed: 3 });
    band({ axis: 'y', c: [cx, 0.5], u0: 12, u1: 20, r0: 9.8, r1: 8.6, seed: 4 });
    band({ axis: 'y', c: [cx, 0.5], u0: 6, u1: 13, r0: 10.6, r1: 9.3, depth: 3.5, seed: 5 });
    // knee cop with a round side boss
    b.ellipsoid([cx, 29.5, 6.6], [7, 6, 4.4], (p) => (((p[0] - cx) / 7) ** 2 + ((p[1] - 29.5) / 6) ** 2 > 0.72 ? 'gold' : stone(p, 6)));
    b.disc([cx + 8.2 * s, 29, 0.5], [1, 0, 0], 3.6, 2.2, (p) => (Math.hypot(p[1] - 29, p[2] - 0.5) > 2.6 ? 'goldDark' : 'iron'));

    b.use(`foot${side}`);
    b.fill([cx - 8.5, 0, -8], [cx + 8.5, 8, 17], (p) => {
      const hw = 7.6 - Math.max(0, p[2] - 11) * 0.55 + bump(p, 0.8);
      if (Math.abs(p[0] - cx) > hw) return undefined;
      const top = 7.6 - Math.max(0, p[2] - 2) * 0.36 + bump(p, 0.8);
      if (p[1] > top) return undefined;
      if (p[2] < -7 + Math.max(0, 3 - p[1]) * 0.3) return undefined;
      if (p[1] < 1) return 'iron';
      if (p[1] > top - 1.2 && [5.5, 9.5, 13].some((z) => Math.abs(p[2] - z) < 0.6)) return 'gold';
      return stone(p, 7);
    });
  }

  // ---- pelvis: belt, plates, tabard ----------------------------------------
  b.use('pelvis');
  b.fill([-14, 44, -11], [14, 57, 11], (p) => (sel(p[0] / 13.5, p[2] / 10, 3) <= 1 ? 'suit' : undefined));
  b.fill([-16, 49, -13], [16, 56, 13], (p) => {
    if (sel(p[0] / 15.5, p[2] / 12, 3) > 1) return undefined;
    return Math.floor(p[1]) === 52 ? 'leatherHi' : 'leather';
  });
  // hip plates curving around the sides of the belt
  b.fill([-19, 42, -14], [19, 57, 15], (p) => {
    const ax = Math.abs(p[0]);
    if (ax < 6.6 || p[2] < -5) return undefined;
    const X = 17.6 + bump(p, 1.2), Z = 14 + bump(p, 1.2);
    const q = sel(p[0] / X, p[2] / Z, 3);
    if (q > 1 || q < ((X - 2.2) / X) ** 3) return undefined;
    if (p[1] < 43 + hash3(Math.floor(p[0]), 1, 2) * 1.5) return undefined;
    if (p[1] < 44.2 || ax < 7.6 || p[1] > 55.8) return 'gold';
    return stone(p, 8);
  });
  // big square front buckle
  b.fill([-5.5, 46, 11], [5.5, 57.5, 15.5], (p) => {
    if (p[2] > 13.8 + bump(p, 1)) return undefined;
    const edge = Math.abs(p[0]) > 4.4 || p[1] < 47.1 || p[1] > 56.4;
    return edge ? 'gold' : stone(p, 9);
  });
  // tabard front and back
  for (const sz of [1, -1]) {
    const bottom = sz > 0 ? 22 : 30;
    b.fill([-7, bottom - 2, -15], [7, 49, 15], (p, v) => {
      const t = (48 - p[1]) / (48 - bottom);
      const hw = 6.2 - t * 1.2;
      if (Math.abs(p[0]) > hw) return undefined;
      const z = sz * (12 + t * 2.2 + Math.sin(p[0] * 0.9) * 0.4);
      if (Math.abs(p[2] - z) > 0.7) return undefined;
      if (p[1] < bottom + hash3(v[0], 3, sz) * 3) return undefined;
      return Math.floor(p[0] + 20) % 3 === 0 ? 'clothDark' : 'cloth';
    });
  }

  // ---- torso ---------------------------------------------------------------
  b.use('torso');
  const torsoX = (y) => (y < 66 ? lerp(13.5, 16, clamp01((y - 56) / 10)) : y < 86 ? lerp(16, 21, clamp01((y - 66) / 12)) : lerp(21, 12, clamp01((y - 86) / 5)));
  const torsoZ = (y) => (y < 66 ? lerp(10, 11.5, clamp01((y - 56) / 10)) : y < 86 ? lerp(11.5, 13.5, clamp01((y - 66) / 14)) : lerp(13, 9, clamp01((y - 86) / 5)));
  b.fill([-22, 55, -15], [22, 91, 15], (p) => {
    if (sel(p[0] / torsoX(p[1]), p[2] / torsoZ(p[1]), 3) > 1) return undefined;
    // faint abdominal segmentation on the under-suit
    if (p[1] < 66 && p[2] > 8 && (Math.abs(p[0]) < 0.6 || Math.floor(p[1]) % 4 === 0)) return 'suitHi';
    return 'suit';
  });
  // chest slab: two halves meeting at a sunken seam, gilded lower edge
  b.fill([-24, 70, -6], [24, 88, 18], (p) => {
    const X = torsoX(p[1]) + 2.4 + bump(p);
    const Z = torsoZ(p[1]) + 2.6 + bump(p);
    const q = sel(p[0] / X, p[2] / Z, 3);
    if (q > 1 || q < ((X - 3.0) / X) ** 3) return undefined;
    const ax = Math.abs(p[0]);
    const lower = 71 + ax * 0.18 + hash3(Math.floor(p[0]), 4, 4) * 0.8;
    if (p[1] < lower) return undefined;
    if (p[2] < -5) return undefined;
    if (ax < 0.9 && p[2] > 8) return 'stoneDeep';
    if (p[1] < lower + 1) return 'gold';
    return stone(p, 10);
  });
  // lower rib plates either side
  for (const s of [1, -1])
    b.fill([s > 0 ? 2 : -14, 63, 0], [s > 0 ? 14 : -2, 73, 16], (p) => {
      const X = torsoX(p[1]) + 1.8 + bump(p);
      const Z = torsoZ(p[1]) + 2.0 + bump(p);
      const q = sel(p[0] / X, p[2] / Z, 3);
      if (q > 1 || q < ((X - 2.4) / X) ** 3) return undefined;
      if (p[1] < 63.5 + Math.abs(p[0]) * 0.12) return undefined;
      const ax = Math.abs(p[0]);
      if (ax < 3 || p[1] < 64.6 + ax * 0.12) return 'gold';
      return stone(p, 11);
    }, { mode: 'under' });
  // back slab
  b.fill([-24, 66, -18], [24, 89, -3], (p) => {
    const X = torsoX(p[1]) + 2.0 + bump(p);
    const Z = torsoZ(p[1]) + 2.4 + bump(p);
    const q = sel(p[0] / X, p[2] / Z, 3);
    if (q > 1 || q < ((X - 2.6) / X) ** 3) return undefined;
    if (p[1] < 67.5) return 'gold';
    if (Math.abs(p[0]) < 0.9) return 'stoneDeep';
    return stone(p, 12);
  }, { mode: 'under' });
  // gorget around the sunken neck
  b.fill([-10, 84, -8], [10, 91, 13], (p) => {
    const q = sel(p[0] / 9.2, (p[2] - 2.5) / 8.6, 2.5);
    if (q > 1 || q < (6.6 / 9.2) ** 2.5) return undefined;
    return p[1] > 89.8 ? 'gold' : stone(p, 13);
  });

  // ---- helm ---------------------------------------------------------------
  b.use('head');
  b.fill([-7.5, 87, -5], [7.5, 104, 12.5], (p) => {
    const y = p[1];
    let X = 6.2, Z = 7.0;
    if (y > 97) {
      const k = Math.sqrt(Math.max(0, 1 - ((y - 97) / 5.6) ** 2));
      if (k <= 0) return undefined;
      X *= k;
      Z *= k;
    }
    if (sel(p[0] / X, (p[2] - 3.5) / Z, 2.4) > 1) return undefined;
    const ax = Math.abs(p[0]);
    const front = p[2] > 3.5 + Z * 0.6;
    if (front) {
      // angry V eye slits either side of the nose ridge
      const slitY = 95.2 + (ax - 1.5) * 0.45;
      if (ax > 1.2 && ax < 4.8 && Math.abs(y - slitY) < 0.55) return 'void';
      if (ax < 1 && y > 89 && y < 92.5) return 'void';
    }
    return noise3(p[0] * 0.3, y * 0.3, p[2] * 0.3) > 0.62 ? 'stoneLight' : y > 99 ? 'stoneLight' : 'stone';
  });
  // nose ridge
  b.box([-1, 92.5, 9.6], [1, 101, 11.2], (p) => (p[1] > 100 && p[2] > 10.4 ? undefined : 'stoneLight'));

  // ---- arms ----------------------------------------------------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const span = (a, c) => (s > 0 ? [a, c] : [-c, -a]);

    b.use(`pauldron${side}`);
    const layers = [
      { c: [33.5, 78.5, 0], r: [9.5, 7.5, 12.2], cut: 74 },
      { c: [30, 82.8, 0], r: [11, 8.6, 13.6], cut: 78.2 },
      { c: [26, 87.2, 0.5], r: [12.2, 9.4, 14.8], cut: 82.6 },
    ];
    for (const [i, L] of layers.entries()) {
      const c = [L.c[0] * s, L.c[1], L.c[2]];
      b.fill(c.map((v, k) => v - L.r[k] - 2), c.map((v, k) => v + L.r[k] + 2), (p) => {
        if (p[1] < L.cut) return undefined;
        const g = 1 + bump(p, 0.14);
        const q = [0, 1, 2].reduce((acc, k) => acc + ((p[k] - c[k]) / (L.r[k] * g)) ** 2, 0);
        const qi = [0, 1, 2].reduce((acc, k) => acc + ((p[k] - c[k]) / (L.r[k] * g - 2.4)) ** 2, 0);
        if (q > 1) return undefined;
        if (qi < 1) return 'suit';
        if (p[1] < L.cut + 1.1) return 'gold';
        return stone(p, 20 + i);
      });
    }

    b.use(`upperArm${side}`);
    const [ux0, ux1] = span(18, 42);
    b.fill([ux0, SHOULDER_Y - 8, -8], [ux1, SHOULDER_Y + 8, 8], (p) => (sel((p[1] - SHOULDER_Y) / 6.6, p[2] / 6.6, 2.5) <= 1 ? 'suit' : undefined));
    band({ axis: 'x', s, c: [SHOULDER_Y, 0], u0: 26, u1: 32.5, r0: 7.2, r1: 8.2, seed: 29 });
    band({ axis: 'x', s, c: [SHOULDER_Y, 0], u0: 32, u1: 38, r0: 7.6, r1: 8.6, seed: 30 });
    // elbow cop
    b.ellipsoid([40.5 * s, SHOULDER_Y + 0.5, -1], [3.6, 7.6, 7.6], (p) => stone(p, 31));

    b.use(`forearm${side}`);
    const [fx0, fx1] = span(41, 58.5);
    b.fill([fx0, SHOULDER_Y - 8, -8], [fx1, SHOULDER_Y + 8, 8], (p) => (sel((p[1] - SHOULDER_Y) / 6.8, p[2] / 6.8, 2.5) <= 1 ? 'suit' : undefined));
    [[42.5, 47.5, 8.0, 9.4], [46.5, 51.5, 8.5, 9.9], [50.5, 55, 9.0, 10.4], [54, 58.5, 9.6, 10.9]].forEach(([u0, u1, r0, r1], i) =>
      band({ axis: 'x', s, c: [SHOULDER_Y, 0], u0, u1, r0, r1, depth: 3, seed: 32 + i }),
    );

    b.use(`hand${side}`);
    const [hx0, hx1] = span(58, 69);
    b.fill([hx0, SHOULDER_Y - 7, -7], [hx1, SHOULDER_Y + 7.5, 7], (p) => {
      const u = Math.abs(p[0]);
      const v = p[1] - SHOULDER_Y;
      const r = 6.2 + bump(p, 1) - Math.max(0, u - 66.5) * 1.2;
      if (sel(v / (r + 0.4), p[2] / r, 4) > 1) return undefined;
      // fingers curl under: dark creases between them on the far end and underside
      if ((u > 63.5 || v < -3) && [-3, 0, 3].some((z) => Math.abs(p[2] - z) < 0.5)) return 'stoneDeep';
      if (u > 63 && u < 64 && v > -3) return 'gold'; // knuckle plate edge
      return stone(p, 40);
    });
    b.fill([span(59, 64.5)[0], SHOULDER_Y - 5, 5], [span(59, 64.5)[1], SHOULDER_Y + 0.5, 9], (p) => {
      if (sel((p[1] - SHOULDER_Y + 2.3) / 2.8, (p[2] - 6.6) / 2.2, 2.5) > 1) return undefined;
      return Math.abs(p[0]) > 63.6 ? 'gold' : stone(p, 41);
    }); // thumb
  }

  return b.build();
}

// The warhammer, modelled planted head-down as in the reference.
export function buildWardenHammer() {
  const b = new VoxelBuilder(palette);
  b.bone('hammer', null, [0, 52, 0]);
  // head: bevelled block with lighter worn edges and an iron band
  b.fill([-12, 0, -8], [12, 17, 8], (p) => {
    const ax = Math.abs(p[0]), az = Math.abs(p[2]);
    const yy = Math.abs(p[1] - 8.5);
    const bevel = 2.2;
    if (ax > 11.5 || az > 7.5 || yy > 8.3) return undefined;
    if ((ax > 11.5 - bevel) + (az > 7.5 - bevel) + (yy > 8.3 - bevel) >= 2) {
      const over = Math.max(0, ax - 11.5 + bevel) + Math.max(0, az - 7.5 + bevel) + Math.max(0, yy - 8.3 + bevel);
      if (over > bevel + 0.6) return undefined;
      return 'ironHi';
    }
    if (ax > 10.6) return Math.abs(p[1] - 8.5) < 5.5 && az < 4.5 ? 'stoneDark' : 'iron'; // striking faces
    if (ax < 4.2) return Math.abs(ax - 3.6) < 0.6 ? 'gold' : 'ironHi';
    return noise3(p[0] * 0.3, p[1] * 0.3, p[2] * 0.3) > 0.6 ? 'ironHi' : 'iron';
  });
  // langets up the haft
  b.box([-2.6, 16, -2.6], [2.6, 24, 2.6], (p) => (Math.abs(p[0]) > 1.6 || Math.abs(p[2]) > 1.6 ? 'iron' : undefined));
  // haft with a spiral leather wrap, a collar ring and pommel
  b.segment([0, 16, 0], [0, 82, 0], 2.05, (p, t, d) => {
    const y = 16 + d;
    if (y > 47 && y < 49.5) return 'iron';
    const a = Math.atan2(p[2], p[0]);
    return Math.floor(y * 0.9 + a * 1.2) % 3 === 0 ? 'leatherHi' : 'leather';
  });
  b.disc([0, 48.2, 0], [0, 1, 0], 4.4, 2.2, (p) => (Math.hypot(p[0], p[2]) > 3.5 ? 'goldDark' : 'iron'));
  b.ellipsoid([0, 83.5, 0], [3.2, 3, 3.2], (p) => (p[1] > 85.4 ? 'gold' : 'iron'));
  return b.build();
}

export const poses = {
  tpose: {},
  apose: {
    upperArmL: [0, 0, -45],
    upperArmR: [0, 0, 45],
    pauldronL: [0, 0, -18],
    pauldronR: [0, 0, 18],
    forearmL: [0, -10, -8],
    forearmR: [0, 10, 8],
  },
};
