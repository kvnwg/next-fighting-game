/**
 * The deflect: one universal metal clang for every fighter, rebuilt from the game's parry in the
 * user's duel recordings (it re-uses the same sound whatever the weapons). A hard crack and a
 * shimmer that darkens as it dies, over a cluster of clash partials, then the "ting": its strongest
 * partial at 1.65-1.95 kHz with others at x1.26 / x1.41 / x1.6 / x1.89, swelling in over ~150 ms
 * with a ~10 Hz beat and ringing for about a second. Two partial families, as in the recordings.
 */
import { MAT } from './materials';
import type { GuardOpts } from './recipes';
import { ring } from './recipes';
import { Mode, Out, chance, filtered, jit, modal, noise, osc, pick, rand, scaled, thump } from './synth';

// ------------------------------------------------------------------ the clash families (from the duels)

export interface Clash {
  /** partials ringing from the instant of the clash: [ratio to the ting, amp, -60 dB decay (s)] */
  strike: readonly Mode[];
  /** the ting that swells in after it */
  ting: readonly Mode[];
}

export const CLASHES: readonly Clash[] = [
  // strongest partial ~1.9 kHz, then x1.26, x1.6, x1.41, x1.88, x2.12, x3.6
  {
    strike: [[1.26, 0.55, 0.9], [1.6, 0.45, 0.8], [2.12, 0.35, 0.6], [3.02, 0.25, 0.4], [3.58, 0.3, 0.7], [4.4, 0.2, 0.3]],
    ting: [[1, 1, 1.35], [1.26, 0.5, 1.2], [1.41, 0.18, 1.1], [1.6, 0.25, 1.05], [1.88, 0.17, 0.9], [2.12, 0.16, 0.8], [3.58, 0.1, 1.2]],
  },
  // strongest partial ~1.7 kHz, then x1.41, x1.89, x1.98, x3.02, x3.6
  {
    strike: [[1.41, 0.5, 0.9], [1.89, 0.45, 0.8], [2.7, 0.3, 0.5], [3.02, 0.3, 0.45], [3.6, 0.35, 0.8], [4.6, 0.15, 0.3]],
    ting: [[1, 1, 1.5], [1.414, 0.5, 1.35], [1.89, 0.38, 1.0], [1.98, 0.12, 0.9], [3.02, 0.09, 0.55], [3.6, 0.1, 1.2]],
  },
];

/** The ting's lowest partial (Hz): 1.65-1.95 kHz in the recordings. */
export const tingBase = (): number => rand(1650, 1950);

/** The crack of steel meeting steel and the shimmer off it, which darkens as it dies. */
export function crack(o0: Out, gain: number, shimmer: number, len: number): void {
  // all of it above ~1.8 kHz: the clash has no body of its own
  const o = filtered(o0, 'highpass', 1800);
  noise(o, { type: 'highpass', f: jit(2600, 0.1), q: 0.7, dur: 0.018, gain, a: 0.0004 });
  noise(o, { type: 'bandpass', f: jit(6000, 0.1), q: 0.6, dur: 0.045, gain: gain * 1.4, a: 0.0006, type2: 'lowpass', f2: 11000 });
  noise(o, { type: 'lowpass', f: rand(11000, 12500), f1: rand(2600, 3200), q: 0.7, dur: len, gain: shimmer, a: 0.0008, type2: 'highpass', f2: 1500 });
}

/** One swelling partial of the ting: two detuned sines (the beat), blooming in and ringing out. */
function swellPartial(o: Out, f: number, amp: number, t60: number, peak: number, beat: number): void {
  const dur = peak + t60 * 0.75;
  const pk = peak / dur;
  const env = (x: number) => {
    if (x < pk) return 0.25 + 0.75 * Math.pow(x / pk, 1.6);
    const t = (x - pk) * dur;
    return Math.exp((-6.9 * t) / t60);
  };
  osc(o, { f, dur, gain: amp, shape: env });
  osc(o, { f: f + beat, dur, gain: amp * 0.7, shape: env });
}

const G_DEFLECT = 6.0;

/** The deflect clang. Back-to-back deflects ring a little higher and louder each time. */
export function deflectClang(o0: Out, s: GuardOpts): void {
  const streak = Math.max(1, s.streak ?? 1);
  const o = scaled(o0, G_DEFLECT * (1 + 0.07 * (Math.min(4, streak) - 1)));
  const h = s.heavy ? 1 : 0.8;
  const up = 1 + 0.02 * Math.min(4, streak - 1);
  const c = pick(CLASHES);
  const f1 = tingBase() * up;
  // the crack, and the shimmer off it
  crack(o, 1.4, 0.7, rand(0.36, 0.44));
  // the clash partials, ringing from the instant of contact
  modal(o, { base: f1, modes: c.strike, gain: 0.2, jitter: 0.015, hard: 1, beat: 3 });
  // the ting: blooming over ~150 ms with a ~10 Hz beat, ringing for about a second
  const peak = rand(0.12, 0.17);
  for (const [r, amp, t60] of c.ting) swellPartial(o, f1 * r * jit(1, 0.006), amp * 0.028, t60 * 0.8 * jit(1, 0.1), peak * jit(1, 0.15), rand(7, 12) * (chance(0.5) ? 1 : -1));
  // the weight of it
  thump(o, 110, 48, 0.24, 0.45 * h);
  // a streak sings higher still
  if (streak >= 3) ring(o, MAT.rapier, 0.1, { pitch: 1.5, decay: 1.1 });
}
