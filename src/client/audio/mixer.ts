/**
 * The mix: every sound plays as a voice (its own gain, distance filter and stereo pan) into the
 * world bus or, for the execution cinematic, the hero bus that the world ducks under. Both, and a
 * send into a generated-impulse-response reverb, sum into a glue compressor, a limiter and a soft
 * clipper before the master volume, so nothing can clip however much is going on.
 *
 * It works on any BaseAudioContext: the live game uses an AudioContext, the audio renders an
 * OfflineAudioContext.
 */
import { NoiseBank, Out, RoomOpts, makeIR, makeNoise } from './synth';

export interface VoiceOpts {
  /** linear gain on the voice */
  gain: number;
  /** -1 (left) .. 1 (right) */
  pan?: number;
  /** reverb send 0..1 */
  wet?: number;
  /** on the hero bus: not ducked */
  hero?: boolean;
  /** lowpass cutoff for distance (Hz); omitted: no filter */
  air?: number;
  /** start time (default: now, plus a hair so scheduling never lands in the past) */
  t?: number;
}

export interface Voice {
  out: Out;
  input: GainNode;
  /** fade the voice out (and everything still scheduled on it) */
  stop(fade?: number): void;
}

export interface Room extends RoomOpts {
  /** overall reverb return */
  wet: number;
}

export const ROOMS: Record<string, Room> = {
  // open air: a short, faint slap off the ground and whatever's near
  open: { dur: 1.1, decay: 0.9, damp: 0.7, pre: 0.012, early: 0.25, wet: 0.5 },
  // stone courtyards and ruins: brighter, longer
  stone: { dur: 1.8, decay: 1.5, damp: 0.5, pre: 0.018, early: 0.4, wet: 0.7 },
  // the forge: a hall of iron and stone
  hall: { dur: 2.2, decay: 1.9, damp: 0.45, pre: 0.022, early: 0.5, wet: 0.8 },
  // a bamboo grove: dense and dark
  grove: { dur: 1.3, decay: 1.0, damp: 0.8, pre: 0.01, early: 0.3, wet: 0.55 },
  // a mountain top or a gorge: a long, distant echo
  valley: { dur: 2.6, decay: 2.2, damp: 0.75, pre: 0.045, early: 0.15, wet: 0.6 },
};

export class Mixer {
  readonly noise: NoiseBank;
  readonly world: GainNode;
  readonly hero: GainNode;
  readonly master: GainNode;
  private readonly send: GainNode;
  private readonly verb: ConvolverNode;
  private readonly ret: GainNode;
  private room = '';

  constructor(
    readonly ctx: BaseAudioContext,
    dest: AudioNode = ctx.destination,
  ) {
    this.noise = makeNoise(ctx);
    const sum = ctx.createGain();
    this.world = ctx.createGain();
    this.hero = ctx.createGain();
    this.world.connect(sum);
    this.hero.connect(sum);
    this.send = ctx.createGain();
    this.verb = ctx.createConvolver();
    this.ret = ctx.createGain();
    this.send.connect(this.verb).connect(this.ret).connect(sum);
    // the glue: gentle, slow enough to keep the transients
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 8;
    glue.ratio.value = 3;
    glue.attack.value = 0.006;
    glue.release.value = 0.22;
    // the limiter: fast and hard, catching the pile-ups
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -5;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.12;
    // and a soft clipper after it, so a sample can never go past full scale
    const clip = ctx.createWaveShaper();
    clip.curve = softClip();
    clip.oversample = '2x';
    const pre = ctx.createGain();
    pre.gain.value = 1 / 1.6;
    this.master = ctx.createGain();
    sum.connect(glue).connect(lim).connect(pre).connect(clip).connect(this.master).connect(dest);
    this.setRoom('open');
  }

  setRoom(id: string): void {
    const r = ROOMS[id] ?? ROOMS.open;
    if (id === this.room) return;
    this.room = id;
    this.verb.buffer = makeIR(this.ctx, r);
    this.ret.gain.value = r.wet;
  }

  voice(v: VoiceOpts): Voice {
    const ctx = this.ctx;
    const t = v.t ?? ctx.currentTime + 0.005;
    const input = ctx.createGain();
    input.gain.value = v.gain;
    let last: AudioNode = input;
    if (v.air && v.air < 16000) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = v.air;
      lp.Q.value = 0.5;
      last = last.connect(lp);
    }
    if (v.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, v.pan));
      last = last.connect(p);
    }
    last.connect(v.hero ? this.hero : this.world);
    if (v.wet && v.wet > 0) {
      const s = ctx.createGain();
      s.gain.value = v.wet;
      last.connect(s).connect(this.send);
    }
    const out: Out = { ctx, dest: input, t, noise: this.noise, end: t };
    return {
      out,
      input,
      stop: (fade = 0.04) => {
        const now = ctx.currentTime;
        const g = input.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + fade);
      },
    };
  }

  /** Duck the world under a big moment: down to `depth` over `attack`, held, then back. */
  duck(depth: number, attack: number, hold: number, release: number, t = this.ctx.currentTime): void {
    const g = this.world.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(depth, t + attack);
    g.setValueAtTime(depth, t + attack + hold);
    g.linearRampToValueAtTime(1, t + attack + hold + release);
  }
}

/** Linear to 0.85, then a tanh knee that never passes 1 (the input is pre-scaled by 1/1.6). */
function softClip(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 1.6;
    const a = Math.abs(x);
    const y = a < 0.85 ? a : 0.85 + 0.15 * Math.tanh((a - 0.85) / 0.15);
    c[i] = Math.sign(x) * y;
  }
  return c;
}
