import type { IntroSfx } from './intro-sfx.ts';
import { MusicDirector } from './music.ts';
import { CATEGORY, RECIPES, VOICE_CAPS, type SfxCategory } from './sfx.ts';
import { createNoiseBuffer, type Sink } from './synth.ts';

export type SfxName =
  | 'swing'
  | 'hit'
  | 'block'
  | 'parry'
  | 'guardbreak'
  | 'knockdown'
  | 'telegraph'
  | 'dodge'
  | 'jump'
  | 'land'
  | 'parryWhiff'
  | 'tick'
  | 'tickFinal'
  | 'select'
  | 'confirm'
  | 'roundStart'
  | 'fight'
  | 'ko'
  | 'whoosh'
  | 'thump'
  | IntroSfx;

export interface SfxOptions {
  /** Stereo position, -1 (left) to 1 (right). */
  pan?: number;
  weaponClass?: 'blade' | 'blunt';
  kind?: 'light' | 'heavy' | 'critical' | 'plunge';
  /** 0..1, default 0.6. */
  intensity?: number;
}

// Bus levels: effects sit roughly 10 dB above the music, single hits peak
// around -4 dBFS so the limiter only works when sounds pile up.
const SFX_LEVEL = 0.7;
const MUSIC_LEVEL = 0.24;
// Output ceiling after the limiter, about -1 dBFS.
const CEILING = 0.89;
const VARIANTS = 4;

interface Voice {
  category: SfxCategory;
  out: GainNode;
  pan: StereoPannerNode | null;
  sources: AudioScheduledSourceNode[];
  end: number;
  stolen: boolean;
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

export class AudioEngine {
  readonly music: MusicDirector;
  private readonly mobile: boolean;
  private ctx: AudioContext | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private duck: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private voices: Voice[] = [];
  private readonly lastVariant = new Map<SfxName, number>();
  private muted = false;
  private volumes = { master: 1, music: 1, sfx: 1 };

  constructor(opts: { mobile?: boolean } = {}) {
    this.mobile = opts.mobile ?? false;
    this.music = new MusicDirector();
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Current limiter gain reduction in dB (0 = idle); handy for checking the mix. */
  get limiterReduction(): number {
    return this.limiter?.reduction ?? 0;
  }

  /**
   * Creates the AudioContext on first call and resumes it on every call. Must run
   * inside a user gesture (tap, click, key); iOS also needs it again after interruptions.
   */
  unlock(): void {
    if (!this.ctx) {
      const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build(this.ctx);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMaster(0.004);
  }

  setVolumes(v: { master?: number; music?: number; sfx?: number }): void {
    const clamp = (x: number | undefined, fallback: number) => (x === undefined ? fallback : Math.min(1, Math.max(0, x)));
    this.volumes = {
      master: clamp(v.master, this.volumes.master),
      music: clamp(v.music, this.volumes.music),
      sfx: clamp(v.sfx, this.volumes.sfx),
    };
    this.applyMaster(0.03);
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.sfxBus) return;
    this.musicBus.gain.setTargetAtTime(MUSIC_LEVEL * this.volumes.music, ctx.currentTime, 0.03);
    this.sfxBus.gain.setTargetAtTime(SFX_LEVEL * this.volumes.sfx, ctx.currentTime, 0.03);
  }

  play(name: SfxName, opts: SfxOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.noiseBuffer || !this.sfxBus) return;
    const now = ctx.currentTime;
    const category = CATEGORY[name];
    this.reap(now);
    this.makeRoom(category, now);

    const voice = this.createVoice(ctx, this.sfxBus, category, opts.pan ?? 0);
    const sink: Sink = {
      ctx,
      dest: voice.out,
      noise: this.noiseBuffer,
      track: (src, stopAt) => {
        voice.sources.push(src);
        voice.end = Math.max(voice.end, stopAt);
      },
    };
    const intensity = Math.min(1, Math.max(0, opts.intensity ?? 0.6));
    const volume = 10 ** ((Math.random() * 4 - 2) / 20);
    RECIPES[name](sink, {
      at: now + 0.004,
      pitch: 1 + (Math.random() * 2 - 1) * 0.05,
      gain: volume * (0.55 + 0.75 * intensity),
      variant: this.pickVariant(name),
      weaponClass: opts.weaponClass ?? 'blade',
      kind: opts.kind ?? 'light',
      mobile: this.mobile,
    });
    this.voices.push(voice);
  }

  duckMusic(db: number, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.duck) return;
    const now = ctx.currentTime;
    const target = 10 ** (-Math.abs(db) / 20);
    const g = this.duck.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + 0.04);
    g.setValueAtTime(target, now + 0.04 + Math.max(0, seconds));
    g.linearRampToValueAtTime(1, now + 0.34 + Math.max(0, seconds));
  }

  private build(ctx: AudioContext): void {
    this.noiseBuffer = createNoiseBuffer(ctx, 2);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.12;
    this.limiter = limiter;
    const ceiling = ctx.createGain();
    ceiling.gain.value = CEILING;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volumes.master;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = SFX_LEVEL * this.volumes.sfx;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = MUSIC_LEVEL * this.volumes.music;
    this.duck = ctx.createGain();
    const musicIn = ctx.createGain();

    musicIn.connect(this.duck);
    this.duck.connect(this.musicBus);
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(limiter);
    limiter.connect(ceiling);
    ceiling.connect(ctx.destination);

    // Older iOS only fully unlocks after a buffer plays inside the gesture.
    const kick = ctx.createBufferSource();
    kick.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    kick.connect(ctx.destination);
    kick.start(0);

    this.music.attach(ctx, musicIn, this.noiseBuffer);
  }

  private applyMaster(timeConstant: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const g = this.master.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setTargetAtTime(this.muted ? 0 : this.volumes.master, ctx.currentTime, timeConstant);
  }

  private createVoice(ctx: AudioContext, bus: AudioNode, category: SfxCategory, pan: number): Voice {
    const out = ctx.createGain();
    let panner: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function' && pan !== 0) {
      panner = ctx.createStereoPanner();
      panner.pan.value = Math.min(1, Math.max(-1, pan));
      out.connect(panner);
      panner.connect(bus);
    } else {
      out.connect(bus);
    }
    return { category, out, pan: panner, sources: [], end: ctx.currentTime, stolen: false };
  }

  private pickVariant(name: SfxName): number {
    const last = this.lastVariant.get(name) ?? -1;
    let v = Math.floor(Math.random() * VARIANTS);
    if (v === last) v = (v + 1 + Math.floor(Math.random() * (VARIANTS - 1))) % VARIANTS;
    this.lastVariant.set(name, v);
    return v;
  }

  /** Disconnects voices whose sources have all finished. */
  private reap(now: number): void {
    this.voices = this.voices.filter((v) => {
      if (v.end > now) return true;
      v.out.disconnect();
      v.pan?.disconnect();
      return false;
    });
  }

  /** Steals the oldest voices in a category until a new one fits under the cap. */
  private makeRoom(category: SfxCategory, now: number): void {
    const cap = VOICE_CAPS[category][this.mobile ? 1 : 0];
    const active = this.voices.filter((v) => v.category === category && !v.stolen);
    let excess = active.length - cap + 1;
    for (const v of active) {
      if (excess <= 0) break;
      excess--;
      const g = v.out.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.015);
      for (const src of v.sources) {
        try {
          src.stop(now + 0.02);
        } catch {
          // already stopped
        }
      }
      v.end = now + 0.02;
      v.stolen = true;
    }
  }
}
