/**
 * The sound design: every game sound as a recipe of layers from the toolkit. Recipes are written
 * at a nominal level and know nothing of volume, panning or the mix (engine.ts does that); each
 * takes an `Out` and the profiles of whoever is involved, and randomises itself on every call.
 */
import type { AttackAnim } from '../../shared/characters';
import { MAT, Material } from './materials';
import type { Edge, Guard, Profile } from './profiles';
import { deflectClang } from './clang';
import { playSample, sampleFor } from './samples';
import { VOICES } from './voices';
import { SHAPES, Out, at, chance, clamp, pick, crackle, crunch, debris, filtered, jit, modal, noise, osc, rand, rattle, scaled, spatter, squelch, tear, thump, via } from './synth';

// ------------------------------------------------------------------ layers

export interface RingOpts {
  pitch?: number;
  decay?: number;
  hard?: number;
  tilt?: number;
  beat?: boolean;
  delay?: number;
  maxF?: number;
}

/** Strike a material. */
export function ring(o: Out, m: Material, gain: number, r: RingOpts = {}): void {
  modal(o, {
    base: m.base * (r.pitch ?? 1) * jit(1, 0.025),
    modes: m.modes,
    gain,
    decay: r.decay,
    hard: r.hard,
    tilt: r.tilt,
    beat: r.beat === false ? 0 : m.beat,
    delay: r.delay,
    maxF: r.maxF,
  });
}

/** The hard front of a contact. */
export function click(o: Out, gain: number, f = 3500, dur = 0.012, delay = 0): void {
  noise(o, { type: 'highpass', f: jit(f, 0.1), q: 0.7, dur, gain, a: 0.0004, delay });
}

export type Strike = Edge | 'grab';

/** What actually lands: the weapon, how it meets the target, and how much weight is behind it. */
export interface Striker {
  mat: Material;
  pitch: number;
  edge: Strike;
  mass: number;
  /** the Knight's shield bash: wood and a steel boss, not the sword */
  shield?: boolean;
}

export function striker(p: Profile, anim: AttackAnim | undefined, heavy: boolean): Striker {
  const mass = Math.min(1.2, p.mass * (heavy ? 1.2 : 1));
  if (anim === 'bash' && p.guard === 'shield') return { mat: MAT.boss, pitch: 1, edge: 'blunt', mass: 0.8, shield: true };
  if (anim === 'grab') return { mat: p.metal, pitch: p.pitch, edge: 'grab', mass };
  let edge: Strike = p.edge;
  if (edge === 'blade' && (anim === 'thrust' || anim === 'charge')) edge = 'point';
  // the rapier's cuts are cuts
  if (edge === 'point' && anim && anim !== 'thrust' && anim !== 'charge') edge = 'blade';
  return { mat: p.metal, pitch: p.pitch * jit(1, 0.02), edge, mass };
}

/** Swept-band whoosh shaped like a swing: the band climbs with the weapon's speed and falls away. */
export function whoosh(o: Out, f: number, len: number, q: number, gain: number, sweep: number, pk: number, color: 'pink' | 'white' = 'pink', delay = 0): void {
  const speed = (x: number) => Math.pow(Math.max(0, x < pk ? x / pk : 1 - (x - pk) / (1 - pk)), 1.5);
  noise(o, { color, type: 'bandpass', f, fShape: (x) => 0.55 + (sweep - 0.55) * speed(x), q, dur: len, gain, shape: SHAPES.swing(pk, 2), type2: 'highpass', f2: 140, delay });
}

// ------------------------------------------------------------------ swings

export interface SwingOpts {
  heavy?: boolean;
  anim?: AttackAnim;
  /** delay before the follow-through gear rattle (s); default near the whoosh's end */
  follow?: number;
}

/**
 * A swing through the air. The whoosh's band, length and whistle come from the weapon; the end of
 * it is the follow-through (the gear settling, the chain swinging back), which the engine cuts off
 * if the blow lands, so a miss sounds like a miss: the whole whoosh carrying on through nothing.
 */
export function swing(o0: Out, p: Profile, s: SwingOpts = {}): void {
  // a recorded swing for this fighter, if there is one (see SAMPLE_SETS): heavies slower and lower
  if (recordedSwing(o0, p, s)) return;
  const voice = VOICES[p.id]?.swing;
  if (voice) voice(o0, p, s);
  else BASE.swing(o0, p, s);
}

function swingBase(o0: Out, p: Profile, s: SwingOpts = {}): void {
  const sw = p.swing;
  const o = scaled(o0, sw.gain);
  const anim = s.anim;
  const heavy = !!s.heavy;
  const thrust = anim === 'thrust' || anim === 'charge';
  const wide = anim === 'spin' || anim === 'sweep';
  const big = anim === 'overhead' || anim === 'slam' || anim === 'uppercut';
  const bash = anim === 'bash' && p.guard === 'shield';
  let len = sw.len * (heavy ? 1.35 : 1) * (thrust ? 0.7 : wide ? 1.5 : big ? 1.15 : 1) * jit(1, 0.12);
  let f = sw.f * (heavy ? 0.86 : 1) * (thrust ? 1.15 : 1) * jit(1, 0.08);
  if (bash) {
    // the shield shoves the air: a broad, low whuff
    f = 480;
    len = 0.2;
  }
  const pk = thrust ? rand(0.3, 0.4) : rand(0.5, 0.62);
  const speed = (x: number) => Math.pow(Math.max(0, x < pk ? x / pk : 1 - (x - pk) / (1 - pk)), 1.5);
  let air = o;
  if (sw.whirl) {
    // a chain spun round: the whoosh comes and goes
    const am = o.ctx.createGain();
    am.gain.value = 0.55;
    const lfo = o.ctx.createOscillator();
    lfo.frequency.value = jit(sw.whirl, 0.12);
    const lg = o.ctx.createGain();
    lg.gain.value = 0.45;
    lfo.connect(lg).connect(am.gain);
    lfo.start(o.t);
    lfo.stop(o.t + len + 0.1);
    air = via(o, am);
  }
  whoosh(air, f, len, sw.q, 0.55, sw.sweep, pk);
  // the edge singing
  if (sw.whistle > 0 && !bash) {
    noise(air, { type: 'bandpass', f: f * jit(1.9, 0.05), fShape: (x) => 0.55 + (sw.sweep - 0.55) * speed(x), q: rand(9, 14), dur: len * 0.9, gain: sw.whistle * 0.32, shape: SHAPES.swing(pk, 3) });
  }
  // the weight moving
  if (sw.body > 0 || bash) {
    const b = bash ? 0.6 : sw.body;
    noise(air, { color: 'brown', type: 'lowpass', f: 260, fShape: (x) => 0.6 + speed(x), q: 0.8, dur: len * 1.15, gain: b * 0.9, shape: SHAPES.swing(pk, 1.6) });
    osc(air, { f: rand(70, 95), f1: rand(45, 60), dur: len * 1.1, gain: b * 0.16, shape: SHAPES.swing(pk, 2) });
  }
  // the second knife
  if (sw.pair) whoosh(o, f * jit(1.12, 0.04), len * 0.9, sw.q, 0.42, sw.sweep, pk, 'pink', rand(0.05, 0.08));
  // the sleeve cracks at full extension
  if (sw.snap) noise(o, { type: 'highpass', f: 2200, dur: 0.035, gain: sw.snap * 0.4, a: 0.001, delay: len * pk });
  if (p.chain) rattle(o, { count: heavy ? 16 : 10, spread: len, fLo: 2600, fHi: 6500, decay: 0.035, fade: 1, whirl: sw.whirl }, { gain: 0.32, type: 'highpass', f: 1800 });
  // the charged spear spits as it moves
  if (p.lightning) crackle(o, len * 0.9, 30, { gain: heavy ? 0.5 : 0.36, type: 'highpass', f: 2500 });
  followThrough(at(o, s.follow ?? len * 0.8), p, heavy);
}

/** The gear settling as a swing carries through. */
function followThrough(o: Out, p: Profile, heavy: boolean): void {
  const h = heavy ? 1 : 0.7;
  switch (p.body) {
    case 'plate':
      rattle(o, { count: heavy ? 7 : 4, spread: 0.12, fLo: 1600, fHi: 4200, decay: 0.05, fade: 1.5 }, { gain: 0.3 * h, type: 'highpass', f: 1200 });
      if (p.weight > 1.4) ring(o, MAT.plate, 0.05 * h, { pitch: p.plate / MAT.plate.base, decay: 0.5, hard: 0.3 });
      break;
    case 'robe':
      noise(o, { color: 'pink', type: 'bandpass', f: 700, f1: 380, q: 0.8, dur: 0.22, gain: 0.25 * h, shape: SHAPES.swing(0.3, 1.5) });
      break;
    case 'cloth':
      noise(o, { color: 'pink', type: 'bandpass', f: 1300, f1: 700, q: 0.9, dur: 0.12, gain: 0.15 * h, shape: SHAPES.swing(0.3, 1.5) });
      break;
    case 'leather':
      noise(o, { type: 'bandpass', f: 1800, q: 3, dur: 0.05, gain: 0.07 * h });
      break;
    case 'bare':
      break;
  }
  if (p.chain) rattle(o, { count: 8, spread: 0.25, fLo: 2400, fHi: 6000, decay: 0.04, fade: 2 }, { gain: 0.24, type: 'highpass', f: 1800, delay: 0.03 });
}

// ------------------------------------------------------------------ hits

export interface HitOpts {
  heavy?: boolean;
  anim?: AttackAnim;
  /** the blow was soaked by hyper-armour */
  armor?: boolean;
  tipper?: boolean;
  backstab?: boolean;
}

/** What only this attacker's weapon brings to any contact: the chain whipping in, the spear's spark. */
function tell(o: Out, a: Profile, h: number): void {
  if (a.chain) rattle(o, { count: 9, spread: 0.12, fLo: 2400, fHi: 6500, decay: 0.04, fade: 2 }, { gain: 0.35 * h, type: 'highpass', f: 1800, delay: 0.005 });
  if (a.lightning) {
    crackle(o, 0.18, 50, { gain: 0.48 * h, type: 'highpass', f: 2200 });
    noise(o, { type: 'highpass', f: 3000, dur: 0.02, gain: 0.4 * h, a: 0.0005 });
  }
}

/** A clean hit: what the attacker's weapon does to what the defender is wearing. */
export function hit(o: Out, a: Profile, d: Profile, s: HitOpts = {}): void {
  // a recorded hit for this weapon, if there is one (see SAMPLE_SETS)
  if (recordedHit(o, a, s)) return;
  const voice = VOICES[a.id]?.hit;
  if (voice) voice(o, a, d, s);
  else BASE.hit(o, a, d, s);
}

function hitBase(o: Out, a: Profile, d: Profile, s: HitOpts = {}): void {
  const st = striker(a, s.anim, !!s.heavy);
  const h = (s.heavy ? 1 : 0.7) * (s.backstab ? 1.15 : 1);
  click(o, 0.15 + 0.5 * h, st.edge === 'blunt' ? 1800 : 3200, 0.01);
  if (d.body === 'plate') onPlate(o, st, d, h);
  else onBody(o, st, d, h, !!s.armor);
  if (s.armor) {
    // braced through it: a dull, solid thud with no give
    thump(o, 72, 40, 0.3, 0.6 * h, 0.006);
    noise(o, { color: 'brown', type: 'lowpass', f: 320, dur: 0.25, gain: 0.5 * h });
  }
  // the very tip: a needle ting on top
  if (s.tipper) ring(o, st.mat, 0.12, { pitch: st.pitch * 1.03, decay: 0.6 });
  tell(o, a, h);
}

export function bodyLayer(o: Out, d: Profile, h: number): void {
  switch (d.body) {
    case 'cloth':
      noise(o, { color: 'pink', type: 'bandpass', f: 1700, f1: 700, q: 0.9, dur: 0.09, gain: 0.25 * h });
      break;
    case 'robe':
      noise(o, { color: 'pink', type: 'bandpass', f: 1000, f1: 400, q: 0.8, dur: 0.2, gain: 0.5 * h });
      noise(o, { color: 'pink', type: 'lowpass', f: 600, dur: 0.12, gain: 0.2 * h, delay: 0.01 });
      break;
    case 'leather':
      ring(o, MAT.leather, 0.25 * h);
      noise(o, { type: 'bandpass', f: 1100, q: 2, dur: 0.04, gain: 0.3 * h });
      break;
    case 'bare':
      // skin: a wet-less slap and the muscle under it
      noise(o, { type: 'bandpass', f: 2600, q: 0.9, dur: 0.025, gain: 0.45 * h, a: 0.0005 });
      noise(o, { color: 'pink', type: 'bandpass', f: 520, q: 1.2, dur: 0.06, gain: 0.35 * h });
      break;
    case 'plate':
      break;
  }
}

/**
 * The wet half of a blade landing: the flesh giving under the edge (a thick squelch, lower and
 * longer for a heavier blade), the hiss of blood flung off the cut, and the drops landing a beat
 * later. `k` scales it all (armour and plate soak most of it).
 */
export function gore(o: Out, st: Striker, h: number, k: number): void {
  if (k <= 0) return;
  const pt = st.edge === 'point';
  // a knife opens a quick, high nick; a greatsword or glaive a deep, long one
  const low = 1 / (0.7 + 0.55 * st.mass);
  const len = (pt ? 0.075 : 0.12) * (0.75 + 0.5 * h) * (0.8 + 0.45 * st.mass);
  squelch(o, len, (pt ? 1500 : 2300) * low, (pt ? 240 : 360) * low, { gain: (0.9 * h + 0.35) * k, delay: 0.003 }, pt ? 0.6 : 1);
  // the meat of it: a short wet thwack under the squelch
  thump(o, rand(170, 210) * low, 70, 0.08, (0.45 * h + 0.15) * k, 0.002);
  noise(o, { color: 'pink', type: 'bandpass', f: 900 * low, q: 1.4, dur: 0.05, gain: (0.4 * h + 0.15) * k, a: 0.0008 });
  if (!pt) {
    // blood flung off the edge: a spray that swells and falls away along the follow-through
    noise(o, { color: 'pink', type: 'bandpass', f: rand(3000, 3800) * low, f1: 1100 * low, q: 1.1, dur: 0.18 + 0.14 * h, gain: (0.22 + 0.25 * h) * k, delay: 0.012, shape: SHAPES.swing(0.22, 1.6) });
  }
  // and landing: drops spattering on the ground
  spatter(o, Math.round((pt ? 3 : 5) + 9 * h), 0.22 + 0.18 * h, 450, 1500, { gain: (0.32 + 0.2 * h) * k, delay: rand(0.06, 0.1), type: 'highpass', f: 260 });
}

export function onBody(o: Out, st: Striker, d: Profile, h: number, armor: boolean): void {
  // a cut has to read over the swing that carried it
  const cut = armor ? 0.8 : 1.6;
  switch (st.edge) {
    case 'blade':
      // the slice: a bright band falling away fast, then fibres parting
      noise(o, { type: 'bandpass', f: rand(4800, 6200), f1: rand(1400, 1900), q: 1.3, dur: rand(0.06, 0.09) * (0.8 + 0.4 * h), gain: (0.5 * h + 0.15) * cut, a: 0.001 });
      tear(o, rand(0.09, 0.15) * (0.8 + 0.4 * h), { gain: (0.55 * h + 0.2) * cut, type: 'bandpass', f: rand(2200, 3200), q: 0.7, delay: 0.004 });
      ring(o, st.mat, 0.08 * h, { pitch: st.pitch, decay: 0.28, hard: 0.6 });
      gore(o, st, h, armor ? 0.35 : 1);
      break;
    case 'point':
      // a puncture: a short, tight "thk"
      noise(o, { type: 'bandpass', f: rand(1300, 1700), f1: 600, q: 2.2, dur: 0.04, gain: (0.6 * h + 0.2) * cut, a: 0.0006 });
      tear(o, 0.06, { gain: (0.3 * h + 0.1) * cut, type: 'bandpass', f: 1800, q: 1 }, 0.6);
      ring(o, st.mat, 0.06 * h, { pitch: st.pitch, decay: 0.3, hard: 0.7 });
      gore(o, st, h, armor ? 0.35 : 1);
      break;
    case 'blunt':
      // the full weight landing: a deep thud, a crunch through it, the air knocked out
      thump(o, rand(95, 115), 34, 0.45 * (0.8 + 0.4 * h), 0.8 * h + 0.15);
      crunch(o, 0.14 + 0.08 * h, { gain: 0.75 * h + 0.15, type: 'lowpass', f: 1600 });
      noise(o, { color: 'pink', type: 'lowpass', f: 1200, f1: 150, dur: 0.32, gain: 0.45 * h + 0.1 });
      if (st.shield) ring(o, MAT.wood, 0.45, { pitch: rand(0.9, 1.1), decay: 1.2 });
      else ring(o, st.mat, 0.14 * h, { decay: 0.4, hard: 0.5 });
      break;
    case 'fist':
      // knuckles: a tight low punch and the slap of skin
      thump(o, rand(140, 165), 58, 0.14, 0.85 * h + 0.2);
      noise(o, { type: 'bandpass', f: rand(2200, 2900), q: 1.1, dur: 0.028, gain: 0.7 * h + 0.15, a: 0.0005 });
      noise(o, { color: 'pink', type: 'lowpass', f: 700, dur: 0.09, gain: 0.45 * h });
      ring(o, MAT.bronze, 0.04, { decay: 0.2, hard: 0.4 });
      break;
    case 'grab':
      // seized: cloth bunching in a fist and the body yanked
      noise(o, { color: 'pink', type: 'bandpass', f: 900, f1: 600, q: 0.9, dur: 0.16, gain: 0.45, shape: SHAPES.swing(0.25, 1.5) });
      thump(o, 120, 60, 0.2, 0.6);
      break;
  }
  bodyLayer(o, d, h * 1.4);
  // the body taking the blow
  thump(o, 150 / Math.sqrt(d.weight), 52, 0.16 + 0.1 * st.mass, (0.35 + 0.5 * st.mass) * h, 0.004);
}

/** A blow on armour plate: the plate's clank, the weapon ringing off it, and the body inside. */
export function onPlate(o: Out, st: Striker, d: Profile, h: number): void {
  const pp = d.plate / MAT.plate.base;
  switch (st.edge) {
    case 'blade':
      ring(o, MAT.plate, 0.5 * h + 0.15, { pitch: pp, hard: 0.9 });
      ring(o, st.mat, 0.12 * h + 0.04, { pitch: st.pitch, decay: 0.45, hard: 0.8 });
      // the edge skating across it
      tear(o, rand(0.12, 0.2), { gain: 0.35 * h, type: 'bandpass', f: rand(3000, 4200), q: 2.5, delay: 0.006 }, 0.5);
      // and finds the gaps between the plates
      gore(at(o, 0.02), st, h, 0.4);
      break;
    case 'point':
      ring(o, MAT.plate, 0.45 * h + 0.12, { pitch: pp * 1.05, hard: 0.75, decay: 0.8 });
      ring(o, st.mat, 0.14 * h, { pitch: st.pitch, decay: 0.4 });
      click(o, 0.4, 6000, 0.006);
      noise(o, { type: 'bandpass', f: 4200, f1: 2500, q: 3, dur: 0.07, gain: 0.2 * h, delay: 0.005 });
      gore(at(o, 0.015), st, h, 0.4);
      break;
    case 'blunt':
      // a hammer into plate: a huge dented clang, and the body inside it
      ring(o, MAT.plate, 0.6 * h + 0.2, { pitch: pp * 0.92, decay: 1.4 });
      ring(o, st.shield ? MAT.boss : st.mat, 0.3 * h, { decay: 0.6 });
      if (st.shield) ring(o, MAT.wood, 0.4, { decay: 1.2 });
      crunch(o, 0.12, { gain: 0.6 * h, type: 'bandpass', f: 1400, q: 0.8 });
      thump(o, 90, 30, 0.5, 1.0 * h + 0.2);
      noise(o, { color: 'pink', type: 'lowpass', f: 900, f1: 120, dur: 0.35, gain: 0.5 * h });
      break;
    case 'fist':
      ring(o, MAT.plate, 0.22 * h, { pitch: pp, hard: 0.4, decay: 0.6 });
      ring(o, MAT.bronze, 0.08, { decay: 0.3, hard: 0.5 });
      thump(o, 130, 55, 0.16, 0.75 * h);
      noise(o, { type: 'bandpass', f: 2400, q: 1.2, dur: 0.025, gain: 0.4 * h });
      break;
    case 'grab':
      thump(o, 110, 55, 0.2, 0.6);
      break;
  }
  // mail and straps under the plate
  rattle(o, { count: st.edge === 'grab' ? 12 : 6, spread: 0.12, fLo: 1800, fHi: 4500, decay: 0.04, fade: 2 }, { gain: 0.3 * h, delay: 0.01, type: 'highpass', f: 1500 });
  thump(o, 120 / Math.sqrt(d.weight), 48, 0.18, 0.45 * h, 0.004);
}

// ------------------------------------------------------------------ guards: block, deflect, guard break

export type Contact = 'block' | 'deflect' | 'break';

/** The striking weapon ringing as it meets a guard. */
export function strikerRing(o: Out, st: Striker, c: Contact, dec: number, hard: number, up: number): void {
  const big = c === 'deflect';
  switch (st.edge) {
    case 'blade':
    case 'point':
      ring(o, st.mat, big ? 0.5 : 0.3, { pitch: st.pitch * up, decay: dec, hard });
      break;
    case 'blunt':
      if (st.shield) {
        ring(o, MAT.wood, 0.6, { decay: 1.2 });
        ring(o, MAT.boss, 0.3, { decay: dec });
      } else {
        // the iron head: a deep dong, and the mass of it behind
        ring(o, MAT.hammer, big ? 0.6 : 0.5, { pitch: up, decay: dec * 1.2, hard });
        noise(o, { color: 'brown', type: 'lowpass', f: 300, dur: 0.3, gain: 0.5 });
      }
      break;
    case 'fist':
      // knuckles don't ring: wraps and a bronze plate ticking
      noise(o, { type: 'bandpass', f: 1800, q: 1, dur: 0.03, gain: 0.45, a: 0.0005 });
      ring(o, MAT.bronze, big ? 0.25 : 0.12, { pitch: up, decay: dec * 0.6, hard: 0.6 });
      break;
    case 'grab':
      break;
  }
}

export function onGuard(o: Out, d: Profile, st: Striker, c: Contact, h: number, anim: AttackAnim | undefined, streak: number, forceRim?: boolean): void {
  const big = c === 'deflect';
  const dec = big ? 1 : c === 'break' ? 0.7 : 0.42;
  const hard = big ? 1 : 0.75;
  // a held block is duller than a perfect deflect: the highs are rolled off
  const lp = c === 'block' ? filtered(o, 'lowpass', 6500) : o;
  const up = big ? 1 + 0.02 * Math.min(4, streak - 1) : 1;
  strikerRing(lp, st, c, dec, hard, up);
  // a fist barely sets a blade ringing
  const soft = st.edge === 'fist' || st.edge === 'grab';
  switch (d.guard) {
    case 'blade':
      ring(lp, d.metal, (big ? 0.5 : 0.32) * (soft ? 0.6 : 1), { pitch: d.pitch * up, decay: dec * (soft ? 0.5 : 1), hard: soft ? 0.55 : hard });
      // the blades slide along each other on a held block
      if (c === 'block' && !soft && st.edge !== 'blunt') noise(o, { type: 'bandpass', f: 3000, f1: 1800, q: 4, dur: 0.12, gain: 0.12, delay: 0.01 });
      break;
    case 'knives':
      // caught between two crossed knives
      ring(lp, d.metal, big ? 0.38 : 0.26, { pitch: up, decay: dec, hard });
      ring(lp, d.metal, big ? 0.28 : 0.18, { pitch: up * 1.07, decay: dec, hard, delay: 0.004 });
      break;
    case 'hammer':
      // taken on the iron head or the iron-shod haft
      ring(lp, MAT.hammer, big ? 0.55 : 0.45, { pitch: up, decay: dec * 1.2, hard });
      ring(lp, MAT.haft, 0.3, { pitch: 0.8 });
      break;
    case 'haft':
      // on the ash shaft: a wooden knock and the iron fittings
      ring(lp, MAT.haft, 0.7, { pitch: rand(0.9, 1.1) });
      ring(lp, MAT.glaive, big ? 0.3 : 0.16, { pitch: up, decay: dec * 0.6, hard: 0.6 });
      noise(o, { type: 'bandpass', f: 900, q: 2, dur: 0.03, gain: 0.3 });
      break;
    case 'chain':
      // the chain pulled taut between the hands, and the sickle behind it
      rattle(o, { count: big ? 18 : 12, spread: big ? 0.22 : 0.14, fLo: 2200, fHi: 6000, decay: 0.05, fade: 1.5 }, { gain: 0.55, type: 'highpass', f: 1500 });
      ring(lp, MAT.sickle, big ? 0.4 : 0.22, { pitch: up, decay: dec, hard });
      break;
    case 'bracer':
      // forearms: leather over muscle, a bronze plate on top
      ring(lp, MAT.leather, 0.5);
      noise(o, { type: 'bandpass', f: 1000, q: 1.5, dur: 0.05, gain: 0.45 });
      ring(lp, MAT.bronze, big ? 0.45 : 0.2, { pitch: up, decay: dec, hard });
      break;
    case 'shield': {
      // the rim or the face? overheads come down on the rim, a parry turns the blow off the edge
      let rim = big ? chance(0.6) : anim === 'overhead' || anim === 'slam' ? chance(0.65) : chance(0.25);
      if (st.edge === 'blunt' || soft) rim = chance(0.15);
      if (forceRim !== undefined) rim = forceRim;
      if (rim) {
        // the steel rim: bright, over a muffled wooden knock
        ring(lp, MAT.rim, big ? 0.55 : 0.38, { pitch: up, decay: dec * 1.1, hard });
        ring(lp, MAT.wood, 0.35);
        click(o, 0.35, 5000);
      } else {
        // the face: planks under leather, the boss and the bands
        ring(lp, MAT.wood, 0.8, { pitch: rand(0.92, 1.08), decay: 1.2 });
        ring(lp, MAT.boss, big ? 0.35 : 0.2, { pitch: up, decay: dec * 1.2, hard: hard * 0.8 });
        noise(o, { color: 'pink', type: 'lowpass', f: 900, f1: 200, dur: 0.14, gain: 0.55 });
        noise(o, { type: 'bandpass', f: 1300, q: 1.6, dur: 0.035, gain: 0.35 });
      }
      break;
    }
  }
  click(o, big ? 0.55 : 0.4, big ? 5200 : 3000, 0.01);
  // the weight of the blow, taken through the arms
  thump(o, 120 + 40 * (1 - st.mass), 55, 0.14 + 0.12 * st.mass, (0.3 + 0.5 * st.mass) * h * (big ? 0.8 : 1));
}

export interface GuardOpts {
  heavy?: boolean;
  anim?: AttackAnim;
  /** back-to-back deflects: each one rings a little higher */
  streak?: number;
  /** a shield struck on its rim (true) or face (false); left to chance otherwise */
  rim?: boolean;
}

/** A held block: a dull, damped clash and the weight of it. */
export function block(o: Out, a: Profile, d: Profile, s: GuardOpts = {}): void {
  // the recorded block, for everyone
  const rec = sampleFor(o.ctx, 'block');
  if (rec) {
    playSample(o, rec, sampleGain('block') * (s.heavy ? 1.15 : 1), jit(1, 0.04) * (s.heavy ? 0.9 : 1));
    return;
  }
  const voice = VOICES[d.id]?.block;
  if (voice) voice(o, a, d, s);
  else BASE.block(o, a, d, s);
}

function blockBase(o: Out, a: Profile, d: Profile, s: GuardOpts = {}): void {
  const st = striker(a, s.anim, !!s.heavy);
  const h = s.heavy ? 1 : 0.75;
  onGuard(o, d, st, 'block', h, s.anim, 1, s.rim);
  tell(o, a, h);
  noise(o, { type: 'bandpass', f: jit(2000, 0.1), q: 1.5, dur: 0.04, gain: 0.35 });
  if (d.body === 'plate') rattle(o, { count: 4, spread: 0.08, fLo: 1800, fHi: 4200, decay: 0.04 }, { gain: 0.22, delay: 0.015, type: 'highpass', f: 1500 });
}

/** The perfect deflect: the sound the game is named for. Bright, ringing, and long. */
export function deflect(o: Out, a: Profile, d: Profile, s: GuardOpts = {}): void {
  // one clang for everyone: a take of the recorded clash, or the synthesised one (clang.ts) until
  // the recordings have decoded. Back-to-back deflects climb a little in pitch and level. And
  // every deflect rings out after it (deflectRing), so it is never mistaken for a block or a hit.
  void a;
  const streak = Math.min(4, Math.max(1, s.streak ?? 1)) - 1;
  deflectRing(o, !!s.heavy, streak);
  // the Knight's deflect is his own: a sword hit ringing off his shield, not the shared clang
  const shield = d.id === 'paladin' ? sampleFor(o.ctx, 'paladin_parry') : null;
  if (shield) {
    playSample(o, shield, sampleGain('paladin_parry') * (s.heavy ? 1.15 : 1), jit(1, 0.04));
    const ring = sampleFor(o.ctx, 'paladin_shield');
    if (ring) playSample(o, ring, sampleGain('paladin_shield') * (s.heavy ? 1.15 : 1), jit(1, 0.04));
    // and a breath of the holy light off the shield
    const holy = sampleFor(o.ctx, 'paladin_holy');
    if (holy) playSample(o, holy, sampleGain('paladin_holy') * 0.4, jit(1.1, 0.03), 0.02, 0.5);
    const shimmer = sampleFor(o.ctx, 'paladin_shimmer');
    if (shimmer) playSample(o, shimmer, sampleGain('paladin_shimmer') * 0.6, jit(1.05, 0.03), 0.02, 0.3);
    return;
  }
  const buf = sampleFor(o.ctx, 'deflect');
  if (!buf) {
    deflectClang(o, s);
    return;
  }
  playSample(o, buf, DEFLECT_GAIN * (1 + 0.08 * streak) * (s.heavy ? 1.1 : 1), jit(1, 0.035) * (1 + 0.025 * streak));
}

/**
 * What makes a deflect a deflect: the steel ringing out after the clash. The shield strike's ring
 * (the user's) pitched up to a blade's, a sword's own partials singing on for a couple of seconds
 * over it, a crackle of sparks and a low punch for the weight. A streak climbs in pitch.
 */
function deflectRing(o: Out, heavy: boolean, streak: number): void {
  const up = 1 + 0.05 * streak;
  const shieldRing = sampleFor(o.ctx, 'paladin_shield');
  if (shieldRing) playSample(o, shieldRing, sampleGain('paladin_shield') * 2.4 * (heavy ? 1.15 : 1), jit(1.42, 0.02) * up, 0.004);
  ring(o, MAT.katana, heavy ? 0.42 : 0.34, { pitch: 1.12 * up, decay: 1.7, delay: 0.006 });
  crackle(o, 0.12, 55, { gain: 0.38, type: 'highpass', f: 3500 });
  noise(o, { type: 'highpass', f: 6000, dur: 0.04, gain: 0.55, a: 0.0004 });
  thump(o, 150, 62, 0.18, heavy ? 0.75 : 0.6);
}

/** The recorded deflect's level in the mix, matched to the synthesised one's loudness. */
const DEFLECT_GAIN = 1.6;
/**
 * Which recordings each fighter's swings and hits use: a pool of takes (one picked at random), and
 * layers on top (`swingLayer` on every swing, `heavySwingLayer` on heavies, `hitLayer` on every hit,
 * `heavyHitLayer` on heavies). Fighters not listed keep their synthesised sounds.
 */
interface SampleSet {
  swing?: string[];
  /** more heavy-swing layers stacked on top: one of `heavyExtra` (picked at random), and `heavyShimmer` */
  heavyExtra?: string[];
  heavyShimmer?: string;
  /** the swing takes' level */
  swingGain?: number;
  swingLayer?: string;
  heavySwingLayer?: string;
  hit?: string[];
  /** the flesh take's level under its layers */
  hitGain?: number;
  hitLayer?: string;
  heavyHitLayer?: string;
  /** how far over its matched level every layer sits (the Lancer's lightning is meant to be heard) */
  layerGain?: number;
}
const SAMPLE_SETS: Record<string, SampleSet> = {
  ronin: { swing: ['ronin_swing'], hit: ['ronin_hit'] },
  duelist: { swing: ['duelist_swing'], hitGain: 0.6 },
  // the glaive's whoosh or the katana's, lightning crackling behind it; the cut arcs, a heavy strikes
  lancer: { swing: ['lancer_swing', 'ronin_swing'], swingLayer: 'lancer_zap', hitGain: 0.6, hitLayer: 'lancer_spark', heavyHitLayer: 'lancer_bolt', layerGain: 3.3 },
  // the katana's swooshes (weightier) with a holy glow on heavies; every cut lands with a radiant impact
  // heavies stack the glow, a dark or a fiery whoosh and the holy shimmer; hits ring out pure
  paladin: { swing: ['ronin_swing'], swingGain: 1.5, heavySwingLayer: 'paladin_glow', heavyExtra: ['paladin_darkwhoosh', 'paladin_firewhoosh'], heavyShimmer: 'paladin_shimmer', hitGain: 0.75, hitLayer: 'paladin_impact', heavyHitLayer: 'paladin_shimmer' },
  // the scythe: cloth and metal swooshes, an axe's swing, a heavy sword's slow one; a fiery demon's
  // whoosh through his heavies
  reaper: { swing: ['reaper_scythe'], heavySwingLayer: 'reaper_firewhoosh', hitGain: 0.78 },
  // knife shings, slicing the air
  shade: { swing: ['shade_swing'], hitGain: 0.78 },
  // deep, heavy hammer whooshes; and a hammer lands harder than a sword
  juggernaut: { swing: ['juggernaut_swing'], hitGain: 1.4 },
  // dry punch whooshes (crystal glitter on his heavies), and crisp punches landing
  monk: { swing: ['monk_swing'], heavySwingLayer: 'monk_glitter', hit: ['monk_punch'] },
};
/** Every fighter's hit, unless their set names their own: the Ronin's brutal bloody slash (or one of its takes). */
const DEFAULT_HIT = ['ronin_hit'];

function recordedSwing(o: Out, p: Profile, s: SwingOpts): boolean {
  // the Ronin's iai: the blade drawn from the sheath into the cut (started well into the clip,
  // since the draw is over in ~130 ms)
  if (p.id === 'ronin' && s.anim === 'draw') {
    const draw = sampleFor(o.ctx, 'ronin_unsheathe');
    if (draw) {
      playSample(o, draw, sampleGain('ronin_unsheathe'), jit(1, 0.02), 0, 0.16);
      return true;
    }
  }
  const set = SAMPLE_SETS[p.id];
  if (!set) return false;
  // the heavy layer swells a beat ahead, so start it part way in (it plays over a synthesised
  // swing too, for a fighter with no recorded swing of their own)
  const heavy = s.heavy && set.heavySwingLayer ? sampleFor(o.ctx, set.heavySwingLayer) : null;
  if (heavy) playSample(o, heavy, sampleGain(set.heavySwingLayer!), jit(1, 0.04), 0, 0.14);
  if (s.heavy && set.heavyExtra) {
    const name = pick(set.heavyExtra);
    const extra = sampleFor(o.ctx, name);
    if (extra) playSample(o, extra, sampleGain(name), jit(1, 0.04), 0, 0.22);
  }
  const shimmer = s.heavy && set.heavyShimmer ? sampleFor(o.ctx, set.heavyShimmer) : null;
  if (shimmer) playSample(o, shimmer, sampleGain(set.heavyShimmer!), jit(1, 0.03), 0, 0.2);
  if (!set.swing) return false;
  const take = pick(set.swing);
  const rec = sampleFor(o.ctx, take);
  if (!rec) return false;
  const thrust = s.anim === 'thrust' || s.anim === 'charge';
  playSample(o, rec, sampleGain(take) * (set.swingGain ?? 1) * (s.heavy ? 1.15 : 1), jit(1, 0.04) * (s.heavy ? 0.86 : thrust ? 1.08 : 1));
  const layer = set.swingLayer && sampleFor(o.ctx, set.swingLayer);
  if (layer) playSample(o, layer, sampleGain(set.swingLayer!) * (s.heavy ? 1.3 : 1) * (set.layerGain ?? 1), jit(1, 0.06), 0.02);
  return true;
}

function recordedHit(o: Out, a: Profile, s: HitOpts): boolean {
  // a shield bash is no cut: it lands with the shield's own clang (any other bash keeps its
  // synthesised thud)
  if (s.anim === 'bash') {
    const bash = a.guard === 'shield' ? sampleFor(o.ctx, 'paladin_bash') : null;
    if (!bash) return false;
    playSample(o, bash, sampleGain('paladin_bash') * (s.heavy ? 1.2 : 1), jit(1, 0.04) * (s.heavy ? 0.9 : 1), 0, 0.04);
    return true;
  }
  // everyone else cuts with their own takes or the default slice, and the Monk punches with his
  const set = SAMPLE_SETS[a.id] ?? {};
  const take = pick(set.hit ?? DEFAULT_HIT);
  const rec = sampleFor(o.ctx, take);
  if (!rec) return false;
  const h = (s.heavy ? 1.2 : 1) * (s.armor ? 0.75 : 1) * (s.backstab ? 1.1 : 1);
  // started a little into the clip, where it has swelled, so it lands with the blow
  playSample(o, rec, sampleGain(take) * h * (set.hitGain ?? 1), jit(1, 0.04) * (s.heavy ? 0.88 : 1), 0, 0.04);
  const layer = set.hitLayer && sampleFor(o.ctx, set.hitLayer);
  if (layer) playSample(o, layer, sampleGain(set.hitLayer!) * h * (set.layerGain ?? 1), jit(1, 0.05));
  const heavy = s.heavy && set.heavyHitLayer ? sampleFor(o.ctx, set.heavyHitLayer) : null;
  if (heavy) playSample(o, heavy, sampleGain(set.heavyHitLayer!) * (set.layerGain ?? 1), jit(1, 0.04));
  return true;
}

/** The other recordings' levels in the mix, each matched (by rendered loudness) to the synthesised sound it replaces. */
const SAMPLE_GAIN: Record<string, number> = {
  block: 0.79, ronin_swing: 0.28, ronin_hit: 0.34, duelist_swing: 0.62, lancer_swing: 0.3, lancer_zap: 0.12, lancer_spark: 0.07, lancer_bolt: 0.13, paladin_glow: 0.22, paladin_impact: 0.2, reaper_swing: 0.2, paladin_deflect: 0.52, ronin_unsheathe: 0.4, monk_glitter: 0.18, paladin_holy: 0.35, paladin_darkwhoosh: 0.16, paladin_firewhoosh: 0.16, paladin_shimmer: 0.14, exec_glass: 0.3, step_stone: 0.12, step_snow: 0.17,
  // the menus, the match's cues, the title screen and the entrance cues (layers share a gain, matched
  // as a whole). The synthesised wind, breath, whoosh and scrape are all but silent, so instead the
  // Ronin's wind sits 6 dB under his unsheathe, the Monk's breath matches his thump, the title
  // screen's whoosh sits 4 dB under its shing and the Wraith's scrape is level with the unsheathe;
  // the entrance stomp keeps the level of the Knight's deflect it replaces
  ui_click: 0.1, match_found: 0.16, countdown: 0.18, select_boom: 0.14, start_screech: 0.91, start_confirm: 0.91, victory_fanfare: 0.15, victory_piano: 0.15, defeat: 0.15, blade_draw: 0.39, blade_shing: 0.44, heavy_whoosh: 0.44, glass_tink: 0.72, riser_chime: 1.57, juggernaut_slam: 1.32, juggernaut_thud: 1.32, juggernaut_boom: 0.5, juggernaut_rubble: 0.5, ronin_taiko: 0.75, ronin_flute: 0.75, wind_howl: 0.2, ronin_wind_sweep: 0.2, monk_breath: 0.52, reaper_scrape: 0.18, reaper_groan: 0.18, entrance_stomp: 0.32,
  // the Knight's deflect (the sword hit and the shield ring together), at the level of the shield thud
  // it replaced; his shield bash; the Warden's step (at the level of the gravel step he had); the vanish
  // and the jump (at the roll dodge's level: the synthesised ones are near silent), the blink, the body
  // falling (matched to the synthesised fall without its weapon drop), the buff, and the lava burn (level
  // with a blade hit landing: the synthesised burn is near silent), the shockwaves (see shockwave()), the
  // stomp (at a mikiri's strength), the flash line, the chain throw, the chi, the roar (6 dB under the
  // heavy shockwave: the synthesised growl is low and quiet), the fog, whirl and soulfire (set against
  // the shockwaves and swings: the synthesised ones are near silent), the bolt's layers (level with
  // the bolt); and the
  // swings and the Monk's punches, each pool matched to the swing or hit it replaces (the Wraith's to
  // his old recorded swing)
  paladin_parry: 0.2, paladin_shield: 0.2, paladin_bash: 0.75, juggernaut_step: 0.072, vanish: 0.15, jump: 0.31, bodyfall: 0.57, buff_shimmer: 0.28, buff_fire: 0.28, lava_burn: 0.43, juggernaut_crash: 0.9, juggernaut_punch: 0.9, shock_heavy_water: 0.55, shock_heavy_slam: 0.55, shock_light_tom: 0.93, shock_light_bag: 0.93, stomp_foot: 0.44, stomp_kick: 0.44, flashline: 0.25, chain_net: 0.93, chain_metal: 0.93, chi_crystal: 0.66, chi_drone: 0.66, roar_tiger: 0.34, roar_dragon: 0.34, roar_leopard: 0.34, fog_poof: 0.41, fog_boom: 0.41, whirl_flutter: 0.25, soulfire: 0.72, bolt_summon: 0.31, bolt_crackle: 0.31, blink_dash: 0.22, blink_magic: 0.22, juggernaut_swing: 0.54, reaper_scythe: 0.27, shade_swing: 0.6, monk_swing: 0.52, monk_punch: 0.37,
  // the title screen's wind, 6 dB under its shing (as the Ronin's wind sits under his unsheathe); the
  // perilous warning (the drum and riser, matched together to the synthesised cue); the executions:
  // the Warden's finishing blow (the whoosh-punch, the bass hit and the impact, the impact level with
  // the bass), the Ronin's (the slice, the clatter and the flute), the Wraith's (his five),
  // the Duelist's (his three) and the Monk's (his four), each matched as a whole, as led in, to the
  // synthesised blow it replaces; the Lancer's
  // whoosh-bang, 2 dB under the rest of his blow; the Warden's flourish strike (the crunch over the sub
  // drop, matched to his synthesised one); over every wind-up the braaam, and over the Assassin's his
  // scream, 6 and 8 dB under the Warden's finishing blow (the synthesised wind-up is a quiet bed under
  // them); the Assassin's entrance grind, level with the Wraith's scrape; and the Warden's arrival
  // stinger, level with the bass hit it rides under (the pair is set level with his gong in entrance())
  juggernaut_finish_punch: 1.05, juggernaut_finish_bass: 1.05, juggernaut_finish_appear: 1.05, juggernaut_blow_crunch: 0.5, juggernaut_blow_drop: 0.5, exec_braaam: 1.93, shade_exec_scream: 1.23, shade_scrape: 0.21,
  ronin_finish_slice: 1.8, ronin_finish_clatter: 1.8, ronin_finish_flute: 1.8, juggernaut_triumph: 1.07, lancer_finish_bang: 1.02,
  reaper_finish_siren: 1.64, reaper_finish_depths: 1.64, reaper_finish_strings: 1.64, reaper_finish_perish: 1.64, reaper_finish_gore: 1.64,
  duelist_finish_dust: 1.23, duelist_finish_ball: 1.23, duelist_finish_wand: 1.23, monk_finish_punch: 0.94, monk_finish_punch2: 0.94, monk_finish_bones: 0.94, monk_finish_crowbar: 0.94, title_wind: 0.28,
  perilous_drum: 0.84, perilous_riser: 0.84,
  // the Knight striking his shield in his entrance: the clang and the ring as a pair, 3 dB over the
  // block clang they replace there
  paladin_shield_clang: 0.7, paladin_shield_ring: 0.7,
  // the title screen's first touch: a taiko drum hit 8 dB over its wind gust; and the match intro's
  // song, the fue, at the music's level (its momentary peaks with the songs' at the default music volume)
  title_taiko: 0.8, intro_fue: 0.44,
  // the Wraith's: his entrance's breathing (level with the Monk's breath) and void whoosh (level with
  // the old dark whoosh it replaces), the fiery whoosh 3 dB under his scythe swings, the conjuring
  // through his Reaping Arc level with the perilous warning, the shriek level with his body falling
  reaper_breath: 0.28, reaper_void: 0.14, reaper_firewhoosh: 0.13, reaper_conjure: 0.53, reaper_shriek: 0.24,
};
const sampleGain = (name: string): number => SAMPLE_GAIN[name] ?? 0.5;

/**
 * Play recordings layered, each at its mix level (times `gain`), from take `take` (or one at random)
 * and `offset` seconds in; false, playing nothing, unless every layer has decoded.
 */
export function playLayers(o: Out, names: readonly string[], gain = 1, take?: number, offset = 0): boolean {
  const bufs = names.map((n) => sampleFor(o.ctx, n, take));
  if (!bufs.every((b): b is AudioBuffer => !!b)) return false;
  bufs.forEach((b, i) => playSample(o, b, sampleGain(names[i]) * gain, 1, 0, offset));
  return true;
}
/** the recorded lightning strike as the Lancer's lightning cue (louder than under a hit) */
const BOLT_CUE_GAIN = 0.3;

function deflectBase(o: Out, a: Profile, d: Profile, s: GuardOpts = {}): void {
  const st = striker(a, s.anim, !!s.heavy);
  const streak = Math.max(1, s.streak ?? 1);
  const h = s.heavy ? 1 : 0.8;
  onGuard(o, d, st, 'deflect', h, s.anim, streak, s.rim);
  tell(o, a, h);
  // the "tsing": bright air bursting off the clash
  noise(o, { type: 'highpass', f: 5200, f1: 8000, q: 0.7, dur: 0.06, gain: 0.5, a: 0.0006 });
  // a glint rising over the ring
  osc(o, { f: rand(2900, 3300) * (1 + 0.03 * (streak - 1)), f1: rand(4400, 5200), dur: 0.22, gain: 0.045, delay: 0.015 });
  // the ring hanging in the air
  noise(o, { type: 'highpass', f: 7000, q: 0.5, dur: 0.9, gain: 0.09, delay: 0.02, a: 0.01 });
  thump(o, 110, 48, 0.26, 0.55 * h);
  // a streak sings higher
  if (streak >= 3) ring(o, MAT.rapier, 0.08, { pitch: 1.5, decay: 1.2 });
}

/**
 * What each guard adds as it is knocked away (the user's recordings), and its level against the
 * sword clatter's: the Knight's shield clanging, a blade's or the glaive's clatter, the hammer's crisp
 * punch, the chain's metal, the Monk's bracer taking a punch.
 */
const GUARD_GIVES: Record<Guard, [string, number]> = {
  shield: ['paladin_bash', 2.95],
  blade: ['ronin_finish_clatter', 1],
  knives: ['ronin_finish_clatter', 1],
  haft: ['ronin_finish_clatter', 1],
  hammer: ['juggernaut_punch', 2.02],
  chain: ['chain_metal', 5.13],
  bracer: ['monk_finish_punch2', 2],
};

/**
 * The guard caves in under the blow: the user's recorded block clash over a floor tom's thud, and the
 * guard knocked away (GUARD_GIVES), matched together to the synthesised break they replace; then the
 * falling growl players know.
 */
export function guardBreak(o: Out, a: Profile, d: Profile, s: GuardOpts = {}): void {
  if (playLayers(o, ['block', 'shock_light_tom'])) {
    const [layer, k] = GUARD_GIVES[d.guard];
    playLayers(o, [layer], k);
    tell(o, a, 1);
  } else guardBreakBase(o, a, d, s);
  // the posture giving way: the falling growl players know
  osc(filtered(o, 'lowpass', 900), { type: 'sawtooth', f: 200, f1: 60, dur: 0.5, gain: 0.2, delay: 0.02 });
}

/** The synthesised break, until the recordings decode. */
function guardBreakBase(o: Out, a: Profile, d: Profile, s: GuardOpts): void {
  const st = striker(a, s.anim, true);
  onGuard(o, d, st, 'break', 1, s.anim, 1, s.rim);
  tell(o, a, 1);
  switch (d.guard) {
    case 'shield':
      // planks splitting, the rim rattling loose
      crunch(o, 0.28, { gain: 0.9, type: 'bandpass', f: 1100, q: 0.7 });
      rattle(o, { count: 7, spread: 0.3, fLo: 900, fHi: 2600, decay: 0.12, fade: 1.5 }, { gain: 0.4 });
      break;
    case 'blade':
    case 'knives':
      // the blade forced down along the other
      noise(o, { type: 'bandpass', f: 2800, f1: 700, q: 4, dur: 0.38, gain: 0.35, shape: (x) => Math.pow(1 - x, 1.2) * Math.min(1, x * 30) });
      ring(o, d.metal, 0.2, { decay: 0.8 });
      break;
    case 'hammer':
      ring(o, MAT.hammer, 0.4, { decay: 1.4, pitch: 0.9 });
      osc(filtered(o, 'lowpass', 400), { type: 'sawtooth', f: 85, f1: 55, dur: 0.5, gain: 0.08 });
      break;
    case 'haft':
      crunch(o, 0.2, { gain: 0.7, type: 'lowpass', f: 1500 });
      ring(o, MAT.haft, 0.6, { pitch: 0.9 });
      break;
    case 'chain':
      rattle(o, { count: 30, spread: 0.5, fLo: 2000, fHi: 6000, decay: 0.06, fade: 1 }, { gain: 0.6, type: 'highpass', f: 1500 });
      break;
    case 'bracer':
      noise(o, { color: 'pink', type: 'lowpass', f: 800, dur: 0.2, gain: 0.6 });
      ring(o, MAT.bronze, 0.3, { decay: 0.8 });
      break;
  }
  thump(o, 75, 30, 0.6, 0.9);
  noise(o, { color: 'pink', type: 'lowpass', f: 3000, f1: 200, dur: 0.35, gain: 0.45 });
}

/**
 * Posture broken: the guard shatters like glass over a deep boom. The shards are the user's ringing
 * glass (matched to the synthesised shards it replaces, which play until it decodes).
 */
export function postureBreak(o: Out, d: Profile | null): void {
  void d;
  noise(o, { type: 'highpass', f: 5000, f1: 2500, q: 0.7, dur: 0.06, gain: 0.9, a: 0.001 });
  noise(o, { type: 'bandpass', f: 3500, f1: 1800, q: 2.5, dur: 0.6, gain: 0.4, delay: 0.03, a: 0.01 });
  if (!playLayers(o, ['exec_glass'], 0.87)) for (let i = 0; i < 6; i++) ring(o, MAT.shard, 0.06, { pitch: rand(1, 2.1), decay: rand(0.8, 1.6), delay: rand(0, 0.12), beat: false });
  thump(o, 90, 30, 0.9, 0.9);
  osc(filtered(o, 'lowpass', 500), { type: 'sawtooth', f: 60, f1: 28, dur: 0.7, gain: 0.25, delay: 0.02 });
}

/**
 * Thunder rolling away after one of the Lancer's bolts: a hard crack, then a low rumble that
 * swells and grumbles off for a couple of seconds, with a sub-bass drop under it.
 */
export function thunderRoll(o: Out, k: number): void {
  const s = Math.min(1.4, k);
  noise(o, { type: 'highpass', f: 1200, f1: 500, dur: 0.1, gain: 0.8 * s, a: 0.001 });
  noise(o, { color: 'brown', type: 'lowpass', f: 900, f1: 70, dur: 2.2 * s, gain: 1.1 * s, delay: 0.04, shape: SHAPES.swing(0.12, 1.6) });
  // the grumble: a second, slower roll under the first
  noise(o, { color: 'brown', type: 'lowpass', f: 300, f1: 50, dur: 2.6 * s, gain: 0.8 * s, delay: 0.35, shape: SHAPES.swing(0.3, 2) });
  osc(o, { f: 55, f1: 26, dur: 1.4 * s, gain: 0.55 * s, delay: 0.03 });
  crackle(o, 0.6 * s, 35, { gain: 0.45, type: 'highpass', f: 1800, delay: 0.05 });
}

/** A stray arc of the Lancer's charge snapping down to the ground: a spark and a short crackle. */
export function zap(o: Out, k: number): void {
  const spark = sampleFor(o.ctx, 'lancer_spark');
  if (spark) playSample(o, spark, sampleGain('lancer_spark') * 3.8 * k, jit(1, 0.1));
  crackle(o, 0.1 + 0.14 * k, 45, { gain: 0.5 * k, type: 'highpass', f: 2200 });
}

/**
 * Mikiri: the thrust read and stamped into the ground. All the user's recordings: the stamp (a
 * creature's footstep over a deep kick), the blade scraping under the foot and a floor tom's thud,
 * matched together to the synthesised mikiri they replace.
 */
export function mikiri(o: Out, a: Profile, d: Profile): void {
  void a;
  if (playLayers(o, ['stomp_foot', 'stomp_kick', 'flashline', 'shock_light_tom'], 1.95)) return;
  stompLayer(o, d, 1);
  click(o, 0.45, 2500, 0.015);
  debris(o, 6, 0.35, 600, 2200, { gain: 0.35 });
  osc(o, { type: 'triangle', f: 90, f1: 40, dur: 0.3, gain: 0.35 });
}

/** A counter: the attacker's blow turned, and the defender's answer landing on them. */
export function counter(o: Out, a: Profile, d: Profile, s: GuardOpts = {}): void {
  deflect(scaled(o, 0.7), a, d, { anim: s.anim });
  hit(at(o, 0.035), d, a, { heavy: true });
}

// ------------------------------------------------------------------ executions

const EXEC_HIT = 2.15;

function heartbeat(o: Out, g: number): void {
  const lo = filtered(o, 'lowpass', 220);
  thump(lo, 64, 38, 0.17, g);
  thump(lo, 56, 36, 0.22, g * 0.7, 0.19);
}

/** the Assassin's scream (the user's recording) is at its height this long into it */
const SCREAM_PEAK = 1.76;

/**
 * Under the execution's wind-up: the user's braaam struck on the deathblow, a low drone and rumble
 * swelling, a quickening heartbeat, and a rising rush into the blow; over the Assassin's, whispers
 * rising into a scream at its height just before the blow. The engine cuts it as the finishing blow
 * lands.
 */
export function execWindup(o: Out, a: Profile, close: boolean): void {
  const T = EXEC_HIT + 0.25;
  playLayers(o, ['exec_braaam']);
  const bed = (x: number) => Math.min(1, x * 4) * (x < 0.9 ? 1 : (1 - x) / 0.1);
  osc(o, { f: 41, dur: T, gain: 0.1, shape: bed });
  osc(o, { f: 41.9, dur: T, gain: 0.08, shape: bed });
  noise(o, { color: 'brown', type: 'lowpass', f: 140, f1: 300, dur: T, gain: 0.3, shape: (x) => (0.3 + 0.7 * x) * bed(x) });
  if (close) for (const [tb, g] of [[0.3, 0.3], [0.95, 0.38], [1.48, 0.45], [1.86, 0.5]] as const) heartbeat(at(o, tb + rand(-0.02, 0.02)), g);
  // the rush into the blow
  noise(o, { color: 'pink', type: 'bandpass', f: 300, f1: 2600, q: 1.2, dur: 0.75, gain: 0.35, shape: SHAPES.swell(3), delay: EXEC_HIT - 0.75 });
  osc(filtered(o, 'lowpass', 900), { type: 'sawtooth', f: 110, f1: 220, dur: 0.75, gain: 0.06, shape: SHAPES.swell(2), delay: EXEC_HIT - 0.75 });
  if (a.finisher === 'flurry') playLayers(at(o, EXEC_HIT - 0.2 - SCREAM_PEAK), ['shade_exec_scream']);
}

/** how long before the finishing blow its lead-in recordings start (the engine calls execLead then) */
export const EXEC_LEAD = 1.7;

/**
 * The user's finishing-blow recordings that swell into the blow, each with how long it runs before
 * it strikes (as encoded): the Warden's whoosh into a punch; the Ronin's slash sliding through and a
 * sword hit's clatter; the Wraith's siren braam, his two deep impacts, the string stab and the gory
 * slice; the Lancer's stealthy whoosh into a bang; the Duelist's fairy dust rising, a dark ball of
 * energy charging into the blow and a wand's light spell.
 */
const LEAD: Partial<Record<Profile['finisher'], [string, number][]>> = {
  crush: [['juggernaut_finish_punch', 0.116]],
  iai: [['ronin_finish_slice', 0.108], ['ronin_finish_clatter', 0.273]],
  reap: [['reaper_finish_siren', 0.55], ['reaper_finish_depths', 0.249], ['reaper_finish_strings', 0.209], ['reaper_finish_perish', 0.259], ['reaper_finish_gore', 0.081]],
  thunder: [['lancer_finish_bang', 0.541]],
  pierce: [['duelist_finish_dust', 0.54], ['duelist_finish_ball', 1.613], ['duelist_finish_wand', 0.057]],
};
export const hasLead = (a: Profile): boolean => !!LEAD[a.finisher];

/** The finishing strike's lead-in, EXEC_LEAD before the blow: each recording timed to strike on it. */
export function execLead(o: Out, a: Profile): void {
  for (const [name, lead] of LEAD[a.finisher] ?? []) playLayers(at(o, EXEC_LEAD - lead), [name]);
}

/** the finishers that are all the user's recordings: what plays on the blow itself (the rest led in) */
const ON_BLOW: Partial<Record<Profile['finisher'], string[]>> = {
  crush: ['juggernaut_finish_bass', 'juggernaut_finish_appear'],
  iai: ['ronin_finish_flute'],
  reap: [],
  pierce: [],
  palm: ['monk_finish_punch', 'monk_finish_punch2', 'monk_finish_bones', 'monk_finish_crowbar'],
};

/** The ground taking a huge blow: a deep boom, a crack, a rumble and the grit coming down. */
export function groundSlam(o: Out, scale: number, iron: boolean): void {
  const k = clamp(scale, 0.4, 2.2);
  click(o, 0.6, 1200, 0.02);
  thump(o, 72, 26, 0.7, 0.9 * Math.min(1.2, k));
  crunch(o, 0.25, { gain: 0.7 * Math.min(1.2, k), type: 'lowpass', f: 1200 });
  noise(o, { color: 'brown', type: 'lowpass', f: 800, f1: 60, dur: 0.6 + 0.4 * k, gain: 0.8 });
  debris(o, Math.round(8 + 6 * k), 0.5 + 0.4 * k, 500, 2400, { gain: 0.45, delay: 0.04 });
  if (iron) ring(o, MAT.hammer, 0.2, { decay: 1, pitch: 0.95 });
}

/**
 * One of an execution's flourish strikes landing: the executioner's own hit (the Warden's hammer
 * lands with the user's crowbar crunch over a sub drop, or the blunt crunch until they decode).
 */
export function execBlow(o: Out, a: Profile, d: Profile): void {
  if (a.finisher === 'crush') {
    if (!playLayers(o, ['juggernaut_blow_crunch', 'juggernaut_blow_drop'])) BASE.hit(o, a, d, { heavy: true, anim: 'slam' });
  } else hit(o, a, d, { heavy: true });
}

/**
 * A blow's shockwave through the ground: the Warden's hammer crash and punch, everyone else's
 * recorded heavy or light slam (by size), or the synthesised slam until they have decoded. Each is
 * matched to the synthesised slam at the size it stands for (his at 1.5, heavy at 1.5, light at 0.9).
 */
function shockwave(o: Out, p: Profile, scale: number): void {
  const big = scale >= 1.2;
  const layers = p.id === 'juggernaut' ? ['juggernaut_crash', 'juggernaut_punch'] : big ? ['shock_heavy_water', 'shock_heavy_slam'] : ['shock_light_tom', 'shock_light_bag'];
  if (playLayers(o, layers, Math.min(1.2, scale) / (p.id === 'juggernaut' || big ? 1.2 : 0.9))) return;
  groundSlam(o, scale, p.edge === 'blunt');
}

/** The execution's finishing blow: a cinematic hit, different for every weapon. */
export function execFinish(o: Out, a: Profile, d: Profile): void {
  // the Warden's, the Ronin's, the Wraith's, the Duelist's and the Monk's are the user's recordings:
  // led in (see execLead), and on the blow the Warden's deep cinematic bass hit and impact, the
  // Ronin's flute, the Monk's two punches and two bone-crushing blows
  const own = ON_BLOW[a.finisher];
  const recorded = !!own && (LEAD[a.finisher] ?? []).every(([n]) => !!sampleFor(o.ctx, n)) && playLayers(o, own);
  if (!recorded) {
    // the cinematic under every other one: a crack, a deep drop and the air rushing out
    click(o, 0.9, 1500, 0.02);
    osc(o, { f: 72, f1: 24, dur: 1.6, gain: 0.6 });
    noise(o, { color: 'brown', type: 'lowpass', f: 400, f1: 60, dur: 1.4, gain: 0.55 });
    noise(o, { color: 'pink', type: 'bandpass', f: 1800, f1: 300, q: 0.6, dur: 0.5, gain: 0.4 });
  }
  // and over every execution, the recorded ringing glass
  const glass = sampleFor(o.ctx, 'exec_glass');
  if (glass) playSample(o, glass, sampleGain('exec_glass'), jit(1, 0.02), 0.02);
  switch (a.finisher) {
    case 'iai':
      // one cut too fast to see (until the recordings decode): the hiss of it, then the sheath closing
      if (recorded) break;
      noise(o, { type: 'highpass', f: 3500, f1: 9000, dur: 0.14, gain: 0.5, shape: SHAPES.swing(0.4, 2) });
      hit(o, a, d, { heavy: true, anim: 'draw' });
      noise(o, { type: 'bandpass', f: 5000, q: 3, dur: 0.2, gain: 0.07, delay: 0.8, shape: (x) => x });
      click(o, 0.3, 6000, 0.005, 1.0);
      break;
    case 'crush':
      // the hammer crushing them (until the recordings decode): the blunt crunch, not the blade's
      // slash every other hit uses (the crash into the floor is the choreography's own shockwave cue,
      // landing on this same blow)
      if (recorded) break;
      BASE.hit(o, a, d, { heavy: true, anim: 'slam' });
      ring(o, MAT.hammer, 0.45, { decay: 1.6 });
      break;
    case 'pierce':
      // run through, then the blade drawn back out (until the recordings decode)
      if (recorded) break;
      noise(o, { type: 'bandpass', f: 2600, f1: 4200, q: 8, dur: 0.12, gain: 0.3 });
      hit(o, a, d, { heavy: true, anim: 'thrust' });
      noise(o, { type: 'highpass', f: 5000, dur: 0.12, gain: 0.18, delay: 0.35, shape: SHAPES.swing(0.5, 2) });
      break;
    case 'thunder': {
      // impaled, and the lightning goes through the spear into them
      const bolt = sampleFor(o.ctx, 'lancer_bolt');
      if (bolt) playSample(o, bolt, sampleGain('lancer_bolt') * 1.5, 0.92);
    }
      hit(o, a, d, { heavy: true, anim: 'thrust' });
      crackle(o, 0.9, 40, { gain: 0.55, type: 'highpass', f: 1800 });
      noise(o, { type: 'highpass', f: 900, f1: 400, dur: 0.15, gain: 0.9, a: 0.001 });
      noise(o, { color: 'brown', type: 'lowpass', f: 1600, f1: 60, dur: 2.4, gain: 0.8, delay: 0.04 });
      osc(o, { f: 55, f1: 30, dur: 1.8, gain: 0.5, delay: 0.05 });
      // (and the user's whoosh into a bang, led in: see execLead)
      break;
    case 'flurry': {
      // three cuts too quick to count (the user's knife swings), then the knife driven home (the
      // gory slice over the recorded hit), matched to the knife rings they replace
      const cuts = sampleFor(o.ctx, 'reaper_finish_gore') ? [0, 1, 0] : [];
      cuts.forEach((take, i) => playLayers(at(o, i * rand(0.06, 0.08)), ['shade_swing'], 0.71, take));
      if (!cuts.length) for (let i = 0; i < 3; i++) noise(at(o, i * rand(0.06, 0.08)), { type: 'bandpass', f: rand(4800, 6200), f1: 1600, q: 1.3, dur: 0.06, gain: 0.4 });
      hit(at(o, 0.24), a, d, { heavy: true, anim: 'thrust' });
      playLayers(at(o, 0.24), ['reaper_finish_gore'], 0.71);
      break;
    }
    case 'reap':
      // the sickle drawn through on its chain, the chain running out, something torn loose (until
      // the recordings decode)
      if (recorded) break;
      hit(o, a, d, { heavy: true, anim: 'slashR' });
      rattle(o, { count: 40, spread: 0.9, fLo: 2000, fHi: 6000, decay: 0.05, fade: 1.2 }, { gain: 0.45, type: 'highpass', f: 1500 });
      for (const det of [0, 3.5]) osc(filtered(o, 'lowpass', 600), { type: 'sawtooth', f: 220 + det, f1: 105, dur: 1.6, gain: 0.05, delay: 0.05 });
      noise(o, { type: 'bandpass', f: 3000, f1: 800, q: 6, dur: 1.2, gain: 0.12, delay: 0.05, a: 0.05 });
      break;
    case 'palm':
      // the air itself struck: a pressure wave and the slap (until the recordings decode)
      if (recorded) break;
      noise(o, { color: 'pink', type: 'lowpass', f: 500, f1: 80, dur: 0.5, gain: 1.0 });
      osc(o, { f: 55, f1: 32, dur: 0.8, gain: 0.8 });
      hit(o, a, d, { heavy: true, anim: 'punchR' });
      break;
    case 'rites': {
      // the greatsword brought down, and a bell tolls for them (and the holy spell rings out)
      hit(o, a, d, { heavy: true, anim: 'overhead' });
      const holy = sampleFor(o.ctx, 'paladin_holy');
      if (holy) playSample(o, holy, sampleGain('paladin_holy') * 1.3, 0.95, 0, 0.45);
      const shimmer = sampleFor(o.ctx, 'paladin_shimmer');
      if (shimmer) playSample(o, shimmer, sampleGain('paladin_shimmer') * 1.3, 0.97, 0, 0.2);
    }
      // the blade's weight and the toll: the user's radiant impact and barrel slam, matched to the
      // greatsword's ring and the bell they replace
      playLayers(o, ['paladin_impact', 'juggernaut_slam'], 1.26);
      noise(o, { type: 'highpass', f: 6000, dur: 1.5, gain: 0.08, a: 0.05, delay: 0.05 });
      break;
  }
}

// ------------------------------------------------------------------ bodies moving

export type Floor = 'earth' | 'stone' | 'wood' | 'snow';

function stompLayer(o: Out, p: Profile, k: number): void {
  // everyone's recorded stamp: a creature's footstep over a deep kick
  if (playLayers(o, ['stomp_foot', 'stomp_kick'], k)) return;
  thump(o, 85 / Math.sqrt(p.weight), 40, 0.25, 0.7 * k);
  noise(o, { color: 'pink', type: 'lowpass', f: 600, dur: 0.15, gain: 0.4 * k });
  if (p.body === 'plate') rattle(o, { count: 8, spread: 0.12, fLo: 1500, fHi: 4000, decay: 0.05 }, { gain: 0.3 * k, type: 'highpass', f: 1200 });
}

/** Loudness trims per sole, balanced from renders. */
const FEET_GAIN: Record<Profile['feet'], number> = { heavyPlate: 0.8, plate: 1.1, boots: 2.5, sandals: 2.2, soft: 7, robe: 1.6, bare: 1.6 };

/** One footfall: the body's weight, the sole, the gear on them, and the floor under them. */
export function footstep(o: Out, p: Profile, s: { speed: number; floor: Floor }): void {
  const run = clamp(s.speed / 5, 0.4, 1.3);
  // the Warden's own heavy, debris-scattering step, on any floor (muffled on earth)
  const own = p.id === 'juggernaut' ? sampleFor(o.ctx, 'juggernaut_step') : null;
  if (own) {
    playSample(s.floor === 'earth' ? filtered(o, 'lowpass', 2600) : o, own, sampleGain('juggernaut_step') * run * (s.floor === 'earth' ? 0.9 : 1), jit(1, 0.06));
    return;
  }
  // a recorded step for the floor, if there is one: gravel on stone (and, softer, on earth),
  // a crunch on snow and ice; a heavier body lands lower and harder
  const take = s.floor === 'snow' ? 'step_snow' : s.floor === 'stone' || s.floor === 'earth' ? 'step_stone' : null;
  const step = take ? sampleFor(o.ctx, take) : null;
  if (step) {
    const weight = clamp(p.weight, 0.7, 1.6);
    const soft = s.floor === 'earth' ? 0.9 : 1;
    playSample(s.floor === 'earth' ? filtered(o, 'lowpass', 2600) : o, step, sampleGain(take!) * run * soft * Math.sqrt(weight), jit(1, 0.06) / Math.pow(weight, 0.25));
    return;
  }
  const fl = scaled(s.floor === 'earth' ? filtered(o, 'lowpass', 2200) : o, FEET_GAIN[p.feet]);
  switch (p.feet) {
    case 'heavyPlate':
      thump(fl, 72, 40, 0.13, 0.5 * run);
      noise(fl, { color: 'pink', type: 'lowpass', f: 500, dur: 0.08, gain: 0.35 * run });
      rattle(fl, { count: 3, spread: 0.06, fLo: 1500, fHi: 3500, decay: 0.05 }, { gain: 0.18 * run, type: 'highpass', f: 1200 });
      if (chance(0.5)) ring(fl, MAT.plate, 0.05 * run, { pitch: p.plate / MAT.plate.base, decay: 0.3, hard: 0.3 });
      break;
    case 'plate':
      thump(fl, 95, 50, 0.09, 0.32 * run);
      noise(fl, { color: 'pink', type: 'lowpass', f: 700, dur: 0.06, gain: 0.22 * run });
      rattle(fl, { count: 3, spread: 0.05, fLo: 1800, fHi: 4200, decay: 0.04 }, { gain: 0.13 * run, type: 'highpass', f: 1400 });
      break;
    case 'boots':
      // a heel on the floor, crisp
      noise(fl, { type: 'bandpass', f: jit(2200, 0.1), q: 2, dur: 0.015, gain: 0.25 * run, a: 0.0005 });
      thump(fl, 140, 80, 0.05, 0.15 * run);
      noise(fl, { color: 'pink', type: 'bandpass', f: 1200, q: 1, dur: 0.05, gain: 0.08 * run, delay: 0.02 });
      break;
    case 'sandals':
      // straw sandals: a soft scuff
      noise(fl, { color: 'pink', type: 'bandpass', f: 900, f1: 1500, q: 1, dur: 0.07, gain: 0.18 * run });
      thump(fl, 110, 60, 0.06, 0.12 * run);
      break;
    case 'soft':
      // soft leather: barely there, a creak of the sole
      noise(fl, { color: 'pink', type: 'lowpass', f: 600, dur: 0.05, gain: 0.1 * run });
      thump(fl, 120, 70, 0.05, 0.03 * run);
      noise(fl, { type: 'bandpass', f: jit(1600, 0.15), q: 5, dur: 0.04, gain: 0.015 * run, delay: 0.01 });
      break;
    case 'robe':
      noise(fl, { color: 'pink', type: 'lowpass', f: 700, dur: 0.05, gain: 0.1 * run });
      noise(fl, { color: 'pink', type: 'bandpass', f: 700, f1: 1300, q: 0.7, dur: 0.18, gain: 0.13 * run, shape: SHAPES.swing(0.4, 1.5) });
      break;
    case 'bare':
      noise(fl, { color: 'pink', type: 'lowpass', f: 1200, dur: 0.03, gain: 0.16 * run });
      thump(fl, 120, 70, 0.05, 0.18 * run);
      break;
  }
  // the hollow plank underfoot: the user's floor tom, quiet and pitched a little at random
  if (s.floor === 'wood') {
    const tom = sampleFor(o.ctx, 'shock_light_tom');
    if (tom) playSample(o, tom, sampleGain('shock_light_tom') * 0.08 * run, rand(0.9, 1.2));
    else ring(o, MAT.haft, 0.12 * run, { pitch: rand(0.55, 0.7) });
  }
}

/** A dodge: the roll or sidestep, the gear moving, the landing. */
export function dodge(o: Out, p: Profile, kind: 'roll' | 'vanish' | 'leap' = 'roll'): void {
  if (kind === 'vanish') {
    // the user's recorded vanish, once it has decoded
    if (playLayers(o, ['vanish'])) return;
    noise(o, { type: 'bandpass', f: 3000, f1: 5200, q: 6, dur: 0.3, gain: 0.3, shape: SHAPES.swell(2) });
    noise(o, { color: 'pink', type: 'bandpass', f: 2400, f1: 500, q: 1.5, dur: 0.25, gain: 0.35, delay: 0.05 });
    return;
  }
  const len = kind === 'leap' ? 0.4 : 0.3;
  const g = { plate: 0.35, robe: 0.6, cloth: 0.5, leather: 0.45, bare: 0.4 }[p.body];
  whoosh(o, kind === 'leap' ? 500 : 650, len, 0.8, g, 2.0, 0.45);
  if (p.body === 'plate') {
    rattle(o, { count: 10, spread: len, fLo: 1500, fHi: 4000, decay: 0.05, fade: 1 }, { gain: 0.25, type: 'highpass', f: 1200 });
    thump(o, 90, 45, 0.15, 0.12 * p.weight, len * 0.9);
  }
  footstep(at(o, 0.03), p, { speed: 4, floor: 'stone' });
  footstep(at(o, len * 0.85), p, { speed: 3, floor: 'stone' });
}

export function jump(o: Out, p: Profile): void {
  // everyone's recorded jump, once it has decoded
  if (playLayers(o, ['jump'])) return;
  noise(o, { color: 'pink', type: 'lowpass', f: 900, f1: 300, dur: 0.12, gain: 0.2 });
  noise(o, { color: 'pink', type: 'bandpass', f: 900, f1: 1600, q: 0.9, dur: 0.15, gain: 0.15, shape: SHAPES.swing(0.4, 1.5) });
  if (p.body === 'plate') rattle(o, { count: 5, spread: 0.1, fLo: 1600, fHi: 4000, decay: 0.05 }, { gain: 0.25, type: 'highpass', f: 1200 });
}

/** A feint: the swing pulled back, the grip turning in the hand. */
export function feint(o: Out, p: Profile): void {
  noise(o, { color: 'pink', type: 'bandpass', f: p.swing.f * 1.2, q: p.swing.q, dur: 0.09, gain: 0.3 * p.swing.gain * 2, shape: (x) => (x < 0.8 ? x / 0.8 : (1 - x) / 0.2) });
  noise(o, { type: 'bandpass', f: 1800, q: 6, dur: 0.05, gain: 0.25, delay: 0.06 });
  osc(o, { type: 'triangle', f: 500, f1: 900, dur: 0.12, gain: 0.2 });
}

/** the user's sliced riser is at its height this long into it, and the Wraith's conjuring roars out this long into it */
const RISER_PEAK = 0.568;
const CONJURE_ROAR = 0.603;

/**
 * Perilous: the danger cue, everyone's. The user's mission drum cadence sounding the alarm, and a
 * sliced riser climbing to its height as the attack strikes (`windup`: the seconds until it does);
 * a synthesised drone and beep until they decode. The Wraith conjures fire through his, roaring out
 * as it strikes.
 */
export function perilous(o: Out, p: Profile, windup = 0.75): void {
  if (playLayers(o, ['perilous_drum'])) {
    const t = windup - RISER_PEAK;
    playLayers(t > 0 ? at(o, t) : o, ['perilous_riser'], 1, undefined, Math.max(0, -t));
    if (p.id === 'reaper') {
      const c = windup - CONJURE_ROAR;
      playLayers(c > 0 ? at(o, c) : o, ['reaper_conjure'], 1, undefined, Math.max(0, -c));
    }
    return;
  }
  osc(filtered(o, 'lowpass', 1400), { type: 'sawtooth', f: 110, f1: 105, dur: 0.5, gain: 0.25 });
  osc(o, { type: 'square', f: 880, f1: 870, dur: 0.35, gain: 0.05, delay: 0.02 });
  thump(o, 90, 50, 0.3, 0.4);
}

/** A fighter going down: the body landing, the armour clattering, the weapon dropped. */
export function death(o: Out, d: Profile): void {
  // the Wraith's pained shriek (the user's)
  if (d.id === 'reaper') playLayers(o, ['reaper_shriek']);
  // the body landing: everyone's recorded fall (its crunch lands where the thumps did), or the
  // synthesised thumps, armour and cloth until it has decoded
  if (!playLayers(at(o, 0.1), ['bodyfall'])) {
    const w = Math.sqrt(d.weight);
    thump(o, 80 / w, 40, 0.3, 0.45 * w, 0.12);
    noise(o, { color: 'pink', type: 'lowpass', f: 500, f1: 150, dur: 0.25, gain: 0.45, delay: 0.12 });
    thump(o, 70 / w, 36, 0.35, 0.25 * w, 0.34);
    switch (d.body) {
      case 'plate':
        ring(o, MAT.plate, 0.32, { pitch: d.plate / MAT.plate.base, decay: 0.5, delay: 0.12 });
        rattle(o, { count: 14, spread: 0.5, fLo: 1500, fHi: 4000, decay: 0.06, fade: 1.5 }, { gain: 0.35, delay: 0.12, type: 'highpass', f: 1200 });
        ring(o, MAT.plate, 0.18, { pitch: (d.plate / MAT.plate.base) * 1.1, decay: 0.35, delay: 0.34 });
        break;
      case 'robe':
      case 'cloth':
        noise(o, { color: 'pink', type: 'bandpass', f: 800, f1: 400, q: 0.8, dur: 0.3, gain: 0.3, delay: 0.1 });
        break;
      default:
        noise(o, { type: 'bandpass', f: 2600, q: 1, dur: 0.025, gain: 0.2, delay: 0.12 });
    }
  }
  // the weapon hits the floor and bounces: the user's sword clatter (the Wraith's chain rattling out
  // with it, the Knight's shield clanging down), matched to the synthesised rings that play until
  // they decode
  if (d.edge !== 'fist' && playLayers(at(o, 0.45 - 0.273), ['ronin_finish_clatter'], 0.2)) {
    if (d.chain) playLayers(at(o, 0.45), ['chain_metal'], 1);
    if (d.guard === 'shield') playLayers(at(o, 0.52 - 0.04), ['paladin_bash'], 0.58);
  } else if (d.edge !== 'fist') {
    let g = 0.22;
    for (const t of [0.45, 0.6, 0.69]) {
      ring(o, d.metal, g, { pitch: d.pitch, decay: 0.35, hard: 0.6, delay: t + rand(-0.02, 0.02) });
      g *= 0.5;
    }
    if (d.guard === 'shield') ring(o, MAT.wood, 0.4, { delay: 0.52 });
    if (d.chain) rattle(o, { count: 16, spread: 0.4, fLo: 2000, fHi: 6000, decay: 0.05 }, { gain: 0.3, delay: 0.45, type: 'highpass', f: 1500 });
  }
}

/** Over the edge: the wind rushing past, falling away. */
export function fall(o: Out): void {
  // the user's howling gust (the Ronin's entrance wind) rushing up over it
  playLayers(o, ['wind_howl'], 0.9);
  noise(o, { color: 'pink', type: 'bandpass', f: 1400, f1: 250, q: 1.2, dur: 1.2, gain: 0.4, shape: (x) => Math.min(1, x * 6) * Math.pow(1 - x, 1.2) });
  osc(o, { f: 900, f1: 180, dur: 1.1, gain: 0.025, shape: (x) => Math.min(1, x * 8) * (1 - x) });
}

/** A buff: the power coming up through them. */
export function buff(o: Out): void {
  // the user's stack: a water-and-shimmer swell with a fire burst igniting
  if (playLayers(o, ['buff_shimmer', 'buff_fire'])) return;
  for (const det of [0, 2]) osc(filtered(o, 'lowpass', 1800), { type: 'sawtooth', f: 150 + det, f1: 300 + det, dur: 0.5, gain: 0.22 });
  noise(o, { color: 'pink', type: 'bandpass', f: 300, f1: 900, q: 1, dur: 0.6, gain: 0.3, shape: SHAPES.swing(0.4, 1.5) });
  thump(o, 80, 40, 0.3, 0.4);
}

// ------------------------------------------------------------------ move effect cues

export const CUES = new Set(['shockwave', 'stomp', 'quake', 'bolt', 'chain', 'holy', 'chi', 'flashline', 'roar', 'smoke', 'fog', 'whirl', 'spiral', 'soulfire']);

/** Sounds for a move's choreographed effects (the same cues that draw dust, shockwaves, bolts). */
export function cue(o: Out, p: Profile, kind: string, scale: number): boolean {
  const k = clamp(scale, 0.3, 2.5);
  switch (kind) {
    case 'shockwave':
      shockwave(o, p, k);
      return true;
    case 'stomp':
      stompLayer(o, p, Math.min(1.2, k * 0.8));
      return true;
    case 'quake':
      noise(o, { color: 'brown', type: 'lowpass', f: 200, f1: 90, dur: 0.9, gain: 0.7 * Math.min(1, k) });
      crunch(o, 0.5, { gain: 0.4, type: 'lowpass', f: 600 });
      debris(o, 5, 0.6, 500, 1800, { gain: 0.3 });
      return true;
    case 'bolt': {
      // a recorded lightning strike, if there is one, with the user's electric step and crackle over it
      const bolt = sampleFor(o.ctx, 'lancer_bolt');
      if (bolt) {
        // the Lancer's own lightning is far louder than anyone else's, with the thunder rolling on
        // after the crack
        const lancer = p.id === 'lancer';
        const loud = lancer ? 2.9 : 1;
        playSample(o, bolt, BOLT_CUE_GAIN * Math.min(1.5, scale) * loud, jit(1, 0.03));
        playLayers(o, ['bolt_summon', 'bolt_crackle'], Math.min(1.5, scale) * loud);
        if (lancer) thunderRoll(o, k);
        return true;
      }
    }
    // falls through to the synthesised one
      // lightning: the crack, the arc spitting, the thunder rolling away
      noise(o, { type: 'highpass', f: 1500, f1: 600, dur: 0.08, gain: 0.9, a: 0.001 });
      crackle(o, 0.45 * k, 45, { gain: 0.55, type: 'highpass', f: 1500 });
      osc(o, { type: 'sawtooth', f: 1800, f1: 300, dur: 0.15, gain: 0.08 });
      noise(o, { color: 'brown', type: 'lowpass', f: 1200, f1: 60, dur: 1.4 * k, gain: 0.6, delay: 0.03 });
      osc(o, { f: 50, f1: 30, dur: 1.2, gain: 0.4, delay: 0.03 });
      return true;
    case 'chain': {
      // the user's chain net over a wet metal chain
      if (playLayers(o, ['chain_net', 'chain_metal'])) return true;
      // the sickle thrown out on its chain: a whirr, the links running out, the snap as it goes taut
      const am = o.ctx.createGain();
      am.gain.value = 0.5;
      const lfo = o.ctx.createOscillator();
      lfo.frequency.value = rand(16, 20);
      const lg = o.ctx.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      lfo.start(o.t);
      lfo.stop(o.t + 0.5);
      whoosh(via(o, am), 900, 0.45, 1.5, 0.5, 2.0, 0.4);
      rattle(o, { count: 40, spread: 0.45, fLo: 2200, fHi: 6500, decay: 0.04, fade: 0.6 }, { gain: 0.55, type: 'highpass', f: 1800 });
      click(o, 0.4, 3000, 0.01, 0.45);
      ring(o, MAT.sickle, 0.3, { decay: 0.6, delay: 0.45 });
      rattle(o, { count: 10, spread: 0.15, fLo: 2200, fHi: 6000, decay: 0.05 }, { gain: 0.4, delay: 0.45, type: 'highpass', f: 1800 });
      return true;
    }
    case 'holy': {
      // the recorded holy spell, if there is one
      const holy = sampleFor(o.ctx, 'paladin_holy');
      if (holy) {
        playSample(o, holy, sampleGain('paladin_holy') * Math.min(1.4, k), jit(1, 0.02), 0, 0.3);
        const shimmer = sampleFor(o.ctx, 'paladin_shimmer');
        if (shimmer) playSample(o, shimmer, sampleGain('paladin_shimmer') * 1.2, 1, 0, 0.15);
        return true;
      }
    }
    // falls through to the synthesised one
      ring(o, MAT.bell, 0.12, { pitch: 2, decay: 0.6 });
      noise(o, { type: 'highpass', f: 6000, dur: 1.2, gain: 0.08, shape: SHAPES.swing(0.2, 1.5) });
      osc(o, { f: 880, dur: 0.8, gain: 0.03, shape: SHAPES.swing(0.3, 1.5) });
      osc(o, { f: 1320, dur: 0.8, gain: 0.02, shape: SHAPES.swing(0.3, 1.5) });
      return true;
    case 'chi':
      // the user's crystal impact over a tapering electric drone
      if (playLayers(o, ['chi_crystal', 'chi_drone'], Math.min(1.2, k) / 0.9)) return true;
      noise(o, { color: 'pink', type: 'lowpass', f: 700, f1: 150, dur: 0.35, gain: 0.55 * Math.min(1.2, k) });
      osc(o, { f: 120, f1: 55, dur: 0.3, gain: 0.45 });
      whoosh(o, 500, 0.22, 1, 0.25, 2.2, 0.3);
      return true;
    case 'flashline':
      // the user's sword scrape
      if (playLayers(o, ['flashline'])) return true;
      noise(o, { type: 'highpass', f: 5000, f1: 9000, dur: 0.25, gain: 0.1, shape: SHAPES.swing(0.4, 2) });
      ring(o, p.metal, 0.05, { decay: 1, hard: 0.5 });
      return true;
    case 'roar':
      // the user's tiger, dragon and leopard together
      if (playLayers(o, ['roar_tiger', 'roar_dragon', 'roar_leopard'])) return true;
      osc(filtered(o, 'lowpass', 300), { type: 'sawtooth', f: 70, f1: 58, dur: 0.9, gain: 0.07, shape: SHAPES.swing(0.25, 1.5) });
      noise(o, { color: 'brown', type: 'lowpass', f: 300, dur: 0.9, gain: 0.22, shape: SHAPES.swing(0.25, 1.5) });
      return true;
    case 'smoke':
    case 'fog':
      // the fog is the user's airy poof over a trailer's boom (smoke keeps the synthesised puff)
      if (kind === 'fog' && playLayers(o, ['fog_poof', 'fog_boom'])) return true;
      noise(o, { color: 'pink', type: 'lowpass', f: 1200, f1: 300, dur: 0.3, gain: 0.25 });
      return true;
    case 'whirl':
    case 'spiral':
      // the user's howling gust and a flutter whoosh, in equal shares
      if (playLayers(o, ['whirl_flutter'])) {
        playLayers(o, ['wind_howl'], 1.26);
        return true;
      }
      whoosh(o, 800, 0.45, 1.4, 0.2, 2, 0.5);
      return true;
    case 'soulfire':
      // the user's fire burst, extinguished
      if (playLayers(o, ['soulfire'])) return true;
      noise(o, { type: 'bandpass', f: 2000, f1: 600, q: 3, dur: 0.6, gain: 0.2 });
      osc(o, { f: 220, f1: 110, dur: 0.6, gain: 0.04 });
      return true;
  }
  return false;
}

// ---------------------------------------------------------------- feedback

/** Your own blow landing: a tight punch under the hit's own sound (a deeper drop under a heavy). */
export function hitConfirm(o: Out, heavy: boolean): void {
  thump(o, heavy ? 100 : 130, heavy ? 40 : 55, heavy ? 0.22 : 0.13, heavy ? 1.0 : 0.7);
  noise(o, { type: 'bandpass', f: 1700, q: 1.1, dur: 0.03, gain: heavy ? 0.45 : 0.32, a: 0.0005 });
  if (heavy) osc(filtered(o, 'lowpass', 300), { type: 'sawtooth', f: 70, f1: 32, dur: 0.35, gain: 0.18, delay: 0.01 });
}

/** Taking a blow yourself: a dull whump, as if heard through the bone. */
export function hitTaken(o: Out, heavy: boolean): void {
  thump(o, 75, 36, heavy ? 0.3 : 0.18, heavy ? 0.85 : 0.55, 0.004);
  noise(o, { color: 'brown', type: 'lowpass', f: 380, dur: heavy ? 0.24 : 0.16, gain: heavy ? 0.5 : 0.32 });
}

/** The blow that kills: a deep cinematic hit (the Warden's finisher's bass) under everything. */
export function killBlow(o: Out): void {
  if (!playLayers(o, ['juggernaut_finish_bass'], 0.55)) thump(o, 70, 28, 1.2, 1.0);
  thump(o, 110, 40, 0.4, 0.7);
}

/** One beat of your heart when you're nearly dead (`k`: louder as it gets worse). */
export function lowHealth(o: Out, k: number): void {
  heartbeat(o, 0.6 * k);
}

/** A round won (two taiko strikes and a blade's ring) or lost (one low strike under a dark whoosh). */
export function roundEnd(o: Out, won: boolean): void {
  const taiko = sampleFor(o.ctx, 'title_taiko');
  if (!taiko) return void thump(o, won ? 90 : 60, 40, 0.6, 1);
  const g = sampleGain('title_taiko');
  if (won) {
    playSample(o, taiko, g, 1);
    playSample(o, taiko, g * 0.85, 1.12, 0.22);
    const shing = sampleFor(o.ctx, 'blade_shing');
    if (shing) playSample(o, shing, sampleGain('blade_shing') * 0.7, 1, 0.45);
  } else {
    playSample(o, taiko, g, 0.78);
    const w = sampleFor(o.ctx, 'heavy_whoosh');
    if (w) playSample(o, w, sampleGain('heavy_whoosh') * 0.6, 0.75, 0.05);
  }
}

/** Your special charged again (a blade's ring), or your ability (a drawn blade's hiss). */
export function ready(o: Out, kind: 'special' | 'ability'): void {
  if (!playLayers(o, [kind === 'special' ? 'blade_shing' : 'blade_draw'], kind === 'special' ? 0.45 : 0.35)) noise(o, { type: 'highpass', f: 4000, dur: 0.3, gain: 0.2 });
}

/** Locking on to someone (a firm, low click) or letting go (a lighter one). */
export function lockOn(o: Out, on: boolean): void {
  const c = sampleFor(o.ctx, 'ui_click');
  if (c) playSample(o, c, sampleGain('ui_click') * (on ? 1.3 : 0.8), on ? 0.78 : 1.15);
  thump(o, on ? 160 : 200, on ? 90 : 120, 0.06, on ? 0.3 : 0.15);
}

/** An entrance's name card slamming in: a heavy whoosh into a taiko strike. */
export function cardSlam(o: Out): void {
  playLayers(o, ['heavy_whoosh'], 0.7);
  const taiko = sampleFor(o.ctx, 'title_taiko');
  if (taiko) playSample(o, taiko, sampleGain('title_taiko') * 0.75, 0.9, 0.12);
}

/** A soft tick as the pointer finds a button. */
export function hover(o: Out): void {
  const c = sampleFor(o.ctx, 'ui_click');
  if (c) playSample(o, c, sampleGain('ui_click') * 0.35, rand(1.35, 1.5));
  else noise(o, { type: 'bandpass', f: 3000, q: 2, dur: 0.012, gain: 0.08 });
}

/**
 * Coins coming in: a run of small bright clinks, more of them the more coins, like a handful of mon
 * dropped onto a table.
 */
export function coins(o: Out, n: number): void {
  const count = Math.max(3, Math.min(9, Math.round(n / 15)));
  for (let i = 0; i < count; i++) {
    const delay = i * 0.055 + rand(0, 0.02);
    ring(o, MAT.bell, 0.05, { pitch: rand(2.6, 3.4), decay: rand(0.25, 0.4), delay, beat: false });
    noise(o, { type: 'highpass', f: 6000, dur: 0.02, gain: 0.08, delay, a: 0.0005 });
  }
}

/** Something unlocked: the blade drawn over a taiko strike and a rising shimmer. */
export function unlock(o: Out): void {
  playLayers(o, ['blade_shing'], 0.55);
  const taiko = sampleFor(o.ctx, 'title_taiko');
  if (taiko) playSample(o, taiko, sampleGain('title_taiko') * 0.7, 1.05);
  osc(o, { f: 880, f1: 1760, dur: 0.6, gain: 0.04, delay: 0.05, shape: SHAPES.swing(0.3, 1.5) });
}

/** Each fighter's signature, played as they're picked on the roster. */
const SIGNATURE: Record<string, string[]> = {
  ronin: ['ronin_unsheathe'],
  juggernaut: ['juggernaut_slam', 'juggernaut_thud'],
  lancer: ['lancer_bolt', 'bolt_crackle'],
  reaper: ['reaper_void'],
  monk: ['monk_punch'],
  duelist: ['duelist_swing'],
  shade: ['shade_swing'],
  paladin: ['paladin_shield_clang', 'paladin_shield_ring'],
};
export function fighterPick(o: Out, id: string): void {
  playLayers(o, SIGNATURE[id] ?? ['blade_shing'], 0.6);
}

/** The shared recipes behind each voice hook, for a voice that layers on top of them. */
export const BASE = { swing: swingBase, hit: hitBase, block: blockBase, deflect: deflectBase };
