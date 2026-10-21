// Ronin: wandering swordsman in a straw kasa, long black robe over hakama,
// katana + wakizashi through the obi and a sheathed polearm across the back.
// Ink-wash palette to match the reference art. ~82 voxels tall to the hat tip
// (1 voxel ≈ 2.25 cm). Authored in T-pose; other poses rotate bones.

import { VoxelBuilder, hash3 } from '../../tools/voxel/builder.js';

export const palette = {
  skin: '#c9bcaa',
  skinLight: '#ddd2c3',
  skinShade: '#a89a88',
  skinShadow: '#7a6f63',
  mouth: '#6b5f55',
  eye: '#101012',

  hair: '#151518',
  hairHi: '#2b2b31',

  hatA: '#dbd3c1',
  hatB: '#c2b9a5',
  hatBand: '#9a917e',
  hatRim: '#57524a',
  hatUnder: '#857d6b',

  coat: '#1f1f24',
  coatFold: '#141418',
  coatTrim: '#2e2e35',
  collar: '#3a3a42',
  juban: '#e9e5dd',

  obi: '#4b4b54',
  obiLine: '#62626c',
  obiKnot: '#3d3d45',

  hakama: '#2b2b31',
  hakamaFold: '#1c1c21',
  hakamaHem: '#17171b',

  wrap: '#d7d3c9',
  wrapShade: '#b2ada2',
  sandal: '#7b7363',
  strap: '#212126',

  lacquer: '#0f0f12',
  lacquerHi: '#1c1c21',
  ring: '#56565e',
  metal: '#6e6e77',
  iron: '#3e3e45',
  steel: '#cbd0d6',
  wrapDark: '#1d1d22',
  wrapLight: '#d5d1c7',
  cord: '#2b2b30',
  tassel: '#19191c',
  scarf: '#34343b',
};

const SHOULDER_Y = 55.5;
const superellipse = (a, b, n = 4) => Math.abs(a) ** n + Math.abs(b) ** n;

export function buildRonin() {
  const b = new VoxelBuilder(palette);

  // ---- skeleton -----------------------------------------------------------
  b.bone('pelvis', null, [0, 38, 0]);
  b.bone('torso', 'pelvis', [0, 41, 0]);
  b.bone('head', 'torso', [0, 61, 0.3]);
  b.bone('hair', 'head', [0, 66, -5]);
  b.bone('hat', 'head', [0, 70, 0]);
  b.bone('scarf', 'torso', [2, 59.5, -5.5]);
  b.bone('polearm', 'torso', [0, 56, -9.8]);
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    b.bone(`upperArm${side}`, 'torso', [11.2 * s, SHOULDER_Y, 0]);
    b.bone(`forearm${side}`, `upperArm${side}`, [22.5 * s, SHOULDER_Y, 0]);
    b.bone(`hand${side}`, `forearm${side}`, [31.5 * s, SHOULDER_Y, 0]);
    b.bone(`thigh${side}`, 'pelvis', [4.5 * s, 38, 0]);
    b.bone(`shin${side}`, `thigh${side}`, [4.8 * s, 20, 0]);
  }
  b.bone('katana', 'pelvis', [10.2, 41.6, 6.5]);
  b.bone('wakizashi', 'pelvis', [7.8, 43.6, 6.0]);

  // ---- legs: hakama, shin wraps, waraji -----------------------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const legBone = (p) => (p[1] >= 20 ? `thigh${side}` : `shin${side}`);
    const lo = s > 0 ? 0 : -13;
    const hi = s > 0 ? 13 : 0;

    b.fill([lo, 6, -9], [hi, 38.5, 9], (p) => {
      const ax = Math.abs(p[0]);
      const t = Math.min(1, Math.max(0, (p[1] - 6) / 32));
      const hw = 4.6 + 1.9 * (1 - t) ** 1.2;
      const cx = 4.5 + 0.6 * (1 - t);
      const hd = 5.4 + 1.6 * (1 - t);
      const inner = p[1] < 20 ? 0.5 + (20 - p[1]) * 0.06 : 0;
      if (ax < inner) return undefined;
      const u = (ax - cx) / hw;
      const w = p[2] / hd;
      if (superellipse(u, w) > 1) return undefined;
      if (p[1] < 7) return 'hakamaHem';
      const pleat = Math.abs(w) > Math.abs(u) ? Math.floor(ax) % 3 === 1 : Math.floor(p[2] + 20) % 3 === 0;
      return pleat ? 'hakamaFold' : 'hakama';
    }, { bone: legBone });

    b.use(`shin${side}`);
    // kyahan shin wraps peeking out under the hakama
    b.fill([lo, 3, -4], [hi, 6.5, 4], (p) => {
      if (Math.abs(Math.abs(p[0]) - 4.5) > 2.3 || Math.abs(p[2] - 0.3) > 2.3) return undefined;
      return Math.floor(p[1]) % 2 ? 'wrap' : 'wrapShade';
    });
    // foot
    b.fill([lo, 1, -3], [hi, 3, 5], (p) => {
      if (Math.abs(Math.abs(p[0]) - 4.5) > 2.1) return undefined;
      if (p[2] > 4.2 && p[1] > 2) return undefined;
      if (p[2] > 1.5 && p[2] < 2.6) return 'strap';
      return p[2] > 3.5 ? 'skinShade' : 'skin';
    });
    // sandal sole + toe thong
    b.box([s > 0 ? 1.9 : -7.1, 0, -3.2], [s > 0 ? 7.1 : -1.9, 1, 5.2], 'sandal');
    b.box([s > 0 ? 3.0 : -5.0, 1, 2.0], [s > 0 ? 5.0 : -3.0, 3, 4.8], (p) => (Math.abs(Math.abs(p[0]) - 3.5) < 0.6 ? 'strap' : undefined));
  }

  // ---- pelvis: robe skirt, obi -------------------------------------------
  b.use('pelvis');
  b.fill([-14, 21, -10], [14, 41, 10], (p, v) => {
    const s = 41 - p[1];
    const X = 10.6 + s * 0.09;
    const Z = 7.0 + s * 0.06;
    if (superellipse(p[0] / X, p[2] / Z) > 1) return undefined;
    if (superellipse(p[0] / (X - 1.4), p[2] / (Z - 1.4)) <= 1) return undefined;
    const gap = 1.0 + s * 0.22;
    if (p[2] > 0 && Math.abs(p[0]) < gap) return undefined;
    if (p[1] < 22 + 2.4 * hash3(v[0], 7, v[2])) return undefined; // ragged hem
    if (p[2] > 0 && Math.abs(p[0]) < gap + 1.1) return 'coatTrim';
    const a = Math.floor((Math.atan2(p[2], p[0]) + Math.PI) * 4.2);
    return a % 3 === 0 ? 'coatFold' : 'coat';
  });

  b.fill([-12, 36, -8.5], [12, 41.4, 8.5], (p) => {
    if (superellipse(p[0] / 11.3, p[2] / 7.6) > 1) return undefined;
    return p[1] > 38 && p[1] < 39.2 ? 'obiLine' : 'obi';
  });
  // front knot and hanging ends
  b.box([2.4, 36.5, 7.0], [6.6, 40.5, 8.7], 'obiKnot');
  b.segment([3.8, 37, 8.1], [2.8, 30.5 + hash3(1, 2, 3), 8.7], 0.75, 'obiKnot');
  b.segment([5.4, 37, 8.1], [6.9, 31.8, 8.7], 0.75, 'obiKnot');

  // ---- torso: robe, crossed collar, open chest -----------------------------
  b.use('torso');
  // V opening: apex slightly to the wearer's right, left panel over right.
  const apex = [-0.5, 46];
  const edgeL = (y) => apex[0] + (y - apex[1]) * (5.0 / 12.5);
  const edgeR = (y) => apex[0] - (y - apex[1]) * (4.0 / 12.5);
  b.fill([-13, 41, -8], [13, 58.6, 8], (p, v) => {
    const t = (p[1] - 41) / 17;
    let X = 10.2 + 1.2 * Math.min(1, t * 1.6);
    if (p[1] > 56) X = 11.4 - (p[1] - 56) * 1.6;
    const Z = 6.3 + 0.5 * Math.sin(Math.PI * Math.min(1, t));
    if (superellipse(p[0] / X, p[2] / Z) > 1) return undefined;

    if (p[2] > Z - 1.6) {
      if (p[1] > apex[1]) {
        const l = edgeL(p[1]);
        const r = edgeR(p[1]);
        if (p[0] < l && p[0] > r) {
          if (p[2] > Z - 0.9) return null; // recess the chest one voxel
          const mid = (l + r) / 2;
          return Math.abs(p[0] - mid) < 0.6 && p[1] < 52 ? 'skinShade' : p[1] > 54 ? 'skinLight' : 'skin';
        }
        const dl = p[0] - l;
        const dr = r - p[0];
        const d = p[0] >= l ? dl : dr;
        if (d < 1.2) return 'juban';
        if (d < 2.6) return 'collar';
      } else {
        const seam = apex[0] - (apex[1] - p[1]) * 0.5;
        if (Math.abs(p[0] - seam) < 0.7) return 'coatFold';
      }
    }
    if (p[2] < -2 && Math.floor(p[0] + 30) % 5 === 0 && hash3(v[0], 3, 1) > 0.3) return 'coatFold';
    return 'coat';
  });
  // standing collar behind the neck
  b.box([-4.2, 56.5, -4.8], [4.2, 60.2, -3.0], (p) => (p[2] > -3.6 ? 'juban' : 'collar'));
  // neck
  b.box([-2.4, 57.5, -2.2], [2.4, 61.6, 2.4], (p) => (p[2] > 1.4 && p[1] < 59 ? 'skinShadow' : 'skin'));

  // ---- head & face ---------------------------------------------------------
  b.use('head');
  const headX = (y) => (y < 64 ? 4.6 - (64 - y) * 0.55 : 4.6);
  const headZf = (y) => (y < 63 ? 4.8 - (63 - y) * 0.6 : 4.8);
  b.fill([-5, 61, -5], [5, 70.6, 5], (p) => {
    const X = headX(p[1]);
    const zf = headZf(p[1]);
    const zc = (zf - 4.5) / 2;
    const Z = (zf + 4.5) / 2;
    if (superellipse(p[0] / X, (p[2] - zc) / Z, 3) > 1) return undefined;
    const front = p[2] > zf - 1.2;
    const ax = Math.abs(p[0]);
    if (front) {
      if (p[1] > 65 && p[1] < 66 && ax > 1 && ax < 3.2) return 'eye';
      if (p[1] > 67 && p[1] < 68 && ax > 0.9 && ax < 3.7) return 'hair'; // brows
      if (p[1] > 62 && p[1] < 62.8 && ax < 1) return 'mouth';
    }
    if (p[2] > 1.5 && p[1] > 67) return 'skinShadow'; // hat shadow over the brow
    if (p[2] > 1.5 && p[1] > 66) return 'skinShade';
    if (p[1] < 62.2 && ax > 2.2) return 'skinShade';
    if (ax > 3.6) return 'skinShade';
    return 'skin';
  });
  b.box([-1, 63.5, 4.8], [1, 65.6, 5.6], 'skinShade'); // nose
  // chin strap of the kasa
  for (const s of [1, -1]) b.segment([4.8 * s, 69.5, 1.4], [2.9 * s, 61.4, 2.8], 0.45, 'strap');

  // ---- hair ----------------------------------------------------------------
  b.use('hair');
  // cap over the skull, leaving the face open
  b.fill([-6.2, 62, -6.2], [6.2, 71.6, 6.2], (p) => {
    const X = headX(p[1]) + 1.1;
    const zf = headZf(p[1]) + 1.1;
    const zc = (zf - 5.6) / 2;
    const Z = (zf + 5.6) / 2;
    if (superellipse(p[0] / X, (p[2] - zc) / Z, 3) > 1) return undefined;
    if (p[2] > 2.4 && p[1] < 69.5) return undefined;
    return 'hair';
  }, { mode: 'under' });
  // ragged fringe under the brim
  b.fill([-4.6, 66.5, 4.4], [4.6, 70.6, 5.8], (p, v) => {
    const L = 1 + Math.floor(hash3(v[0], 11, 5) * 3.2);
    return p[1] > 70.5 - L ? (v[0] % 3 === 0 ? 'hairHi' : 'hair') : undefined;
  });
  // side locks framing the face
  for (const s of [1, -1])
    b.segment([4.9 * s, 69, 0.8], [5.3 * s, 58.6 + hash3(s, 4, 4) * 1.5, 0.4], 0.95, (p) => (Math.floor(p[1]) % 4 === 0 ? 'hairHi' : 'hair'));
  // long hair down the back
  b.fill([-6.5, 45, -9], [6.5, 70, -4], (p, v) => {
    const y = p[1];
    const zb = y > 60 ? -4.5 : Math.max(-6.7, -4.5 - (60 - y) * 0.35);
    if (p[2] > zb || p[2] < zb - 1.5) return undefined;
    const hw = y < 66 ? 5.2 + (66 - y) * 0.04 : 5.2;
    if (Math.abs(p[0]) > hw) return undefined;
    if (y < 46 + hash3(v[0], 9, 9) * 5.5) return undefined;
    return Math.floor(p[0] + 20) % 3 === 0 ? 'hairHi' : 'hair';
  });
  // loose strands caught in the wind
  b.polyline([[-5.2, 66, -1], [-10, 60.5, -4], [-14.5, 57.5, -6]], 0.55, 'hair');
  b.polyline([[-5.2, 64, -2.2], [-8.6, 57, -5], [-10.5, 53.5, -6]], 0.55, 'hair');
  b.polyline([[5.2, 65, -2], [8.2, 59.5, -4.2]], 0.55, 'hair');

  // ---- kasa (conical straw hat) --------------------------------------------
  b.use('hat');
  const R = 14.8;
  const capH = (r) => 70.2 + (R - r) * 0.62;
  b.fill([-R - 1, 68, -R - 1], [R + 1, 81, R + 1], (p) => {
    const r = Math.hypot(p[0], p[2]);
    if (r > R) return undefined;
    const h = capH(r);
    if (p[1] > h + 0.5 || p[1] < h - 1.0) return undefined;
    if (r > 13.7) return 'hatRim';
    if (p[1] < h - 0.4) return 'hatUnder';
    if (r > 6 && r < 6.9) return 'hatBand';
    const k = Math.floor(((Math.atan2(p[2], p[0]) + Math.PI) / (2 * Math.PI)) * 44);
    const ring = Math.floor(r / 2.2);
    return (k + ring) % 2 ? 'hatA' : 'hatB';
  });
  b.fill([-1.4, 79, -1.4], [1.4, 81, 1.4], (p) => (Math.hypot(p[0], p[2]) < 1.3 ? 'hatRim' : undefined));

  // ---- arms: wide kimono sleeves, wrapped forearms -------------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const span = (a, c) => (s > 0 ? [a, c] : [-c, -a]);

    b.use(`upperArm${side}`);
    const [sx0, sx1] = span(9.0, 26.5);
    b.fill([sx0, 44, -4], [sx1, 59.5, 4], (p, v) => {
      const u = Math.abs(p[0]);
      const vv = p[1] - SHOULDER_Y;
      const tube = superellipse(vv / 3.7, p[2] / 3.5) <= 1;
      let bottom = -3.6 - Math.min(5.6, Math.max(0, (u - 12) * 0.8));
      if (u > 24.8) bottom += (u - 24.8) * 1.8;
      bottom -= hash3(v[0], 5, 2) * 1.1;
      const bag = vv < 0 && vv >= bottom && Math.abs(p[2]) <= 2.4 + Math.min(1, (vv + 3.6) * 0.5);
      if (!tube && !bag) return undefined;
      if (u > 25.6) return 'coatTrim';
      if (vv < -3.5 && Math.floor(u) % 4 === 0) return 'coatFold';
      if (vv > 3 && Math.floor(u) % 6 === 0) return 'coatFold';
      return 'coat';
    }, { mode: 'under' });
    // sleeve mouth: hollow the cuff so the forearm reads as coming out of it
    const [cx0, cx1] = span(25.6, 26.6);
    b.fill([cx0, 52, -2.5], [cx1, 58, 2.5], (p) => (superellipse((p[1] - SHOULDER_Y) / 2.4, p[2] / 2.4, 2) <= 1 ? 'coatFold' : undefined));

    b.use(`forearm${side}`);
    const [fx0, fx1] = span(21.5, 31.5);
    b.fill([fx0, 52, -3], [fx1, 59, 3], (p) => {
      const u = Math.abs(p[0]);
      const r = u > 27 ? 1.95 : 2.15;
      if (superellipse((p[1] - SHOULDER_Y) / r, p[2] / r, 2) > 1) return undefined;
      if (u > 26) return Math.floor(u) % 2 ? 'wrap' : 'wrapShade';
      return 'skin';
    });

    b.use(`hand${side}`);
    const [hx0, hx1] = span(31.5, 35.2);
    b.box([hx0, SHOULDER_Y - 1.2, -2.0], [hx1, SHOULDER_Y + 0.9, 2.0], (p) => (p[1] > SHOULDER_Y + 0.5 && Math.abs(p[0]) > 34 ? 'skinShade' : 'skin'));
    const [gx0, gx1] = span(35.2, 37.6);
    b.box([gx0, SHOULDER_Y - 1.7, -2.0], [gx1, SHOULDER_Y + 0.4, 2.0], (p) => {
      if (Math.abs(p[0]) > 36.6 && p[1] > SHOULDER_Y - 0.5) return undefined; // fingertips curl down
      return Math.floor(p[2] + 10) % 2 ? 'skin' : 'skinShade';
    });
    b.segment([32.6 * s, SHOULDER_Y - 0.5, 2.1], [34.8 * s, SHOULDER_Y - 1.1, 3.0], 0.62, 'skin');
  }

  // ---- scarf tail streaming off the back collar ---------------------------
  b.use('scarf');
  b.polyline(
    [[2, 59.5, -5.5], [7.5, 61, -9.5], [13, 59.2, -12.5], [17, 61.3, -14.5], [20.5, 60.2, -16]],
    (i) => [1.0, 0.95, 0.85, 0.7][i],
    (p, t) => (t > 0.5 && Math.floor(p[0]) % 3 === 0 ? 'coatTrim' : 'scarf'),
  );

  // ---- sheathed polearm across the back -----------------------------------
  b.use('polearm');
  const pa = [-8.5, 43, -9.8];
  const pb = [14.5, 87, -9.8];
  const pl = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  b.segment(pa, pb, 1.05, (p, t, d, v) => {
    if (d < 1.5 || d > pl - 1.6) return 'metal';
    if (d > 28 && d < 37) return Math.floor(d) % 2 ? 'wrapDark' : 'wrapLight';
    if (d > 37 && d < 38.4) return 'metal';
    if (d % 7 < 0.8) return 'ring';
    return hash3(v[0], v[1], v[2]) > 0.85 ? 'lacquerHi' : 'lacquer';
  });
  const tie = [pa[0] + (pb[0] - pa[0]) * (38 / pl), pa[1] + (pb[1] - pa[1]) * (38 / pl), pa[2]];
  const knot = [tie[0] + 0.6, tie[1] - 3.2, tie[2] - 1.4];
  b.segment(tie, knot, 0.5, 'cord');
  b.ellipsoid(knot, [0.95, 0.95, 0.95], 'cord');
  for (const dx of [-0.6, 0, 0.6]) b.segment(knot, [knot[0] + dx, knot[1] - 5.5 - Math.abs(dx), knot[2] - 0.3], 0.45, 'tassel');

  // ---- swords through the obi ----------------------------------------------
  const sword = (bone, kashira, tsuba, end, r, tsubaR) => {
    b.use(bone);
    b.segment(kashira, tsuba, r * 0.92, (p, t, d) => {
      if (d < 1) return 'metal';
      return (Math.floor(d * 1.25) + Math.floor(p[1] * 1.25)) % 2 ? 'wrapDark' : 'wrapLight';
    });
    const dir = tsuba.map((v, i) => v - kashira[i]);
    b.disc(tsuba, dir, tsubaR, 0.95, 'iron');
    const L = Math.hypot(...end.map((v, i) => v - tsuba[i]));
    b.segment(tsuba, end, r, (p, t, d) => {
      if (d < 0.8) return 'steel'; // habaki
      if (d < 1.9) return 'ring'; // koiguchi
      if (d > 3 && d < 5) return 'cord'; // sageo
      if (d > L - 1.5) return 'metal'; // kojiri
      return 'lacquer';
    });
  };
  sword('katana', [8.0, 45.0, 16.0], [10.2, 41.6, 6.5], [13.2, 33.0, -22.0], 1.05, 2.3);
  sword('wakizashi', [6.0, 46.5, 13.5], [7.8, 43.6, 6.0], [10.0, 38.0, -12.5], 0.88, 1.8);
  b.use('katana').segment([11.0, 40.6, 2.7], [12.4, 35.4, 4.6], 0.45, 'cord'); // sageo tail

  return b.build();
}

// The katana drawn, for fighting: grip at the bottom, blade up +Y with a
// slight curve toward +Z (the cutting edge faces -Z).
export function buildRoninKatana() {
  const b = new VoxelBuilder(palette);
  b.bone('katana', null, [0.5, 6, 0.5]);
  const c = [0.5, 0, 0.5];
  b.segment([c[0], 0.5, c[2]], [c[0], 10, c[2]], 0.95, (p, t, d) => (d < 1 ? 'metal' : (Math.floor(d * 1.25) + Math.floor(p[2] * 1.25)) % 2 ? 'wrapDark' : 'wrapLight'));
  b.disc([c[0], 10.6, c[2]], [0, 1, 0], 2.3, 0.95, 'iron');
  b.fill([-1, 11, -2], [2, 42, 3], (p) => {
    const t = (p[1] - 11) / 31;
    const bend = t * t * 1.6; // sori: the blade curves back as it rises
    const half = 0.75 - Math.max(0, t - 0.9) * 6;
    if (Math.abs(p[0] - c[0]) > 0.6 || half <= 0) return undefined;
    const z = p[2] - c[2] - bend;
    if (z < -half || z > half + 0.4) return undefined;
    if (p[1] < 12.2) return 'steel';
    return z < -half + 0.7 ? 'steel' : 'metal';
  });
  return b.build();
}

// Pose = per-bone Euler rotations in degrees (XYZ order) about the bone pivot.
export const poses = {
  tpose: {},
  apose: {
    upperArmL: [0, 0, -44],
    upperArmR: [0, 0, 44],
    forearmL: [0, -8, -6],
    forearmR: [0, 8, 6],
    handL: [0, 0, -4],
    handR: [0, 0, 4],
  },
};
