// Duelist: blond swordsman with hair tied back and streaming in the wind,
// white shirt and lace jabot under a buckled leather doublet, a steel pauldron
// on the sword arm, green cape thrown over the left shoulder, long split coat
// and tall boots. Rapier sheathed at the left hip; buildDuelistRapier shows it
// drawn. ~76 voxels tall (1 voxel ≈ 2.25 cm).

import { VoxelBuilder, hash3, vec } from '../../tools/voxel/builder.js';

export const palette = {
  skin: '#e9caae',
  skinShade: '#caa588',
  skinShadow: '#a8846b',
  mouth: '#b2776a',
  eye: '#2f3a30',
  hairHi: '#f3d482',
  hair: '#e0b553',
  hairShade: '#b98a36',
  shirt: '#ede9e0',
  shirtShade: '#cdc6b7',
  leatherHi: '#654834',
  leather: '#4a3426',
  leatherDark: '#2e2019',
  coatHi: '#4f3b2d',
  coat: '#3a2a20',
  coatTrim: '#b8aa90',
  greenHi: '#7d9d4e',
  green: '#5d7a3a',
  greenDark: '#3d5226',
  steelHi: '#dcdfe3',
  steel: '#b2b6bd',
  steelDark: '#6d727a',
  glove: '#1f1f23',
  gloveHi: '#36363c',
  boot: '#1d1c1f',
  bootHi: '#323035',
  trouser: '#2b2521',
  brass: '#9c8b58',
};

const SHOULDER_Y = 57.5;
const sel = (a, b, n = 2.4) => Math.abs(a) ** n + Math.abs(b) ** n;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => a.map((k) => k / vec.len(a));

// Rapier laid along u (blade direction) with the quillons along w.
export function rapier(b, origin, u, w, { sheathed = false, bone } = {}) {
  u = norm(u);
  w = norm(w);
  const n = norm(cross(u, w));
  const at = (s, a = 0, h = 0) => origin.map((o, i) => o + u[i] * s + w[i] * a + n[i] * h);
  const opts = bone ? { bone } : {};
  const L = 44;
  if (sheathed) {
    b.segment(at(0.6), at(L), 1.0, (p, t) => (t > 0.95 ? 'steel' : t < 0.05 ? 'steelDark' : 'leatherDark'), opts);
  } else {
    b.segment(at(0), at(3), 0.8, 'steel', opts); // ricasso
    b.segment(at(3), at(L), 0.75, (p, t) => (t < 0.5 ? 'steelHi' : 'steel'), opts);
  }
  // quillons with curled tips
  b.polyline([at(1.4, -5.2), at(0, -4.4), at(0, 4.4), at(-1.4, 5.2)], 0.65, 'steel', opts);
  // knuckle bow and swept bars down to the pommel
  b.polyline([at(0, -4.2), at(-3, -4.8, 1), at(-6.5, -2.6, 1.4), at(-8, 0, 0.4)], 0.65, 'steel', opts);
  b.polyline([at(0, -2.6), at(-2.4, -2.8, 2.2), at(-6.6, -1, 1.2)], 0.6, 'steelDark', opts);
  // side ring around the ricasso
  const ring = [];
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ring.push(at(1.6 + Math.cos(a) * 1.8, 0, Math.sin(a) * 2.1));
  }
  b.polyline(ring, 0.6, 'steel', opts);
  // wire-wrapped grip and pommel
  b.segment(at(-0.8), at(-6.6), 0.8, (p, t) => (Math.floor(t * 9) % 2 ? 'steelDark' : 'leatherDark'), opts);
  b.ellipsoid(at(-7.6), [1.25, 1.25, 1.25], 'steel', opts);
}

export function buildDuelist() {
  const b = new VoxelBuilder(palette);

  // ---- skeleton -----------------------------------------------------------
  b.bone('pelvis', null, [0, 40, 0]);
  b.bone('torso', 'pelvis', [0, 43, 0]);
  b.bone('head', 'torso', [0, 62.5, 0.3]);
  b.bone('hair', 'head', [0, 68, -4]);
  b.bone('cape', 'torso', [5, 59, -4]);
  b.bone('pauldronR', 'torso', [-9.5, 58.5, 0]);
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    b.bone(`upperArm${side}`, 'torso', [9.5 * s, SHOULDER_Y, 0]);
    b.bone(`forearm${side}`, `upperArm${side}`, [21 * s, SHOULDER_Y, 0]);
    b.bone(`hand${side}`, `forearm${side}`, [30 * s, SHOULDER_Y, 0]);
    b.bone(`thigh${side}`, 'pelvis', [3.8 * s, 40, 0]);
    b.bone(`shin${side}`, `thigh${side}`, [3.8 * s, 22, 0.3]);
  }
  b.bone('rapier', 'pelvis', [8.8, 41, 4]);

  // ---- legs: trousers and tall cuffed boots --------------------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const cx = 3.8 * s;
    b.use(`thigh${side}`).fill([cx - 5, 22, -5], [cx + 5, 41, 5], (p) => (sel((p[0] - cx) / 3.4, p[2] / 3.6) <= 1 ? 'trouser' : undefined));
    b.use(`shin${side}`);
    b.fill([cx - 5, 0, -5], [cx + 5, 25.5, 7], (p) => {
      const y = p[1];
      if (y < 3.5) {
        const toe = y < 2 ? 6 : 4.2;
        if (Math.abs(p[0] - cx) > 2.6 || p[2] > toe || p[2] < -3.4) return undefined;
        return y < 0.9 ? 'leatherDark' : 'boot';
      }
      const cuff = y > 21 ? 3.7 + (y - 21) * 0.08 : 3.0 + Math.max(0, 1 - Math.abs(y - 14) / 7) * 0.35;
      const q = sel((p[0] - cx) / cuff, (p[2] - 0.2) / cuff);
      if (q > 1) return undefined;
      if (y > 21 && q < sel((cuff - 1) / cuff, 0)) return undefined; // open cuff
      if (y > 24.5 || Math.abs(y - 21) < 0.5) return 'bootHi';
      return 'boot';
    });
  }

  // ---- pelvis: belts and the long split coat --------------------------------
  b.use('pelvis');
  b.fill([-14, 13, -10], [14, 41, 10], (p, v) => {
    const s = 40.5 - p[1];
    const X = 8.1 + s * 0.16, Z = 5.5 + s * 0.11;
    const a = Math.atan2(p[2], p[0]);
    const wave = 1 + 0.05 * Math.sin(a * 8) * (s / 27);
    const q = sel(p[0] / (X * wave), p[2] / (Z * wave));
    if (q > 1 || q < sel((X * wave - 1.2) / (X * wave), 0)) return undefined;
    const gap = p[1] < 35 ? 0.6 + (35 - p[1]) * 0.28 : 0;
    if (p[2] > 0 && Math.abs(p[0]) < gap) return undefined;
    if (p[1] < 14 + hash3(v[0], 1, v[2]) * 0.8) return undefined;
    if (p[1] < 15 || (p[2] > 0 && Math.abs(p[0]) < gap + 0.9)) return 'coatTrim';
    return Math.sin(a * 8) > 0.6 ? 'coatHi' : 'coat';
  });
  b.fill([-10, 38.6, -7], [10, 42.2, 7], (p) => {
    if (sel(p[0] / 8.6, p[2] / 6.0) > 1) return undefined;
    if (p[2] > 4.5 && Math.abs(p[0] - 0.5) < 1.4) return Math.abs(p[0] - 0.5) < 0.6 ? 'leatherDark' : 'brass';
    return 'leatherDark';
  });
  // sword belt slung to the left hip with a frog
  b.fill([-10, 34, -7], [10, 40, 7], (p) => {
    const y0 = 38.2 - (p[0] + 8) * 0.2;
    if (Math.abs(p[1] - y0) > 0.6) return undefined;
    const q = sel(p[0] / 9.0, p[2] / 6.3);
    return q <= 1 && q > sel(7.6 / 9.0, 0) ? 'leather' : undefined;
  });

  // ---- torso: doublet with buckled straps, shirt and jabot -----------------
  b.use('torso');
  const torsoX = (y) => (y < 54 ? lerp(7.2, 9, clamp01((y - 43) / 11)) : y < 58 ? lerp(9, 9.6, clamp01((y - 54) / 4)) : 9.6 - (y - 58) * 1.9);
  const torsoZ = (y) => lerp(4.6, 5.3, clamp01((y - 43) / 12));
  b.fill([-11, 42, -7], [11, 61, 7], (p) => {
    const X = torsoX(p[1]), Z = torsoZ(p[1]);
    if (sel(p[0] / X, p[2] / Z) > 1) return undefined;
    if (p[2] > 2.2) {
      const open = p[1] > 54.5 && Math.abs(p[0] - 0.3) < (p[1] - 54.5) * 0.55;
      if (open) return 'shirt';
      if ([46, 49.5, 53].some((y) => Math.abs(p[1] - y) < 0.6) && Math.abs(p[0]) < 3.4) return Math.abs(p[0] - 1) < 0.6 ? 'brass' : 'leatherDark';
      if (Math.abs(p[0] - 0.3) < 0.5) return 'leatherDark';
    }
    if (Math.abs(p[0]) > X - 1.6 && p[1] < 56) return 'leatherHi'; // side panels
    return 'leather';
  });
  // jabot: lace cascading from the throat, with a small brooch
  b.fill([-2.2, 52.5, 4.5], [2.6, 60, 7], (p) => {
    const t = (60 - p[1]) / 7.5;
    const half = 1.1 + t * 1.0;
    if (Math.abs(p[0] - 0.3) > half || p[2] > 5.3 + t * 1.1) return undefined;
    return Math.floor(p[1] * 1.4) % 2 ? 'shirt' : 'shirtShade';
  }, { mode: 'over' });
  b.box([-0.4, 58.2, 6.0], [1.0, 59.4, 6.8], 'steel');
  // high collar, open in front
  b.fill([-5, 58, -5], [5, 61.5, 5], (p) => {
    const q = sel(p[0] / 4.1, (p[2] - 0.2) / 4.1, 2);
    if (q > 1 || q < (2.8 / 4.1) ** 2 || (p[2] > 2 && Math.abs(p[0]) < 2)) return undefined;
    return 'leatherDark';
  });
  b.box([-1.8, 58, -1.8], [1.8, 63.5, 2.2], (p) => (p[2] > 1.2 && p[1] < 61 ? 'skinShade' : 'skin'));
  // green drape over the left shoulder
  b.fill([1, 52, -7], [12, 62.2, 7], (p) => {
    const X = torsoX(Math.min(p[1], 58)) + 1.3, Z = torsoZ(p[1]) + 1.3;
    const q = sel(p[0] / X, p[2] / Z);
    if (q > 1 || q < sel((X - 1.4) / X, 0)) return undefined;
    const lower = 60.5 - (p[0] - 1) * 0.5 - (p[2] < 0 ? 4 : 0);
    if (p[1] < lower || p[1] > 62 - Math.max(0, p[0] - 7) * 0.6) return undefined;
    return p[1] < lower + 1 ? 'greenDark' : Math.floor(p[0] + p[1]) % 4 === 0 ? 'greenHi' : 'green';
  }, { mode: 'over' });

  // ---- cape: thrown over the left shoulder, billowing behind ---------------
  b.use('cape');
  b.fill([-12, 16, -18], [24, 62, 1], (p, v) => {
    const y = p[1];
    const t = clamp01((60 - y) / 42);
    const cx = 2 + t * 3; // drifts toward the left side as it falls
    const X = 8.6 + t * 5.5, Z = 6.2 + t * 4.5;
    const zc = -0.5;
    const a = Math.atan2(p[2] - zc, p[0] - cx);
    const wave = 1 + 0.07 * Math.sin(a * 7 + y * 0.08) * t;
    const q = sel((p[0] - cx) / (X * wave), (p[2] - zc) / (Z * wave), 2);
    if (q > 1 || q < sel((X * wave - 2) / (X * wave), 0, 2)) return undefined;
    if (p[2] > zc - 1) return undefined;
    // hangs from the left shoulder; the right side starts lower
    const top = 61 - Math.max(0, 2 - p[0]) * 0.55;
    if (y > top) return undefined;
    if (y < 17 + Math.abs(Math.sin(a * 3)) * 4 + hash3(v[0], 5, v[2]) * 1.5) return undefined;
    return Math.sin(a * 7 + y * 0.08) > 0.55 ? 'greenHi' : 'green';
  });
  const isCape = (x, y, z) => b.voxels.get(`${x},${y},${z}`)?.bone === 'cape';
  for (const v of [...b.voxels.values()].filter((v) => v.bone === 'cape')) {
    const t = clamp01((60 - v.y) / 42);
    const sx = Math.sign(v.x + 0.5 - (2 + t * 3)), sz = Math.sign(v.z + 1);
    if (isCape(v.x + sx, v.y, v.z) && isCape(v.x, v.y, v.z + sz)) v.color = 'greenDark';
  }

  // ---- steel pauldron on the sword (right) shoulder ------------------------
  b.use('pauldronR');
  [
    { c: [-15.2, 54.4, 0], r: [3.4, 2.8, 3.6], cut: 52.4 },
    { c: [-14, 56.6, 0], r: [4.0, 3.2, 4.0], cut: 54.2 },
    { c: [-12.4, 59, 0], r: [4.6, 3.6, 4.5], cut: 56.2 },
  ].forEach((L) =>
    b.ellipsoid(L.c, L.r, (p) => {
      if (p[1] < L.cut) return undefined;
      if (p[1] < L.cut + 0.8) return 'steelHi';
      return Math.abs(p[2]) < 0.6 ? 'steelHi' : p[1] > L.c[1] + 1 ? 'steelHi' : 'steel';
    }),
  );

  // ---- head ----------------------------------------------------------------
  b.use('head');
  b.fill([-5, 62, -5], [5, 72, 6], (p) => {
    const y = p[1];
    const jaw = y < 65 ? 1 - (65 - y) * 0.13 : 1;
    const q = (p[0] / (4.1 * jaw)) ** 2 + ((y - 67) / 5.0) ** 2 + ((p[2] - 0.3) / 4.3) ** 2;
    if (q > 1) return undefined;
    const ax = Math.abs(p[0]);
    if (p[2] > 2.8) {
      if (y > 65.6 && y < 66.6 && ax > 1 && ax < 2) return 'eye';
      if (y > 65.6 && y < 66.6 && ax > 2 && ax < 3) return 'shirt';
      if (y > 67.4 && y < 68.2 && ax > 0.9 && ax < 3.2) return 'hairShade';
      if (y > 63 && y < 63.8 && (ax < 1.2 || (ax < 2 && y > 63.4))) return 'mouth';
    }
    if (ax > 3.2 || (y < 64 && ax > 2.2)) return 'skinShade';
    return 'skin';
  });
  b.box([-1, 64.6, 4.2], [1, 66.6, 5.1], (p) => (p[1] < 65.4 ? 'skinShadow' : 'skinShade')); // nose

  // ---- hair: swept back, tied, streaming to the left -----------------------
  b.use('hair');
  b.fill([-5.4, 63, -5.6], [5.4, 72.6, 5.4], (p) => {
    const q = (p[0] / 4.9) ** 2 + ((p[1] - 67.2) / 5.5) ** 2 + ((p[2] - 0.1) / 5.1) ** 2;
    if (q > 1) return undefined;
    // leave the face open below the hairline
    if (p[2] > 1.6 && p[1] < 69.6 - Math.abs(p[0]) * 0.35) return undefined;
    return Math.floor(p[0] * 1.5 + p[1] * 0.5) % 3 === 0 ? 'hairHi' : Math.floor(p[0] + 20) % 4 === 0 ? 'hairShade' : 'hair';
  }, { mode: 'under' });
  // locks framing the face
  for (const s of [1, -1]) b.polyline([[0.8 * s, 71, 4.2], [3.6 * s, 69, 4.2], [4.6 * s, 65.5, 3], [4.4 * s, 62.5, 2]], 0.7, 'hairHi');
  // tail: tied low at the nape and blown out to the left
  b.box([-1.2, 64.5, -5.6], [1.2, 66, -4.4], 'leatherDark');
  b.polyline([[0, 65, -5], [2, 61, -7], [6, 57.5, -9], [11, 55, -10.2], [16, 53.8, -10.5], [20, 53.5, -10]], (i) => [1.7, 1.5, 1.3, 1.0, 0.7][i], (p) =>
    Math.floor(p[0] + p[1]) % 3 === 0 ? 'hairHi' : 'hair',
  );
  b.polyline([[3, 64, -5.5], [8, 61, -8], [14, 59.5, -9.5], [18.5, 59.5, -9.5]], 0.6, 'hairHi');

  // ---- arms: puffed shirt sleeves, black gauntlets -------------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const span = (a, c) => (s > 0 ? [a, c] : [-c, -a]);
    b.use(`upperArm${side}`);
    b.fill([span(8, 21.5)[0], SHOULDER_Y - 5, -5], [span(8, 21.5)[1], SHOULDER_Y + 5, 5], (p) => {
      const u = Math.abs(p[0]);
      const r = 2.8 + Math.sin(Math.PI * clamp01((u - 9) / 12)) * 1.0;
      const vv = p[1] - SHOULDER_Y;
      if (sel(vv / r, p[2] / r) > 1) return undefined;
      const f = Math.sin(Math.atan2(p[2], vv) * 5 + u * 0.4);
      return f > 0.55 ? 'shirtShade' : 'shirt';
    }, { mode: 'under' });

    b.use(`forearm${side}`);
    b.fill([span(20, 30.2)[0], SHOULDER_Y - 5, -5], [span(20, 30.2)[1], SHOULDER_Y + 5, 5], (p) => {
      const u = Math.abs(p[0]);
      const r = u < 22.6 ? 3.4 : 2.5 + (u - 22.6) * 0.03;
      const vv = p[1] - SHOULDER_Y;
      const q = sel(vv / r, p[2] / r);
      if (q > 1) return undefined;
      if (u < 22.6) return u < 21 ? 'gloveHi' : 'glove'; // flared cuff
      return Math.floor(u) % 3 === 0 ? 'gloveHi' : 'glove';
    });

    b.use(`hand${side}`);
    b.box([span(30, 33.6)[0], SHOULDER_Y - 1, -1.8], [span(30, 33.6)[1], SHOULDER_Y + 1, 1.8], 'glove');
    b.box([span(33.6, 36.4)[0], SHOULDER_Y - 1.3, -1.8], [span(33.6, 36.4)[1], SHOULDER_Y + 0.4, 1.8], (p) => (Math.floor(p[2] + 10) % 2 ? 'gloveHi' : 'glove'));
    b.segment([31 * s, SHOULDER_Y - 0.6, 2.0], [33.2 * s, SHOULDER_Y - 1, 2.8], 0.6, 'gloveHi');
  }

  // ---- sheathed rapier at the left hip --------------------------------------
  rapier(b, [8.8, 41, 4], [0.05, -0.6, -0.8], [0, 0.8, -0.6], { sheathed: true, bone: 'rapier' });

  return b.build();
}

// The rapier drawn, blade up.
export function buildDuelistRapier() {
  const b = new VoxelBuilder(palette);
  // the axis runs through voxel centres so thin parts don't fall between cells
  b.bone('rapier', null, [0.5, 9, 0.5]);
  rapier(b, [0.5, 9, 0.5], [0, 1, 0], [1, 0, 0], { bone: 'rapier' });
  return b.build();
}

export const poses = {
  tpose: {},
  apose: {
    upperArmL: [0, 0, -50],
    upperArmR: [0, 0, 50],
    pauldronR: [0, 0, 22],
    forearmL: [0, -10, -6],
    forearmR: [0, 10, 6],
  },
};
