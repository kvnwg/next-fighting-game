// Knight: bronze-olive plate edged in gold, tall crested close helm, white fur
// over a navy cowl, navy cape, and a spiked pauldron with a rondel on the
// sword arm. Weapons are props (buildKnightArms): a broad greatsword with a
// ring motif and a round shield with a swirl emblem. ~88 voxels to the crest.
// The body shares its rig layout with the lancer.

import { VoxelBuilder, hash3, noise3 } from '../../tools/voxel/builder.js';

export const palette = {
  plate: '#5c5331',
  plateHi: '#7d703f',
  plateEdge: '#c1a75f',
  plateDeep: '#2f2a18',
  mail: '#34342e',
  leather: '#30271f',
  fur: '#ebe6dc',
  furShade: '#c9c2b4',
  furDeep: '#9d978a',
  cloak: '#1f2434',
  cloakFold: '#161a26',
  lining: '#2c3348',
  liningShade: '#141823',
  void: '#050506',
  // weapons
  blade: '#bba66b',
  bladeHi: '#e2cf90',
  wood: '#3a2a1c',
};

const SHOULDER_Y = 63;
const sel = (a, b, n = 2.6) => Math.abs(a) ** n + Math.abs(b) ** n;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// Dark plate with occasional worn highlights, so large surfaces don't go flat.
const plate = (p, seed = 0) => (noise3(p[0] * 0.3 + seed, p[1] * 0.3, p[2] * 0.3) > 0.7 ? 'plateHi' : 'plate');

export function buildKnight() {
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
  // engraved arcs sweeping across the breastplate
  b.fill([-11, 50, 3], [11, 64, 8], (p) => {
    const X = torsoX(p[1]) + 0.2, Z = torsoZ(p[1]) + 0.2;
    if (sel(p[0] / X, p[2] / Z) > 1 || sel(p[0] / (X - 0.9), p[2] / (Z - 0.9)) < 1) return undefined;
    const arc = Math.abs(Math.hypot(Math.abs(p[0]) - 9, p[1] - 63) - 7.5);
    return arc < 0.45 ? 'plateEdge' : undefined;
  });
  // gorget lames
  b.fill([-6, 65, -6], [6, 71, 6], (p) => {
    const q = sel(p[0] / 4.6, (p[2] - 0.3) / 4.6, 2);
    if (q > 1 || q < (3 / 4.6) ** 2) return undefined;
    return Math.floor(p[1]) % 2 ? 'plateHi' : 'plate';
  });

  // ---- fur mantle over the shoulders --------------------------------------
  b.fill([-16, 59, -12], [16, 76, 12], (p) => {
    const q = Math.sqrt((p[0] / 12.6) ** 2 + ((p[2] + 0.5) / 8.8) ** 2);
    if (q > 1 || q < 0.4) return undefined;
    const rn = (q - 0.4) / 0.6;
    const fluff = (noise3(p[0] * 0.45, p[2] * 0.45, 3) - 0.5) * 3.2;
    const top = 71.6 - rn * 5.5 + fluff;
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
    const x = Math.cos(a) * 12.6 * q, z = Math.sin(a) * 8.8 * q - 0.5;
    const y = 71.6 - ((q - 0.4) / 0.6) * 5.5 - 0.5;
    const out = 1.5 + hash3(i, 3, 9) * 2.5;
    b.segment([x, y, z], [x + Math.cos(a) * out, y + (hash3(i, 4, 9) - 0.3) * 3, z + Math.sin(a) * out * 0.8], 0.55, hash3(i, 5, 9) > 0.5 ? 'fur' : 'furShade');
  }

  // navy cowl wrapped high around the neck, one end hanging down the chest
  b.fill([-7, 63, -7], [7, 72, 8], (p) => {
    const q = sel(p[0] / 5.8, (p[2] - 0.6) / 5.8, 2);
    if (q > 1 || q < (4.2 / 5.8) ** 2) return undefined;
    return Math.sin(Math.atan2(p[2], p[0]) * 5 + p[1] * 0.6) > 0.5 ? 'lining' : 'cloak';
  }, { mode: 'under' });
  b.polyline([[2.5, 66, 5.5], [3.5, 61, 6.8], [3.0, 56, 7.2]], (i) => [1.4, 1.1][i], (p) => (Math.floor(p[1]) % 3 === 0 ? 'lining' : 'cloak'));

  // ---- cape: navy, billowing out to his right -------------------------------
  b.use('cape');
  const capeQ = (p) => {
    const t = (66 - p[1]) / 60;
    const flare = p[0] < 0 ? 1 + t * t * 0.4 : 1;
    const X = (10.8 + t * 7.5) * flare;
    const Z = 6.6 + t * 4.2;
    const a = Math.atan2(p[2] + 0.6, p[0]);
    const wave = 1 + 0.06 * Math.sin(a * 9 + p[1] * 0.05) * t;
    return { t, a, outer: sel(p[0] / (X * wave), (p[2] + 0.6) / (Z * wave), 2), inner: sel(p[0] / (X * wave - 1.6), (p[2] + 0.6) / (Z * wave - 1.6), 2) };
  };
  b.fill([-22, 6, -16], [24, 66, 2], (p, v) => {
    const { t, a, outer, inner } = capeQ(p);
    if (outer > 1 || inner < 1) return undefined;
    if (p[2] > -0.6 - (p[0] < 0 ? t * 3.5 : 0.8)) return undefined; // open at the front
    if (p[1] < 6.5 + hash3(v[0], 4, v[2]) * 3) return undefined;
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
  // tall serrated crest running front to back, highest at the brow
  b.fill([-1.2, 78, -5], [1.2, 89, 6], (p) => {
    if (Math.abs(p[0]) > 0.6) return undefined;
    const z = p[2];
    if (z < -4.2 || z > 4.6) return undefined;
    const tooth = (z + 10) % 2.2 < 1.1 ? 0.9 : 0;
    const top = 82.4 + (z + 4.2) * 0.55 + tooth;
    const shell = Math.sqrt(Math.max(0, 1 - (z / 5.2) ** 2)) * 3.8 + 78;
    if (p[1] > top || p[1] < shell - 0.5) return undefined;
    return p[1] > top - 1 ? 'plateEdge' : 'plateHi';
  });
  for (const s of [1, -1]) b.polyline([[2.2 * s, 79.5, 4.2], [3.6 * s, 82.5, 1.8], [3.4 * s, 84, -1]], 0.6, 'plateEdge'); // swept brow fins

  // ---- arms ----------------------------------------------------------------
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const span = (a, c) => (s > 0 ? [a, c] : [-c, -a]);

    b.use(`pauldron${side}`);
    const big = s < 0;
    const k = big ? 1.25 : 1;
    const layers = [
      { c: [16.2, 61.2, 0], r: [4.8, 4.0, 4.9], cut: 57.8 },
      { c: [14.6, 63.6, 0], r: [5.4, 4.4, 5.4], cut: 60.2 },
      { c: [13.2, 66, 0], r: [5.6, 4.6, 5.6], cut: 62.6 },
    ].slice(big ? 0 : 1);
    for (const [i, L] of layers.entries()) {
      const c = [L.c[0] * s * (big ? 1.06 : 1), L.c[1], L.c[2]];
      b.ellipsoid(c, L.r.map((r) => r * k), (p) => (p[1] < L.cut ? undefined : p[1] < L.cut + 0.9 ? 'plateEdge' : plate(p, 40 + i)));
    }
    if (big) {
      for (const [x, y, z, dx, dy] of [[-15, 70.5, -1.5, -1.6, 4.2], [-18.4, 67.6, -0.5, -3.4, 2.8], [-20.4, 64, 0.5, -3.6, 1.2]])
        b.segment([x, y, z], [x + dx, y + dy, z - 0.6], 0.7, (p, t) => (t > 0.55 ? 'plateEdge' : 'plateHi'));
      b.disc([-14.2, 61.2, 6.6], [0, 0, 1], 3.1, 1.2, (p) => {
        const r = Math.hypot(p[0] + 14.2, p[1] - 61.2);
        const a = Math.atan2(p[1] - 61.2, p[0] + 14.2);
        if (r > 2.4) return 'plateEdge';
        return Math.abs(Math.sin(a * 4)) < 0.35 ? 'plateEdge' : 'plate'; // engraved star
      });
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

// The arms: broad greatsword (blade up) beside a round shield standing on its rim.
export function buildKnightArms() {
  const b = new VoxelBuilder(palette);
  b.bone('greatsword', null, [-16.5, 8, 0.5]);
  b.bone('shield', null, [9.5, 15.3, 0]);

  b.use('greatsword');
  const gx = -16.5, gz = 0.5;
  b.fill([gx - 4, 13.6, gz - 1.5], [gx + 4, 64, gz + 1.5], (p) => {
    const y = p[1];
    const ax = Math.abs(p[0] - gx);
    const half = y > 54 ? 2.6 * (64 - y) / 10 + 0.3 : 2.6;
    if (ax > half) return undefined;
    if (Math.abs(p[2] - gz) > (ax > half - 1 ? 0.6 : 1.1)) return undefined;
    // ring motif near the guard
    const ring = Math.hypot(p[0] - gx, y - 21.5);
    if (Math.abs(ring - 1.9) < 0.5 || ring < 0.6) return 'plateDeep';
    if (ax < 0.6 && y > 25 && y < 52) return 'plateDeep'; // fuller
    return ax > half - 0.9 ? 'bladeHi' : 'blade';
  });
  b.polyline([[gx - 7.4, 14.6, gz], [gx - 6.4, 13.4, gz], [gx + 6.4, 13.4, gz], [gx + 7.4, 14.6, gz]], 0.75, (p, t) => (t < 0.1 || t > 0.9 ? 'plateEdge' : 'plate'));
  b.segment([gx, 3.4, gz], [gx, 12.8, gz], 0.85, (p) => (Math.floor(p[1]) % 2 ? 'leather' : 'wood'));
  b.ellipsoid([gx, 2, gz], [1.6, 1.5, 1.4], (p) => (p[1] > 2.6 ? 'plateEdge' : 'plate'));

  b.use('shield');
  const sc = [9.5, 15.3, 0];
  const S = 15 / 12.2; // pattern below is laid out for r = 12.2, scaled up to 15
  b.fill([sc[0] - 16, 0, -2.5], [sc[0] + 16, 31, 3.5], (p) => {
    const dx = p[0] - sc[0], dy = p[1] - sc[1];
    const r = Math.hypot(dx, dy) / S;
    if (r > 12.2) return undefined;
    const dome = 1.2 * (1 - (r / 12.2) ** 2); // slightly convex face
    const rim = r > 10.4;
    const front = rim ? 2.2 : 1.0 + dome;
    if (p[2] > front || p[2] < -1) return undefined;
    if (p[2] < 0) return rim ? 'plateDeep' : 'wood'; // back
    if (rim) return r > 11.6 || r < 10.9 ? 'plateEdge' : 'plate';
    if (r < 1.9) return 'plateHi'; // boss
    if (Math.abs(r - 3.2) < 0.5) return 'plateEdge';
    const a = Math.atan2(dy, dx);
    if (r > 4.2 && r < 9.8 && Math.sin(a * 3 + r * 0.55) > 0.72) return 'plateEdge'; // swirl
    return noise3(p[0] * 0.3, p[1] * 0.3, 1) > 0.66 ? 'lining' : 'cloak';
  });
  b.ellipsoid([sc[0], sc[1], 2.0], [2.1, 2.1, 1.4], 'plateEdge');
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
