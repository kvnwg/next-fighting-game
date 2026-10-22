/**
 * The synthesis toolkit every sound in the game is built from. Nothing here knows about the game:
 * each primitive schedules a few WebAudio nodes (or fills a small buffer) into an `Out`, which can
 * belong to the live AudioContext or to an OfflineAudioContext (the audio renders in tests use that).
 *
 *  - noise():   filtered noise with a shaped envelope and a frequency sweep (whooshes, slices, air)
 *  - osc():     a pitched oscillator with a glide (thumps, sub drops, glints)
 *  - modal():   a bank of inharmonic, exponentially decaying partials (metal and wood ringing)
 *  - grains():  a buffer filled sample by sample (chain links, crackle, debris, cloth tearing)
 */

export interface NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

/** Where a sound is being written: the context, its input node, and when it starts. */
export interface Out {
  ctx: BaseAudioContext;
  dest: AudioNode;
  /** the sound's start time, in context seconds */
  t: number;
  noise: NoiseBank;
  /** the latest scheduled end, so the voice knows when to free itself */
  end: number;
}

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
/** x, nudged by up to ±amt of itself */
export const jit = (x: number, amt: number): number => x * (1 + (Math.random() * 2 - 1) * amt);
export const chance = (p: number): boolean => Math.random() < p;
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

type Linked = Out & { parent?: Out };

export function bump(o: Out, end: number): void {
  if (end > o.end) o.end = end;
  // child Outs share their end with the parent
  const p = (o as Linked).parent;
  if (p) bump(p, end);
}

/** Shift an Out later in time (a layer that starts after the transient). */
export function at(o: Out, delay: number): Out {
  const c: Linked = { ctx: o.ctx, dest: o.dest, t: o.t + delay, noise: o.noise, end: o.end, parent: o };
  return c;
}

/** A sub-bus: everything written into the returned Out goes through `node` first. */
export function via(o: Out, node: AudioNode): Out {
  node.connect(o.dest);
  const c: Linked = { ctx: o.ctx, dest: node, t: o.t, noise: o.noise, end: o.end, parent: o };
  return c;
}

/** A lowpass (or other) filter stage as a sub-bus. */
export function filtered(o: Out, type: BiquadFilterType, f: number, q = 0.7): Out {
  const bq = o.ctx.createBiquadFilter();
  bq.type = type;
  bq.frequency.value = clamp(f, 20, o.ctx.sampleRate * 0.45);
  bq.Q.value = q;
  return via(o, bq);
}

/** A gain stage as a sub-bus. */
export function scaled(o: Out, gain: number): Out {
  const g = o.ctx.createGain();
  g.gain.value = gain;
  return via(o, g);
}

// ------------------------------------------------------------------ noise

export function makeNoise(ctx: BaseAudioContext): NoiseBank {
  const len = Math.floor(ctx.sampleRate * 2.5);
  const mk = (fill: (d: Float32Array) => void): AudioBuffer => {
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    fill(d);
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    const k = 1 / (peak || 1);
    for (let i = 0; i < len; i++) d[i] *= k;
    return b;
  };
  const white = mk((d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  });
  // Paul Kellet's pink filter
  const pink = mk((d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  });
  // leaky integrated white: a deep rumble
  const brown = mk((d) => {
    let y = 0;
    for (let i = 0; i < d.length; i++) {
      y = (y + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = y;
    }
  });
  return { white, pink, brown };
}

type Shape = (x: number) => number;

/** Common envelope shapes over 0..1 */
export const SHAPES = {
  /** a swing: rises to its peak a little past the middle, then falls away */
  swing: (p = 0.55, k = 2): Shape => (x) => (x < p ? Math.pow(x / p, k) : Math.pow(1 - (x - p) / (1 - p), k * 0.8)),
  /** a swell that cuts off at the end */
  swell: (k = 3): Shape => (x) => Math.pow(x, k) * (x < 0.97 ? 1 : (1 - x) / 0.03),
};

function curveOf(fn: Shape, n: number, scale: number, floor = 0): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.max(floor, fn(i / (n - 1)) * scale);
  return c;
}

/** A percussive envelope: a fast linear attack, then an exponential decay reaching -60 dB at `dur`. */
export function perc(g: AudioParam, t: number, peak: number, a: number, dur: number, hold = 0): void {
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) g.setValueAtTime(peak, t + a + hold);
  g.setTargetAtTime(0, t + a + hold, Math.max(0.002, dur - a - hold) / 6.9);
}

export interface NoiseOpts {
  color?: keyof NoiseBank;
  type?: BiquadFilterType;
  /** filter frequency at the start, and at the end (an exponential sweep) */
  f: number;
  f1?: number;
  /** the frequency follows f * fShape(x) instead of a sweep */
  fShape?: Shape;
  q?: number;
  /** a second filter in series (to trim lows off a bandpass, say) */
  type2?: BiquadFilterType;
  f2?: number;
  q2?: number;
  dur: number;
  gain: number;
  /** attack time for the percussive envelope (default 2 ms) */
  a?: number;
  hold?: number;
  /** amplitude shape over the duration instead of the percussive envelope */
  shape?: Shape;
  delay?: number;
  rate?: number;
  dest?: AudioNode;
}

export function noise(o: Out, n: NoiseOpts): void {
  const { ctx } = o;
  const t = o.t + (n.delay ?? 0);
  const nyq = ctx.sampleRate * 0.45;
  const src = ctx.createBufferSource();
  src.buffer = o.noise[n.color ?? 'white'];
  src.loop = true;
  src.playbackRate.value = n.rate ?? 1;
  const bq = ctx.createBiquadFilter();
  bq.type = n.type ?? 'bandpass';
  bq.Q.value = n.q ?? 1;
  const f0 = clamp(n.f, 20, nyq);
  if (n.fShape) {
    bq.frequency.setValueAtTime(f0 * n.fShape(0), t);
    bq.frequency.setValueCurveAtTime(curveOf((x) => clamp(f0 * n.fShape!(x), 20, nyq), 48, 1), t, n.dur);
  } else {
    bq.frequency.setValueAtTime(f0, t);
    if (n.f1 !== undefined) bq.frequency.exponentialRampToValueAtTime(clamp(n.f1, 20, nyq), t + n.dur);
  }
  let last: AudioNode = src.connect(bq);
  if (n.type2) {
    const b2 = ctx.createBiquadFilter();
    b2.type = n.type2;
    b2.frequency.value = clamp(n.f2 ?? 200, 20, nyq);
    b2.Q.value = n.q2 ?? 0.7;
    last = last.connect(b2);
  }
  const g = ctx.createGain();
  if (n.shape) {
    g.gain.setValueAtTime(0, t);
    g.gain.setValueCurveAtTime(curveOf(n.shape, 64, n.gain), t, n.dur);
  } else perc(g.gain, t, n.gain, n.a ?? 0.002, n.dur, n.hold);
  last.connect(g).connect(n.dest ?? o.dest);
  src.start(t, Math.random() * 2);
  src.stop(t + n.dur + 0.05);
  bump(o, t + n.dur + 0.05);
}

// ------------------------------------------------------------------ oscillators

export interface OscOpts {
  type?: OscillatorType;
  f: number;
  f1?: number;
  /** how long the glide from f to f1 takes (default: the whole duration) */
  glide?: number;
  dur: number;
  gain: number;
  a?: number;
  hold?: number;
  shape?: Shape;
  delay?: number;
  /** vibrato/FM: depth in Hz at rate Hz */
  fm?: [rate: number, depth: number];
  dest?: AudioNode;
}

export function osc(o: Out, p: OscOpts): void {
  const { ctx } = o;
  const t = o.t + (p.delay ?? 0);
  const s = ctx.createOscillator();
  s.type = p.type ?? 'sine';
  s.frequency.setValueAtTime(p.f, t);
  if (p.f1 !== undefined) s.frequency.exponentialRampToValueAtTime(Math.max(1, p.f1), t + (p.glide ?? p.dur));
  if (p.fm) {
    const m = ctx.createOscillator();
    const mg = ctx.createGain();
    m.frequency.value = p.fm[0];
    mg.gain.value = p.fm[1];
    m.connect(mg).connect(s.frequency);
    m.start(t);
    m.stop(t + p.dur + 0.05);
  }
  const g = ctx.createGain();
  if (p.shape) {
    g.gain.setValueAtTime(0, t);
    g.gain.setValueCurveAtTime(curveOf(p.shape, 64, p.gain), t, p.dur);
  } else perc(g.gain, t, p.gain, p.a ?? 0.003, p.dur, p.hold);
  s.connect(g).connect(p.dest ?? o.dest);
  s.start(t);
  s.stop(t + p.dur + 0.05);
  bump(o, t + p.dur + 0.05);
}

/** A body blow: a sine dropping in pitch, with a click on its front. */
export function thump(o: Out, f: number, f1: number, dur: number, gain: number, delay = 0, dest?: AudioNode): void {
  osc(o, { f: jit(f, 0.05), f1: jit(f1, 0.05), glide: dur * 0.6, dur, gain, a: 0.002, delay, dest });
}

// ------------------------------------------------------------------ modal (ringing)

/** One partial: frequency ratio to the base, amplitude, and its -60 dB decay time (s). */
export type Mode = readonly [ratio: number, amp: number, decay: number];

export interface ModalOpts {
  base: number;
  modes: readonly Mode[];
  gain: number;
  /** scales every partial's decay */
  decay?: number;
  /** random spread of each partial's ratio (default 1.2%), so no two strikes ring alike */
  jitter?: number;
  /** paired detuned partials beat against each other (Hz), the shimmer of a long ring */
  beat?: number;
  /** amplitude tilt: positive darkens (amp * ratio^-tilt), negative brightens */
  tilt?: number;
  /** partials above this are dropped */
  maxF?: number;
  /** how hard the strike is: a soft strike excites the upper partials less */
  hard?: number;
  delay?: number;
  dest?: AudioNode;
}

export function modal(o: Out, m: ModalOpts): void {
  const { ctx } = o;
  const t = o.t + (m.delay ?? 0);
  const maxF = Math.min(m.maxF ?? 15500, ctx.sampleRate * 0.45);
  const bus = ctx.createGain();
  bus.gain.value = m.gain;
  bus.connect(m.dest ?? o.dest);
  const jitter = m.jitter ?? 0.012;
  const hard = m.hard ?? 1;
  let end = t;
  for (const [ratio, amp0, dec0] of m.modes) {
    const f = m.base * ratio * (1 + (Math.random() * 2 - 1) * jitter);
    if (f > maxF || f < 20) continue;
    let amp = amp0 * jit(1, 0.25) * Math.pow(ratio, -(m.tilt ?? 0));
    // a soft strike barely reaches the top partials
    amp *= Math.pow(Math.min(1, hard), Math.max(0, Math.log2(ratio)));
    const dec = Math.max(0.01, dec0 * (m.decay ?? 1) * jit(1, 0.15));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.0007);
    g.gain.setTargetAtTime(0, t + 0.0007, dec / 6.9);
    g.connect(bus);
    const stop = t + dec + 0.02;
    const s = ctx.createOscillator();
    s.frequency.value = f;
    s.connect(g);
    s.start(t);
    s.stop(stop);
    if (m.beat && dec > 0.25) {
      const s2 = ctx.createOscillator();
      s2.frequency.value = f + rand(0.4, 1) * m.beat * Math.sqrt(ratio) * (chance(0.5) ? 1 : -1);
      const g2 = ctx.createGain();
      g2.gain.value = 0.7;
      s2.connect(g2).connect(g);
      s2.start(t);
      s2.stop(stop);
    }
    end = Math.max(end, stop);
  }
  bump(o, end);
}

// ------------------------------------------------------------------ buffers (grains)

export interface GrainOpts {
  gain: number;
  delay?: number;
  stereo?: boolean;
  /** optional filter on the way out */
  type?: BiquadFilterType;
  f?: number;
  q?: number;
  dest?: AudioNode;
}

/** Fill a fresh buffer sample by sample and play it once. */
export function grains(o: Out, dur: number, fill: (ch: Float32Array, sr: number, c: number) => void, g: GrainOpts): void {
  const { ctx } = o;
  const t = o.t + (g.delay ?? 0);
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(dur * sr));
  const chans = g.stereo ? 2 : 1;
  const b = ctx.createBuffer(chans, n, sr);
  for (let c = 0; c < chans; c++) fill(b.getChannelData(c), sr, c);
  const src = ctx.createBufferSource();
  src.buffer = b;
  let last: AudioNode = src;
  if (g.type) {
    const bq = ctx.createBiquadFilter();
    bq.type = g.type;
    bq.frequency.value = clamp(g.f ?? 1000, 20, sr * 0.45);
    bq.Q.value = g.q ?? 0.7;
    last = last.connect(bq);
  }
  const gg = ctx.createGain();
  gg.gain.value = g.gain;
  last.connect(gg).connect(g.dest ?? o.dest);
  src.start(t);
  bump(o, t + dur + 0.02);
}

/** A damped two-partial ping added into a buffer at sample i (a chain link, a pebble, a spark). */
function ping(d: Float32Array, i0: number, sr: number, f: number, amp: number, decay: number, f2 = f * 2.7, a2 = 0.4): void {
  const n = Math.min(d.length - i0, Math.floor(decay * sr));
  const k = -6.9 / (decay * sr);
  const w1 = (2 * Math.PI * f) / sr;
  const w2 = (2 * Math.PI * f2) / sr;
  const ph = Math.random() * 6.28;
  for (let j = 0; j < n; j++) {
    const e = Math.exp(k * j);
    d[i0 + j] += amp * e * (Math.sin(w1 * j + ph) + a2 * Math.sin(w2 * j));
  }
  // the click of contact
  for (let j = 0; j < 12 && i0 + j < d.length; j++) d[i0 + j] += amp * 0.6 * (Math.random() * 2 - 1) * (1 - j / 12);
}

export interface RattleOpts {
  /** how many link strikes */
  count: number;
  /** spread of the strikes over the buffer (s); they cluster toward the start */
  spread: number;
  fLo: number;
  fHi: number;
  /** link ring decay (s) */
  decay: number;
  /** how quickly the strikes fade along the spread (0 = flat) */
  fade?: number;
  /** AM over the rattle (Hz): a chain swung round comes and goes */
  whirl?: number;
}

/** Chain links, coins, mail: lots of tiny high pings, clustered and fading. */
export function rattle(o: Out, r: RattleOpts, g: GrainOpts): void {
  const dur = r.spread + r.decay + 0.02;
  grains(
    o,
    dur,
    (d, sr) => {
      for (let i = 0; i < r.count; i++) {
        // clustered: denser near the start
        const x = Math.pow(Math.random(), 1.6);
        const tt = x * r.spread;
        let amp = Math.exp(-(r.fade ?? 2) * x) * rand(0.25, 1);
        if (r.whirl) amp *= 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(tt * r.whirl * 6.283), 2);
        const f = rand(r.fLo, r.fHi);
        ping(d, Math.floor(tt * sr), sr, f, amp * 0.35, r.decay * rand(0.5, 1.2), f * rand(1.9, 2.9), rand(0.2, 0.6));
      }
    },
    g,
  );
}

/** Debris: pebbles and grit kicked up by a slam, each bouncing a few times as it lands. */
export function debris(o: Out, count: number, spread: number, fLo: number, fHi: number, g: GrainOpts): void {
  grains(
    o,
    spread + 0.15,
    (d, sr) => {
      for (let i = 0; i < count; i++) {
        let tt = rand(0.03, 0.4) * spread;
        let amp = rand(0.3, 1) * 0.3;
        let gap = rand(0.06, 0.16);
        const f = rand(fLo, fHi);
        while (tt < spread && amp > 0.03) {
          ping(d, Math.floor(tt * sr), sr, f * rand(0.97, 1.03), amp, rand(0.006, 0.02), f * rand(1.4, 2.2), 0.5);
          tt += gap;
          gap *= 0.62;
          amp *= 0.5;
        }
      }
    },
    g,
  );
}

/** Crackle: a lightning arc's snaps and buzz. */
export function crackle(o: Out, dur: number, density: number, g: GrainOpts): void {
  grains(
    o,
    dur,
    (d, sr) => {
      let t = 0;
      while (t < dur) {
        // bursts of snaps with gaps between
        const burst = rand(0.004, 0.03);
        const env = Math.pow(1 - t / dur, 1.3);
        const amp = env * rand(0.3, 1);
        const i0 = Math.floor(t * sr);
        const n = Math.floor(burst * sr);
        // the buzz under it: a rough square at a wandering mains-like pitch
        const hz = rand(70, 190);
        for (let j = 0; j < n && i0 + j < d.length; j++) {
          const snap = Math.random() < 0.08 ? (Math.random() * 2 - 1) * 1.6 : 0;
          const buzz = Math.sign(Math.sin((j / sr) * hz * 6.283)) * 0.25 + (Math.random() * 2 - 1) * 0.5;
          d[i0 + j] += amp * (buzz + snap) * 0.6;
        }
        t += burst + rand(0, 1 / density);
      }
    },
    g,
  );
}

/**
 * A cut through cloth or flesh: fine noise chopped into a stream of tiny grains, dense at the
 * start and thinning out, which reads as fibres parting rather than a hiss.
 */
export function tear(o: Out, dur: number, g: GrainOpts, coarse = 1): void {
  grains(
    o,
    dur,
    (d, sr) => {
      const n = d.length;
      let i = 0;
      while (i < n) {
        const x = i / n;
        const len = Math.floor(rand(0.0008, 0.004) * coarse * sr);
        const amp = Math.pow(1 - x, 1.5) * rand(0.2, 1);
        for (let j = 0; j < len && i + j < n; j++) {
          const w = Math.sin((Math.PI * j) / len);
          d[i + j] += amp * w * (Math.random() * 2 - 1);
        }
        i += len + Math.floor(rand(0, 0.003 + x * 0.01) * sr);
      }
    },
    g,
  );
}

/** Crunch: a dense run of short low clicks (wood splintering, a heavy blow landing). */
export function crunch(o: Out, dur: number, g: GrainOpts): void {
  grains(
    o,
    dur,
    (d, sr) => {
      let t = 0;
      while (t < dur) {
        const x = t / dur;
        const amp = Math.pow(1 - x, 2) * rand(0.2, 1);
        const len = Math.floor(rand(0.002, 0.009) * sr);
        const i0 = Math.floor(t * sr);
        let y = 0;
        for (let j = 0; j < len && i0 + j < d.length; j++) {
          y += ((Math.random() * 2 - 1) - y) * 0.35;
          d[i0 + j] += amp * y * Math.exp((-4 * j) / len) * 1.8;
        }
        t += rand(0.002, 0.012 + x * 0.03);
      }
    },
    g,
  );
}

// ------------------------------------------------------------------ space

export interface RoomOpts {
  /** tail length (s) */
  dur: number;
  /** -60 dB time (s) */
  decay: number;
  /** 0..1: how fast the highs die in the tail */
  damp: number;
  /** pre-delay (s) */
  pre: number;
  /** strength of the early reflections */
  early: number;
}

/** A stereo impulse response, generated: early reflections, then a darkening exponential tail. */
export function makeIR(ctx: BaseAudioContext, r: RoomOpts): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor((r.dur + r.pre) * sr);
  const b = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    const p0 = Math.floor(r.pre * sr);
    let y = 0;
    for (let i = p0; i < n; i++) {
      const t = (i - p0) / sr;
      // the lowpass closes as the tail goes on
      const a = 0.95 - r.damp * 0.85 * Math.min(1, t / r.decay);
      y += ((Math.random() * 2 - 1) - y) * a;
      d[i] = y * Math.exp((-6.9 * t) / r.decay) * Math.min(1, t / 0.008);
    }
    // a handful of early reflections off nearby surfaces
    for (let k = 0; k < 7; k++) {
      const i = p0 + Math.floor(rand(0.004, 0.06) * sr);
      if (i < n) d[i] += r.early * rand(0.3, 1) * (Math.random() < 0.5 ? -1 : 1);
    }
  }
  return b;
}
