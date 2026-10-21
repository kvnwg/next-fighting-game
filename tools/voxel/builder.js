// Tiny voxel authoring kit. Shapes are described in continuous space and
// sampled at voxel centres (x + 0.5, y + 0.5, z + 0.5), so a shape centred on
// x = 0 comes out mirror-symmetric. Y is up and characters face +Z.

export function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smooth value noise in [0, 1), for rocky surfaces and colour breakup.
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const h = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
    l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v),
    w,
  );
}

const key = (x, y, z) => `${x},${y},${z}`;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class VoxelBuilder {
  constructor(palette) {
    this.palette = palette;
    this.voxels = new Map();
    this.bones = [];
    this.current = null;
  }

  bone(name, parent, pivot) {
    this.bones.push({ name, parent, pivot });
    this.current = name;
    return this;
  }

  use(name) {
    this.current = name;
    return this;
  }

  // mode: 'over' replaces whatever is there, 'under' only fills empty cells.
  set(x, y, z, color, { bone = this.current, mode = 'over' } = {}) {
    const k = key(x, y, z);
    if (color === null) {
      this.voxels.delete(k);
      return;
    }
    if (color === undefined) return;
    if (!(color in this.palette)) throw new Error(`unknown colour "${color}"`);
    if (mode === 'under' && this.voxels.has(k)) return;
    this.voxels.set(k, { x, y, z, color, bone });
  }

  has(x, y, z) {
    return this.voxels.has(key(x, y, z));
  }

  // Visit every voxel whose centre lies in [min, max]. `shape(p)` returns a
  // colour name, null to erase, or undefined to leave the cell alone.
  fill(min, max, shape, opts = {}) {
    for (let x = Math.floor(min[0]); x <= Math.ceil(max[0]); x++)
      for (let y = Math.floor(min[1]); y <= Math.ceil(max[1]); y++)
        for (let z = Math.floor(min[2]); z <= Math.ceil(max[2]); z++) {
          const p = [x + 0.5, y + 0.5, z + 0.5];
          if (p[0] < min[0] || p[0] > max[0] || p[1] < min[1] || p[1] > max[1] || p[2] < min[2] || p[2] > max[2]) continue;
          const c = shape(p, [x, y, z]);
          if (c === undefined) continue;
          const bone = typeof opts.bone === 'function' ? opts.bone(p) : opts.bone;
          this.set(x, y, z, c, { ...opts, bone: bone ?? this.current });
        }
    return this;
  }

  box(min, max, color, opts) {
    return this.fill(min, max, (p, v) => (typeof color === 'function' ? color(p, v) : color), opts);
  }

  // Capsule from a to b. `color(p, t, d)` gets the normalised position t along
  // the axis and the distance d from a.
  segment(a, b, r, color, opts) {
    const ab = sub(b, a);
    const L = len(ab);
    const min = [0, 1, 2].map((i) => Math.min(a[i], b[i]) - r);
    const max = [0, 1, 2].map((i) => Math.max(a[i], b[i]) + r);
    return this.fill(
      min,
      max,
      (p, v) => {
        const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (L * L)));
        if (len(sub(p, lerp3(a, b, t))) > r) return undefined;
        return typeof color === 'function' ? color(p, t, t * L, v) : color;
      },
      opts,
    );
  }

  polyline(points, r, color, opts) {
    for (let i = 0; i < points.length - 1; i++) this.segment(points[i], points[i + 1], typeof r === 'function' ? r(i) : r, color, opts);
    return this;
  }

  // Flat disc centred on c, perpendicular to axis n.
  disc(c, n, r, thickness, color, opts) {
    const nl = len(n);
    const u = n.map((v) => v / nl);
    return this.fill(
      c.map((v) => v - r - 1),
      c.map((v) => v + r + 1),
      (p, v) => {
        const d = sub(p, c);
        const h = dot(d, u);
        if (Math.abs(h) > thickness / 2) return undefined;
        const radial = len(sub(d, u.map((k) => k * h)));
        if (radial > r) return undefined;
        return typeof color === 'function' ? color(p, v) : color;
      },
      opts,
    );
  }

  ellipsoid(c, r, color, opts) {
    return this.fill(
      sub(c, r),
      c.map((v, i) => v + r[i]),
      (p, v) => {
        const q = [0, 1, 2].reduce((s, i) => s + ((p[i] - c[i]) / r[i]) ** 2, 0);
        if (q > 1) return undefined;
        return typeof color === 'function' ? color(p, v) : color;
      },
      opts,
    );
  }

  build() {
    const voxels = [...this.voxels.values()];
    const bounds = voxels.reduce(
      (b, v) => ({
        min: [Math.min(b.min[0], v.x), Math.min(b.min[1], v.y), Math.min(b.min[2], v.z)],
        max: [Math.max(b.max[0], v.x), Math.max(b.max[1], v.y), Math.max(b.max[2], v.z)],
      }),
      { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
    );
    return { palette: this.palette, bones: this.bones, voxels, bounds };
  }
}

export const vec = { sub, dot, len, lerp3 };
