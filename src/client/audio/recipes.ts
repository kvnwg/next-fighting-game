/**
 * The sound design: every game sound as a recipe of layers from the toolkit. Recipes are written
 * at a nominal level and know nothing of volume, panning or the mix (engine.ts does that); each
 * takes an `Out` and the profiles of whoever is involved, and randomises itself on every call.
 */
import type { AttackAnim } from '../../shared/characters';
import { MAT, Material } from './materials';
import type { Edge, Profile } from './profiles';
import { deflectClang } from './clang';
import { playSample, sampleFor } from './samples';
import { VOICES } from './voices';
import { SHAPES, Out, at, chance, clamp, crackle, crunch, debris, filtered, jit, modal, noise, osc, rand, rattle, scaled, spatter, squelch, tear, thump, via } from './synth';

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
  // a recorded swing for this fighter, if there is one: heavies slower and lower
  // (the Lancer swings the glaive's own whoosh or the katana's, with the spear's lightning
  // crackling behind it)
  const take = p.id === 'lancer' ? (chance(0.5) ? 'lancer_swing' : 'ronin_swing') : `${p.id}_swing`;
  const rec = sampleFor(o0.ctx, take);
  if (rec) {
    const thrust = s.anim === 'thrust' || s.anim === 'charge';
    playSample(o0, rec, sampleGain(take) * (s.heavy ? 1.15 : 1), jit(1, 0.04) * (s.heavy ? 0.86 : thrust ? 1.08 : 1));
    const zap = p.lightning ? sampleFor(o0.ctx, 'lancer_zap') : null;
    if (zap) playSample(o0, zap, sampleGain('lancer_zap') * (s.heavy ? 1.3 : 1), jit(1, 0.06), 0.02);
    return;
  }
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
  if (p.lightning && (heavy || chance(0.45))) crackle(o, len * 0.9, 30, { gain: 0.1, type: 'highpass', f: 2500 });
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
    crackle(o, 0.14, 50, { gain: 0.3 * h, type: 'highpass', f: 2200 });
    noise(o, { type: 'highpass', f: 3000, dur: 0.02, gain: 0.25 * h, a: 0.0005 });
  }
}

/** A clean hit: what the attacker's weapon does to what the defender is wearing. */
export function hit(o: Out, a: Profile, d: Profile, s: HitOpts = {}): void {
  // a recorded hit for this weapon, if there is one: heavies lower and harder. Started a little
  // into the clip, where it has swelled, so it lands with the blow
  const rec = sampleFor(o.ctx, `${a.id}_hit`);
  if (rec) {
    const h = (s.heavy ? 1.2 : 1) * (s.armor ? 0.75 : 1) * (s.backstab ? 1.1 : 1);
    playSample(o, rec, sampleGain(`${a.id}_hit`) * h, jit(1, 0.04) * (s.heavy ? 0.88 : 1), 0, 0.04);
    return;
  }
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
  // the recordings have decoded. Back-to-back deflects climb a little in pitch and level.
  void a;
  void d;
  const buf = sampleFor(o.ctx, 'deflect');
  if (!buf) {
    deflectClang(o, s);
    return;
  }
  const streak = Math.min(4, Math.max(1, s.streak ?? 1)) - 1;
  playSample(o, buf, DEFLECT_GAIN * (1 + 0.08 * streak) * (s.heavy ? 1.1 : 1), jit(1, 0.035) * (1 + 0.025 * streak));
}

/** The recorded deflect's level in the mix, matched to the synthesised one's loudness. */
const DEFLECT_GAIN = 1.6;
/** The other recordings' levels in the mix, each matched (by rendered loudness) to the synthesised sound it replaces. */
const SAMPLE_GAIN: Record<string, number> = { block: 0.79, ronin_swing: 0.28, ronin_hit: 0.34, duelist_swing: 0.62, lancer_swing: 0.3, lancer_zap: 0.12 };
const sampleGain = (name: string): number => SAMPLE_GAIN[name] ?? 0.5;

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

/** The guard caves in under the blow. */
export function guardBreak(o: Out, a: Profile, d: Profile, s: GuardOpts = {}): void {
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
  // the posture giving way: the falling growl players know
  osc(filtered(o, 'lowpass', 900), { type: 'sawtooth', f: 200, f1: 60, dur: 0.5, gain: 0.2, delay: 0.02 });
}

/** Posture broken: the guard shatters like glass over a deep boom. */
export function postureBreak(o: Out, d: Profile | null): void {
  noise(o, { type: 'highpass', f: 5000, f1: 2500, q: 0.7, dur: 0.06, gain: 0.9, a: 0.001 });
  noise(o, { type: 'bandpass', f: 3500, f1: 1800, q: 2.5, dur: 0.6, gain: 0.4, delay: 0.03, a: 0.01 });
  for (let i = 0; i < 6; i++) ring(o, MAT.shard, 0.06, { pitch: rand(1, 2.1), decay: rand(0.8, 1.6), delay: rand(0, 0.12), beat: false });
  thump(o, 90, 30, 0.9, 0.9);
  osc(filtered(o, 'lowpass', 500), { type: 'sawtooth', f: 60, f1: 28, dur: 0.7, gain: 0.25, delay: 0.02 });
  if (d?.body === 'plate') ring(o, MAT.plate, 0.18, { pitch: d.plate / MAT.plate.base, decay: 1.2 });
}

/** Mikiri: the thrust read and stamped into the ground. */
export function mikiri(o: Out, a: Profile, d: Profile): void {
  stompLayer(o, d, 1);
  const st = striker(a, 'thrust', false);
  if (st.edge !== 'fist') ring(o, st.mat, 0.32, { pitch: st.pitch, decay: 0.5, hard: 0.8, delay: 0.01 });
  click(o, 0.45, 2500, 0.015);
  debris(o, 6, 0.35, 600, 2200, { gain: 0.35 });
  osc(o, { type: 'triangle', f: 90, f1: 40, dur: 0.3, gain: 0.35 });
  ring(o, MAT.katana, 0.22, { pitch: 0.76, decay: 0.8 });
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

/**
 * Under the execution's wind-up: a low drone and rumble swelling, a quickening heartbeat, and a
 * rising rush into the blow. The engine cuts it as the finishing blow lands.
 */
export function execWindup(o: Out, a: Profile, close: boolean): void {
  const T = EXEC_HIT + 0.25;
  const bed = (x: number) => Math.min(1, x * 4) * (x < 0.9 ? 1 : (1 - x) / 0.1);
  osc(o, { f: 41, dur: T, gain: 0.1, shape: bed });
  osc(o, { f: 41.9, dur: T, gain: 0.08, shape: bed });
  noise(o, { color: 'brown', type: 'lowpass', f: 140, f1: 300, dur: T, gain: 0.3, shape: (x) => (0.3 + 0.7 * x) * bed(x) });
  if (close) for (const [tb, g] of [[0.3, 0.3], [0.95, 0.38], [1.48, 0.45], [1.86, 0.5]] as const) heartbeat(at(o, tb + rand(-0.02, 0.02)), g);
  // the rush into the blow
  noise(o, { color: 'pink', type: 'bandpass', f: 300, f1: 2600, q: 1.2, dur: 0.75, gain: 0.35, shape: SHAPES.swell(3), delay: EXEC_HIT - 0.75 });
  osc(filtered(o, 'lowpass', 900), { type: 'sawtooth', f: 110, f1: 220, dur: 0.75, gain: 0.06, shape: SHAPES.swell(2), delay: EXEC_HIT - 0.75 });
  // the executioner readies the weapon
  switch (a.finisher) {
    case 'iai':
      noise(o, { type: 'highpass', f: 4000, f1: 7000, dur: 0.4, gain: 0.08, delay: 0.25, shape: SHAPES.swing(0.6, 2) });
      ring(o, MAT.katana, 0.05, { decay: 1.4, hard: 0.4, delay: 0.45 });
      break;
    case 'thunder':
      crackle(o, 1.6, 12, { gain: 0.08, type: 'highpass', f: 2000, delay: 0.3 });
      break;
    case 'reap':
      rattle(o, { count: 30, spread: 1.6, fLo: 2200, fHi: 6000, decay: 0.04, fade: 0.3, whirl: 3 }, { gain: 0.2, type: 'highpass', f: 1800, delay: 0.2 });
      break;
    case 'crush':
      ring(o, MAT.hammer, 0.08, { decay: 1.2, hard: 0.3, delay: 0.4 });
      break;
    default:
      ring(o, a.metal, 0.05, { decay: 1.2, hard: 0.4, delay: 0.4 });
  }
}

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

/** The execution's finishing blow: a cinematic hit, different for every weapon. */
export function execFinish(o: Out, a: Profile, d: Profile): void {
  // the cinematic under every one: a crack, a deep drop and the air rushing out
  click(o, 0.9, 1500, 0.02);
  osc(o, { f: 72, f1: 24, dur: 1.6, gain: 0.6 });
  noise(o, { color: 'brown', type: 'lowpass', f: 400, f1: 60, dur: 1.4, gain: 0.55 });
  noise(o, { color: 'pink', type: 'bandpass', f: 1800, f1: 300, q: 0.6, dur: 0.5, gain: 0.4 });
  switch (a.finisher) {
    case 'iai':
      // one cut too fast to see: the hiss of it, the blade's long silver ring, then the sheath closing
      noise(o, { type: 'highpass', f: 3500, f1: 9000, dur: 0.14, gain: 0.5, shape: SHAPES.swing(0.4, 2) });
      hit(o, a, d, { heavy: true, anim: 'draw' });
      ring(o, MAT.katana, 0.4, { decay: 1.6 });
      noise(o, { type: 'bandpass', f: 5000, q: 3, dur: 0.2, gain: 0.07, delay: 0.8, shape: (x) => x });
      ring(o, MAT.knife, 0.3, { pitch: 0.9, decay: 0.25, delay: 1.0 });
      click(o, 0.3, 6000, 0.005, 1.0);
      break;
    case 'crush':
      hit(o, a, d, { heavy: true, anim: 'slam' });
      groundSlam(at(o, 0.02), 2, true);
      ring(o, MAT.hammer, 0.45, { decay: 1.6 });
      break;
    case 'pierce':
      // run through, then the blade drawn back out with a ting
      noise(o, { type: 'bandpass', f: 2600, f1: 4200, q: 8, dur: 0.12, gain: 0.3 });
      hit(o, a, d, { heavy: true, anim: 'thrust' });
      ring(o, MAT.rapier, 0.38, { decay: 2 });
      noise(o, { type: 'highpass', f: 5000, dur: 0.12, gain: 0.18, delay: 0.35, shape: SHAPES.swing(0.5, 2) });
      ring(o, MAT.rapier, 0.18, { pitch: 1.04, delay: 0.38 });
      break;
    case 'thunder':
      // impaled, and the lightning goes through the spear into them
      hit(o, a, d, { heavy: true, anim: 'thrust' });
      crackle(o, 0.9, 40, { gain: 0.55, type: 'highpass', f: 1800 });
      noise(o, { type: 'highpass', f: 900, f1: 400, dur: 0.15, gain: 0.9, a: 0.001 });
      noise(o, { color: 'brown', type: 'lowpass', f: 1600, f1: 60, dur: 2.4, gain: 0.8, delay: 0.04 });
      osc(o, { f: 55, f1: 30, dur: 1.8, gain: 0.5, delay: 0.05 });
      ring(o, MAT.glaive, 0.25, { decay: 1.2 });
      break;
    case 'flurry':
      // three cuts too quick to count, then the knife driven home
      for (let i = 0; i < 3; i++) {
        const c = at(o, i * rand(0.06, 0.08));
        noise(c, { type: 'bandpass', f: rand(4800, 6200), f1: 1600, q: 1.3, dur: 0.06, gain: 0.4 });
        ring(c, MAT.knife, 0.14, { pitch: rand(0.95, 1.1), decay: 0.4 });
      }
      hit(at(o, 0.24), a, d, { heavy: true, anim: 'thrust' });
      ring(o, MAT.knife, 0.3, { decay: 0.9, delay: 0.24 });
      break;
    case 'reap':
      // the sickle drawn through on its chain, the chain running out, something torn loose
      hit(o, a, d, { heavy: true, anim: 'slashR' });
      ring(o, MAT.sickle, 0.38, { decay: 1.5 });
      rattle(o, { count: 40, spread: 0.9, fLo: 2000, fHi: 6000, decay: 0.05, fade: 1.2 }, { gain: 0.45, type: 'highpass', f: 1500 });
      for (const det of [0, 3.5]) osc(filtered(o, 'lowpass', 600), { type: 'sawtooth', f: 220 + det, f1: 105, dur: 1.6, gain: 0.05, delay: 0.05 });
      noise(o, { type: 'bandpass', f: 3000, f1: 800, q: 6, dur: 1.2, gain: 0.12, delay: 0.05, a: 0.05 });
      break;
    case 'palm':
      // the air itself struck: a pressure wave, the slap, and the body ringing like a gong
      noise(o, { color: 'pink', type: 'lowpass', f: 500, f1: 80, dur: 0.5, gain: 1.0 });
      osc(o, { f: 55, f1: 32, dur: 0.8, gain: 0.8 });
      hit(o, a, d, { heavy: true, anim: 'punchR' });
      ring(o, MAT.gong, 0.32, { decay: 1, delay: 0.01 });
      ring(o, MAT.bronze, 0.18, { decay: 1 });
      break;
    case 'rites':
      // the greatsword brought down, and a bell tolls for them
      hit(o, a, d, { heavy: true, anim: 'overhead' });
      ring(o, MAT.greatsword, 0.38, { decay: 1.8 });
      ring(o, MAT.bell, 0.32, { delay: 0.05 });
      noise(o, { type: 'highpass', f: 6000, dur: 1.5, gain: 0.08, a: 0.05, delay: 0.05 });
      break;
  }
}

// ------------------------------------------------------------------ bodies moving

export type Floor = 'earth' | 'stone' | 'wood';

function stompLayer(o: Out, p: Profile, k: number): void {
  thump(o, 85 / Math.sqrt(p.weight), 40, 0.25, 0.7 * k);
  noise(o, { color: 'pink', type: 'lowpass', f: 600, dur: 0.15, gain: 0.4 * k });
  if (p.body === 'plate') rattle(o, { count: 8, spread: 0.12, fLo: 1500, fHi: 4000, decay: 0.05 }, { gain: 0.3 * k, type: 'highpass', f: 1200 });
}

/** Loudness trims per sole, balanced from renders. */
const FEET_GAIN: Record<Profile['feet'], number> = { heavyPlate: 0.8, plate: 1.1, boots: 2.5, sandals: 2.2, soft: 7, robe: 1.6, bare: 1.6 };

/** One footfall: the body's weight, the sole, the gear on them, and the floor under them. */
export function footstep(o: Out, p: Profile, s: { speed: number; floor: Floor }): void {
  const run = clamp(s.speed / 5, 0.4, 1.3);
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
  if (s.floor === 'wood') ring(o, MAT.haft, 0.12 * run, { pitch: rand(0.55, 0.7) });
}

/** A dodge: the roll or sidestep, the gear moving, the landing. */
export function dodge(o: Out, p: Profile, kind: 'roll' | 'vanish' | 'leap' = 'roll'): void {
  if (kind === 'vanish') {
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

/** Perilous: the danger cue, with the attacker's weapon glinting in it. */
export function perilous(o: Out, p: Profile): void {
  osc(filtered(o, 'lowpass', 1400), { type: 'sawtooth', f: 110, f1: 105, dur: 0.5, gain: 0.25 });
  osc(o, { type: 'square', f: 880, f1: 870, dur: 0.35, gain: 0.05, delay: 0.02 });
  ring(o, MAT.bell, 0.16, { pitch: 660 / 290, decay: 0.25 });
  thump(o, 90, 50, 0.3, 0.4);
  ring(o, p.metal, 0.05, { decay: 0.8, hard: 0.5, delay: 0.03 });
}

/** A fighter going down: the body landing, the armour clattering, the weapon dropped. */
export function death(o: Out, d: Profile): void {
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
  // the weapon hits the floor and bounces
  if (d.edge !== 'fist') {
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
  noise(o, { color: 'pink', type: 'bandpass', f: 1400, f1: 250, q: 1.2, dur: 1.2, gain: 0.4, shape: (x) => Math.min(1, x * 6) * Math.pow(1 - x, 1.2) });
  osc(o, { f: 900, f1: 180, dur: 1.1, gain: 0.025, shape: (x) => Math.min(1, x * 8) * (1 - x) });
}

/** A buff: the power coming up through them. */
export function buff(o: Out): void {
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
      groundSlam(o, k, p.edge === 'blunt');
      return true;
    case 'stomp':
      stompLayer(o, p, Math.min(1.2, k * 0.8));
      return true;
    case 'quake':
      noise(o, { color: 'brown', type: 'lowpass', f: 200, f1: 90, dur: 0.9, gain: 0.7 * Math.min(1, k) });
      crunch(o, 0.5, { gain: 0.4, type: 'lowpass', f: 600 });
      debris(o, 5, 0.6, 500, 1800, { gain: 0.3 });
      return true;
    case 'bolt':
      // lightning: the crack, the arc spitting, the thunder rolling away
      noise(o, { type: 'highpass', f: 1500, f1: 600, dur: 0.08, gain: 0.9, a: 0.001 });
      crackle(o, 0.45 * k, 45, { gain: 0.55, type: 'highpass', f: 1500 });
      osc(o, { type: 'sawtooth', f: 1800, f1: 300, dur: 0.15, gain: 0.08 });
      noise(o, { color: 'brown', type: 'lowpass', f: 1200, f1: 60, dur: 1.4 * k, gain: 0.6, delay: 0.03 });
      osc(o, { f: 50, f1: 30, dur: 1.2, gain: 0.4, delay: 0.03 });
      return true;
    case 'chain': {
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
    case 'holy':
      ring(o, MAT.bell, 0.12, { pitch: 2, decay: 0.6 });
      noise(o, { type: 'highpass', f: 6000, dur: 1.2, gain: 0.08, shape: SHAPES.swing(0.2, 1.5) });
      osc(o, { f: 880, dur: 0.8, gain: 0.03, shape: SHAPES.swing(0.3, 1.5) });
      osc(o, { f: 1320, dur: 0.8, gain: 0.02, shape: SHAPES.swing(0.3, 1.5) });
      return true;
    case 'chi':
      noise(o, { color: 'pink', type: 'lowpass', f: 700, f1: 150, dur: 0.35, gain: 0.55 * Math.min(1.2, k) });
      osc(o, { f: 120, f1: 55, dur: 0.3, gain: 0.45 });
      whoosh(o, 500, 0.22, 1, 0.25, 2.2, 0.3);
      return true;
    case 'flashline':
      noise(o, { type: 'highpass', f: 5000, f1: 9000, dur: 0.25, gain: 0.1, shape: SHAPES.swing(0.4, 2) });
      ring(o, p.metal, 0.05, { decay: 1, hard: 0.5 });
      return true;
    case 'roar':
      osc(filtered(o, 'lowpass', 300), { type: 'sawtooth', f: 70, f1: 58, dur: 0.9, gain: 0.07, shape: SHAPES.swing(0.25, 1.5) });
      noise(o, { color: 'brown', type: 'lowpass', f: 300, dur: 0.9, gain: 0.22, shape: SHAPES.swing(0.25, 1.5) });
      return true;
    case 'smoke':
    case 'fog':
      noise(o, { color: 'pink', type: 'lowpass', f: 1200, f1: 300, dur: 0.3, gain: 0.25 });
      return true;
    case 'whirl':
    case 'spiral':
      whoosh(o, 800, 0.45, 1.4, 0.2, 2, 0.5);
      return true;
    case 'soulfire':
      noise(o, { type: 'bandpass', f: 2000, f1: 600, q: 3, dur: 0.6, gain: 0.2 });
      osc(o, { f: 220, f1: 110, dur: 0.6, gain: 0.04 });
      return true;
  }
  return false;
}

/** The shared recipes behind each voice hook, for a voice that layers on top of them. */
export const BASE = { swing: swingBase, hit: hitBase, block: blockBase, deflect: deflectBase };
