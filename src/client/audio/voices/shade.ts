/**
 * The Assassin's voice: two daggers. Matched to the reference recording (a duel game's dagger
 * moveset and its duel sounds), recreated from measurements, no samples:
 *
 *  - swing: one of two short "fwips" per knife, about 90 ms, rising to its peak in ~20 ms and
 *    falling 10 dB within ~40 ms. Either a low-mid fwump centred near 750 Hz with a thin high
 *    whistle gliding down from ~11.5 kHz to ~7 kHz, or a bright airy hiss flat from 1.5 to 12 kHz.
 *    The other knife answers ~0.1-0.14 s later, quieter. Heavies stack both kinds and run longer.
 *  - hit: a bright broadband slash peaking around 5-8 kHz (rising ~1 dB per third-octave from
 *    1 kHz), ~20 ms to its peak and ~50-70 ms of body, a faint tail; with a quick, high, wet nick
 *    of blood and a light body thump under it.
 *  - deflect: the reference's parry ring: a burst of bright air, then a set of steel partials on a
 *    ~1.8 kHz fundamental (x1.41, x1.89, x3.6, or the x1.26/1.6/2.12 set) ringing ~1 s.
 *  - block: the same steel caught short: the burst, a damped ring, the weight of the blow.
 */
import type { Voice } from '../voices';
import type { Profile } from '../profiles';
import { MAT, Material } from '../materials';
import { GuardOpts, HitOpts, Striker, SwingOpts, click, gore, ring, striker, strikerRing } from '../recipes';
import { Out, SHAPES, at, chance, crackle, filtered, jit, noise, rand, rattle, scaled, tear, thump } from '../synth';

/** The parry ring measured off the reference: two partial families on a ~1.8 kHz fundamental. */
const RING_A: Material = {
  base: 1860,
  modes: [[1, 1, 1.6], [1.41, 0.32, 1.05], [1.89, 0.3, 0.78], [3.6, 0.13, 0.6], [5.1, 0.05, 0.3]],
  beat: 1.6,
};
const RING_B: Material = {
  base: 1880,
  modes: [[1, 1, 1.6], [1.26, 0.36, 1.0], [1.6, 0.26, 0.82], [1.89, 0.22, 0.7], [2.12, 0.16, 0.6], [3.57, 0.12, 0.55]],
  beat: 1.6,
};
const knifeRing = (): Material => (chance(0.55) ? RING_A : RING_B);

type Kind = 'low' | 'air';

/** One knife through the air: a low-mid fwump with a falling whistle, or a bright hiss. */
function fwip(o: Out, kind: Kind, len: number, k: number, delay = 0, bright = 1): void {
  const pk = rand(0.15, 0.22);
  const shape = SHAPES.swing(pk, 1.6);
  if (kind === 'low') {
    // the fwump: a mid band that lifts with the blade's speed and drops away
    const f = jit(760, 0.12) * bright;
    noise(o, { color: 'pink', type: 'bandpass', f, fShape: (x) => 0.8 + 0.5 * Math.sin(Math.PI * Math.min(1, x / (pk * 2))), q: 1.3, dur: len, gain: 1.4 * k, shape, type2: 'highpass', f2: 260, delay });
    // a wider skirt of air over it
    noise(o, { type: 'bandpass', f: f * 3, q: 0.6, dur: len * 0.8, gain: 0.12 * k, shape, delay });
    // and the edge's thin whistle, gliding down
    noise(o, { type: 'bandpass', f: jit(11500, 0.08), f1: jit(7000, 0.1), q: 9, dur: len * 1.7, gain: 0.1 * k, shape: SHAPES.swing(0.15, 1.4), delay });
  } else {
    // the hiss: bright air, flat from 1.5 to 12 kHz
    noise(o, { type: 'bandpass', f: jit(3500, 0.15) * bright, fShape: (x) => 0.85 + 0.3 * Math.sin(Math.PI * x), q: 0.5, dur: len, gain: 0.45 * k, shape, type2: 'highpass', f2: 1300, delay });
    noise(o, { type: 'highpass', f: jit(8500, 0.1), q: 0.7, dur: len * 0.7, gain: 0.05 * k, shape, delay });
  }
}

function swing(o0: Out, _p: Profile, s: SwingOpts = {}): void {
  const heavy = !!s.heavy;
  const anim = s.anim;
  const thrust = anim === 'thrust' || anim === 'charge';
  const wide = anim === 'spin' || anim === 'sweep';
  const o = scaled(o0, 1.05);
  const len = jit(0.09, 0.12) * (heavy ? 1.35 : 1) * (thrust ? 0.85 : wide ? 1.3 : 1);
  if (thrust) {
    // a stab: the bright hiss, tighter and higher, then the other knife
    fwip(o, 'air', len, heavy ? 1.15 : 0.95, 0, 1.15);
    if (heavy) fwip(o, 'low', len * 1.1, 0.55, 0.01);
    fwip(o, 'air', len * 0.8, 0.38, rand(0.09, 0.13), 1.05);
  } else if (heavy || wide) {
    // a heavy: both kinds stacked, then the second knife carrying round
    const lead: Kind = chance(0.5) ? 'air' : 'low';
    fwip(o, lead, len, 1, 0);
    fwip(o, lead === 'air' ? 'low' : 'air', len * 1.1, 0.6, rand(0.005, 0.02));
    fwip(o, chance(0.5) ? 'air' : 'low', len * 0.9, 0.55, rand(0.1, 0.15));
    if (wide) fwip(o, 'air', len * 0.8, 0.35, rand(0.22, 0.27));
  } else {
    // a light: one knife's fwip, the other a beat behind and quieter
    const lead: Kind = chance(0.5) ? 'air' : 'low';
    fwip(o, lead, len, 1, 0);
    fwip(o, chance(0.6) ? (lead === 'air' ? 'low' : 'air') : lead, len * 0.85, rand(0.32, 0.45), rand(0.09, 0.14));
  }
  // leather creaking at the end of the reach
  noise(at(o, len * 0.9), { type: 'bandpass', f: 1800, q: 3, dur: 0.05, gain: heavy ? 0.07 : 0.05 });
}

// ------------------------------------------------------------------ hits

/** The reference's slash: bright broadband air, ~20 ms up, ~50-70 ms of body. */
function slash(o: Out, k: number, len: number, delay = 0, f = 5800): void {
  const shape = (x: number) => (x < 0.18 ? Math.pow(x / 0.18, 1.3) : Math.pow(Math.max(0, 1 - (x - 0.18) / 0.82), 2.2));
  noise(o, { type: 'bandpass', f: jit(f, 0.12), q: 0.5, dur: len, gain: 0.95 * k, shape, type2: 'highpass', f2: 900, delay });
  // the edge falling through the cut
  noise(o, { type: 'bandpass', f: rand(5200, 6400), f1: rand(1800, 2400), q: 1.2, dur: len * 0.8, gain: 0.35 * k, a: 0.002, delay });
}

/** What only the attacker's weapon brings to any contact (the shared recipes' tell). */
function tellOf(o: Out, a: Profile, h: number): void {
  if (a.chain) rattle(o, { count: 9, spread: 0.12, fLo: 2400, fHi: 6500, decay: 0.04, fade: 2 }, { gain: 0.35 * h, type: 'highpass', f: 1800, delay: 0.005 });
  if (a.lightning) {
    crackle(o, 0.14, 50, { gain: 0.3 * h, type: 'highpass', f: 2200 });
    noise(o, { type: 'highpass', f: 3000, dur: 0.02, gain: 0.25 * h, a: 0.0005 });
  }
}

/** One knife landing on `d`. */
function cut(o: Out, st: Striker, d: Profile, h: number, armor: boolean, len: number): void {
  const pt = st.edge === 'point';
  click(o, 0.12 + 0.25 * h, 4200, 0.006);
  if (d.body === 'plate') {
    // steel on armour: the bright slash, the plate's clank, the knife ringing off it, the edge skating
    slash(o, 0.9 * h + 0.3, len * 1.1, 0, 5600);
    ring(o, MAT.plate, 0.26 * h + 0.08, { pitch: d.plate / MAT.plate.base, hard: 0.85, decay: 0.6 });
    ring(o, knifeRing(), 0.07 * h + 0.03, { pitch: st.pitch * rand(1.05, 1.2), decay: 0.4, hard: 0.8 });
    tear(o, rand(0.1, 0.16), { gain: 0.3 * h, type: 'bandpass', f: rand(3200, 4400), q: 2.5, delay: 0.006 }, 0.5);
    rattle(o, { count: 6, spread: 0.12, fLo: 1800, fHi: 4500, decay: 0.04, fade: 2 }, { gain: 0.26 * h, delay: 0.01, type: 'highpass', f: 1500 });
    // and the point finds a gap between the plates
    gore(at(o, 0.02), st, h, 0.3);
    thump(o, 120 / Math.sqrt(d.weight), 48, 0.16, 0.35 * h, 0.004);
    return;
  }
  if (pt) {
    // a stab: the slash shortened and darker, and the "thk" of the point going in
    slash(o, 0.9 * h + 0.3, len * 0.75, 0, 4600);
    noise(o, { type: 'bandpass', f: rand(1300, 1700), f1: 600, q: 2.2, dur: 0.04, gain: 0.45 * h + 0.15, a: 0.0006 });
  } else {
    slash(o, 1.0 * h + 0.35, len);
    tear(o, rand(0.07, 0.11) * (0.8 + 0.4 * h), { gain: 0.35 * h + 0.12, type: 'bandpass', f: rand(2600, 3600), q: 0.8, delay: 0.006 });
  }
  ring(o, knifeRing(), 0.035 * h, { pitch: st.pitch * rand(1.1, 1.3), decay: 0.25, hard: 0.6 });
  // the bloody part: a quick, high, wet nick, then drops
  gore(o, st, h, armor ? 0.25 : 0.5);
  // the clothes it went through
  switch (d.body) {
    case 'cloth':
      noise(o, { color: 'pink', type: 'bandpass', f: 1800, f1: 800, q: 0.9, dur: 0.08, gain: 0.25 * h });
      break;
    case 'robe':
      noise(o, { color: 'pink', type: 'bandpass', f: 1000, f1: 450, q: 0.8, dur: 0.16, gain: 0.35 * h });
      break;
    case 'leather':
      ring(o, MAT.leather, 0.2 * h);
      break;
    case 'bare':
      noise(o, { type: 'bandpass', f: 2600, q: 0.9, dur: 0.025, gain: 0.3 * h, a: 0.0005 });
      break;
  }
  thump(o, 150 / Math.sqrt(d.weight), 55, 0.12, 0.3 * h, 0.004);
}

function hit(o0: Out, a: Profile, d: Profile, s: HitOpts = {}): void {
  // loudness trims, balanced from renders against the shared recipe
  const o = scaled(o0, d.body === 'plate' ? 0.95 : 0.78);
  const heavy = !!s.heavy;
  const st = striker(a, s.anim, heavy);
  const h = (heavy ? 1 : 0.7) * (s.backstab ? 1.2 : 1);
  const len = jit(0.085, 0.12) * (heavy ? 1.3 : 1);
  cut(o, st, d, h, !!s.armor, len);
  // two knives: the second one lands a beat behind on the double moves and the heavies
  const twin = s.anim === 'dualSlash' || s.anim === 'spin' || (heavy && st.edge !== 'point') || !!s.backstab;
  if (twin) cut(scaled(at(o, rand(0.07, 0.1)), rand(0.35, 0.5)), st, d, h * 0.8, !!s.armor, len * 0.85);
  if (s.armor) {
    // braced through it: a dull, solid thud with no give
    thump(o, 72, 40, 0.3, 0.55 * h, 0.006);
    noise(o, { color: 'brown', type: 'lowpass', f: 320, dur: 0.25, gain: 0.45 * h });
  }
  if (s.tipper) ring(o, knifeRing(), 0.1, { pitch: 1.25, decay: 0.6 });
  tellOf(o, a, h);
}

// ------------------------------------------------------------------ guards

/** The burst of bright air off a steel clash (the front of the reference's parry and block). */
function burst(o: Out, gain: number, len: number, f = 6000): void {
  noise(o, { type: 'bandpass', f: jit(f, 0.1), q: 0.55, dur: len, gain, a: 0.003, type2: 'highpass', f2: 1500 });
  noise(o, { type: 'highpass', f: 9000, dur: len * 0.6, gain: gain * 0.3, a: 0.001 });
}

function block(o0: Out, a: Profile, _d: Profile, s: GuardOpts = {}): void {
  const o = scaled(o0, 2.6);
  const heavy = !!s.heavy;
  const st = striker(a, s.anim, heavy);
  const h = heavy ? 1 : 0.75;
  const lp = filtered(o, 'lowpass', 7000);
  // the attacker's weapon, kept short: a hammer still dongs, a fist still thuds
  strikerRing(scaled(lp, 0.35), st, 'block', 0.4, 0.75, 1);
  // caught on the crossed knives: the parry ring, damped
  const m = knifeRing();
  ring(lp, m, 0.07, { pitch: jit(1, 0.04), decay: 0.22, hard: 0.75 });
  ring(lp, m, 0.045, { pitch: jit(1.07, 0.02), decay: 0.2, hard: 0.7, delay: 0.004 });
  burst(o, 2.2 + 0.6 * h, jit(0.2, 0.1), 5500);
  click(o, 0.4, 3200, 0.008);
  thump(o, 120 + 40 * (1 - st.mass), 55, 0.14 + 0.12 * st.mass, (0.3 + 0.5 * st.mass) * h);
  if (st.mass > 0.8) noise(o, { color: 'brown', type: 'lowpass', f: 320, dur: 0.22, gain: 0.35 * h });
  tellOf(o, a, h);
}

function deflect(o0: Out, a: Profile, _d: Profile, s: GuardOpts = {}): void {
  const o = scaled(o0, 2.9);
  const st = striker(a, s.anim, !!s.heavy);
  const streak = Math.max(1, s.streak ?? 1);
  const h = s.heavy ? 1 : 0.8;
  const up = 1 + 0.025 * Math.min(4, streak - 1);
  // the bright burst: 2-12 kHz air, ~80 ms
  burst(o, 1.3, jit(0.3, 0.1));
  // the bright haze hanging after it
  noise(o, { type: 'bandpass', f: jit(4800, 0.1), q: 0.45, type2: 'highpass', f2: 2000, dur: 0.7, gain: 0.85, delay: 0.015, a: 0.01 });
  click(o, 0.5, 5200, 0.008);
  // the ring: the reference's partials, ~1 s on the fundamental
  ring(o, knifeRing(), 0.12, { pitch: jit(1.0, 0.06) * up, decay: 1.6, hard: 1 });
  // the second knife touching a hair later, a little sharp
  ring(o, knifeRing(), 0.05, { pitch: jit(1.32, 0.03) * up, decay: 0.5, hard: 0.8, delay: 0.006 });
  // whatever hit them rings too, quieter (a hammer still dongs under it)
  strikerRing(scaled(filtered(o, 'lowpass', 6000), st.edge === 'blunt' ? 1.8 : 0.2), st, 'deflect', 0.5, 0.8, up);
  thump(o, 110, 48, 0.22, (0.35 + 0.3 * st.mass) * h);
  if (streak >= 3) ring(o, RING_A, 0.08, { pitch: 1.5 * up, decay: 1 });
  tellOf(o, a, h);
}

const voice: Voice = { swing, hit, block, deflect };

export default voice;
