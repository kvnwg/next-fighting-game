/**
 * The Ronin's voice: a katana, matched to the katana reference recording (swings in the lobby) and
 * three katana duels from the same game (the cuts landing and the parries).
 *
 * What the recordings do (measured with the music subtracted; numbers are 300 Hz-16 kHz):
 *  - a swing is two humps: a mid "whoom" of the blade's flat (630-800 Hz) right at the peak, then
 *    the air off the edge, a bright hiss (8-12.5 kHz) that blooms ~90 ms later and is gone by
 *    ~300 ms. The centroid climbs from ~1.3 kHz to ~7.5 kHz across it, and a faint whistle falls
 *    from ~12 kHz to ~8-10 kHz. There is a dip at 2.5-5 kHz. Light swings build in ~50 ms; heavy
 *    ones build over ~100 ms and hang on ~80 ms longer, with more 3-6 kHz in them;
 *  - a landed cut is a bright, dense "shhk" (1-12 kHz, strongest at 5-6.3 kHz, centroid ~5.3 kHz)
 *    held for ~50 ms, then a hiss of spray at -12 dB for ~300 ms with a few droplets ticking at
 *    2.5-4 kHz. There is no blade ring in it;
 *  - a parry is a hard crack and a shimmer that darkens as it dies (14 kHz gone by 100 ms, 6 kHz
 *    by 250 ms), over a cluster of partials, then the "ting": its strongest partial at 1.65-1.95
 *    kHz with others at x1.26 / x1.41 / x1.6 / x1.89, swelling in over ~150 ms with a ~10 Hz
 *    beat and ringing for about a second. The game re-uses two clash sounds, so each family
 *    below is one of those partial sets, played with jitter.
 *  - no held block is audible in the recordings, so the block is the parry's clash without its
 *    swell: the same crack and partials, damped and shorter, so the parry stays the special one.
 */
import { MAT } from '../materials';
import type { Profile } from '../profiles';
import type { GuardOpts, HitOpts, Striker, SwingOpts } from '../recipes';
import { bodyLayer, ring, striker, strikerRing } from '../recipes';
import { Out, at, filtered, jit, modal, noise, osc, pick, rand, rattle, scaled, spatter, squelch, tear, thump } from '../synth';
import { CLASHES, crack, tingBase } from '../clang';
import type { Voice } from '../voices';

// ------------------------------------------------------------------ swings

const G_SWING = 0.85;

function swing(o0: Out, p: Profile, s: SwingOpts): void {
  const heavy = !!s.heavy;
  // the recording rolls off above ~12 kHz
  const o = scaled(filtered(o0, 'lowpass', 12500, 0.6), p.swing.gain * G_SWING * (heavy ? 0.85 : 1));
  const anim = s.anim;
  const thrust = anim === 'thrust' || anim === 'charge';
  const wide = anim === 'spin' || anim === 'sweep';
  const big = anim === 'overhead' || anim === 'draw';
  // the build to the whoom, and the air carrying on after it
  const build = (heavy ? rand(0.085, 0.11) : rand(0.04, 0.055)) * (thrust ? 0.75 : 1);
  const tail = (heavy ? 0.46 : 0.38) * jit(1, 0.1) * (wide ? 1.3 : thrust ? 0.8 : 1);
  const len = build + tail;
  const pk = build / len;

  // the flat of the blade through the air: the mid whoom at the peak
  const wl = build + 0.075;
  const wq = build / wl;
  noise(o, {
    color: 'pink',
    type: 'bandpass',
    f: jit(heavy ? 640 : 720, 0.1) * (thrust ? 1.25 : 1),
    fShape: (x) => 0.8 + 0.35 * Math.min(1, x / wq),
    q: 1.25,
    dur: wl,
    gain: (thrust ? 0.8 : 1) * (heavy ? 0.75 : 0.85),
    shape: (x) => (x < wq ? Math.pow(x / wq, 2) : Math.pow(1 - (x - wq) / (1 - wq), 1.6)),
    type2: 'highpass',
    f2: 300,
  });
  // the weight behind a heavy cut: a low push under the whoom
  if (heavy || big) noise(o, { color: 'brown', type: 'lowpass', f: 420, q: 0.7, dur: wl * 1.2, gain: heavy ? 0.1 : 0.07, shape: (x) => Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.1)), 1.5) });

  // the air off the edge: a band that climbs from the whoom up into the hiss, blooming ~90 ms later
  const bloom = Math.min(0.8, (build + rand(0.075, 0.1)) / len);
  noise(o, {
    type: 'bandpass',
    f: 3000,
    fShape: (x) => 1 + 2.3 * Math.min(1, x / bloom),
    q: 0.8,
    dur: len,
    gain: heavy ? 0.095 : 0.075,
    shape: (x) => (x < bloom ? Math.pow(x / bloom, 1.4) : Math.pow(1 - (x - bloom) / (1 - bloom), 1.4)),
  });
  noise(o, {
    type: 'highpass',
    f: jit(7800, 0.08),
    q: 0.6,
    dur: len,
    gain: (heavy ? 0.019 : 0.016) * (thrust ? 0.7 : 1),
    shape: (x) => (x < bloom ? Math.pow(x / bloom, 2) : Math.pow(1 - (x - bloom) / (1 - bloom), 1.4)),
  });
  // the edge singing: a faint whistle falling from ~12 kHz to ~9, then holding as it fades
  const wf = rand(11200, 13200);
  osc(o, {
    f: wf,
    f1: wf * rand(0.68, 0.8),
    glide: 0.15,
    dur: len * 1.05,
    gain: heavy ? 0.011 : 0.01,
    shape: (x) => Math.min(1, x / (pk * 0.6 + 0.02)) * Math.pow(1 - x, 1.2),
    fm: [rand(6, 9), 40],
  });
}

// ------------------------------------------------------------------ hits

const G_HIT = 1.35;

/** The cut itself: a bright, dense "shhk", held for ~50 ms and then gone. */
function shhk(o: Out, h: number, pt: boolean, k: number): void {
  const held = (pt ? 0.032 : 0.045) * (0.8 + 0.4 * h) * jit(1, 0.12);
  const dur = held + 0.03;
  const q = held / dur;
  const env = (x: number) => (x < 0.04 ? x / 0.04 : x < q ? 1 - 0.7 * ((x - 0.04) / (q - 0.04)) : 0.3 * Math.pow(1 - (x - q) / (1 - q), 1.5));
  noise(o, { type: 'bandpass', f: (pt ? 3400 : 4000) * jit(1, 0.08), q: pt ? 0.85 : 0.5, dur, gain: (0.8 + 0.5 * h) * k, shape: env, type2: 'highpass', f2: 1100 });
  // the hard front of it
  noise(o, { type: 'highpass', f: jit(3000, 0.1), q: 0.7, dur: 0.01, gain: (0.35 + 0.3 * h) * k, a: 0.0004 });
}

/** The wet half: the edge opening flesh (a short, fairly bright "shlk"), the spray, the drops. */
function blood(o: Out, st: Striker, h: number, k: number): void {
  const pt = st.edge === 'point';
  // the flesh parting: a resonant sweep down through 3 kHz to 700 Hz
  squelch(o, (pt ? 0.06 : 0.08) * (0.8 + 0.4 * h), pt ? 2200 : 3200, pt ? 500 : 700, { gain: (0.4 + 0.35 * h) * k, delay: 0.004 }, pt ? 0.6 : 1);
  // the meat of it: a short wet thwack
  thump(o, rand(180, 220), 75, 0.07, (0.25 + 0.3 * h) * k, 0.002);
  noise(o, { color: 'pink', type: 'lowpass', f: rand(550, 700), q: 0.8, dur: 0.07, gain: (0.85 + 0.7 * h) * k, a: 0.002 });
  noise(o, { color: 'pink', type: 'bandpass', f: rand(650, 900), q: 0.9, dur: 0.055, gain: (0.9 + 0.8 * h) * k, a: 0.001 });
  // the spray flung off the edge: a high hiss that hangs for ~300 ms
  const sl = (pt ? 0.38 : 0.52) * (0.85 + 0.3 * h) * jit(1, 0.1);
  noise(o, { type: 'bandpass', f: rand(5500, 7000), f1: rand(3800, 4600), q: 0.6, dur: sl, gain: (0.055 + 0.035 * h) * k, delay: 0.03, shape: (x) => Math.min(1, x / 0.1) * Math.pow(1 - x, 0.8) });
  // and the drops ticking down
  spatter(o, Math.round((pt ? 3 : 5) + 6 * h), 0.2 + 0.1 * h, 2300, 4200, { gain: (0.12 + 0.08 * h) * k, delay: rand(0.12, 0.17), type: 'highpass', f: 1200 });
}

function hit(o0: Out, a: Profile, d: Profile, s: HitOpts): void {
  let o = scaled(filtered(o0, 'lowpass', 12500, 0.6), G_HIT);
  const st = striker(a, s.anim, !!s.heavy);
  const h = (s.heavy ? 1 : 0.7) * (s.backstab ? 1.15 : 1);
  const pt = st.edge === 'point';
  if (d.body === 'plate') {
    // steel on armour: the same bright cut, dulled, and the plate clanking under it
    o = scaled(o, 1.3);
    shhk(filtered(o, 'lowpass', 7000), h, pt, 0.75);
    const pp = d.plate / MAT.plate.base;
    ring(o, MAT.plate, (0.4 * h + 0.12) * (pt ? 1.1 : 1), { pitch: pp * (pt ? 1.05 : 1), hard: 0.9, decay: pt ? 0.8 : 1 });
    // the katana ringing off it: the clash partials, short
    const c = pick(CLASHES);
    modal(o, { base: tingBase() * a.pitch, modes: c.strike, gain: 0.09 * h + 0.03, decay: 0.45, jitter: 0.02 });
    // the edge skating across it, then finding the gaps
    tear(o, rand(0.1, 0.16), { gain: 0.3 * h, type: 'bandpass', f: rand(3000, 4000), q: 2.5, delay: 0.006 }, 0.5);
    blood(at(o, 0.02), st, h, 0.3);
    rattle(o, { count: 6, spread: 0.12, fLo: 1800, fHi: 4500, decay: 0.04, fade: 2 }, { gain: 0.28 * h, delay: 0.01, type: 'highpass', f: 1500 });
    thump(o, 120 / Math.sqrt(d.weight), 48, 0.18, 0.42 * h, 0.004);
  } else {
    shhk(o, h, pt, s.armor ? 0.7 : 1);
    blood(o, st, h, s.armor ? 0.35 : 1);
    if (pt) noise(o, { type: 'bandpass', f: rand(1300, 1700), f1: 650, q: 2, dur: 0.04, gain: 0.35 * h, a: 0.0006 });
    // what they're wearing (cloth adds little over the cut itself)
    if (d.body !== 'cloth') bodyLayer(o, d, h * 0.9);
    // the body taking the blow
    thump(o, 150 / Math.sqrt(d.weight), 52, 0.15 + 0.08 * st.mass, (0.25 + 0.35 * st.mass) * h, 0.004);
  }
  if (s.armor) {
    // braced through it: a dull, solid thud with no give
    thump(o, 72, 40, 0.3, 0.55 * h, 0.006);
    noise(o, { color: 'brown', type: 'lowpass', f: 320, dur: 0.25, gain: 0.45 * h });
  }
  // the very tip: a needle ting on top
  if (s.tipper) ring(o, MAT.katana, 0.1, { pitch: a.pitch * 1.03, decay: 0.6 });
}

// ------------------------------------------------------------------ guards

const G_BLOCK = 4.1;

/** What the attacker's weapon brings to the clash, when it isn't another blade. */
function attackerRing(o: Out, st: Striker, big: boolean, up: number): void {
  if (st.edge === 'blade' || st.edge === 'point') {
    // another katana is already in the clash; a different blade adds a faint ring of its own
    if (st.mat !== MAT.katana) ring(o, st.mat, big ? 0.03 : 0.025, { pitch: st.pitch * up, decay: big ? 0.6 : 0.35, hard: 0.7 });
  }
  else strikerRing(scaled(o, 0.45), st, big ? 'deflect' : 'block', big ? 0.9 : 0.45, 0.8, up);
}

function block(o0: Out, a: Profile, d: Profile, s: GuardOpts): void {
  const o = scaled(o0, G_BLOCK);
  const st = striker(a, s.anim, !!s.heavy);
  const h = s.heavy ? 1 : 0.75;
  const soft = st.edge === 'fist' || st.edge === 'grab';
  // a held block is duller than a parry: the highs rolled off, the partials damped
  const lp = filtered(o, 'lowpass', 6000);
  crack(lp, soft ? 0.25 : 0.5, soft ? 0.08 : 0.16, 0.25);
  const c = pick(CLASHES);
  const f1 = tingBase() * d.pitch * rand(0.92, 1);
  modal(lp, { base: f1, modes: c.strike, gain: (soft ? 0.12 : 0.26) * (0.8 + 0.3 * h), decay: 0.4, jitter: 0.02, hard: soft ? 0.5 : 0.85 });
  modal(lp, { base: f1, modes: c.ting.slice(0, 3), gain: (soft ? 0.06 : 0.14) * (0.8 + 0.3 * h), decay: 0.3, jitter: 0.02, hard: 0.8 });
  attackerRing(lp, st, false, 1);
  // the blades slide along each other
  if (!soft && st.edge !== 'blunt') noise(o, { type: 'bandpass', f: 3000, f1: 1800, q: 4, dur: 0.12, gain: 0.12, delay: 0.01 });
  noise(o, { type: 'bandpass', f: jit(2000, 0.1), q: 1.5, dur: 0.04, gain: 0.3 });
  // the weight of the blow, taken through the arms
  thump(o, 120 + 40 * (1 - st.mass), 55, 0.14 + 0.12 * st.mass, (0.3 + 0.5 * st.mass) * h);
  if (a.chain) rattle(o, { count: 9, spread: 0.12, fLo: 2400, fHi: 6500, decay: 0.04, fade: 2 }, { gain: 0.3 * h, type: 'highpass', f: 1800, delay: 0.005 });
}

const voice: Voice = { swing, hit, block };

export default voice;
