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

/** One <audio> element and its fader. Two of them crossfade, and the idle one loads ahead. */
interface Deck {
  el: HTMLAudioElement;
  gain: GainNode;
  bed: Bed | null;
  track: Track | null;
}

export class Music {
  private decks: Deck[] = [];
  /** the deck that is (or was last) sounding */
  private on = 0;
  private bed: Bed | null = null;
  private volume = 0.6;
  private ducked = false;
  private queue: Partial<Record<Bed, number[]>> = {};
  /** a song already loading on the idle deck for when its bed starts */
  private cued: { bed: Bed; track: Track } | null = null;
  /** bumped by every change, so a fade-out's pause can't land on what came after it */
  private epoch = 0;

  constructor(private readonly ctx: AudioContext) {}

  /** The <audio> elements and their route into the mix (once, on the first unlock). */
  attach(dest: AudioNode): void {
    if (this.decks.length) return;
    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.preload = 'auto';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.ctx.createMediaElementSource(el).connect(gain).connect(dest);
      const d: Deck = { el, gain, bed: null, track: null };
      // at a song's end, the next one in the bed (rather than the same one again)
      el.addEventListener('ended', () => {
        if (this.decks[this.on] === d && this.bed && d.bed === this.bed) this.load(d, this.bed, this.next(this.bed));
      });
      this.decks.push(d);
    }
  }

  /**
   * Called from a user gesture: iOS only lets an element play from code once it has played from a
   * touch, so each is started and stopped here (silently: their faders are at nothing).
   */
  prime(): void {
    for (const d of this.decks) {
      if (!d.el.paused || d.bed) continue;
      if (!d.el.src) d.el.src = SILENCE;
      d.el.play().then(
        () => {
          if (!d.bed) d.el.pause();
        },
        () => {},
      );
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    this.fade(this.decks[this.on], 0.15);
  }

  /** Start a bed (crossfading from whatever plays), or keep it if it is already playing. */
  play(bed: Bed): void {
    if (this.bed === bed || !this.decks.length) return;
    if (!this.tracks(bed).length) return this.stop();
    if (!this.bed) this.ducked = false;
    this.bed = bed;
    this.epoch++;
    const out = this.decks[this.on];
    // the song loading ahead on the idle deck, or the bed's next
    const track = this.cued?.bed === bed ? this.cued.track : this.next(bed);
    this.cued = null;
    let i = 1 - this.on;
    // nothing sounding on the current deck (not even a fade-out): it can take the song itself
    if (out.el.paused && this.decks[i].track !== track) i = this.on;
    const d = this.decks[i];
    if (d !== out) this.release(out, 0.25);
    this.on = i;
    if (d.track === track && d.el.src.endsWith(track.file)) {
      d.bed = bed;
      d.el.currentTime = 0;
      d.el.play().catch(() => {});
    } else this.load(d, bed, track);
    this.fade(d, 1.2, true);
  }

  /** Have the next song of a bed loading on the idle deck, so it starts the moment it is wanted. */
  cue(bed: Bed): void {
    if (!this.decks.length || this.cued?.bed === bed || this.bed === bed || !this.tracks(bed).length) return;
    const d = this.decks[1 - this.on];
    // still fading out: once it has stopped
    if (!d.el.paused) return void setTimeout(() => this.cue(bed), 1000);
    const track = this.next(bed);
    this.cued = { bed, track };
    d.bed = null;
    d.track = track;
    d.el.src = `music/${track.file}`;
    d.el.load();
  }

  /** Fade out and stop. */
  stop(fade = 2): void {
    if (!this.bed) return;
    this.bed = null;
    this.epoch++;
    this.release(this.decks[this.on], fade / 3);
  }

  duck(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    this.fade(this.decks[this.on], on ? 0.12 : 0.6);
  }

  get playing(): Bed | null {
    return this.bed;
  }

  private tracks(bed: Bed): Track[] {
    // CrazyGames runs ads: a non-commercial licence doesn't cover it
    return TRACKS[bed].filter((t) => t.commercial || platform.env !== 'crazygames');
  }

  /** The bed's next song: through all of them in a shuffled order, then a new order. */
  private next(bed: Bed): Track {
    const list = this.tracks(bed);
    let q = this.queue[bed];
    if (!q || !q.length) q = this.queue[bed] = shuffled(list.length);
    return list[q.shift()! % list.length];
  }

  private load(d: Deck, bed: Bed, track: Track): void {
    d.bed = bed;
    d.track = track;
    d.el.src = `music/${track.file}`;
    d.el.currentTime = 0;
    d.el.play().catch(() => {});
  }

  /** Fade a deck out and pause it, unless something has taken it over by then. */
  private release(d: Deck, tau: number): void {
    const e = this.epoch;
    const now = this.ctx.currentTime;
    d.gain.gain.cancelScheduledValues(now);
    d.gain.gain.setValueAtTime(d.gain.gain.value, now);
    d.gain.gain.setTargetAtTime(0, now, tau);
    d.bed = null;
    setTimeout(
      () => {
        if (e === this.epoch || this.decks[this.on] !== d) d.el.pause();
      },
      tau * 3000 + 100,
    );
  }

  /** Glide a deck to where its level should be now (from silence when `fromZero`). */
  private fade(d: Deck | undefined, tau: number, fromZero = false): void {
    if (!d) return;
    const now = this.ctx.currentTime;
    const to = this.bed && d.bed === this.bed ? LEVEL * BED_LEVEL[this.bed] * this.volume * (this.ducked ? DUCK : 1) : 0;
    d.gain.gain.cancelScheduledValues(now);
    d.gain.gain.setValueAtTime(fromZero ? 0 : d.gain.gain.value, now);
    d.gain.gain.setTargetAtTime(to, now, tau);
  }
}
