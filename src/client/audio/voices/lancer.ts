/**
 * The Lancer's voice: a golden glaive charged with lightning, matched to the glaive reference
 * recording (and to the duel recordings from the same game for the clash and hit sounds).
 *
 * What the reference does:
 *  - a swing is a hard-fronted "tssh": broad noise centred near 3.5-5 kHz that hits its peak within
 *    ~15 ms and falls away over ~0.35 s (-3.5 dB at 90 ms, -10 dB at ~210 ms, -15 dB at ~360 ms),
 *    getting airier as it goes (its centroid climbs from ~3.4 kHz to ~6 kHz). Under it a low body
 *    sits at 400-650 Hz, a short chevron peaking ~80 ms in, and over it a faint pitched whistle
 *    falls from ~9.5 kHz to ~6 kHz over a third of a second. The big swings also leave a quiet
 *    metallic ring behind them, the same partial set as the clash below;
 *  - a landed hit is a bright, thin slash: a hard broadband crack centred near 5 kHz, strong for
 *    ~60 ms, a -10 dB plateau out to ~250 ms and a tail to ~0.55 s, with a little 150 Hz thud and a
 *    quick fall from ~600 Hz to ~150 Hz underneath. There is no wet layer of its own, so the gore
 *    layer gives it the bloody cut, kept under the bright crack;
 *  - a parried blow is the game's "clang": a broadband "tsing" (8-16 kHz for ~60 ms, 3-8 kHz for
 *    ~230 ms) over an inharmonic ring based at 1.66-1.93 kHz with partials at 1, 1.26, 1.41, 1.59,
 *    1.88, 2.12, 3.02, 3.58, 4.05 and 5.13 times that. The base partial rings for over a second
 *    (T60 ~1.7 s), the upper ones die progressively faster, which fans the comb out from the top,
 *    and there's very little low end;
 *  - no held block shows in the recordings, so a block is that same clang, struck softly, damped
 *    and dulled, over the knock of the glaive's shaft.
 * The Lancer's lightning rides on all of it: the glaive spits as it moves, sparks on a clash and
 * arcs into whatever it cuts.
 */
import type { Profile } from '../profiles';
import type { GuardOpts, HitOpts, Striker, SwingOpts } from '../recipes';
import { MAT, Material } from '../materials';
import { bodyLayer, click, gore, ring, striker, strikerRing } from '../recipes';
import { Out, SHAPES, at, chance, crackle, filtered, jit, noise, rand, rattle, scaled, tear, thump } from '../synth';
import type { Voice } from '../voices';

// ------------------------------------------------------------------ the clash (from the recordings)

/** The game's clash ring: an inharmonic comb, its upper partials dying first. */
const CLANG: Material = {
  base: 1800,
  modes: [
    [1, 0.8, 1.4],
    [1.26, 0.26, 1.05],
    [1.41, 0.45, 1.0],
    [1.59, 0.4, 0.85],
    [1.88, 0.3, 0.95],
    [2.12, 0.45, 0.6],
    [3.02, 0.45, 0.45],
    [3.58, 0.5, 0.38],
    [4.05, 0.45, 0.28],
    [5.13, 0.35, 0.15],
  ],
  beat: 2.2,
};

/** Strike the clash ring. The recordings re-pitch it by up to ±7% from one clash to the next. */
function clang(o: Out, gain: number, pitch: number, decay: number, hard: number, delay = 0): void {
  ring(o, CLANG, gain, { pitch: pitch * rand(0.93, 1.07), decay, hard, delay });
}

/**
 * An envelope drawn as a level curve: [time (s), dB] points, joined linearly in dB, over a sound of
 * length `dur`, stretched by `k` (so a longer swing keeps the same shape).
 */
const curve = (pts: readonly (readonly [number, number])[], dur: number, k = 1) => (x: number) => {
  const t = (x * dur) / k;
  if (t <= pts[0][0]) return 0;
  for (let i = 1; i < pts.length; i++) {
    const [t1, d1] = pts[i];
    if (t <= t1) {
      const [t0, d0] = pts[i - 1];
      const db = d0 + ((d1 - d0) * (t - t0)) / (t1 - t0);
      return i === 1 ? ((t - t0) / (t1 - t0)) * Math.pow(10, d1 / 20) : Math.pow(10, db / 20);
    }
  }
  return 0;
};

/** The charge in the glaive: it arcs on contact. */
function spark(o: Out, h: number, len = 0.14): void {
  crackle(o, len, 50, { gain: 0.6 * h, type: 'highpass', f: 2200 });
  noise(o, { type: 'highpass', f: 3000, dur: 0.02, gain: 0.25 * h, a: 0.0005 });
}

/** What the attacker's own weapon brings to a clash (the chain whipping in, another charged blade). */
function attackerTell(o: Out, a: Profile, h: number): void {
  if (a.chain) rattle(o, { count: 9, spread: 0.12, fLo: 2400, fHi: 6500, decay: 0.04, fade: 2 }, { gain: 0.35 * h, type: 'highpass', f: 1800, delay: 0.005 });
  if (a.lightning && a.id !== 'lancer') spark(o, h * 0.6);
}

// ------------------------------------------------------------------ swing

/** The reference swing's level curve (s, dB): a hard front, -3.5 dB at 90 ms, ~-8 dB to 200 ms, -14 dB at 360 ms. */
const TSSH_FRONT = [[0, 0], [0.01, 0], [0.06, -2.5], [0.1, -6], [0.13, -16], [0.16, -40]] as const;
const TSSH_AIR = [[0, 0], [0.015, -12], [0.09, -9], [0.13, -8.5], [0.2, -9], [0.28, -11], [0.36, -14], [0.44, -17], [0.5, -40]] as const;

function swing(o0: Out, p: Profile, s: SwingOpts): void {
  // the reference tops out near 10 kHz
  const o = filtered(scaled(o0, p.swing.gain * 0.53), 'lowpass', 12000, 0.5);
  const heavy = !!s.heavy;
  const anim = s.anim;
  const thrust = anim === 'thrust' || anim === 'charge';
  const wide = anim === 'spin' || anim === 'sweep';
  // how much longer than the reference's light swing this one is
  const k = (heavy ? 1.3 : 1) * (thrust ? 0.9 : wide ? 1.45 : 1.08) * jit(1, 0.1);
  const len = 0.5 * k;
  const h = heavy ? 0.92 : 0.8;

  // the "tssh": a hard, mid-bright front (~3.4 kHz) for the first ~100 ms...
  const f0 = rand(3100, 3700) * (thrust ? 1.05 : 1);
  noise(o, { color: 'white', type: 'bandpass', f: f0, q: 0.75, type2: 'highpass', f2: 900, dur: 0.16 * k, gain: 0.75 * h, shape: curve(TSSH_FRONT, 0.16 * k, k) });
  // ...over an airier hiss (~5-6.5 kHz) that carries the tail
  const f1 = rand(4800, 5800);
  noise(o, { color: 'white', type: 'bandpass', f: f1, f1: f1 * rand(0.85, 1.05), q: 0.6, type2: 'highpass', f2: 1200, dur: len, gain: 0.62 * h, shape: curve(TSSH_AIR, len, k) });
  if (wide) {
    // the spin comes round again
    noise(o, { color: 'white', type: 'bandpass', f: f1 * 0.9, q: 0.6, type2: 'highpass', f2: 1200, dur: len * 0.8, gain: 0.5 * h, shape: curve(TSSH_AIR, len * 0.8, k * 0.8), delay: len * 0.45 });
  }

  // the body of the shaft moving: a short chevron in the 400-650 Hz band, peaking ~70 ms in
  const bl = (thrust ? 0.17 : 0.22) * k;
  const pk = 0.35;
  noise(o, { color: 'pink', type: 'bandpass', f: rand(400, 460), fShape: (x) => 1 + 0.45 * (x < pk ? x / pk : Math.max(0, 1 - (x - pk) / (1 - pk))), q: 1.4, dur: bl, gain: heavy ? 2.4 : 1.9, shape: SHAPES.swing(pk, 1.6), delay: 0.005 });
  if (heavy) noise(o, { color: 'brown', type: 'lowpass', f: 300, dur: len * 0.6, gain: 0.3, shape: SHAPES.swing(0.3, 1.6) });

  // the edge whistling: a thin tone falling from ~9.5 kHz to ~6 kHz
  noise(o, { color: 'white', type: 'bandpass', f: rand(8800, 10000), fShape: (x) => Math.pow(0.62, x), q: rand(18, 26), dur: len * 0.8, gain: (thrust ? 0.085 : 0.13) * h, shape: SHAPES.swing(0.3, 2), delay: len * 0.12 });

  // the big swings leave the glaive ringing faintly
  if (heavy || wide || chance(0.2)) clang(o, heavy ? 0.035 : 0.022, 1, 0.55, 0.45, len * 0.25);

  // the charged glaive spits as it moves
  crackle(o, len * 0.7, 30, { gain: heavy ? 0.3 : 0.22, type: 'highpass', f: 2500, delay: len * 0.08 });

  // the plate settling as the swing carries through
  const ft = at(o, s.follow ?? len * 0.6);
  rattle(ft, { count: heavy ? 7 : 4, spread: 0.12, fLo: 1600, fHi: 4200, decay: 0.05, fade: 1.5 }, { gain: 0.24 * (heavy ? 1 : 0.7), type: 'highpass', f: 1200 });
}

// ------------------------------------------------------------------ hit

/** The reference hit's tail (s, dB re its crack): a plateau to ~250 ms, a small bump, then away by ~0.55 s. */
const SLASH_TAIL = [[0, 0], [0.006, -9], [0.08, -10], [0.25, -11.5], [0.28, -8.5], [0.33, -10], [0.38, -14], [0.48, -17], [0.58, -22], [0.62, -45]] as const;

/** The bright, thin slash the reference plays on every landed blow. */
function slash(o: Out, st: Striker, h: number, k: number): void {
  const pt = st.edge === 'point';
  // the crack: broadband, centred near 5 kHz, held for ~50 ms
  click(o, (0.35 + 0.45 * h) * k, 2600, 0.01);
  noise(o, { color: 'white', type: 'bandpass', f: rand(4400, 5400) * (pt ? 0.9 : 1), f1: rand(3600, 4400), q: 0.6, dur: 0.11, hold: (pt ? 0.048 : 0.055) * (0.85 + 0.3 * h), gain: (1.1 + 0.6 * h) * k, a: 0.0008 });
  // the plateau and tail behind it, out to ~0.55 s
  const tl = (pt ? 0.54 : 0.62) * (0.9 + 0.15 * h);
  noise(o, { color: 'white', type: 'bandpass', f: rand(4300, 5300), q: 0.55, type2: 'highpass', f2: 1800, dur: tl, gain: (0.95 + 0.5 * h) * k, shape: curve(SLASH_TAIL, tl, tl / 0.62) });
  // the quick fall underneath: ~600 Hz down to ~150 Hz
  noise(o, { color: 'pink', type: 'bandpass', f: rand(560, 680), f1: rand(140, 170), q: 2.2, dur: 0.13, gain: (1.4 + 0.9 * h) * k, a: 0.002 });
}

function hit(o0: Out, a: Profile, d: Profile, s: HitOpts): void {
  // the reference tops out near 10 kHz
  const o = filtered(scaled(o0, 0.22), 'lowpass', 10500, 0.5);
  const st = striker(a, s.anim, !!s.heavy);
  const h = (s.heavy ? 1 : 0.7) * (s.backstab ? 1.15 : 1);
  const pt = st.edge === 'point';
  if (d.body === 'plate') {
    // steel on armour, in the reference's style: the bright crack over the plate's clank and the
    // glaive ringing off it with the clash's own comb
    slash(o, st, h, 0.8);
    ring(o, MAT.plate, 0.5 * h + 0.15, { pitch: (d.plate / MAT.plate.base) * (pt ? 1.05 : 1), hard: 0.9, decay: pt ? 0.8 : 1 });
    clang(o, 0.1 * h + 0.04, 1, 0.4, 0.8);
    // the edge skating across it
    if (!pt) tear(o, rand(0.12, 0.2), { gain: 0.3 * h, type: 'bandpass', f: rand(3000, 4200), q: 2.5, delay: 0.006 }, 0.5);
    // and finding the gaps between the plates
    gore(at(o, 0.02), st, h, 0.35);
    rattle(o, { count: 6, spread: 0.12, fLo: 1800, fHi: 4500, decay: 0.04, fade: 2 }, { gain: 0.3 * h, delay: 0.01, type: 'highpass', f: 1500 });
    thump(o, 120 / Math.sqrt(d.weight), 48, 0.18, 0.45 * h, 0.004);
  } else {
    slash(o, st, h, s.armor ? 0.7 : 1);
    // the edge opening the cut, then the bloody half of it, kept under the crack
    if (!pt) tear(o, rand(0.08, 0.13) * (0.8 + 0.4 * h), { gain: (0.45 * h + 0.15) * 0.9, type: 'bandpass', f: rand(2400, 3200), q: 0.7, delay: 0.004 });
    else tear(o, 0.06, { gain: (0.3 * h + 0.1) * 0.9, type: 'bandpass', f: 1800, q: 1 }, 0.6);
    ring(o, st.mat, 0.06 * h, { pitch: st.pitch, decay: 0.28, hard: 0.6 });
    gore(o, st, h, s.armor ? 0.25 : 0.65);
    bodyLayer(o, d, h * 1.2);
    // the little 150 Hz thud of the body taking it
    thump(o, 150 / Math.sqrt(d.weight), 55, 0.14 + 0.07 * st.mass, (0.5 + 0.6 * st.mass) * h, 0.004);
  }
  if (s.armor) {
    // braced through it: a dull, solid thud with no give
    thump(o, 72, 40, 0.3, 0.6 * h, 0.006);
    noise(o, { color: 'brown', type: 'lowpass', f: 320, dur: 0.25, gain: 0.5 * h });
  }
  // the very tip: a needle ting on top
  if (s.tipper) ring(o, st.mat, 0.12, { pitch: st.pitch * 1.03, decay: 0.6 });
  // the lightning arcing into the cut
  spark(o, h * 0.7);
}

// ------------------------------------------------------------------ guards

/** A blow stopped on the glaive's shaft: the clash comb, struck softly and damped, over wood. */
function block(o: Out, a: Profile, _d: Profile, s: GuardOpts): void {
  const st = striker(a, s.anim, !!s.heavy);
  const h = s.heavy ? 1 : 0.75;
  const lp = filtered(o, 'lowpass', 6000);
  clang(lp, 0.3, 0.97, 0.38, 0.6);
  // the attacker's weapon under it, so a hammer still dongs and a knife still pings
  strikerRing(scaled(lp, st.edge === 'blunt' ? 0.7 : 0.45), st, 'block', 0.42, 0.75, 1);
  // the ash shaft knocking and its iron fittings
  ring(lp, MAT.haft, 0.65, { pitch: rand(0.9, 1.1) });
  noise(o, { type: 'bandpass', f: 900, q: 2, dur: 0.03, gain: 0.3 });
  click(o, 0.4, 3000, 0.01);
  noise(o, { type: 'bandpass', f: jit(2000, 0.1), q: 1.5, dur: 0.04, gain: 0.35 });
  // the weight of the blow, through the arms
  thump(o, 120 + 40 * (1 - st.mass), 55, 0.14 + 0.12 * st.mass, (0.3 + 0.5 * st.mass) * h);
  // a little spark off the charged glaive
  crackle(o, 0.06, 50, { gain: 0.35, type: 'highpass', f: 3000 });
  attackerTell(o, a, h);
  // the Lancer's own plate jolting
  rattle(o, { count: 4, spread: 0.08, fLo: 1800, fHi: 4200, decay: 0.04 }, { gain: 0.22, delay: 0.015, type: 'highpass', f: 1500 });
}

/** The perfect deflect: the game's clang off the glaive's head, sparks and all. */
/** The reference clash's "tsing" (s, dB): 3-8 kHz, -4 dB at 60 ms, -10 dB at ~230 ms, gone by ~0.45 s. */


const voice: Voice = { swing, hit, block };

export default voice;
