/**
 * The music: a bed for the fighter select and one for the fight, from the starting walk into the
 * ring to the result. The songs are files in public/music (next to the page), streamed through an
 * <audio> element routed into the mix: a five-minute song decoded whole would be over 100 MB.
 * Every song here needs its credit shown (the help page lists them, see CREDITS.md); `commercial`
 * is false for the ones whose licence rules out a build that earns money (ads, a store).
 */
import { platform } from '../platform';

export interface Track {
  file: string;
  title: string;
  artist: string;
  licence: string;
  /** the licence page, or where the artist says how it may be used */
  link: string;
  commercial: boolean;
}

export type Bed = 'lobby' | 'select' | 'combat';

export const TRACKS: Record<Bed, Track[]> = {
  // the shrine plaza and the open ground around it, where anyone can be fought
  lobby: [{ file: 'reborn.mp3', title: 'Reborn', artist: 'Alex Productions', licence: 'CC BY 3.0', link: 'https://creativecommons.org/licenses/by/3.0/', commercial: true }],
  // a 24-second cut of it: the select screen only lasts ten
  select: [{ file: 'dragon-castle.mp3', title: 'Dragon Castle', artist: 'Makai Symphony', licence: 'CC BY-NC 3.0', link: 'https://creativecommons.org/licenses/by-nc/3.0/', commercial: false }],
  combat: [
    { file: 'thunder-unison.mp3', title: 'Thunder Unison', artist: 'Keys Of Moon', licence: 'CC BY 3.0', link: 'https://creativecommons.org/licenses/by/3.0/', commercial: true },
    { file: 'good-day-to-die.mp3', title: 'Good Day To Die', artist: 'Miguel Johnson', licence: 'CC BY 3.0', link: 'https://creativecommons.org/licenses/by/3.0/', commercial: true },
    { file: 'six-coffin-nails.mp3', title: 'Six Coffin Nails', artist: 'Kerosyn', licence: 'CC BY-NC 3.0', link: 'https://creativecommons.org/licenses/by-nc/3.0/', commercial: false },
    { file: 'dystopia.mp3', title: 'Dystopia', artist: 'Per Kiilstofte', licence: 'free with credit, non-commercial', link: 'https://www.breakingcopyright.com/artist/per-kiilstofte', commercial: false },
  ],
};

/** a one-sample WAV, for priming the element without fetching a song */
const SILENCE = (() => {
  const b = new Uint8Array(45);
  const v = new DataView(b.buffer);
  const tag = (at: number, s: string) => [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)));
  tag(0, 'RIFF');
  v.setUint32(4, 37, true);
  tag(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  tag(36, 'data');
  v.setUint32(40, 1, true);
  b[44] = 128;
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...b))}`;
})();

/** The songs are mastered loud (about -15.5 LUFS): this sits them under the fight. */
const LEVEL = 0.5;
/** each bed's level against the fight's */
const BED_LEVEL: Record<Bed, number> = { lobby: 0.8, select: 1, combat: 1 };
/** under an execution, so the finisher carries */
const DUCK = 0.45;

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Music {
  private el: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private bed: Bed | null = null;
  private track: Track | null = null;
  private volume = 0.6;
  private ducked = false;
  private queue: Partial<Record<Bed, number[]>> = {};
  /** bumped by every change, so a fade-out's pause can't land on what came after it */
  private epoch = 0;

  constructor(private readonly ctx: AudioContext) {}

  /** The <audio> element and its route into the mix (once, on the first unlock). */
  attach(dest: AudioNode): void {
    if (this.el) return;
    const el = new Audio();
    el.preload = 'auto';
    el.addEventListener('ended', () => {
      // the next song in the bed rather than the same one again
      if (this.bed) this.load(this.bed);
    });
    const g = this.ctx.createGain();
    g.gain.value = 0;
    this.ctx.createMediaElementSource(el).connect(g).connect(dest);
    this.el = el;
    this.gain = g;
  }

  /**
   * Called from a user gesture: iOS only lets an element play from code once it has played from a
   * touch, so it is started and stopped here (silently: the gain is at nothing).
   */
  prime(): void {
    const el = this.el;
    if (!el || !el.paused || this.bed) return;
    if (!el.src) el.src = SILENCE;
    el.play().then(
      () => {
        if (!this.bed) el.pause();
      },
      () => {},
    );
  }

  setVolume(v: number): void {
    this.volume = v;
    this.ramp(0.15);
  }

  /** Start a bed (fading in), or keep it if it is already playing. */
  play(bed: Bed): void {
    if (this.bed === bed || !this.el) return;
    if (!this.tracks(bed).length) return this.stop();
    const from = this.bed;
    this.bed = bed;
    const e = ++this.epoch;
    const start = () => {
      if (e !== this.epoch) return;
      this.load(bed);
      this.ramp(1.2, true);
    };
    if (!from) this.ducked = false;
    // nothing sounding (or only the priming blip): straight in
    if (this.el.paused || this.el.src === SILENCE) return start();
    // out of whatever is still playing (another bed, or one fading out) quickly, then in
    const g = this.gain!;
    g.gain.cancelScheduledValues(this.ctx.currentTime);
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
    setTimeout(start, 450);
  }

  /** Fade out and stop. */
  stop(fade = 2): void {
    if (!this.bed) return;
    this.bed = null;
    const e = ++this.epoch;
    this.ramp(fade / 3);
    setTimeout(() => {
      if (e === this.epoch) this.el?.pause();
    }, fade * 1000);
  }

  duck(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    this.ramp(on ? 0.12 : 0.6);
  }

  get playing(): Bed | null {
    return this.bed;
  }

  private tracks(bed: Bed): Track[] {
    // CrazyGames runs ads: a non-commercial licence doesn't cover it
    return TRACKS[bed].filter((t) => t.commercial || platform.env !== 'crazygames');
  }

  private load(bed: Bed): void {
    const el = this.el!;
    const list = this.tracks(bed);
    let q = this.queue[bed];
    if (!q || !q.length) q = this.queue[bed] = shuffled(list.length);
    this.track = list[q.shift()!];
    el.src = `music/${this.track.file}`;
    el.currentTime = 0;
    el.play().catch(() => {});
  }

  /** Glide the level to where it should be now (from silence when `fromZero`). */
  private ramp(tau: number, fromZero = false): void {
    const g = this.gain;
    if (!g) return;
    const now = this.ctx.currentTime;
    const to = this.bed ? LEVEL * BED_LEVEL[this.bed] * this.volume * (this.ducked ? DUCK : 1) : 0;
    g.gain.cancelScheduledValues(now);
    if (fromZero) g.gain.setValueAtTime(0, now);
    else g.gain.setValueAtTime(g.gain.value, now);
    g.gain.setTargetAtTime(to, now, tau);
  }
}
