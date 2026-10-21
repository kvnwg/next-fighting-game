// Wraith: tall, faceless reaper in pale layered robes that dissolve into mist,
// hair in a topknot with a red pin, long trailing sleeves and red ribbons.
// Wields an inverted scythe (buildWraithScythe): thin steel staff, gnarled
// metal at the foot and a long red crescent blade sweeping along the ground.
// Floats with the hem ~8 voxels off the ground (1 voxel ≈ 2.25 cm).

import { VoxelBuilder, hash3, noise3 } from '../../tools/voxel/builder.js';

export const palette = {
  robeLight: '#efeee9',
  robe: '#dcd9d2',
  robeShade: '#c2beb6',
  robeDeep: '#a29e96',
  mist: '#e2e0db',
  mask: '#d3d0ca',
  maskShade: '#b3afa8',
  hair: '#4b4b50',
  hairHi: '#66666c',
  steelLight: '#b9bbbf',
  steel: '#8e9095',
  steelDark: '#5e6066',
  red: '#c42739',
  redDark: '#8c1a28',
  redLight: '#e34a5c',
};

const SHOULDER_Y = 75;
const sel = (a, b, n = 2.4) => Math.abs(a) ** n + Math.abs(b) ** n;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// Fold shading driven by the angle around the body and a slow vertical sway.
function folds(p, k = 7) {
  const a = Math.atan2(p[2], p[0]);
  const f = Math.sin(a * k + Math.sin(p[1] * 0.12) * 1.4);
  return f > 0.75 ? 'robeLight' : f < -0.85 ? 'robeDeep' : f < -0.5 ? 'robeShade' : 'robe';
}

export function buildWraith() {
  const b = new VoxelBuilder(palette);

  // ---- skeleton -----------------------------------------------------------
  b.bone('pelvis', null, [0, 52, 0]);
  b.bone('robeLower', 'pelvis', [0, 30, 0]);
  b.bone('mist', 'robeLower', [0, 10, 0], { opacity: 0.45 });
  b.bone('ribbons', 'pelvis', [0, 55, 5.5]);
  b.bone('torso', 'pelvis', [0, 56, 0]);
  b.bone('head', 'torso', [0, 82, 0.5]);
  b.bone('hair', 'head', [0, 92, -1]);
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    b.bone(`upperArm${side}`, 'torso', [9.5 * s, SHOULDER_Y, 0]);
    b.bone(`forearm${side}`, `upperArm${side}`, [21.5 * s, SHOULDER_Y, 0]);
    b.bone(`hand${side}`, `forearm${side}`, [33.5 * s, SHOULDER_Y, 0]);
  }

  // ---- robe skirt: flared, folded, open over an inner panel ----------------
  const skirtX = (y) => 6.8 + (56 - y) * 0.17;
  const skirtZ = (y) => 4.8 + (56 - y) * 0.12;
  const skirt = (p, v) => {
    const a = Math.atan2(p[2], p[0]);
    const wave = 1 + 0.055 * Math.sin(a * 13 + p[1] * 0.08);
    if (sel(p[0] / (skirtX(p[1]) * wave), p[2] / (skirtZ(p[1]) * wave)) > 1) return undefined;
    if (p[1] < 9 + hash3(v[0], 2, v[2]) * 3.5) return undefined; // ragged hem
    const panel = 2.2 + (56 - p[1]) * 0.05;
    if (p[2] > 0 && Math.abs(p[0]) < panel) {
      if (sel(p[0] / (skirtX(p[1]) * wave - 1), p[2] / (skirtZ(p[1]) * wave - 1)) > 1) return null; // recessed
      return Math.abs(p[0]) > panel - 0.9 ? 'robeShade' : 'robeLight';
    }
    return folds(p);
  };
  b.use('pelvis').fill([-15, 30, -12], [15, 56, 12], skirt);
  b.use('robeLower').fill([-18, 8, -14], [18, 30, 14], skirt);

  // mist: translucent tendrils curling off the hem toward the ground
  b.use('mist');
  for (let i = 0; i < 26; i++) {
    const a0 = (i / 26) * Math.PI * 2 + hash3(i, 5, 5) * 0.3;
    const curl = (hash3(i, 6, 6) - 0.5) * 1.2;
    const len = 0.6 + hash3(i, 7, 7) * 0.6;
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const a = a0 + curl * t;
      const rr = 1.0 + t * 0.35 * len;
      pts.push([Math.cos(a) * skirtX(10) * rr, 11 - t * 10 * len, Math.sin(a) * skirtZ(10) * rr]);
    }
    b.polyline(pts, (k) => 1.3 - k * 0.22, (p) => (hash3(...p.map(Math.floor)) > 0.7 ? 'robeLight' : 'mist'));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    b.ellipsoid([Math.cos(a) * 13, 1.6, Math.sin(a) * 9], [3.2, 1.6, 2.6], 'mist', { mode: 'under' });
  }

  // sash with an ornate clasp, and long red streamers
  b.use('pelvis');
  b.fill([-9, 53.5, -7], [9, 57, 7], (p) => (sel(p[0] / 7.6, p[2] / 5.6) <= 1 ? (Math.floor(p[1]) === 55 ? 'steel' : 'steelDark') : undefined));
  b.box([-2, 52.5, 5], [2, 58, 6.6], (p) => (Math.abs(p[0]) < 1 && Math.abs(p[1] - 55.2) < 1.2 ? 'red' : 'steel'));
  b.use('ribbons');
  for (const [x0, end, c] of [[-3.5, 24, 'red'], [-1.5, 19, 'redDark'], [2.5, 27, 'red'], [4.2, 31, 'redDark']]) {
    const pts = [];
    for (let y = 54; y >= end; y -= 3) pts.push([x0 + Math.sin(y * 0.28 + x0) * 0.9, y, 5.6 + (54 - y) * 0.11]);
    b.polyline(pts, 0.5, c);
  }

  // ---- torso: slim, crossed collar with embroidered bands ------------------
  b.use('torso');
  const torsoX = (y) => (y < 70 ? lerp(6.6, 8.6, clamp01((y - 56) / 14)) : y < 75.5 ? lerp(8.6, 9.8, clamp01((y - 70) / 5)) : lerp(9.8, 4, clamp01((y - 75.5) / 3.5)));
  const torsoZ = (y) => (y < 70 ? lerp(4.4, 5.2, clamp01((y - 56) / 14)) : lerp(5.2, 4, clamp01((y - 70) / 9)));
  const apex = [0.5, 63.5];
  const edgeL = (y) => apex[0] + (y - apex[1]) * (3.6 / 15);
  const edgeR = (y) => apex[0] - (y - apex[1]) * (4.4 / 15);
  b.fill([-11, 55, -7], [11, 79, 7], (p) => {
    const X = torsoX(p[1]), Z = torsoZ(p[1]);
    if (sel(p[0] / X, p[2] / Z) > 1) return undefined;
    if (p[2] > Z - 1.4 && p[1] > apex[1]) {
      const l = edgeL(p[1]), r = edgeR(p[1]);
      if (p[0] < l && p[0] > r) return 'robeLight';
      const d = p[0] >= l ? p[0] - l : r - p[0];
      if (d < 1.6) return Math.floor(p[1]) % 2 ? 'steelDark' : 'steel';
    }
    // filigree over the chest
    if (p[2] > 1 && p[1] > 64 && p[1] < 74) {
      const f = Math.sin(p[0] * 1.4) * Math.cos(p[1] * 1.1 + p[0] * 0.4);
      if (Math.abs(f) < 0.12) return 'robeDeep';
    }
    return folds(p, 5);
  });
  // high collar and slender neck
  b.fill([-5, 76, -5], [5, 80, 5], (p) => {
    const q = sel(p[0] / 4.2, (p[2] - 0.3) / 4.2, 2);
    if (q > 1 || q < (2.6 / 4.2) ** 2) return undefined;
    return 'robe';
  });
  b.box([-1.6, 76, -1.6], [1.6, 84, 2.0], 'mask');

  // ---- head: blank mannequin mask -----------------------------------------
  b.use('head');
  b.fill([-5, 82, -5], [5, 93, 6], (p) => {
    const y = p[1];
    const jaw = y < 86 ? 1 - (86 - y) * 0.12 : 1;
    const q = (p[0] / (3.9 * jaw)) ** 2 + ((y - 87.6) / 5.0) ** 2 + ((p[2] - 0.4) / 4.3) ** 2;
    if (q > 1) return undefined;
    const ax = Math.abs(p[0]);
    if (p[2] > 2.6) {
      if (y > 87 && y < 88.4 && ax > 0.8 && ax < 2.6) return 'maskShade'; // faint sockets
      if (y < 85 && ax > 1.8) return 'maskShade';
    }
    if (ax > 3) return 'maskShade';
    return 'mask';
  });

  // ---- hair: cap, topknot with pin, long tail, red ribbon ------------------
  b.use('hair');
  b.fill([-5.5, 86, -6], [5.5, 94, 5], (p) => {
    const q = (p[0] / 4.9) ** 2 + ((p[1] - 87.8) / 6.0) ** 2 + ((p[2] - 0.1) / 5.2) ** 2;
    if (q > 1) return undefined;
    if (p[2] > 1.2 && p[1] < 91.2) return undefined;
    return Math.floor(p[0] + 10) % 3 === 0 ? 'hairHi' : 'hair';
  }, { mode: 'under' });
  b.ellipsoid([0, 95, -1], [2.7, 2.4, 2.7], (p) => (Math.floor(p[1]) % 2 ? 'hair' : 'hairHi'));
  b.segment([-4.8, 95.6, -0.6], [4.8, 94.6, -1.6], 0.45, (p) => (Math.abs(p[0]) > 3.8 ? 'redLight' : 'red'));
  b.polyline([[0, 93.5, -3], [0.4, 87, -5.2], [1.3, 78, -6.4], [2.6, 68, -6.8], [3.6, 61, -6.2]], (i) => [1.1, 1.0, 0.8, 0.6][i], 'hair');
  b.polyline([[1.5, 94, -2.6], [4.2, 90, -5], [7.2, 84, -6], [8.8, 77, -5.2], [9.6, 71, -4.2]], 0.5, (p, t) => (t > 0.6 ? 'redDark' : 'red'));

  // ---- arms: thin, swallowed by long trailing sleeves ----------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const span = (a, c) => (s > 0 ? [a, c] : [-c, -a]);

    b.use(`upperArm${side}`);
    const [ux0, ux1] = span(7, 22);
    b.fill([ux0, SHOULDER_Y - 5, -5], [ux1, SHOULDER_Y + 5, 5], (p) => {
      const u = Math.abs(p[0]);
      const r = 3.2 + (u - 7) * 0.04;
      return sel((p[1] - SHOULDER_Y) / r, p[2] / r, 2.6) <= 1 ? folds([p[1] - SHOULDER_Y, p[0], p[2]], 4) : undefined;
    }, { mode: 'under' });

    b.use(`forearm${side}`);
    const [fx0, fx1] = span(21, 34);
    b.fill([fx0, SHOULDER_Y - 26, -6], [fx1, SHOULDER_Y + 6, 6], (p, v) => {
      const u = Math.abs(p[0]);
      const vv = p[1] - SHOULDER_Y;
      const r = 3.6 + (u - 21) * 0.12;
      const tube = sel(vv / r, p[2] / r, 2.6) <= 1;
      // the drape hangs from the sleeve and frays into long tapered points
      const bottom = -4 - (u - 21) * 1.2 - hash3(v[0], 3, 3) * 4 - (u > 31 ? 4 : 0);
      const drape = vv < 0 && vv > bottom && Math.abs(p[2]) < 2.2 - (vv < -14 ? 0.8 : 0);
      if (!tube && !drape) return undefined;
      if (u > 33) return tube && sel(vv / (r - 1.3), p[2] / (r - 1.3), 2.6) <= 1 ? 'robeDeep' : 'robeShade';
      if (vv < bottom + 2.5 && vv < -6) return 'robeLight';
      const crease = Math.sin(u * 1.3 + vv * 0.15);
      return crease > 0.8 ? 'robeLight' : crease < -0.7 ? 'robeShade' : 'robe';
    });
    b.fill([span(32.2, 33.4)[0], SHOULDER_Y - 3.2, -3.2], [span(32.2, 33.4)[1], SHOULDER_Y + 3.2, 3.2], (p) =>
      sel((p[1] - SHOULDER_Y) / 2.6, p[2] / 2.6, 2) <= 1 ? 'red' : undefined,
    );
    b.polyline([[33 * s, SHOULDER_Y - 2.4, 2], [33.8 * s, SHOULDER_Y - 9, 2.6], [33.2 * s, SHOULDER_Y - 16, 3]], 0.5, 'red');

    b.use(`hand${side}`);
    b.box([span(33.5, 37)[0], SHOULDER_Y - 1, -1.5], [span(33.5, 37)[1], SHOULDER_Y + 1, 1.5], 'mask');
    for (const [z, L] of [[-1, 4], [0, 5], [1, 4.4]])
      b.box([span(37, 37 + L)[0], SHOULDER_Y - 1, z - 0.5], [span(37, 37 + L)[1], SHOULDER_Y, z + 0.5], (p) =>
        Math.abs(p[0]) > 36 + L ? 'red' : 'maskShade',
      );
    b.box([span(34, 36.5)[0], SHOULDER_Y - 1, 1.5], [span(34, 36.5)[1], SHOULDER_Y, 2.5], 'maskShade'); // thumb
  }

  return b.build();
}

// The inverted scythe: finial up, blade sweeping along the ground to -X.
export function buildWraithScythe() {
  const b = new VoxelBuilder(palette);
  b.bone('scythe', null, [0, 60, 0]);

  // staff
  b.segment([0, 26, 0], [0, 118, 0], 0.95, (p, t, d) => (Math.floor(d) % 12 === 0 ? 'steelDark' : p[0] < 0 ? 'steelLight' : 'steel'));
  // red finial: a flame-like hook over a collar, with a small tassel
  b.disc([0, 117.6, 0], [0, 1, 0], 1.9, 1.2, 'steelDark');
  b.polyline([[0, 118, 0], [0.6, 121.5, 0], [2.6, 124.5, 0], [1.8, 127.6, 0], [-0.8, 127, 0]], (i) => [1.1, 1.0, 0.9, 0.7][i], (p, t) => (t > 0.7 ? 'redLight' : 'red'));
  b.segment([0, 119, 0], [-2.2, 123, 0], 0.7, 'redDark');
  b.segment([1, 119, 0.8], [1.6, 112.5, 1.2], 0.45, 'red');

  // gnarled metal around the foot of the staff, inlaid with red
  b.fill([-5, 2, -5], [5, 34, 5], (p) => {
    const r = Math.hypot(p[0], p[2]);
    const taper = p[1] > 26 ? (34 - p[1]) / 8 : 1;
    const n = noise3(p[0] * 0.5, p[1] * 0.25, p[2] * 0.5);
    if (r > (1.2 + n * 2.4) * taper + 0.6) return undefined;
    const m = noise3(p[0] * 0.7 + 9, p[1] * 0.4, p[2] * 0.7);
    if (m > 0.7) return 'red';
    return n > 0.62 ? 'steelLight' : n < 0.38 ? 'steelDark' : 'steel';
  });
  // vine-like wraps spiralling up the foot
  const vine = [];
  for (let y = 3; y <= 30; y += 1.5) vine.push([Math.cos(y * 0.45) * 2.6, y, Math.sin(y * 0.45) * 2.6]);
  b.polyline(vine, 0.65, (p) => (hash3(Math.floor(p[1]), 1, 1) > 0.8 ? 'red' : 'steelDark'));

  // crescent blade: broad at the heel, curving down to a long fine point
  b.fill([-70, 0, -1.5], [3, 24, 1.5], (p) => {
    const t = -p[0] / 66;
    if (t < -0.04 || t > 1) return undefined;
    const tt = clamp01(t);
    const spine = 21 - 18.5 * tt ** 0.7;
    const w = 12.5 * (1 - tt) ** 0.9 * Math.min(1, (tt + 0.05) * 6);
    if (p[1] > spine || p[1] < spine - w) return undefined;
    const fromSpine = spine - p[1];
    if (fromSpine > 2.5 && p[2] > 0) return undefined; // thinner toward the edge
    if (fromSpine < 1.2) return 'redDark';
    if (p[1] < spine - w + 1.2) return 'redLight';
    return noise3(p[0] * 0.18, p[1] * 0.5, 3) > 0.66 ? 'redDark' : 'red';
  });
  // ink-like red splashes about the junction
  for (let i = 0; i < 7; i++) {
    const c = [-2 - hash3(i, 1, 0) * 14, 8 + hash3(i, 2, 0) * 14, (hash3(i, 3, 0) - 0.5) * 5];
    const r = 0.7 + hash3(i, 4, 0) * 1.1;
    b.ellipsoid(c, [r * 1.4, r, r], 'red', { mode: 'under' });
  }
  return b.build();
}

export const poses = {
  tpose: {},
  apose: {
    upperArmL: [0, 0, -46],
    upperArmR: [0, 0, 46],
    forearmL: [0, -10, -6],
    forearmR: [0, 10, 6],
  },
};
