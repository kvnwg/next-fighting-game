/** All sound is synthesised with WebAudio, so the game ships with zero audio assets. */
import { settings } from './settings';

type Sfx =
  | 'swing'
  | 'heavySwing'
  | 'deflect'
  | 'block'
  | 'hit'
  | 'guardBreak'
  | 'deathblow'
  | 'perilous'
  | 'dodge'
  | 'jump'
  | 'mikiri'
  | 'feint'
  | 'step'
  | 'click'
  | 'matchFound'
  | 'countdown'
  | 'fight'
  | 'victory'
  | 'defeat'
  | 'burn'
  | 'blink'
  | 'buff'
  | 'death';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.setVolume(settings.volume);
  }

  private volume = settings.volume;
  private mutedBy = new Set<string>();

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = this.mutedBy.size ? 0 : v * 0.6;
  }

  /** Mute for a reason (the platform's setting, an ad playing) until every reason is lifted. */
  setMuted(reason: string, on: boolean): void {
    if (on) this.mutedBy.add(reason);
    else this.mutedBy.delete(reason);
    this.setVolume(this.volume);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0, dest?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, gain: number, filter: BiquadFilterType, f0: number, f1: number, q = 1, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bq = ctx.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** Metallic ring: a cluster of inharmonic partials. */
  private ring(base: number, dur: number, gain: number): void {
    for (const [ratio, amp] of [
      [1, 1],
      [2.76, 0.6],
      [5.4, 0.4],
      [8.93, 0.25],
    ]) {
      this.tone('sine', base * ratio, base * ratio * 0.995, dur * (1.2 - ratio * 0.08), gain * amp);
    }
  }

  /** volume scales with distance from the listener (0..1) */
  play(name: Sfx, volume = 1): void {
    if (!this.ctx || !this.master || volume <= 0.01) return;
    const v = Math.min(1, volume);
    switch (name) {
      case 'swing':
        this.noiseBurst(0.16, 0.35 * v, 'bandpass', 900, 3200, 1.4);
        break;
      case 'heavySwing':
        this.noiseBurst(0.3, 0.45 * v, 'bandpass', 400, 1600, 1.2);
        break;
      case 'deflect':
        this.ring(1250 + Math.random() * 150, 0.6, 0.35 * v);
        this.noiseBurst(0.05, 0.6 * v, 'highpass', 4000, 6000);
        this.tone('square', 2400, 1800, 0.05, 0.08 * v);
        break;
      case 'block':
        this.ring(520, 0.25, 0.25 * v);
        this.noiseBurst(0.08, 0.5 * v, 'bandpass', 1800, 900, 0.8);
        break;
      case 'hit':
        this.tone('triangle', 160, 50, 0.18, 0.6 * v);
        this.noiseBurst(0.12, 0.5 * v, 'lowpass', 2200, 300);
        break;
      case 'guardBreak':
        this.ring(300, 0.9, 0.35 * v);
        this.tone('sawtooth', 200, 60, 0.5, 0.25 * v);
        this.noiseBurst(0.3, 0.5 * v, 'lowpass', 3000, 200);
        break;
      case 'deathblow':
        this.tone('sawtooth', 120, 30, 0.6, 0.5 * v);
        this.tone('square', 60, 30, 0.7, 0.3 * v);
        this.noiseBurst(0.5, 0.7 * v, 'lowpass', 5000, 150);
        break;
      case 'perilous':
        this.tone('sawtooth', 110, 105, 0.5, 0.25 * v);
        this.tone('square', 880, 870, 0.35, 0.08 * v, 0.02);
        this.ring(660, 0.6, 0.2 * v);
        break;
      case 'mikiri':
        this.tone('square', 90, 40, 0.3, 0.4 * v);
        this.ring(900, 0.5, 0.3 * v);
        break;
      case 'dodge':
        this.noiseBurst(0.22, 0.25 * v, 'bandpass', 600, 2000, 0.7);
        break;
      case 'jump':
        this.noiseBurst(0.12, 0.15 * v, 'lowpass', 900, 300);
        break;
      case 'feint':
        this.tone('triangle', 500, 900, 0.12, 0.12 * v);
        break;
      case 'step':
        this.noiseBurst(0.05, 0.06 * v, 'lowpass', 500, 200);
        break;
      case 'click':
        this.tone('square', 900, 1200, 0.04, 0.06);
        break;
      case 'matchFound':
        [523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f, 0.14, 0.12, i * 0.09));
        break;
      case 'countdown':
        this.tone('square', 660, 660, 0.12, 0.12);
        break;
      case 'fight':
        this.tone('square', 990, 990, 0.35, 0.14);
        this.ring(495, 0.8, 0.2);
        break;
      case 'victory':
        [523, 659, 784, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f, 0.18, 0.12, i * 0.12));
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.3, 0.16, i * 0.2));
        break;
      case 'burn':
        this.noiseBurst(0.2, 0.15 * v, 'bandpass', 1200, 600, 0.5);
        break;
      case 'blink':
        this.tone('sine', 1400, 300, 0.25, 0.15 * v);
        this.noiseBurst(0.2, 0.15 * v, 'highpass', 3000, 1000);
        break;
      case 'buff':
        this.tone('sawtooth', 150, 300, 0.5, 0.25 * v);
        this.tone('sawtooth', 152, 302, 0.5, 0.2 * v);
        break;
      case 'death':
        this.tone('triangle', 300, 60, 0.8, 0.3 * v);
        break;
    }
  }
}

export const audio = new AudioEngine();
export type { Sfx };
