/**
 * Assassin, twin daggers. An acrobat with knives: crouched low and springy with both blades in a
 * reverse grip, and the whole body in every cut. A scissor cut with the arms flung apart, crossed
 * wrists thrown open, a whirl with the arms spread, an overhead fang off one leg, a lunge at full
 * stretch, a leaping turn that stabs down twice, a flat swallow dive that corkscrews into them, a
 * skimming dart out of the dodge, a rolling drill of a dive, a fan cut springing away, a viper's
 * stab from flat on the ground, a cartwheel in the air, a dive that nails both blades into the
 * floor, and a shadow step that reappears in smoke.
 */
import { B, K, P, Style, X, arc, fx, hitAt, line, mv, seq, track } from '../author';
import type { Motion, V3 } from '../author';

// low and springy, the left foot leading
const body = B({ front: 'L', step: 0.3, back: 0.34, width: 0.19, crouch: -0.3, lean: 0.3, twist: -0.16 });
const R_SH: V3 = [-0.3, 0.48, 0.0];
const L_SH: V3 = [0.3, 0.48, 0.0];
const DOWN: V3 = [0, -1, 0];
const UP: V3 = [0, 1, 0];
const FWD: V3 = [0, 0, 1];
const BACK: V3 = [0, 0, -1];

/** A blade keyed along s: straight moves between keyed grips [s, pos, dir, edge], held outside them. */
type Grip = [number, V3, V3, V3];
const keyed = (ks: Grip[], blend = 0.03, opts: { body?: boolean } = {}): Motion => {
  const l = (a: Grip, b: Grip) => line(a[1], b[1], a[2], b[2], b[3], NaN, NaN, opts);
  const parts: [number, number, Motion][] = [[ks[0][0] - 10, ks[0][0], l(ks[0], ks[0])]];
  for (let i = 1; i < ks.length; i++) parts.push([ks[i - 1][0], ks[i][0], l(ks[i - 1], ks[i])]);
  const last = ks[ks.length - 1];
  parts.push([last[0], last[0] + 10, l(last, last)]);
  return seq(parts, blend);
};

/** A cut along an arc of blade directions from a shoulder, laid over s from..to. */
const cut = (from: number, to: number, sh: V3, dirs: V3[]): Motion => seq([[from, to, arc(sh, 0.46, dirs)]], 0);

// The guard, reverse grip: the right fist high by the cheek with the blade hanging down before the
// face, the left low and forward with its blade lying back along the forearm
const G_R: Grip = [0, [-0.24, 0.6, 0.36], [-0.2, -0.85, 0.45], FWD];
const G_L: Grip = [0, [0.18, 0.18, 0.5], [0.45, -0.5, -0.75], DOWN];
const at = (s: number, g: Grip): Grip => [s, g[1], g[2], g[3]];

// Scissor Cut: the right blade swept round from behind the hip across the front while the left
// arm is flung back past the shoulder
const scissor = cut(-0.35, 1.07, R_SH, [[-0.8, 0.5, -0.4], [-0.9, 0.42, 0.3], [-0.5, 0.36, 0.8], [0.05, 0.25, 1], [0.55, 0.05, 0.8]]);
const scissorHit = hitAt(scissor, 2);

// Cross Open: wrists crossed under the chin, both blades pointing out past the other arm, then
// thrown open
const openR = cut(-0.25, 1.07, R_SH, [[0.7, 0.55, 0.45], [0.2, 0.4, 0.9], [-0.35, 0.18, 0.92], [-0.85, -0.05, 0.5], [-1, -0.15, 0.0]]);
const openL = cut(-0.25, 1.07, L_SH, [[-0.7, 0.5, 0.48], [-0.2, 0.37, 0.92], [0.35, 0.16, 0.92], [0.85, -0.07, 0.5], [1, -0.17, 0.0]]);
const openHit = hitAt(openR, 2);

// Falling Fang: the right blade raised high and back, then brought over and down at them
const fang = cut(-0.75, 1.07, R_SH, [[-0.2, 0.5, -0.85], [-0.15, 1, -0.2], [-0.05, 0.95, 0.4], [0.0, 0.45, 0.9], [0.05, -0.2, 1]]);
const fangHit = hitAt(fang, 3);

// Fan Retreat: a backhand fan from over the left shoulder out to the right, the arms ending spread
const fan = cut(-0.3, 1.07, R_SH, [[0.85, 0.45, 0.35], [0.45, 0.3, 0.85], [0.05, 0.2, 1], [-0.6, 0.05, 0.8], [-0.95, -0.1, 0.3]]);
const fanHit = hitAt(fan, 2);

// Nail Down: both blades raised point-down over the head, then driven down into the ground in front
const nail = (x: number): Motion =>
  keyed(
    [
      [-0.6, [x * 0.16, 0.95, 0.1], [x * -0.05, -0.5, 0.85], FWD],
      [-0.05, [x * 0.14, 1.02, 0.02], [x * -0.05, -0.75, 0.65], FWD],
      [0.45, [x * 0.12, -0.12, 0.52], [x * -0.04, -1, 0.15], FWD],
      [1.07, [x * 0.12, -0.14, 0.54], [x * -0.04, -1, 0.15], FWD],
    ],
    0.05,
    { body: true },
  );

// Entrance blades: sheathed-looking in reverse grip along the forearms, drawn from the right thigh
// and the small of the back, then crossed point-down in front of the hood
const SHEATH_R: V3 = [-0.1, -0.3, -1];
const SHEATH_L: V3 = [0.1, -0.3, -1];

export const daggers: Style = {
  axis: 'y',
  offAxis: 'y',
  trail: { light: '#efe0ff', heavy: '#b55088', special: '#ff2a6a' },
  sparks: ['#ffffff', '#e8c8ff', '#b55088'],
  guard: P(body, X(G_R[1], G_R[2], G_R[3], 'y'), X(G_L[1], G_L[2], G_L[3], 'y')),
  block: P(B({ ...body, crouch: -0.34, twist: 0 }), X([-0.08, 0.6, 0.32], [0.8, 0.55, 0.1], [0, 0, 1], 'y'), X([0.08, 0.6, 0.34], [-0.8, 0.55, 0.1], [0, 0, 1], 'y')),
  moves: {
    // Scissor Cut: wound up to the right, then the hips snap round to the left; the right blade
    // sweeps across them as the left arm is flung back, the body twisted hard between the two
    l0: mv({
      keys: [
        K(-0.35, B({ ...body, twist: -0.7, hipTwist: -0.25, crouch: -0.32, lean: 0.26, step: 0.26 })),
        K(scissorHit, B({ ...body, twist: 0.55, hipTwist: 0.2, crouch: -0.4, lean: 0.5, side: -0.1, step: 0.5, back: 0.44 })),
        K(1.07, B({ ...body, twist: 0.7, hipTwist: 0.22, crouch: -0.42, lean: 0.52, side: -0.12, step: 0.5, back: 0.46 })),
      ],
      main: scissor,
      off: keyed([
        [-0.35, [0.26, 0.3, 0.4], [-0.1, 0.2, 1], DOWN],
        [scissorHit, [0.5, 0.48, -0.26], [0.55, 0.3, -0.78], DOWN],
        [1.07, [0.52, 0.52, -0.3], [0.55, 0.35, -0.76], DOWN],
      ]),
      impacts: [scissorHit],
      start: -0.35,
      chamber: -0.3,
      rest: 1.07,
      fx: [fx(scissorHit, 'sparkle', 'tip', 0.6), fx(scissorHit - 0.05, 'dust', 'feet', 0.5)],
      trail: { life: 0.14 },
    }),
    // Cross Open: hunched behind wrists crossed under the chin, then up off the toes, both blades
    // thrown open outward through them
    l1: mv({
      keys: [
        K(-0.25, B({ ...body, twist: 0, crouch: -0.44, lean: 0.4, step: 0.26, back: 0.32, headPitch: 0.2 }), { hop: 0 }),
        K(openHit, B({ ...body, twist: 0, crouch: -0.12, lean: 0.12, step: 0.4, back: 0.36, width: 0.22, headPitch: -0.1 }), { hop: 0.12 }),
        K(1.07, B({ ...body, twist: 0, crouch: -0.3, lean: 0.2, step: 0.4, back: 0.38, width: 0.24 }), { hop: 0 }),
      ],
      main: openR,
      off: openL,
      impacts: [openHit],
      start: -0.25,
      chamber: -0.2,
      rest: 1.07,
      fx: [fx(openHit, 'sparkle', 'tip', 0.6), fx(openHit, 'sparkle', 'offTip', 0.6), fx(openHit + 0.3, 'dust', 'feet', 0.5)],
      trail: { life: 0.16, glow: 0.3 },
    }),
    // Whirl: arms flung out wide and a full turn to the left; the right blade passes them a quarter
    // of the way round, the left at three quarters, and both scissor in low as the turn comes home
    l2: mv({
      keys: [
        K(-0.5, B({ ...body, twist: -0.4, crouch: -0.3, lean: 0.25 }), { spin: 0 }),
        K(0.3, B({ ...body, twist: 0, crouch: -0.2, lean: 0.12, step: 0.2, back: 0.2, width: 0.14 }), { spin: 0.25 }),
        K(0.6, B({ ...body, twist: 0, crouch: -0.24, lean: 0.16, step: 0.2, back: 0.2, width: 0.14 }), { spin: 0.75 }),
        K(0.9, B({ ...body, twist: 0, crouch: -0.44, lean: 0.4, step: 0.4, back: 0.42, width: 0.22 }), { spin: 1.0 }),
        K(1.07, B({ ...body, twist: 0, crouch: -0.48, lean: 0.44, step: 0.4, back: 0.42, width: 0.24 }), { spin: 1.0 }),
      ],
      main: keyed([
        [-0.5, [-0.6, 0.36, 0.2], [-1, -0.05, 0.3], FWD],
        [-0.1, [-0.74, 0.44, 0.1], [-1, 0.1, 0.2], FWD],
        [0.6, [-0.74, 0.44, 0.08], [-1, 0.1, 0.15], FWD],
        [0.9, [-0.02, 0.24, 0.48], [0.6, 0.0, 0.8], [1, 0, 0]],
        [1.07, [0.02, 0.22, 0.48], [0.65, -0.05, 0.75], [1, 0, 0]],
      ]),
      off: keyed([
        [-0.5, [0.55, 0.3, 0.2], [1, -0.1, 0.2], BACK],
        [-0.1, [0.74, 0.44, 0.1], [1, 0.1, 0.2], BACK],
        [0.6, [0.74, 0.44, 0.08], [1, 0.1, 0.15], BACK],
        [0.9, [0.06, 0.28, 0.46], [-0.6, 0.0, 0.8], [-1, 0, 0]],
        [1.07, [0.06, 0.26, 0.46], [-0.65, -0.05, 0.75], [-1, 0, 0]],
      ]),
      impacts: [0.3, 0.6, 0.9],
      start: -0.5,
      chamber: -0.2,
      flow: 1.4,
      blendIn: 0.35,
      lead: 0,
      end: 1.07,
      rest: 1.07,
      ghosts: [0.0, 0.95],
      fx: [fx(-0.1, 'whirl', 'root', 0.7, '#efe0ff'), fx(0.3, 'sparkle', 'tip', 0.45), fx(0.6, 'sparkle', 'offTip', 0.45), fx(0.9, 'sparkle', 'tip', 0.55), fx(0.9, 'dust', 'feet', 0.6)],
      trail: { life: 0.2, glow: 0.4 },
    }),
    // Falling Fang: up onto the front toes with the right blade raised high and the left leg kicked
    // out behind, then down off it, the blade brought over and driven into them
    h: mv({
      keys: [
        K(-0.75, B({ ...body, crouch: -0.42, lean: 0.4 }), { hop: 0 }),
        K(-0.15, B({ ...body, crouch: 0.0, lean: -0.12, twist: -0.3, step: 0.3, back: 0.24, headPitch: 0.15 }), { hop: 0.2 }),
        K(fangHit, B({ ...body, crouch: -0.44, lean: 0.62, twist: 0.12, step: 0.62, back: 0.5, headPitch: -0.2 }), { hop: 0 }),
        K(1.07, B({ ...body, crouch: -0.48, lean: 0.72, twist: 0.12, step: 0.62, back: 0.52, headPitch: -0.15 })),
      ],
      main: fang,
      off: keyed([
        at(-0.75, G_L),
        [-0.15, [0.42, 0.2, -0.22], [0.3, -0.4, -1], DOWN],
        [fangHit, [0.24, 0.3, 0.3], [-0.1, 0.2, 1], DOWN],
        [1.07, [0.26, 0.28, 0.26], [-0.1, 0.2, 1], DOWN],
      ]),
      kick: { foot: 'L', from: -0.6, to: 0.1, path: track([[0, [0.14, 0.2, 0.0]], [0.5, [0.16, 0.6, -0.6]], [1, [0.15, 0.4, -0.3]]]) },
      impacts: [fangHit],
      start: -0.75,
      chamber: -0.15,
      ghosts: [0.1, 0.6],
      fx: [fx(-0.7, 'dust', 'feet', 0.5), fx(fangHit, 'flashline', 'tip', 0.7), fx(fangHit, 'sparkle', 'tip', 0.9), fx(fangHit + 0.05, 'stomp', 'feet', 0.5)],
      trail: { life: 0.2, glow: 0.6 },
    }),
    // Long Thorn: out of the fang, the right blade drawn back to the hip, then a lunge so deep the
    // body lies almost flat along the arm, the left arm stretched out behind
    h1: mv({
      keys: [
        K(-0.4, B({ ...body, crouch: -0.42, lean: 0.55, twist: -0.4, step: 0.4, back: 0.46, headPitch: -0.1 })),
        K(0.45, B({ ...body, crouch: -0.6, lean: 1.05, twist: 0.3, step: 0.9, back: 0.78, width: 0.17, headPitch: -0.55 })),
        K(1.07, B({ ...body, crouch: -0.6, lean: 1.0, twist: 0.3, step: 0.9, back: 0.78, width: 0.17, headPitch: -0.5 })),
      ],
      main: keyed(
        [
          [-0.4, [-0.34, 0.22, -0.18], [0.05, 0.1, 1], DOWN],
          [0.45, [-0.14, 0.32, 1.02], [0.0, 0.04, 1], DOWN],
          [1.07, [-0.14, 0.3, 1.04], [0.0, 0.02, 1], DOWN],
        ],
        0.03,
        { body: true },
      ),
      off: keyed(
        [
          [-0.4, [0.26, 0.3, 0.3], [-0.1, 0.1, 1], DOWN],
          [0.45, [0.32, 0.42, -0.5], [0.2, -0.15, -1], DOWN],
          [1.07, [0.32, 0.42, -0.52], [0.2, -0.15, -1], DOWN],
        ],
        0.03,
        { body: true },
      ),
      impacts: [0.45],
      start: -0.4,
      chamber: -0.35,
      ghosts: [0.0, 0.55],
      fx: [fx(0.0, 'dust', 'feet', 0.9), fx(0.3, 'spiral', 'tip', 0.6), fx(0.45, 'flashline', 'tip', 1), fx(0.45, 'sparkle', 'tip', 0.9)],
      trail: { life: 0.2, glow: 0.6 },
    }),
    // Sky Lotus: sprung up into a full turn in the air with the blades crossed at the chest, both
    // raised point-down at the top, then stabbed down into them one after the other on the way down
    h2: mv({
      keys: [
        K(-1.2, B({ ...body, crouch: -0.5, lean: 0.42, twist: 0, step: 0.3, back: 0.36, width: 0.2 }), { spin: 0, hop: 0 }),
        K(-0.85, B({ ...body, crouch: -0.1, lean: 0.1, twist: 0, step: 0.14, back: 0.14, width: 0.1 }), { spin: 0.1, hop: 0.3 }),
        K(-0.15, B({ ...body, crouch: -0.14, lean: 0.05, twist: 0, step: 0.12, back: 0.12, width: 0.1 }), { spin: 0.85, hop: 0.75 }),
        K(0.15, B({ ...body, crouch: -0.12, lean: -0.08, twist: 0, step: 0.12, back: 0.14, width: 0.1, headPitch: 0.2 }), { spin: 1, hop: 0.7 }),
        K(0.45, B({ ...body, crouch: -0.2, lean: 0.35, twist: 0.2, step: 0.2, back: 0.2, width: 0.12 }), { hop: 0.45 }),
        K(0.75, B({ ...body, crouch: -0.46, lean: 0.6, twist: -0.2, step: 0.36, back: 0.4, width: 0.22 }), { hop: 0 }),
        K(1.1, B({ ...body, crouch: -0.48, lean: 0.55, twist: -0.1, step: 0.36, back: 0.4, width: 0.22 })),
      ],
      main: keyed([
        at(-1.2, G_R),
        [-0.75, [-0.02, 0.4, 0.3], [0.5, 0.2, 0.8], UP],
        [-0.2, [-0.02, 0.42, 0.3], [0.5, 0.2, 0.8], UP],
        [0.15, [-0.22, 0.98, 0.16], [0.0, -0.5, 0.85], FWD],
        [0.45, [-0.12, 0.42, 0.58], [0.0, -0.15, 1], FWD],
        [0.75, [-0.32, 0.44, 0.16], [-0.3, -0.2, 0.9], FWD],
        [1.1, [-0.3, 0.42, 0.2], [-0.25, -0.3, 0.9], FWD],
      ]),
      off: keyed([
        at(-1.2, G_L),
        [-0.75, [0.04, 0.44, 0.32], [-0.5, 0.2, 0.8], UP],
        [-0.2, [0.04, 0.46, 0.32], [-0.5, 0.2, 0.8], UP],
        [0.15, [0.22, 1.0, 0.16], [0.0, -0.5, 0.85], FWD],
        [0.5, [0.24, 0.92, 0.2], [0.0, -0.45, 0.85], FWD],
        [0.75, [0.1, 0.5, 0.56], [0.0, 0.3, 1], FWD],
        [1.1, [0.12, 0.46, 0.52], [0.0, 0.2, 1], FWD],
      ]),
      impacts: [0.45, 0.75],
      start: -1.2,
      chamber: -0.2,
      flow: 1.3,
      blendIn: 0.3,
      lead: 0,
      end: 1.1,
      rest: 1.1,
      ghosts: [-0.8, 0.8],
      fx: [
        fx(-1.1, 'dust', 'feet', 0.8),
        fx(-0.6, 'whirl', 'root', 0.9, '#b55088'),
        fx(0.45, 'sparkle', 'tip', 0.8),
        fx(0.75, 'sparkle', 'offTip', 0.9),
        fx(0.75, 'stomp', 'feet', 0.8),
      ],
      trail: { life: 0.24, glow: 0.6 },
    }),
    // Swallow Dive: down into a crouch, then launched flat through the air like a thrown knife, both
    // blades out ahead, turning one full corkscrew about the body's length into them before the feet
    // swing back under for the landing
    sp: mv({
      keys: [
        K(-1.0, B({ ...body, crouch: -0.46, lean: 0.5, twist: 0 }), { flip: 0, hop: 0, spin: 0 }),
        K(-0.6, B({ ...body, crouch: -0.58, lean: 0.75, twist: 0, step: 0.4, back: 0.5, headPitch: -0.3 }), { flip: 0.02, hop: 0 }),
        K(-0.3, B({ ...body, crouch: -0.2, lean: 0.4, twist: 0, step: 0.2, back: 0.3, headPitch: -0.3 }), { flip: 0.14, hop: 0.3, spin: 0 }),
        K(0.0, B({ ...body, crouch: -0.15, lean: 0.05, twist: 0, step: 0.12, back: 0.2, headPitch: -0.4 }), { flip: 0.24, hop: 0.42 }),
        K(0.45, B({ ...body, crouch: -0.15, lean: 0.05, twist: 0, step: 0.12, back: 0.2, headPitch: -0.4 }), { flip: 0.25, hop: 0.36, spin: 1 }),
        K(1.07, B({ ...body, crouch: -0.2, lean: 0.1, twist: 0, step: 0.2, back: 0.24, headPitch: -0.3 }), { flip: 0.2, hop: 0.25 }),
        K(1.5, B({ ...body, crouch: -0.5, lean: 0.5, twist: 0, step: 0.4, back: 0.44, width: 0.22 }), { flip: 0, hop: 0 }),
      ],
      main: keyed([
        [-1.0, [-0.3, 0.2, -0.1], [-0.2, -0.3, -1], DOWN],
        [-0.6, [-0.4, 0.22, -0.2], [-0.2, -0.2, -1], DOWN],
        [-0.25, [-0.14, 0.92, 0.28], [0.0, 1, -0.05], FWD],
        [1.07, [-0.14, 0.94, 0.28], [0.0, 1, -0.05], FWD],
        [1.5, [-0.3, 0.4, 0.3], [-0.1, -0.5, 0.8], FWD],
      ]),
      off: keyed([
        [-1.0, [0.3, 0.2, -0.1], [0.2, -0.3, -1], DOWN],
        [-0.6, [0.4, 0.22, -0.2], [0.2, -0.2, -1], DOWN],
        [-0.25, [0.14, 0.92, 0.3], [0.0, 1, -0.05], FWD],
        [1.07, [0.14, 0.94, 0.3], [0.0, 1, -0.05], FWD],
        [1.5, [0.2, 0.2, 0.4], [0.1, -0.3, -1], DOWN],
      ]),
      impacts: [0.45],
      start: -1.0,
      chamber: -0.3,
      flow: 1,
      blendIn: 0.25,
      lead: 0,
      end: 1.07,
      rest: 1.5,
      settle: 0.7,
      ghosts: [-0.3, 1.0],
      fx: [
        fx(-0.9, 'smoke', 'feet', 0.6),
        fx(-0.35, 'dust', 'feet', 1.0),
        fx(-0.2, 'spiral', 'tip', 0.8, '#ff2a6a'),
        fx(0.45, 'flashline', 'tip', 1),
        fx(0.45, 'sparkle', 'tip', 0.9, '#ff2a6a'),
        fx(0.45, 'sparkle', 'offTip', 0.9, '#ff2a6a'),
        fx(1.45, 'dust', 'feet', 0.8),
      ],
      trail: { life: 0.22, glow: 0.7 },
    }),
    // Dart: out of the dodge in a low flat dive, the rear leg stretched out behind and the right
    // arm leading; the right blade cuts across them, then the left on the way down to a slide
    dl: mv({
      keys: [
        K(-0.6, B({ ...body, crouch: -0.46, lean: 0.55, twist: 0, step: 0.4, back: 0.46 }), { flip: 0, hop: 0 }),
        K(0.0, B({ ...body, crouch: -0.3, lean: 0.5, twist: 0.35, step: 0.3, back: 0.3, headPitch: -0.45 }), { flip: 0.14, hop: 0.32 }),
        K(0.45, B({ ...body, crouch: -0.3, lean: 0.5, twist: 0.4, step: 0.3, back: 0.3, headPitch: -0.45 }), { flip: 0.15, hop: 0.28 }),
        K(0.75, B({ ...body, crouch: -0.34, lean: 0.5, twist: -0.2, step: 0.36, back: 0.36, headPitch: -0.35 }), { flip: 0.08, hop: 0.1 }),
        K(1.07, B({ ...body, crouch: -0.5, lean: 0.5, twist: -0.1, step: 0.56, back: 0.56, width: 0.22 }), { flip: 0, hop: 0 }),
      ],
      main: seq([
        [-0.6, -0.15, line([-0.34, 0.2, -0.1], [-0.36, 0.7, 0.2], [-0.2, -0.3, -1], [-0.6, 0.7, 0.2], FWD)],
        [-0.15, 1.07, arc(R_SH, 0.46, [[-0.6, 0.75, 0.2], [-0.2, 0.95, 0.2], [0.35, 0.85, 0.3], [0.75, 0.4, 0.4]])],
      ]),
      off: keyed([
        [-0.6, [0.3, 0.2, 0.0], [0.2, -0.3, -1], DOWN],
        [0.0, [0.18, 0.5, 0.36], [-0.3, 0.6, 0.6], [-1, 0, 0]],
        [0.5, [0.2, 0.52, 0.36], [-0.3, 0.6, 0.6], [-1, 0, 0]],
        [0.75, [0.5, 0.72, 0.2], [0.85, 0.5, 0.2], [0, 1, 0]],
        [1.07, [0.52, 0.5, 0.06], [0.9, 0.2, 0.0], [0, 1, 0]],
      ]),
      kick: { foot: 'R', from: -0.3, to: 0.7, path: track([[0, [-0.12, 0.25, -0.45]], [0.4, [-0.14, 0.55, -0.85]], [1, [-0.14, 0.45, -0.8]]]) },
      impacts: [0.45, 0.75],
      start: -0.6,
      chamber: -0.15,
      flow: 1,
      blendIn: 0.3,
      lead: 0,
      end: 1.07,
      rest: 1.07,
      ghosts: [-0.3, 0.8],
      fx: [fx(-0.5, 'dust', 'feet', 0.8), fx(0.45, 'sparkle', 'tip', 0.6), fx(0.75, 'sparkle', 'offTip', 0.7), fx(1.0, 'dust', 'feet', 0.9)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Corkscrew: thrown forward flat off the dodge, low, with both blades spread ahead in a wide V,
    // and spun one full turn about the body's length like a drill bit, cutting all the way round
    dh: mv({
      keys: [
        K(-0.6, B({ ...body, crouch: -0.44, lean: 0.6, twist: 0, step: 0.4, back: 0.46 }), { flip: 0, hop: 0, spin: 0 }),
        K(-0.2, B({ ...body, crouch: -0.2, lean: 0.25, twist: 0, step: 0.2, back: 0.3, headPitch: -0.4 }), { flip: 0.17, hop: 0.26, spin: 0 }),
        K(0.45, B({ ...body, crouch: -0.2, lean: 0.2, twist: 0, step: 0.2, back: 0.3, headPitch: -0.4 }), { flip: 0.2, hop: 0.26, spin: 1 }),
        K(0.75, B({ ...body, crouch: -0.24, lean: 0.25, twist: 0, step: 0.3, back: 0.36, headPitch: -0.3 }), { flip: 0.14, hop: 0.14 }),
        K(1.07, B({ ...body, crouch: -0.46, lean: 0.5, twist: 0, step: 0.5, back: 0.5, width: 0.22 }), { flip: 0, hop: 0 }),
      ],
      main: keyed([
        [-0.6, [-0.34, 0.22, -0.14], [-0.2, -0.3, -1], DOWN],
        [-0.2, [-0.4, 0.92, 0.1], [-0.6, 0.8, 0.0], FWD],
        [0.6, [-0.4, 0.92, 0.1], [-0.6, 0.8, 0.0], FWD],
        [1.07, [-0.42, 0.5, 0.36], [-0.6, 0.0, 0.8], FWD],
      ]),
      off: keyed([
        [-0.6, [0.34, 0.22, -0.14], [0.2, -0.3, -1], DOWN],
        [-0.2, [0.4, 0.92, 0.1], [0.6, 0.8, 0.0], FWD],
        [0.6, [0.4, 0.92, 0.1], [0.6, 0.8, 0.0], FWD],
        [1.07, [0.42, 0.5, 0.36], [0.6, 0.0, 0.8], FWD],
      ]),
      impacts: [0.45],
      start: -0.6,
      chamber: -0.2,
      flow: 1.1,
      blendIn: 0.3,
      lead: 0,
      end: 1.07,
      rest: 1.07,
      ghosts: [-0.3, 0.8],
      fx: [fx(-0.5, 'smoke', 'feet', 0.8), fx(-0.25, 'dust', 'feet', 0.9), fx(0.0, 'spiral', 'tip', 0.8), fx(0.2, 'spiral', 'offTip', 0.8), fx(0.45, 'flashline', 'tip', 1), fx(0.45, 'sparkle', 'tip', 0.9), fx(1.0, 'dust', 'feet', 0.8)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Fan Retreat: a spring backward off the front foot, the right blade fanned backhand across the
    // gap as the left arm is thrown out wide the other way
    bl: mv({
      keys: [
        K(-0.3, B({ ...body, crouch: -0.32, lean: 0.35, twist: 0.4, step: 0.3, back: 0.34 }), { hop: 0, flip: 0 }),
        K(fanHit, B({ ...body, crouch: -0.14, lean: -0.28, twist: -0.3, step: 0.22, back: 0.56, width: 0.22, headPitch: 0.15 }), { hop: 0.18, flip: -0.04 }),
        K(1.07, B({ ...body, crouch: -0.38, lean: 0.0, twist: -0.35, step: 0.2, back: 0.6, width: 0.22 }), { hop: 0, flip: 0 }),
      ],
      main: fan,
      off: keyed([
        [-0.3, [0.24, 0.32, 0.36], [-0.2, 0.2, 1], DOWN],
        [fanHit, [0.6, 0.5, -0.02], [1, 0.3, -0.25], FWD],
        [1.07, [0.6, 0.46, -0.06], [1, 0.2, -0.3], FWD],
      ]),
      impacts: [fanHit],
      start: -0.3,
      chamber: -0.25,
      rest: 1.07,
      fx: [fx(0.0, 'smoke', 'feet', 0.9), fx(fanHit, 'sparkle', 'tip', 0.5), fx(1.0, 'dust', 'feet', 0.6)],
      trail: { life: 0.12 },
    }),
    // Low Viper: back and down until nearly flat, the left hand on the floor and the back leg
    // stretched far behind, then the right blade shot out low along the ground
    bh: mv({
      keys: [
        K(-0.5, B({ ...body, crouch: -0.34, lean: 0.34 })),
        K(-0.05, B({ ...body, crouch: -0.62, lean: 0.8, twist: -0.35, step: 0.4, back: 0.8, width: 0.24, headPitch: -0.35 })),
        K(0.45, B({ ...body, crouch: -0.6, lean: 0.9, twist: 0.35, step: 0.62, back: 0.78, width: 0.24, headPitch: -0.5 })),
        K(1.07, B({ ...body, crouch: -0.6, lean: 0.88, twist: 0.35, step: 0.62, back: 0.78, width: 0.24, headPitch: -0.45 })),
      ],
      main: keyed(
        [
          [-0.5, [-0.26, 0.3, 0.2], [-0.1, -0.6, 0.6], FWD],
          [-0.05, [-0.34, 0.06, -0.12], [0.05, 0.0, 1], DOWN],
          [0.45, [-0.12, 0.02, 0.92], [0.0, -0.1, 1], DOWN],
          [1.07, [-0.12, 0.0, 0.94], [0.0, -0.1, 1], DOWN],
        ],
        0.03,
        { body: true },
      ),
      off: keyed(
        [
          [-0.5, [0.18, 0.12, 0.4], [0.12, -0.35, -1], DOWN],
          [-0.05, [0.3, -0.2, 0.42], [0.15, 0.3, -1], DOWN],
          [1.07, [0.3, -0.2, 0.44], [0.15, 0.3, -1], DOWN],
        ],
        0.03,
        { body: true },
      ),
      impacts: [0.45],
      start: -0.5,
      chamber: -0.05,
      ghosts: [-0.4, 0.0],
      fx: [fx(-0.4, 'smoke', 'feet', 0.9), fx(-0.05, 'dust', 'feet', 0.9), fx(0.45, 'flashline', 'tip', 0.8), fx(0.45, 'sparkle', 'tip', 0.8)],
      trail: { life: 0.18, glow: 0.5 },
    }),
    // Cartwheel: a cartwheel in the air with the arms spread in a wide V ahead, the blades wheeling
    // through the space in front of them
    jl: mv({
      keys: [
        K(-0.6, B({ ...body, crouch: -0.2, lean: 0.2, twist: 0, width: 0.12 }), { roll: 0, hop: 0 }),
        K(-0.2, B({ ...body, crouch: -0.12, lean: 0.15, twist: 0, width: 0.14 }), { roll: 0.2, hop: 0.4 }),
        K(0.45, B({ ...body, crouch: -0.12, lean: 0.2, twist: 0, width: 0.14 }), { roll: 0.7, hop: 0.52 }),
        K(1.07, B({ ...body, crouch: -0.24, lean: 0.25, twist: 0, width: 0.16 }), { roll: 1, hop: 0.15 }),
      ],
      main: keyed([
        [-0.6, [-0.52, 0.62, 0.3], [-0.75, 0.5, 0.5], FWD],
        [1.07, [-0.52, 0.62, 0.3], [-0.75, 0.5, 0.5], FWD],
      ]),
      off: keyed([
        [-0.6, [0.52, 0.62, 0.3], [0.75, 0.5, 0.5], FWD],
        [1.07, [0.52, 0.62, 0.3], [0.75, 0.5, 0.5], FWD],
      ]),
      impacts: [0.45],
      start: -0.6,
      chamber: -0.3,
      flow: 1.2,
      blendIn: 0.3,
      lead: 0,
      end: 1.07,
      rest: 1.07,
      fx: [fx(-0.3, 'whirl', 'root', 0.5, '#efe0ff'), fx(0.45, 'sparkle', 'tip', 0.6), fx(0.45, 'sparkle', 'offTip', 0.6)],
      trail: { life: 0.18, glow: 0.3 },
    }),
    // Nail Down: arched back in the air with both blades raised point-down, then folded over in a
    // dive straight down onto them, both blades nailed into the ground
    jh: mv({
      keys: [
        K(-0.6, B({ ...body, crouch: -0.06, lean: -0.2, twist: 0, headPitch: 0.2, width: 0.14 }), { hop: 0.3, flip: -0.04 }),
        K(-0.05, B({ ...body, crouch: -0.02, lean: -0.3, twist: 0, headPitch: 0.25, width: 0.14 }), { hop: 0.4, flip: -0.05 }),
        K(0.45, B({ ...body, crouch: -0.56, lean: 1.0, twist: 0, step: 0.36, back: 0.36, width: 0.25, headPitch: -0.2 }), { hop: 0, flip: 0.04 }),
        K(1.07, B({ ...body, crouch: -0.54, lean: 0.95, twist: 0, step: 0.36, back: 0.36, width: 0.25, headPitch: -0.15 }), { flip: 0 }),
      ],
      main: nail(-1),
      off: nail(1),
      impacts: [0.45],
      start: -0.6,
      chamber: -0.05,
      blendIn: 0.5,
      ghosts: [0.0, 0.45],
      fx: [fx(0.45, 'stomp', 'feet', 0.9), fx(0.45, 'shockwave', 'tip', 0.9), fx(0.5, 'smoke', 'feet', 0.8), fx(0.45, 'sparkle', 'offTip', 0.7)],
      trail: { life: 0.2, glow: 0.6 },
    }),
  },
  // Shadow Step: (unseen for most of it) back out of the smoke crouched low, blades out wide
  vanish: mv({
    keys: [
      K(0.0, B({ ...body, crouch: -0.36, lean: 0.4, width: 0.22 })),
      K(0.85, B({ ...body, crouch: -0.38, lean: 0.44, width: 0.24, step: 0.3, back: 0.38 })),
      K(1.0, B({ ...body, crouch: -0.3, lean: 0.36, width: 0.2 })),
    ],
    main: line([-0.5, 0.2, 0.2], [-0.42, 0.24, 0.26], [-0.6, -0.3, 0.6], [-0.3, 0.1, 1], DOWN),
    off: line([0.5, 0.22, 0.2], [0.42, 0.26, 0.26], [0.6, -0.3, 0.6], [0.3, 0.1, 1], DOWN),
    impacts: [0.5],
    start: 0,
    rest: 1,
    fx: [fx(0.8, 'smoke', 'feet', 1.2)],
  }),
  // Ring entrance, From Above: out of smoke he drops from high overhead through a front flip into a
  // low landing crouch, stays down with the head bowed and rises slowly as the hands go to the
  // sheaths, then both blades are drawn in reverse grip and crossed point-down before the hood
  entrance: mv({
    keys: [
      // the drop
      K(0.0, B({ ...body, crouch: -0.04, lean: 0.0, twist: 0, step: 0.12, back: 0.12, width: 0.1, headPitch: 0.3 }), { hop: 3.4, flip: 0 }),
      K(0.09, B({ ...body, crouch: -0.12, lean: 0.3, twist: 0, step: 0.06, back: 0.06, width: 0.1, headPitch: 0.4 }), { hop: 3.1, flip: 0.2 }),
      K(0.17, B({ ...body, crouch: -0.2, lean: 0.5, twist: 0, step: 0.04, back: 0.04, width: 0.1, headPitch: 0.4 }), { hop: 2.2, flip: 0.65 }),
      K(0.24, B({ ...body, crouch: -0.1, lean: 0.15, twist: 0, step: 0.16, back: 0.16, width: 0.16, headPitch: 0.2 }), { hop: 0.95, flip: 0.95 }),
      K(0.29, B({ ...body, crouch: -0.2, lean: 0.25, twist: 0, step: 0.24, back: 0.28, width: 0.22, headPitch: 0.3 }), { hop: 0, flip: 1 }),
      // the landing crouch, head down
      K(0.33, B({ ...body, crouch: -0.56, lean: 0.62, twist: 0.05, step: 0.32, back: 0.38, width: 0.26, headPitch: 0.55 }), { hop: 0 }),
      K(0.48, B({ ...body, crouch: -0.54, lean: 0.6, twist: 0.05, step: 0.32, back: 0.38, width: 0.26, headPitch: 0.6 })),
      // rising slowly, the hands going to the sheaths
      K(0.68, B({ ...body, crouch: -0.3, lean: 0.3, twist: -0.05, step: 0.28, back: 0.32, width: 0.2, headPitch: 0.3 })),
      // the draw, crossed before the hood
      K(0.76, B({ ...body, crouch: -0.24, lean: 0.12, twist: 0, step: 0.24, back: 0.3, width: 0.18, headPitch: -0.05 })),
      K(0.86, B({ ...body, crouch: -0.26, lean: 0.14, twist: 0, step: 0.24, back: 0.3, width: 0.18, headPitch: -0.05 })),
      K(0.97, body),
    ],
    main: keyed([
      [0.0, [-0.3, 0.3, 0.1], SHEATH_R, UP],
      [0.12, [-0.16, 0.34, 0.24], [-0.05, -0.4, -1], UP],
      [0.24, [-0.2, 0.32, 0.18], [-0.05, -0.4, -1], UP],
      [0.3, [-0.42, 0.34, -0.02], [-0.3, -0.3, -1], UP],
      // the right arm held back for balance on landing
      [0.34, [-0.4, 0.18, -0.16], [-0.2, -0.2, -1], UP],
      [0.5, [-0.38, 0.16, -0.12], [-0.2, -0.2, -1], UP],
      // down to the right thigh
      [0.68, [-0.26, -0.02, 0.06], [0, -1, -0.2], FWD],
      // drawn, raised and crossed point-down in front of the hood
      [0.76, [-0.17, 0.76, 0.34], [0.7, -0.55, 0.3], FWD],
      [0.86, [-0.17, 0.74, 0.34], [0.7, -0.55, 0.3], FWD],
      // and settled into the guard
      at(0.97, G_R),
    ]),
    off: keyed([
      [0.0, [0.3, 0.3, 0.1], SHEATH_L, UP],
      [0.12, [0.16, 0.34, 0.24], [0.05, -0.4, -1], UP],
      [0.24, [0.2, 0.32, 0.18], [0.05, -0.4, -1], UP],
      [0.3, [0.3, 0.1, 0.3], [0.1, -0.3, -1], UP],
      // the left hand down to the ground on landing
      [0.34, [0.22, -0.06, 0.42], [0.2, -0.3, -1], UP],
      [0.5, [0.22, -0.06, 0.42], [0.2, -0.3, -1], UP],
      // round to the small of the back
      [0.68, [0.24, 0.02, -0.14], [-0.2, -0.6, -0.8], UP],
      [0.76, [0.17, 0.78, 0.37], [-0.7, -0.55, 0.3], FWD],
      [0.86, [0.17, 0.76, 0.37], [-0.7, -0.55, 0.3], FWD],
      at(0.97, G_L),
    ]),
    lead: 0,
    ghosts: [0.04, 0.3],
    fx: [
      fx(0.0, 'smoke', 'root', 1.4),
      fx(0.31, 'dust', 'feet', 1.1),
      fx(0.31, 'smoke', 'feet', 1.3),
      fx(0.31, 'stomp', 'feet', 0.5),
      fx(0.74, 'smoke', 'feet', 0.6),
      fx(0.77, 'sparkle', 'tip', 0.9, '#ff2a6a'),
      fx(0.78, 'sparkle', 'offTip', 0.9, '#ff2a6a'),
    ],
  }),
};
