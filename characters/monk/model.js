// Monk: an old master, bald and weathered, with heavy drooping white brows,
// long white beard and mustache, deep-set eyes, forehead wrinkles and long
// earlobes. Still broad and wiry: right shoulder bare, red robe thrown over the
// left, wide wrapped sash with a hooked dagger, wrapped bracers with red cuffs,
// gold prayer beads. ~78 voxels tall (1 voxel ≈ 2.25 cm).

import { VoxelBuilder, hash3 } from '../../tools/voxel/builder.js';

export const palette = {
  skinLight: '#e2b994',
  skin: '#c99a74',
  skinShade: '#a87b58',
  skinShadow: '#85603f',
  wrinkle: '#946a4a',
  eye: '#1b1512',
  mouth: '#7a4c3a',
  beard: '#efece6',
  beardShade: '#c9c4bb',
  robeHi: '#df6541',
  robe: '#c8452a',
  robeShade: '#9c3220',
  robeDeep: '#73241a',
  pants: '#3a2c28',
  pantsShade: '#2a1f1c',
  sashHi: '#7b523a',
  sash: '#5a3b2a',
  strap: '#3d2f24',
  wrap: '#6e6040',
  wrapShade: '#544a32',
  cuff: '#b23a26',
  boot: '#6b4a36',
  sole: '#d9d0c0',
  gold: '#d7ab3e',
  goldDark: '#a37c27',
  wood: '#4a3022',
  steel: '#a9adb3',
};

const SHOULDER_Y = 57.5;
const sel = (a, b, n = 2.4) => Math.abs(a) ** n + Math.abs(b) ** n;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

const robeFold = (f) => (f > 0.7 ? 'robeHi' : f < -0.75 ? 'robeDeep' : f < -0.3 ? 'robeShade' : 'robe');

export function buildMonk() {
  const b = new VoxelBuilder(palette);

  // ---- skeleton -----------------------------------------------------------
  b.bone('pelvis', null, [0, 40, 0]);
  b.bone('torso', 'pelvis', [0, 43, 0]);
  b.bone('beads', 'torso', [0, 61, 0.5]);
  b.bone('head', 'torso', [0, 62.5, 1]);
  b.bone('beard', 'head', [0, 62, 4.5]);
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    b.bone(`upperArm${side}`, 'torso', [10.2 * s, SHOULDER_Y, 0]);
    b.bone(`forearm${side}`, `upperArm${side}`, [21 * s, SHOULDER_Y, 0]);
    b.bone(`hand${side}`, `forearm${side}`, [30.5 * s, SHOULDER_Y, 0]);
    b.bone(`thigh${side}`, 'pelvis', [4.3 * s, 40, 0]);
    b.bone(`shin${side}`, `thigh${side}`, [4.3 * s, 22, 0.3]);
  }
  b.bone('dagger', 'pelvis', [-9.4, 37.5, 2.4]);

  // ---- legs: baggy trousers gathered into wrapped boots --------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const cx = 4.3 * s;
    const leg = (p) => {
      const y = p[1];
      if (y < 6.5) {
        const toe = y < 2.5 ? 5.4 : 3.8;
        if (Math.abs(p[0] - cx) > 2.8 || p[2] > toe || p[2] < -3.4) return undefined;
        if (y < 1.2) return 'sole';
        return Math.floor(y + p[2] * 0.5) % 2 ? 'boot' : 'strap';
      }
      const r = y < 8.5 ? 3.0 : 3.6 + Math.sin(Math.PI * clamp01((y - 8) / 32)) * 0.9;
      if (sel((p[0] - cx) / r, (p[2] - 0.2) / r) > 1) return undefined;
      if (y < 8.5) return 'wrap';
      return Math.sin(Math.atan2(p[2], p[0] - cx) * 4 + y * 0.3) > 0.6 ? 'pantsShade' : 'pants';
    };
    b.use(`thigh${side}`).fill([cx - 6, 22, -6], [cx + 6, 41, 6], leg);
    b.use(`shin${side}`).fill([cx - 6, 0, -6], [cx + 6, 22, 7], leg);
  }

  // ---- pelvis: long red robe with an off-centre split, tattered hem --------
  b.use('pelvis');
  b.fill([-22, 3, -13], [24, 42, 13], (p, v) => {
    const y = p[1];
    const t = (41 - y) / 37;
    const flutter = p[0] > 0 ? t * t * 6 : t * t * 1.5; // the hem streams out to his left
    const X = 9 + t * 7 + flutter, Z = 6.2 + t * 3.5;
    const a = Math.atan2(p[2], p[0]);
    const wave = 1 + 0.06 * Math.sin(a * 9 + y * 0.1) * t;
    const q = sel(p[0] / (X * wave), p[2] / (Z * wave));
    if (q > 1 || q < sel((X * wave - 2.2) / (X * wave), 0)) return undefined;
    // split up the front, a little to his left
    if (p[2] > 0 && y < 33 && p[0] > -1 + t * 1.2 && p[0] < 2.2 + (33 - y) * 0.22) return undefined;
    const hem = 4 + Math.abs(Math.sin(a * 4.5)) * 5 + hash3(v[0], 3, v[2]) * 2.5 + (p[0] < 0 ? 4 : 0);
    if (y < hem) return undefined;
    return robeFold(Math.sin(a * 9 + y * 0.1));
  });

  // wide wrapped sash, a knot with hanging ends, and a thin belt
  b.fill([-11, 37.5, -8], [11, 46.5, 8], (p) => {
    if (sel(p[0] / 9.6, p[2] / 6.6) > 1) return undefined;
    return Math.floor(p[1] * 0.8 + p[0] * 0.45) % 3 === 0 ? 'sashHi' : 'sash';
  });
  b.ellipsoid([-3.5, 41.5, 6.6], [1.8, 1.6, 1.1], 'sashHi');
  b.polyline([[-3.2, 40.5, 6.8], [-3.8, 35.5, 7.2], [-3.1, 30.5, 7.6]], 0.75, 'sash');
  b.polyline([[-4.4, 40.5, 6.8], [-5.6, 36, 7.3], [-6.2, 32.5, 7.6]], 0.65, 'sashHi');
  b.fill([-11, 35, -8], [11, 42, 8], (p) => {
    const y0 = 37.4 + (p[0] + 9) * 0.17;
    if (Math.abs(p[1] - y0) > 0.55) return undefined;
    const q = sel(p[0] / 10.1, p[2] / 7.0);
    return q <= 1 && q > sel(9.0 / 10.1, 0) ? 'strap' : undefined;
  });

  // hooked dagger on the right hip
  b.use('dagger');
  b.polyline([[-9.4, 37.5, 2.4], [-10.0, 32, 3.6], [-10.6, 27.5, 5.0]], 1.0, (p, t) => (p[1] < 28.8 ? 'steel' : 'sashHi'));
  b.segment([-9.4, 38, 2.4], [-8.8, 43.2, 1.8], 0.7, (p) => (p[1] > 42.4 ? 'steel' : 'wood'));
  b.polyline([[-9.4, 37.9, 2.4], [-11.6, 38.5, 2.9], [-12.3, 36.6, 3.1]], 0.55, 'steel');

  // ---- torso: bare right side, robe over the left shoulder -----------------
  b.use('torso');
  const torsoX = (y) => (y < 55 ? lerp(8.6, 10.6, clamp01((y - 43) / 12)) : y < 58.5 ? 10.6 : 10.6 - (y - 58.5) * 2.0);
  const torsoZ = (y) => lerp(5.0, 6.1, clamp01((y - 43) / 12));
  const drapeX = (y) => -9.5 + (y - 43) * 0.62; // robe covers x > drapeX(y)
  b.fill([-12, 42, -8], [12, 61.5, 8], (p) => {
    if (sel(p[0] / torsoX(p[1]), p[2] / torsoZ(p[1])) > 1) return undefined;
    const ax = Math.abs(p[0]);
    if (p[2] > 2.5) {
      if (p[1] > 52 && p[1] < 53 && ax > 1.5 && ax < 8) return 'skinShade'; // under the pecs
      if (p[1] > 53 && p[1] < 57.5 && ax < 0.8) return 'skinShade';
      if (p[1] > 56.5 && ax > 2 && ax < 7) return 'skinLight';
    }
    if (p[2] < 0 && p[1] > 47 && Math.abs(p[0] + 2) < 0.6) return 'skinShade'; // spine
    if (ax > torsoX(p[1]) - 1.2) return 'skinShade';
    return 'skin';
  });
  // the drape itself: one voxel proud of the body, folds running along it
  b.fill([-13, 42, -9], [13, 62.5, 9], (p) => {
    const X = torsoX(p[1]) + 1.1, Z = torsoZ(p[1]) + 1.1;
    const q = sel(p[0] / X, p[2] / Z);
    if (q > 1) return undefined;
    const d = p[0] - drapeX(p[1]);
    if (d < 0) return undefined;
    if (p[1] > 60.6 - Math.max(0, p[0] - 3) * 0.4) return undefined;
    if (d < 1.2) return 'robeHi';
    return robeFold(Math.sin(d * 1.1 + p[1] * 0.15));
  }, { mode: 'over' });
  // layered shoulder flap over the left shoulder
  b.ellipsoid([10.6, 59, 0], [4.6, 2.8, 4.6], (p) => (p[1] < 57 ? undefined : p[1] < 57.8 ? 'robeDeep' : 'robeShade'));
  b.box([-2.3, 58, -2.2], [2.3, 63.6, 2.6], (p) => (p[2] > 1.6 && Math.abs(p[0]) > 0.9 && Math.abs(p[0]) < 1.9 ? 'skinShade' : 'skin'));

  // ---- prayer beads ----------------------------------------------------------
  b.use('beads');
  for (const [drop, radius, step, pendant] of [[8.5, 5.6, 0.32, true], [4.2, 5.0, 0.4, false]]) {
    for (let a = 0; a < Math.PI * 2; a += step / radius) {
      const front = Math.max(0, Math.cos(a));
      const c = [radius * Math.sin(a), 61 - drop * front ** 2, 0.6 + (radius + 0.6) * Math.cos(a) + front * 0.5];
      b.ellipsoid(c, [0.75, 0.75, 0.75], Math.floor(a * 10) % 2 ? 'gold' : 'goldDark', { mode: 'under' });
    }
    if (pendant) b.ellipsoid([0.5, 51, 7.6], [1.3, 1.7, 0.9], (p) => (p[1] < 50.4 ? 'goldDark' : 'gold'));
  }

  // ---- head: aged face ----------------------------------------------------
  b.use('head');
  const zc = 1.0;
  b.fill([-6, 61, -5], [6, 73.5, 7], (p, v) => {
    const y = p[1];
    const jaw = y < 65 ? 1 - (65 - y) * 0.12 : 1;
    const q = (p[0] / (4.4 * jaw)) ** 2 + ((y - 67.4) / 5.4) ** 2 + ((p[2] - zc) / 4.6) ** 2;
    if (q > 1) return undefined;
    const ax = Math.abs(p[0]);
    const front = p[2] > zc + 2.4;
    if (front) {
      if (y > 65.9 && y < 66.9 && ax > 1.1 && ax < 2.9) return ax < 2 ? 'eye' : 'skinShadow'; // deep-set, squinting
      if (y > 66.9 && y < 67.4 && ax > 1 && ax < 3) return 'skinShadow';
      if ((Math.abs(y - 69.6) < 0.4 || Math.abs(y - 70.9) < 0.4) && ax < 2.8) return 'wrinkle'; // forehead
      if (y > 63.4 && y < 65.2 && ax > 2.4) return 'skinShade'; // hollow cheeks
      if (y > 62.2 && y < 62.9 && ax < 0.9) return 'mouth';
    }
    if (y > 71 && p[2] > zc - 1 && p[0] < 2) return 'skinLight'; // scalp sheen
    if (y > 69.5 && hash3(v[0], v[1], v[2]) > 0.94) return 'wrinkle'; // age spots
    if (ax > 3.6) return 'skinShade';
    return 'skin';
  });
  b.box([-1, 63.6, 5.2], [1, 66.6, 6.6], (p) => (p[1] < 64.4 ? 'skinShadow' : p[2] > 6 && p[1] > 65.8 ? 'skinLight' : 'skin')); // nose
  // long-lobed ears
  for (const s of [1, -1])
    b.box([s > 0 ? 4.2 : -5.4, 63.2, 0.2], [s > 0 ? 5.4 : -4.2, 68.6, 1.9], (p) => (p[1] < 64.2 && p[2] > 1.2 ? undefined : Math.abs(p[0]) < 4.8 ? 'skinShadow' : 'skinShade'));
  // heavy brows sweeping down and out past the face
  for (const s of [1, -1]) {
    b.polyline([[0.9 * s, 67.9, 5.4], [2.6 * s, 67.8, 5.2], [4.0 * s, 67.0, 4.4], [5.4 * s, 65.8, 3.8]], 0.6, (p, t) => (t > 0.6 ? 'beardShade' : 'beard'));
    b.segment([1.6 * s, 68.4, 5.2], [3.4 * s, 68.2, 5.0], 0.5, 'beard');
  }

  // ---- beard and mustache -----------------------------------------------------
  b.use('beard');
  b.fill([-5, 49, 1], [5, 64.5, 9.5], (p, v) => {
    const y = p[1];
    const ax = Math.abs(p[0]);
    if (y > 61.5) {
      // along the jaw, framing the mouth
      if (ax < 1.3 && y > 62) return undefined;
      if (ax > 4.2 - (64.5 - y) * 0.2 || p[2] < 2.4 || p[2] > 6.0) return undefined;
      return Math.floor(p[0] + 10) % 2 ? 'beard' : 'beardShade';
    }
    const t = (61.5 - y) / 11.5;
    const hw = 4.1 * (1 - t) ** 0.8 + 0.4;
    const cz = 5.0 + t * 2.8;
    if (ax > hw || Math.abs(p[2] - cz) > 1.4 - t * 0.4) return undefined;
    if (y < 50 + hash3(v[0], 2, 2) * 2.2) return undefined;
    return Math.floor(p[0] * 1.3 + 20) % 3 === 0 ? 'beardShade' : 'beard';
  });
  for (const s of [1, -1])
    b.polyline([[0.6 * s, 63.4, 6.4], [2.2 * s, 62.6, 6.4], [2.9 * s, 60.4, 6.0], [3.0 * s, 57.6, 5.8]], (i) => [0.75, 0.7, 0.55][i], (p, t) => (t > 0.6 ? 'beardShade' : 'beard'));

  // ---- arms ----------------------------------------------------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const span = (a, c) => (s > 0 ? [a, c] : [-c, -a]);
    b.use(`upperArm${side}`);
    b.fill([span(8, 21.2)[0], SHOULDER_Y - 6, -6], [span(8, 21.2)[1], SHOULDER_Y + 6, 6], (p, v) => {
      const u = Math.abs(p[0]);
      const vv = p[1] - SHOULDER_Y;
      const delt = Math.max(0, 1 - Math.abs(u - 11.5) / 3.5) * 0.7;
      const bicep = Math.max(0, 1 - Math.abs(u - 16.5) / 3.5) * 0.4;
      const r = 3.2 + delt + bicep;
      if (s > 0) {
        // short, ragged robe sleeve on the left arm
        const R = 4.1 + delt * 0.5;
        if (u < 18.5 + hash3(v[1], v[2], 7) * 1.5 && sel(vv / R, p[2] / R) <= 1) return robeFold(Math.sin(Math.atan2(p[2], vv) * 4 + u * 0.3));
      }
      if (sel(vv / r, p[2] / r) > 1) return undefined;
      if (vv < -1.5 && p[2] > 0 && u > 14) return 'skinShade';
      return vv > 1.5 ? 'skinLight' : 'skin';
    }, { mode: 'under' });

    b.use(`forearm${side}`);
    b.fill([span(20.4, 30.8)[0], SHOULDER_Y - 5, -5], [span(20.4, 30.8)[1], SHOULDER_Y + 5, 5], (p) => {
      const u = Math.abs(p[0]);
      const vv = p[1] - SHOULDER_Y;
      const r = u < 22.6 ? 3.5 : 3.3 - (u - 22.6) * 0.07;
      if (sel(vv / r, p[2] / r) > 1) return undefined;
      if (u < 22.6) return u < 21.4 ? 'robeDeep' : 'cuff';
      const a = Math.atan2(p[2], vv);
      if (Math.floor(u * 0.9 + a * 1.3) % 4 === 0 || Math.floor(u * 0.9 - a * 1.3) % 4 === 0) return 'strap';
      return Math.floor(u) % 2 ? 'wrap' : 'wrapShade';
    });

    b.use(`hand${side}`);
    b.box([span(30.5, 34.4)[0], SHOULDER_Y - 1.3, -2], [span(30.5, 34.4)[1], SHOULDER_Y + 1.3, 2], (p) => (Math.floor(Math.abs(p[0])) % 2 ? 'wrapShade' : 'wrap'));
    b.box([span(34.4, 37.2)[0], SHOULDER_Y - 1.7, -2], [span(34.4, 37.2)[1], SHOULDER_Y + 0.7, 2], (p) => (Math.floor(p[2] + 10) % 2 ? 'skin' : 'skinShade'));
    b.segment([31.6 * s, SHOULDER_Y - 0.6, 2.2], [34 * s, SHOULDER_Y - 1.1, 3.0], 0.7, 'skin');
  }

  return b.build();
}

export const poses = {
  tpose: {},
  apose: {
    upperArmL: [0, 0, -52],
    upperArmR: [0, 0, 52],
    forearmL: [0, -10, -6],
    forearmR: [0, 10, 6],
  },
};
