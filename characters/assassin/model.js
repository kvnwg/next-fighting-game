// Assassin: lean killer in a peaked teal hood (dark void, glowing red eyes),
// tattered teal cowl and long shredded cloak, woven dark leather, bandaged
// forearms. Two daggers ride sheathed at the right thigh and the small of the
// back; buildAssassinDaggers shows them drawn. ~77 voxels to the hood peak.

import { VoxelBuilder, hash3, noise3, vec } from '../../tools/voxel/builder.js';

export const palette = {
  tealHi: '#438a93',
  teal: '#2f6c74',
  tealDeep: '#215056',
  tealDark: '#17363b',
  cloth: '#26272c',
  leather: '#23242a',
  leatherHi: '#33353c',
  strap: '#4b3a2c',
  strapHi: '#624c39',
  wrap: '#9b9782',
  wrapShade: '#78755f',
  buckle: '#8c9097',
  void: '#060607',
  eye: '#ff3b3b',
  eyeHot: '#ff8a70',
  steel: '#aeb2b9',
  steelDark: '#4c4f56',
  blade: '#3b3e45',
  bladeEdge: '#c3c8cf',
};

const SHOULDER_Y = 55.5;
const sel = (a, b, n = 2.4) => Math.abs(a) ** n + Math.abs(b) ** n;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => a.map((k) => k / vec.len(a));

// Diamond-woven leather.
const weave = (p) => ((Math.floor((p[0] + p[1]) * 0.7) + Math.floor((p[0] - p[1]) * 0.7)) % 2 ? 'leatherHi' : 'leather');
const tealFold = (p, k = 7) => {
  const f = Math.sin(Math.atan2(p[2], p[0]) * k + p[1] * 0.1);
  return f > 0.7 ? 'tealHi' : f < -0.6 ? 'tealDeep' : 'teal';
};

// A dagger laid along `u` (blade direction) with its guard along `w`.
// sheathed: the blade is wrapped in a leather scabbard instead.
export function dagger(b, origin, u, w, { sheathed = false, bone } = {}) {
  u = norm(u);
  w = norm(w);
  const n = norm(cross(u, w));
  const L = 13;
  const local = (p) => {
    const d = vec.sub(p, origin);
    return [vec.dot(d, u), vec.dot(d, w), vec.dot(d, n)];
  };
  const pts = [-7, L + 1].flatMap((s) => [-4, 4].map((a) => origin.map((o, i) => o + u[i] * s + w[i] * a)));
  const min = [0, 1, 2].map((i) => Math.min(...pts.map((q) => q[i])) - 2);
  const max = [0, 1, 2].map((i) => Math.max(...pts.map((q) => q[i])) + 2);
  b.fill(min, max, (p) => {
    const [s, a, h] = local(p);
    // blade or scabbard
    if (s > 0.4 && s < L) {
      const t = s / L;
      const half = 1.5 * (1 - t) ** 0.7 + 0.25;
      if (sheathed) {
        if (Math.abs(a) > half + 0.6 || Math.abs(h) > 1.1) return undefined;
        return s > L - 2 ? 'buckle' : s < 1.6 ? 'strapHi' : 'leather';
      }
      if (Math.abs(a) > half || Math.abs(h) > 0.75 - t * 0.2) return undefined;
      return Math.abs(a) > half - 0.7 ? 'bladeEdge' : 'blade';
    }
    // swept guard curling toward the blade, with a side ring
    if (s > -0.6 && s <= 0.6 && Math.abs(a) < 3.6 && Math.abs(h) < 0.7) return 'steel';
    if (Math.abs(a) > 2.6 && Math.abs(a) < 3.6 && s > 0.6 && s < 2.2 && Math.abs(h) < 0.7) return 'steel';
    const ring = Math.hypot(s - 0.2, h - 1.6);
    if (Math.abs(a) < 0.6 && ring > 0.9 && ring < 1.7 && h > 0.4) return 'steelDark';
    // wrapped grip and pommel
    if (s <= -0.6 && s > -5.2 && Math.abs(a) < 0.8 && Math.abs(h) < 0.8) return Math.floor(-s) % 2 ? 'strap' : 'strapHi';
    if (s <= -5.2 && s > -6.8 && Math.abs(a) < 1.1 && Math.abs(h) < 1.1) return 'steel';
    return undefined;
  }, bone ? { bone } : {});
}

export function buildAssassin() {
  const b = new VoxelBuilder(palette);

  // ---- skeleton -----------------------------------------------------------
  b.bone('pelvis', null, [0, 38, 0]);
  b.bone('torso', 'pelvis', [0, 41, 0]);
  b.bone('head', 'torso', [0, 61, 0.3]);
  b.bone('eyes', 'head', [0, 66, 2.5], { emissive: true });
  b.bone('cloak', 'torso', [0, 58, -6]);
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    b.bone(`upperArm${side}`, 'torso', [9.5 * s, SHOULDER_Y, 0]);
    b.bone(`forearm${side}`, `upperArm${side}`, [21 * s, SHOULDER_Y, 0]);
    b.bone(`hand${side}`, `forearm${side}`, [30 * s, SHOULDER_Y, 0]);
    b.bone(`thigh${side}`, 'pelvis', [4.2 * s, 38, 0]);
    b.bone(`shin${side}`, `thigh${side}`, [4.2 * s, 20, 0.3]);
  }
  b.bone('daggerThigh', 'thighR', [-8.2, 34, 1]);
  b.bone('daggerBack', 'pelvis', [0, 38.5, -6.6]);

  // ---- legs: wrapped trousers and soft boots -------------------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const cx = 4.2 * s;
    b.use(`thigh${side}`).fill([cx - 5, 20, -5], [cx + 5, 39, 5], (p) => {
      if (sel((p[0] - cx) / 3.7, p[2] / 3.9) > 1) return undefined;
      return p[1] < 22.5 ? 'leatherHi' : 'cloth';
    });
    b.use(`shin${side}`);
    b.fill([cx - 5, 0, -5], [cx + 5, 20, 7], (p) => {
      const y = p[1];
      const a = Math.atan2(p[2], p[0] - cx);
      if (y < 7.5) {
        // boot with a soft toe
        const toe = y < 3.2 ? 5.4 : 3.6;
        if (Math.abs(p[0] - cx) > 2.9 || p[2] > toe || p[2] < -3.3) return undefined;
        return y < 0.9 ? 'strap' : 'leather';
      }
      const r = 3.1 + Math.max(0, 1 - Math.abs(y - 14) / 6) * 0.4;
      if (sel((p[0] - cx) / r, (p[2] - 0.2) / r) > 1) return undefined;
      // crossing wraps up the shin
      if (y < 18 && (Math.floor(y * 0.9 + a * 1.3) % 4 === 0 || Math.floor(y * 0.9 - a * 1.3) % 4 === 0)) return 'strap';
      return y < 18 ? 'wrapShade' : 'cloth';
    });
    b.ellipsoid([cx, 20.5, 2.6], [2.6, 2.2, 1.8], 'leatherHi'); // knee pad
  }
  // thigh strap holding the sheath
  b.use('thighR').fill([-9, 28, -4.5], [0, 30, 4.5], (p) => (sel((p[0] + 4.2) / 4.2, p[2] / 4.4) <= 1 && sel((p[0] + 4.2) / 3.4, p[2] / 3.6) > 1 ? 'strap' : undefined));

  // ---- pelvis: belts, pouches, cloth flaps --------------------------------
  b.use('pelvis');
  b.fill([-10, 36, -7], [10, 40, 7], (p) => {
    if (sel(p[0] / 8.6, p[2] / 5.6) > 1) return undefined;
    if (p[2] > 4 && Math.abs(p[0] + 1) < 1.2 && p[1] > 37) return 'buckle';
    return p[1] > 38.4 ? 'strapHi' : 'strap';
  });
  // second belt slung low and diagonal
  b.fill([-10, 31, -7], [10, 37, 7], (p) => {
    const y0 = 33 + p[0] * 0.18;
    if (Math.abs(p[1] - y0) > 0.8) return undefined;
    const q = sel(p[0] / 8.9, p[2] / 6.0);
    return q <= 1 && q > sel(7.4 / 8.9, 0) ? 'strap' : undefined;
  });
  b.box([6.2, 34, -2.2], [9.0, 37.5, 2.6], (p) => (p[1] > 36.8 ? 'strapHi' : 'leatherHi')); // pouch
  b.box([-9.2, 35.5, -4.8], [-6.6, 38, -1.2], 'leatherHi');
  // tattered cloth flaps front and back
  for (const sz of [1, -1])
    b.fill([-6, 22, -8], [6, 37, 8], (p, v) => {
      const z = sz * (5.4 + (37 - p[1]) * 0.08);
      if (Math.abs(p[2] - z) > 0.6 || Math.abs(p[0]) > 4.6 - (37 - p[1]) * 0.06) return undefined;
      if (p[1] < 23 + hash3(v[0], 4, sz) * 7) return undefined;
      return Math.floor(p[0] + 10) % 3 === 0 ? 'tealDark' : 'cloth';
    });

  // ---- torso: woven leather, bandolier, chest strap ------------------------
  b.use('torso');
  const torsoX = (y) => (y < 54 ? lerp(7.6, 9.2, clamp01((y - 41) / 13)) : 9.2 - Math.max(0, y - 56) * 1.8);
  const torsoZ = (y) => lerp(4.8, 5.4, clamp01((y - 41) / 13));
  b.fill([-11, 40, -7], [11, 59, 7], (p) => {
    if (sel(p[0] / torsoX(p[1]), p[2] / torsoZ(p[1])) > 1) return undefined;
    const band = p[1] - (44 + (p[0] + 9) * 0.75); // right shoulder to left hip, seen from the front
    if (Math.abs(band) < 0.9) return Math.floor(p[0] + 20) % 5 === 0 ? 'buckle' : 'strap';
    if (Math.abs(p[1] - 50.5) < 0.6) return 'strap';
    return weave(p);
  });
  b.box([-3.4, 49.6, 5.0], [-1.6, 51.4, 6.2], 'buckle');

  // ---- cowl: teal capelet with a jagged hem, longer on the left -------------
  b.fill([-15, 46, -10], [15, 62, 10], (p, v) => {
    const t = clamp01((61.5 - p[1]) / 12);
    const X = lerp(5.2, 13.2, t ** 0.8), Z = lerp(4.6, 8.0, t ** 0.8);
    const q = sel(p[0] / X, (p[2] - 0.2) / Z, 2);
    if (q > 1 || q < sel((X - 1.6) / X, 0, 2)) return undefined;
    const a = Math.atan2(p[2], p[0]);
    const hem = 49.5 + Math.abs(Math.sin(a * 5)) * 3.2 + hash3(v[0], 6, v[2]) * 1.6 - (p[0] > 0 ? 2.4 : 0) + (p[2] > 3 ? 2.2 : 0);
    if (p[1] < hem) return undefined;
    if (p[1] < hem + 1) return 'tealDeep';
    return tealFold(p);
  });
  // buckled strap fastening the cowl
  b.box([3.5, 55, 6.8], [5.5, 58.5, 8.4], (p) => (p[1] > 57.6 ? 'buckle' : 'strap'));

  // ---- cloak: long, shredded, teal fading to near black --------------------
  b.use('cloak');
  b.fill([-20, 8, -15], [20, 59, 1], (p, v) => {
    const t = (58.5 - p[1]) / 50;
    const X = 10 + t * 6.5, Z = 6.2 + t * 3.6;
    const q = sel(p[0] / X, (p[2] + 0.8) / Z, 2);
    if (q > 1 || q < sel((X - 1.4) / X, 0, 2)) return undefined;
    if (p[2] > -0.8) return undefined;
    // shredded into strips of uneven length
    const strip = Math.floor((Math.atan2(p[2], p[0]) + Math.PI) * 6);
    if (p[1] < 10 + hash3(strip, 3, 3) * 16 + hash3(v[0], v[1], 1) * 1.2) return undefined;
    const fade = t + (noise3(p[0] * 0.3, p[1] * 0.15, p[2] * 0.3) - 0.5) * 0.3;
    return fade > 0.72 ? 'tealDark' : fade > 0.45 ? 'tealDeep' : tealFold(p, 5);
  });
  const isCloak = (x, y, z) => b.voxels.get(`${x},${y},${z}`)?.bone === 'cloak';
  for (const v of [...b.voxels.values()].filter((v) => v.bone === 'cloak')) {
    const sx = Math.sign(v.x + 0.5), sz = Math.sign(v.z + 1.3);
    if (isCloak(v.x + sx, v.y, v.z) && isCloak(v.x, v.y, v.z + sz)) v.color = 'tealDark';
  }
  // loose strips caught in the wind
  b.polyline([[-11, 50, -5], [-15.5, 47, -7.5], [-20, 45.5, -9]], 0.7, 'tealDeep');
  b.polyline([[-12, 44, -6], [-16, 40, -8.5], [-19, 38.5, -10]], 0.6, 'tealDark');

  // ---- hood: peaked, dark void with red eyes --------------------------------
  b.use('head');
  // loose: well clear of the skull, flaring out over the shoulders at the bottom
  const hoodIn = (p) => {
    const flare = p[1] < 64 ? (64 - p[1]) * 0.3 : 0;
    const q = (p[0] / (7.8 + flare)) ** 2 + ((p[1] - 66.8) / 7.6) ** 2 + ((p[2] + 0.6) / (7.8 + flare * 0.5)) ** 2;
    if (q <= 1) return true;
    // tall peak trailing up and back, its tip drooping
    const near = (a, c, r0, r1) => {
      const ab = vec.sub(c, a);
      const t = clamp01(vec.dot(vec.sub(p, a), ab) / vec.dot(ab, ab));
      return vec.len(vec.sub(p, vec.lerp3(a, c, t))) < lerp(r0, r1, t);
    };
    return near([0, 71, -1.8], [0, 80, -7], 6.6, 0.9) || near([0, 80, -7], [0, 78.4, -9.6], 0.9, 0.6);
  };
  b.fill([-11, 58.5, -12], [11, 82, 9], (p) => {
    if (!hoodIn(p)) return undefined;
    const open = (p[0] / 3.9) ** 2 + ((p[1] - 65.3) / 4.9) ** 2;
    if (p[2] > 1.4 && open < 1) {
      if (p[1] < 63.4) return p[2] > 4.4 ? null : 'leather'; // face wrap
      return p[2] > 3.2 ? null : 'void';
    }
    // the opening is a deep tunnel: shadowed inside, lit at the lip
    if (p[2] > 1.4 && open < 1.6) return p[2] > 5.4 ? 'tealHi' : 'tealDark';
    return tealFold([p[0], p[1], p[2] + 1], 5);
  });
  b.use('eyes');
  for (const [x, y, c] of [[1, 65, 'eyeHot'], [2, 66, 'eye'], [-2, 65, 'eyeHot'], [-3, 66, 'eye']]) b.set(x, y, 2, c); // slanted slits, hot at the inner corner

  // ---- arms: woven sleeves, bandaged forearms, dark gloves -----------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const span = (a, c) => (s > 0 ? [a, c] : [-c, -a]);
    b.use(`upperArm${side}`);
    b.fill([span(8, 21.5)[0], SHOULDER_Y - 4, -4], [span(8, 21.5)[1], SHOULDER_Y + 4, 4], (p) =>
      sel((p[1] - SHOULDER_Y) / 2.7, p[2] / 2.7) <= 1 ? weave([p[2], p[1], p[0]]) : undefined,
    { mode: 'under' });
    b.ellipsoid([12 * s, SHOULDER_Y + 0.8, 0], [3.4, 2.8, 3.4], (p) => (p[1] < SHOULDER_Y ? 'strap' : 'leatherHi')); // shoulder pad
    b.ellipsoid([21 * s, SHOULDER_Y, -1.6], [1.6, 2.4, 2.0], 'leatherHi'); // elbow

    b.use(`forearm${side}`);
    b.fill([span(21, 30.2)[0], SHOULDER_Y - 4, -4], [span(21, 30.2)[1], SHOULDER_Y + 4, 4], (p) => {
      const u = Math.abs(p[0]);
      const r = 2.5 + (u < 24 ? 0.2 : 0);
      const vv = p[1] - SHOULDER_Y;
      if (sel(vv / r, p[2] / r) > 1) return undefined;
      const a = Math.atan2(p[2], vv);
      if (Math.floor(u * 0.9 + a * 1.2) % 4 === 0 || Math.floor(u * 0.9 - a * 1.2) % 4 === 0) return 'strap';
      return Math.floor(u) % 2 ? 'wrap' : 'wrapShade';
    });

    b.use(`hand${side}`);
    b.box([span(30, 33.6)[0], SHOULDER_Y - 1.1, -1.8], [span(30, 33.6)[1], SHOULDER_Y + 1.1, 1.8], 'leather');
    b.box([span(33.6, 36)[0], SHOULDER_Y - 1.4, -1.8], [span(33.6, 36)[1], SHOULDER_Y + 0.4, 1.8], (p) =>
      Math.floor(p[2] + 10) % 2 ? 'leatherHi' : 'leather',
    );
    b.segment([31 * s, SHOULDER_Y - 0.6, 2.0], [33 * s, SHOULDER_Y - 1, 2.8], 0.6, 'leatherHi');
  }

  // ---- sheathed daggers ----------------------------------------------------
  dagger(b, [-8.4, 33.5, 1], [0, -1, 0.12], [0, 0, 1], { sheathed: true, bone: 'daggerThigh' });
  dagger(b, [-4.5, 38.6, -6.8], [1, -0.08, 0], [0, 1, 0], { sheathed: true, bone: 'daggerBack' });

  return b.build();
}

// The pair, drawn: blades up, side by side.
export function buildAssassinDaggers() {
  const b = new VoxelBuilder(palette);
  b.bone('daggerL', null, [5.5, 8, 0]);
  b.bone('daggerR', null, [-5.5, 8, 0]);
  dagger(b, [5.5, 8, 0], [0, 1, 0], [1, 0, 0], { bone: 'daggerL' });
  dagger(b, [-5.5, 8, 0], [0, 1, 0], [1, 0, 0], { bone: 'daggerR' });
  return b.build();
}

export const poses = {
  tpose: {},
  apose: {
    upperArmL: [0, 0, -50],
    upperArmR: [0, 0, 50],
    forearmL: [0, -10, -6],
    forearmR: [0, 10, 6],
  },
};
