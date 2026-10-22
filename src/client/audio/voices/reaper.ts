/**
 * The Wraith's voice: a kusarigama (a sickle on a chain), matched to the chain-sickle reference
 * recording and, for the clashes and the landed blows, to the duel recordings from the same game.
 *
 * What the references do:
 *  - a cast through the air is not a swept whoosh. It starts hard (the whole band from ~400 Hz to
 *    16 kHz arrives within ~20 ms), with a short mid "whomp" at 400-1200 Hz for the first ~80 ms,
 *    then a long bright hiss (strongest at 6-12 kHz, a 4-6 dB dip at 1-4 kHz) that holds for
 *    ~0.2 s and falls away by ~0.45 s (light) or ~0.6 s (heavy). The hiss comes and goes faintly at
 *    ~13 Hz (the chain whirling), and a few thin, steady lines at 8-10 kHz ride on it;
 *  - a landed blow is a hard broadband crack peaking at 3-6 kHz, a mid thwack and a low thud under
 *    it, a noisy tail ~10 dB down for ~0.25 s, and on the bigger blows a metallic "shing" of
 *    partials near 4.9 and 6.1 kHz ringing for ~0.25 s;
 *  - the parry is a hard "tsk" with a flash of very high partials (6-10.5 kHz, gone in ~50 ms),
 *    then a ring whose strongest partial (1.66-1.93 kHz) swells for 0.2-0.35 s before it fades, its
 *    partners at 1.41, 1.89 and 2.34 times it fading sooner; ~0.9 s in all.
 */
import { MAT } from '../materials';
import type { Profile } from '../profiles';
import type { GuardOpts, HitOpts, Striker, SwingOpts } from '../recipes';
import { bodyLayer, click, gore, ring, striker, strikerRing } from '../recipes';
import { Out, at, chance, clamp, filtered, jit, modal, noise, osc, rand, rattle, scaled, tear, thump, via } from '../synth';
import type { Voice } from '../voices';

/** Loudness trims, balanced against the shared recipes' renders. */
const TRIM = { swing: 0.22, hit: 1.0, block: 1.0, deflect: 3.2 };

/** An envelope that rises over `a` (fraction of the length), holds near the top until `h`, then falls away. */
const plateau = (a: number, h: number, k = 2.2) => (x: number): number => {
  if (x < a) return x / a;
  if (x < h) return 1 - 0.35 * ((x - a) / (h - a));
  return 0.65 * Math.pow(Math.max(0, 1 - (x - h) / (1 - h)), k);
};

/** A partial that swells to its peak at `pk` (fraction of the length) and then rings away. */
const swell = (pk: number, from: number) => (x: number): number =>
  x < pk ? from + (1 - from) * Math.sin((Math.PI / 2) * (x / pk)) : Math.exp((-6.9 * (x - pk)) / (1 - pk));

/** The chain whirling: a gain stage wobbled at `hz`, `depth` deep. */
function whirled(o: Out, hz: number, depth: number, dur: number): Out {
  const am = o.ctx.createGain();
  am.gain.value = 1 - depth;
  const lfo = o.ctx.createOscillator();
  lfo.frequency.value = hz;
  const lg = o.ctx.createGain();
  lg.gain.value = depth;
  lfo.connect(lg).connect(am.gain);
  lfo.start(o.t);
  lfo.stop(o.t + dur + 0.1);
  return via(o, am);
}

// ------------------------------------------------------------------ swing

function swing(o0: Out, p: Profile, s: SwingOpts): void {
  const heavy = !!s.heavy;
  const anim = s.anim;
  const wide = anim === 'spin' || anim === 'sweep';
  const o = scaled(o0, TRIM.swing * p.swing.gain);
  const len = (heavy ? 0.62 : 0.47) * (wide ? 1.2 : 1) * jit(1, 0.1);
  const air = whirled(o, jit(p.swing.whirl ?? 13, 0.12), 0.22, len);
  // the cast leaves the hand: everything at once
  noise(o, { type: 'highpass', f: jit(1400, 0.15), q: 0.6, dur: 0.035, gain: 0.32, a: 0.003 });
  // the whomp of the weight leaving, falling as it goes
  noise(o, { color: 'pink', type: 'bandpass', f: jit(800, 0.12), f1: jit(450, 0.12), q: 1.0, dur: rand(0.11, 0.14), gain: heavy ? 2.0 : 2.5, a: 0.006 });
  // the long bright hiss: rises in ~20 ms, holds, then falls away
  const hold = rand(0.38, 0.48);
  // under it, the whole band (the reference is near pink from 300 Hz up), dying sooner than the top
  noise(air, { color: 'pink', type: 'bandpass', f: jit(850, 0.1), q: 0.35, dur: len * 0.8, gain: 1.9, shape: plateau(0.04, hold * 0.7, 2.6) });
  noise(air, { type: 'bandpass', f: jit(9000, 0.1), f1: jit(7800, 0.1), q: 0.55, type2: 'highpass', f2: 3500, dur: len, gain: 0.32, shape: plateau(0.04, hold) });
  // the lower half of it, kept a few dB down (the dip at 1-4 kHz)
  noise(air, { color: 'pink', type: 'bandpass', f: jit(2600, 0.1), q: 0.7, dur: len * 0.85, gain: 0.06, shape: plateau(0.05, hold * 0.8) });
  // the thin lines riding on it
  const lines = heavy ? 3 : 2;
  for (let i = 0; i < lines; i++)
    osc(air, { f: rand(7600, 10400), dur: len * rand(0.6, 0.9), gain: rand(0.006, 0.011), shape: plateau(0.05, hold), fm: [rand(4, 9), rand(10, 30)] });
  // the links, whirling
  rattle(o, { count: heavy ? 16 : 11, spread: len * 0.7, fLo: 3000, fHi: 8000, decay: 0.03, fade: 1.2, whirl: p.swing.whirl }, { gain: 0.22, type: 'highpass', f: 2500 });
  // the follow-through: the chain swinging back, the robe settling (cut when the blow lands)
  const ft = at(o, s.follow ?? len * 0.75);
  rattle(ft, { count: 7, spread: 0.2, fLo: 2600, fHi: 6500, decay: 0.035, fade: 2 }, { gain: 0.1, type: 'highpass', f: 2000, delay: 0.02 });
  noise(ft, { color: 'pink', type: 'bandpass', f: 700, f1: 380, q: 0.8, dur: 0.2, gain: heavy ? 0.16 : 0.11, shape: plateau(0.3, 0.4, 1.5) });
}

// ------------------------------------------------------------------ hit

/** The game's landed blow: the crack, the thwack, the thud and the noisy tail after it. */
function strike(o: Out, h: number, heavy: boolean): void {
  noise(o, { type: 'highpass', f: jit(1500, 0.15), q: 0.6, dur: 0.05, gain: 1.2 * h + 0.45, a: 0.001, hold: 0.012 });
  noise(o, { type: 'bandpass', f: jit(5800, 0.15), q: 0.8, dur: 0.075, gain: 1.6 * h + 0.55, a: 0.0015, hold: 0.015 });
  noise(o, { color: 'pink', type: 'bandpass', f: jit(800, 0.15), q: 1.2, dur: 0.07, gain: 0.9 * h + 0.3, a: 0.002 });
  // the tail: the air behind the blade, ~10 dB down, holding for a quarter second and then thinning
  noise(o, { type: 'bandpass', f: jit(5500, 0.12), f1: jit(3800, 0.1), q: 0.6, dur: rand(0.42, 0.5) * (heavy ? 1.15 : 1), gain: 0.09 * h + 0.03, delay: 0.02, shape: plateau(0.06, 0.45, 1.4) });
}

/** The sickle's "shing" as it bites: a few partials near 4.9 and 6.1 kHz. */
function shing(o: Out, gain: number): void {
  modal(o, { base: rand(4600, 5150), modes: [[1, 1, 0.32], [1.245, 0.75, 0.28], [1.58, 0.3, 0.18], [0.71, 0.25, 0.2]], gain, delay: 0.004, jitter: 0.02 });
}

/** The chain snapping straight behind the sickle as it lands. */
function chainIn(o: Out, h: number): void {
  rattle(o, { count: 8, spread: 0.11, fLo: 2600, fHi: 6500, decay: 0.035, fade: 2 }, { gain: 0.26 * h, type: 'highpass', f: 2000, delay: 0.008 });
}

function hit(o0: Out, a: Profile, d: Profile, s: HitOpts): void {
  // plate takes a shorter clank than the shared recipe's, so it sits a touch hotter
  const o = scaled(o0, TRIM.hit * (d.body === 'plate' ? 1.25 : 1));
  const heavy = !!s.heavy;
  const st: Striker = striker(a, s.anim, heavy);
  const h = (heavy ? 1 : 0.7) * (s.backstab ? 1.15 : 1);
  strike(o, h, heavy);
  if (d.body === 'plate') {
    // steel on armour: the plate's clank, the sickle ringing off it, the point skating
    ring(o, MAT.plate, 0.45 * h + 0.12, { pitch: d.plate / MAT.plate.base, hard: 0.9, decay: 0.6 });
    ring(o, st.mat, 0.12 * h + 0.04, { pitch: st.pitch, decay: 0.4, hard: 0.85 });
    shing(o, 0.05 + 0.05 * h);
    tear(o, rand(0.1, 0.16), { gain: 0.3 * h, type: 'bandpass', f: rand(3200, 4400), q: 2.5, delay: 0.006 }, 0.5);
    // mail and straps under it, the body inside
    rattle(o, { count: 6, spread: 0.12, fLo: 1800, fHi: 4500, decay: 0.04, fade: 2 }, { gain: 0.26 * h, delay: 0.01, type: 'highpass', f: 1500 });
    thump(o, 120 / Math.sqrt(d.weight), 48, 0.18, 0.45 * h, 0.004);
    // and the hooked point finds the gaps
    gore(at(o, 0.02), st, h, s.armor ? 0.15 : 0.3);
  } else {
    // the hooked blade drawn through: a bright slice falling away, the fibres parting
    noise(o, { type: 'bandpass', f: rand(5200, 6400), f1: rand(1600, 2100), q: 1.2, dur: rand(0.06, 0.085) * (0.8 + 0.4 * h), gain: 0.4 * h + 0.12, a: 0.001 });
    tear(o, rand(0.09, 0.14) * (0.8 + 0.4 * h), { gain: 0.3 * h + 0.1, type: 'bandpass', f: rand(2600, 3600), q: 0.7, delay: 0.004 });
    if (heavy || chance(0.35)) shing(o, heavy ? 0.07 : 0.04);
    ring(o, st.mat, 0.06 * h, { pitch: st.pitch, decay: 0.25, hard: 0.6 });
    // the bloody half
    gore(o, st, h, s.armor ? 0.25 : 0.7);
    bodyLayer(o, d, h * 1.2);
    thump(o, 150 / Math.sqrt(d.weight), 52, 0.2, (0.4 + 0.45 * st.mass) * h, 0.003);
  }
  if (s.armor) {
    thump(o, 72, 40, 0.3, 0.6 * h, 0.006);
    noise(o, { color: 'brown', type: 'lowpass', f: 320, dur: 0.25, gain: 0.5 * h });
  }
  if (s.tipper) ring(o, st.mat, 0.12, { pitch: st.pitch * 1.03, decay: 0.6 });
  chainIn(o, h);
}

// ------------------------------------------------------------------ guards

/** The parry's ring: the low partial swells, its partners fade sooner. Strongest partial ~1.66-1.93 kHz. */
function parryRing(o: Out, up: number, gain: number, dur: number, swelled: boolean): void {
  const b = rand(1700, 1980) * up;
  const parts: [ratio: number, amp: number, pk: number, len: number][] = [
    [1, 1, swelled ? rand(0.18, 0.33) : 0.002, dur],
    [1.26, 0.4, swelled ? rand(0.1, 0.2) : 0.002, dur * 0.7],
    [1.41, 0.45, swelled ? rand(0.1, 0.2) : 0.002, dur * 0.75],
    [1.89, 0.32, swelled ? rand(0.06, 0.15) : 0.002, dur * 0.65],
    [2.34, 0.24, swelled ? 0.04 : 0.002, dur * 0.5],
  ];
  for (const [r, amp, pk, len] of parts) {
    const f = b * r * jit(1, 0.01);
    const shape = swell(clamp(pk / len, 0.003, 0.6), swelled ? 0.3 : 0);
    osc(o, { f, dur: len, gain: gain * amp * jit(1, 0.15), shape });
    // its detuned twin: the shimmer of a long ring
    if (r < 1.5) osc(o, { f: f + rand(1.5, 3.5) * (chance(0.5) ? 1 : -1), dur: len, gain: gain * amp * 0.5, shape });
  }
}

/** The clash front: the "tsk" and a flash of very high partials gone in ~50 ms. */
function clash(o: Out, gain: number, bright: number): void {
  noise(o, { type: 'highpass', f: jit(2000, 0.15), q: 0.6, dur: 0.05, gain: 0.9 * gain, a: 0.0006, hold: 0.006 });
  click(o, 0.5 * gain, 5200, 0.012);
  modal(o, { base: rand(9500, 10500), modes: [[1, 1, 0.07], [0.78, 0.55, 0.09], [0.62, 0.5, 0.11], [0.85, 0.35, 0.06]], gain: 0.45 * gain * bright, maxF: 16000 });
  // the crowd of inharmonic partials under it, 2.5-9 kHz, most gone in 0.1-0.3 s
  const crowd: [number, number, number][] = [];
  for (let i = 0; i < 40; i++) {
    const r = Math.exp(rand(0, Math.log(4.6)));
    crowd.push([r, rand(0.4, 1) * Math.pow(r, 0.1), rand(0.22, 0.5)]);
  }
  modal(o, { base: rand(2050, 2350), modes: crowd, gain: 0.17 * gain * bright, jitter: 0.004 });
}


function block(o0: Out, a: Profile, _d: Profile, s: GuardOpts): void {
  const o = scaled(o0, TRIM.block);
  const st = striker(a, s.anim, !!s.heavy);
  const h = s.heavy ? 1 : 0.75;
  // a held block: the same clash, duller and shorter, no swell, the highs rolled off
  const lp = filtered(o, 'lowpass', 6500);
  clash(lp, 0.75, 0.5);
  parryRing(lp, rand(0.86, 0.92), 0.05, jit(0.4, 0.1), false);
  strikerRing(lp, st, 'block', 0.42, 0.75, 1);
  // the chain pulled taut between the hands takes it
  rattle(o, { count: 14, spread: 0.14, fLo: 2200, fHi: 6000, decay: 0.05, fade: 1.5 }, { gain: 0.5, type: 'highpass', f: 1500 });
  noise(o, { type: 'bandpass', f: jit(2000, 0.1), q: 1.5, dur: 0.04, gain: 0.3 });
  thump(o, 120 + 40 * (1 - st.mass), 55, 0.14 + 0.12 * st.mass, (0.3 + 0.5 * st.mass) * h);
  if (a.chain) chainIn(o, h);
}

const voice: Voice = { swing, hit, block };

export default voice;
