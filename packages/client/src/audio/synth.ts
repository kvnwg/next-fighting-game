// Low-level building blocks for synthesized sound. Everything schedules on the
// context clock and cleans up its own nodes when the source finishes.

/** Where a sound plays, plus an optional hook so callers can stop or count sources. */
export interface Sink {
  readonly ctx: BaseAudioContext;
  readonly dest: AudioNode;
  readonly noise: AudioBuffer;
  track?(src: AudioScheduledSourceNode, stopAt: number): void;
}

/** Gain floor for exponential ramps (-80 dB), which can't reach zero. */
export const SILENT = 0.0001;

export function createNoiseBuffer(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export const rand = (min: number, max: number) => min + Math.random() * (max - min);

export interface EnvOpts {
  at: number;
  gain: number;
  attack?: number;
  hold?: number;
  decay: number;
}

export interface FilterOpts {
  type: BiquadFilterType;
  freq: number;
  q?: number;
  /** Optional exponential sweep to freqEnd over `sweep` seconds. */
  freqEnd?: number;
  sweep?: number;
}

export interface ToneOpts extends EnvOpts {
  freq: number;
  freqEnd?: number;
  /** Seconds the pitch takes to reach freqEnd (default: the whole sound). */
  glide?: number;
  type?: OscillatorType;
  detune?: number;
  /** Vibrato depth is in cents. */
  vibrato?: { rate: number; depth: number };
  filter?: FilterOpts;
}

export interface NoiseOpts extends EnvOpts {
  filter?: FilterOpts;
  hp?: number;
  lp?: number;
}

function nyquistSafe(ctx: BaseAudioContext, f: number): number {
  return Math.min(Math.max(f, 20), ctx.sampleRate / 2 - 200);
}

/** Attack to `gain`, optional hold, exponential decay to silence. Returns the gain node and end time. */
function envelope(ctx: BaseAudioContext, o: EnvOpts): { node: GainNode; end: number } {
  const node = ctx.createGain();
  const attack = Math.max(0.0005, o.attack ?? 0.002);
  const peak = Math.max(SILENT, o.gain);
  const peakAt = o.at + attack;
  const holdEnd = peakAt + (o.hold ?? 0);
  const end = holdEnd + Math.max(0.005, o.decay);
  node.gain.setValueAtTime(0, o.at);
  node.gain.linearRampToValueAtTime(peak, peakAt);
  if (o.hold) node.gain.setValueAtTime(peak, holdEnd);
  node.gain.exponentialRampToValueAtTime(SILENT, end);
  return { node, end };
}

function makeFilter(ctx: BaseAudioContext, o: FilterOpts, at: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.Q.value = o.q ?? 0.7;
  f.frequency.setValueAtTime(nyquistSafe(ctx, o.freq), at);
  if (o.freqEnd !== undefined) {
    f.frequency.exponentialRampToValueAtTime(nyquistSafe(ctx, o.freqEnd), at + (o.sweep ?? 0.2));
  }
  return f;
}

function finish(s: Sink, src: AudioScheduledSourceNode, nodes: AudioNode[], stopAt: number): void {
  src.onended = () => {
    for (const n of nodes) n.disconnect();
  };
  s.track?.(src, stopAt);
}

/** A single oscillator with an envelope, optional pitch glide, vibrato and filter. Returns its end time. */
export function tone(s: Sink, o: ToneOpts): number {
  const { ctx } = s;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  const { node: env, end } = envelope(ctx, o);
  osc.frequency.setValueAtTime(nyquistSafe(ctx, o.freq), o.at);
  if (o.freqEnd !== undefined) {
    const glide = o.glide ?? end - o.at;
    osc.frequency.exponentialRampToValueAtTime(nyquistSafe(ctx, o.freqEnd), o.at + glide);
  }
  if (o.detune) osc.detune.value = o.detune;

  const nodes: AudioNode[] = [osc, env];
  let head: AudioNode = osc;
  if (o.filter) {
    const f = makeFilter(ctx, o.filter, o.at);
    head.connect(f);
    head = f;
    nodes.push(f);
  }
  head.connect(env);
  env.connect(s.dest);

  const stopAt = end + 0.02;
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = o.vibrato.rate;
    depth.gain.value = o.vibrato.depth;
    lfo.connect(depth);
    depth.connect(osc.detune);
    lfo.start(o.at);
    lfo.stop(stopAt);
    nodes.push(lfo, depth);
  }
  osc.start(o.at);
  osc.stop(stopAt);
  finish(s, osc, nodes, stopAt);
  return end;
}

/** White noise through optional filters with an envelope. Returns its end time. */
export function noise(s: Sink, o: NoiseOpts): number {
  const { ctx } = s;
  const src = ctx.createBufferSource();
  src.buffer = s.noise;
  src.loop = true;
  const { node: env, end } = envelope(ctx, o);

  const nodes: AudioNode[] = [src, env];
  let head: AudioNode = src;
  const chain: FilterOpts[] = [];
  if (o.filter) chain.push(o.filter);
  if (o.hp) chain.push({ type: 'highpass', freq: o.hp });
  if (o.lp) chain.push({ type: 'lowpass', freq: o.lp });
  for (const fo of chain) {
    const f = makeFilter(ctx, fo, o.at);
    head.connect(f);
    head = f;
    nodes.push(f);
  }
  head.connect(env);
  env.connect(s.dest);

  const stopAt = end + 0.02;
  src.start(o.at, Math.random() * Math.max(0, s.noise.duration - 0.25));
  src.stop(stopAt);
  finish(s, src, nodes, stopAt);
  return end;
}

/** Inharmonic partial stack for metallic sounds. */
export function partials(
  s: Sink,
  at: number,
  base: number,
  ratios: readonly number[],
  gains: readonly number[],
  decays: readonly number[],
): void {
  ratios.forEach((r, i) => {
    tone(s, { at, freq: base * r, gain: gains[i] ?? 0.05, attack: 0.001, decay: decays[i] ?? 0.1 });
  });
}

// ---- Instruments shared by sound effects and music ----

/** Koto-like pluck: bright attack that mellows, slight pitch settle. */
export function pluck(s: Sink, at: number, freq: number, gain: number, length = 0.9): void {
  tone(s, {
    at,
    type: 'triangle',
    freq: freq * 1.012,
    freqEnd: freq,
    glide: 0.035,
    gain,
    attack: 0.003,
    decay: length,
    filter: { type: 'lowpass', freq: freq * 7, freqEnd: freq * 1.6, sweep: 0.3, q: 1.4 },
  });
  tone(s, { at, freq: freq * 2.003, gain: gain * 0.18, attack: 0.002, decay: length * 0.35 });
  noise(s, { at, gain: gain * 0.25, attack: 0.0005, decay: 0.015, filter: { type: 'bandpass', freq: freq * 3, q: 2 } });
}

/** Taiko-style drum: low sine with a pitch drop plus a skin slap. */
export function taiko(s: Sink, at: number, gain: number, pitch = 1, length = 0.45): void {
  tone(s, { at, freq: 88 * pitch, freqEnd: 42 * pitch, glide: length * 0.7, gain, attack: 0.002, decay: length });
  noise(s, { at, gain: gain * 0.45, attack: 0.001, decay: 0.07, lp: 520 * pitch });
  noise(s, { at, gain: gain * 0.08, attack: 0.0005, decay: 0.006, hp: 2000 });
}

/** Gong: inharmonic partials with long decays and a slight upward bloom. */
export function gong(s: Sink, at: number, f0: number, gain: number, length = 2.4): void {
  const ratios = [1, 1.47, 2.09, 2.76, 3.41, 4.17];
  const levels = [1, 0.7, 0.5, 0.35, 0.22, 0.15];
  ratios.forEach((r, i) => {
    tone(s, {
      at,
      freq: f0 * r * 0.985,
      freqEnd: f0 * r,
      glide: 0.6,
      gain: gain * levels[i]! * 0.35,
      attack: 0.006,
      decay: length * (1 - i * 0.11),
    });
  });
  noise(s, { at, gain: gain * 0.3, attack: 0.001, decay: 0.12, filter: { type: 'bandpass', freq: f0 * 9, q: 0.8 } });
}

/** Breathy flute (shakuhachi-like): sine with vibrato plus band-passed breath. */
export function flute(s: Sink, at: number, freq: number, gain: number, dur: number, fromFreq?: number): void {
  tone(s, {
    at,
    freq: fromFreq ?? freq * 0.985,
    freqEnd: freq,
    glide: fromFreq ? 0.12 : 0.06,
    gain,
    attack: 0.09,
    hold: Math.max(0, dur - 0.3),
    decay: 0.28,
    vibrato: { rate: 5.2, depth: 9 },
  });
  noise(s, {
    at,
    gain: gain * 0.35,
    attack: 0.05,
    hold: Math.max(0, dur - 0.35),
    decay: 0.22,
    filter: { type: 'bandpass', freq: freq * 2, q: 6 },
  });
}

/** Wood/rim click. */
export function woodblock(s: Sink, at: number, gain: number, pitch = 1): void {
  tone(s, { at, freq: 1650 * pitch, gain: gain * 0.6, attack: 0.0005, decay: 0.03 });
  noise(s, { at, gain, attack: 0.0005, decay: 0.02, filter: { type: 'bandpass', freq: 2600 * pitch, q: 3 } });
}

export function shaker(s: Sink, at: number, gain: number, length = 0.035): void {
  noise(s, { at, gain, attack: 0.004, decay: length, hp: 5500 });
}
