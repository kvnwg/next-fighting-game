/**
 * Procedural ink art for the UI: enso brush circles, brush strokes, washi paper grain and a
 * seigaiha wave pattern. Everything is generated once at startup as SVG data URIs and exposed as
 * CSS variables, so the stylesheet can use them like any other image.
 */

/** Small deterministic PRNG so the brushwork looks the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];
const n1 = (v: number) => Math.round(v * 10) / 10;
const poly = (pts: Pt[]) => `M${pts.map(([x, y]) => `${n1(x)} ${n1(y)}`).join('L')}Z`;
const uri = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/**
 * A brushed band along a path: `at(u)` gives the centerline point and the direction across it,
 * `width(u)` the brush pressure. Toward the tail the bristles separate: thin streaks of bare
 * paper run out to the end of the stroke (cut out as holes with the even-odd rule).
 */
function band(at: (u: number) => { p: Pt; nx: number; ny: number }, width: (u: number) => number, r: () => number, samples: number, dry: { from: number; count: number }): string {
  const side1: Pt[] = [];
  const side2: Pt[] = [];
  const geo: { p: Pt; nx: number; ny: number; w: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const g = at(u);
    const w = width(u);
    geo.push({ ...g, w });
    // ragged edges: each side wobbles on its own
    const e1 = w / 2 + (r() - 0.5) * Math.min(1.4, w * 0.1);
    const e2 = w / 2 + (r() - 0.5) * Math.min(1.4, w * 0.1);
    side1.push([g.p[0] + g.nx * e1, g.p[1] + g.ny * e1]);
    side2.push([g.p[0] - g.nx * e2, g.p[1] - g.ny * e2]);
  }
  let d = poly([...side1, ...side2.reverse()]);
  for (let k = 0; k < dry.count; k++) {
    // evenly spread lanes so streaks never overlap (overlapping holes would fill back in)
    const lane = -0.36 + (0.72 * (k + 0.5)) / dry.count + (r() - 0.5) * (0.4 / dry.count);
    const i0 = Math.floor((dry.from + r() * (0.95 - dry.from)) * samples);
    const i1 = samples - 1 - Math.floor(r() * samples * 0.03);
    const thick = (0.3 + r() * 0.5) * (0.6 / dry.count);
    const a: Pt[] = [];
    const b: Pt[] = [];
    for (let i = i0; i <= i1; i++) {
      const g = geo[i];
      const grow = Math.min(1, (i - i0) / Math.max(1, (i1 - i0) * 0.6));
      const c = lane * g.w;
      // stay inside the stroke
      const hw = Math.min((thick * g.w * grow) / 2, Math.max(0, g.w * 0.46 - Math.abs(c)));
      a.push([g.p[0] + g.nx * (c + hw), g.p[1] + g.ny * (c + hw)]);
      b.push([g.p[0] + g.nx * (c - hw), g.p[1] + g.ny * (c - hw)]);
    }
    if (a.length > 2) d += poly([...a, ...b.reverse()]);
  }
  return d;
}

/** Rounded start of a brush mark: the bristles splay as the brush is pressed down. */
const press = (u: number, len: number) => {
  const t = Math.min(1, u / len);
  return Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
};

/** A hand-brushed circle: heavy where the brush lands, thinning to a dry, open tail. */
export function enso(seed: number, color: string): string {
  const r = rng(seed);
  const start = Math.PI * (0.55 + r() * 0.1);
  const sweep = Math.PI * 2 * (0.86 + r() * 0.05);
  const p1 = r() * 6;
  const p2 = r() * 6;
  const R = 39;
  const d = band(
    (u) => {
      const a = start + sweep * u;
      const rad = R + Math.sin(u * 5 + p1) * 1.3 + Math.sin(u * 13 + p2) * 0.5 - u * 1.5;
      return { p: [50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad], nx: Math.cos(a), ny: Math.sin(a) };
    },
    (u) => 0.8 + 8.8 * press(u, 0.04) * (1 - 0.8 * Math.pow(u, 2.4)) * (0.93 + 0.07 * Math.sin(u * 23)),
    r,
    160,
    { from: 0.5, count: 4 },
  );
  // a couple of ink drops where the brush hit the paper
  const a0 = start - 0.08;
  const drops = [0, 1]
    .map((i) => `<circle cx='${n1(50 + Math.cos(a0 - i * 0.05) * (R + 6 + i * 3))}' cy='${n1(50 + Math.sin(a0 - i * 0.05) * (R + 6 + i * 3))}' r='${n1(1.1 - i * 0.4)}'/>`)
    .join('');
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><g fill='${color}'><path fill-rule='evenodd' d='${d}'/>${drops}</g></svg>`;
}

/** A single horizontal brush stroke (for banner backdrops and underlines). */
export function stroke(seed: number, color: string, w = 400, h = 60): string {
  const r = rng(seed);
  const p1 = r() * 6;
  const tilt = (r() - 0.5) * h * 0.12;
  const d = band(
    (u) => {
      const x = 4 + u * (w - 8);
      const y = h / 2 + Math.sin(u * 3 + p1) * h * 0.035 + tilt * (u - 0.5);
      return { p: [x, y], nx: 0, ny: 1 };
    },
    (u) => h * 0.86 * press(u, 0.035) * (1 - 0.72 * Math.pow(Math.max(0, u - 0.5) / 0.5, 1.7)) * (0.95 + 0.05 * Math.sin(u * 31)),
    r,
    200,
    { from: 0.45, count: 7 },
  );
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='none'><path fill='${color}' fill-rule='evenodd' d='${d}'/></svg>`;
}

/** Washi paper grain: fine fibres and blotches, as a translucent overlay for paper panels. */
export function washi(): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>
    <filter id='a'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.36 0 0 0 0 0.27 0 0 0 0 0.16 0 0 0 0.11 0'/></filter>
    <filter id='b'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.09' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.45 0 0 0 0 0.36 0 0 0 0 0.22 0 0 0 0.16 -0.04'/></filter>
    <rect width='100%' height='100%' filter='url(#a)'/><rect width='100%' height='100%' filter='url(#b)'/></svg>`;
}

/** Seigaiha (blue ocean waves): overlapping fans of rings, drawn top row first so lower rows cover them. */
export function seigaiha(ring: string, fill: string): string {
  const R = 24;
  const W = 288; // a multiple of the spacing so it tiles horizontally
  const H = 240;
  let body = '';
  for (let row = 0; row <= (H * 2) / R + 1; row++) {
    const y = row * (R / 2);
    const off = row % 2 ? R : 0;
    for (let x = -R * 2 + off; x <= W + R; x += R * 2) {
      body += `<circle cx='${x}' cy='${y}' r='${R}' fill='${fill}'/>`;
      for (const k of [0.85, 0.62, 0.39, 0.16]) body += `<circle cx='${x}' cy='${y}' r='${n1(R * k)}' fill='none' stroke='${ring}' stroke-width='1.6'/>`;
    }
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>${body}</svg>`;
}

/** Generate the art and publish it as CSS variables (--enso, --stroke, --washi...). */
export function installInkArt(root: HTMLElement = document.documentElement): void {
  const vars: Record<string, string> = {
    '--enso': uri(enso(11, '#f1e8d4')),
    '--enso-shu': uri(enso(29, '#e8523c')),
    '--enso-ink': uri(enso(5, '#16110f')),
    '--stroke-ink': uri(stroke(3, '#0d0a0a')),
    '--stroke-shu': uri(stroke(8, '#c8352a')),
    '--stroke-kin': uri(stroke(21, '#c9a44c', 400, 40)),
    '--washi': uri(washi()),
    '--waves': uri(seigaiha('rgba(201,164,76,0.32)', '#120e0f')),
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}
