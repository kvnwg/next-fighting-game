// Procedural music. A lookahead scheduler on the AudioContext clock sequences
// each layer; states crossfade between layers.
import { flute, gong, noise, pluck, rand, shaker, taiko, tone, woodblock, type Sink } from './synth.ts';

export type MusicState = 'silent' | 'lobby' | 'drone' | 'ambience' | 'match';
type Layer = Exclude<MusicState, 'silent'>;
type Stinger = 'roundWin' | 'roundLose' | 'victory' | 'defeat' | 'gong';

const LAYERS: readonly Layer[] = ['lobby', 'drone', 'ambience', 'match'];
/** Seconds per sequencer step: lobby 8ths at 120 BPM, match 16ths at 90 BPM. */
const STEP: Record<Layer, number> = { lobby: 60 / 120 / 2, drone: 2, ambience: 0.5, match: 60 / 90 / 4 };
const LOOKAHEAD = 0.12;
const TICK_MS = 25;

// D "In" scale (D Eb G A Bb), a Japanese pentatonic that suits the shrine arenas.
const IN_SCALE = [0, 1, 5, 7, 8];
const D3 = 146.83;

/** Scale degree 0 = D3, 5 = D4, 10 = D5, ... */
function note(degree: number): number {
  const octave = Math.floor(degree / 5);
  const i = ((degree % 5) + 5) % 5;
  return D3 * 2 ** ((IN_SCALE[i]! + 12 * octave) / 12);
}

const LOBBY_PHRASES: readonly (readonly number[])[] = [
  [5, -1, 7, -1, 8, 7, 6, -1, 5, -1, -1, 3, 4, -1, 5, -1],
  [8, -1, 9, 8, 7, -1, 5, -1, 6, 7, -1, 5, 3, -1, -1, -1],
  [5, 6, 7, -1, 10, -1, 9, 8, 7, -1, 8, -1, 7, 6, 5, -1],
  [3, -1, 5, -1, 6, -1, 5, 3, 2, -1, 3, -1, 5, -1, -1, -1],
];
/** Pad chords as scale degrees: D + A, then G + D. */
const LOBBY_CHORDS: readonly (readonly number[])[] = [
  [5, 8],
  [7, 10],
];

interface LayerRuntime {
  gain: GainNode;
  next: number;
  step: number;
  /** Keep sequencing until this time (Infinity while the layer is on). */
  activeUntil: number;
}

export class MusicDirector {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly layers = new Map<Layer, LayerRuntime>();
  private stingerGain: GainNode | null = null;
  private state: MusicState = 'silent';
  private intensity = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private wind: { sources: AudioScheduledSourceNode[]; nodes: AudioNode[]; fade: GainNode } | null = null;
  private phrase = 0;
  private chord = 0;

  /**
   * Wires the director to a live context. Called by AudioEngine once the
   * AudioContext exists; any state set before that starts playing now.
   */
  attach(ctx: AudioContext, out: AudioNode, noiseBuffer: AudioBuffer): void {
    if (this.timer !== null) return;
    this.ctx = ctx;
    this.noiseBuffer = noiseBuffer;
    for (const layer of LAYERS) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(out);
      this.layers.set(layer, { gain, next: 0, step: 0, activeUntil: 0 });
    }
    this.stingerGain = ctx.createGain();
    this.stingerGain.connect(out);
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.apply(0.6);
  }

  setState(s: MusicState, fadeSeconds = 1.2): void {
    if (s === this.state) return;
    this.state = s;
    this.apply(fadeSeconds);
  }

  setIntensity(x: number): void {
    this.intensity = Math.min(1, Math.max(0, x));
  }

  stinger(s: Stinger): void {
    const ctx = this.ctx;
    if (!ctx || !this.stingerGain || ctx.state !== 'running') return;
    const sink = this.sink(this.stingerGain);
    const t = ctx.currentTime + 0.03;
    switch (s) {
      case 'gong':
        gong(sink, t, 98, 0.55, 2.6);
        break;
      case 'roundWin':
        [0, 0.2, 0.36, 0.5, 0.62, 0.72].forEach((d, i) => taiko(sink, t + d, 0.32 + i * 0.06, 1.05));
        gong(sink, t + 0.85, 98, 0.45, 2.4);
        [5, 7, 8, 10].forEach((deg, i) => pluck(sink, t + 0.85 + i * 0.11, note(deg), 0.16, 1.1));
        break;
      case 'roundLose':
        taiko(sink, t, 0.3, 0.85, 0.6);
        [8, 7, 6, 5].forEach((deg, i) => pluck(sink, t + i * 0.3, note(deg), 0.15, 1.2));
        break;
      case 'victory':
        [0, 0.18, 0.33, 0.46, 0.57, 0.66, 0.74, 0.8].forEach((d, i) => taiko(sink, t + d, 0.3 + i * 0.05, 1.05));
        gong(sink, t + 0.95, 98, 0.55, 3);
        [5, 7, 8, 10, 12, 13, 15].forEach((deg, i) => pluck(sink, t + 0.95 + i * 0.1, note(deg), 0.15, 1.3));
        break;
      case 'defeat':
        gong(sink, t, 73, 0.45, 3);
        [8, 6, 5, 3, 0].forEach((deg, i) => pluck(sink, t + 0.3 + i * 0.4, note(deg), 0.13, 1.4));
        break;
    }
  }

  private sink(dest: AudioNode): Sink {
    return { ctx: this.ctx!, dest, noise: this.noiseBuffer! };
  }

  private apply(fade: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const f = Math.max(0.05, fade);
    for (const layer of LAYERS) {
      const rt = this.layers.get(layer)!;
      const on = layer === this.state;
      const g = rt.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(on ? 1 : 0, now + f);
      if (on) {
        if (rt.activeUntil <= now) {
          rt.next = now + 0.06;
          rt.step = 0;
        }
        rt.activeUntil = Infinity;
      } else if (rt.activeUntil > now) {
        // Keep sequencing while it fades out, so notes don't cut off mid-crossfade.
        rt.activeUntil = now + f + 0.1;
      }
    }
    if (this.state === 'ambience') this.startWind(now);
    else this.stopWind(now + f + 0.05);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    for (const layer of LAYERS) {
      const rt = this.layers.get(layer)!;
      if (now >= rt.activeUntil) continue;
      // After a stall (background tab), skip ahead instead of firing a burst of notes.
      if (rt.next < now - 0.25) rt.next = now + 0.03;
      while (rt.next < horizon) {
        this.playStep(layer, rt.gain, rt.step, rt.next);
        rt.next += STEP[layer];
        rt.step++;
      }
    }
  }

  private playStep(layer: Layer, dest: GainNode, step: number, t: number): void {
    const sink = this.sink(dest);
    switch (layer) {
      case 'lobby':
        return this.lobbyStep(sink, step, t);
      case 'drone':
        return this.droneStep(sink, t);
      case 'ambience':
        return this.ambienceStep(sink, t);
      case 'match':
        return this.matchStep(sink, step, t);
    }
  }

  private lobbyStep(sink: Sink, step: number, t: number): void {
    const s = step % 16;
    if (s === 0) {
      let next = Math.floor(Math.random() * LOBBY_PHRASES.length);
      if (next === this.phrase) next = (next + 1) % LOBBY_PHRASES.length;
      this.phrase = next;
      this.chord = (this.chord + 1) % LOBBY_CHORDS.length;
      for (const deg of LOBBY_CHORDS[this.chord]!) {
        tone(sink, {
          at: t,
          freq: note(deg),
          gain: 0.03,
          attack: 0.9,
          hold: 2.2,
          decay: 1.4,
          detune: rand(-6, 6),
          filter: { type: 'lowpass', freq: 1400 },
        });
      }
    }
    const deg = LOBBY_PHRASES[this.phrase]![s]!;
    if (deg >= 0) pluck(sink, t, note(deg), 0.15, 0.9);
    if (s === 0 || s === 8) pluck(sink, t, note(LOBBY_CHORDS[this.chord]![0]!) / 2, 0.12, 1.4);
    shaker(sink, t, s % 2 === 1 ? 0.03 : 0.018);
    if (s === 0 || s === 6 || s === 8 || s === 11) {
      tone(sink, { at: t, freq: 200, freqEnd: 130, gain: 0.12, attack: 0.002, decay: 0.12 });
    }
  }

  private droneStep(sink: Sink, t: number): void {
    // Overlapping 4 s notes every 2 s give a steady bed.
    tone(sink, { at: t, freq: note(0) / 2, gain: 0.11, attack: 1.2, hold: 1.2, decay: 1.6 });
    tone(sink, { at: t, type: 'triangle', freq: note(3) / 2, gain: 0.05, attack: 1.2, hold: 1.2, decay: 1.6, filter: { type: 'lowpass', freq: 500 } });
    noise(sink, { at: t, gain: 0.015, attack: 1.0, hold: 1.0, decay: 1.4, filter: { type: 'bandpass', freq: 220, q: 3 } });
  }

  private ambienceStep(sink: Sink, t: number): void {
    if (Math.random() < 0.16) {
      const f = rand(4200, 4800);
      for (let j = 0; j < 3; j++) tone(sink, { at: t + j * 0.07, freq: f, gain: 0.012, attack: 0.004, decay: 0.03 });
    }
    if (Math.random() < 0.045) taiko(sink, t, 0.06, 0.8, 0.5);
  }

  private matchStep(sink: Sink, step: number, t: number): void {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const it = this.intensity;
    const level = 0.85 + 0.2 * it;

    const taikoSteps = [0, 6, 10];
    if (it > 0.5) taikoSteps.push(3, 13);
    if (it > 0.8 && bar % 4 === 3) taikoSteps.push(12, 14, 15);
    if (taikoSteps.includes(s)) taiko(sink, t, (s === 0 ? 0.62 : 0.45) * level, s === 0 ? 1 : 1.12);

    // The 16th-note pulse (every ~0.167 s); thinner at low intensity.
    if (s % 2 === 0 || it >= 0.35) {
      const accent = s % 4 === 0 ? (s % 8 === 4 ? 0.09 : 0.065) : 0.035;
      woodblock(sink, t, accent * level, s % 4 === 0 ? 1 : 1.25);
    }

    // Bass drone: a new overlapping note every bar keeps the level steady.
    if (s === 0) {
      tone(sink, { at: t, freq: note(0) / 2, gain: 0.1, attack: 0.6, hold: 1.6, decay: 1.6, filter: { type: 'lowpass', freq: 400 } });
      tone(sink, { at: t, type: 'triangle', freq: note(3) / 4, gain: 0.04, attack: 0.6, hold: 1.6, decay: 1.6, filter: { type: 'lowpass', freq: 300 } });
    }
    if (s === 0 || s === 10) {
      tone(sink, { at: t, type: 'triangle', freq: s === 0 ? note(0) / 2 : note(3) / 2, gain: 0.1 * level, attack: 0.005, decay: 0.35, filter: { type: 'lowpass', freq: 500 } });
    }
    if (s === 0 && bar % 4 === 0 && Math.random() < 0.55) this.flutePhrase(sink, t);
  }

  private flutePhrase(sink: Sink, t: number): void {
    const count = 3 + Math.floor(Math.random() * 3);
    let at = t + STEP.match * 2;
    let prev: number | undefined;
    for (let i = 0; i < count; i++) {
      const freq = note(10 + Math.floor(Math.random() * 6));
      const dur = STEP.match * [2, 3, 4, 6][Math.floor(Math.random() * 4)]!;
      flute(sink, at, freq, 0.06, dur, prev);
      prev = freq;
      at += dur;
    }
  }

  private startWind(at: number): void {
    const ctx = this.ctx;
    if (!ctx || this.wind) return;
    const dest = this.layers.get('ambience')!.gain;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 0.6;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.07;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 260;
    sweep.connect(sweepDepth);
    sweepDepth.connect(lp.frequency);
    const amp = ctx.createGain();
    amp.gain.value = 0.05;
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.11;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 0.025;
    gust.connect(gustDepth);
    gustDepth.connect(amp.gain);
    // A separate unmodulated gain so stopping can fade cleanly to zero.
    const fade = ctx.createGain();
    src.connect(lp);
    lp.connect(amp);
    amp.connect(fade);
    fade.connect(dest);
    for (const s of [src, sweep, gust]) s.start(at);
    this.wind = {
      sources: [src, sweep, gust],
      nodes: [src, lp, sweep, sweepDepth, amp, gust, gustDepth, fade],
      fade,
    };
  }

  private stopWind(at: number): void {
    const wind = this.wind;
    const ctx = this.ctx;
    if (!wind || !ctx) return;
    this.wind = null;
    const now = ctx.currentTime;
    const end = Math.max(at, now + 0.05);
    wind.fade.gain.setValueAtTime(1, now);
    wind.fade.gain.linearRampToValueAtTime(0, end - 0.02);
    for (const s of wind.sources) s.stop(end);
    wind.sources[0]!.onended = () => {
      for (const n of wind.nodes) n.disconnect();
    };
  }
}
