/**
 * The Duelist's voice: a rapier, matched to the fencing reference recording.
 *
 * What the reference does:
 *  - swings are a soft "fwoosh" of broad noise centred near 2-2.5 kHz with a shelf at 4-5 kHz and a
 *    faint whistle near 3.3 kHz; ~0.3 s for a light swing, ~0.5 s for a heavy one, swelling in over
 *    ~80 ms and falling away, with no big band sweep;
 *  - a blade-on-blade clash is a hard broadband crack followed by a crowd of inharmonic partials
 *    that keep ringing for most of a second. The held clash (block) rings low, 1.6-3.9 kHz; the
 *    parry (deflect) is the bright one, its strongest partial at 4.7 or 5.5 kHz. The game re-uses a
 *    handful of clash sounds, so each family below is one of those partial sets, played with jitter;
 *  - a landed point is short and fairly dark (a "tk" around 1-2.5 kHz), with a blast of air behind a
 *    heavy blow. It carries no wet layer of its own; the gore layer gives it the bloody cut.
 */
import type { Profile } from '../profiles';
import type { GuardOpts, HitOpts, Striker, SwingOpts } from '../recipes';
import { MAT } from '../materials';
import { bodyLayer, click, gore, ring, striker, strikerRing } from '../recipes';
import { Mode, Out, SHAPES, at, crackle, filtered, jit, modal, noise, osc, pick, rand, rattle, scaled, spatter, squelch, tear, thump } from '../synth';
import type { Voice } from '../voices';

// ------------------------------------------------------------------ the clash families (from the recording)

interface Family {
  base: number;
  modes: readonly Mode[];
}

/** Held clashes: the low families (strongest partials 1.6-2.5 kHz). */
const BLOCK: readonly Family[] = [
  {
    base: 1945,
    modes: [[0.844, 0.9, 0.75], [1, 1, 0.7], [1.241, 0.3, 0.8], [1.301, 0.35, 0.65], [1.47, 0.25, 0.9], [1.687, 0.3, 0.85], [1.747, 0.28, 0.9], [1.88, 0.45, 0.75], [2.0, 0.4, 0.95], [2.6, 0.2, 0.5]],
  },
  {
    base: 2531,
    modes: [[0.768, 0.6, 0.6], [1, 0.75, 0.8], [1.296, 0.32, 0.75], [1.444, 0.3, 0.6], [1.556, 0.45, 0.55], [1.87, 0.5, 0.8], [2.065, 0.22, 0.6], [2.417, 0.2, 0.5]],
  },
];

/** Parries: the bright families (strongest partial 4.7 or 5.5 kHz). */
const DEFLECT: readonly Family[] = [
  {
    base: 4734,
    modes: [[0.396, 0.28, 0.5], [0.535, 0.4, 0.5], [0.678, 0.3, 0.4], [0.772, 0.6, 0.6], [0.812, 0.6, 1.4], [1, 1, 1.0], [1.104, 0.25, 0.4], [1.183, 0.35, 0.7], [1.292, 0.6, 0.5], [1.6, 0.15, 0.3]],
  },
  {
    base: 5508,
    modes: [[0.417, 0.12, 0.75], [0.434, 0.15, 0.4], [0.519, 0.4, 0.4], [0.757, 0.5, 0.35], [0.86, 0.5, 0.5], [1, 1, 1.1], [1.149, 0.45, 0.3], [1.38, 0.15, 0.25]],
  },
];

interface ClangOpts {
  pitch?: number;
  decay?: number;
  hard?: number;
  delay?: number;
}

function clang(o: Out, fam: Family, gain: number, c: ClangOpts = {}): void {
  modal(o, { base: fam.base * (c.pitch ?? 1) * jit(1, 0.02), modes: fam.modes, gain, decay: (c.decay ?? 1) * jit(1, 0.1), jitter: 0.008, beat: 2.5, hard: c.hard, delay: c.delay });
}

/** What only the attacker's weapon brings to the clash: the chain whipping in, the spear's spark. */
function tell(o: Out, a: Profile, h: number): void {
  if (a.chain) rattle(o, { count: 9, spread: 0.12, fLo: 2400, fHi: 6500, decay: 0.04, fade: 2 }, { gain: 0.35 * h, type: 'highpass', f: 1800, delay: 0.005 });
  if (a.lightning) {
    crackle(o, 0.14, 50, { gain: 0.3 * h, type: 'highpass', f: 2200 });
    noise(o, { type: 'highpass', f: 3000, dur: 0.02, gain: 0.25 * h, a: 0.0005 });
  }
}

/** The striking weapon's own voice, kept under ours so a hammer parried still dongs. */
function attackerRing(o: Out, st: Striker, big: boolean): void {
  const blade = st.edge === 'blade' || st.edge === 'point';
  strikerRing(scaled(o, blade ? (big ? 0.3 : 0.06) : big ? 0.9 : 0.8), st, big ? 'deflect' : 'block', big ? 0.8 : 0.4, big ? 1 : 0.75, 1);
}

// ------------------------------------------------------------------ swing

/**
 * The fwoosh: pink noise in a broad band at ~2.2 kHz, a second band on the 4-5 kHz shelf, and a thin
 * whistle at ~3.3 kHz, all on a swell that rises over the first third and falls away. A thrust is a
 * shorter, slightly brighter jab of it; a cut is longer, with a little more band movement.
 */
function swing(o0: Out, _p: Profile, s: SwingOpts): void {
  const heavy = !!s.heavy;
  const thrust = s.anim === 'thrust' || s.anim === 'charge';
  const wide = s.anim === 'spin' || s.anim === 'sweep';
  // a cut moves more air than a jab; the heavy thrust is a longer jab, not a louder one
  const o = filtered(scaled(o0, 0.58 * (thrust ? (heavy ? 0.92 : 1.12) : heavy ? 1.2 : 1.55)), 'lowpass', 6500);
  const len = (heavy ? 0.5 : 0.3) * (thrust ? 0.85 : wide ? 1.4 : 1.1) * jit(1, 0.12);
  const f = 2000 * (heavy ? 0.92 : 1) * (thrust ? 1.08 : 1) * jit(1, 0.08);
  const pk = thrust ? rand(0.25, 0.32) : rand(0.32, 0.42);
  const mv = thrust ? 0.15 : 0.3;
  const band = (x: number) => 1 - mv * 0.5 + mv * Math.sin(Math.PI * Math.min(1, x / (pk * 2)));
  const shape = SHAPES.swing(pk, 2);
  noise(o, { color: 'pink', type: 'bandpass', f, fShape: band, q: 1.0, type2: 'highpass', f2: 450, dur: len, gain: heavy ? 1.0 : 0.85, shape });
  noise(o, { color: 'white', type: 'bandpass', f: f * 2.05, fShape: band, q: 1.3, type2: 'lowpass', f2: 6000, dur: len * 0.9, gain: heavy ? 0.1 : 0.08, shape });
  // the blade singing through the air, faint
  noise(o, { type: 'bandpass', f: 3300 * jit(1, 0.04), fShape: band, q: rand(10, 14), dur: len * 0.85, gain: heavy ? 0.3 : 0.25, shape: SHAPES.swing(pk, 2.4) });
  // a heavy blow carries the body behind it
  if (heavy) noise(o, { color: 'pink', type: 'bandpass', f: 900, q: 0.8, dur: len, gain: 0.25, shape: SHAPES.swing(pk, 1.6) });
  // the boots and cape settling as the lunge carries through
  noise(at(o, len * 0.75), { type: 'bandpass', f: 1800, q: 3, dur: 0.05, gain: heavy ? 0.08 : 0.05 });
}

// ------------------------------------------------------------------ hit

/**
 * A landed point: the tick of contact, a short dark "tk" (1-2.5 kHz) as it goes in, a dry tick of
 * the rapier, the body taking it, and the gore layer for the wound (a cut opens it wider than a
 * thrust). A heavy blow pushes a blast of air behind it, as the reference's knock-backs do.
 */
function hit(o0: Out, a: Profile, d: Profile, s: HitOpts): void {
  const st = striker(a, s.anim, !!s.heavy);
  const heavy = !!s.heavy;
  const o = heavy ? scaled(o0, 0.75) : o0;
  const h = (heavy ? 1 : 0.7) * (s.backstab ? 1.15 : 1);
  if (d.body === 'plate') onPlate(o, st, d, h, heavy);
  else onBody(o, st, d, h, !!s.armor);
  if (heavy) blast(at(o, rand(0.015, 0.03)), h);
  if (s.armor) {
    // braced through it: a dull, solid thud with no give
    thump(o, 72, 40, 0.3, 0.6 * h, 0.006);
    noise(o, { color: 'brown', type: 'lowpass', f: 320, dur: 0.25, gain: 0.5 * h });
  }
  // the very tip: a needle ting on top
  if (s.tipper) clang(o, pick(DEFLECT), 0.06, { decay: 0.5, hard: 0.7 });
}

function onBody(o: Out, st: Striker, d: Profile, h: number, armor: boolean): void {
  const cut = st.edge === 'blade';
  click(o, 0.25 + 0.4 * h, 3000, 0.008);
  // the "tk": a short band around 1.5-2 kHz, falling as the point goes in
  noise(o, { type: 'bandpass', f: rand(2600, 3200), f1: rand(1100, 1400), q: 1.2, dur: rand(0.045, 0.06) * (0.85 + 0.3 * h), gain: 0.9 * h + 0.3, a: 0.0006 });
  if (cut) {
    // a cut drags the edge across: the slice, then fibres parting
    noise(o, { type: 'bandpass', f: rand(4200, 5200), f1: rand(1500, 1900), q: 1.3, dur: rand(0.06, 0.08) * (0.8 + 0.4 * h), gain: 0.55 * h + 0.2, a: 0.001 });
    tear(o, rand(0.08, 0.12) * (0.8 + 0.4 * h), { gain: 0.6 * h + 0.2, type: 'bandpass', f: rand(2200, 3000), q: 0.8, delay: 0.004 });
  } else tear(o, 0.05, { gain: 0.35 * h + 0.1, type: 'bandpass', f: 1900, q: 1 }, 0.6);
  // the rapier ticks as it stops
  clang(o, pick(BLOCK), 0.03 * h, { decay: 0.22, hard: 0.6 });
  bodyLayer(o, d, h * (d.body === 'robe' ? 1.7 : 1.3));
  // blood: the shared gore layer, a little lighter for the point's narrow wound
  gore(o, st, h, (armor ? 0.35 : 1) * (cut ? 1 : 0.85));
  if (!cut) {
    // a run-through still bleeds: a short wet suck as the point comes out, and a few drops
    squelch(o, 0.06, 1300, 300, { gain: 0.35 * h, delay: 0.05 + rand(0, 0.02) }, 0.7);
    spatter(o, Math.round(3 + 5 * h), 0.18, 500, 1400, { gain: 0.18 * h, delay: rand(0.08, 0.12), type: 'highpass', f: 260 });
  }
  thump(o, 150 / Math.sqrt(d.weight), 52, 0.15, (0.4 + 0.3 * h) * h, 0.004);
}

/** Steel on armour plate, in the clash's voice: a cracked clank, the rapier pinging off it. */
function onPlate(o0: Out, st: Striker, d: Profile, h: number, heavy: boolean): void {
  const o = scaled(o0, 1.12);
  const pp = d.plate / MAT.plate.base;
  click(o, 0.45 + 0.3 * h, 4500, 0.008);
  // the crack of the strike: broadband, mostly 2-6 kHz, dying in ~0.12 s
  noise(o, { type: 'bandpass', f: rand(3200, 4000), q: 0.6, dur: 0.12, gain: 0.55 * h + 0.2, a: 0.0006 });
  ring(o, MAT.plate, 0.45 * h + 0.15, { pitch: pp * jit(1, 0.03), hard: 0.85, decay: heavy ? 1 : 0.8 });
  // the rapier glancing off: the low clash family, short
  clang(o, pick(BLOCK), 0.1 * h + 0.04, { decay: 0.45, hard: 0.8 });
  if (st.edge === 'blade') tear(o, rand(0.1, 0.16), { gain: 0.3 * h, type: 'bandpass', f: rand(3000, 4200), q: 2.5, delay: 0.006 }, 0.5);
  else noise(o, { type: 'bandpass', f: 4200, f1: 2500, q: 3, dur: 0.07, gain: 0.2 * h, delay: 0.005 });
  // the point finds a gap
  gore(at(o, 0.02), st, h, 0.35);
  rattle(o, { count: 6, spread: 0.12, fLo: 1800, fHi: 4500, decay: 0.04, fade: 2 }, { gain: 0.3 * h, delay: 0.01, type: 'highpass', f: 1500 });
  thump(o, 120 / Math.sqrt(d.weight), 48, 0.18, 0.4 * h, 0.004);
}

/** The knock-back's blast of air: broad noise swelling round 2.5 kHz over ~0.3 s. */
function blast(o: Out, h: number): void {
  const len = rand(0.26, 0.34);
  noise(o, { color: 'pink', type: 'bandpass', f: rand(2300, 2800), q: 0.7, type2: 'highpass', f2: 500, dur: len, gain: 0.3 * h, shape: SHAPES.swing(rand(0.3, 0.4), 1.4) });
  noise(o, { color: 'brown', type: 'lowpass', f: 400, dur: len * 0.8, gain: 0.3 * h, shape: SHAPES.swing(0.25, 1.4) });
}

// ------------------------------------------------------------------ guards

/** The crack every clash opens with: broadband noise a little above the ring, gone in a quarter second. */
function crack(o: Out, f: number, gain: number, dur: number, tick = 0.9): void {
  click(o, gain * tick, f * 1.3, 0.008);
  noise(o, { type: 'bandpass', f: f * jit(1, 0.1), q: 0.55, type2: 'highpass', f2: 900, dur, gain, a: 0.0005 });
  noise(o, { type: 'highpass', f: f * 1.8, q: 0.7, dur: dur * 0.45, gain: gain * 0.45, a: 0.0005 });
}

/** Most clashes in the reference strike twice: the blades meet, then bite again ~60-100 ms later. */
function restrike(o: Out, fam: Family, f: number, gain: number, ring: number, pitch: number): void {
  const d = rand(0.06, 0.1);
  const o2 = at(o, d);
  noise(o2, { type: 'bandpass', f: f * jit(1, 0.1), q: 0.6, type2: 'highpass', f2: 900, dur: 0.08, gain, a: 0.0008 });
  clang(o2, fam, ring, { pitch, decay: 0.6, hard: 0.8 });
}

/** The wash the partials ring in: band noise dying away over half a second. */
function wash(o: Out, f: number, gain: number, dur: number): void {
  noise(o, { type: 'bandpass', f: f * jit(1, 0.08), q: 0.45, type2: 'highpass', f2: 1000, dur, gain, a: 0.004, delay: 0.01 });
}

/** A held block on the rapier: the low clash, lowpassed a touch, and the weight through the arm. */
function block(o: Out, a: Profile, _d: Profile, s: GuardOpts): void {
  const st = striker(a, s.anim, !!s.heavy);
  const h = s.heavy ? 1 : 0.75;
  const soft = st.edge === 'fist' || st.edge === 'grab';
  const lp = filtered(scaled(o, 1.3), 'lowpass', 9000);
  const fam = pick(BLOCK);
  crack(lp, 3000, (soft ? 0.4 : 0.8) * (0.8 + 0.3 * h), 0.12, 0.6);
  wash(lp, 3200, soft ? 0.1 : 0.32, 0.38);
  clang(lp, fam, (soft ? 0.12 : 0.2) * (0.85 + 0.2 * h), { decay: jit(soft ? 0.5 : 1.0, 0.1), hard: soft ? 0.55 : 0.85 });
  if (!soft && Math.random() < 0.6) restrike(lp, fam, 3000, 0.3, 0.07, 1);
  attackerRing(lp, st, false);
  tell(o, a, h);
  thump(o, 120 + 40 * (1 - st.mass), 55, 0.14 + 0.12 * st.mass, (0.25 + 0.45 * st.mass) * h);
}

/**
 * The parry: the crack, then the bright family ringing out for most of a second, an airy "tsing" off
 * the top. Each back-to-back deflect rings a little higher.
 */
function deflect(o0: Out, a: Profile, _d: Profile, s: GuardOpts): void {
  const st = striker(a, s.anim, !!s.heavy);
  const streak = Math.max(1, s.streak ?? 1);
  const up = 1 + 0.02 * Math.min(4, streak - 1);
  const h = s.heavy ? 1 : 0.8;
  // knuckles turned aside barely set the blade ringing
  const soft = st.edge === 'fist' || st.edge === 'grab';
  const o = scaled(o0, soft ? 1.9 : 4.0);
  crack(o, 3800, 0.7, 0.1, 0.3);
  wash(o, 4800, 0.22, 0.36);
  const fam = pick(DEFLECT);
  clang(o, fam, 0.24, { pitch: up, decay: jit(soft ? 0.45 : 0.62, 0.1), hard: soft ? 0.7 : 1 });
  // a little of the low family under it: both blades are ringing
  clang(o, pick(BLOCK), 0.1, { pitch: up, decay: 0.5, hard: 0.8 });
  if (!soft && Math.random() < 0.6) restrike(o, fam, 4500, 0.3, 0.08, up);
  // the "tsing": bright air off the clash
  noise(o, { type: 'highpass', f: 6000, f1: 9000, q: 0.7, dur: 0.07, gain: 0.35, a: 0.0006 });
  noise(o, { type: 'bandpass', f: 12500, q: 2, dur: 0.35, gain: 0.05, delay: 0.01, a: 0.004 });
  // a streak sings higher
  if (streak >= 3) osc(o, { f: fam.base * up * 1.5, dur: 0.6, gain: 0.02, delay: 0.02 });
  // the attacker's weapon and the weight of the blow, at the shared recipes' level
  attackerRing(o0, st, true);
  tell(o0, a, h);
  thump(o0, 120, 50, 0.2, 0.9 * h);
}

const voice: Voice = { swing, hit, block, deflect };

export default voice;
