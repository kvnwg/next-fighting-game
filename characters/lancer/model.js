// Lancer: blackened plate with a horned close helm, a heavy white fur mantle,
// round chest boss and a black cape lined in ochre. His weapon is the golden
// spear (buildLancerSpear): twisted bronze shaft, jagged radiant blade and
// crackling lightning. ~87 voxels to the horn tips (1 voxel ≈ 2.25 cm).

import { VoxelBuilder, hash3, noise3 } from '../../tools/voxel/builder.js';

export const palette = {
  plate: '#2b2d33',
  plateHi: '#464a53',
  plateEdge: '#7a7f8a',
  plateDeep: '#17181b',
  mail: '#3a3c42',
  leather: '#30271f',
  fur: '#e8e1d4',
  furShade: '#c8bfad',
  furDeep: '#9d9481',
  cloak: '#1e1f23',
  cloakFold: '#141518',
  lining: '#a27d3a',
  liningShade: '#7d602c',
  void: '#050506',
  // spear
  shaft: '#4a3220',
  shaftHi: '#6e4b2c',
  goldDeep: '#a8791f',
  gold: '#e2b13b',
  goldLight: '#f6d46c',
  goldHot: '#fff1b8',
  bolt: '#ffd65a',
  boltHot: '#fff8d6',
};

const SHOULDER_Y = 63;
const sel = (a, b, n = 2.6) => Math.abs(a) ** n + Math.abs(b) ** n;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// Dark plate with occasional worn highlights, so large surfaces don't go flat.
const plate = (p, seed = 0) => (noise3(p[0] * 0.3 + seed, p[1] * 0.3, p[2] * 0.3) > 0.7 ? 'plateHi' : 'plate');

export function buildLancer() {
  const b = new VoxelBuilder(palette);

  // ---- skeleton -----------------------------------------------------------
  b.bone('pelvis', null, [0, 44, 0]);
  b.bone('torso', 'pelvis', [0, 46, 0]);
  b.bone('head', 'torso', [0, 69, 0.5]);
  b.bone('cape', 'torso', [0, 64, -6]);
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    b.bone(`pauldron${side}`, 'torso', [11 * s, SHOULDER_Y + 2, 0]);
    b.bone(`upperArm${side}`, 'torso', [11 * s, SHOULDER_Y, 0]);
    b.bone(`forearm${side}`, `upperArm${side}`, [25 * s, SHOULDER_Y, 0]);
    b.bone(`hand${side}`, `forearm${side}`, [36 * s, SHOULDER_Y, 0]);
    b.bone(`thigh${side}`, 'pelvis', [4.8 * s, 44, 0]);
    b.bone(`shin${side}`, `thigh${side}`, [4.9 * s, 26, 0]);
    b.bone(`foot${side}`, `shin${side}`, [5 * s, 3, 0.5]);
  }

  // Shell around a vertical or arm-length axis with a bright edge on one end.
  const shell = ({ axis, s = 1, c, u0, u1, r0, r1, depth = 1.6, n = 2.6, cover = () => true, edgeAt = 'low', seed = 0, rz }) => {
    const R = Math.max(r0, r1, rz ?? 0) + 2;
    const min = axis === 'x' ? [s > 0 ? u0 : -u1, c[0] - R, c[1] - R] : [c[0] - R, u0, c[1] - R];
    const max = axis === 'x' ? [s > 0 ? u1 : -u0, c[0] + R, c[1] + R] : [c[0] + R, u1, c[1] + R];
    b.fill(min, max, (p) => {
      const u = axis === 'x' ? Math.abs(p[0]) : p[1];
      const [a, w] = axis === 'x' ? [p[1] - c[0], p[2] - c[1]] : [p[0] - c[0], p[2] - c[1]];
      if (!cover(a, w, p)) return undefined;
      const r = lerp(r0, r1, (u - u0) / (u1 - u0));
      const ry = rz ? r * (rz / Math.max(r0, r1)) : r;
      const q = sel(a / r, w / ry, n);
      if (q > 1 || q < sel((r - depth) / r, 0, n)) return undefined;
      const edge = edgeAt === 'low' ? u < u0 + 1 : u > u1 - 1;
      return edge ? 'plateEdge' : plate(p, seed);
    });
  };

  // ---- legs ---------------------------------------------------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const cx = 4.9 * s;
    b.use(`thigh${side}`);
    b.fill([cx - 5, 26, -5], [cx + 5, 44, 5], (p) => (sel((p[0] - cx) / 3.9, p[2] / 4.1) <= 1 ? 'mail' : undefined));
    shell({ axis: 'y', c: [cx, 0.2], u0: 28, u1: 36, r0: 4.6, r1: 4.6, cover: (a, w) => w > -1.5, seed: 1 });
    shell({ axis: 'y', c: [cx, 0.2], u0: 35, u1: 43, r0: 4.9, r1: 4.9, cover: (a, w) => w > -1.5, seed: 2 });

    b.use(`shin${side}`);
    b.fill([cx - 5, 4, -5], [cx + 5, 26, 5], (p) => {
      const calf = 3.3 + Math.max(0, 1 - Math.abs(p[1] - 18) / 7) * 0.6;
      if (sel((p[0] - cx) / calf, (p[2] + 0.2) / (calf + 0.3)) > 1) return undefined;
      if (Math.abs(p[0] - cx) < 0.6 && p[2] > 2) return 'plateHi'; // shin ridge
      return p[1] < 5 ? 'plateEdge' : plate(p, 3);
    });
    b.ellipsoid([cx, 26, 3.4], [3.5, 2.9, 2.2], (p) => (p[1] < 23.8 ? 'plateEdge' : 'plateHi'));
    b.disc([cx + 3.6 * s, 26, 0.8], [1, 0, 0], 2.4, 1.1, (p) => (Math.hypot(p[1] - 26, p[2] - 0.8) > 1.6 ? 'plateEdge' : 'plate'));

    b.use(`foot${side}`);
    b.fill([cx - 3.5, 0, -4], [cx + 3.5, 5.2, 8], (p) => {
      const hw = 2.9 - Math.max(0, p[2] - 4) * 0.35;
      if (Math.abs(p[0] - cx) > hw) return undefined;
      const top = 5 - Math.max(0, p[2] - 1) * 0.5;
      if (p[1] > top || p[2] < -3.6) return undefined;
      if (p[1] < 0.9) return 'plateDeep';
      if ([2.5, 4.5].some((z) => Math.abs(p[2] - z) < 0.5)) return 'plateEdge';
      return 'plate';
    });
  }

  // ---- pelvis: mail skirt, belt and layered tassets ------------------------
  b.use('pelvis');
  b.fill([-10, 27, -8], [10, 45, 8], (p) => (sel(p[0] / (8 + (45 - p[1]) * 0.05), p[2] / 5.8) <= 1 ? 'mail' : undefined), { mode: 'under' });
  b.fill([-10, 44, -8], [10, 46.6, 8], (p) => {
    if (sel(p[0] / 8.6, p[2] / 6.2) > 1) return undefined;
    return Math.abs(p[0] - 1.5) < 1.2 && p[2] > 4 ? 'plateEdge' : 'leather';
  });
  [[40, 45, 9.0, 9.4], [35.5, 40.8, 9.4, 9.9], [31, 36.4, 9.8, 10.4], [27, 32, 10.2, 10.8]].forEach(([y0, y1, rTop, rBot], i) => {
    b.fill([-12, y0, -9], [12, y1, 9], (p) => {
      const t = (y1 - p[1]) / (y1 - y0);
      const X = lerp(rTop, rBot, t), Z = X * 0.68;
      const q = sel(p[0] / X, p[2] / Z);
      if (q > 1 || q < sel((X - 1.5) / X, 0)) return undefined;
      if (p[2] > 0 && Math.abs(p[0]) < 1.6 + i * 0.5) return undefined; // split at the front
      return p[1] < y0 + 1 ? 'plateEdge' : plate(p, 10 + i);
    });
  });

  // ---- torso: breastplate, chest boss, gorget ------------------------------
  b.use('torso');
  const torsoX = (y) => (y < 56 ? lerp(7.6, 9.6, clamp01((y - 46) / 10)) : y < 64 ? lerp(9.6, 10.6, clamp01((y - 56) / 6)) : 10.6 - (y - 64) * 1.6);
  const torsoZ = (y) => (y < 58 ? lerp(5.0, 6.3, clamp01((y - 46) / 12)) : lerp(6.3, 5.0, clamp01((y - 58) / 9)));
  b.fill([-12, 45, -8], [12, 68.5, 8], (p) => {
    const X = torsoX(p[1]), Z = torsoZ(p[1]);
    if (sel(p[0] / X, p[2] / Z) > 1) return undefined;
    if (p[2] > 2) {
      if (Math.abs(p[0]) < 0.6) return 'plateHi'; // central ridge
      if (Math.abs(p[1] - 53.3) < 0.5) return 'plateDeep'; // plackart seam
      if (Math.abs(p[1] - 52.6) < 0.4) return 'plateEdge';
    }
    return plate(p, 20);
  });
  // engraved round boss (cloak clasp) on the left breast
  b.disc([4.2, 58.4, 6.4], [0.15, 0, 1], 2.8, 1.4, (p) => {
    const r = Math.hypot(p[0] - 4.2, p[1] - 58.4);
    return r > 2.1 ? 'plateEdge' : (Math.floor(r * 2 + Math.atan2(p[1] - 58.4, p[0] - 4.2) * 0.8) % 2 ? 'plateHi' : 'plateEdge');
  });
  // gorget lames
  b.fill([-6, 65, -6], [6, 71, 6], (p) => {
    const q = sel(p[0] / 4.6, (p[2] - 0.3) / 4.6, 2);
    if (q > 1 || q < (3 / 4.6) ** 2) return undefined;
    return Math.floor(p[1]) % 2 ? 'plateHi' : 'plate';
  });

  // ---- fur mantle over the shoulders --------------------------------------
  b.fill([-16, 59, -12], [16, 76, 12], (p) => {
    const q = Math.sqrt((p[0] / 14) ** 2 + ((p[2] + 0.5) / 9.6) ** 2);
    if (q > 1 || q < 0.34) return undefined;
    const rn = (q - 0.34) / 0.66;
    const fluff = (noise3(p[0] * 0.45, p[2] * 0.45, 3) - 0.5) * 3.2;
    const top = 73.2 - rn * 6.5 + fluff;
    const bottom = 63.4 - rn * 3.2 - noise3(p[0] * 0.5, p[2] * 0.5, 9) * 1.8;
    if (p[1] > top || p[1] < bottom) return undefined;
    if (p[1] < bottom + 1) return 'furDeep';
    const n = noise3(p[0] * 0.6, p[1] * 0.6, p[2] * 0.6);
    return n > 0.62 ? 'furShade' : n < 0.3 ? 'furDeep' : 'fur';
  });
  // stray tufts flicking off the rim
  for (let i = 0; i < 70; i++) {
    const a = hash3(i, 1, 9) * Math.PI * 2;
    const q = 0.75 + hash3(i, 2, 9) * 0.28;
    const x = Math.cos(a) * 14 * q, z = Math.sin(a) * 9.6 * q - 0.5;
    const y = 73.2 - ((q - 0.34) / 0.66) * 6.5 - 0.5;
    const out = 1.5 + hash3(i, 3, 9) * 2.5;
    b.segment([x, y, z], [x + Math.cos(a) * out, y + (hash3(i, 4, 9) - 0.3) * 3, z + Math.sin(a) * out * 0.8], 0.55, hash3(i, 5, 9) > 0.5 ? 'fur' : 'furShade');
  }

  // ---- cape: black outside, ochre lining, billowing to the left ------------
  b.use('cape');
  const capeQ = (p) => {
    const t = (66 - p[1]) / 60;
    const flare = p[0] > 0 ? 1 + t * t * 0.35 : 1;
    const X = (10.8 + t * 7.5) * flare;
    const Z = 6.6 + t * 4.2;
    const a = Math.atan2(p[2] + 0.6, p[0]);
    const wave = 1 + 0.06 * Math.sin(a * 9 + p[1] * 0.05) * t;
    return { t, a, outer: sel(p[0] / (X * wave), (p[2] + 0.6) / (Z * wave), 2), inner: sel(p[0] / (X * wave - 1.6), (p[2] + 0.6) / (Z * wave - 1.6), 2) };
  };
  b.fill([-22, 6, -16], [24, 66, 2], (p, v) => {
    const { t, a, outer, inner } = capeQ(p);
    if (outer > 1 || inner < 1) return undefined;
    if (p[2] > -0.6 - (p[0] > 0 ? t * 3.5 : 0.8)) return undefined; // open at the front
    if (p[1] < 6.5 + hash3(v[0], 4, v[2]) * 3) return undefined;
    if (p[0] > 0 && p[2] > -0.6 - t * 3.5 - 2.2 && t > 0.35) return 'lining'; // left side turned back
    return Math.sin(a * 9 + p[1] * 0.05) > 0.6 ? 'cloakFold' : 'cloak';
  });
  // a cape voxel covered on both outward sides (x and z) can't be seen from
  // outside, so it belongs to the lining that faces the body
  const isCape = (x, y, z) => b.voxels.get(`${x},${y},${z}`)?.bone === 'cape';
  for (const v of [...b.voxels.values()].filter((v) => v.bone === 'cape' && v.color.startsWith('cloak'))) {
    const sx = Math.sign(v.x + 0.5), sz = Math.sign(v.z + 0.5 + 0.6);
    if (isCape(v.x + sx, v.y, v.z) && isCape(v.x, v.y, v.z + sz)) v.color = 'liningShade';
  }

  // ---- helm ----------------------------------------------------------------
  b.use('head');
  b.fill([-6, 69, -6], [6, 83, 9], (p) => {
    const y = p[1];
    let X = y < 72 ? 4.0 : 4.6;
    let Z = 5.1;
    if (y > 78) {
      const k = Math.sqrt(Math.max(0, 1 - ((y - 78) / 3.8) ** 2));
      if (k <= 0) return undefined;
      X *= k;
      Z *= k;
    }
    const ax = Math.abs(p[0]);
    // pointed visor: a beak that projects forward along the centre line
    const beak = y > 71 && y < 79.5 ? Math.max(0, 1.7 * (1 - Math.abs(y - 75.4) / 4.2) - ax * 0.4) : 0;
    const zf = 0.6 + Z + beak;
    if (p[2] > zf) return undefined;
    if (p[2] <= 0.6 && sel(p[0] / X, (p[2] - 0.6) / Z) > 1) return undefined;
    if (p[2] > 0.6 && sel(p[0] / X, (p[2] - 0.6) / (zf - 0.6)) > 1) return undefined;
    if (p[2] > 3) {
      if (y > 76.8 && y < 77.8 && ax > 0.6) return 'void'; // eye slit
      if (y > 78.2 && y < 78.9) return 'plateDeep'; // visor seam
      if (p[0] < -1 && p[0] > -3.4 && y > 72.5 && y < 75.5 && Math.floor(y) % 2 === 0 && Math.floor(p[0]) % 2 === 0) return 'void'; // breaths
      if (ax < 0.6) return 'plateEdge';
    }
    return y > 79.5 ? 'plateHi' : plate(p, 30);
  });
  b.box([-0.6, 79.5, -3.5], [0.6, 82.2, 3.5], (p) => (Math.abs(p[2]) < 3.2 && p[1] < 81.9 - Math.abs(p[2]) * 0.3 ? 'plateEdge' : undefined)); // crest
  for (const s of [1, -1])
    b.polyline([[2.6 * s, 79.6, -0.4], [3.6 * s, 83.4, -1.4], [3.4 * s, 86.6, -3.4]], (i) => [0.95, 0.6][i], (p, t) => (t > 0.6 ? 'plateEdge' : 'plateHi'));

  // ---- arms ----------------------------------------------------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const span = (a, c) => (s > 0 ? [a, c] : [-c, -a]);

    b.use(`pauldron${side}`);
    for (const [i, L] of [
      { c: [15.6, 62, 0], r: [4.8, 4.2, 4.8], cut: 58.6 },
      { c: [13.6, 64.6, 0], r: [5.6, 4.6, 5.4], cut: 61 },
    ].entries()) {
      const c = [L.c[0] * s, L.c[1], L.c[2]];
      b.ellipsoid(c, L.r, (p) => (p[1] < L.cut ? undefined : p[1] < L.cut + 0.9 ? 'plateEdge' : plate(p, 40 + i)));
    }

    b.use(`upperArm${side}`);
    const [ux0, ux1] = span(9, 26);
    b.fill([ux0, SHOULDER_Y - 4, -4], [ux1, SHOULDER_Y + 4, 4], (p) => (sel((p[1] - SHOULDER_Y) / 2.9, p[2] / 2.9) <= 1 ? 'mail' : undefined), { mode: 'under' });
    shell({ axis: 'x', s, c: [SHOULDER_Y, 0], u0: 15, u1: 23.5, r0: 3.4, r1: 3.5, edgeAt: 'high', seed: 41 });
    b.ellipsoid([25 * s, SHOULDER_Y, -1.6], [2.0, 3.6, 3.4], (p) => (p[2] < -3.6 ? 'plateEdge' : 'plateHi')); // couter

    b.use(`forearm${side}`);
    shell({ axis: 'x', s, c: [SHOULDER_Y, 0], u0: 25.5, u1: 36, r0: 3.1, r1: 3.4, depth: 3.4, edgeAt: 'high', seed: 42 });

    b.use(`hand${side}`);
    shell({ axis: 'x', s, c: [SHOULDER_Y, 0], u0: 35.6, u1: 38.4, r0: 3.7, r1: 4.2, depth: 1.4, edgeAt: 'high', seed: 43 });
    b.box([span(38, 41.6)[0], SHOULDER_Y - 1.5, -2.2], [span(38, 41.6)[1], SHOULDER_Y + 1.5, 2.2], (p) => plate(p, 44));
    b.box([span(41.6, 45)[0], SHOULDER_Y - 1.2, -2.2], [span(41.6, 45)[1], SHOULDER_Y + 1.0, 2.2], (p) =>
      Math.floor(Math.abs(p[0])) % 2 ? 'plateHi' : 'plate',
    );
    b.segment([39 * s, SHOULDER_Y - 0.6, 2.4], [42 * s, SHOULDER_Y - 1, 3.2], 0.75, 'plateHi'); // thumb
  }

  return b.build();
}

// The golden spear, vertical: butt spike at the bottom, blade at the top.
export function buildLancerSpear() {
  const b = new VoxelBuilder(palette);
  b.bone('spear', null, [0, 60, 0]);
  b.bone('spearHead', 'spear', [0, 92, 0], { emissive: true });
  b.bone('lightning', 'spear', [0, 60, 0], { emissive: true, opacity: 0.9 });

  // twisted shaft with gold veins
  b.use('spear');
  b.fill([-2, 6, -2], [2, 90, 2], (p) => {
    const r = Math.hypot(p[0], p[2]);
    if (r > 1.25) return undefined;
    const a = Math.atan2(p[2], p[0]);
    const twist = Math.sin(a * 2 - p[1] * 0.55);
    if (twist > 0.86) return 'gold';
    return twist > 0.2 ? 'shaftHi' : 'shaft';
  });
  // butt spike
  b.fill([-2, 0, -2], [2, 7, 2], (p) => (Math.hypot(p[0], p[2]) < 0.2 + (p[1] / 7) * 1.4 ? (p[1] < 2 ? 'goldLight' : 'gold') : undefined));
  // ornate socket: twisted gold wraps flaring into the blade
  b.fill([-3, 84, -3], [3, 93, 3], (p) => {
    const r = Math.hypot(p[0], p[2]);
    const flare = 1.4 + Math.max(0, p[1] - 88) * 0.25 + Math.sin(Math.atan2(p[2], p[0]) * 3 + p[1] * 0.9) * 0.4;
    if (r > flare) return undefined;
    return Math.floor(p[1]) % 2 ? 'gold' : 'goldDeep';
  });

  // jagged, flame-like blade
  b.use('spearHead');
  const width = (y) => {
    const t = (y - 92) / 27;
    if (t < 0 || t > 1) return 0;
    let w = 4.4 * Math.sin(Math.PI * Math.min(1, t * 1.6) * 0.5) * (1 - t) ** 0.6 + 0.7 * (1 - t);
    if (Math.abs(y - 103) < 1.6) w -= 1.4 * (1 - Math.abs(y - 103) / 1.6); // notches
    if (Math.abs(y - 97.5) < 1.2) w -= 0.9 * (1 - Math.abs(y - 97.5) / 1.2);
    return Math.max(0, w);
  };
  b.fill([-6, 92, -1.5], [6, 120, 1.5], (p) => {
    const w = width(p[1]);
    const ax = Math.abs(p[0]);
    if (ax > w) return undefined;
    if (ax > w - 1.4 && p[2] > 0) return undefined; // thin edges
    if (ax < 0.6) return 'goldHot';
    if (ax > w - 1) return 'goldLight';
    return noise3(p[0] * 0.5, p[1] * 0.5, 1) > 0.62 ? 'goldDeep' : 'gold';
  });

  // lightning: branching tendrils crackling off the shaft
  b.use('lightning');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bolt = (start, dir, steps, depth) => {
    let p = start;
    const pts = [p];
    for (let i = 0; i < steps; i++) {
      p = [p[0] + dir[0] * 2.2 + (rnd() - 0.5) * 2.6, p[1] + dir[1] * 2.2 + (rnd() - 0.5) * 1.6, p[2] + dir[2] * 2.2 + (rnd() - 0.5) * 2.6];
      pts.push(p);
      if (depth < 2 && rnd() < 0.22) bolt(p, [dir[0] + (rnd() - 0.5), dir[1] - 0.3, dir[2] + (rnd() - 0.5)], 3 + Math.floor(rnd() * 3), depth + 1);
    }
    b.polyline(pts, 0.42, (q, t) => (t < 0.35 && depth === 0 ? 'boltHot' : 'bolt'));
  };
  for (let i = 0; i < 9; i++) {
    const y = 40 + rnd() * 55;
    const a = rnd() * Math.PI * 2;
    const start = [Math.cos(a) * 1.3, y, Math.sin(a) * 1.3];
    bolt(start, [Math.cos(a) * 0.9, -0.55 - rnd() * 0.4, Math.sin(a) * 0.9], 4 + Math.floor(rnd() * 5), 0);
  }
  // sparks
  for (let i = 0; i < 26; i++) {
    const y = 30 + rnd() * 80;
    const a = rnd() * Math.PI * 2;
    const r = 3 + rnd() * 8;
    b.set(Math.floor(Math.cos(a) * r), Math.floor(y), Math.floor(Math.sin(a) * r), rnd() > 0.5 ? 'boltHot' : 'bolt');
  }
  return b.build();
}

export const poses = {
  tpose: {},
  apose: {
    upperArmL: [0, 0, -48],
    upperArmR: [0, 0, 48],
    pauldronL: [0, 0, -20],
    pauldronR: [0, 0, 20],
    forearmL: [0, -10, -6],
    forearmR: [0, 10, 6],
  },
};
