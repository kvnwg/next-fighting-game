/** Small deterministic noise helpers for shaping voxel props and terrain. */

/** Integer hash of three coordinates and a seed, to [0, 1). */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in 3D, to [0, 1). */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const zf = fade(z - zi);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * xf;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * xf;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * xf;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * xf;
  const y0 = x00 + (x10 - x00) * yf;
  const y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}

/** A few octaves of noise3, to roughly [0, 1). */
export function fbm3(x: number, y: number, z: number, octaves = 3, seed = 0): number {
  let v = 0;
  let a = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += noise3(x, y, z, seed + i * 31) * a;
    norm += a;
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
    a *= 0.5;
  }
  return v / norm;
}

/** 2D value noise via noise3 on a plane. */
export function noise2(x: number, y: number, seed = 0): number {
  return noise3(x, y, 0.5, seed);
}

export function fbm2(x: number, y: number, octaves = 3, seed = 0): number {
  return fbm3(x, y, 0.5, octaves, seed);
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
